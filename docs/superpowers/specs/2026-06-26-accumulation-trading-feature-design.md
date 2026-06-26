# Accumulation Trading Feature — Design

**Date:** 2026-06-26
**Status:** Approved (brainstorm) — pending spec review
**Author:** brainstorming session

## Problem

In NEPSE, large players accumulate positions through brokers before driving price up.
Stockastic already stores per-broker, per-symbol, per-day cumulative flow
(`DailyCumulativeAccumulation`) and has three blunt accumulation alphas, a backtest
harness with a pass/fail ScoreCard, signal generation, and paper-trading execution.

We want an **end-to-end "Accumulation Trading" feature**: scan the market for the
large-player accumulation setup, rank candidates by a composite strength score,
backtest/validate the underlying strategy, and let the user place paper trades from
the ranked candidates via propose-and-confirm.

## Goals

- A single composite **accumulation strength score** (0–100) per `(symbol, date)`,
  built from three interpretable factors, used as the single source of truth for both
  a backtestable strategy and a live scanner.
- A new **`AccumulationStrength` Alpha** that runs through the *existing* backtest
  harness / ScoreCard with zero new backtest code.
- **Calibration** of factor weights and threshold from ~5.5 years of history, validated
  out-of-sample, with the ScoreCard as the ship/no-ship gate.
- A **daily scanner** that ranks live candidates with explainable factor breakdowns and
  suggested entry/stop/target/size.
- A **propose-and-confirm UI** on the existing `/accumulation` area; the user confirms
  each paper trade. Trades reuse the existing portfolio transaction pipeline (fees + T+2).

## Non-Goals (v1)

- Auto-pilot / fully automatic trading.
- Live (real-money) account trading.
- Intraday / real-time scanning (daily cadence only).
- SELL automation (exit alerts are surfaced; the user confirms sells).
- RL agent — documented as **future research**, not built (see Future Work).
- Fixing the look-ahead bug in the three *existing* accumulation alphas — flagged,
  out of scope.

## Data Reality (audited 2026-06-26)

| Table | Range | Rows | Symbols | Trading days |
|-------|-------|------|---------|--------------|
| `DailyCumulativeAccumulation` | 2020-12-16 → 2026-06-17 | 12.1M | 570 | 1,178 |
| `DailyFloorsheet` | 2020-12-16 → 2026-06-17 | 80M | — | — |

- `cumulative_net` (and buy/sell) are **signed running cumulative LEVELS**, entity (broker)
  scoped, keyed `(symbol, transaction_date, entity_id)`. **Do not difference into daily flow**;
  read as a level. "Rising" = slope of the level over a lookback.
- Data is current (max date ~9 days old at audit) and ~5.5 years deep → both the live
  scanner and weight calibration are viable. (The earlier "floorsheet stale since 2026-04-24"
  note is out of date.)

## Architecture (Approach A — build on the existing strategy framework)

```
                 ┌─────────────────────────────┐
                 │  AccumulationScoreService    │  single source of truth
                 │  score(symbol, date) → 0..100│  (1-bar lag on broker data)
                 │  factors: F1, F2, F3         │
                 └───────────┬─────────────────┘
            ┌────────────────┴───────────────────┐
            ▼                                     ▼
 ┌────────────────────┐               ┌──────────────────────────┐
 │ AccumulationStrength│               │ Daily scanner (Celery)   │
 │ Alpha (library.py)  │               │ ranks universe → persists │
 │ + AtrTrail Stop     │               │ AccumulationCandidate rows│
 └─────────┬──────────┘               └────────────┬─────────────┘
           ▼                                        ▼
  existing backtest harness                 DRF API → /accumulation page
  run_backtest → evaluate_over_basket        propose-and-confirm →
  → ScoreCard (5 verdicts)                    POST /portfolio-transactions/
           ▼                                  (reused; fees + T+2 apply)
  calibrate_accumulation_strategy cmd
  (Optuna scope=ALL) → validate OOS
```

