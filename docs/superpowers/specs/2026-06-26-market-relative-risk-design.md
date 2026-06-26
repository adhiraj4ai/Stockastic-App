# Market-Relative Risk — Design Spec

**Date:** 2026-06-26
**Status:** Approved (pending spec review)
**Tier:** Tier 3, feature 1 of 4 (market-relative risk)

## Problem

The portfolio risk analysis (`stocks/services/risk_service.py`) covers concentration,
sector exposure, liquidity, and weighted volatility — but has **no market-relative risk**.
The risk radar's `Systemic Risk` axis is hardcoded to `5.0` (`risk_service.py:196`), a
placeholder shown to users as if it were real.

NEPSE is a highly systemic market: stocks move together with the index, and "different"
holdings are often hidden correlated bets. Beta-to-NEPSE and cross-holding correlation are
arguably the most informative risk measures for a NEPSE portfolio, and they are absent.

## Goal

Add four market-relative risk metrics and surface them across backend, chat, and frontend,
with alerts:

1. **Beta to NEPSE** — per holding and portfolio-weighted; replaces the hardcoded radar axis.
2. **Holding correlation** — pairwise matrix + average off-diagonal (diversification read).
3. **Max drawdown** — synthetic current-portfolio peak-to-trough over the window.
4. **Value at Risk (VaR)** — historical 1-day 95%/99% (+ 1-week), parametric fallback.

## Non-goals

- Sector-relative beta (NEPSE sector sub-indices are not yet ingested — separate Tier 1 gap).
- Reconstructing historical portfolio composition from transaction history (we use current
  weights applied to historical returns — standard for *current-portfolio* risk).
- The other three Tier 3 features (cost/tax-aware rebalance, dividend-adjusted returns,
  paper-trading realism) — each gets its own spec.

## Architecture

New focused units under a `risk/` package; `RiskAnalysisService` stays a thin orchestrator.

```
stocks/services/risk/
  returns_metrics.py     # PURE: beta(), correlation_matrix(), max_drawdown(), historical_var()
  return_series.py       # DB: build date-aligned daily-return matrix (holdings + NEPSE Index)
  market_risk_service.py # orchestrates loader + metrics → market_risk dict + alerts
stocks/services/risk_service.py  # composes MarketRiskService; merges into existing response
```

- **`returns_metrics.py`** — pure functions over numpy/pandas return arrays. No Django, no DB.
  Each function ≤30 lines. This is the deep, independently testable core.
- **`return_series.py`** — single responsibility: given tickers + window, fetch closes, compute
  daily returns on actual trading days, align on the intersection of common trading dates with
  the `NEPSE Index` series, and report per-ticker sample counts. Uses the existing
  `NEPSE_INDEX_NAME = 'NEPSE Index'` constant (`fundamental_calculator.py:26`).
- **`market_risk_service.py`** — builds the synthetic current-weights portfolio return series,
  calls the metric functions, emits new alerts, returns a `market_risk` block.
- **`RiskAnalysisService`** — gains one call to `MarketRiskService`; feeds real portfolio beta
  into the radar's `Systemic Risk` axis and appends `market_risk` + new alerts to the response.
  Existing concentration/liquidity/volatility code is untouched.

### Rejected approaches

- **Add methods to `RiskAnalysisService`** — already ~214 lines mixing DB and math; more methods
  break the 30-line/SRP rules and make the math hard to test without DB fixtures.
- **Use quantstats/empyrical** — heavy deps that assume clean continuous series; NEPSE's gappy,
  circuit-limited, holiday-heavy data needs pre-alignment anyway. numpy/pandas already in stack.

## Data flow & NEPSE edge cases

1. `RiskAnalysisService.get_risk_analysis(user, account_id, window=180)` builds holdings as
   today, then calls `MarketRiskService.compute(holdings, window)`.
2. `return_series.build(tickers, window)`: per ticker, fetch closes over the window, compute
   daily returns **only on days it actually traded** (NEPSE has zero-volume/no-trade days and
   holidays), then align every holding and the `NEPSE Index` series on the **intersection of
   common trading dates**. Returns the aligned matrix + per-ticker sample counts.
