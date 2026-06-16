# AI analysis timeline — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single rolling per-company chat summary with a per-user, time-ordered timeline of structured AI analysis entries (stance + aspect + change note), shown in a new "AI analysis" tab on the ticker page, with the existing card surfacing the latest entry.

**Architecture:** A new `CompanyAnalysisEntry` model becomes the single store. Each relevant chat turn loads the user's latest entry as "prior", makes one structured Haiku call returning `{materially_changed, summary, stance, aspect, change_note}`, then either creates a new entry (material change / first mention) or refines the latest entry in place. `CompanyChatSummary` is removed by a data-preserving migration. Two user-scoped endpoints serve the latest entry and the full series.

**Tech Stack:** Django 6 + DRF, Celery, `claude_agent_sdk` (Haiku `claude-haiku-4-5`), pytest; Next.js 16 / React 19, `react-markdown` + `remark-gfm`, `date-fns`.

**Spec:** `docs/superpowers/specs/2026-06-16-ai-analysis-timeline-design.md`

**Environment notes:** tests run with the global `pytest` (no venv). Some unrelated chat test files (`test_saved_analyses.py`, `test_prompt_history.py`) fail to *collect* locally due to a missing `talib` module — that is pre-existing; run only the feature's own test files. Tests are pytest-style (plain functions + `assert`). `Company` (`stocks.models.market`) is `Meta.managed=False`; `backend/chat/tests/conftest.py` already creates its table for the session.

---

## File structure

**Backend**
- Modify `backend/chat/models.py` — add `CompanyAnalysisEntry`; later remove `CompanyChatSummary`.
- Create `backend/chat/migrations/0011_companyanalysisentry.py` (generated).
- Create `backend/chat/migrations/0012_seed_analysis_entries.py` (hand-written data migration).
- Create `backend/chat/migrations/0013_delete_companychatsummary.py` (generated).
- Modify `backend/chat/summary_service.py` — add the structured analysis builder; later remove the dead `build_company_summary` path.
- Create `backend/chat/analysis_seed.py` — pure seed-transform helper (used by the data migration, unit-tested).
- Modify `backend/chat/tasks.py` — rename to `compile_company_analysis` + `_fold_company_analysis`.
- Modify `backend/chat/streaming.py` — enqueue the renamed task.
- Modify `backend/stocks/views/market/company_chat_summary.py` — repoint to the latest entry.
- Create `backend/stocks/views/market/company_analysis_timeline.py` — the series endpoint.
- Modify `backend/stocks/views/market/__init__.py` and `backend/stocks/urls.py`.

**Frontend**
- Create `frontend/src/components/ticker/stanceBadge.tsx` — `StanceBadge` + `AspectBadge` (shared, DRY).
- Modify `frontend/src/components/ticker/ChatNotesCard.tsx` — stance/aspect on the type + badge.
- Create `frontend/src/components/ticker/CompanyAnalysisTimeline.tsx` — the timeline list.
- Modify `frontend/src/app/(authenticated)/ticker/[ticker]/page.tsx` — fetch + tab.

**Test files added / replaced**
- Add `backend/chat/tests/test_company_analysis_model.py`.
- Add `backend/chat/tests/test_company_analysis_service.py`.
- Add `backend/chat/tests/test_company_analysis_task.py` (replaces `test_company_summary_task.py`).
- Add `backend/chat/tests/test_analysis_seed.py`.
- Remove `backend/chat/tests/test_company_summary_service.py`, `test_company_summary_task.py`, `test_company_summary_model.py` (their subjects are removed).
- Replace `backend/stocks/tests/test_company_chat_summary_api.py` contents.

Each commit keeps the test suite green: the new model is added alongside the old one (Task 1), then the service is added additively (Task 2), then the task switches over and the dead summary path + its tests are removed in one commit (Task 3), then views switch over (Task 4), and only then is `CompanyChatSummary` deleted (Task 5).

---

## Task 1: `CompanyAnalysisEntry` model + migration

**Files:**
- Modify: `backend/chat/models.py`
- Create: `backend/chat/migrations/0011_companyanalysisentry.py` (generated)
- Test: `backend/chat/tests/test_company_analysis_model.py` (create)

- [ ] **Step 1: Write the failing test**

Create `backend/chat/tests/test_company_analysis_model.py`:

```python
import pytest
from django.contrib.auth import get_user_model

from chat.models import CompanyAnalysisEntry

User = get_user_model()


@pytest.fixture
def user(db):
    return User.objects.create(username="alice")


def test_defaults(user):
    row = CompanyAnalysisEntry.objects.create(user=user, symbol="NMB")
    assert row.summary == ""
    assert row.stance == CompanyAnalysisEntry.STANCE_NEUTRAL
    assert row.aspect == CompanyAnalysisEntry.ASPECT_BOTH
    assert row.change_note == ""
    assert row.source_message is None
    assert "NMB" in str(row)


def test_latest_entry_is_most_recent(user):
    CompanyAnalysisEntry.objects.create(user=user, symbol="NMB", summary="old")
    CompanyAnalysisEntry.objects.create(user=user, symbol="NMB", summary="new")
    latest = CompanyAnalysisEntry.objects.filter(user=user, symbol="NMB").order_by("-created_at").first()
    assert latest.summary == "new"


def test_default_ordering_newest_first(user):
    CompanyAnalysisEntry.objects.create(user=user, symbol="NMB", summary="a")
    CompanyAnalysisEntry.objects.create(user=user, symbol="NMB", summary="b")
    summaries = list(CompanyAnalysisEntry.objects.filter(symbol="NMB").values_list("summary", flat=True))
    assert summaries == ["b", "a"]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest chat/tests/test_company_analysis_model.py -v`
Expected: FAIL — `ImportError: cannot import name 'CompanyAnalysisEntry'`.

