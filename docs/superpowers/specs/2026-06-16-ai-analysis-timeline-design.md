# AI analysis timeline on the ticker page

**Date:** 2026-06-16
**Status:** Approved — ready for implementation plan
**Builds on:** `2026-06-16-ticker-company-chat-summary-design.md` (the `CompanyChatSummary` feature this supersedes)

## Problem

The just-shipped `CompanyChatSummary` keeps a single rolling text per `(user, company)` that is overwritten on every chat turn — so the *history* of how the user's analysis evolved is lost. But a stock's technical and fundamental picture (and the user's read of it) keeps changing. We want a per-user, time-ordered **timeline** of how the AI analysis of a company evolved, shown in a dedicated "AI analysis" tab on the ticker page, with the existing card surfacing the latest point.

## Goals

- Per-user, chat-derived: the timeline reflects how *this user's* AI analysis of the company evolved through their chats.
- A new entry is created only on **AI-judged material change**; otherwise the latest entry is refined in place.
- Each entry is **structured**: an analysis snapshot plus a stance (bullish/neutral/bearish), the aspect that drove it (technical/fundamental/both), and a one-line "what changed".
- **Single source of truth**: the timeline store replaces `CompanyChatSummary`. The existing card shows the latest entry; the new tab shows the full series.
- Generated with Haiku, reusing the established one-shot Agent SDK call.
- A malformed model response can never corrupt the timeline or break the chat turn.

## Non-goals

- Not global/shared analysis; not scheduled data-driven snapshots (chat-driven only).
- Not a merge of multiple streams (no hybrid).
- No retroactive backfill of past chat history beyond seeding one entry per existing `CompanyChatSummary` row in the migration.
- No cross-entry diff computation beyond the AI-authored `change_note`.

## Approach (chosen: A)

The timeline becomes the single store. A new `CompanyAnalysisEntry` model holds the dated series. Each relevant chat turn loads the user's latest entry as "prior", makes one structured Haiku call, and either creates a new entry (material change / first mention) or refines the latest entry in place. `CompanyChatSummary` is removed by a data-preserving migration.

Rejected alternatives:
- **B — keep `CompanyChatSummary` as a rolling buffer + append snapshots.** Two overlapping stores; the card would show the buffer, not the latest entry.
- **C — store the timeline as a JSON array on `CompanyChatSummary`.** One unbounded row; poor to query/paginate; harder to test.

## Data model

New model `CompanyAnalysisEntry` in `backend/chat/models.py`:

| Field | Type | Purpose |
|---|---|---|
| `user` | FK → User (CASCADE) | Per-user scope |
| `symbol` | CharField(max_length=20), db_index | NEPSE ticker, stored uppercase |
| `summary` | TextField (blank, default "") | Analysis snapshot at this point (markdown) |
| `stance` | CharField(max_length=8), choices | `bullish` / `neutral` / `bearish` |
| `aspect` | CharField(max_length=12), choices | `technical` / `fundamental` / `both` |
| `change_note` | CharField(max_length=240, blank, default "") | One-line "what changed since last time" |
| `source_message` | FK → ChatMessage (SET_NULL, null) | Idempotency high-water mark of the latest entry |
| `created_at` | DateTimeField(auto_now_add) | Entry date (timeline ordering) |
| `updated_at` | DateTimeField(auto_now) | Last in-place refine |

- Stance/aspect choices declared as named constants on the model (e.g. `STANCE_BULLISH = "bullish"`, `STANCE_CHOICES = [...]`; `ASPECT_BOTH = "both"`, etc.). Defaults: `stance=neutral`, `aspect=both`.
- `Meta.ordering = ["-created_at"]`; index on `(user, symbol, -created_at)`.
- The **latest** entry per `(user, symbol)` (max `created_at`) is the "current view".
- No unique constraint (multiple entries per user+symbol over time).

## Service

In `backend/chat/summary_service.py`, replace `build_company_summary` with a structured builder. Keep reusing `_run_summary(prompt, system)` (the one-shot Haiku call) and `format_exchanges`.

Result type — a frozen dataclass (module-level):

```
@dataclass(frozen=True)
class CompanyAnalysisResult:
    materially_changed: bool
    summary: str
    stance: str        # one of STANCE_CHOICES values
    aspect: str        # one of ASPECT_CHOICES values
    change_note: str
```

`build_company_analysis(prior_entry, exchanges, symbol) -> CompanyAnalysisResult`:
- Builds a prompt that includes the symbol, the prior entry's summary/stance (or "(no prior analysis)"), and `format_exchanges(exchanges)`.
- System prompt `COMPANY_ANALYSIS_SYSTEM`: maintain a per-company analytical view for one user; return **strict JSON** with keys `materially_changed` (bool), `summary` (≤~200 words plain prose), `stance` (bullish|neutral|bearish), `aspect` (technical|fundamental|both), `change_note` (≤1 sentence). No markdown fences, no preamble.
- Runs `asyncio.run(_run_summary(prompt, COMPANY_ANALYSIS_SYSTEM))`, then `_parse_analysis(text, prior_entry)`.

`_parse_analysis(text, prior_entry) -> CompanyAnalysisResult`:
- Strips optional ```json fences, `json.loads`, validates keys/enum values.
- Truncates `summary` to `MAX_COMPANY_SUMMARY_CHARS` and `change_note` to 240.
- On any failure (bad JSON, missing keys, invalid enum): return a safe fallback — `materially_changed=False`, and the prior entry's `summary`/`stance`/`aspect` if a prior exists, else `summary=""`, `stance=neutral`, `aspect=both`, `change_note=""`. This guarantees a malformed response neither corrupts the timeline nor raises.

Helpers stay under the 30-line limit; enum value sets are shared constants (imported from the model or defined once in the service).

## Task flow

In `backend/chat/tasks.py`, rename `compile_company_summaries` → `compile_company_analysis` (and update the `@shared_task(name="chat.compile_company_analysis")`). Reuse `_tracked_symbols` and `recent_exchanges` unchanged.

1. Load session (DoesNotExist → return).
2. `exchanges = recent_exchanges(session, hops=1)`; `latest_message` = newest assistant message; if either missing → return.
3. `exchange = exchanges[-1]`. For each `symbol in _tracked_symbols(exchange.user_text)`:
   - `_fold_company_analysis(session.user, symbol, exchange, latest_message)` in a per-symbol `try/except` that logs and continues.

`_fold_company_analysis(user, symbol, exchange, latest_message)`:
- `prior = CompanyAnalysisEntry.objects.filter(user=user, symbol=symbol).order_by("-created_at").first()`
- If `prior is not None and prior.source_message_id == latest_message.id` → return (idempotent).
- `result = summary_service.build_company_analysis(prior, [exchange], symbol)`.
- If `prior is None or result.materially_changed` → **create** a new `CompanyAnalysisEntry(user, symbol, summary, stance, aspect, change_note, source_message=latest_message)`.
- Else → **update** `prior` in place (`summary`, `stance`, `aspect`, `change_note`, `source_message=latest_message`) and save.
- Build happens before any DB write; an exception leaves no partial row.

`streaming.py` enqueue updated to call `compile_company_analysis.delay(str(session.id))` (alongside `update_session_summary`).

## API

Both function-based DRF views under `/api/stocks/`, `IsAuthenticated`, scoped to `request.user`.

- `GET /api/stocks/company-summary/<ticker>/` — **repointed** to the latest entry. Returns `{symbol, summary, stance, aspect, updated_at}` or `204` when none / blank summary.
- `GET /api/stocks/company-analysis/<ticker>/` — **new**. Returns the series newest-first: a list of `{summary, stance, aspect, change_note, created_at}`. Empty list with `200` when none (frontend treats empty list as "no timeline"); never leaks other users' entries.

Latest-entry helper: `CompanyAnalysisEntry.objects.filter(user, symbol).order_by("-created_at").first()`.

## Frontend

`frontend/src/app/(authenticated)/ticker/[ticker]/page.tsx` and components:

- **`ChatNotesCard`** (existing): extend `ChatNotes` type with `stance` and `aspect`; render a small stance badge next to the "Your AI notes on {symbol}" heading (bullish = positive tone, bearish = negative, neutral = muted). Still hidden when empty; still renders the latest snapshot markdown.
- **New "AI analysis" tab**: add a `TabsTrigger`/`TabsContent` value `ai_analysis` to the existing `Tabs` block (sentence-case label "AI analysis"). It renders a new `CompanyAnalysisTimeline` component fed by `GET /api/stocks/company-analysis/<ticker>/`.
- **`CompanyAnalysisTimeline`** (new component, `src/components/ticker/CompanyAnalysisTimeline.tsx`): a vertical timeline, newest at top. Each entry row: relative date (`date-fns`), stance badge, aspect badge (technical/fundamental/both), the `change_note` as the headline, and an expandable markdown `summary` (reuse `react-markdown` + `MarkdownComponents`). Empty state: a quiet line "No AI analysis yet — discuss this stock in chat to build one." House style: warm sans, sentence-case, no all-caps, no monospace.

## Migration

New chat migration(s):
1. Create `CompanyAnalysisEntry`.
2. Data migration: for each existing `CompanyChatSummary`, create a `CompanyAnalysisEntry(user, symbol, summary=summary, stance=neutral, aspect=both, change_note="Imported from earlier notes", source_message=last_message)` and copy `created_at` (via `update` after create, or set in the data migration). Skip rows with blank summaries.
3. Delete the `CompanyChatSummary` model.

Use `apps.get_model` in the data migration; make it reversible-safe (reverse = no-op). Deploy notes: migrate chat + restart Celery (new task name) + frontend rebuild.

## Error handling

- Malformed/partial Haiku JSON → `_parse_analysis` falls back to "not materially changed, keep prior" — never raises, never writes junk.
- Per-symbol task failures log via `log.exception` and continue.
- Enqueue remains wrapped in `streaming.py` so summary work can't break the chat turn.
- Unknown / non-`Company` symbols skipped (unchanged).
- Idempotency via the latest entry's `source_message`.

## Testing (TDD)

Mock the Claude SDK / `build_company_analysis` as the existing summary tests do.

**Model**
- Defaults (`stance=neutral`, `aspect=both`), choices accepted, `-created_at` ordering, latest-entry query returns newest.

**Service `_parse_analysis` / `build_company_analysis`**
- Valid JSON (with and without ```json fences) → correct fields; `summary`/`change_note` truncated.
- Malformed JSON, missing keys, invalid enum → fallback to prior entry's values with `materially_changed=False`.
- No prior → safe empty default (`neutral`/`both`).

**Task `compile_company_analysis`**
- First mention → creates one entry.
- `materially_changed=True` → second turn creates a 2nd entry (count == 2), newest reflects new fields.
- `materially_changed=False` → updates latest in place (count stays 1; fields refreshed; `source_message` advanced).
- Idempotent: re-run on same message is a no-op (no extra entry, no extra service call).
- Detection still keys off the user message (assistant-only mentions create nothing).
- Build error is swallowed; no partial row.

**API**
- Latest endpoint: returns newest entry incl. `stance`/`aspect`; 204 when none; auth required; no cross-user leak.
- Timeline endpoint: returns entries newest-first; `[]` when none; auth required; user A cannot read user B's series.

**Migration**
- A `CompanyChatSummary` row becomes a seed `CompanyAnalysisEntry` (stance=neutral, aspect=both, summary preserved); blank-summary rows skipped.

## Clean-code notes

- Detection/fan-out helpers and `_parse_analysis` kept small (≤30 lines); reuse existing `_tracked_symbols`, `recent_exchanges`, `_run_summary`, `format_exchanges`.
- Stance/aspect as named constants, no magic strings; summary/note caps as named constants.
- One responsibility per function; the structured-output parse is isolated and independently testable.
