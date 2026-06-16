# Per-company AI chat summary on the ticker page — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show, on each company's ticker page, one rolling Haiku-generated text summarising what the signed-in user has discussed about that company in chat — built and updated automatically after each relevant chat turn.

**Architecture:** A new per-`(user, symbol)` model `CompanyChatSummary` holds the rolling text. After every chat turn completes, the same post-turn hook that refreshes the session summary also enqueues a Celery task that (a) detects which NEPSE tickers the user's message named, (b) keeps only symbols that exist as active companies, and (c) folds the newest exchange into each ticker's stored summary via a one-shot Haiku call. A user-scoped DRF endpoint under `/api/stocks/` serves the text, which the ticker page renders in a card — hidden when empty.

**Tech Stack:** Django 5.2 + DRF, Celery, `claude_agent_sdk` (Haiku, `claude-haiku-4-5`), pytest; Next.js 16 / React 19, `react-markdown` + `remark-gfm`, `date-fns`.

**Spec:** `docs/superpowers/specs/2026-06-16-ticker-company-chat-summary-design.md`

---

## File structure

**Backend**
- Modify `backend/chat/models.py` — add `CompanyChatSummary`.
- Create `backend/chat/migrations/0010_companychatsummary.py` — generated migration.
- Modify `backend/chat/history.py` — add pure `extract_tickers(text)`.
- Modify `backend/chat/summary_service.py` — parametrise `_run_summary` with a system prompt; add company prompt + `build_company_summary` + constants.
- Modify `backend/chat/tasks.py` — add `compile_company_summaries` task + small helpers.
- Modify `backend/chat/streaming.py` — enqueue the new task alongside `update_session_summary`.
- Create `backend/stocks/views/market/company_chat_summary.py` — user-scoped GET view.
- Modify `backend/stocks/views/market/__init__.py` — export the view.
- Modify `backend/stocks/urls.py` — register the route.
- Create `backend/chat/tests/conftest.py` — Company table + user/client fixtures for chat tests.
- Create `backend/chat/tests/test_extract_tickers.py`
- Create `backend/chat/tests/test_company_summary_service.py`
- Create `backend/chat/tests/test_company_summary_task.py`
- Create `backend/stocks/tests/test_company_chat_summary_api.py`

**Frontend**
- Create `frontend/src/components/ticker/ChatNotesCard.tsx` — the AI-notes card.
- Modify `frontend/src/app/(authenticated)/ticker/[ticker]/page.tsx` — state, fetch, render.

**Design note (deviation from spec):** the spec described enqueuing one task per ticker (`compile_company_summary(user_id, symbol, message_id)`). This plan consolidates detection + per-symbol folding into a single `compile_company_summaries(session_id)` task — it mirrors `update_session_summary` exactly (which also takes only `session_id`), avoids threading message ids through the async streaming layer, and keeps idempotency via each row's `last_message`. Behaviour is identical.

---

## Task 1: `CompanyChatSummary` model + migration

**Files:**
- Modify: `backend/chat/models.py`
- Create: `backend/chat/migrations/0010_companychatsummary.py` (generated)
- Test: `backend/chat/tests/test_company_summary_model.py` (create)

- [ ] **Step 1: Write the failing test**

Create `backend/chat/tests/test_company_summary_model.py`:

```python
import pytest
from django.contrib.auth import get_user_model
from django.db import IntegrityError

from chat.models import CompanyChatSummary

User = get_user_model()


@pytest.fixture
def user(db):
    return User.objects.create(username="alice")


def test_defaults_and_str(user):
    row = CompanyChatSummary.objects.create(user=user, symbol="NMB")
    assert row.summary == ""
    assert row.last_message is None
    assert "NMB" in str(row)


def test_user_symbol_is_unique(user):
    CompanyChatSummary.objects.create(user=user, symbol="NMB")
    with pytest.raises(IntegrityError):
        CompanyChatSummary.objects.create(user=user, symbol="NMB")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest chat/tests/test_company_summary_model.py -v`