- [ ] **Step 3: Add the model**

In `backend/chat/models.py`, add this class after the existing `CompanyChatSummary` class (do NOT remove `CompanyChatSummary` yet). `User` and `models` are already imported at the top:

```python
class CompanyAnalysisEntry(models.Model):
    """One point in a user's evolving AI analysis of a NEPSE company. The most
    recent entry per (user, symbol) is the current view; older entries are frozen
    milestones forming a timeline."""

    STANCE_BULLISH = "bullish"
    STANCE_NEUTRAL = "neutral"
    STANCE_BEARISH = "bearish"
    STANCE_CHOICES = [
        (STANCE_BULLISH, "Bullish"),
        (STANCE_NEUTRAL, "Neutral"),
        (STANCE_BEARISH, "Bearish"),
    ]

    ASPECT_TECHNICAL = "technical"
    ASPECT_FUNDAMENTAL = "fundamental"
    ASPECT_BOTH = "both"
    ASPECT_CHOICES = [
        (ASPECT_TECHNICAL, "Technical"),
        (ASPECT_FUNDAMENTAL, "Fundamental"),
        (ASPECT_BOTH, "Both"),
    ]

    user = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name="company_analysis_entries"
    )
    symbol = models.CharField(max_length=20, db_index=True)
    summary = models.TextField(blank=True, default="")
    stance = models.CharField(max_length=8, choices=STANCE_CHOICES, default=STANCE_NEUTRAL)
    aspect = models.CharField(max_length=12, choices=ASPECT_CHOICES, default=ASPECT_BOTH)
    change_note = models.CharField(max_length=240, blank=True, default="")
    source_message = models.ForeignKey(
        "ChatMessage", on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["user", "symbol", "-created_at"])]

    def __str__(self) -> str:
        return f"{self.user_id}:{self.symbol}@{self.created_at:%Y-%m-%d}"
```

- [ ] **Step 4: Generate the migration**

Run: `cd backend && python manage.py makemigrations chat`
Expected: creates `chat/migrations/0011_companyanalysisentry.py` (depends on `0010_companychatsummary`).

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && pytest chat/tests/test_company_analysis_model.py -v`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add backend/chat/models.py backend/chat/migrations/0011_companyanalysisentry.py backend/chat/tests/test_company_analysis_model.py
git commit -m "feat(chat): add CompanyAnalysisEntry model"
```

---

## Task 2: `build_company_analysis` structured service (additive)

Adds the structured analysis builder alongside the existing `build_company_summary` (which Task 3 will remove). Reuses `_run_summary` and `format_exchanges`.

**Files:**
- Modify: `backend/chat/summary_service.py`
- Test: `backend/chat/tests/test_company_analysis_service.py` (create)

- [ ] **Step 1: Write the failing test**

Create `backend/chat/tests/test_company_analysis_service.py`:

```python
import pytest
from django.contrib.auth import get_user_model

from chat import summary_service
from chat.history import Exchange
from chat.models import CompanyAnalysisEntry
from chat.summary_service import _parse_analysis, build_company_analysis, CompanyAnalysisResult

User = get_user_model()

VALID_JSON = (
    '{"materially_changed": true, "summary": "NMB looks strong on Q3 earnings.", '
    '"stance": "bullish", "aspect": "fundamental", "change_note": "Q3 beat flipped the thesis bullish."}'
)


def test_parse_valid_json_no_prior():
    result = _parse_analysis(VALID_JSON, None)
    assert result.materially_changed is True
    assert result.summary == "NMB looks strong on Q3 earnings."
    assert result.stance == "bullish"
    assert result.aspect == "fundamental"
    assert "Q3 beat" in result.change_note


def test_parse_strips_json_fences():
    fenced = "```json\n" + VALID_JSON + "\n```"
    result = _parse_analysis(fenced, None)
    assert result.stance == "bullish"


def test_parse_malformed_falls_back_to_prior(db):
    user = User.objects.create(username="bob")
    prior = CompanyAnalysisEntry.objects.create(
        user=user, symbol="NMB", summary="prior text", stance="bearish", aspect="technical"
    )
    result = _parse_analysis("not json at all", prior)
    assert result.materially_changed is False
    assert result.summary == "prior text"
    assert result.stance == "bearish"
    assert result.aspect == "technical"
    assert result.change_note == ""


def test_parse_invalid_enum_falls_back_to_neutral_no_prior():
    bad = '{"materially_changed": true, "summary": "x", "stance": "WILD", "aspect": "both", "change_note": "y"}'
    result = _parse_analysis(bad, None)
    assert result.materially_changed is False
    assert result.stance == CompanyAnalysisEntry.STANCE_NEUTRAL
    assert result.aspect == CompanyAnalysisEntry.ASPECT_BOTH


def test_build_company_analysis_uses_run_summary(monkeypatch):
    captured = {}

    async def fake_run(prompt, system):
        captured["prompt"] = prompt
        return VALID_JSON

    monkeypatch.setattr(summary_service, "_run_summary", fake_run)
    result = build_company_analysis(None, [Exchange("How is NMB?", "Great Q3.")], "NMB")
    assert isinstance(result, CompanyAnalysisResult)
    assert result.stance == "bullish"
    assert "NMB" in captured["prompt"]
    assert "How is NMB?" in captured["prompt"]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest chat/tests/test_company_analysis_service.py -v`
Expected: FAIL — `ImportError: cannot import name '_parse_analysis'`.

- [ ] **Step 3: Add the structured builder**

In `backend/chat/summary_service.py`, add `import json` and `from dataclasses import dataclass` to the imports at the top (next to the existing `import asyncio`). Then append at the end of the file:

