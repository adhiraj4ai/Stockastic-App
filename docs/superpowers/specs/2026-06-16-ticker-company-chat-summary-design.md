# Per-company AI chat summary on the ticker page

**Date:** 2026-06-16
**Status:** Approved — ready for implementation plan

## Problem

A user discusses specific companies in chat (e.g. "what do you think of NMB?", "compare ADBL and EBL"). That accumulated analysis is trapped in scattered chat sessions. When the user later opens a company's ticker page, there is no single place that reflects everything they have explored about that company.

We want each ticker page to show **one rolling AI-generated text summarising what this user has discussed about this company in chat** — and only for companies they have actually asked about. A ticker the user has never chatted about shows nothing.

## Goals

- A single durable text summary per `(user, company)`, surfaced on that company's ticker page.
- Compiled from the user's **raw chat messages** about the company.
- Updated **incrementally (rolling)** after each chat turn that is about that company — mirroring the existing `ChatSession.summary` flow.
- Per-user: each user sees a summary built only from their own conversations.
- Generated with Haiku (`claude-haiku-4-5`), reusing the established summary-service pattern.
- No summary, no section — tickers the user hasn't discussed render nothing on the page.

## Non-goals

- Not shared/global summaries across users.
- Not reusing or modifying `SavedAnalysis` (explicit bookmarks — a separate, user-curated feature).
- Not a recompute-on-read approach; the summary is a persisted rolling store.
- No backfill of historical chat in v1 (summaries accrue from new turns forward). Backfill can be a follow-up.

## Approach (chosen: A)

A dedicated per-`(user, symbol)` rolling summary store, populated by a post-turn Celery fan-out that folds each new exchange into the relevant company summaries via Haiku. The ticker page fetches the single text for the current symbol.

Rejected alternatives:
- **B — derive on read from `ChatSession.summary`s.** Contradicts the raw-messages + rolling choices; slow/costly page loads.
- **C — piggyback on `SavedAnalysis`.** Conflates two distinct concerns (curated bookmarks vs. automatic per-company memory).

## Data model

New model `CompanyChatSummary` in `backend/chat/models.py`:

| Field | Type | Purpose |
|---|---|---|
| `user` | FK → User (CASCADE) | Per-user scope |
| `symbol` | CharField, indexed | NEPSE ticker, stored uppercase |
| `summary` | TextField (blank, default "") | The single rolling AI text |
| `last_message` | FK → ChatMessage (SET_NULL, null) | High-water mark: last exchange folded in; prevents double-counting / enables idempotent re-runs |
| `created_at` | DateTime (auto) | |
| `updated_at` | DateTime (auto) | Freshness display on the page |

- Unique constraint on `(user, symbol)`.
- One row per user per company.
- Migration: new chat migration.

## Ticker detection & trigger flow

Mirrors the existing post-turn `update_session_summary` enqueue.

1. A chat turn completes (user message + assistant message persisted).
2. **Detect tickers from the user message only** (intent-driven), using the existing `chat/history.py` regex + stopword list.
3. **Validate each candidate against the `Company` table** (`stocks.models.market.Company`, `symbol` field). Symbols with no matching active company are dropped — keeps junk like "PLEASE" out and avoids creating rows for non-tickers.
4. For each valid ticker, enqueue `chat.compile_company_summary(user_id, symbol, message_id)`.
5. The task:
   - Loads (or creates) the `CompanyChatSummary` for `(user, symbol)`.
   - If `last_message` already points at/after this message, no-op (idempotent).
   - Loads the new exchange (the user message + its assistant reply).
   - Calls the Haiku service to fold the exchange into the prior summary.
   - Saves the new `summary` and advances `last_message`.

Keying detection off the **user message** (not the assistant reply) prevents a market-wide answer that names many stocks from spuriously updating many companies' summaries.

**Wiring location:** the same post-turn hook that already enqueues `update_session_summary`, so there is a single post-turn place that fans out summary work, not two scattered call sites.

## Haiku summary service

New function in `backend/chat/summary_service.py`, alongside `build_summary`:

```
build_company_summary(prior_summary: str, exchange, symbol: str) -> str
```

- Reuses the existing `ClaudeAgentOptions` + `ClaudeSDKClient` pattern: model `claude-haiku-4-5`, `max_turns=1`, `tools=[]`, `allowed_tools=[]`, `permission_mode="bypassPermissions"`.
- New system prompt: maintain a running, company-specific analytical summary of what *this user* has discussed about `{symbol}` — durable facts, theses, verdicts, open questions; a single coherent text; ≤ ~200 words; drop chit-chat.
- Falls back to `prior_summary` if the model returns no output (same as `build_summary`).
- A `MAX_COMPANY_SUMMARY_CHARS` constant caps stored length (named constant, no magic number).

## API

The ticker page already fetches from `/api/stocks/`, so the new endpoint lives there for locality.

- `GET /api/stocks/details/<ticker>/ai-summary/` (exact route name finalised in the plan; a dedicated `company-chat-summary` path is acceptable).
- Scoped to `request.user`; auth required.
- Returns `{ symbol, summary, updated_at }` when a summary exists.
- Returns an empty/`204` response when none exists → the page renders nothing.
- A user can never see another user's summary.

## Frontend

`frontend/src/app/(authenticated)/ticker/[ticker]/page.tsx`:

- New card titled in sentence case, e.g. "Your AI notes on {symbol}" (warm sans-serif, no all-caps, consistent with house style).
- Placed after the IntelligenceGlass row.
- Renders `summary` as markdown, with a subtle "updated {relative time}" line (relative time via existing utilities).
- **Hidden entirely when the summary is empty/absent** — no placeholder, no empty state. Satisfies "not on others unless asked".

## Error handling

- Ticker detection / fan-out failures log and no-op — must never break the chat turn (same defensive posture as `update_session_summary`).
- Haiku failure → keep the prior summary.
- Unknown / non-`Company` symbols silently skipped.
- Task is idempotent via `last_message`.

## Testing (TDD)

Tests written first, per repo policy. Mock the Claude SDK client as existing summary-service tests do.

**Ticker detection helper**
- Extracts valid symbols from the user message; drops stopwords; drops symbols with no `Company` row; handles multi-ticker turns (e.g. "compare ADBL and EBL" → both).

**`compile_company_summary` task**
- Creates a row on first mention.
- Rolls/updates `summary` on subsequent mentions and advances `last_message`.
- Idempotent: re-running on the same message is a no-op.
- Failure path keeps prior summary and does not raise.

**`build_company_summary` service**
- Builds from prior + exchange; falls back to prior on empty SDK output.

**API**
- Returns the authenticated user's summary for a ticker.
- Empty/204 when none exists.
- Auth required; user A cannot read user B's summary.

## Clean-code notes

- Detection and fan-out extracted into small named helpers to stay within the 30-line-per-function limit.
- No magic numbers/strings — caps and model id as named constants.
- One responsibility per function; reuse the existing SDK-call pattern rather than duplicating it.