Expected: FAIL — `ImportError: cannot import name 'CompanyChatSummary'`.

- [ ] **Step 3: Add the model**

Append to `backend/chat/models.py` (after the existing model classes):

```python
class CompanyChatSummary(models.Model):
    """A rolling, per-user AI summary of everything the user has discussed about
    one NEPSE company in chat. Surfaced on that company's ticker page."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="company_chat_summaries",
    )
    symbol = models.CharField(max_length=20, db_index=True)
    summary = models.TextField(blank=True, default="")
    last_message = models.ForeignKey(
        "ChatMessage",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["user", "symbol"], name="uniq_user_symbol_chat_summary"
            )
        ]

    def __str__(self) -> str:
        return f"{self.user_id}:{self.symbol}"
```

Confirm the top of `backend/chat/models.py` already imports `settings`. If `from django.conf import settings` is absent, add it next to the other imports. (Check how existing FKs to the user model are declared — match that style; if they use `settings.AUTH_USER_MODEL`, keep the above; if they import `User` via `get_user_model()`, mirror that instead.)

- [ ] **Step 4: Generate the migration**

Run: `cd backend && python manage.py makemigrations chat`
Expected: creates `chat/migrations/0010_companychatsummary.py` (depends on `0009_chatsession_summary`).

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && pytest chat/tests/test_company_summary_model.py -v`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add backend/chat/models.py backend/chat/migrations/0010_companychatsummary.py backend/chat/tests/test_company_summary_model.py
git commit -m "feat(chat): add CompanyChatSummary model"
```

---

## Task 2: `extract_tickers` pure helper

Adds candidate-ticker extraction (regex + stopwords, no DB) to `history.py`, reusing the existing `_TICKER` pattern and `_TICKER_STOPWORDS`.

**Files:**
- Modify: `backend/chat/history.py`
- Test: `backend/chat/tests/test_extract_tickers.py` (create)

- [ ] **Step 1: Write the failing test**

Create `backend/chat/tests/test_extract_tickers.py`:

```python
from chat.history import extract_tickers


def test_extracts_uppercase_symbols():
    assert extract_tickers("What about NMB and ADBL?") == ["NMB", "ADBL"]


def test_drops_metric_acronym_stopwords():
    assert extract_tickers("Show me the RSI and MACD for EBL") == ["EBL"]


def test_dedupes_preserving_first_order():
    assert extract_tickers("NMB is good. Buy NMB now, vs ADBL.") == ["NMB", "ADBL"]


def test_ignores_lowercase_and_short_tokens():
    assert extract_tickers("is it ok to buy at npr 100") == []


def test_empty_or_none_text():
    assert extract_tickers("") == []
    assert extract_tickers(None) == []
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest chat/tests/test_extract_tickers.py -v`
Expected: FAIL — `ImportError: cannot import name 'extract_tickers'`.

- [ ] **Step 3: Add the helper**

In `backend/chat/history.py`, add after `_names_fresh_ticker` (around line 88):

```python
def extract_tickers(text: str) -> list[str]:
    """Return candidate NEPSE symbols named in `text`, in first-seen order.

    Pure: regex + stopword filtering only, no DB. Callers validate against the
    Company table before acting on these.
    """
    seen: list[str] = []
    for tok in _TICKER.findall(text or ""):
        if tok in _TICKER_STOPWORDS or tok in seen:
            continue
        seen.append(tok)
    return seen
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && pytest chat/tests/test_extract_tickers.py -v`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/chat/history.py backend/chat/tests/test_extract_tickers.py
git commit -m "feat(chat): add pure extract_tickers helper"
```

---

## Task 3: `build_company_summary` Haiku service

Parametrises `_run_summary` with a system prompt (DRY) and adds a company-scoped summary builder that reuses the same SDK call path.

**Files:**
- Modify: `backend/chat/summary_service.py`
- Test: `backend/chat/tests/test_company_summary_service.py` (create)

- [ ] **Step 1: Write the failing test**

Create `backend/chat/tests/test_company_summary_service.py`:

```python
from chat import summary_service
from chat.history import Exchange