```python
MAX_CHANGE_NOTE_CHARS = 240
COMPANY_ANALYSIS_SYSTEM = (
    "You track one user's evolving analysis of a single NEPSE-listed company across "
    "their chat. Given the company's ticker, the prior analysis, and the newest "
    "user/assistant exchange, return ONLY a JSON object (no markdown fences, no "
    "preamble) with keys: "
    '"materially_changed" (boolean: true only if the view shifted meaningfully — a '
    "verdict flip, a new thesis, or a major technical/fundamental development — not "
    'for minor elaboration), "summary" (plain prose under 200 words capturing the '
    'current view of this company), "stance" (one of "bullish", "neutral", '
    '"bearish"), "aspect" (one of "technical", "fundamental", "both" — what drove '
    'this update), "change_note" (one short sentence on what changed since the prior '
    "analysis). Ignore other companies and pleasantries."
)


@dataclass(frozen=True)
class CompanyAnalysisResult:
    materially_changed: bool
    summary: str
    stance: str
    aspect: str
    change_note: str


def _company_analysis_prompt(prior_entry, exchanges, symbol: str) -> str:
    if prior_entry is not None and (prior_entry.summary or "").strip():
        prior = f"stance={prior_entry.stance}; {prior_entry.summary.strip()}"
    else:
        prior = "(no prior analysis)"
    return (
        f"Company: {symbol}\n\n"
        "Prior analysis:\n"
        f"{prior}\n\n"
        "Newest exchange(s):\n"
        f"{format_exchanges(exchanges)}\n\n"
        "Return the JSON object."
    )


def _fallback_result(prior_entry) -> CompanyAnalysisResult:
    from chat.models import CompanyAnalysisEntry as Entry

    if prior_entry is not None:
        return CompanyAnalysisResult(
            False, prior_entry.summary or "", prior_entry.stance, prior_entry.aspect, ""
        )
    return CompanyAnalysisResult(False, "", Entry.STANCE_NEUTRAL, Entry.ASPECT_BOTH, "")


def _parse_analysis(text: str, prior_entry) -> CompanyAnalysisResult:
    from chat.models import CompanyAnalysisEntry as Entry

    stances = {c[0] for c in Entry.STANCE_CHOICES}
    aspects = {c[0] for c in Entry.ASPECT_CHOICES}
    cleaned = (text or "").strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
    try:
        data = json.loads(cleaned)
        summary = str(data["summary"]).strip()
        stance, aspect = data["stance"], data["aspect"]
    except (ValueError, TypeError, KeyError):
        return _fallback_result(prior_entry)
    if not summary or stance not in stances or aspect not in aspects:
        return _fallback_result(prior_entry)
    return CompanyAnalysisResult(
        materially_changed=bool(data.get("materially_changed", False)),
        summary=summary[:MAX_COMPANY_SUMMARY_CHARS],
        stance=stance,
        aspect=aspect,
        change_note=str(data.get("change_note", "")).strip()[:MAX_CHANGE_NOTE_CHARS],
    )


def build_company_analysis(prior_entry, exchanges, symbol: str) -> CompanyAnalysisResult:
    """Return a structured analysis update. Safe-falls back to prior on bad output."""
    prompt = _company_analysis_prompt(prior_entry, exchanges, symbol)
    text = asyncio.run(_run_summary(prompt, COMPANY_ANALYSIS_SYSTEM))
    return _parse_analysis(text, prior_entry)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && pytest chat/tests/test_company_analysis_service.py -v`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/chat/summary_service.py backend/chat/tests/test_company_analysis_service.py
git commit -m "feat(chat): add structured build_company_analysis service"
```

---

## Task 3: Switch the task to `compile_company_analysis` + remove dead summary path

Rewrites the Celery task to write `CompanyAnalysisEntry` (create on material change, refine otherwise), updates the enqueue, and removes the now-unused `build_company_summary` service path and its tests.

**Files:**
- Modify: `backend/chat/tasks.py`
- Modify: `backend/chat/streaming.py`
- Modify: `backend/chat/summary_service.py` (remove dead code)
- Test: `backend/chat/tests/test_company_analysis_task.py` (create)
- Remove: `backend/chat/tests/test_company_summary_task.py`, `backend/chat/tests/test_company_summary_service.py`

- [ ] **Step 1: Write the failing test**

Create `backend/chat/tests/test_company_analysis_task.py`:

```python
import uuid

import pytest
from django.contrib.auth import get_user_model

from chat import summary_service
from chat.models import ChatSession, ChatMessage, CompanyAnalysisEntry
from chat.summary_service import CompanyAnalysisResult
from chat.tasks import compile_company_analysis
from stocks.models.market import Company

User = get_user_model()


@pytest.fixture
def user(db):
    return User.objects.create(username="carol")


@pytest.fixture
def session(user):
    return ChatSession.objects.create(user=user, title="t")


@pytest.fixture
def nmb(db):
    return Company.objects.create(symbol="NMB", name="NMB Bank", status="A")


def _exchange(session, q, a):
    ChatMessage.objects.create(session=session, role=ChatMessage.ROLE_USER, text=q)
    return ChatMessage.objects.create(session=session, role=ChatMessage.ROLE_ASSISTANT, text=a)


def _result(changed, summary="s", stance="bullish", aspect="both", note="n"):
    return CompanyAnalysisResult(changed, summary, stance, aspect, note)


def test_first_mention_creates_one_entry(session, nmb, monkeypatch):
    monkeypatch.setattr(summary_service, "build_company_analysis",
                        lambda prior, ex, sym: _result(False, summary="first"))
    _exchange(session, "How is NMB?", "ok")
    compile_company_analysis(str(session.id))
    rows = CompanyAnalysisEntry.objects.filter(user=session.user, symbol="NMB")
    assert rows.count() == 1
    assert rows.first().summary == "first"


