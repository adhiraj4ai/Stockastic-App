# Ticker Verdict + Position-Aware Risk Sizing — Design

**Date:** 2026-06-10
**Status:** Pending user review
**Builds on:** `docs/superpowers/specs/2026-06-10-next-day-trading-plan-design.md` (shipped same day)

## Problem

The Tomorrow's Plan feature computes confluence, freshness, analogs, and catalysts —
but only surfaces them on `/plan` for the top picks. The ticker page (`/ticker/[symbol]`),
where users actually research a stock, still shows SignalDashboard as a flat list of
engine signals with no verdict, no freshness labels (weeks-old ACTIVE episodes look
identical to fresh ones), no analog base rates, and no catalyst awareness. And nothing
anywhere answers "how many shares?" — the gap between signal and trade plan.

## Part A — Ticker Verdict

### Endpoint

`GET /api/stocks/ticker-verdict/<symbol>/` (IsAuthenticated, 15-min cache per symbol).

Computed on demand for ANY symbol by reusing the plan builder's exact ingredients:

| Section | Source | Notes |
|---|---|---|
| `confluence_score` + `components` | `confluence.confluence_score(...)` | Same inputs as `daily_plan.build_daily_plan` assembles per candidate |
| `entry` (zone, status, age) | `confluence.entry_status(...)` anchored on the freshest ACTIVE BUY episode | Absent when no ACTIVE BUY episode |
| `episodes[]` | ACTIVE `SignalEpisode`s for the symbol | Each row: source, direction, entry_price, strength, age_days, freshness status (per-episode `entry_status` on its own entry price) |
| `analog` | `analogs.analog_stats(symbol)` | None suppressed (n<5) as on the plan |
| `catalyst` | `catalysts.upcoming_catalysts()` filtered to symbol | Nearest within 14d |
| `sizing` | Part B | Present when the user has a default account and the anchor episode has a stop |

**Opportunity component cost control:** `rank_opportunities(symbols=[symbol], limit=10)`
only backtests producers currently signaling on that symbol — typically 0–3 backtests
(~seconds). The 15-minute per-symbol cache (django cache, key `ticker_verdict:{symbol}`)
absorbs repeat loads. The cached portion EXCLUDES the per-user `sizing` block: the view
caches the symbol-level verdict dict and attaches sizing per request.

Sector intensity: reuse `daily_plan._sector_intensities()` is too heavy for one symbol
(computes all sectors). Instead compute the single sector's intensity via the same
formula restricted to the symbol's sector mapping — a small extraction:
`_sector_intensity_for(symbol)` added to `daily_plan.py` and used by both callers where
cheap. If extraction proves invasive, the verdict may compute sector component as
neutral (50) with a payload flag `sector_estimated: true` — decided at implementation
time, but the extraction is preferred.

### Frontend

- New `TickerVerdict` component on `/ticker/[symbol]`, placed at the top of the signals
  region (above SignalDashboard). Renders: big score + verdict sentence assembled from
  components ("3 engines agree · CONFIRMED edge · in entry zone · book close in 6d"),
  the component chips (same vocabulary as PickCard), analog base-rate line, and the
  Part-B sizing line + action.
- `TickerSignals` rows gain a freshness badge (IN_ZONE / EXTENDED / STALE) fed by the
  verdict payload's `episodes[]` (matched by source) — stale signals stop masquerading
  as current ones.
- Empty state: no ACTIVE BUY episodes → compact "No active setups on <symbol>" card
  (catalyst + analog still shown if present).

### Out of scope for A

The `/signals` Intel Hub list and the signal-alerts endpoint keep their current shape;
adding freshness there is a follow-up once the verdict payload proves the vocabulary.

## Part B — Position-aware risk sizing

### Service

`stocks/services/position_sizing.py`, pure function:

```python
def size_position(balance, risk_pct, entry, stop):
    """→ {shares, risk_amount, position_value, risk_pct} or None when unsizeable
    (stop >= entry, missing stop, non-positive balance/risk)."""
    risk_amount = balance * risk_pct / 100
    per_share_risk = entry - stop
    shares = floor(risk_amount / per_share_risk)
    return None if shares < 1 else {...}
```

NEPSE trades whole shares — integer floor, no fractional handling.

### Surfacing

1. **Verdict payload** (`sizing` block): uses the requesting user's default
   `PortfolioAccount` (first LIVE account, else first account), its `balance` and
   `default_risk_pct`, the anchor episode's entry (current close if in zone, else
   entry price) and stop. Includes `account_id` and `account_name` so the UI can show
   "based on <account>".
2. **Plan overlay**: `/api/stocks/plan/today/` overlay gains a `sizing` map
   `{symbol: sizing_block}` for the plan's picks, computed read-time alongside the
   existing overlay queries.
3. **UI**: PickCard and TickerVerdict show "≈120 shares · Rs 73,440 · risks 1% (Rs 6,120)"
   and a **Draft trade plan** button.

### Draft trade plan action

The button POSTs to the existing trade-plans API (the `/portfolio/plans` feature),
creating a `TradePlan` (status OPEN, thesis auto-filled from the verdict sentence,
`risk_budget_pct` = account default) with one `TradePlanLeg` (price_target = entry,
allocation = 100%, stop_loss_price = SL). Success → toast with a link to
`/portfolio/plans`. A TradePlan is itself the propose-then-confirm artifact — nothing
executes; the user confirms by acting on the plan later. Implementation must READ the
actual trade-plans serializer/routes first and conform to them.

## Testing

- Backend: unit tests for `size_position` (happy path, floor, unsizeable cases);
  verdict endpoint tests with seeded episodes + mocked `rank_opportunities` /
  `_load_price_df`-style indirections (consistent with the plan test suite — note
  `DailyStockPrice` is managed=False, so price access goes through patchable
  indirections); cache behavior test (second call within TTL doesn't recompute);
  overlay sizing test.
- Frontend: vitest for TickerVerdict (score + sentence + sizing render, empty state,
  draft button POST payload) and the TickerSignals freshness badge.

## Out of scope

- Multi-leg sizing (scale-in plans), Kelly or volatility-scaled sizing — v2.
- Freshness on the Intel Hub list (follow-up).
- Sizing against margin/short positions.