def test_build_company_summary_folds_exchange(monkeypatch):
    captured = {}

    async def fake_run(prompt, system):
        captured["prompt"] = prompt
        captured["system"] = system
        return "NMB notes updated"

    monkeypatch.setattr(summary_service, "_run_summary", fake_run)
    out = summary_service.build_company_summary(
        "", [Exchange("How is NMB doing?", "Strong fundamentals.")], "NMB"
    )
    assert out == "NMB notes updated"
    assert "NMB" in captured["prompt"]
    assert "How is NMB doing?" in captured["prompt"]


def test_build_company_summary_falls_back_on_empty(monkeypatch):
    async def fake_run(prompt, system):
        return "   "

    monkeypatch.setattr(summary_service, "_run_summary", fake_run)
    out = summary_service.build_company_summary(
        "prior NMB notes", [Exchange("q", "a")], "NMB"
    )
    assert out == "prior NMB notes"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest chat/tests/test_company_summary_service.py -v`
Expected: FAIL — `AttributeError: module 'chat.summary_service' has no attribute 'build_company_summary'`.

- [ ] **Step 3: Parametrise `_run_summary` and add the builder**

In `backend/chat/summary_service.py`:

(a) Change the `_run_summary` signature to accept the system prompt, and update the existing `build_summary` call site.

Replace the current `async def _run_summary(prompt: str) -> str:` line and its `system_prompt=SUMMARY_SYSTEM,` option:

```python
async def _run_summary(prompt: str, system: str) -> str:
    from claude_agent_sdk import (
        AssistantMessage, ClaudeAgentOptions, ClaudeSDKClient, TextBlock,
    )
    from chat.agent import _sdk_env

    options = ClaudeAgentOptions(
        system_prompt=system,
        model=SUMMARY_MODEL,
        tools=[],
        allowed_tools=[],
        permission_mode="bypassPermissions",
        setting_sources=[],
        max_turns=1,
        env=_sdk_env(),
    )
    chunks: list[str] = []
    async with ClaudeSDKClient(options=options) as client:
        await client.query(prompt)
        async for message in client.receive_response():
            if isinstance(message, AssistantMessage):
                for block in message.content:
                    if isinstance(block, TextBlock):
                        chunks.append(block.text)
    return "".join(chunks)
```

In `build_summary`, change the call to pass the system prompt:

```python
def build_summary(prior_summary: str, exchanges) -> str:
    """Return an updated rolling summary. Falls back to the prior summary on empty output."""
    prompt = _summary_prompt(prior_summary, exchanges)
    text = asyncio.run(_run_summary(prompt, SUMMARY_SYSTEM))
    updated = text.strip() or (prior_summary or "").strip()
    return updated[:MAX_SUMMARY_CHARS]
```

(b) Append the company-summary constants, prompt, and builder at the end of the file:

```python
MAX_COMPANY_SUMMARY_CHARS = 1200
COMPANY_SUMMARY_SYSTEM = (
    "You maintain a running, company-specific set of notes capturing everything "
    "one user has discussed about a single NEPSE-listed company in chat. Given the "
    "company's ticker, the current notes, and the newest user/assistant exchange, "
    "return updated notes as plain prose (no markdown headers, no preamble). Keep it "
    "under 200 words. Preserve durable facts about this company: the user's theses, "
    "verdicts given, key numbers, risks, and open questions. Ignore content about "
    "other companies and drop pleasantries."
)


def _company_summary_prompt(prior_summary: str, exchanges, symbol: str) -> str:
    prior = prior_summary.strip() or "(no prior notes)"
    return (
        f"Company: {symbol}\n\n"
        "Current notes:\n"
        f"{prior}\n\n"
        "Newest exchange(s):\n"
        f"{format_exchanges(exchanges)}\n\n"
        f"Return the updated notes about {symbol}."
    )