def test_material_change_creates_second_entry(session, nmb, monkeypatch):
    monkeypatch.setattr(summary_service, "build_company_analysis",
                        lambda prior, ex, sym: _result(True, summary="changed", stance="bearish"))
    _exchange(session, "NMB first", "a")
    compile_company_analysis(str(session.id))
    _exchange(session, "NMB again", "b")
    compile_company_analysis(str(session.id))
    rows = CompanyAnalysisEntry.objects.filter(user=session.user, symbol="NMB").order_by("-created_at")
    assert rows.count() == 2
    assert rows.first().stance == "bearish"


def test_non_material_change_updates_latest_in_place(session, nmb, monkeypatch):
    monkeypatch.setattr(summary_service, "build_company_analysis",
                        lambda prior, ex, sym: _result(False, summary="refined", stance="neutral"))
    _exchange(session, "NMB first", "a")
    compile_company_analysis(str(session.id))
    _exchange(session, "NMB again", "b")
    compile_company_analysis(str(session.id))
    rows = CompanyAnalysisEntry.objects.filter(user=session.user, symbol="NMB")
    assert rows.count() == 1
    assert rows.first().summary == "refined"


def test_idempotent_for_same_message(session, nmb, monkeypatch):
    calls = []
    monkeypatch.setattr(summary_service, "build_company_analysis",
                        lambda prior, ex, sym: calls.append(sym) or _result(False))
    _exchange(session, "NMB?", "ok")
    compile_company_analysis(str(session.id))
    compile_company_analysis(str(session.id))
    assert calls == ["NMB"]


def test_detects_off_user_message_only(session, monkeypatch):
    Company.objects.create(symbol="EBL", name="Everest Bank", status="A")
    calls = []
    monkeypatch.setattr(summary_service, "build_company_analysis",
                        lambda prior, ex, sym: calls.append(sym) or _result(False))
    _exchange(session, "Top gainers?", "EBL and ADBL rose.")
    compile_company_analysis(str(session.id))
    assert calls == []


def test_swallows_build_errors(session, nmb, monkeypatch):
    def boom(prior, ex, sym):
        raise RuntimeError("model down")
    monkeypatch.setattr(summary_service, "build_company_analysis", boom)
    _exchange(session, "NMB?", "ok")
    compile_company_analysis(str(session.id))
    assert CompanyAnalysisEntry.objects.filter(symbol="NMB").count() == 0


def test_missing_session_is_noop(db):
    assert compile_company_analysis(str(uuid.uuid4())) is None
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest chat/tests/test_company_analysis_task.py -v`
Expected: FAIL — `ImportError: cannot import name 'compile_company_analysis'`.

- [ ] **Step 3: Rewrite the task**

In `backend/chat/tasks.py`, replace the `_fold_company_summary` function and the `compile_company_summaries` task (keep `_tracked_symbols` and the module `log` as-is) with:

```python
def _fold_company_analysis(user, symbol: str, exchange, latest_message) -> None:
    """Fold the newest exchange into the user's analysis timeline for one company.

    Creates a new entry on first mention or AI-judged material change; otherwise
    refines the latest entry in place. Idempotent via the latest entry's source."""
    from chat.models import CompanyAnalysisEntry
    from chat import summary_service

    prior = (
        CompanyAnalysisEntry.objects.filter(user=user, symbol=symbol)
        .order_by("-created_at")
        .first()
    )
    if prior is not None and prior.source_message_id == latest_message.id:
        return
    result = summary_service.build_company_analysis(prior, [exchange], symbol)
    if prior is None or result.materially_changed:
        CompanyAnalysisEntry.objects.create(
            user=user, symbol=symbol, summary=result.summary, stance=result.stance,
            aspect=result.aspect, change_note=result.change_note, source_message=latest_message,
        )
        return
    prior.summary = result.summary
    prior.stance = result.stance
    prior.aspect = result.aspect
    prior.change_note = result.change_note
    prior.source_message = latest_message
    prior.save(update_fields=[
        "summary", "stance", "aspect", "change_note", "source_message", "updated_at",
    ])


@shared_task(name="chat.compile_company_analysis")
def compile_company_analysis(session_id: str) -> None:
    """Update each active ticker's analysis timeline from the newest chat turn."""
    from chat.models import ChatSession, ChatMessage
    from chat.history import recent_exchanges

    try:
        session = ChatSession.objects.get(id=session_id)
    except ChatSession.DoesNotExist:
        return None

    exchanges = recent_exchanges(session, hops=1)
    # The latest assistant message is the close of exchanges[-1]; it is the
    # idempotency key (source_message) guarding the fold below.
    latest_message = (
        session.messages.filter(role=ChatMessage.ROLE_ASSISTANT).order_by("created_at").last()
    )
    if not exchanges or latest_message is None:
        return None

    exchange = exchanges[-1]
    for symbol in _tracked_symbols(exchange.user_text):
        try:
            _fold_company_analysis(session.user, symbol, exchange, latest_message)
        except Exception:  # pylint: disable=broad-except
            log.exception("company-analysis fold failed for %s / %s", session_id, symbol)
    return None
```

- [ ] **Step 4: Update the enqueue**

In `backend/chat/streaming.py`, change the post-turn enqueue block to:

```python
    try:
        from .tasks import update_session_summary, compile_company_analysis
        update_session_summary.delay(str(session.id))
        compile_company_analysis.delay(str(session.id))
    except Exception:  # pylint: disable=broad-except
        log.exception("failed to enqueue post-turn summary updates")
