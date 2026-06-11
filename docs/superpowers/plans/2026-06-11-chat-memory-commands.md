# Chat Memory Commands Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Opus implementers (user requirement). Steps use checkbox syntax.

**Goal:** Deterministic slash commands in chat (`/memory`, `/help`) for viewing, adding, editing, forgetting, and clearing the user's chat memory — instant, zero LLM tokens, no SDK round-trip.

**Architecture:** A new `chat/commands.py` parses and handles commands. `views.py::send` checks for a command BEFORE the rate limiter and the SDK: if matched, it persists the user message, computes the deterministic reply, persists the assistant message (same block shape streaming.py writes), and streams the minimal SSE sequence the existing client already renders (`assistant_start` → `text` → `assistant_end` → `done`, reusing `streaming._sse`). No frontend changes (verified: a single text frame + done renders fine; discoverability via `/help`).

**Design decisions:** commands are exempt from the 10/min LLM rate limit (they're cheap); `/memory clear` requires a `confirm` suffix (destructive); forget/edit accept a 1-based index from `/memory list` (stable: Meta ordering is created_at) or a substring (forget only); add/edit reuse the 220-char whitespace-collapse hygiene and the 30-fact cap.

**Spec-equivalent:** this plan's design intro (small feature; full spec doc waived deliberately).

---

## Verified facts

- `views.py::send` (~83-139): body `{"prompt": ...}`; `_rate_limited(user.id)` at ~96 → 429; user msg persisted ~103; returns `StreamingHttpResponse(byte_iter(), content_type="text/event-stream")` wrapping the async `stream_chat`.
- `streaming._sse(event, payload) -> bytes`. Client-required sequence for a complete reply: `assistant_start {"session_id"}` → `text {"kind":"text","subagent":None,"text":...}` → `assistant_end {}` → `done {"session_id", "sdk_session_id"}`. Assistant message persisted with `text` + `blocks=[{"kind":"text","subagent":None,"text":...}]` (token counts default 0).
- `UserMemory` (chat/models.py): content(220), MAX_FACTS_PER_USER=30, ordering created_at. Tools `_clean_fact`/`remember_about_user`/`forget_about_user` exist in chat/tools.py (don't import tools.py from commands.py — it pulls the SDK; duplicate the 3-line `_clean_fact` instead with a comment).
- Frontend: no slash handling anywhere; textarea composer in ChatInterface.tsx; no changes needed.
- Tests: `tests/test_chat_*` conventions; view-level tests can use `auth_client` hitting `/api/chat/sessions/{id}/send/` and parsing the SSE body (response.streaming_content iterable of bytes).

---

### Task 1: command module + view interception (single task — the feature is one seam)

**Files:** create `backend/chat/commands.py`, `backend/tests/test_chat_commands.py`; modify `backend/chat/views.py`.

- [ ] **Step 1: failing tests** — create `tests/test_chat_commands.py`:

```python
import json

import pytest

from chat.commands import handle_command, parse_command


class TestParseCommand:
    def test_non_commands(self):
        assert parse_command("hello") is None
        assert parse_command("what about /memory?") is None
        assert parse_command("//memory") is None

    def test_memory_variants(self):
        assert parse_command("/memory").name == "memory"
        assert parse_command("/memory list").args == "list"
        assert parse_command("  /memory  add  Likes banks  ").args == "add  Likes banks"
        assert parse_command("/MEMORY clear").name == "memory"

    def test_help(self):
        assert parse_command("/help").name == "help"

    def test_unknown_command_still_parses(self):
        cmd = parse_command("/bogus stuff")
        assert cmd.name == "bogus"


@pytest.mark.django_db
class TestHandleCommand:
    def _facts(self, user):
        from chat.models import UserMemory
        return list(UserMemory.objects.filter(user=user).values_list("content", flat=True))

    def test_list_empty_and_populated(self, create_user):
        from chat.models import UserMemory
        user = create_user(username="cmd1", password="x")
        out = handle_command(user, parse_command("/memory"))
        assert "no facts" in out.lower() or "nothing" in out.lower()
        UserMemory.objects.create(user=user, content="Risk-averse")
        UserMemory.objects.create(user=user, content="Long horizon")
        out = handle_command(user, parse_command("/memory list"))
        assert "1. Risk-averse" in out and "2. Long horizon" in out

    def test_add_with_hygiene_and_cap(self, create_user):
        from chat.models import UserMemory
        user = create_user(username="cmd2", password="x")
        out = handle_command(user, parse_command("/memory add  Hates\nhydro  "))
        assert "Hates hydro" in out
        assert self._facts(user) == ["Hates hydro"]
        for i in range(29):
            UserMemory.objects.create(user=user, content=f"f{i}")
        out = handle_command(user, parse_command("/memory add overflow"))
        assert "30" in out and "overflow" not in self._facts(user)

    def test_forget_by_index_and_substring(self, create_user):
        from chat.models import UserMemory
        user = create_user(username="cmd3", password="x")
        UserMemory.objects.create(user=user, content="alpha fact")
        UserMemory.objects.create(user=user, content="beta fact")
        out = handle_command(user, parse_command("/memory forget 1"))
        assert "alpha fact" in out and self._facts(user) == ["beta fact"]
        out = handle_command(user, parse_command("/memory forget beta"))
        assert self._facts(user) == []

    def test_edit_by_index(self, create_user):
        from chat.models import UserMemory
        user = create_user(username="cmd4", password="x")
        UserMemory.objects.create(user=user, content="old text")
        out = handle_command(user, parse_command("/memory edit 1 new text"))
        assert self._facts(user) == ["new text"] and "new text" in out

    def test_clear_requires_confirm(self, create_user):
        from chat.models import UserMemory
        user = create_user(username="cmd5", password="x")
        UserMemory.objects.create(user=user, content="keep me")
        out = handle_command(user, parse_command("/memory clear"))
        assert "confirm" in out.lower() and self._facts(user) == ["keep me"]
        out = handle_command(user, parse_command("/memory clear confirm"))
        assert self._facts(user) == [] and "1" in out  # reports count deleted

    def test_help_and_unknown(self, create_user):
        user = create_user(username="cmd6", password="x")
        out = handle_command(user, parse_command("/help"))
        assert "/memory" in out
        out = handle_command(user, parse_command("/bogus"))
        assert "/help" in out  # unknown → points at help

    def test_bad_index_errors_gracefully(self, create_user):
        user = create_user(username="cmd7", password="x")
        out = handle_command(user, parse_command("/memory forget 9"))
        assert "no fact" in out.lower() or "not found" in out.lower()
        out = handle_command(user, parse_command("/memory edit abc new"))
        assert "usage" in out.lower() or "index" in out.lower()


@pytest.mark.django_db
class TestSendCommandInterception:
    def _send(self, auth_client, session_id, prompt):
        resp = auth_client.post(f"/api/chat/sessions/{session_id}/send/",
                                data=json.dumps({"prompt": prompt}),
                                content_type="application/json")
        assert resp.status_code == 200
        body = b"".join(resp.streaming_content).decode()
        return body

    def test_memory_command_short_circuits_sdk(self, auth_client):
        from unittest.mock import patch
        from django.contrib.auth.models import User
        from chat.models import ChatMessage, ChatSession
        user = User.objects.get(username="testuser")
        session = ChatSession.objects.create(user=user, title="t")
        with patch("chat.views.stream_chat", side_effect=AssertionError("SDK must not be called")):
            body = self._send(auth_client, session.id, "/memory add Prefers banks")
        assert "event: assistant_start" in body
        assert "event: text" in body and "Prefers banks" in body
        assert "event: done" in body
        msgs = list(ChatMessage.objects.filter(session=session).order_by("created_at"))
        assert [m.role for m in msgs] == ["user", "assistant"]
        assert msgs[1].blocks[0]["kind"] == "text"

    def test_command_exempt_from_rate_limit(self, auth_client):
        from unittest.mock import patch
        from django.contrib.auth.models import User
        from chat.models import ChatSession
        user = User.objects.get(username="testuser")
        session = ChatSession.objects.create(user=user, title="t2")
        with patch("chat.views._rate_limited", side_effect=AssertionError("commands bypass the limiter")):
            body = self._send(auth_client, session.id, "/memory")
        assert "event: done" in body
```

Run: `.venv/bin/python -m pytest tests/test_chat_commands.py -v` → import failures.

- [ ] **Step 2: implement `chat/commands.py`:**

```python
"""Deterministic chat slash commands — handled server-side without the LLM.

A command message never reaches the Claude Agent SDK: views.send intercepts it,
runs the handler synchronously, and streams the reply using the same SSE frame
vocabulary the normal pipeline emits.
"""
import re
from dataclasses import dataclass

_COMMAND_RE = re.compile(r"^/(?P<name>[a-zA-Z]+)(?:\s+(?P<args>.*\S))?\s*$", re.DOTALL)

HELP_TEXT = """Available commands:
/memory — list everything I remember about you
/memory add <fact> — remember a new fact
/memory edit <n> <new text> — replace fact n (numbers from /memory)
/memory forget <n or text> — forget by number or matching text
/memory clear confirm — forget everything
/help — this message

Anything else you type goes to the assistant as usual."""


@dataclass
class Command:
    name: str
    args: str


def parse_command(prompt: str):
    """Command for a leading-slash message, else None. '//' escapes to plain text."""
    text = (prompt or "").strip()
    if not text.startswith("/") or text.startswith("//"):
        return None
    m = _COMMAND_RE.match(text)
    if not m:
        return None
    return Command(name=m.group("name").lower(), args=(m.group("args") or "").strip())


def _clean_fact(raw: str) -> str:
    # Mirrors chat.tools._clean_fact (not imported: tools.py pulls the agent SDK).
    return " ".join(str(raw or "").split())[:220]


def _facts(user):
    from chat.models import UserMemory
    return list(UserMemory.objects.filter(user=user))


def _render_list(memories) -> str:
    if not memories:
        return "I have no facts saved about you yet. Use `/memory add <fact>` or just tell me something to remember."
    lines = ["What I remember about you:"]
    lines += [f"{i}. {m.content}" for i, m in enumerate(memories, 1)]
    lines.append("\nEdit with `/memory edit <n> <new text>`, remove with `/memory forget <n>`.")
    return "\n".join(lines)


def _handle_memory(user, args: str) -> str:
    from chat.models import UserMemory

    sub, _, rest = args.partition(" ")
    sub = sub.lower()
    rest = rest.strip()

    if sub in ("", "list"):
        return _render_list(_facts(user))

    if sub == "add":
        fact = _clean_fact(rest)
        if not fact:
            return "Usage: /memory add <fact>"
        if UserMemory.objects.filter(user=user, content=fact).exists():
            return f"Already remembered: {fact}"
        if UserMemory.objects.filter(user=user).count() >= UserMemory.MAX_FACTS_PER_USER:
            return (f"Memory is full ({UserMemory.MAX_FACTS_PER_USER} facts). "
                    "Remove one first with /memory forget <n>.")
        UserMemory.objects.create(user=user, content=fact)
        return f"Remembered: {fact}"

    if sub == "forget":
        if not rest:
            return "Usage: /memory forget <n or text>"
        memories = _facts(user)
        if rest.isdigit():
            idx = int(rest)
            if not 1 <= idx <= len(memories):
                return f"No fact #{idx} — there are {len(memories)} (see /memory)."
            target = memories[idx - 1]
            target.delete()
            return f"Forgot: {target.content}"
        hits = [m for m in memories if rest.lower() in m.content.lower()]
        if not hits:
            return f"No remembered facts match '{rest}'."
        for m in hits:
            m.delete()
        return "Forgot:\n" + "\n".join(f"- {m.content}" for m in hits)

    if sub == "edit":
        idx_str, _, new_text = rest.partition(" ")
        new_fact = _clean_fact(new_text)
        if not idx_str.isdigit() or not new_fact:
            return "Usage: /memory edit <n> <new text> (numbers from /memory)"
        memories = _facts(user)
        idx = int(idx_str)
        if not 1 <= idx <= len(memories):
            return f"No fact #{idx} — there are {len(memories)} (see /memory)."
        target = memories[idx - 1]
        old = target.content
        target.content = new_fact
        target.save(update_fields=["content", "updated_at"])
        return f"Updated fact {idx}:\n- was: {old}\n- now: {new_fact}"

    if sub == "clear":
        memories = _facts(user)
        if rest.lower() != "confirm":
            return (f"This deletes all {len(memories)} remembered fact(s). "
                    "Send `/memory clear confirm` to proceed.")
        count = len(memories)
        from chat.models import UserMemory as UM
        UM.objects.filter(user=user).delete()
        return f"Cleared {count} fact(s). I no longer remember anything about you."

    return f"Unknown /memory subcommand '{sub}'. {HELP_TEXT}"


def handle_command(user, command: Command) -> str:
    if command.name == "memory":
        return _handle_memory(user, command.args)
    if command.name == "help":
        return HELP_TEXT
    return f"Unknown command /{command.name}.\n\n{HELP_TEXT}"
```

- [ ] **Step 3: intercept in `views.py::send`** — READ the current method; insert after session fetch + prompt validation but BEFORE `_rate_limited` and before the SDK path:

```python
        from chat.commands import handle_command, parse_command

        command = parse_command(prompt)
        if command is not None:
            reply = handle_command(request.user, command)
            ChatMessage.objects.create(session=session, role=ChatMessage.ROLE_USER, text=prompt)
            ChatMessage.objects.create(
                session=session, role=ChatMessage.ROLE_ASSISTANT, text=reply,
                blocks=[{"kind": "text", "subagent": None, "text": reply}],
            )
            session.save(update_fields=["updated_at"])

            from chat.streaming import _sse

            def command_frames():
                yield _sse("assistant_start", {"session_id": str(session.id)})
                yield _sse("text", {"kind": "text", "subagent": None, "text": reply})
                yield _sse("assistant_end", {})
                yield _sse("done", {"session_id": str(session.id),
                                    "sdk_session_id": session.sdk_session_id or None})

            response = StreamingHttpResponse(command_frames(), content_type="text/event-stream")
            response["Cache-Control"] = "no-cache"
            response["X-Accel-Buffering"] = "no"
            return response
```

Keep the normal path untouched (its own user-message persist remains where it is — note: the command path persists its OWN user message, so ensure no double-persist by placing the interception BEFORE the existing user-persist line).

- [ ] **Step 4:** run `tests/test_chat_commands.py -v` → all pass; `pytest tests/ -q -k chat --ignore=tests/test_portfolio_api.py` → no regressions (165 + ~12 new).

- [ ] **Step 5: commit** — `git add chat/commands.py chat/views.py tests/test_chat_commands.py && git commit -m "feat(chat): deterministic /memory and /help slash commands"`

### Task 2: verification + deploy

- [ ] Backend suites green (chat-k + full minus known); `docker restart stockastic-backend`; smoke: authenticated POST of `/memory` to a session in Docker returns the SSE frames (or rely on the view tests + a manual user check).
- [ ] Note: composer autocomplete/popup is OPTIONAL future polish (frontend rebuild); `/help` is the discoverability story for v1.

## Self-review

- Frontend-compat: frame sequence matches what ChatInterface.applyFrame handles; assistant block shape matches MessageBubble's `kind` contract.
- `//` escape lets users type literal slash-leading text.
- Edit preserves fact position (in-place update; ordering by created_at unchanged).
- Cap/hygiene semantics identical to the remember tool (220 chars, 30 cap, exact-dupe).
- Rate limit: commands exempt by construction (interception before `_rate_limited`); the LLM path's limiter is untouched.