def build_company_summary(prior_summary: str, exchanges, symbol: str) -> str:
    """Return updated per-company notes. Falls back to prior notes on empty output."""
    prompt = _company_summary_prompt(prior_summary, exchanges, symbol)
    text = asyncio.run(_run_summary(prompt, COMPANY_SUMMARY_SYSTEM))
    updated = text.strip() or (prior_summary or "").strip()
    return updated[:MAX_COMPANY_SUMMARY_CHARS]
```

- [ ] **Step 4: Run tests to verify they pass (and existing summary tests still pass)**

Run: `cd backend && pytest chat/tests/test_company_summary_service.py chat/tests/test_summary_task.py -v`
Expected: PASS (new service tests + existing summary-task tests green — the `_run_summary` signature change is internal).

- [ ] **Step 5: Commit**

```bash
git add backend/chat/summary_service.py backend/chat/tests/test_company_summary_service.py
git commit -m "feat(chat): add build_company_summary Haiku service"
```

---

## Task 4: `compile_company_summaries` Celery task

Detects tickers from the newest user message, keeps only active companies, and folds the newest exchange into each company's rolling summary. Idempotent via `last_message`.

**Files:**
- Modify: `backend/chat/tasks.py`
- Create: `backend/chat/tests/conftest.py` (Company table fixture for chat tests)
- Test: `backend/chat/tests/test_company_summary_task.py` (create)

- [ ] **Step 1: Add the Company-table fixture for chat tests**

`Company` is `Meta.managed = False`, so the test DB never creates its table. Create `backend/chat/tests/conftest.py` (mirrors `stocks/tests/conftest.py`):

```python
"""Chat-test fixtures.

Company (stocks.models.market) is Meta.managed = False — its table is never
created by the test runner. Tests here that validate tickers against Company
need the table, so we create it once per session via the schema editor.
"""
import pytest


@pytest.fixture(scope="session")
def django_db_setup(django_db_setup, django_db_blocker):
    from django.db import connection
    from stocks.models.market import Company

    with django_db_blocker.unblock():
        if Company._meta.db_table not in connection.introspection.table_names():
            with connection.schema_editor() as schema_editor:
                schema_editor.create_model(Company)
    yield
```

- [ ] **Step 2: Write the failing test**

Create `backend/chat/tests/test_company_summary_task.py`:

```python
import uuid

import pytest
from django.contrib.auth import get_user_model

from chat import summary_service
from chat.models import ChatSession, ChatMessage, CompanyChatSummary
from chat.tasks import compile_company_summaries
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


def test_creates_summary_for_named_company(session, nmb, monkeypatch):
    monkeypatch.setattr(summary_service, "build_company_summary",
                        lambda prior, ex, sym: f"notes about {sym}")
    _exchange(session, "How is NMB doing?", "Solid quarter.")
    compile_company_summaries(str(session.id))
    row = CompanyChatSummary.objects.get(user=session.user, symbol="NMB")
    assert row.summary == "notes about NMB"
    assert row.last_message is not None


def test_skips_symbols_with_no_company(session, monkeypatch):
    calls = []
    monkeypatch.setattr(summary_service, "build_company_summary",
                        lambda prior, ex, sym: calls.append(sym) or "x")
    _exchange(session, "What about ZZZZ?", "No such company.")  # not in Company table
    compile_company_summaries(str(session.id))
    assert calls == []
    assert CompanyChatSummary.objects.count() == 0


def test_is_idempotent_for_same_message(session, nmb, monkeypatch):
    calls = []
    monkeypatch.setattr(summary_service, "build_company_summary",
                        lambda prior, ex, sym: calls.append(sym) or "notes")
    _exchange(session, "Thoughts on NMB?", "Bullish.")
    compile_company_summaries(str(session.id))
    compile_company_summaries(str(session.id))  # re-run on same newest exchange
    assert calls == ["NMB"]  # second run is a no-op


