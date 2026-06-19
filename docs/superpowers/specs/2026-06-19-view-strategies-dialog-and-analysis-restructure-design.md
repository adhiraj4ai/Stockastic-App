# View-strategies dialog + analysis-engine restructure (sub-projects B + C, merged)

**Date:** 2026-06-19
**Status:** Approved design, pending implementation

## Context

The "View strategies" pop-up (`frontend/src/components/ExitStrategyDialog.tsx`, ~527
lines) is a near-full-screen modal that opens on a nested tab structure: top-level
tabs **Strategy Planner** and **Deep Technical Analysis**, where the analysis tab is
the shared `DailySignalStatus` component (~1316 lines) which itself has four inner
tabs (Signal Engine / Technicals / Fundamentals / Accumulators). `DailySignalStatus`
is also used on the Signals Intel Hub page (`signals/IntelHubClient.tsx`).

This is the third design cycle of a per-row redesign program. Sub-project A (holding
snapshot card) shipped. Sub-projects **B** (dialog frame + planner) and **C** (analysis
engine rewrite) are **merged here** because the user's "no nested tabs" requirement
forces flattening the analysis sections into the dialog's single tab bar — which means
restructuring the shared engine.

**Out of scope — deferred to sub-project D:** any *new* analytics/metrics. This cycle
re-presents the existing data only; no backend changes.

## Goals

- **Single-level tabs everywhere** — no nested tabs in the dialog or on the Signals page.
- **Faster decisions, less clutter, more beauty** — the program's standing goals, in the
  established visual language (signal pills, price ladder, health bars, warm sans,
  sentence-case, no all-caps).
- **Show more** — surface per-transaction Reason and fee breakdown currently hidden.

## Decisions (from brainstorming)

- Merge B + C into one cycle; flatten all tabs to a single level.
- Container: a roomy modal; the **Plan** and **Transactions** tabs render as calm,
  centered, max-width content; the analysis sections keep the room they need.
- Default tab: **Plan**.
- Dialog tab bar (single level): `Plan · Transactions · Signals · Technicals ·
  Fundamentals · Accumulation`.
- Signals page tab bar (single level): `Signals · Technicals · Fundamentals ·
  Accumulation` (no Plan/Transactions there).
- Analysis = **re-presentation of existing data** (same 6 endpoints, same indicators);
  NO new analytics (→ sub-project D), NO backend change.
- Plan tab layout: editor + live vertical price ladder + health warnings + thesis.
- Transaction history becomes its own dedicated tab.
- Old `DailySignalStatus` is deleted after both consumers migrate.
- Execution is **phased with pauses** between phases.

## Architecture

The flattening hinges on splitting the monolithic analysis engine into a shared data
hook plus presentational section components that each consumer arranges into its own
single-level `Tabs`.

### Shared analysis units (new)

