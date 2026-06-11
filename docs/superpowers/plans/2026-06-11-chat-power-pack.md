# Chat Power Pack (Tier 1 + 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax. ALL implementation subagents run on Opus (user requirement).

**Goal:** Make chat personal, proactive, and accountable: a "my actions" tool, auto-created morning-briefing sessions, persistent user memory, watchlist/zone-alert write tools, and a chat action record.

**Architecture:** Everything composes existing machinery. New `UserMemory` model (chat app, migration 0006) with write tools + automatic prompt injection through `_format_prompt`. New `chat/briefing.py` holds two deterministic prose renderers shared by tools and the nightly celery task, which seeds one personalized `ChatSession` + assistant `ChatMessage` per entitled user and deep-links the existing `DAILY_PLAN_READY` notification to it. Watchlist writes upsert `WatchlistItem`; zone alerts reuse the `WATCHLIST_ENTRY` notification type fed by the plan's `entry_statuses`. The action record reads `PortfolioActionDraft` + `TradePlan`. **No frontend changes** — the chat UI renders seeded sessions/messages generically and `/chat?session=<id>` deep-linking already exists.

**Tech Stack:** Django 5 + Claude Agent SDK MCP tools + celery (backend only), pytest.

**Spec:** `docs/superpowers/specs/2026-06-11-chat-power-pack-design.md`

---

## Verified conventions (do not re-derive)

