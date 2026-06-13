# Phase 1 Re-baseline: honest fees + corporate-action-adjusted prices

**Run date:** 2026-06-10
**Data window:** 2020-05-12 → 2026-04-24 (~1,553 daily bars; a full NEPSE cycle including the 2021 bull peak and the 2022–23 bear market)
**Basket:** 24 pinned, sector-diverse liquid tickers (`basket.py`)
**New honest baseline:** **21 / 41** strategies pass the basket bar.

## What changed in the harness (Plan 1)

| Dimension | Before | After |
|---|---|---|
| Commission | flat 0.2% | tiered NEPSE 0.24–0.36% + 0.015% SEBON + Rs 25 DP, per side |
| Spread | 0 | 10 bps |
| Prices | raw | corporate-action adjusted (bonus/rights/split) |
| Corporate actions backfilled | — | 1 (NABIL 10% bonus, ex 2026-01-18) |

## ⚠️ The stored 7/41 baseline is NOT comparable — do not cite a "7→21 improvement"

The previous `backtest_reports/baseline/summary.md` (2026-06-09, 7/41) was generated on a
**different code/data state** and is not a valid before/after reference. Evidence:

1. **Buy-and-hold reference flipped.** Baseline `BH Ret/DD` was positive across the basket
   (0.40, 0.59, 0.46 …); the current run is mostly negative (~−0.32). B&H cannot change
   for the same series/window — so the baseline ran on a different (shorter/more recent,
   bullish) window.
2. **Six strategies that failed `runs_clean` in baseline now run.** Supertrend, Force Index,
   CMF, Aroon, Coppock (and Keltner) errored on indicators yesterday and execute cleanly
   today — a change **not made in Plan 1** (SafeTa indicator fixes are Plan 2). This confirms
   the environment/data moved independently of this work.

## Controlled A/B — the true causal effect of Plan 1 (identical data, identical code)

To isolate what the fee + adjustment changes actually do, each strategy was scored twice over
the same basket and code, varying only the harness settings:

| Setting | Pass count |
|---|---|
| flat (commission=0.002, spread=0, **raw** prices) — the pre-Plan-1 behavior | **21 / 41** |
| honest (NEPSE fees, 10 bps spread, **adjusted** prices) — the new default | **21 / 41** |

**Net effect on the headline: zero.** Only two strategies changed verdict, in opposite
directions (net zero):

- *Turtle Trading (Channel Breakout)*: FAIL → PASS (median excess 16.58% → 24.77%)
- *Smart Money Accumulation*: PASS → FAIL (boundary flip on the risk-adjusted verdict)

### Fair comparison: buy & hold is charged the same round-trip cost

backtesting.py reports `Buy & Hold Return [%]` **gross of fees**, while the strategy return is
net of full NEPSE costs. Comparing the two directly would dock only the active strategy its
transaction drag and give passive holding a free pass — biasing every strategy-vs-B&H verdict
(and Plan 3's net-expectancy ranking) against active strategies. So `run_backtest` now nets a
matching round-trip cost (one entry + one exit) out of the B&H leg via `_buy_hold_cost_pct`,
making the scorecard a true **net-vs-net** comparison. (This corrected a real asymmetry caught
in final review; it did not move the headline — 21/41 before and after.)

### Why net-neutral, and why that's still correct

- **Fees are immaterial to multi-year pass/fail at the current scorecard thresholds.** A
  ~0.3% per-side cost (now applied symmetrically to both the strategy and the B&H leg) is
  noise against multi-year returns. Real fee impact surfaces where it should — when **ranking
  by net expectancy** (Plan 3) and for **high-frequency** strategies (Turtle Soup ~47 trades,
  Parabolic SAR ~25) whose per-trade drag compounds.
- **Adjustment touches almost nothing yet:** only 1 corporate action exists in the DB
  (NABIL). The adjustment math is correct (verified: NABIL pre-bonus closes scale ×1/1.1)
  but starved of data. See **Task 11** — ingesting historical bonus/rights history for the
  basket is required before adjustment materially changes results.

## Interpreting 21/41 on this window

This is a legitimately *harder, more honest* test than a bull-only window: over a full cycle
with a major bear market, the median basket stock has poor **drawdown-adjusted** buy-and-hold,
so strategies that go to cash and cut losses can genuinely beat passive holding. 21/41 is the
new honest reference all future strategy-upgrade work measures against.

**Caveat — still no statistical defense.** 21/41 selected from 41 candidates on one window is
exactly the multiple-testing setup that overfits. These passes are *not yet* trustworthy as
"best strategies": Plan 2 (walk-forward OOS, win-rate confidence intervals, permutation
significance) and Plan 3 (live `SignalEpisode` confirmation) are what turn a backtest pass
into a defensible edge.

## Pass list (honest run)

Parabolic SAR, Accumulation Divergence, Aroon Trend Strength, Turtle Trading (Channel
Breakout), Z-Score Mean Reversion, RSI-2 Mean Reversion, Supertrend Follower, Force Index
Impulse, Chaikin Money Flow Divergence, MACD Trend Follower, Williams %R Trend, Broker
Accumulation (Institutional), Coppock Curve, Golden Cross + ADX, Elder's Triple Screen — and
6 more (see `summary.md`). Full per-strategy table: `summary.md` / `summary.json`.