### Component 1 — `AccumulationScoreService`

Computes a 0–100 composite score for any `(symbol, date)` (and vectorized over a date range
for backtest). Reads `DailyCumulativeAccumulation` + OHLCV. **All broker-derived series are
lagged one bar (`.shift(1)`)** before touching a price bar, in both backtest and live scan
(today's scan uses yesterday's confirmed flow). Price-only Factor 3 may use bar D (OHLC known
at close).

Follows the `AccumulationAboveMA.register()` template: query by symbol → pivot by `entity_id`
→ `ffill` → reindex to price dates → **shift(1)** → select top-N.

**Factor 1 — Broker concentration** (0–1):
- Among brokers with `cumulative_net > 0` on the date, `F1 = sum(top-3 positive nets) ÷ sum(all positive nets)`.
  Strictly-positive denominator (avoids the signed-share blow-up).
- Gate: top-N summed level must be **rising** (positive slope over ~10 trading days).

**Factor 2 — Sustained accumulation + price coiling** (0–1):
- Top-N brokers' summed cumulative-net level has a **positive slope** over ~20 days, **and**
- volatility is **compressed** (rolling ATR/std near its own recent low), **and**
- price is **range-bound** (small % range over the window).

**Factor 3 — Breakout confirmation** (0–1):
- Price **crosses above its recent N-day high** (or key MA) while accumulation is net-positive.

**Composite:** `score = 100 × (w1·F1 + w2·F2 + w3·F3)`, weights sum to 1, set by calibration.

Optionally pluggable: a **GBM/supervised scorer** (v1.5 experiment) implementing the same
`score(symbol, date)` interface, predicting forward N-day return from the same factors —
explainable via feature importances, stable on thin data. Stepping stone before any RL.

### Component 2 — `AccumulationStrength` Alpha

New component in `strategy_framework/library.py`, registered in `registry.py` under "Broker flow".
- `register()`: precompute composite score series via `AccumulationScoreService`, expose via `strat.I(...)`.
- `entry()`: `score[-1] >= entry_threshold` (calibrated, ~70).
- `exit()`: **distribution flip** — top-N summed cumulative-net slope turns negative.
- Params (Optuna-optimizable): `symbol`, `top_n`, `entry_threshold`, `w1/w2/w3`, lookbacks.

**Hybrid exit** = framework `AtrTrail` (mechanical downside stop) composed via
`build_strategy(alpha=AccumulationStrength(...), stop=AtrTrail(...))` + the Alpha's
distribution-flip `exit()` (thesis-based profit-taking). No new exit machinery.

Because it's a standard Alpha+Stop composition it flows through `run_backtest` →
`evaluate_over_basket` → ScoreCard unchanged, directly comparable to the three existing alphas.

### Component 3 — Calibration (`calibrate_accumulation_strategy` management command)

Two-stage, separated duties:
1. **Calibrate** with `OptimizationService.run_optimization(scope='ALL')` → **one global**
   weight/threshold set (not per-symbol — overfit risk on 570 names). Objective = **median
   Sortino**. Uses the existing anchored in-sample split. Winning params persisted as a
   `Strategy` row (`spec` JSON) per existing pattern.
2. **Validate** winning params on the **OOS slice** via `evaluate_over_basket` → ScoreCard
   is the **final arbiter** (Optuna proposes, ScoreCard disposes; validation on held-out data).

### Component 4 — Daily scanner (Celery task)

Runs after `update_broker_analysis` in the daily pipeline.
- Loads calibrated config.
- For every symbol passing the **liquidity floor** (below), computes today's composite score.
- Ranks by score; keeps `>= entry_threshold` as candidates.
- Computes suggested **entry (LTP)**, **ATR protective stop**, **targets**, and **risk-based qty**.
- Persists `AccumulationCandidate` rows (symbol, score, factor breakdown, suggested levels,
  scan date, status). Stale candidates (score < threshold or distribution flip) → expired.

