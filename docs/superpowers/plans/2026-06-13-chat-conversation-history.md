# Chat Conversation History + Rolling Summary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the chat orchestrator reliable conversation context — an always-on rolling session summary plus a heuristic-gated verbatim window of the last 3 exchanges — independent of the fragile SDK `resume` mechanism.

**Architecture:** Two context layers injected into the orchestrator's user-turn prompt. (1) A `ChatSession.summary` field, refreshed asynchronously by a Celery task using a one-shot Haiku call after each turn (no-op while the session is short). (2) The last 3 user→assistant exchanges, read from existing `ChatMessage` rows and injected verbatim **only** when a fast keyword heuristic detects the message reaches back to prior context. Both sit on top of the existing `sdk_session_id` resume, which is left untouched.

**Tech Stack:** Django 5.2, Celery (`@shared_task`), `claude-agent-sdk` (one-shot Haiku via `ClaudeSDKClient`), pytest.

**Spec:** `docs/superpowers/specs/2026-06-13-chat-conversation-history-design.md`

---

## File Structure

| File | Responsibility | Action |
|------|----------------|--------|
| `backend/chat/models.py` | Add `summary` field to `ChatSession` | Modify |
| `backend/chat/migrations/0009_chatsession_summary.py` | Schema migration | Create (via makemigrations) |
| `backend/chat/history.py` | Pure helpers: exchange windowing, formatting, and the reference-detection heuristic | Create |
| `backend/chat/summary_service.py` | One-shot Haiku call that folds the newest exchange into the running summary | Create |
| `backend/chat/tasks.py` | `update_session_summary` Celery task (threshold gate + persistence) | Create |
| `backend/chat/agent.py` | Extend `_format_prompt`; fetch summary+history; change `run_chat_session` signature | Modify |
| `backend/chat/streaming.py` | Pass `session` into `run_chat_session`; enqueue summary task after persist | Modify |
| `backend/chat/prompts/orchestrator.yaml` | Add `[Conversation summary]` + `[Recent conversation]` template sections | Modify |
| `backend/chat/tests/test_history.py` | Tests for windowing, formatting, heuristic | Create |
| `backend/chat/tests/test_summary_service.py` | Tests for summary prompt assembly + truncation | Create |
| `backend/chat/tests/test_summary_task.py` | Tests for the Celery task gating + persistence | Create |
| `backend/chat/tests/test_prompt_history.py` | Tests for `_format_prompt` rendering both sections | Create |

---

## Task 1: Add `summary` field to ChatSession

**Files:**
- Modify: `backend/chat/models.py:8-23`
- Create: `backend/chat/migrations/0009_chatsession_summary.py` (generated)

- [ ] **Step 1: Add the field to the model**

In `backend/chat/models.py`, inside `class ChatSession`, add the `summary` field directly after the `sdk_session_id` line (currently line 15):

```python
    # Claude Agent SDK session ID — set after the first turn so subsequent turns can resume.
    sdk_session_id = models.CharField(max_length=64, blank=True, default="")
    # Rolling natural-language summary of the conversation, refreshed asynchronously
    # after each turn and injected into every prompt so the agent keeps the thread.
    summary = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
```

- [ ] **Step 2: Generate the migration**

Run: `cd backend && source venv/bin/activate && python manage.py makemigrations chat`
Expected output: `Migrations for 'chat':` and a new file `chat/migrations/0009_chatsession_summary.py` adding field `summary` to `chatsession`.

- [ ] **Step 3: Verify the migration applies**

Run: `cd backend && python manage.py migrate chat`
Expected: `Applying chat.0009_chatsession_summary... OK`

- [ ] **Step 4: Commit**

```bash
git add backend/chat/models.py backend/chat/migrations/0009_chatsession_summary.py
git commit -m "feat(chat): add rolling summary field to ChatSession"
```

---

## Task 2: History windowing + formatting (`history.py`)

**Files:**
- Create: `backend/chat/history.py`
- Test: `backend/chat/tests/test_history.py`

- [ ] **Step 1: Write the failing tests**

Create `backend/chat/tests/test_history.py`:

```python
import pytest
from django.contrib.auth import get_user_model

from chat.models import ChatSession, ChatMessage
from chat.history import (
    Exchange,
    recent_exchanges,
    format_exchanges,
    HISTORY_HOPS,
    MAX_REPLY_CHARS_IN_HISTORY,
)

User = get_user_model()


@pytest.fixture
def session(db):
    user = User.objects.create(username="alice")
    return ChatSession.objects.create(user=user, title="t")


def _add(session, role, text):
    return ChatMessage.objects.create(session=session, role=role, text=text)


def test_pairs_user_with_following_assistant(session):
    _add(session, ChatMessage.ROLE_USER, "q1")
    _add(session, ChatMessage.ROLE_ASSISTANT, "a1")
    result = recent_exchanges(session)
    assert result == [Exchange(user_text="q1", assistant_text="a1")]


def test_returns_only_last_n_hops(session):
    for i in range(5):
        _add(session, ChatMessage.ROLE_USER, f"q{i}")
        _add(session, ChatMessage.ROLE_ASSISTANT, f"a{i}")
    result = recent_exchanges(session)
    assert len(result) == HISTORY_HOPS
    assert [e.user_text for e in result] == ["q2", "q3", "q4"]


def test_dangling_current_user_message_is_excluded(session):
    _add(session, ChatMessage.ROLE_USER, "q1")
    _add(session, ChatMessage.ROLE_ASSISTANT, "a1")
    _add(session, ChatMessage.ROLE_USER, "current-unanswered")
    result = recent_exchanges(session)
    assert result == [Exchange(user_text="q1", assistant_text="a1")]


def test_format_truncates_long_replies():
    long_reply = "x" * (MAX_REPLY_CHARS_IN_HISTORY + 50)
    text = format_exchanges([Exchange(user_text="q", assistant_text=long_reply)])
    assert "User: q" in text
    assert text.endswith("…")
    assert len(text) <= MAX_REPLY_CHARS_IN_HISTORY + len("User: q\nAssistant: ") + 1


def test_format_empty_returns_empty_string():
    assert format_exchanges([]) == ""
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && pytest chat/tests/test_history.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'chat.history'`

- [ ] **Step 3: Write minimal implementation**

Create `backend/chat/history.py`:

```python
"""Pure helpers for chat conversation history.

Reads completed user→assistant exchanges from persisted ChatMessage rows and
renders a compact, token-bounded window for prompt injection. No model calls,
no I/O beyond the ORM read — kept pure so it is trivially testable.
"""
from __future__ import annotations

from typing import NamedTuple

from chat.models import ChatMessage

HISTORY_HOPS = 3
MAX_REPLY_CHARS_IN_HISTORY = 600


class Exchange(NamedTuple):
    """One completed turn: a user message and the assistant reply that followed it."""

    user_text: str
    assistant_text: str


def recent_exchanges(session, hops: int = HISTORY_HOPS) -> list[Exchange]:
    """Return the last `hops` completed user→assistant exchanges, oldest first.

    A trailing user message with no assistant reply yet (the current turn) is
    naturally excluded because it never closes a pair.
    """
    pairs: list[Exchange] = []
    pending_user: str | None = None
    for message in session.messages.order_by("created_at"):
        if message.role == ChatMessage.ROLE_USER:
            pending_user = message.text or ""
        elif message.role == ChatMessage.ROLE_ASSISTANT and pending_user is not None:
            pairs.append(Exchange(user_text=pending_user, assistant_text=message.text or ""))
            pending_user = None
    return pairs[-hops:]


def _truncate_reply(reply: str) -> str:
    if len(reply) <= MAX_REPLY_CHARS_IN_HISTORY:
        return reply
    return reply[:MAX_REPLY_CHARS_IN_HISTORY].rstrip() + "…"


def format_exchanges(exchanges: list[Exchange]) -> str:
    """Render exchanges as compact `User:`/`Assistant:` text, replies truncated."""
    if not exchanges:
        return ""
    blocks = [
        f"User: {ex.user_text}\nAssistant: {_truncate_reply(ex.assistant_text)}"
        for ex in exchanges
    ]
    return "\n\n".join(blocks)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && pytest chat/tests/test_history.py -v`
Expected: PASS (5 passed)

- [ ] **Step 5: Commit**

```bash
git add backend/chat/history.py backend/chat/tests/test_history.py
git commit -m "feat(chat): add conversation history windowing helpers"
```

---

## Task 3: Reference-detection heuristic (`references_prior_context`)

