# Saved Analyses (Chat Bookmarks) — Design

**Date:** 2026-06-12
**Status:** Approved direction (user confirmed full design + 3 enhancements)
**Builds on:** chat MCP server (`chat/tools.py` `STOCKASTIC_MCP_SERVER`, `create_sdk_mcp_server`,
`@tool` pattern, `_result`/`push_card`), per-turn user context (`chat/_user_context.py`
`ContextVar` + `get_user()`/`set_user()`), prompt assembly (`chat/agent.py`
`_format_prompt`/`run_chat_session`, `UserMemory` injection), subagents
(`chat/subagents.py` `AgentDefinition.tools` + `tool_id()`), Notebook sessions.

## Problem

Chat analyses are ephemeral. A user who runs the *same recurring analysis* — e.g.
quarterly fundamentals for GBIME — has no way to save that work and have the agent
build on it next quarter. There is no notion of a saved, taggable, retrievable
analysis, and the agent cannot say "here's what changed since last quarter."

We want: **save a thread as a frozen, tagged analysis; let the agent autonomously
recall relevant prior analyses (LLM-judged) and surface the trend across a recurring
series; plus a fast live hint while typing.**

## Verified architecture facts (scouted)

- **MCP tools** live in `chat/tools.py`. Pattern: `@tool(name, description, args_schema)`
  on `async def fn(args: dict) -> dict`, DB work wrapped in `@sync_to_async`, returning
  `_result(prose, card={"type": ..., "data": ...}, _tool_name=name)`. `_result`
  side-channels the card via `push_card` and returns `{"content":[{"type":"text",...}], "is_error":bool}`.
  Tools are collected into `ALL_TOOLS` → `STOCKASTIC_MCP_SERVER`.
- **User scoping**: `chat/_user_context.py` exposes a `ContextVar`. `run_chat_session`
  calls `_user_context.set_user(user)` (agent.py); tools call `get_user()` (raises if
  unauthenticated). Async-safe, per-turn isolated. New tools MUST scope every query to
  `get_user()`.
- **Subagent tool grants**: `chat/subagents.py` `AgentDefinition(tools=[tool_id("...")])`;
  `tool_id(name)` → `mcp__stockastic__<name>`. Six agents defined: MARKET_ANALYST,
  STOCK_ANALYST, BUY_SELL_STRATEGIST, PORTFOLIO_ADVISOR, PORTFOLIO_MANAGER,
  BROKER_INTELLIGENCE. Orchestrator (`agent.py` `_build_options`) is `Task`-only and
  delegates; it does NOT get MCP tools directly.
- **Prompt injection**: `agent.py` `_format_prompt(user, message, memory)` renders
  `orchestrator.yaml`'s user template with `{date}/{username}/{memory}/{message}`.
  `run_chat_session` fetches `UserMemory` via `sync_to_async` and passes it as `memory`.
  `_safe_prompt_value` sanitizes; `str.format` substitutes literally (no brace
  re-interpretation), so injected text needs a length cap + control-char hygiene.
- **Structured blocks**: assistant turns persist `ChatMessage.blocks` (JSONField) as a
  list of `{"kind":"card","type":...,"data":{...},"tool":...}` (streaming.py). The
  buy_sell verdict card is `{"type":"ticker_verdict","data":{...}}` (also `"signal"`
  with `verdict`/`confluence_score`). We detect these to capture a high-fidelity summary.
- **Models**: `ChatSession{id uuid, user FK, title, sdk_session_id, created_at, updated_at}`,
  `ChatMessage{session FK, role, text, blocks JSON, token counts, created_at}`.
  Notebook runs reuse `ChatSession` with title prefix `"Notebook Session:"` and never
  resume `sdk_session_id` (each cell runs fresh). chat app migrations tracked (latest 0005).

## Data model — new `SavedAnalysis` (chat app)

A dedicated table (NOT flags on `ChatSession`) because a saved analysis is a **frozen
snapshot** that must survive edits/deletion of the originating chat.

```python
class SavedAnalysis(models.Model):
    id          = UUIDField(primary_key, default=uuid4)
    user        = FK(User, on_delete=CASCADE, related_name="saved_analyses")
    session     = FK(ChatSession, on_delete=SET_NULL, null=True, blank=True,
                     related_name="saved_analyses")        # transcript link; SET_NULL = survives chat deletion
    title       = CharField(max_length=255)
    summary     = TextField()                              # frozen synthesis (markdown)
    one_liner   = CharField(max_length=280, blank=True)    # catalog preview + live-hint label
    category    = CharField(max_length=64, blank=True)     # e.g. "Quarterly Fundamentals" (AI-suggested)
    tags        = JSONField(default=list, blank=True)      # ["Q3-FY81", "fundamentals"]
    tickers     = JSONField(default=list, blank=True)      # ["GBIME"] (detected; uppercased)
    series_key  = CharField(max_length=128, blank=True, db_index=True)  # groups a recurring series
    verdict     = CharField(max_length=16, blank=True)     # captured if a verdict block existed
    structured  = JSONField(default=dict, blank=True)      # captured verdict/signal card data, if any
    created_at  = DateTimeField(auto_now_add=True, db_index=True)
    updated_at  = DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["user", "series_key", "created_at"])]
```