def test_rolls_in_new_exchange(session, nmb, monkeypatch):
    priors = []
    monkeypatch.setattr(summary_service, "build_company_summary",
                        lambda prior, ex, sym: priors.append(prior) or f"{prior}|new")
    _exchange(session, "NMB first look", "ok")
    compile_company_summaries(str(session.id))
    _exchange(session, "NMB follow up", "still ok")
    compile_company_summaries(str(session.id))
    assert priors == ["", "|new"]  # second fold receives the first summary as prior


def test_detects_off_user_message_not_assistant(session, monkeypatch):
    """A market-wide assistant reply naming many tickers must not create rows."""
    Company.objects.create(symbol="EBL", name="Everest Bank", status="A")
    calls = []
    monkeypatch.setattr(summary_service, "build_company_summary",
                        lambda prior, ex, sym: calls.append(sym) or "x")
    _exchange(session, "Top gainers today?", "EBL, ADBL, NABIL all rose.")
    compile_company_summaries(str(session.id))
    assert calls == []  # EBL appeared only in the assistant reply, not the question


def test_swallows_build_errors(session, nmb, monkeypatch):
    def boom(prior, ex, sym):
        raise RuntimeError("model down")
    monkeypatch.setattr(summary_service, "build_company_summary", boom)
    _exchange(session, "NMB?", "ok")
    compile_company_summaries(str(session.id))  # must not raise
    assert CompanyChatSummary.objects.filter(symbol="NMB").count() == 0


def test_missing_session_is_noop(db):
    assert compile_company_summaries(str(uuid.uuid4())) is None
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd backend && pytest chat/tests/test_company_summary_task.py -v`
Expected: FAIL — `ImportError: cannot import name 'compile_company_summaries'`.

- [ ] **Step 4: Implement the task + helpers**

Append to `backend/chat/tasks.py`:

```python
def _tracked_symbols(text: str) -> list[str]:
    """Candidate tickers in `text` that exist as active companies, first-seen order."""
    from chat.history import extract_tickers
    from stocks.models.market import Company

    candidates = extract_tickers(text)
    if not candidates:
        return []
    existing = set(
        Company.objects.filter(symbol__in=candidates).values_list("symbol", flat=True)
    )
    return [c for c in candidates if c in existing]


def _fold_company_summary(user, symbol: str, exchange, latest_message) -> None:
    """Fold the newest exchange into one company's rolling summary. Idempotent."""
    from chat.models import CompanyChatSummary
    from chat import summary_service

    row, _ = CompanyChatSummary.objects.get_or_create(user=user, symbol=symbol)
    if row.last_message_id == latest_message.id:
        return
    new_summary = summary_service.build_company_summary(row.summary or "", [exchange], symbol)
    row.summary = new_summary
    row.last_message = latest_message
    row.save(update_fields=["summary", "last_message", "updated_at"])