**Files:**
- Modify: `backend/chat/history.py`
- Test: `backend/chat/tests/test_history.py` (append)

- [ ] **Step 1: Write the failing tests**

Append to `backend/chat/tests/test_history.py`:

```python
from chat.history import references_prior_context


@pytest.mark.parametrize("message", [
    "Explain that",
    "Why?",
    "Tell me more about it",
    "What about those?",
    "You said it was a buy — why?",
    "Compare it to the previous one",
])
def test_detects_back_reference(message):
    assert references_prior_context(message) is True


@pytest.mark.parametrize("message", [
    "What is the PE ratio of NABIL?",
    "Should I buy SHIVM today?",
    "Give me the market summary",
    "Why is NABIL down today?",  # elaboration cue but names a fresh ticker → standalone
])
def test_standalone_message_is_not_a_reference(message):
    assert references_prior_context(message) is False


def test_empty_message_is_not_a_reference():
    assert references_prior_context("") is False
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && pytest chat/tests/test_history.py -k reference -v`
Expected: FAIL — `ImportError: cannot import name 'references_prior_context'`

- [ ] **Step 3: Write minimal implementation**

Append to `backend/chat/history.py` (add `import re` to the top imports):

```python
import re

# Pronouns / deixis / explicit call-backs that point at earlier turns.
_BACK_REFERENCE = re.compile(
    r"\b(it|its|that|those|them|they|this|these|above|earlier|before|"
    r"previous|previously|same)\b"
    r"|you (?:said|mentioned)|as you|last one",
    re.IGNORECASE,
)
# Elaboration cues that only count as follow-ups when no fresh ticker is named.
_ELABORATION = re.compile(
    r"\b(why|explain|elaborate|more|instead|also|compare)\b|what about",
    re.IGNORECASE,
)
# A 3–7 letter uppercase token, i.e. a likely NEPSE ticker → a fresh subject.
_TICKER = re.compile(r"\b[A-Z]{3,7}\b")


def references_prior_context(message: str) -> bool:
    """True when the message reaches back to earlier turns rather than standing alone.

    Back-reference pronouns/deixis always count. Bare elaboration cues count only
    when the message does not name a fresh ticker (otherwise it is a new subject).
    Misclassification is low-cost: the rolling summary is always present anyway.
    """
    text = message or ""
    if _BACK_REFERENCE.search(text):
        return True
    if _ELABORATION.search(text) and not _TICKER.search(text):
        return True
    return False
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && pytest chat/tests/test_history.py -v`
Expected: PASS (all history tests green)

- [ ] **Step 5: Commit**

```bash
git add backend/chat/history.py backend/chat/tests/test_history.py
git commit -m "feat(chat): add reference-detection heuristic for history gating"
```

---

## Task 4: Summary service (`summary_service.py`)

**Files:**
- Create: `backend/chat/summary_service.py`
- Test: `backend/chat/tests/test_summary_service.py`

- [ ] **Step 1: Write the failing tests**

Create `backend/chat/tests/test_summary_service.py`:

```python
from chat.history import Exchange
from chat import summary_service
from chat.summary_service import _summary_prompt, build_summary, MAX_SUMMARY_CHARS


def test_prompt_includes_prior_summary_and_new_exchange():
    ex = Exchange(user_text="Is NABIL a buy?", assistant_text="Yes, strong fundamentals.")
    prompt = _summary_prompt("Earlier we discussed SHIVM.", ex)
    assert "Earlier we discussed SHIVM." in prompt
    assert "Is NABIL a buy?" in prompt
    assert "Yes, strong fundamentals." in prompt


def test_prompt_handles_empty_prior_summary():
    ex = Exchange(user_text="q", assistant_text="a")
    prompt = _summary_prompt("", ex)
    assert "(no prior summary)" in prompt


def test_build_summary_truncates_to_max(monkeypatch):
    async def fake_run(_prompt):
        return "y" * (MAX_SUMMARY_CHARS + 100)

    monkeypatch.setattr(summary_service, "_run_summary", fake_run)
    out = build_summary("prior", Exchange(user_text="q", assistant_text="a"))
    assert len(out) == MAX_SUMMARY_CHARS


def test_build_summary_falls_back_to_prior_when_model_returns_empty(monkeypatch):
    async def fake_run(_prompt):
        return "   "

    monkeypatch.setattr(summary_service, "_run_summary", fake_run)
    out = build_summary("prior summary", Exchange(user_text="q", assistant_text="a"))
    assert out == "prior summary"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && pytest chat/tests/test_summary_service.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'chat.summary_service'`