**Series (enhancement #1):** `series_key` links recurring analyses into one timeline.
On the draft, the backend proposes a `series_key` derived from `tickers[0]` + `category`
(e.g. `"GBIME · Quarterly Fundamentals"`); user can edit/clear it in the modal. New
migration: `chat/migrations/0006_savedanalysis.py`.

## Summarization (capture) — `chat/services/analysis_capture.py`

`build_draft(session) -> dict` produces `{title, summary, one_liner, category, tags,
tickers, series_key, verdict, structured}`:

1. **Capture structured verdict (enhancement #3):** scan the session's assistant
   `ChatMessage.blocks` for a `ticker_verdict`/`signal` card. If found, seed
   `structured`, `verdict`, `tickers` from it (high-fidelity, free).
2. **Summarize:** one Claude **Haiku 4.5** call over the thread text → `title`,
   `summary` (structured markdown: findings / key metrics / verdict / date),
   `one_liner`, suggested `category`, `tags`, and `tickers` (merged with step 1).
   Prompt instructs strict JSON output; parsed defensively.
3. **Fallback:** if the LLM call fails, build a naive draft (first user question +
   last assistant `text`, tickers via regex) so save never hard-fails. Returns a
   `degraded: true` flag the modal surfaces ("summary unavailable — saved raw").

Model id pulled from settings (reuse existing chat model config); call is read-only and
does not touch the SDK session.

## Backend API (`chat/views.py`, `chat/serializers.py`, `chat/urls.py`)

- `POST /api/chat/sessions/{id}/bookmark_draft/` → runs `build_draft`, returns the
  editable draft (no persistence). Owner-checked.
- `SavedAnalysisViewSet` (ModelViewSet, `IsAuthenticated`, `get_queryset` filtered to
  `request.user`):
  - `POST   /api/chat/saved/`            create (persist confirmed draft)
  - `GET    /api/chat/saved/`            list; query params `?ticker=&category=&tag=&series_key=&q=`
  - `GET    /api/chat/saved/{id}/`       retrieve (full summary)
  - `PATCH  /api/chat/saved/{id}/`       edit title/tags/category/series_key
  - `DELETE /api/chat/saved/{id}/`       delete
  - `GET    /api/chat/saved/suggest/?q=` **live-hint** lexical match (see below)
- `SavedAnalysisSerializer`: all fields writable except `id/user/created_at/updated_at`;
  list view may use a lighter serializer (omit full `summary`) for the catalog.
- Notebook support: `bookmark_draft` accepts any of the user's sessions, including
  `"Notebook Session:"` ones — same capture path, so saving from a notebook cell works
  with no special casing.

## Recall path 1 — Agent (LLM-judged) MCP tools

Two new tools in `chat/tools.py`, both `get_user()`-scoped, added to `ALL_TOOLS`:

- `search_saved_analyses(args)` — args `{query?, ticker?, category?, tag?, series_key?, limit=20}`.
  Cheap user-scoped filter; returns a **compact catalog** (no full summaries):
  `[{id, title, category, tags, tickers, series_key, date, one_liner, verdict}]` as prose
  + `card={"type":"saved_analyses","data":{...}}`. The agent reads it and judges relevance.
- `get_saved_analysis(args)` — args `{id}`. Returns the full frozen `summary` (+ `structured`,
  series siblings ordered by date for trend context) + a transcript link
  (`/chat?session=<session_id>` or "original chat deleted" if `session` is null).
  `card={"type":"saved_analysis","data":{...}}`.

**Granted to** STOCK_ANALYST, MARKET_ANALYST, BUY_SELL_STRATEGIST, PORTFOLIO_ADVISOR,
BROKER_INTELLIGENCE (add both `tool_id(...)`s to each `tools=[...]`). PORTFOLIO_MANAGER
omitted (it acts on portfolio, not analysis). Each affected subagent prompt gets one line:
*"Before a fundamental/technical analysis, call search_saved_analyses for this
ticker/topic; if a prior analysis or series exists, fetch it and surface what changed
across the series."*

## Recall path 2 — Prompt-time seeding (enhancement #2)

Reuse the same lexical matcher as the live hint. In `run_chat_session`, after fetching
memory, run a fast user-scoped match of the incoming `prompt` against the user's
`SavedAnalysis` (title/tags/tickers/one_liner keyword overlap, top 3). Inject a sanitized,
length-capped hint block into `_format_prompt` (extend signature + `orchestrator.yaml`
template with a `{saved_hint}` slot):

```
[Saved analyses you may build on]
- GBIME · Quarterly Fundamentals (2026-03-10): "Q2 FY81 — EPS up, NPL flat" [series of 2]
```

This guarantees the agent *knows* relevant analyses exist; it then uses the MCP tools to
fetch full detail on demand. Empty → "(no related saved analyses)". Matcher lives in
`chat/services/saved_match.py` so the suggest endpoint and prompt seeding share one impl.

## Live hint (frontend) — `suggest` endpoint + composer chip

- As the user types in the chat composer, **debounced (~300ms) on word boundary**, call
  `GET /api/chat/saved/suggest/?q=<text>` → top lexical matches
  `[{id, title, one_liner, series_key, tickers}]`.
- Render an unobtrusive **hint chip** above the input: *"📌 Related saved analysis:
  GBIME Q2 Fundamentals"*. Click → attach: prepend an explicit reference to the outgoing
  message (e.g. `[Reference saved analysis <id>: GBIME Q2 Fundamentals]`) so the agent
  reliably fetches it. Ignorable; non-blocking. Reuses the same matcher as path 2 (lexical,
  not the LLM judge).

## Browse UI (both surfaces)

- **Chat sidebar section** — extend `components/chat/SessionList.tsx` with a collapsible
  "Saved" group listing the user's `SavedAnalysis` (title + ticker/category chips). Click
  opens the summary (modal or `/bookmarks/[id]`); a link jumps to the original transcript.
  Matches the minimal-nav, sidebar-is-the-nav preference.
- **Dedicated `/bookmarks` catalog page** (`app/(authenticated)/bookmarks/`) — full library
  with filters (ticker, category, tag, series, date) and **series grouping** (a series
  renders as a timeline of its snapshots). Reuses the list endpoint with query params.
- **Save flow UI** — a "Save analysis" action on a thread (chat header + notebook cell) →
  calls `bookmark_draft` → opens a confirm modal (`components/chat/SaveAnalysisModal.tsx`)
  with editable title/summary/one_liner/category/tags/tickers/series_key → confirm POSTs to
  `/api/chat/saved/`.
- **API client**: extend `lib/api.ts` with a `savedApi` (draft, CRUD, suggest); types in
  `components/chat/types.ts` (`SavedAnalysis`, `SavedAnalysisDraft`).

## Error handling

- Summarization failure → naive fallback draft with `degraded: true` (save still works).
- Deleted originating chat → `session` is `SET_NULL`; tools/UI show "original chat deleted",
  frozen `summary` remains the source of truth.
- MCP tools: `get_user()` enforces auth; unknown/foreign `id` → `is_error` result with a
  clear message (never leak another user's data — queryset filtered by user first).
- Injected prompt hint: length-capped + control-char-stripped via `_safe_prompt_value`.
- Suggest endpoint: empty/short `q` → empty list (no error); cap result size.

## Testing

**Backend**
- Model: creation, `SET_NULL` on chat delete, ordering, series index.
- `build_draft`: captures an existing `ticker_verdict` block; LLM path (mocked) parses
  JSON; fallback path on LLM error sets `degraded`.
- `saved_match`: lexical ranking by title/tag/ticker overlap; user-scoping.
- ViewSet: owner-scoped list/CRUD; `suggest` filtering; `bookmark_draft` owner check;
  cross-user access denied.
- MCP tools: `search_saved_analyses` returns compact catalog scoped to `get_user()`;
  `get_saved_analysis` returns full summary + series siblings; foreign id rejected.
- Prompt seeding: `run_chat_session` injects the hint block when matches exist; empty
  otherwise; sanitization applied.
- Subagent grants: the five agents include both new `tool_id`s; orchestrator unchanged.

**Frontend**
- `SaveAnalysisModal`: renders draft, edits persist on confirm, degraded banner shows.
- Sidebar "Saved" section + `/bookmarks` catalog render and filter; series timeline groups.
- Composer hint: debounced suggest call, chip render, click-to-attach prepends reference.
- Formatting test for any new metric/series rendering (mirror existing `*.test.tsx`).

## Out of scope (YAGNI)

- Semantic/embedding search (user chose LLM-judged + lexical; no vector infra).
- Agent auto-creating bookmarks (manual save only for v1).
- Sharing bookmarks between users; export.
- Reusing Notebook/UserMemory tables for storage (dedicated table keeps concepts clean).

## Deploy notes

- `python manage.py migrate chat` (new `0006_savedanalysis`).
- Frontend image rebuild (localhost:3000 is Docker-built) + hard refresh.
- No new beat tasks; Haiku summarization uses existing chat model credentials.