@shared_task(name="chat.compile_company_summaries")
def compile_company_summaries(session_id: str) -> None:
    """Update per-company summaries for every active ticker named in the newest turn."""
    from chat.models import ChatSession, ChatMessage
    from chat.history import recent_exchanges

    try:
        session = ChatSession.objects.get(id=session_id)
    except ChatSession.DoesNotExist:
        return None

    exchanges = recent_exchanges(session, hops=1)
    latest_message = (
        session.messages.filter(role=ChatMessage.ROLE_ASSISTANT).order_by("created_at").last()
    )
    if not exchanges or latest_message is None:
        return None

    exchange = exchanges[-1]
    for symbol in _tracked_symbols(exchange.user_text):
        try:
            _fold_company_summary(session.user, symbol, exchange, latest_message)
        except Exception:  # pylint: disable=broad-except
            log.exception("company-summary fold failed for %s / %s", session_id, symbol)
    return None
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && pytest chat/tests/test_company_summary_task.py -v`
Expected: PASS (7 tests).

- [ ] **Step 6: Commit**

```bash
git add backend/chat/tasks.py backend/chat/tests/conftest.py backend/chat/tests/test_company_summary_task.py
git commit -m "feat(chat): compile per-company chat summaries task"
```

---

## Task 5: Enqueue the task after each chat turn

**Files:**
- Modify: `backend/chat/streaming.py:290-294`

- [ ] **Step 1: Add the enqueue alongside the existing one**

In `backend/chat/streaming.py`, the post-turn block currently reads:

```python
    try:
        from .tasks import update_session_summary
        update_session_summary.delay(str(session.id))
    except Exception:  # pylint: disable=broad-except
        log.exception("failed to enqueue session-summary update")
```

Replace it with:

```python
    try:
        from .tasks import update_session_summary, compile_company_summaries
        update_session_summary.delay(str(session.id))
        compile_company_summaries.delay(str(session.id))
    except Exception:  # pylint: disable=broad-except
        log.exception("failed to enqueue post-turn summary updates")
```

- [ ] **Step 2: Verify nothing is broken**

Run: `cd backend && pytest chat/tests/ -q`
Expected: PASS (all chat tests; this change only adds an enqueue and isn't exercised by unit tests).

- [ ] **Step 3: Commit**

```bash
git add backend/chat/streaming.py
git commit -m "feat(chat): enqueue per-company summary after each turn"
```

---

## Task 6: User-scoped API endpoint

`GET /api/stocks/company-summary/<ticker>/` → `{ symbol, summary, updated_at }` for the signed-in user; `204` when none.

**Files:**
- Create: `backend/stocks/views/market/company_chat_summary.py`
- Modify: `backend/stocks/views/market/__init__.py`
- Modify: `backend/stocks/urls.py`
- Test: `backend/stocks/tests/test_company_chat_summary_api.py` (create)

- [ ] **Step 1: Write the failing test**

Create `backend/stocks/tests/test_company_chat_summary_api.py`:

```python
import pytest
from django.contrib.auth.models import User

from chat.models import CompanyChatSummary


@pytest.fixture
def other_user(db):
    return User.objects.create_user(username="eve", password="pw")


def test_returns_user_summary(auth_client, db):
    user = auth_client.handler._force_user
    CompanyChatSummary.objects.create(user=user, symbol="NMB", summary="my NMB notes")
    res = auth_client.get("/api/stocks/company-summary/NMB/")
    assert res.status_code == 200
    assert res.data["symbol"] == "NMB"
    assert res.data["summary"] == "my NMB notes"
    assert "updated_at" in res.data


def test_lowercase_ticker_is_normalised(auth_client, db):
    user = auth_client.handler._force_user
    CompanyChatSummary.objects.create(user=user, symbol="NMB", summary="notes")
    res = auth_client.get("/api/stocks/company-summary/nmb/")
    assert res.status_code == 200
    assert res.data["symbol"] == "NMB"


def test_204_when_no_summary(auth_client, db):
    res = auth_client.get("/api/stocks/company-summary/ADBL/")
    assert res.status_code == 204


def test_204_when_summary_blank(auth_client, db):
    user = auth_client.handler._force_user
    CompanyChatSummary.objects.create(user=user, symbol="EBL", summary="   ")
    res = auth_client.get("/api/stocks/company-summary/EBL/")
    assert res.status_code == 204


def test_does_not_leak_other_users_summary(auth_client, other_user, db):
    CompanyChatSummary.objects.create(user=other_user, symbol="NMB", summary="eve notes")
    res = auth_client.get("/api/stocks/company-summary/NMB/")
    assert res.status_code == 204


def test_requires_auth(api_client, db):
    res = api_client.get("/api/stocks/company-summary/NMB/")
    assert res.status_code in (401, 403)