- [ ] **Step 3: Write minimal implementation**

Create `backend/chat/summary_service.py` (mirrors the one-shot Haiku pattern in `chat/services/analysis_capture.py:124-148`):

```python
"""Fold the newest chat exchange into a rolling session summary via a one-shot
Haiku call. Reuses the Agent SDK + OAuth auth already configured for chat.
"""
from __future__ import annotations

import asyncio
import logging

log = logging.getLogger(__name__)

SUMMARY_MODEL = "claude-haiku-4-5"
MAX_SUMMARY_CHARS = 1200
SUMMARY_SYSTEM = (
    "You maintain a running summary of a NEPSE stock-analysis conversation so an "
    "assistant can resume with full context. Given the current running summary and "
    "the newest user/assistant exchange, return an updated summary as plain prose "
    "(no markdown headers, no preamble). Keep it under 200 words. Preserve durable "
    "facts: tickers discussed, the user's intent, verdicts given, and open threads. "
    "Drop pleasantries and redundant detail."
)


def _summary_prompt(prior_summary: str, exchange) -> str:
    prior = prior_summary.strip() or "(no prior summary)"
    return (
        "Current running summary:\n"
        f"{prior}\n\n"
        "Newest exchange:\n"
        f"User: {exchange.user_text}\n"
        f"Assistant: {exchange.assistant_text}\n\n"
        "Return the updated running summary."
    )


async def _run_summary(prompt: str) -> str:
    from claude_agent_sdk import (
        AssistantMessage, ClaudeAgentOptions, ClaudeSDKClient, TextBlock,
    )
    from chat.agent import _sdk_env

    options = ClaudeAgentOptions(
        system_prompt=SUMMARY_SYSTEM,
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


def build_summary(prior_summary: str, exchange) -> str:
    """Return an updated rolling summary. Falls back to the prior summary on empty output."""
    prompt = _summary_prompt(prior_summary, exchange)
    text = asyncio.run(_run_summary(prompt))
    updated = text.strip() or (prior_summary or "").strip()
    return updated[:MAX_SUMMARY_CHARS]
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && pytest chat/tests/test_summary_service.py -v`
Expected: PASS (4 passed)

- [ ] **Step 5: Commit**

```bash
git add backend/chat/summary_service.py backend/chat/tests/test_summary_service.py
git commit -m "feat(chat): add rolling-summary service (one-shot Haiku)"
```

---

## Task 5: Summary Celery task (`tasks.py`)

**Files:**
- Create: `backend/chat/tasks.py`
- Test: `backend/chat/tests/test_summary_task.py`

- [ ] **Step 1: Write the failing tests**

Create `backend/chat/tests/test_summary_task.py`:

```python
import pytest
from django.contrib.auth import get_user_model

from chat.models import ChatSession, ChatMessage
from chat import summary_service
from chat.tasks import update_session_summary, SUMMARIZE_AFTER_EXCHANGES

User = get_user_model()


@pytest.fixture
def session(db):
    user = User.objects.create(username="bob")
    return ChatSession.objects.create(user=user, title="t")


def _exchange(session, q, a):
    ChatMessage.objects.create(session=session, role=ChatMessage.ROLE_USER, text=q)
    ChatMessage.objects.create(session=session, role=ChatMessage.ROLE_ASSISTANT, text=a)


def test_noop_when_session_is_short(session, monkeypatch):
    calls = []
    monkeypatch.setattr(summary_service, "build_summary", lambda *a, **k: calls.append(a) or "X")
    for i in range(SUMMARIZE_AFTER_EXCHANGES):  # exactly threshold → still no-op
        _exchange(session, f"q{i}", f"a{i}")
    result = update_session_summary(str(session.id))
    assert result is None
    assert calls == []
    session.refresh_from_db()
    assert session.summary == ""


def test_builds_and_saves_summary_when_long(session, monkeypatch):
    monkeypatch.setattr(summary_service, "build_summary", lambda prior, ex: "UPDATED SUMMARY")
    for i in range(SUMMARIZE_AFTER_EXCHANGES + 1):  # over threshold
        _exchange(session, f"q{i}", f"a{i}")
    result = update_session_summary(str(session.id))
    assert result == "UPDATED SUMMARY"
    session.refresh_from_db()
    assert session.summary == "UPDATED SUMMARY"


def test_swallows_build_errors(session, monkeypatch):
    def boom(prior, ex):
        raise RuntimeError("model down")

    monkeypatch.setattr(summary_service, "build_summary", boom)
    for i in range(SUMMARIZE_AFTER_EXCHANGES + 1):
        _exchange(session, f"q{i}", f"a{i}")
    result = update_session_summary(str(session.id))
    assert result is None
    session.refresh_from_db()
    assert session.summary == ""


def test_missing_session_is_noop(db):
    import uuid
    assert update_session_summary(str(uuid.uuid4())) is None
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && pytest chat/tests/test_summary_task.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'chat.tasks'`