```

- [ ] **Step 5: Remove the dead `build_company_summary` path**

In `backend/chat/summary_service.py`, delete the now-unused `COMPANY_SUMMARY_SYSTEM` constant, `_company_summary_prompt` function, and `build_company_summary` function (they are no longer referenced — `compile_company_analysis` uses `build_company_analysis`). Keep `MAX_COMPANY_SUMMARY_CHARS` (still used by `_parse_analysis`), `build_summary` (session summaries — unrelated), and everything else.

Then delete the obsolete test files:

```bash
git rm backend/chat/tests/test_company_summary_task.py backend/chat/tests/test_company_summary_service.py
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd backend && pytest chat/tests/test_company_analysis_task.py chat/tests/test_company_analysis_service.py chat/tests/test_summary_service.py chat/tests/test_summary_task.py chat/tests/test_company_analysis_model.py -v`
Expected: PASS (new task tests + service tests + session-summary tests all green; no import errors for removed symbols).

- [ ] **Step 7: Commit**

```bash
git add backend/chat/tasks.py backend/chat/streaming.py backend/chat/summary_service.py backend/chat/tests/test_company_analysis_task.py
git commit -m "feat(chat): write analysis timeline entries from chat turns"
```

---

## Task 4: API — repoint latest endpoint + add timeline endpoint

**Files:**
- Modify: `backend/stocks/views/market/company_chat_summary.py`
- Create: `backend/stocks/views/market/company_analysis_timeline.py`
- Modify: `backend/stocks/views/market/__init__.py`
- Modify: `backend/stocks/urls.py`
- Test: replace contents of `backend/stocks/tests/test_company_chat_summary_api.py`

- [ ] **Step 1: Write the failing tests**

Replace the entire contents of `backend/stocks/tests/test_company_chat_summary_api.py` with:

```python
import pytest
from django.contrib.auth.models import User

from chat.models import CompanyAnalysisEntry


@pytest.fixture
def other_user(db):
    return User.objects.create_user(username="eve", password="pw")


@pytest.fixture
def auth_user(api_client, create_user):
    user = create_user(username="testuser", password="password")
    api_client.force_authenticate(user=user)
    return api_client, user


# --- latest endpoint: /api/stocks/company-summary/<ticker>/ ---

def test_latest_returns_newest_entry(auth_user, db):
    client, user = auth_user
    CompanyAnalysisEntry.objects.create(user=user, symbol="NMB", summary="old", stance="neutral")
    CompanyAnalysisEntry.objects.create(user=user, symbol="NMB", summary="new", stance="bullish", aspect="fundamental")
    res = client.get("/api/stocks/company-summary/NMB/")
    assert res.status_code == 200
    assert res.data["summary"] == "new"
    assert res.data["stance"] == "bullish"
    assert res.data["aspect"] == "fundamental"
    assert res.data["symbol"] == "NMB"


def test_latest_204_when_none(auth_user, db):
    client, _ = auth_user
    res = client.get("/api/stocks/company-summary/ADBL/")
    assert res.status_code == 204


def test_latest_lowercase_normalised(auth_user, db):
    client, user = auth_user
    CompanyAnalysisEntry.objects.create(user=user, symbol="NMB", summary="x")
    res = client.get("/api/stocks/company-summary/nmb/")
    assert res.status_code == 200
    assert res.data["symbol"] == "NMB"


def test_latest_does_not_leak_other_user(auth_user, other_user, db):
    client, _ = auth_user
    CompanyAnalysisEntry.objects.create(user=other_user, symbol="NMB", summary="eve")
    res = client.get("/api/stocks/company-summary/NMB/")
    assert res.status_code == 204


# --- timeline endpoint: /api/stocks/company-analysis/<ticker>/ ---

def test_timeline_returns_series_newest_first(auth_user, db):
    client, user = auth_user
    CompanyAnalysisEntry.objects.create(user=user, symbol="NMB", summary="one", change_note="n1")
    CompanyAnalysisEntry.objects.create(user=user, symbol="NMB", summary="two", change_note="n2")
    res = client.get("/api/stocks/company-analysis/NMB/")
    assert res.status_code == 200
    assert [e["summary"] for e in res.data] == ["two", "one"]
    assert {"summary", "stance", "aspect", "change_note", "created_at"} <= set(res.data[0].keys())


def test_timeline_empty_list_when_none(auth_user, db):
    client, _ = auth_user
    res = client.get("/api/stocks/company-analysis/ZZZZ/")
    assert res.status_code == 200
    assert res.data == []


def test_timeline_does_not_leak_other_user(auth_user, other_user, db):
    client, _ = auth_user
    CompanyAnalysisEntry.objects.create(user=other_user, symbol="NMB", summary="eve")
    res = client.get("/api/stocks/company-analysis/NMB/")
    assert res.status_code == 200
    assert res.data == []


def test_endpoints_require_auth(api_client, db):
    assert api_client.get("/api/stocks/company-summary/NMB/").status_code in (401, 403)
    assert api_client.get("/api/stocks/company-analysis/NMB/").status_code in (401, 403)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && pytest stocks/tests/test_company_chat_summary_api.py -v`
Expected: FAIL — latest tests fail (still query the old model / missing stance), timeline tests 404.

- [ ] **Step 3: Repoint the latest endpoint**

Replace the body of `backend/stocks/views/market/company_chat_summary.py` with:

```python
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def company_chat_summary(request, ticker):
    """Return the signed-in user's latest AI analysis entry for one ticker.

    204 when the user has no (non-blank) analysis for that company.
    """
    from chat.models import CompanyAnalysisEntry

    symbol = ticker.upper()
    row = (
        CompanyAnalysisEntry.objects.filter(user=request.user, symbol=symbol)
        .order_by("-created_at")
        .first()
    )
    if row is None or not (row.summary or "").strip():
        return Response(status=status.HTTP_204_NO_CONTENT)
    return Response({
        "symbol": symbol,
        "summary": row.summary,
        "stance": row.stance,
        "aspect": row.aspect,
        "updated_at": row.updated_at,
    })
