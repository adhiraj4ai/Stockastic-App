# Chat conversation history + rolling summary — design

**Date:** 2026-06-13
**Status:** Approved for planning
**Area:** `backend/chat/`

## Problem

Follow-up chats lose context. When a user refers back to a previous question or
answer ("explain that", "why did you say sell?"), the orchestrator often has no
prior conversation context.

The chat backend already persists `ChatSession.sdk_session_id` and passes it to
the Claude Agent SDK via `resume=`. But that mechanism is fragile:

- Notebook sessions explicitly reset `sdk_session_id` (`views.py`).
- Stale SDK sessions silently fall back to a fresh session (`agent.py`).
- `_format_prompt` injects only date, username, user memory, and the saved-analyses
  hint plus the **current** message — no prior turns.

When SDK resume is reset or goes stale, the model has zero conversation context.

## Goal

Make conversation context robust **independent of** SDK resume, while keeping
prompts lean:

1. **Recent window** — inject the last 3 exchanges verbatim, but **only when the
   current message reaches back** to prior context (heuristic-gated).
2. **Rolling summary** — a running natural-language summary of the whole session,
   maintained asynchronously and **always** injected so the agent never fully
   loses the thread.

Both layers are belt-and-suspenders on top of the existing `sdk_session_id`
resume, which stays as-is.

## Key decisions

- **Strategy:** Belt-and-suspenders. SDK resume unchanged; explicit context added.
- **Hop definition:** 1 hop = one user message + that turn's assistant final-text
  reply (joined `text` blocks). Thinking/tool/card blocks are excluded. Inject the
  last 3 exchanges (≤6 messages).
- **Gating:** A fast heuristic detector decides whether the message references
  prior context. When it fires → inject the verbatim 3-hop window. The rolling
  summary is injected on **every** turn (small, cheap).
- **Summary generation:** Async, after the turn is persisted, via a Celery task
  using a cheap model (Haiku 4.5). Incremental: `prior summary + newest exchange
  → new summary`. Never on the request hot path.
- **Skip-while-short:** The summary task is a no-op while the session has ≤ 3
  exchanges, since the full 3-hop window already covers that range.
- **Scope:** Orchestrator-only. Subagents remain task-scoped; the orchestrator
  relays any needed context into its `Task` prompts.

## Data model

Add one field to `ChatSession` (new migration in `chat/`):

- `summary` — `TextField(blank=True, default="")`. The rolling session summary.

No new tables. The recent window is read from existing `ChatMessage` rows
(already ordered by `created_at`). Existing sessions default to an empty summary
and build forward — no backfill.

## Components (single-responsibility)

- **`chat/history.py`**
  - `recent_exchanges(session, hops=HISTORY_HOPS) -> list[Exchange]` — pull the
    last N user→assistant exchange pairs.
  - `format_exchanges(exchanges) -> str` — render compact text, truncating each
    assistant reply to `MAX_REPLY_CHARS_IN_HISTORY` with a trailing `…` marker.
  - `references_prior_context(message: str) -> bool` — the heuristic detector.
  - Pure functions; no model calls. Easily unit-tested.

- **`chat/summary_service.py`**
  - `build_summary(prior_summary: str, new_exchange: Exchange) -> str` — the cheap
    model call that folds the newest exchange into the running summary.
  - Separated from the Celery task wrapper so it can be tested with the model
    mocked.

- **`chat/tasks.py`**
  - `update_session_summary(session_id)` — Celery task. No-op when exchange count
    ≤ `SUMMARIZE_AFTER_EXCHANGES`. Otherwise loads the session, calls
    `build_summary`, saves `ChatSession.summary`. Errors are logged and swallowed.

- **`chat/agent.py`**
  - `_format_prompt` extended with two new template values.
  - New fetch helpers (async-wrapped) for recent exchanges + summary.

- **`chat/streaming.py`**
  - After `_persist_turn` succeeds, enqueue `update_session_summary.delay(...)`.

- **`chat/prompts/orchestrator.yaml`**
  - User template gains `[Conversation summary]` and `[Recent conversation]`
    sections placed before `{message}`.

## Heuristic detector

`references_prior_context(message)` returns `True` when the message looks like a
follow-up rather than a standalone query. Signals (case-insensitive):

- Back-reference pronouns / deixis with no new entity: "it", "that", "those",
  "them", "this", "above", "earlier", "before".
- Explicit references: "you said", "you mentioned", "as you", "previously",
  "the previous", "last one", "that stock", "same".
- Elaboration cues with no new ticker: "why", "explain", "more", "what about",
  "and", "also", "instead", "compare to that".
- A standalone message that names a concrete ticker/sector and asks a complete
  question is treated as fresh (detector returns `False`).

Tuning is keyword/pattern-driven and lives entirely in `history.py` so it can be
extended without touching the request path. Misclassification is low-cost: a
missed follow-up still has the always-on summary; a false positive just adds a
few hundred tokens of recent window.

## Data flow

**Request path (`agent.py`):**

1. Read `session.summary` (always).
2. If `references_prior_context(message)` → `recent_exchanges(session, 3)` →
   `format_exchanges(...)`; else recent window is empty.
3. `_format_prompt` renders `[Conversation summary]` (or a "(none yet)" placeholder)
   and `[Recent conversation]` (or a placeholder) before the current message.

**After turn (async):**

4. `streaming.stream_chat` → after `_persist_turn`, enqueue
   `update_session_summary.delay(session_id)`.
5. Task: if exchanges ≤ 3, return. Else `build_summary(prior, newest)` → save.
   Incremental cost is flat regardless of session length. Failures logged, never
   surfaced to the user.

## Constants (no magic numbers)

- `HISTORY_HOPS = 3`
- `MAX_REPLY_CHARS_IN_HISTORY = 600`
- `SUMMARIZE_AFTER_EXCHANGES = 3`
- `SUMMARY_MODEL = "claude-haiku-4-5-20251001"`
- `MAX_SUMMARY_CHARS` — bound the stored summary length.

## Error handling

- Summary task failure → logged, swallowed; stale summary persists until the next
  successful run. Chat is never affected.
- Empty/short history or empty summary → render placeholders, mirroring the
  existing memory block convention.
- Truncated assistant replies are marked with `…` so the model knows text is clipped.

## Testing (TDD)

- **`history.py`**
  - 3-hop windowing; sessions with fewer than 3 exchanges; correct user→assistant
    pairing; truncation at the char cap; ignores thinking/tool/card blocks.
  - `references_prior_context`: fires on back-references; returns `False` on a
    standalone ticker question; a table of positive/negative phrases.
- **`summary_service`**
  - Prompt assembly given `(prior_summary, new_exchange)` with the model mocked.
- **`tasks`**
  - No-op under threshold; calls service and saves above threshold; swallows and
    logs errors.
- **`agent._format_prompt`**
  - Renders both new sections; gated window present only when the detector fires;
    summary always present.

## Out of scope

- Backfilling summaries for existing sessions.
- Changing the SDK resume mechanism.
- Surfacing the summary in the frontend UI (internal context only).
- Passing history/summary to subagents.