- [ ] **Step 3: Write minimal implementation**

Create `backend/chat/tasks.py`:

```python
"""Background tasks for the chat app."""
from __future__ import annotations

import logging

from celery import shared_task

log = logging.getLogger(__name__)

# Below this many completed exchanges the rolling summary is skipped — the
# verbatim 3-hop window already covers the whole conversation.
SUMMARIZE_AFTER_EXCHANGES = 3


@shared_task(name="chat.update_session_summary")
def update_session_summary(session_id: str) -> str | None:
    """Refresh ChatSession.summary from the newest exchange. No-op while short."""
    from chat.models import ChatSession, ChatMessage
    from chat.history import recent_exchanges
    from chat import summary_service

    try:
        session = ChatSession.objects.get(id=session_id)
    except ChatSession.DoesNotExist:
        return None

    completed = session.messages.filter(role=ChatMessage.ROLE_ASSISTANT).count()
    if completed <= SUMMARIZE_AFTER_EXCHANGES:
        return None

    exchanges = recent_exchanges(session, hops=1)
    if not exchanges:
        return None

    try:
        new_summary = summary_service.build_summary(session.summary or "", exchanges[-1])
    except Exception:  # pylint: disable=broad-except
        log.exception("rolling-summary build failed for session %s", session_id)
        return None

    session.summary = new_summary
    session.save(update_fields=["summary", "updated_at"])
    return new_summary
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && pytest chat/tests/test_summary_task.py -v`
Expected: PASS (4 passed)

- [ ] **Step 5: Commit**

```bash
git add backend/chat/tasks.py backend/chat/tests/test_summary_task.py
git commit -m "feat(chat): add update_session_summary Celery task"
```

---

## Task 6: Inject summary + history into the prompt (`orchestrator.yaml` + `agent.py`)

**Files:**
- Modify: `backend/chat/prompts/orchestrator.yaml:120-131`
- Modify: `backend/chat/agent.py:60-75` (`_format_prompt`), `:145-168` (`run_chat_session`)
- Test: `backend/chat/tests/test_prompt_history.py`

- [ ] **Step 1: Write the failing tests**

Create `backend/chat/tests/test_prompt_history.py`:

```python
from types import SimpleNamespace

from chat.agent import _format_prompt


def _user():
    return SimpleNamespace(username="alice")


def test_renders_summary_and_history_sections():
    out = _format_prompt(
        _user(), "Why?",
        memory=[], saved_hint="",
        summary="We discussed NABIL; verdict was buy.",
        history="User: Is NABIL a buy?\nAssistant: Yes.",
    )
    assert "[Conversation summary]" in out
    assert "We discussed NABIL; verdict was buy." in out
    assert "[Recent conversation]" in out
    assert "User: Is NABIL a buy?" in out
    assert "Why?" in out


def test_empty_summary_and_history_show_placeholders():
    out = _format_prompt(_user(), "Hi", memory=[], saved_hint="", summary="", history="")
    assert "(no earlier conversation summarized yet)" in out
    assert "(the user's message does not reference earlier turns)" in out
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && pytest chat/tests/test_prompt_history.py -v`
Expected: FAIL — `TypeError: _format_prompt() got an unexpected keyword argument 'summary'`

- [ ] **Step 3a: Update the prompt template**

In `backend/chat/prompts/orchestrator.yaml`, replace the `user:` block (lines 120-131) with:

```yaml
user: |
  [Date: {date}]
  [User: {username}]

  [User memory]
  {memory}

  [Conversation summary]
  {summary}

  [Recent conversation]
  {history}

  [Saved analyses]
  {saved_hint}

  {message}
```

- [ ] **Step 3b: Extend `_format_prompt`**

In `backend/chat/agent.py`, replace `_format_prompt` (lines 60-75) with:

```python
def _format_prompt(user, message: str, memory: list[str] | None = None,
                   saved_hint: str = "", summary: str = "", history: str = "") -> str:
    """Render the orchestrator user-turn template with live context."""
    safe_username = _safe_prompt_value(getattr(user, "username", ""))
    memory_block = (
        "Known about this user:\n" + "\n".join(f"- {f}" for f in memory)
        if memory else "(nothing recorded about this user yet)"
    )
    summary_block = (summary or "").strip() or "(no earlier conversation summarized yet)"
    history_block = (history or "").strip() or "(the user's message does not reference earlier turns)"
    saved_block = saved_hint or "(no related saved analyses)"
    return _ORCHESTRATOR_USER_TEMPLATE.format(
        date=date.today().isoformat(),
        username=safe_username,
        memory=memory_block,
        summary=summary_block,
        history=history_block,
        saved_hint=saved_block,
        message=message,
    )
```

- [ ] **Step 4: Run the prompt tests to verify they pass**

Run: `cd backend && pytest chat/tests/test_prompt_history.py -v`
Expected: PASS (2 passed)

- [ ] **Step 5: Add the history-fetch helper and wire it into `run_chat_session`**

In `backend/chat/agent.py`, add this helper next to `_fetch_memory` (after line 134):

```python
@sync_to_async
def _fetch_history_context(session, message: str) -> tuple[str, str]:
    """Return (summary, gated_history) for the prompt. History is empty unless the
    message references prior turns; the summary is always returned."""
    from chat.history import recent_exchanges, format_exchanges, references_prior_context

    summary = session.summary or ""
    history = ""
    if references_prior_context(message):
        history = format_exchanges(recent_exchanges(session))
    return summary, history
```

Then change `run_chat_session` (lines 145-155) to take `session` instead of `sdk_session_id` and thread the new context through:

```python
async def run_chat_session(user, session, prompt: str) -> AsyncIterator:
    """Run one assistant turn against the orchestrator, yielding SDK messages.

    If the session's sdk_session_id is stale (deleted on Claude's side between
    calls), the SDK raises with 'No conversation found'. We transparently retry
    as a fresh session so the user gets a response instead of an error.
    """
    _user_context.set_user(user)
    memory = await _fetch_memory(user)
    saved_hint = await _fetch_saved_hint_async(user, prompt)
    summary, history = await _fetch_history_context(session, prompt)
    formatted_prompt = _format_prompt(
        user, prompt, memory=memory, saved_hint=saved_hint, summary=summary, history=history,
    )

    sdk_session_id = session.sdk_session_id
    session_ids = [sdk_session_id, ""] if sdk_session_id else [""]
```

(The remainder of `run_chat_session` — the `for attempt_id in session_ids:` loop — is unchanged.)

- [ ] **Step 6: Run the full chat suite to confirm nothing regressed**

Run: `cd backend && pytest chat/tests/ -v`
Expected: PASS (callers updated in Task 7 — `test_streaming_helpers.py` should still pass since it does not call `run_chat_session` directly; if any test calls it with `sdk_session_id=`, note it for Task 7).

- [ ] **Step 7: Commit**

```bash
git add backend/chat/agent.py backend/chat/prompts/orchestrator.yaml backend/chat/tests/test_prompt_history.py
git commit -m "feat(chat): inject rolling summary and gated history into orchestrator prompt"
```

---

## Task 7: Wire session through streaming + enqueue summary task (`streaming.py`)

**Files:**
- Modify: `backend/chat/streaming.py:229-237` (`_dispatch_session` call), `:282-291` (`stream_chat` persist tail)

- [ ] **Step 1: Update the `run_chat_session` call to pass `session`**

In `backend/chat/streaming.py`, in `_dispatch_session` (lines 234-237), change the call:

```python
        async for msg in run_chat_session(
            user=user, session=session, prompt=prompt
        ):
```