```

- [ ] **Step 4: Create the timeline endpoint**

Create `backend/stocks/views/market/company_analysis_timeline.py`:

```python
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def company_analysis_timeline(request, ticker):
    """Return the signed-in user's AI analysis timeline for one ticker, newest first."""
    from chat.models import CompanyAnalysisEntry

    symbol = ticker.upper()
    rows = CompanyAnalysisEntry.objects.filter(user=request.user, symbol=symbol).order_by("-created_at")
    return Response([
        {
            "summary": row.summary,
            "stance": row.stance,
            "aspect": row.aspect,
            "change_note": row.change_note,
            "created_at": row.created_at,
        }
        for row in rows
    ])
```

- [ ] **Step 5: Export the view and register the route**

In `backend/stocks/views/market/__init__.py`, add alongside the existing `from .company_chat_summary import company_chat_summary`:

```python
from .company_analysis_timeline import company_analysis_timeline
```

In `backend/stocks/urls.py`, add next to the existing `company-summary` path:

```python
    path('company-analysis/<str:ticker>/', market.company_analysis_timeline, name='company_analysis_timeline'),
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd backend && pytest stocks/tests/test_company_chat_summary_api.py -v`
Expected: PASS (8 tests).

- [ ] **Step 7: Commit**

```bash
git add backend/stocks/views/market/company_chat_summary.py backend/stocks/views/market/company_analysis_timeline.py backend/stocks/views/market/__init__.py backend/stocks/urls.py backend/stocks/tests/test_company_chat_summary_api.py
git commit -m "feat(stocks): latest-entry + analysis-timeline endpoints"
```

---

## Task 5: Data migration + remove `CompanyChatSummary`

Seeds one `CompanyAnalysisEntry` per existing `CompanyChatSummary`, then deletes the old model. The per-row transform is a pure, unit-tested helper; the DB copy is verified manually on the docker DB at deploy.

**Files:**
- Create: `backend/chat/analysis_seed.py`
- Create: `backend/chat/migrations/0012_seed_analysis_entries.py`
- Modify: `backend/chat/models.py` (remove `CompanyChatSummary`)
- Create: `backend/chat/migrations/0013_delete_companychatsummary.py` (generated)
- Test: `backend/chat/tests/test_analysis_seed.py` (create)
- Remove: `backend/chat/tests/test_company_summary_model.py`

- [ ] **Step 1: Write the failing test for the seed helper**

Create `backend/chat/tests/test_analysis_seed.py`:

```python
from chat.analysis_seed import seed_entry_fields, SEED_CHANGE_NOTE


def test_returns_fields_for_non_blank_summary():
    fields = seed_entry_fields("Strong bank, accumulating.")
    assert fields == {
        "summary": "Strong bank, accumulating.",
        "stance": "neutral",
        "aspect": "both",
        "change_note": SEED_CHANGE_NOTE,
    }


def test_returns_none_for_blank_summary():
    assert seed_entry_fields("") is None
    assert seed_entry_fields("   ") is None
    assert seed_entry_fields(None) is None
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest chat/tests/test_analysis_seed.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'chat.analysis_seed'`.

- [ ] **Step 3: Create the pure seed helper**

Create `backend/chat/analysis_seed.py`:

```python
"""Pure transform used by the 0012 data migration to seed analysis-timeline
entries from the legacy CompanyChatSummary rows. Kept importable and DB-free so
the seeding rule is unit-tested."""
from __future__ import annotations

SEED_CHANGE_NOTE = "Imported from earlier notes"


def seed_entry_fields(summary: str | None) -> dict | None:
    """Return scalar fields for a seed CompanyAnalysisEntry, or None to skip a
    blank summary. The caller supplies user, symbol, source_message, created_at."""
    if not (summary or "").strip():
        return None
    return {
        "summary": summary,
        "stance": "neutral",
        "aspect": "both",
        "change_note": SEED_CHANGE_NOTE,
    }
```

- [ ] **Step 4: Run the helper test**

Run: `cd backend && pytest chat/tests/test_analysis_seed.py -v`
Expected: PASS (2 tests).

- [ ] **Step 5: Write the data migration**

Create `backend/chat/migrations/0012_seed_analysis_entries.py`:

```python
from django.db import migrations


def seed_entries(apps, schema_editor):
    from chat.analysis_seed import seed_entry_fields

    CompanyChatSummary = apps.get_model("chat", "CompanyChatSummary")
    CompanyAnalysisEntry = apps.get_model("chat", "CompanyAnalysisEntry")

    for summary_row in CompanyChatSummary.objects.all().iterator():
        fields = seed_entry_fields(summary_row.summary)
        if fields is None:
            continue
        entry = CompanyAnalysisEntry.objects.create(
            user_id=summary_row.user_id,
            symbol=summary_row.symbol,
            source_message_id=summary_row.last_message_id,
            **fields,
        )
        # Preserve the original timeline position (created_at is auto_now_add).
        CompanyAnalysisEntry.objects.filter(pk=entry.pk).update(
            created_at=summary_row.created_at
        )


class Migration(migrations.Migration):
    dependencies = [("chat", "0011_companyanalysisentry")]
    operations = [migrations.RunPython(seed_entries, migrations.RunPython.noop)]