3. **Insufficient history** (named tiers, no magic numbers):
   - `≥ MIN_FULL_CONFIDENCE` (60) aligned points → computed normally.
   - `MIN_COMPUTE` (20) to 59 points → computed but `low_confidence: true`.
   - `< MIN_COMPUTE` (20) points → `null` metrics for that holding + flag. Never faked.
   Newly-listed / illiquid stocks fall through these tiers gracefully.
4. Metrics computed on the aligned matrix; portfolio uses the **current weights** already
   calculated by `_build_holdings`.

## Metric math

- **Beta** (per holding) = `cov(r_stock, r_index) / var(r_index)`.
  **Portfolio beta** = `Σ weightᵢ · betaᵢ`.
  Radar `Systemic Risk` = `clamp(beta × 5, 1, 10)` — beta 1.0 → 5.0 (preserves today's neutral
  baseline), beta 2.0 → 10.
- **Correlation** = pairwise correlation matrix of holding returns + average off-diagonal value.
- **Max drawdown** = max peak-to-trough of the synthetic portfolio value curve
  (`cumprod(1 + weighted_daily_returns)`), reported as a negative percent.
- **VaR** = historical percentile of synthetic portfolio daily returns: 1-day 95% (5th pct),
  1-day 99% (1st pct); 1-week ≈ `× √5`. Parametric (mean/σ) fallback when sample is thin.

## Alerts (new)

Thresholds as named constants:

- Portfolio beta `> 1.3` → MEDIUM, `> 1.6` → HIGH: "high market sensitivity".
- Any holding pair correlation `> 0.8` → MEDIUM: "hidden concentration: X and Y move together".
- Max drawdown worse than `−30%` → MEDIUM: "portfolio fell N% peak-to-trough in this window".
- Low-confidence data → informational note, not an alert.

## Surfaces

- **API** (`stocks/views/risk.py`) — returns the service dict verbatim, so the new `market_risk`
  block + alerts flow through automatically. Add an optional `?window=` query param (90/180/250,
  default 180). No serializer changes.
- **Chat** — extend `get_risk_profile` (`chat/tools/portfolio.py:174`) prose with beta/VaR/
  drawdown lines; the existing `{"type": "risk"}` card already carries the full dict.
- **Frontend** — new `CorrelationHeatmap.tsx`; market-risk stat cards (beta, VaR 95/99, max
  drawdown) on the risk page (`RiskRadar.tsx`) and in chat `RiskCard.tsx`. Sentence-case labels,
  warm sans, no all-caps. Requires a Docker frontend rebuild + hard refresh to take effect.

## Testing (TDD, red → green)

- **Unit `returns_metrics`** — synthetic arrays with known beta/correlation/drawdown/VaR; exact-
  value assertions. Pure functions drive the whole feature test-first.
- **`return_series`** — fixtures with gaps/holidays/short-history → assert date alignment, sample
  counts, and the three confidence tiers.
- **`market_risk_service`** — series engineered to trip each alert threshold and to stay just
  under it.
- **`risk_service` integration** — radar `Systemic Risk` derives from beta; `market_risk` block
  present; empty/insufficient portfolios degrade cleanly.
- **Frontend** — `CorrelationHeatmap` render test + `RiskCard` / risk-page tests for new fields.

## Deployment notes

- Backend-only logic change for the API/chat (no migration — no model changes).
- Frontend changes require a Docker image rebuild + hard refresh (`localhost:3000` is Docker-built).
- Depends on a continuous `NEPSE Index` series in `DailyIndexValue`; if the index series is
  sparse, beta/VaR degrade to low-confidence rather than failing.

## Open data dependency (flagged, not blocking)

`index_name` values are inconsistent in the codebase: the scraper writes `"NEPSE Index"`
(`scrape_nepse_index.py:33`, matching `NEPSE_INDEX_NAME`), while `analogs.py:105` queries
`index_name__iexact="NEPSE"`. This spec uses the canonical `NEPSE_INDEX_NAME = 'NEPSE Index'`.
If both rows exist, the loader must pick the one with continuous coverage — verify during
implementation.