```

Note: the `auth_client`, `api_client`, and `create_user` fixtures come from `backend/stocks/tests/conftest.py`. `auth_client.handler._force_user` is the user set by `force_authenticate`. If that attribute path differs in this DRF version, change the helper fixtures to expose the user (e.g. make `auth_client` a tuple) — but verify the attribute first by running one test.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest stocks/tests/test_company_chat_summary_api.py -v`
Expected: FAIL — 404 (route not registered).

- [ ] **Step 3: Create the view**

Create `backend/stocks/views/market/company_chat_summary.py`:

```python
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def company_chat_summary(request, ticker):
    """Return the signed-in user's rolling AI chat notes for one ticker.

    204 when the user has no (non-blank) summary for that company.
    """
    from chat.models import CompanyChatSummary

    symbol = ticker.upper()
    row = CompanyChatSummary.objects.filter(user=request.user, symbol=symbol).first()
    if row is None or not (row.summary or "").strip():
        return Response(status=status.HTTP_204_NO_CONTENT)
    return Response({
        "symbol": symbol,
        "summary": row.summary,
        "updated_at": row.updated_at,
    })
```

- [ ] **Step 4: Export the view**

In `backend/stocks/views/market/__init__.py`, add alongside the other `from .stock_* import ...` lines:

```python
from .company_chat_summary import company_chat_summary
```

- [ ] **Step 5: Register the route**

In `backend/stocks/urls.py`, add next to the other `details/`-style paths (around line 41):

```python
    path('company-summary/<str:ticker>/', market.company_chat_summary, name='company_chat_summary'),
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd backend && pytest stocks/tests/test_company_chat_summary_api.py -v`
Expected: PASS (6 tests).

- [ ] **Step 7: Commit**

```bash
git add backend/stocks/views/market/company_chat_summary.py backend/stocks/views/market/__init__.py backend/stocks/urls.py backend/stocks/tests/test_company_chat_summary_api.py
git commit -m "feat(stocks): user-scoped company chat-summary endpoint"
```

---

## Task 7: `ChatNotesCard` frontend component

A presentational card that renders the markdown summary and a relative "updated" line. Renders nothing when there is no summary.

**Files:**
- Create: `frontend/src/components/ticker/ChatNotesCard.tsx`

- [ ] **Step 1: Create the component**

Create `frontend/src/components/ticker/ChatNotesCard.tsx`:

```tsx
'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { formatDistanceToNow } from 'date-fns';
import { MarkdownComponents } from '@/components/chat/markdownComponents';
import { Card } from '@/components/ui/card';

export interface ChatNotes {
    symbol: string;
    summary: string;
    updated_at: string;
}

export function ChatNotesCard({ notes }: { notes: ChatNotes | null }) {
    if (!notes || !notes.summary?.trim()) return null;

    return (
        <Card className="p-6 space-y-3">
            <div className="flex items-baseline justify-between gap-4">
                <h3 className="text-base font-medium text-foreground">
                    Your AI notes on {notes.symbol}
                </h3>
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

Verify the `Card` import path matches the project (`@/components/ui/card` is shadcn's default; confirm other ticker components import it the same way — `grep -rn "components/ui/card" frontend/src/components/ticker`). Adjust if the project exports `Card` differently.

- [ ] **Step 2: Build to verify it compiles**

Run: `cd frontend && npm run build` (or `npx tsc --noEmit` for a faster type check)
Expected: no type errors in `ChatNotesCard.tsx`.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/ticker/ChatNotesCard.tsx
git commit -m "feat(ticker): add ChatNotesCard component"
```

---

## Task 8: Wire the card into the ticker page

**Files:**
- Modify: `frontend/src/app/(authenticated)/ticker/[ticker]/page.tsx`

- [ ] **Step 1: Import the component and its type**

Near the other ticker-component imports (around line 32-33), add:

```tsx
import { ChatNotesCard, ChatNotes } from '@/components/ticker/ChatNotesCard';
```

- [ ] **Step 2: Add state**

Near the other `useState` declarations in the component (alongside `setLatestSignal` etc.), add:

```tsx
const [chatNotes, setChatNotes] = useState<ChatNotes | null>(null);
```

- [ ] **Step 3: Fetch the notes inside the existing `fetchData` effect**

In the `fetchData` async function (the effect starting at line 195), add another guarded fetch alongside the existing ones (e.g. after the signal fetch at line 239). A `204` yields no `data`, so treat falsy data as "no notes":

```tsx
                // Fetch the user's AI chat notes for this ticker (204 = none)
                try {
                    const notesRes = await api.get(`/api/stocks/company-summary/${ticker}/`);
                    setChatNotes(notesRes.data && notesRes.data.summary ? notesRes.data : null);
                } catch (nErr) { console.error("Chat notes fetch failed", nErr); }
```

- [ ] **Step 4: Render the card after the top intelligence row**

In the JSX, immediately after the closing `</div>` of the "TOP INTELLIGENCE ROW" grid (after line 689, before the "CORE ANALYTICS HUB" comment), add:

```tsx
                    {/* 1b. YOUR AI NOTES (from chat) — hidden when empty */}
                    <ChatNotesCard notes={chatNotes} />
```

`ChatNotesCard` returns `null` when `chatNotes` is null/blank, so nothing renders for tickers the user hasn't discussed.

- [ ] **Step 5: Build to verify it compiles**

Run: `cd frontend && npm run build`
Expected: build succeeds; no type errors.

- [ ] **Step 6: Manual smoke test**

1. `cd backend && celery -A stockastic worker -B --loglevel=info` (and a Celery broker running).
2. Apply the migration: `python manage.py migrate chat` (Docker: `docker-compose exec backend python manage.py migrate chat`).
3. In chat, ask about a real ticker (e.g. "what do you think of NMB?") and let the turn finish.
4. Open `/ticker/NMB` — the "Your AI notes on NMB" card appears after the turn's summary task runs.
5. Open a ticker you never chatted about — no card shows.

- [ ] **Step 7: Commit**

```bash
git add "frontend/src/app/(authenticated)/ticker/[ticker]/page.tsx"
git commit -m "feat(ticker): show AI chat notes card on ticker page"
```

---

## Deployment notes

- **Migration:** `python manage.py migrate chat` (Docker: `docker-compose exec backend python manage.py migrate chat`) — applies `0010_companychatsummary`.
- **Celery:** restart the worker so it picks up `chat.compile_company_summaries`.
- **Frontend:** rebuild the Docker image + hard refresh (`localhost:3000` is Docker-built, not the dev server).
- **No backfill in v1:** summaries accrue from new chat turns forward; existing chat history is not retroactively summarised.

---

## Self-review notes

- **Spec coverage:** model (Task 1), raw-message source + rolling fold (Task 4 via `recent_exchanges` + `build_company_summary`), user-message-only detection (Task 4 `test_detects_off_user_message_not_assistant`), Company validation (Task 4 `_tracked_symbols`), Haiku reuse (Task 3), per-user API + 204-empty (Task 6), hidden-when-empty card (Tasks 7-8), error swallowing/idempotency (Task 4). All spec sections map to a task.
- **Type/name consistency:** `compile_company_summaries(session_id)`, `build_company_summary(prior, exchanges, symbol)`, `extract_tickers(text)`, `_tracked_symbols`, `_fold_company_summary`, `CompanyChatSummary`, and the `ChatNotes`/`ChatNotesCard` names are used identically across tasks.
- **Verify-before-code flags:** two spots need a quick runtime confirmation rather than assumption — the `settings` import / user-FK style in `models.py` (Task 1 Step 3) and the `auth_client.handler._force_user` attribute (Task 6 Step 1). Both are called out inline with fallback instructions.