```

- [ ] **Step 6: Remove the old model and generate the delete migration**

In `backend/chat/models.py`, delete the entire `CompanyChatSummary` class.

Then delete its obsolete test:

```bash
git rm backend/chat/tests/test_company_summary_model.py
```

Generate the delete migration:

Run: `cd backend && python manage.py makemigrations chat`
Expected: creates `chat/migrations/0013_delete_companychatsummary.py` (depends on `0012_seed_analysis_entries`, contains a single `DeleteModel`). If makemigrations wants to order `0013` before `0012`, it will not — `0012` exists on disk so `0013` depends on it.

- [ ] **Step 7: Apply migrations and run the full feature suite**

Run: `cd backend && python manage.py migrate chat`
Expected: `0011`, `0012`, `0013` all apply OK on the local/test DB.

Run: `cd backend && pytest chat/tests/test_company_analysis_model.py chat/tests/test_company_analysis_service.py chat/tests/test_company_analysis_task.py chat/tests/test_analysis_seed.py stocks/tests/test_company_chat_summary_api.py -v`
Expected: PASS (no references to the removed `CompanyChatSummary` remain).

- [ ] **Step 8: Commit**

```bash
git add backend/chat/analysis_seed.py backend/chat/migrations/0012_seed_analysis_entries.py backend/chat/migrations/0013_delete_companychatsummary.py backend/chat/models.py backend/chat/tests/test_analysis_seed.py
git commit -m "feat(chat): seed timeline from CompanyChatSummary, then remove it"
```

---

## Task 6: Frontend stance/aspect badges + card badge

**Files:**
- Create: `frontend/src/components/ticker/stanceBadge.tsx`
- Modify: `frontend/src/components/ticker/ChatNotesCard.tsx`

- [ ] **Step 1: Create the shared badges**

Create `frontend/src/components/ticker/stanceBadge.tsx`:

```tsx
const STANCE_STYLES: Record<string, string> = {
    bullish: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
    bearish: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
    neutral: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
};

const ASPECT_LABELS: Record<string, string> = {
    technical: 'Technical',
    fundamental: 'Fundamental',
    both: 'Technical + fundamental',
};

