# Holding snapshot card (portfolio row pop-up — sub-project A)

**Date:** 2026-06-19
**Status:** Approved design, pending implementation

## Context

The portfolio holdings table (`frontend/src/components/PortfolioTable.tsx`) shows
a thin hover card on the health-score badge with only the health score plus four
fundamental ratios (P/E, P/B, ROE, EPS growth). Each row already carries far more
data client-side that is never surfaced.

This is **sub-project A** of a three-part redesign of the per-row information
experience. The other two (B: exit-strategy dialog frame + planner; C: rewrite of
the shared `DailySignalStatus` analysis engine) are separate specs/plans and out
of scope here.

## Goals

- **Faster decisions** — surface the "should I act on this holding?" signals at a
  glance: P/L, targets/stop proximity, momentum signal.
- **Less clutter, more beauty** — clear hierarchy, calm dense layout, warm sans,
  sentence-case, no all-caps.
- **Show more, better** — surface data already present on the row that is
  currently hidden.

## Decisions (from brainstorming)

- **Scope:** redesign only the hover snapshot card. No backend changes. No new API
  call — the card is built entirely from data already on each `PortfolioItem`.
- **Trigger:** unchanged — hovering the health-score badge. Clicking the row still
  opens the deep dialog (unchanged).
- **Layout:** "two-column dense" — header, two-column body (money/position left;
  fundamentals/meta right), price-ladder footer.
- **Width:** ~360px (up from the current ~210px / `w-52`).

## Data used (all already on `PortfolioItem`, no fetch)

`ticker`, `sector`, `classification`, `quantity`, `wacc`, `current_price`,
`current_value`, `gain_loss`, `gain_loss_percent`, `day_gain_loss`,
`stop_loss_price`, `target_price`, `target_price_2`, `target_price_3`,
`volatility`, `health_score`, `fundamental_metrics` (`pe`, `pb`, `roe`, `growth`,
`de`), `signals` (`summary`, `buy_count`), `tags`, `purchased_at`.

## Layout

```
┌─────────────────────────────────────────┐
│ NABIL ⛬ · Banking            ● BUY 4/5   │  header
├──────────────────┬──────────────────────┤
│ +12.4%           │ Health  78/100 ▰▰▰▱   │
│ रू +18,200        │ P/E 14.2   P/B 1.9    │
│ 500u · रू1.65L    │ ROE 18%   Gr +12%     │
│ Day +1.8%         │ D/E 0.4    Vol 28%    │
│ R/R 2.4           │ #Core · held 142d     │
├──────────────────┴──────────────────────┤
│ SL ──●entry── CMP ──── T1 ── T2          │  price ladder
│ 480   520      548     600   650          │
└───────────────────────────────────────────┘
```

### Header

- Left: `{ticker}` (bold) + classification glyph (`Landmark` for investment,
  `Repeat` for trading) + `· {sector}`.
- Right: signal pill — text is `{summary} {buy_count}/5` when `buy_count` present,
  else just `{summary}`. Color by `signals.summary`:
  BUY → emerald, SELL → rose, HOLD/NEUTRAL → slate, MIXED → amber.
  When `signals` is absent, omit the pill.

### Left column — money & position

- P/L %: `gain_loss_percent`, large, emerald when ≥ 0 else rose.
- P/L amount: `gain_loss` via `formatRupees`, same color.
- Position: `{quantity}u · {current_value}` (compact rupees via `lib/numbers`).
- Day move %: derived (see helpers), signed + colored; `—` when not computable.
- R/R: derived (see helpers); `—` when SL/TP missing or denominator ≤ 0.

### Right column — fundamentals & meta

- Health: `{health_score}/100` plus a slim bar; bar/segment color
  emerald ≥ 70, amber ≥ 40, rose below (matches the existing badge thresholds).
- P/E, P/B, ROE %, Growth %, D/E, Vol % — each renders `N/A` when its source is
  null/undefined. ROE, Growth, Vol are percentages; P/E, P/B, D/E are ratios.
- Meta line: first tag (if any) + `held {n}d` from `purchased_at`.

### Footer — price ladder

A horizontal track plotting available points in ascending price order:
SL (`stop_loss_price`), entry (`wacc`), CMP (`current_price`),
T1 (`target_price`), T2 (`target_price_2`), T3 (`target_price_3`).

- Each present point is a labelled marker (label + price).
- CMP is visually highlighted; entry is marked distinctly.
- Missing points are omitted; the track always includes at least entry + CMP.
- Positioning along the track is by price between the min and max present points.

## Architecture

New, focused units:

- `frontend/src/lib/holdingSnapshot.ts` — pure helpers (no React):
  - `computeRiskReward(wacc, stopLoss, target): number | null`
    returns `(target - wacc) / (wacc - stopLoss)` rounded to 1 dp; `null` if any
    input is null/undefined or `wacc - stopLoss <= 0`.
  - `computeDayPercent(dayGainLoss, currentValue): number | null`
    returns `dayGainLoss / (currentValue - dayGainLoss) * 100`; `null` if the
    denominator is 0 or inputs missing.
  - `computeHoldingDays(purchasedAt, now): number`
    whole days between `purchasedAt` and `now` (≥ 0).
  - `buildPriceLadder(item): LadderPoint[]`
    where `LadderPoint = { key: 'sl'|'entry'|'cmp'|'t1'|'t2'|'t3'; label: string;
    price: number }`; includes only points whose source value is present, always
    includes `entry` and `cmp`, sorted ascending by price.

- `frontend/src/components/HoldingSnapshot.tsx` — pure presentational component
  `HoldingSnapshot({ item: PortfolioItem })`. Renders header, two columns, and the
  ladder using the helpers and `lib/numbers` for money. Internally split into small
  sub-components (`SnapshotHeader`, `SnapshotMoney`, `SnapshotFundamentals`,
  `PriceLadder`) so no function exceeds the 30-line limit.

- `frontend/src/components/PortfolioTable.tsx` — replace the body of the existing
  health-badge `TooltipContent` (~lines 258-286) with `<HoldingSnapshot item={item} />`.
  No other change; the `Tooltip`/`TooltipTrigger` and the badge stay as they are.

## Error & empty states

- Null fundamentals → `N/A` per field.
- No SL/TP → R/R shows `—`; ladder shows only the present points (min entry + CMP).
- `day_gain_loss`/`current_value` not computable → Day shows `—`.
- No tags → omit the tag chip; still show `held {n}d`.
- No `signals` → omit the pill (rest of card renders).
- The card only appears when the health badge renders, i.e. when `health_score` is
  present — unchanged from today.

## Testing (TDD)

`frontend/src/lib/__tests__` / co-located unit tests:

- `computeRiskReward`: positive case; `null` when SL missing, TP missing, or
  `wacc <= stopLoss`.
- `computeDayPercent`: positive/negative case; `null` on zero denominator.
- `computeHoldingDays`: known date difference; same-day → 0.
- `buildPriceLadder`: full set ordered ascending; omits missing points; always
  contains entry + cmp; SL-only / TP-only subsets ordered correctly.

Component test (`HoldingSnapshot.test.tsx`):

- Renders P/L % and the signal pill text.
- Renders `N/A` for a null fundamental.
- Renders ladder markers for the present points.

## Out of scope

- Any backend / serializer change.
- Sub-projects B (dialog frame + planner) and C (analysis-engine rewrite).
- Sparklines / price history (no time-series data on the row; would need a fetch).
- Changing the row-click behaviour or the action buttons.

## Deploy

Frontend-only. Docker frontend image rebuild + hard refresh (no migration).
