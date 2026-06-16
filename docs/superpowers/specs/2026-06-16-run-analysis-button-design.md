# Ad-hoc "Run analysis" button

**Date:** 2026-06-16
**Status:** Approved — ready for implementation plan
**Builds on:** `2026-06-16-ai-analysis-timeline-design.md` (the `CompanyAnalysisEntry` timeline this extends)

## Problem

The AI analysis timeline currently grows only as a side effect of chat turns. A user can't deliberately ask "analyze this stock now" — but the technical and fundamental picture keeps moving between conversations. We want a **"Run analysis" button** in the AI analysis tab that, on demand, produces a fresh analysis entry from the company's **current market data**, folded against the user's prior view.

## Goals

- A button in the ticker page's AI analysis tab that runs an analysis on demand.
- The run analyzes the **current technical/fundamental read** (reuse `build_verdict(symbol)`) folded against the user's latest entry.
- Runs **synchronously**: the request performs the analysis (~5s) and returns the new/updated latest entry; the timeline refreshes immediately.
- Reuses the existing structured-output contract and create-vs-refine semantics: a real shift creates a new timeline point; unchanged data refines the latest entry in place (no entry spam).
- With no prior entry, a run **bootstraps** the first one.
- Per-user, auth-scoped; never leaks another user's entries.
- Never raises into the request: missing data or malformed model output degrades gracefully to the prior view.

## Non-goals

- No async/Celery + polling (synchronous by decision).
- No new chat input; the run is data-driven, not conversation-driven.
- No scheduled/automatic data-driven runs (this is a manual button only).
- No change to the chat-driven generation path beyond a DRY refactor (extracting the shared write helper).

## Approach (chosen)

A thin synchronous DRF POST endpoint delegates to a new `chat`-side runner. The runner pulls the live verdict, folds it against the prior entry via a new structured Haiku call, and writes the result through a shared create-vs-refine helper (extracted from the existing chat fold so both paths share one write).

Rejected alternatives:
- **Async enqueue + poll** — ruled out by the synchronous decision; adds polling complexity and delay.
- **Reuse the chat task with a synthesized fake exchange** — hacky; couples a data-driven run to chat-message plumbing.

## Backend

### Service (`backend/chat/summary_service.py`)

`build_company_analysis_from_market(prior_entry, symbol, verdict) -> CompanyAnalysisResult`:
- Reuses `_run_summary` (one-shot Haiku) and the existing `_parse_analysis` (same JSON schema + defensive fallback).
- New `MARKET_ANALYSIS_SYSTEM` prompt: same role as `COMPANY_ANALYSIS_SYSTEM` but framed around current market data rather than a chat exchange; returns the same JSON keys (`materially_changed`, `summary`, `stance`, `aspect`, `change_note`).
- New `_market_analysis_prompt(prior_entry, symbol, verdict)`: includes the symbol, the prior view (stance + summary, or "(no prior analysis)"), and a compact `_summarize_verdict(verdict)` string.
- `_summarize_verdict(verdict) -> str`: a pure helper turning the verdict dict into a short line — confluence score, the key components, entry/targets, active-episode count, and catalyst if present. Tolerates missing keys / `None` values.

### Runner (`backend/chat/analysis_runner.py`, new module)

- `apply_analysis_result(user, symbol, prior, result, source_message=None) -> CompanyAnalysisEntry`: the create-on-(first-or-material)-change / refine-in-place write. **Extracted from `tasks._fold_company_analysis`**, which is refactored to call it (DRY; the chat idempotency guard stays in `_fold_company_analysis`). When `prior is None or result.materially_changed` → create a new entry; else update `prior` in place. `source_message` is set on the entry (None for manual runs).
- `run_market_analysis(user, symbol) -> CompanyAnalysisEntry | None`:
  1. `verdict = build_verdict(symbol)` (from `stocks.services.ticker_verdict`); on exception, log and fall back to an empty/minimal verdict so the run still proceeds.
  2. `prior` = the user's latest `CompanyAnalysisEntry` for the symbol.
  3. `result = summary_service.build_company_analysis_from_market(prior, symbol, verdict)`.
  4. `return apply_analysis_result(user, symbol, prior, result, source_message=None)`.
  - Never raises; on total failure returns the existing latest entry unchanged (or None if none exists).

### API

`POST /api/stocks/company-analysis/<ticker>/run/` — new function-based DRF view `run_company_analysis`, `IsAuthenticated`, scoped to `request.user`.
- Calls `run_market_analysis(request.user, symbol)`.
- Returns the new/updated latest entry `{symbol, summary, stance, aspect, updated_at}` (200), or `204` if there is still no entry (e.g. bootstrap produced nothing — should not normally happen).
- Registered next to the existing `company-analysis` route.

Note on sync execution: the backend runs under `runserver` (WSGI/sync), so `asyncio.run` inside `build_company_analysis_from_market` is safe in the view's worker thread (same call already used from the Celery task).

## Frontend

- **`CompanyAnalysisTimeline`** gains optional props `onRun: () => void` and `running: boolean`. It renders a **"Run analysis"** button at the top of the panel (above the list / above the empty state), disabled with a "Running…" label while `running`, plus a subtle helper line "Analyzes current technical & fundamental data." Component stays presentational — no fetching inside it.
- **Ticker page** (`page.tsx`) owns the action: a `runAnalysis` handler does `POST /api/stocks/company-analysis/${ticker}/run/`, toggles a `runningAnalysis` state, and on success refetches the timeline (`/company-analysis/`) and the latest-entry card (`/company-summary/`). On failure: re-enable, `console.error`, leave existing data intact.
- House style: sentence-case label, modest primary styling, no all-caps, no monospace.

## Error handling

- `build_verdict` failure → logged; run proceeds with minimal context; `_parse_analysis` keeps the prior view if the model output is unusable.
- `run_market_analysis` never raises into the view.
- Frontend POST failure → button re-enabled, error logged, timeline unchanged.

## Testing (TDD)

- **`_summarize_verdict`** (pure): produces a compact string containing score/entry/episode info; tolerates missing keys and `None` (no raise).
- **`build_company_analysis_from_market`**: mock `_run_summary` → valid JSON yields a parsed `CompanyAnalysisResult`; the prompt includes the symbol and verdict summary; malformed output falls back (via `_parse_analysis`).
- **`apply_analysis_result`**: first call (prior None) creates; `materially_changed=True` creates a new entry; `False` refines the latest in place; `source_message=None` accepted.
- **`run_market_analysis`**: mock `build_verdict` + the service — creates on first run; creates a second on material change; refines on non-material; `build_verdict` raising → graceful (no raise; returns latest or None).
- **Regression**: existing `compile_company_analysis` / `_fold_company_analysis` chat tests stay green after the refactor (the chat fold now delegates to `apply_analysis_result`).
- **API**: POST creates/returns the latest entry; bootstraps when no prior; auth required; user A's run cannot read/return user B's entries.
- **Frontend**: type-check / build (consistent with prior frontend tasks).

## Clean-code notes

- `apply_analysis_result` is the single create-vs-refine write shared by the chat fold and the ad-hoc run (DRY).
- `_summarize_verdict` and `_market_analysis_prompt` kept small (≤30 lines); reuse `_run_summary` / `_parse_analysis` rather than duplicating the SDK call or parse.
- No magic strings; the run-source distinction is expressed by `source_message=None`, not a sentinel string.