- `frontend/src/hooks/useTickerAnalysis.ts` — `useTickerAnalysis(symbol, ladder?)`
  owns the six existing calls and returns one structured, typed object plus
  `loading`/`error`:
  - `GET /api/stocks/details/{symbol}/` (company, fundamentals, technical_indicators, fundamental_indicators)
  - `GET /api/stocks/signals/?symbol={symbol}&page_size=10` (signal history)
  - `GET /api/stocks/batch-indicators/?symbols={symbol}` (live ltp, rsi, macd, roc, trends)
  - `GET /api/stocks/companies/accumulation/?range=1W` (institutional flow)
  - `GET /api/stocks/fibonacci/{symbol}/` (fib levels)
  - `GET /api/stocks/generated-signals/latest/` (generated signals)
  - `ladder?` = `{ cmp, entry, stopLoss, t1, t2, t3 }` for the price ladder; optional
    (the Signals page passes its own values, the dialog passes the plan's).
- Four presentational section components in `frontend/src/components/analysis/`:
  - `SignalsSection` — price ladder, signal confluence (generated-signal engines with
    tier/strength/agreement), logic-engine narrative, institutional flow, trade targets
    with % return, fibonacci levels, pivot cluster, ATR/ADX, signal history.
  - `TechnicalsSection` — technical-bias hero (aggregate of the 10 indicators), momentum
    oscillators grid, trend intelligence (MACD, ADX, SMA 50/200, PSAR, Aroon), volume
    pressure (CMF, OBV, VWAP distance), volatility & channels (ATR, Bollinger %B).
  - `FundamentalsSection` — intelligence verdict hero, financial-health donut, valuation
    matrix (P/E, P/B, EPS, dividend yield), efficiency (ROE, D/E, YoY, QoQ), sector
    benchmarking bars, risk audit pass/fail grid.
  - `AccumulationSection` — wraps the existing `TickerAccumulation` component.
  - Each takes the `useTickerAnalysis` result (or the relevant slice) as props — pure
    presentational, no own fetching.
- A shared `AnalysisTabs` is NOT introduced; each consumer builds its own `Tabs` so the
  tab set differs (dialog has Plan/Transactions too). The section components are the
  shared unit, the hook is the shared data.

### Dialog (rewritten `ExitStrategyDialog`)

Decomposed from one 527-line file into:
- `useExitStrategy(portfolioItem, open)` — owns `GET suggest_exits`, `DELETE
  transactions/{id}`, and exposes `{ strategies, healthWarnings, currentPrice, wacc,
  isUnderwater, transactions, refresh }`.
- Form state (`sl`, `tp`, `tp2`, `tp3`, `thesis`, `selectedStrategy`) + `handleSave`
  (PATCH `portfolio/{id}` with `stop_loss_price`, `target_price`, `target_price_2`,
  `target_price_3`, `thesis`, `strategy_type`) — unchanged behaviour, in a
  `useExitPlanForm` hook or the dialog body.
- Presentational sub-components in `frontend/src/components/exit/`:
  - `ExitDialogHeader` — `Exit strategy · {ticker}`, underwater/strategic badge, signal
    pill (from `portfolioItem.signals`), metric strip (LTP, Avg cost, Quantity, P/L %).
  - `PlanTab` composed of `GamePlanCards`, `ExitInputs` (SL/T1/T2/T3 + live R/R),
    `ExitPriceLadder` (live vertical ladder reacting to form values), `HealthWarnings`,
    `ThesisField`.
  - `TransactionsTab` — dedicated table.
- The dialog renders ONE `Tabs` with values `plan | transactions | signals | technicals
  | fundamentals | accumulation`, default `plan`; the four analysis values render the
  shared section components fed by `useTickerAnalysis(ticker, planLadder)`.

### Signals page

`signals/IntelHubClient.tsx` replaces its `<DailySignalStatus .../>` usage with its own
single-level `Tabs` (`signals | technicals | fundamentals | accumulation`) rendering the
same shared section components fed by `useTickerAnalysis`. Re-verified before merge.

### Removal

`DailySignalStatus.tsx` is deleted once both consumers use the new sections.

## Plan tab (detail)

- **Left column:** `GamePlanCards` — selectable cards for each key in `strategies`
  (`fixed`, `atr_conservative`, `atr_aggressive`, `swing`, `break_even` when underwater);
  clicking one populates the inputs and sets `selectedStrategy`. Then `ExitInputs`:
  number fields Stop / Target 1 / Target 2 / Target 3, and live R/R
  `(target_price − cmp) / (cmp − stop_loss)` shown as `1:X.X` (`—`/invalid when risk ≤ 0).
- **Right column:** `ExitPriceLadder` — vertical ladder of SL · entry(WACC) · CMP ·
  T1 · T2 · T3 built from the **current form values** (not the saved item), re-rendering
  as inputs change; SL rose, entry slate, CMP highlighted, targets emerald; missing
  points omitted, always entry + CMP. Below it, `HealthWarnings` alert cards from
  `healthWarnings` (severity colors).
- **Bottom:** `ThesisField` textarea spanning full width.
- Footer: "Discard changes" / "Commit strategy" (save). Sentence-case.
- Removed: the hardcoded "STK SCORE: STABLE" and the static "HARD STOP PROTECTION
  ACTIVE" badge.

## Transactions tab (detail)

Dedicated table from `transactions` (sorted newest first):
columns Date · Type · Reason · Quantity · Rate · Amount, plus a fee breakdown
(commission, SEBON fee, DP charge, CGT, receivable) — these and Reason are returned by
`suggest_exits` today but not shown. Edit (opens `TransactionModal`) and delete
(`handleDeleteTransaction`) actions. Empty state when there are no transactions.

## Analysis sections (detail)

Same data as `DailySignalStatus` renders today, re-laid-out flat and calm in the
established visual language. The exhaustive field inventory is in the current component;
each section keeps its existing data points (no additions, no removals of real data) and
the price ladder appears at the top of `SignalsSection`. The hardcoded `strength = 75`
and `direction = "BUY"` props the dialog passes today are replaced by real values from
the plan/analysis data where available; otherwise omitted (not faked).

## Error & empty states

- Hook exposes `loading` and `error`; each section renders a loading skeleton and a
  graceful "data unavailable" state independently (no whole-engine blank-out).
- Missing numeric fields render `N/A`/`—` (consistent with the snapshot card).
- No transactions → Transactions tab empty state. No strategies → Plan still renders
  manual inputs. No health warnings → omit the block.

## Testing (TDD)

- `useTickerAnalysis` — mock the 6 endpoints; assert it composes the structured result
  and surfaces `error` when a call fails (does not throw).
- `useExitStrategy` — parses `suggest_exits`; default-fills SL/TP from `strategies.fixed`
  when the item has no saved stop-loss.
- R/R helper and live-ladder builder (reused/extended from `lib/holdingSnapshot` or a
  dialog-local helper) — unit tests incl. invalid-risk and missing-point cases.
- Component tests: `PlanTab` renders inputs and applies a game plan to the inputs;
  `TransactionsTab` renders rows incl. fees + Reason and an empty state; each analysis
  section renders its key fields from mock hook data.
- A test asserting the dialog renders a **single, flat** tab list (the six values, no
  nested tablist).
- Signals page: smoke test that it renders the four sections without `DailySignalStatus`.

## Phased delivery

1. **Phase 1 — shell + Plan + Transactions:** new dialog shell; Plan tab (editor + live
   ladder + warnings + thesis); Transactions tab. Tab bar is transitional —
   `Plan · Transactions · Analysis`, where the single Analysis tab still embeds the
   existing `DailySignalStatus` unchanged (its inner tabs remain until Phase 2). Shippable
   on its own. Pause for review/deploy.
2. **Phase 2 — shared analysis hook + sections:** build `useTickerAnalysis` and the four
   re-presented section components; replace the single Analysis tab with the four flat
   tabs, reaching the end-state tab bar `Plan · Transactions · Signals · Technicals ·
   Fundamentals · Accumulation` (no nesting). Pause.
3. **Phase 3 — Signals rollout + cleanup:** repoint `IntelHubClient` to the new sections,
   delete `DailySignalStatus`, full verification (dialog + Signals page). Pause/deploy.

## Out of scope

- New analytics/metrics and any backend change → **sub-project D**.
- Changes to `suggest_exits`, the transaction model, or the six analysis endpoints.
- The holding snapshot card (shipped in sub-project A).

## Deploy

Frontend-only across all phases. Docker frontend image rebuild + hard refresh per phase;
no migration. Signals page must be re-verified in Phase 3.