(Previously passed `sdk_session_id=session.sdk_session_id`.)

- [ ] **Step 2: Enqueue the summary task after the assistant turn is persisted**

In `backend/chat/streaming.py`, in `stream_chat` (lines 282-291), after the `_persist_turn` try/except block and before the final `done` frame, add the enqueue:

```python
    persisted_message_id = None
    try:
        persisted_message_id = await _persist_turn(
            session, blocks, usage_total, final_session_id_ref[0]
        )
    except Exception:
        log.exception("failed to persist assistant turn")

    try:
        from .tasks import update_session_summary
        update_session_summary.delay(str(session.id))
    except Exception:  # pylint: disable=broad-except
        log.exception("failed to enqueue session-summary update")

    yield _sse("done", {"session_id": str(session.id),
                        "sdk_session_id": final_session_id_ref[0],
                        "message_id": persisted_message_id})
```

- [ ] **Step 3: Check for and fix any other `run_chat_session` callers**

Run: `cd backend && grep -rn "run_chat_session" chat/ --include="*.py"`
Expected: matches in `chat/agent.py` (definition), `chat/streaming.py` (the updated call). If any test or other module calls it with `sdk_session_id=`, update that call to pass `session=<ChatSession>` instead. If none, proceed.

- [ ] **Step 4: Run the full chat suite**

Run: `cd backend && pytest chat/tests/ -v`
Expected: PASS (all chat tests green)

- [ ] **Step 5: Commit**

```bash
git add backend/chat/streaming.py
git commit -m "feat(chat): pass session to orchestrator and enqueue summary refresh"
```

---

## Task 8: Full suite + deploy notes

**Files:** none (verification only)

- [ ] **Step 1: Run the complete backend test suite**

Run: `cd backend && pytest -q`
Expected: PASS — no regressions across the repo.

- [ ] **Step 2: Confirm the migration is listed**

Run: `cd backend && python manage.py showmigrations chat | tail -3`
Expected: `0009_chatsession_summary` present and marked `[X]`.

- [ ] **Step 3: Record deploy steps**

The feature requires, on deploy: `docker-compose exec backend python manage.py migrate chat`, a Celery worker restart (so `chat.update_session_summary` is registered), and a frontend rebuild only if any frontend change was made (none in this plan). No beat schedule entry is needed — the task is enqueued inline from the request path.

---

## Self-Review

**Spec coverage:**
- Rolling summary field on `ChatSession` → Task 1. ✓
- 1 hop = user+assistant final text, last 3, thinking/tool excluded → Task 2 (`recent_exchanges` reads `ChatMessage.text`, which is text-only). ✓
- Heuristic gates the verbatim window; summary always injected → Task 3 + Task 6 (`_fetch_history_context` always returns summary, gates history). ✓
- Async summary via cheap Haiku after the turn, incremental → Task 4 + Task 5 + Task 7 enqueue. ✓
- Skip-while-short (≤3 exchanges) → Task 5 `SUMMARIZE_AFTER_EXCHANGES` gate. ✓
- Orchestrator-only; subagents untouched → no subagent files modified. ✓
- Truncation marker `…`, placeholders for empty sections → Task 2 `_truncate_reply`, Task 6 placeholders. ✓
- Constants, no magic numbers → `HISTORY_HOPS`, `MAX_REPLY_CHARS_IN_HISTORY`, `SUMMARY_MODEL`, `MAX_SUMMARY_CHARS`, `SUMMARIZE_AFTER_EXCHANGES`. ✓
- Error handling swallowed/logged → Task 5 try/except, Task 7 enqueue try/except. ✓
- SDK resume unchanged → `run_chat_session` still threads `sdk_session_id` through the same retry loop. ✓
- No backfill → migration only adds a defaulted field. ✓

**Placeholder scan:** No TBD/TODO/"handle edge cases" — every code step shows full content. ✓

**Type consistency:** `Exchange(user_text, assistant_text)` used identically in Tasks 2, 4, 5. `recent_exchanges(session, hops)`, `format_exchanges`, `references_prior_context`, `build_summary(prior_summary, exchange)`, `update_session_summary(session_id)`, `_format_prompt(..., summary, history)` signatures match across all referencing tasks. `run_chat_session(user, session, prompt)` definition (Task 6) matches the call site (Task 7). ✓