function pill(className: string, label: string) {
    return (
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${className}`}>
            {label}
        </span>
    );
}

export function StanceBadge({ stance }: { stance: string }) {
    const style = STANCE_STYLES[stance] ?? STANCE_STYLES.neutral;
    const label = stance ? stance[0].toUpperCase() + stance.slice(1) : 'Neutral';
    return pill(style, label);
}

export function AspectBadge({ aspect }: { aspect: string }) {
    return pill('bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300', ASPECT_LABELS[aspect] ?? 'Both');
}
```

- [ ] **Step 2: Add stance/aspect to `ChatNotesCard`**

Edit `frontend/src/components/ticker/ChatNotesCard.tsx` — extend the interface and render the badge. Replace the file with:

```tsx
'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { formatDistanceToNow } from 'date-fns';
import { MarkdownComponents } from '@/components/chat/markdownComponents';
import { Card } from '@/components/ui/card';
import { StanceBadge } from '@/components/ticker/stanceBadge';

export interface ChatNotes {
    symbol: string;
    summary: string;
    stance: string;
    aspect: string;
    updated_at: string;
}

export function ChatNotesCard({ notes }: { notes: ChatNotes | null }) {
    if (!notes || !notes.summary?.trim()) return null;

    return (
        <Card className="p-6 space-y-3">
            <div className="flex items-baseline justify-between gap-4">
                <div className="flex items-center gap-2">
                    <h3 className="text-base font-medium text-foreground">
                        Your AI notes on {notes.symbol}
                    </h3>
                    <StanceBadge stance={notes.stance} />
                </div>
                <span className="text-xs text-muted-foreground">
                    Updated {formatDistanceToNow(new Date(notes.updated_at), { addSuffix: true })}
                </span>
            </div>
            <div className="prose prose-sm max-w-none text-muted-foreground">
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={MarkdownComponents}>
                    {notes.summary}
                </ReactMarkdown>
            </div>
        </Card>
    );
}
```

- [ ] **Step 3: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no new errors in `stanceBadge.tsx` or `ChatNotesCard.tsx`. (Pre-existing unrelated errors in test files / `PlanSidebar.tsx` / `ThemeAwareECharts.tsx` / `TradePlanDrawer.tsx` are not your concern.)

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/ticker/stanceBadge.tsx frontend/src/components/ticker/ChatNotesCard.tsx
git commit -m "feat(ticker): stance/aspect badges on AI notes card"
```

---

## Task 7: `CompanyAnalysisTimeline` component

**Files:**
- Create: `frontend/src/components/ticker/CompanyAnalysisTimeline.tsx`

- [ ] **Step 1: Create the component**

Create `frontend/src/components/ticker/CompanyAnalysisTimeline.tsx`:

```tsx
'use client';

import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { format } from 'date-fns';
import { MarkdownComponents } from '@/components/chat/markdownComponents';
import { StanceBadge, AspectBadge } from '@/components/ticker/stanceBadge';

export interface AnalysisEntry {
    summary: string;
    stance: string;
    aspect: string;
    change_note: string;
    created_at: string;
}

function TimelineRow({ entry }: { entry: AnalysisEntry }) {
    const [open, setOpen] = useState(false);
    return (
        <li className="border-l-2 border-slate-200 dark:border-slate-700 pl-4 pb-6 relative">
            <span className="absolute -left-[5px] top-1.5 h-2 w-2 rounded-full bg-slate-400" />
            <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted-foreground">{format(new Date(entry.created_at), 'd MMM yyyy')}</span>
                <StanceBadge stance={entry.stance} />
                <AspectBadge aspect={entry.aspect} />
            </div>
            {entry.change_note && (
                <p className="mt-1 text-sm font-medium text-foreground">{entry.change_note}</p>
            )}
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="mt-1 text-xs text-muted-foreground underline-offset-2 hover:underline"
            >
                {open ? 'Hide detail' : 'Show detail'}
            </button>
            {open && (
                <div className="prose prose-sm max-w-none text-muted-foreground mt-2">
                    <ReactMarkdown remarkPlugins={[remarkGfm]} components={MarkdownComponents}>
                        {entry.summary}
                    </ReactMarkdown>
                </div>
            )}
        </li>
    );
}

export function CompanyAnalysisTimeline({ entries }: { entries: AnalysisEntry[] }) {
    if (!entries || entries.length === 0) {
        return (
            <p className="text-sm text-muted-foreground py-8">
                No AI analysis yet — discuss this stock in chat to build one.
            </p>
        );
    }
    return (
        <ul className="mt-2">
            {entries.map((entry, i) => (
                <TimelineRow key={`${entry.created_at}-${i}`} entry={entry} />
            ))}
        </ul>
    );
}
```

- [ ] **Step 2: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no new errors in `CompanyAnalysisTimeline.tsx`.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/ticker/CompanyAnalysisTimeline.tsx
git commit -m "feat(ticker): add CompanyAnalysisTimeline component"
```

---

## Task 8: Wire the timeline tab into the ticker page

**Files:**
- Modify: `frontend/src/app/(authenticated)/ticker/[ticker]/page.tsx`

Locate anchors by content (line numbers may shift): the `ChatNotes` import (~line 46), the `chatNotes` state (~line 145), the chat-notes fetch in `fetchData` (~line 243), the `<TabsList>` block with `<TabsTrigger>` items (~line 712), and the last `<TabsContent>` (the `accumulation` one, ~line 1051).

- [ ] **Step 1: Import the timeline component and type**

Near the `ChatNotesCard` import (~line 46), add:

```tsx
import { CompanyAnalysisTimeline, AnalysisEntry } from '@/components/ticker/CompanyAnalysisTimeline';
```

- [ ] **Step 2: Add timeline state**

Next to `const [chatNotes, setChatNotes] = useState<ChatNotes | null>(null);` add:

```tsx
const [analysisTimeline, setAnalysisTimeline] = useState<AnalysisEntry[]>([]);
```

- [ ] **Step 3: Fetch the timeline in `fetchData`**

Right after the existing chat-notes fetch block (the `try { const notesRes = await api.get(\`/api/stocks/company-summary/${ticker}/\`); ... } catch`), add:

```tsx
                // Fetch the AI analysis timeline for this ticker
                try {
                    const tlRes = await api.get(`/api/stocks/company-analysis/${ticker}/`);
                    setAnalysisTimeline(Array.isArray(tlRes.data) ? tlRes.data : []);
                } catch (tErr) { console.error("Analysis timeline fetch failed", tErr); }
```

- [ ] **Step 4: Add the tab trigger**

In the `<TabsList>` block, add a new trigger after the `fundamentals` trigger (match the existing trigger className exactly):

```tsx
                                            <TabsTrigger value="ai_analysis" className="rounded-lg px-4 text-xs font-bold data-[state=active]:bg-white dark:data-[state=active]:bg-slate-800 data-[state=active]:shadow-sm transition-all">AI Analysis</TabsTrigger>
```

(The sibling tab labels use Title Case — "Price Action", "Technical Analysis" — so "AI Analysis" matches them.)

- [ ] **Step 5: Add the tab content**

After the last existing `<TabsContent>` (the `accumulation` one) and before the `</Tabs>` close, add:

```tsx
                                <TabsContent value="ai_analysis" className="mt-0">
                                    <CompanyAnalysisTimeline entries={analysisTimeline} />
                                </TabsContent>
```

- [ ] **Step 6: Type-check / build**

Run: `cd frontend && npx tsc --noEmit`
Expected: no new type errors from `page.tsx`.

- [ ] **Step 7: Commit**

```bash
git add "frontend/src/app/(authenticated)/ticker/[ticker]/page.tsx"
git commit -m "feat(ticker): add AI analysis timeline tab"
```

---

## Deployment notes

- **Migrate:** `docker-compose exec backend python manage.py migrate chat` — applies `0011`, the `0012` seed (legacy summaries → timeline entries), and `0013` (drops `CompanyChatSummary`). Verify on the docker DB that existing summaries became entries.
- **Celery:** restart the worker (`docker compose restart celery`) — the task renamed to `chat.compile_company_analysis`.
- **Frontend:** rebuild the image + recreate (`docker compose build frontend && docker compose up -d frontend`) + hard refresh.
- Backend code is volume-mounted, so no backend image rebuild needed.

---

## Self-review notes

- **Spec coverage:** model (T1); structured service + defensive parse (T2); material-change create-vs-refine + idempotency + detection (T3); enqueue (T3); latest + timeline endpoints incl. user isolation (T4); data-preserving migration + model removal (T5); card stance badge (T6); timeline component with stance/aspect/change-note + empty state (T7); tab wiring (T8). Migration test is the pure `seed_entry_fields` helper (T5) with the DB copy verified at deploy — documented deviation from a full executor test (brittle, low value for a one-shot seed).
- **Type/name consistency:** `CompanyAnalysisEntry`, `CompanyAnalysisResult(materially_changed, summary, stance, aspect, change_note)`, `build_company_analysis`, `_parse_analysis`, `_fold_company_analysis`, `compile_company_analysis`, `seed_entry_fields`, `company_analysis_timeline`, and the frontend `AnalysisEntry`/`ChatNotes`/`StanceBadge`/`AspectBadge`/`CompanyAnalysisTimeline` names are used identically across tasks.
- **Green-at-each-commit ordering:** new model added beside old (T1) → service additive (T2) → task switches + old summary path & tests removed together (T3) → views switch + api tests replaced (T4) → model deleted only after no code references it (T5).
- **Constants/strings:** stance/aspect canonical values live on the model; the service validates against them; `MAX_COMPANY_SUMMARY_CHARS` / `MAX_CHANGE_NOTE_CHARS` / `SEED_CHANGE_NOTE` are named.
```