- Tools: `@tool(name, description, {arg: type})` async fns in `backend/chat/tools.py`; ORM inside `@sync_to_async def _run()`; return `_result(prose, card={"type":..., "data":...})`; errors `_result(msg, is_error=True)`; current user via `from chat._user_context import get_user` (raises outside a chat turn); append to `ALL_TOOLS`; subagent allowlists in `chat/subagents.py` via `tool_id("name")`.
- Tests: pattern of `tests/test_chat_plan_tools.py` — `@pytest.mark.django_db(transaction=True)` (sync_to_async threads can't see wrapped transactions), sync test fns calling `asyncio.run(tool.handler(args))`, user set via `chat._user_context.set_user(user)`; `create_user` fixture in `tests/conftest.py`. Run with `cd /Users/jugalraj/Documents/Projects/Stockastic/backend && .venv/bin/python -m pytest ...`.
- Prompt assembly: `chat/agent.py` `_format_prompt(user, message)` renders `chat/prompts/orchestrator.yaml`'s `user` template with `{date}/{username}/{message}`; `run_chat_session` is async (`sync_to_async` for ORM). `str.format` substitutes values literally — braces inside substituted VALUES are safe.
- `ChatSession{id uuid, user, title(255) default "New chat", sdk_session_id, created_at, updated_at}`; `ChatMessage{session, role ChatMessage.ROLE_USER|ROLE_ASSISTANT, text, blocks JSON list, token ints}`. Assistant `blocks` are typed dicts written by `chat/streaming.py` — READ how it builds text blocks and what the frontend message renderer consumes before choosing the seeded-message block shape; fallback contract is a single text-type block matching that shape exactly.
- `generate_daily_plan_task` in `backend/stocks/tasks.py`: builds plan, returns `{"status": "SKIPPED", ...}` when `plan.was_regenerated` is False, else logs SUCCESS to DataUploadLog and loops entitled users (`TierPermission(module_key="daily_plan", is_enabled=True)` tiers + superusers) calling `create_notification(..., redirect_url="/plan", ...)`.
- Plan payload: `{as_of, picks[], watch[], exits[], catalysts[], market_context, entry_statuses{SYM: IN_ZONE|EXTENDED|STALE}}`; pick shape per `stocks/services/daily_plan.py`. `user_overlay(user)` → `{positions_near_action[], signal_flips[], watchlist_triggers[]}`; `sizing_map_for_user(user, picks)` → `{SYM: {shares, risk_pct, account_name, ...}}`.
- `WatchlistItem{user, ticker (unique together), target_price, stop_loss_price, alert_enabled, notes}`. `Notification.NotificationType.WATCHLIST_ENTRY` exists. `notification_service.create_notification(...)` dedupes unread same type+ticker. Per-user checks (`check_portfolio_alerts` etc.) live in `stocks/services/notification_service.py` and are invoked from `stocks/tasks.py::check_all_user_notifications` AND `stocks/views/notifications.py::trigger_check` — mirror both call sites.
- `PortfolioActionDraft{user, kind TRADE|EXITS|REBALANCE|TRADE_PLAN, status PENDING|CONFIRMED|CANCELLED|EXPIRED, payload, preview, result, created_at, confirmed_at}`; `TradePlan{user, ticker, status OPEN|CLOSED|CANCELLED, risk_budget_pct, created_at}` + `legs` (status PENDING|EXECUTED|SKIPPED, `transaction` OneToOne to PortfolioTransaction nullable). READ the actual model fields before writing queries.
- `chat/migrations/` is tracked (latest 0005). makemigrations may need `--skip-checks` locally (native deps in URL loading).
- Chat suite must stay green: `.venv/bin/python -m pytest tests/ -q -k chat` (147 passed baseline).

## File structure

**Create:** `backend/chat/briefing.py`, `backend/tests/test_chat_memory.py`, `backend/tests/test_chat_actions_tools.py`, `backend/tests/test_chat_briefing.py`, chat migration 0006.
**Modify:** `backend/chat/models.py`, `backend/chat/tools.py`, `backend/chat/subagents.py`, `backend/chat/agent.py`, `backend/chat/prompts/orchestrator.yaml`, `backend/stocks/tasks.py`, `backend/stocks/services/notification_service.py`, `backend/stocks/views/notifications.py`, `backend/tests/test_daily_plan.py` (briefing task tests), `backend/tests/test_chat_plan_tools.py` (renderer refactor must not break it).

---

### Task 1: `UserMemory` model + remember/forget tools + prompt injection

**Files:** modify `chat/models.py`, `chat/tools.py`, `chat/subagents.py`, `chat/agent.py`, `chat/prompts/orchestrator.yaml`; create migration 0006 + `tests/test_chat_memory.py`.

- [ ] **Step 1: failing tests** — create `tests/test_chat_memory.py`:

```python
import asyncio
import pytest

from chat import _user_context


def _call(tool_fn, args):
    return asyncio.run(tool_fn.handler(args))


@pytest.mark.django_db(transaction=True)
class TestUserMemoryTools:
    def _user(self, create_user, name="memuser"):
        user = create_user(username=name, password="x")
        _user_context.set_user(user)
        return user

    def test_remember_and_dedupe(self, create_user):
        from chat.models import UserMemory
        from chat.tools import remember_about_user
        user = self._user(create_user)
        out = _call(remember_about_user, {"fact": "Risk-averse; prefers 1% risk per trade"})
        assert not out.get("is_error")
        assert UserMemory.objects.filter(user=user).count() == 1
        _call(remember_about_user, {"fact": "Risk-averse; prefers 1% risk per trade"})
        assert UserMemory.objects.filter(user=user).count() == 1  # exact dupe ignored

    def test_cap_and_hygiene(self, create_user):
        from chat.models import UserMemory
        from chat.tools import remember_about_user
        user = self._user(create_user, "memcap")
        for i in range(30):
            UserMemory.objects.create(user=user, content=f"fact {i}")
        out = _call(remember_about_user, {"fact": "one too many"})
        assert "30" in out["content"][0]["text"]  # cap message mentions the limit
        assert UserMemory.objects.filter(user=user).count() == 30
        # hygiene: newlines stripped, content capped at 220
        UserMemory.objects.filter(user=user).delete()
        _call(remember_about_user, {"fact": "line1\nline2" + "x" * 300})
        saved = UserMemory.objects.get(user=user)
        assert "\n" not in saved.content and len(saved.content) <= 220

    def test_forget_by_substring(self, create_user):
        from chat.models import UserMemory
        from chat.tools import remember_about_user, forget_about_user
        user = self._user(create_user, "memforget")
        _call(remember_about_user, {"fact": "Hates hydropower stocks"})
        _call(remember_about_user, {"fact": "Long-term horizon"})
        out = _call(forget_about_user, {"match": "hydro"})
        assert "Hates hydropower" in out["content"][0]["text"]
        assert UserMemory.objects.filter(user=user).count() == 1


@pytest.mark.django_db
class TestMemoryInjection:
    def test_format_prompt_includes_memory(self, create_user):
        from chat.agent import _format_prompt
        user = create_user(username="injuser", password="x")
        rendered = _format_prompt(user, "hello", memory=["Risk-averse", "Holds NABIL long-term"])
        assert "Risk-averse" in rendered and "Holds NABIL long-term" in rendered
        assert "hello" in rendered

    def test_format_prompt_without_memory(self, create_user):
        from chat.agent import _format_prompt
        user = create_user(username="injuser2", password="x")
        rendered = _format_prompt(user, "hello", memory=[])
        assert "hello" in rendered  # renders cleanly with no facts
```

Run: `.venv/bin/python -m pytest tests/test_chat_memory.py -v` → ImportError/AttributeError failures.

- [ ] **Step 2: model + migration** — append to `chat/models.py`:

```python
class UserMemory(models.Model):
    """A short durable fact about the user, written by chat tools and injected
    into every turn's prompt. Hard-capped per user (MAX_FACTS_PER_USER)."""

    MAX_FACTS_PER_USER = 30

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="chat_memories")
    content = models.CharField(max_length=220)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["created_at"]

    def __str__(self):
        return f"{self.user_id}: {self.content[:40]}"
```

`python manage.py makemigrations chat --name usermemory --skip-checks` → 0006.

- [ ] **Step 3: tools** — append to `chat/tools.py` under a `# User memory` group:

```python
def _clean_fact(raw: str) -> str:
    cleaned = " ".join(str(raw or "").split())  # collapse whitespace incl. newlines
    return cleaned[:220]


@tool(
    "remember_about_user",
    "Save a short durable fact about the user for ALL future conversations (risk appetite, "
    "horizon, sector preferences/aversions, capital constraints, recurring goals). Use when the "
    "user states a lasting preference — not for one-off questions. Never store secrets, "
    "passwords, or account numbers. Args: fact.",
    {"fact": str},
)
async def remember_about_user(args: dict) -> dict:
    fact = _clean_fact(args.get("fact"))
    if not fact:
        return _result("A non-empty 'fact' is required.", is_error=True)

    @sync_to_async
    def _run():
        from chat.models import UserMemory
        user = get_user()
        if UserMemory.objects.filter(user=user, content=fact).exists():
            return _result(f"Already remembered: {fact}")
        if UserMemory.objects.filter(user=user).count() >= UserMemory.MAX_FACTS_PER_USER:
            return _result(
                f"Memory is full ({UserMemory.MAX_FACTS_PER_USER} facts). "
                "Use forget_about_user to remove an outdated fact first.",
                is_error=True,
            )
        UserMemory.objects.create(user=user, content=fact)
        return _result(f"Remembered: {fact}")

    return await _run()


@tool(
    "forget_about_user",
    "Delete remembered facts about the user whose text contains the given substring "
    "(case-insensitive). Reports exactly what was removed. Args: match.",
    {"match": str},
)
async def forget_about_user(args: dict) -> dict:
    match = (args.get("match") or "").strip()
    if not match:
        return _result("A non-empty 'match' is required.", is_error=True)

    @sync_to_async
    def _run():
        from chat.models import UserMemory
        user = get_user()
        hits = list(UserMemory.objects.filter(user=user, content__icontains=match))
        if not hits:
            return _result(f"No remembered facts match '{match}'.")
        removed = [m.content for m in hits]
        UserMemory.objects.filter(id__in=[m.id for m in hits]).delete()
        return _result("Forgot:\n" + "\n".join(f"- {c}" for c in removed))

    return await _run()
```

(Check how `get_user` is imported at the top of tools.py — reuse the existing import.) Append both to `ALL_TOOLS` under `# User memory`. In `chat/subagents.py`, add `tool_id("remember_about_user")` and `tool_id("forget_about_user")` to ALL FIVE subagents' tool lists.

- [ ] **Step 4: injection** — in `chat/agent.py`:

(a) `_format_prompt` gains a `memory: list[str] | None = None` kwarg; render a block:

```python
def _format_prompt(user, message: str, memory: list[str] | None = None) -> str:
    safe_username = _safe_prompt_value(getattr(user, "username", ""))
    memory_block = (
        "Known about this user:\n" + "\n".join(f"- {f}" for f in memory)
        if memory else "(nothing recorded about this user yet)"
    )
    return _ORCHESTRATOR_USER_TEMPLATE.format(
        date=date.today().isoformat(),
        username=safe_username,
        memory=memory_block,
        message=message,
    )
```

(b) `chat/prompts/orchestrator.yaml`: READ the `user:` template and add a `{memory}` line in a sensible spot (near the username/date context), e.g. `User memory:\n{memory}`. Keep YAML valid (check quoting style used in the file).

(c) `run_chat_session`: fetch facts before formatting:

```python
    @sync_to_async
    def _fetch_memory():
        from chat.models import UserMemory
        return list(
            UserMemory.objects.filter(user=user).values_list("content", flat=True)
        )

    memory = await _fetch_memory()
    formatted_prompt = _format_prompt(user, prompt, memory=memory)
```

Also instruct the orchestrator (its `system` prompt in orchestrator.yaml) with ONE added sentence: when the user states a durable preference, delegate to a subagent to call remember_about_user. Keep the edit minimal and consistent with the file's voice.

- [ ] **Step 5:** run `tests/test_chat_memory.py -v` → all pass; then `pytest tests/ -q -k chat` → no regressions (147+ green).

- [ ] **Step 6: commit** — `git add chat/ tests/test_chat_memory.py && git commit -m "feat(chat): persistent user memory with prompt injection"`

---

### Task 2: `chat/briefing.py` (my-actions renderer) + `get_my_actions` tool

**Files:** create `chat/briefing.py`, `tests/test_chat_actions_tools.py`; modify `chat/tools.py`, `chat/subagents.py`.

- [ ] **Step 1: failing tests** — create `tests/test_chat_actions_tools.py`:

```python
import asyncio
from datetime import date
from decimal import Decimal

import pytest

from chat import _user_context


def _call(tool_fn, args):
    return asyncio.run(tool_fn.handler(args))


def _mk_plan(**extra_payload):
    from stocks.models import DailyTradingPlan
    payload = {"as_of": "2026-06-10",
               "picks": [{"symbol": "SHL", "confluence_score": 81,
                          "entry": {"price": 600.0, "zone_low": 590.0, "zone_high": 612.0,
                                    "status": "IN_ZONE", "last_signal_age_days": 1,
                                    "latest_close": 601.0},
                          "targets": {"tp1": 640.0, "sl": 585.0},
                          "analog": None, "catalyst": None, "direction": "BUY",
                          "components": {"engine_agreement": {"score": 50, "active_buy_sources": ["SMART_MONEY"], "conflicting_sources": []},
                                          "opportunity": {"score": 0, "trust": None, "edge": None, "pvalue": None},
                                          "accumulation": {"score": 0}, "sector": {"score": 50, "acc_intensity": None}}}],
               "watch": [], "exits": [], "catalysts": [], "market_context": {},
               "entry_statuses": {"SHL": "IN_ZONE"}}
    payload.update(extra_payload)
    return DailyTradingPlan.objects.create(date=date(2026, 6, 11), regime="RISK_OFF",
                                           breadth=0.24, payload=payload)


@pytest.mark.django_db(transaction=True)
class TestGetMyActions:
    def test_full_actions(self, create_user):
        from decimal import Decimal as D
        from stocks.models import PortfolioAccount, PortfolioItem, SignalEpisode, WatchlistItem
        from chat.tools import get_my_actions
        user = create_user(username="act1", password="x")
        _user_context.set_user(user)
        _mk_plan()
        PortfolioAccount.objects.create(user=user, name="Live", account_type="LIVE",
                                        balance=D("1000000"), default_risk_percentage=D("1.00"))
        PortfolioItem.objects.create(user=user, ticker="NICA", quantity=5, buy_price=D("450"))
        SignalEpisode.objects.create(source="DISTRIBUTION_ALERT", producer_key="DISTRIBUTION_ALERT",
                                     symbol="NICA", direction="SELL", start_date=date(2026, 6, 10),
                                     last_signal_date=date(2026, 6, 10), entry_price=D("500"))
        WatchlistItem.objects.create(user=user, ticker="SCB", target_price=D("100"))
        # overlay's _latest_closes hits the unmanaged price table — patch it
        from unittest.mock import patch
        with patch("stocks.services.daily_plan._latest_closes",
                   return_value={"NICA": 500.0, "SCB": 99.0}):
            out = _call(get_my_actions, {})
        text = out["content"][0]["text"]
        assert "NICA" in text          # signal against holding
        assert "SCB" in text           # watchlist trigger
        assert "SHL" in text           # sized pick suggestion
        assert "shares" in text.lower()

    def test_empty_state(self, create_user):
        from chat.tools import get_my_actions
        user = create_user(username="act2", password="x")
        _user_context.set_user(user)
        out = _call(get_my_actions, {})
        assert "nothing needs your attention" in out["content"][0]["text"].lower()
```

Run → fails (no get_my_actions).

- [ ] **Step 2: renderer** — create `chat/briefing.py`:

```python
"""Deterministic prose renderers for the daily plan + per-user actions.

Shared by chat tools and the nightly briefing task. NO LLM calls here —
the text is built straight from the plan payload and overlay dicts.
"""


def render_my_actions(overlay: dict, sizing: dict, picks: list) -> str:
    """Per-user 'what needs my attention' section from user_overlay + sizing."""
    lines: list[str] = []

    positions = (overlay or {}).get("positions_near_action") or []
    if positions:
        lines.append("Positions near action:")
        for p in positions:
            lines.append(f"- {p['ticker']}: close {p['close']:.1f} near {p['near'].replace('_', ' ')}")

    flips = (overlay or {}).get("signal_flips") or []
    if flips:
        lines.append("Signals against your holdings:")
        for f in flips:
            lines.append(f"- {f['symbol']}: {f['source'].replace('_', ' ').title()} active since {f['since']}")

    triggers = (overlay or {}).get("watchlist_triggers") or []
    if triggers:
        lines.append("Watchlist triggers:")
        for w in triggers:
            tgt = f" (entry target {w['target_price']:.1f})" if w.get("target_price") is not None else ""
            lines.append(f"- {w['ticker']}: close {w['close']:.1f}{tgt}")

    sized = [(p, (sizing or {}).get(p.get("symbol"))) for p in (picks or [])]
    sized = [(p, s) for p, s in sized if s]
    if sized:
        lines.append("Sized plan picks (risk-budget based):")
        for p, s in sized:
            lines.append(
                f"- {p['symbol']} ({p['confluence_score']}/100): ≈{s['shares']} shares, "
                f"risks {s['risk_pct']}% of {s['account_name']}"
            )

    if not lines:
        return "Nothing needs your attention tomorrow — no positions near stops/targets, no signals against holdings, no watchlist triggers."
    return "\n".join(lines)
```

- [ ] **Step 3: tool** — append to `chat/tools.py` (same `# Next-day plan & verdict` group):

```python
@tool(
    "get_my_actions",
    "The user's personal action list for the next session: their positions near "
    "stop-loss/targets, active SELL signals against their holdings, watchlist entry "
    "triggers, and risk-sized suggestions for tomorrow's plan picks. ALWAYS use this "
    "for 'what should I do with my positions/portfolio tomorrow'. No args.",
    {},
)
async def get_my_actions(args: dict) -> dict:
    @sync_to_async
    def _run():
        from chat.briefing import render_my_actions
        from stocks.models import DailyTradingPlan
        from stocks.services.daily_plan import user_overlay
        from stocks.services.position_sizing import sizing_map_for_user

        user = get_user()
        plan = DailyTradingPlan.objects.order_by("-date").first()
        picks = plan.payload.get("picks", []) if plan else []
        overlay = user_overlay(user)
        sizing = sizing_map_for_user(user, picks)
        prose = render_my_actions(overlay, sizing, picks)
        if plan:
            prose = f"Your actions for {plan.date} (plan as of {plan.payload.get('as_of')}):\n" + prose
        return _result(prose, card={"type": "my_actions",
                                    "data": {"overlay": overlay, "sizing": sizing}})

    return await _run()
```

Register in `ALL_TOOLS` and on portfolio_advisor, portfolio_manager, buy_sell_strategist in subagents.py.

- [ ] **Step 4:** run the new tests → pass; chat suite `-k chat` green. **Commit:** `git add chat/briefing.py chat/tools.py chat/subagents.py tests/test_chat_actions_tools.py && git commit -m "feat(chat): get_my_actions tool + shared actions renderer"`

---

### Task 3: extract `render_plan_briefing` and refactor `get_tomorrows_plan`

**Files:** modify `chat/briefing.py`, `chat/tools.py`; create `tests/test_chat_briefing.py`.

- [ ] **Step 1: failing test** — `tests/test_chat_briefing.py`:

```python
from types import SimpleNamespace

from chat.briefing import render_plan_briefing


def _plan(picks=None, watch=None, catalysts=None, breadth=0.24):
    payload = {"as_of": "2026-06-10", "picks": picks or [], "watch": watch or [],
               "exits": [], "catalysts": catalysts or [], "market_context": {}}
    return SimpleNamespace(date="2026-06-11", regime="RISK_OFF", breadth=breadth, payload=payload)


def test_renders_picks_watch_catalysts():
    pick = {"symbol": "SHL", "confluence_score": 81, "direction": "BUY",
            "entry": {"price": 600.0, "zone_low": 590.0, "zone_high": 612.0,
                      "status": "IN_ZONE", "last_signal_age_days": 1, "latest_close": 601.0},
            "targets": {"tp1": 640.0, "sl": 585.0},
            "analog": {"n": 14, "fwd_3d_median_pct": 2.1, "win_rate_3d": 0.64,
                       "fwd_1d_median_pct": 0.8, "fwd_5d_median_pct": 2.9},
            "catalyst": None, "components": {"engine_agreement": {"active_buy_sources": ["A"], "conflicting_sources": []},
                                              "opportunity": {"trust": None}, "accumulation": {}, "sector": {}}}
    watch_item = {**pick, "symbol": "GVL", "confluence_score": 72,
                  "entry": {**pick["entry"], "status": "EXTENDED"}}
    cat = {"symbol": "NABIL", "type": "BOOK_CLOSE", "date": "2026-06-18", "days_away": 7, "detail": "bonus 10%"}
    text = render_plan_briefing(_plan(picks=[pick], watch=[watch_item], catalysts=[cat]))
    assert "SHL" in text and "81" in text
    assert "GVL" in text
    assert "NABIL" in text and "book close" in text.lower()
    assert "24%" in text  # breadth


def test_empty_plan_honest():
    text = render_plan_briefing(_plan())
    assert "no qualifying setups" in text.lower()
```

Run → ImportError.

- [ ] **Step 2: extract** — move the prose-building body of `get_tomorrows_plan` (chat/tools.py ~2680–2747: header, picks loop, watch line, catalysts line, empty state) into `chat/briefing.py::render_plan_briefing(plan) -> str` VERBATIM (only renaming locals as needed; it accepts any object with `.date/.regime/.breadth/.payload`). `get_tomorrows_plan` becomes: fetch plan → `prose = render_plan_briefing(plan)` → same `_result(...)` with the same card. The EXISTING tests in `tests/test_chat_plan_tools.py` are the regression net — they must pass UNCHANGED.

- [ ] **Step 3:** run `tests/test_chat_briefing.py tests/test_chat_plan_tools.py -v` → all pass. **Commit:** `git add chat/briefing.py chat/tools.py tests/test_chat_briefing.py && git commit -m "refactor(chat): extract render_plan_briefing for reuse by the briefing task"`

---

### Task 4: morning-briefing sessions in `generate_daily_plan_task`

**Files:** modify `backend/stocks/tasks.py`; tests appended to `tests/test_daily_plan.py`.

- [ ] **Step 1: failing tests** — append to `tests/test_daily_plan.py` (inside or alongside `TestGenerateDailyPlanTask`; reuse its mocking style — it patches `stocks.services.daily_plan.build_daily_plan` and seeds `TierPermission` + a PRO user):

```python
@pytest.mark.django_db
class TestMorningBriefing:
    def _setup(self, create_user):
        from users.models import TierPermission
        user = create_user(username="briefuser", password="x")
        user.profile.subscription_tier = "PRO"
        user.profile.save()
        TierPermission.objects.create(tier="PRO", module_key="daily_plan", is_enabled=True)
        return user

    def _plan(self):
        from stocks.models import DailyTradingPlan
        plan = DailyTradingPlan.objects.create(
            date=date_cls(2026, 6, 12), regime="RISK_ON",
            payload={"as_of": "2026-06-11",
                     "picks": [{"symbol": "SHL", "confluence_score": 81, "direction": "BUY",
                                "entry": {"price": 600.0, "zone_low": 590.0, "zone_high": 612.0,
                                          "status": "IN_ZONE", "last_signal_age_days": 1,
                                          "latest_close": 601.0},
                                "targets": {"tp1": 640.0, "sl": 585.0},
                                "analog": None, "catalyst": None,
                                "components": {"engine_agreement": {"active_buy_sources": ["A"], "conflicting_sources": []},
                                                "opportunity": {"trust": None}, "accumulation": {}, "sector": {}}}],
                     "watch": [], "exits": [], "catalysts": [], "market_context": {},
                     "entry_statuses": {"SHL": "IN_ZONE"}},
        )
        plan.was_regenerated = True
        return plan

    @patch("stocks.services.daily_plan.user_overlay",
           return_value={"positions_near_action": [], "signal_flips": [], "watchlist_triggers": []})
    @patch("stocks.services.daily_plan.build_daily_plan")
    def test_briefing_session_created_and_linked(self, mock_build, _overlay, create_user):
        from chat.models import ChatMessage, ChatSession
        from stocks.models import Notification
        from stocks.tasks import generate_daily_plan_task
        user = self._setup(create_user)
        mock_build.return_value = self._plan()

        generate_daily_plan_task()

        session = ChatSession.objects.get(user=user, title="Morning Briefing — 2026-06-12")
        msg = ChatMessage.objects.get(session=session)
        assert msg.role == ChatMessage.ROLE_ASSISTANT
        assert "SHL" in msg.text
        notif = Notification.objects.get(user=user, type="DAILY_PLAN_READY")
        assert notif.redirect_url == f"/chat?session={session.id}"

        # idempotent: second run does not duplicate the session/message
        mock_build.return_value = self._plan_existing() if hasattr(self, "_plan_existing") else mock_build.return_value
        generate_daily_plan_task()
        assert ChatSession.objects.filter(user=user, title="Morning Briefing — 2026-06-12").count() == 1
        assert ChatMessage.objects.filter(session=session).count() == 1
```

NOTE on the idempotency re-run: the second `generate_daily_plan_task()` call needs `mock_build` to return a plan with `was_regenerated=True` again and the SAME date — construct a fresh `_plan()`-shaped return whose `DailyTradingPlan.objects.create` would violate the unique date; instead reuse the FIRST plan object: `mock_build.return_value` is already that object (with `was_regenerated=True`), so just call the task again — adjust the test accordingly (drop the `_plan_existing` hasattr cruft; simply call `generate_daily_plan_task()` twice with the same mock). Get this right when writing the real test.

Run → fails.

- [ ] **Step 2: implement** — in `stocks/tasks.py` `generate_daily_plan_task`, replace the notification fan-out loop body so each user gets: (1) idempotent briefing session, (2) personalized message, (3) deep-linked notification:

```python
    from chat.briefing import render_my_actions, render_plan_briefing
    from chat.models import ChatMessage, ChatSession
    from stocks.services.daily_plan import user_overlay
    from stocks.services.position_sizing import sizing_map_for_user

    plan_prose = render_plan_briefing(plan)
    picks = plan.payload.get("picks", [])
    title = f"Morning Briefing — {plan.date.isoformat()}"
    notified = 0
    for user in users:
        session = ChatSession.objects.filter(user=user, title=title).first()
        if session is None:
            overlay = user_overlay(user)
            sizing = sizing_map_for_user(user, picks)
            briefing = (
                plan_prose
                + "\n\nYour actions:\n"
                + render_my_actions(overlay, sizing, picks)
            )
            session = ChatSession.objects.create(user=user, title=title)
            ChatMessage.objects.create(
                session=session,
                role=ChatMessage.ROLE_ASSISTANT,
                text=briefing,
                blocks=[{"type": "text", "text": briefing}],
            )
        create_notification(
            user=user,
            notification_type="DAILY_PLAN_READY",
            title=f"Tomorrow's Plan ready — {plan.date.isoformat()}",
            message=( ...keep the existing message logic... ),
            ticker="SUMMARY",
            redirect_url=f"/chat?session={session.id}",
            metadata={"plan_date": plan.date.isoformat(), "picks": pick_count},
        )
        notified += 1
```

CRITICAL pre-check: READ `chat/streaming.py`'s persisted block shape AND the frontend chat message renderer (`frontend/src/components/chat/` — find how assistant `blocks` render) to confirm `{"type": "text", "text": ...}` is the right block dict; adapt if the renderer expects a different key (e.g. `{"type": "text", "content": ...}`). If the renderer falls back to `message.text` when blocks are empty, prefer `blocks=[]` + text-only — pick whichever ACTUALLY renders, and say which in your report. ALSO note: `user_overlay` calls `_latest_closes` (unmanaged table) — in production that's fine; the TASK TEST patches `stocks.services.daily_plan.user_overlay` wholesale (as shown).

- [ ] **Step 3:** run `tests/test_daily_plan.py -v` (all, incl. existing task tests — the SKIPPED-path test must still pass: the skip return happens BEFORE the briefing loop) and `pytest tests/ -q -k chat`. **Commit:** `git add stocks/tasks.py tests/test_daily_plan.py && git commit -m "feat(chat): personalized morning-briefing sessions seeded by the nightly plan task"`

---

### Task 5: watchlist write tools

**Files:** modify `chat/tools.py`, `chat/subagents.py`; tests appended to `tests/test_chat_actions_tools.py`.

- [ ] **Step 1: failing tests** (append):

```python
@pytest.mark.django_db(transaction=True)
class TestWatchlistTools:
    def test_add_update_remove(self, create_user):
        from stocks.models import WatchlistItem
        from chat.tools import add_to_watchlist, remove_from_watchlist
        user = create_user(username="wl1", password="x")
        _user_context.set_user(user)

        out = _call(add_to_watchlist, {"symbol": "nabil", "target_price": 600, "notes": "entry on dip"})
        item = WatchlistItem.objects.get(user=user, ticker="NABIL")
        assert float(item.target_price) == 600 and item.alert_enabled is True
        assert "NABIL" in out["content"][0]["text"]

        _call(add_to_watchlist, {"symbol": "NABIL", "stop_loss_price": 550})
        item.refresh_from_db()
        assert float(item.stop_loss_price) == 550
        assert float(item.target_price) == 600  # upsert preserves unset fields
        assert WatchlistItem.objects.filter(user=user).count() == 1

        out = _call(remove_from_watchlist, {"symbol": "NABIL"})
        assert WatchlistItem.objects.filter(user=user).count() == 0
        assert "removed" in out["content"][0]["text"].lower()

    def test_remove_missing_is_graceful(self, create_user):
        from chat.tools import remove_from_watchlist
        _user_context.set_user(create_user(username="wl2", password="x"))
        out = _call(remove_from_watchlist, {"symbol": "GHOST"})
        assert "not on" in out["content"][0]["text"].lower() or "no " in out["content"][0]["text"].lower()
```

- [ ] **Step 2: implement** — `# Watchlist actions` group in tools.py:

```python
@tool(
    "add_to_watchlist",
    "Add a stock to the user's watchlist or update its levels (upsert). Optional entry "
    "target_price, stop_loss_price, notes. Alerts are enabled by default — the user gets "
    "notified on level hits and when the symbol enters its canonical entry zone. "
    "Args: symbol, target_price?, stop_loss_price?, notes?, alerts?.",
    {"symbol": str, "target_price": float, "stop_loss_price": float, "notes": str, "alerts": bool},
)
async def add_to_watchlist(args: dict) -> dict:
    symbol = (args.get("symbol") or "").strip().upper()
    if not symbol:
        return _result("'symbol' is required.", is_error=True)

    @sync_to_async
    def _run():
        from stocks.models import Company, WatchlistItem
        user = get_user()
        known = Company.objects.filter(symbol=symbol).exists()
        updates = {}
        if args.get("target_price") is not None:
            updates["target_price"] = args["target_price"]
        if args.get("stop_loss_price") is not None:
            updates["stop_loss_price"] = args["stop_loss_price"]
        if args.get("notes"):
            updates["notes"] = str(args["notes"])[:500]
        updates["alert_enabled"] = bool(args.get("alerts", True))
        item, created = WatchlistItem.objects.update_or_create(
            user=user, ticker=symbol, defaults=updates)
        parts = [f"{'Added' if created else 'Updated'} {symbol} on the watchlist"]
        if item.target_price is not None:
            parts.append(f"entry target {float(item.target_price):.1f}")
        if item.stop_loss_price is not None:
            parts.append(f"stop {float(item.stop_loss_price):.1f}")
        parts.append("alerts on" if item.alert_enabled else "alerts off")
        prose = ", ".join(parts) + "."
        if not known:
            prose += f" (Note: '{symbol}' is not a listed equity I recognize — double-check the ticker.)"
        return _result(prose)

    return await _run()


@tool(
    "remove_from_watchlist",
    "Remove a stock from the user's watchlist. Args: symbol.",
    {"symbol": str},
)
async def remove_from_watchlist(args: dict) -> dict:
    symbol = (args.get("symbol") or "").strip().upper()
    if not symbol:
        return _result("'symbol' is required.", is_error=True)

    @sync_to_async
    def _run():
        from stocks.models import WatchlistItem
        deleted, _ = WatchlistItem.objects.filter(user=get_user(), ticker=symbol).delete()
        if deleted:
            return _result(f"Removed {symbol} from the watchlist.")
        return _result(f"{symbol} is not on the watchlist.")

    return await _run()
```

CAVEAT: `update_or_create` with `defaults=updates` REPLACES only provided keys — but the second add call must PRESERVE target_price 600 while setting stop 550: since `target_price` is absent from `updates` on that call, update_or_create won't touch it. Correct as written. Register both in ALL_TOOLS and on portfolio_advisor, portfolio_manager, buy_sell_strategist.

- [ ] **Step 3:** tests pass; chat suite green. **Commit:** `git commit -m "feat(chat): watchlist add/update/remove tools"` (with the touched files).

---

### Task 6: zone-entry alerts

**Files:** modify `stocks/services/notification_service.py`, `stocks/tasks.py` (check task), `stocks/views/notifications.py` (trigger_check); tests append to `tests/test_chat_actions_tools.py` (or a fitting existing notification test file — implementer checks for one with `grep -rln check_watchlist_alerts tests/`).

- [ ] **Step 1: failing test:**

```python
@pytest.mark.django_db
class TestZoneEntryAlerts:
    def test_alert_created_when_in_zone(self, create_user):
        from decimal import Decimal as D
        from stocks.models import DailyTradingPlan, Notification, WatchlistItem
        from stocks.services.notification_service import check_zone_entry_alerts
        user = create_user(username="zone1", password="x")
        WatchlistItem.objects.create(user=user, ticker="SHL", alert_enabled=True)
        WatchlistItem.objects.create(user=user, ticker="GVL", alert_enabled=True)   # EXTENDED → no alert
        WatchlistItem.objects.create(user=user, ticker="OFF", alert_enabled=False)  # alerts off → no alert
        DailyTradingPlan.objects.create(
            date=date(2026, 6, 12), regime="RISK_ON",
            payload={"entry_statuses": {"SHL": "IN_ZONE", "GVL": "EXTENDED", "OFF": "IN_ZONE"},
                     "picks": [], "watch": [], "exits": [], "catalysts": [], "market_context": {}})
        count = check_zone_entry_alerts(user)
        assert count == 1
        notif = Notification.objects.get(user=user, type="WATCHLIST_ENTRY")
        assert notif.ticker == "SHL"
        assert "/ticker/SHL" in notif.redirect_url

    def test_no_plan_no_alerts(self, create_user):
        from stocks.services.notification_service import check_zone_entry_alerts
        assert check_zone_entry_alerts(create_user(username="zone2", password="x")) == 0
```

(Use the file's existing `date` import; adapt names.)

- [ ] **Step 2: implement** — in `notification_service.py` (match the file's existing check-function style; read `check_watchlist_alerts` first):

```python
def check_zone_entry_alerts(user):
    """Notify when an alert-enabled watchlist symbol is IN_ZONE per the latest plan."""
    from stocks.models import DailyTradingPlan, WatchlistItem

    plan = DailyTradingPlan.objects.order_by("-date").first()
    statuses = (plan.payload.get("entry_statuses") or {}) if plan else {}
    if not statuses:
        return 0
    created = 0
    items = WatchlistItem.objects.filter(user=user, alert_enabled=True)
    for item in items:
        if statuses.get(item.ticker) != "IN_ZONE":
            continue
        notification = create_notification(
            user=user,
            notification_type=Notification.NotificationType.WATCHLIST_ENTRY,
            title=f"{item.ticker} is in its entry zone",
            message=(f"{item.ticker} closed inside its canonical entry zone "
                     f"(ATR-based) per the latest plan ({plan.payload.get('as_of')})."),
            ticker=item.ticker,
            redirect_url=f"/ticker/{item.ticker}",
            watchlist_item_id=item.id,
        )
        if notification:
            created += 1
    return created
```

Wire it where the sibling checks run: `stocks/tasks.py::check_all_user_notifications` (add alongside `check_watchlist_alerts(user)`) AND `stocks/views/notifications.py::trigger_check` (add a count to its response following its shape). `create_notification`'s unread-dedup prevents hourly spam.

- [ ] **Step 3:** tests + `pytest tests/ -q -k "chat or notification"` green. **Commit** with the touched files: `git commit -m "feat(alerts): canonical zone-entry alerts for watchlist symbols"`.

---

### Task 7: `get_chat_action_record` tool

**Files:** modify `chat/tools.py`, `chat/subagents.py`; tests append to `tests/test_chat_actions_tools.py`.

- [ ] **Step 1:** READ `stocks/models/portfolio.py` `PortfolioActionDraft` + `TradePlan`/`TradePlanLeg` actual fields, and one `propose_*` tool's draft creation to learn what `result` holds after confirmation. Then write the failing test:

```python
@pytest.mark.django_db(transaction=True)
class TestChatActionRecord:
    def test_counts_and_honesty(self, create_user):
        from decimal import Decimal as D
        from stocks.models import PortfolioActionDraft, TradePlan, TradePlanLeg
        from chat.tools import get_chat_action_record
        user = create_user(username="rec1", password="x")
        _user_context.set_user(user)
        PortfolioActionDraft.objects.create(user=user, kind="TRADE", status="CONFIRMED",
                                            title="Buy 10 NABIL", payload={})
        PortfolioActionDraft.objects.create(user=user, kind="TRADE", status="EXPIRED",
                                            title="Buy 5 SCB", payload={})
        plan = TradePlan.objects.create(user=user, ticker="SHL", risk_budget_pct=D("1.00"))
        TradePlanLeg.objects.create(plan=plan, leg_number=1, price_target=D("600"),
                                    allocation_pct=D("100"), stop_loss_price=D("585"))
        out = _call(get_chat_action_record, {})
        text = out["content"][0]["text"]
        assert "CONFIRMED" in text or "confirmed" in text
        assert "TRADE" in text or "trade" in text
        assert "SHL" in text
        # honesty: realized-outcome attribution is explicitly not claimed
        assert "not" in text.lower() and ("track" in text.lower() or "attribut" in text.lower() or "measur" in text.lower())

    def test_empty_record(self, create_user):
        from chat.tools import get_chat_action_record
        _user_context.set_user(create_user(username="rec2", password="x"))
        out = _call(get_chat_action_record, {})
        assert "no " in out["content"][0]["text"].lower()
```

(ADAPT the model kwargs to the REAL field names you read — e.g. PortfolioActionDraft may require account/title/expires_at defaults; fix the seeding accordingly, never the assertions' spirit.)

- [ ] **Step 2: implement** — `# Accountability` group:

```python
@tool(
    "get_chat_action_record",
    "Honest accounting of chat's own past proposals for THIS user (last 90 days): "
    "action drafts by kind and status (proposed/confirmed/cancelled/expired), trade plans "
    "with executed/skipped legs and recorded entry prices. Consult this before giving "
    "high-conviction advice — it is your own track record. No args.",
    {},
)
async def get_chat_action_record(args: dict) -> dict:
    @sync_to_async
    def _run():
        from collections import Counter
        from datetime import timedelta
        from django.utils import timezone
        from stocks.models import PortfolioActionDraft, TradePlan

        user = get_user()
        since = timezone.now() - timedelta(days=90)
        drafts = PortfolioActionDraft.objects.filter(user=user, created_at__gte=since)
        plans = TradePlan.objects.filter(user=user, created_at__gte=since).prefetch_related("legs")

        if not drafts.exists() and not plans.exists():
            return _result("No chat-proposed actions in the last 90 days.")

        lines = ["Chat action record (last 90 days):"]
        combo = Counter((d.kind, d.status) for d in drafts)
        if combo:
            lines.append("Proposals:")
            for (kind, status), n in sorted(combo.items()):
                lines.append(f"- {kind} {status}: {n}")
        if plans.exists():
            lines.append("Trade plans:")
            for p in plans:
                legs = list(p.legs.all())
                executed = [l for l in legs if l.status == "EXECUTED"]
                leg_bits = f"{len(executed)}/{len(legs)} legs executed"
                entries = [f"{float(l.transaction.rate):.1f}" for l in executed
                           if getattr(l, "transaction", None)]
                entry_bits = f" (entries at {', '.join(entries)})" if entries else ""
                lines.append(f"- {p.ticker} [{p.status}]: {leg_bits}{entry_bits}")
        lines.append(
            "Note: realized P&L attribution to chat proposals is not yet tracked — "
            "executed entries are recorded, outcomes are not attributed."
        )
        return _result("\n".join(lines), card={"type": "chat_action_record", "data": {
            "drafts": [{"kind": k, "status": s, "count": n} for (k, s), n in combo.items()],
        }})

    return await _run()
```

(VERIFY `l.transaction.rate` is the right field on PortfolioTransaction — adapt to the model.) Register in ALL_TOOLS and on buy_sell_strategist + portfolio_manager. Add ONE sentence to the strategist's prompt YAML (`chat/prompts/` strategist file) telling it to consult `get_chat_action_record` when giving high-conviction recommendations — minimal, matching the file's voice.

- [ ] **Step 3:** tests + chat suite green. **Commit:** `git commit -m "feat(chat): chat action record tool for self-accountable advice"`.

---

### Task 8: Full verification + deploy

- [ ] Backend: `pytest tests/test_chat_memory.py tests/test_chat_actions_tools.py tests/test_chat_briefing.py tests/test_chat_plan_tools.py tests/test_daily_plan.py -q` all green; `pytest tests/ -q -k chat` ≥147 green; full suite `pytest tests/ -q --ignore=tests/test_portfolio_api.py 2>&1 | tail -2` → no NEW failures vs the 28-known baseline; `makemigrations --check --dry-run --skip-checks` → only the committed 0006 (no missing).
- [ ] Tool registration smoke: import `chat.tools.ALL_TOOLS` in Docker, assert the 6 new names present (remember/forget/my_actions/add/remove/action_record).
- [ ] Deploy: `docker restart stockastic-backend` (runs `migrate` → applies chat 0006; tools load fresh) + `docker restart stockastic-celery` (briefing wiring in the task). NO frontend rebuild needed.
- [ ] Optional live check: run `generate_daily_plan_task` semantics are nightly; verify by checking the next 17:30 run creates "Morning Briefing — <date>" sessions (or manually trigger the task once if the user wants immediate sessions — note the holiday-skip guard returns SKIPPED when as_of unchanged, which also skips briefings by design).

## Self-Review Notes

- Spec coverage: memory (T1), my-actions (T2), briefing renderer + task (T3+T4), watchlist/zone alerts (T5+T6), action record (T7), no-frontend-changes claim verified (deep-link + generic renderers pre-exist), out-of-scope respected.
- Type consistency: `render_my_actions(overlay, sizing, picks)` and `render_plan_briefing(plan)` signatures match across T2/T3/T4; tool names match registrations; `{memory}` placeholder name consistent between agent.py and orchestrator.yaml.
- Deliberate judgment calls: briefings are deterministic prose (no LLM cost); briefing message not in SDK context (orchestrator prompt note + tools recover it); title-based idempotency for briefing sessions; zone alerts ride the existing WATCHLIST_ENTRY type and hourly check; action record explicitly disclaims unmeasured outcome attribution.