**Liquidity floor (shared by calibration AND scan — must match):**
- Min **median daily turnover** over trailing ~30 days (single tunable constant).
- Min count of **distinct active brokers** on the name.
- Symbols failing the floor are excluded from both the calibration basket and the candidate list.

### Component 5 — Position sizing

Risk-based, reusing `PortfolioAccount.default_risk_percentage`:
`qty = floor((balance × risk%) ÷ (entry − protective_stop))`, capped so cost ≤ settled cash.
Surfaced as a suggestion; user can override before confirming.

### Component 6 — API (DRF)

- `GET /api/stocks/accumulation-candidates/` — ranked live candidates: score, 3-factor breakdown,
  suggested entry/stop/targets, suggested qty for chosen account, validation state.
- `GET /api/stocks/accumulation-candidates/{symbol}/` — detail: score-over-time, accumulating
  brokers, strategy backtest scorecard.
- `POST /api/portfolio-transactions/` — **reused unchanged** for the paper BUY (pre-filled by UI;
  goes through `PortfolioService` → fees + T+2 settlement).

### Component 7 — Page (new tab on existing `/accumulation`)

Sidebar-only nav, full-width, warm sans, sentence-case (per UI conventions).
- **Ranked candidate table:** symbol, score (with factor-breakdown bar), LTP, suggested
  entry/stop/target, suggested qty, "Place paper trade" action, account selector.
- **Candidate drawer:** score-over-time, accumulating brokers, strategy backtest ScoreCard.

## Validation Gating (product behavior)

Tied to the OOS ScoreCard:
- **Passes** → scanner proposes trades normally; "Place paper trade" enabled.
- **Fails** → feature still ships, candidates shown as **"research / not validated"**;
  "Place paper trade" **disabled**; failing verdicts shown plainly. No false confidence.
- Either way, the backtest ScoreCard is displayed in the candidate drawer.

## New State

- Calibrated config: reuses existing `Strategy` model (`spec` JSON).
- `AccumulationCandidate` table: symbol, scan_date, score, factor breakdown (JSON),
  suggested entry/stop/targets/qty, validation_state, status (active/expired). Migration required.

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Look-ahead bias (broker data published after close) | 1-bar `.shift(1)` on all broker series, backtest + scan |
| Overfit weights | Global (not per-symbol) weights; Optuna IS, ScoreCard on OOS as gate |
| Illiquid-name noise | Shared liquidity floor (turnover + min active brokers), defined once |
| Signed-share blow-up in concentration | F1 over net-buyers only, strictly-positive denominator |
| Strategy fails to beat B&H | "research / not validated" gating disables trade button |
| Existing alphas share the lag bug | Flagged; out of scope for this feature |

## Testing (TDD)

- `AccumulationScoreService`: factor math (incl. net-buyer-only concentration, positive
  denominator), 1-bar lag alignment, range-vectorized scoring matches point scoring.
- `AccumulationStrength` Alpha: entry/exit logic, registry round-trip via `spec_to_code`.
- Calibration command: scope=ALL global params; OOS validation path; ScoreCard gating.
- Scanner: liquidity floor exclusion, ranking, candidate persistence, staleness/expiry.
- Position sizing: risk formula, settled-cash cap.
- API + UI: candidate list/detail, validation-state gating disables trade action.

## Future Work

- **GBM/supervised scorer** (v1.5) behind the same `score()` interface — explainable, stable.
- **RL agent** — separate research spec with a data-suitability spike first (gym env around
  the backtester, state = factors + OHLCV + position, discrete actions, risk-adjusted reward,
  strict walk-forward OOS). Kept out of this feature: poor fit for thin non-stationary daily
  data and fights the explainable propose-and-confirm UX.
- LLM (existing `strategy-lab` chat subagent): factor-hypothesis generation + narrating signals.
