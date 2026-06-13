# PA Screener Trust Upgrade — Design

**Date:** 2026-06-10
**Status:** Approved
**Scope:** Audit items 1–5 + 7 from the 2026-06-10 PA screener audit: real win-rate stats, full-market scheduled scan with freshness check, adjusted prices, curated patterns, bearish sniper + swing-pivot BOS, and richer table columns. Deferred to a later round: confluence-score ranking/filters (item 6) and SNIPER notifications (item 8).

## Problem

The Global PA Screener overstates its accuracy: win rates are hardcoded fiction ("62% (5D)" for every bullish pattern), only the first 100 of 244 companies are scanned in arbitrary DB order, stale tickers appear as today's setups, prices are unadjusted for NEPSE's frequent bonus/rights events (creating phantom FVGs and structure breaks), all ~61 TA-Lib patterns fire unfiltered, "BOS" is a re-firing Donchian breakout, and the sniper confluence only exists in the bullish direction.

## Decision

Make the screener honest and complete: measured statistics or no statistics, every ticker scanned on a schedule, adjusted data, a curated pattern set, symmetric confluences, first-break-only structure logic, and a table that shows turnover/RVOL/% change with scan metadata.

## Architecture

```
backend/stocks/models/pattern_stat.py            — PatternStat model (per pattern+sentiment+horizon market-wide stats)
backend/stocks/services/pattern_stats.py         — compute_pattern_stats(): adjusted history → forward returns → Wilson CI
backend/stocks/services/pa_scan.py               — run_pa_scan(): full-market scan, writes payload to Django cache
backend/stocks/analytics/price_action.py         — analyzer: adjusted prices, curated patterns, real stats, pivot BOS, dual sniper
backend/stocks/views/price_action.py             — scanner view returns cached scan payload + metadata
backend/stocks/tasks.py (existing celery module) — beat-scheduled scan + weekly stats recompute
frontend …/market/pa-screener/page.tsx           — metadata header, new columns, sentiment-correct badges, honest copy
```

## 1. Real win-rate statistics (`PatternStat` + `compute_pattern_stats`)

- New model `PatternStat`: `pattern` (TA-Lib name), `sentiment` (BULLISH/BEARISH), `horizon` (5/10), `n`, `wins`, `win_rate`, `ci_low`, `ci_high`, `computed_at`. Unique on (pattern, sentiment, horizon).
- `compute_pattern_stats()`: for every company with ≥120 adjusted bars, run the curated TA-Lib patterns over full adjusted history; each firing on bar *t* contributes a forward close-to-close return over 5 and 10 bars (skip firings within `horizon` of the end). Bullish "win" = forward return > 0; bearish "win" = forward return < 0. Aggregate market-wide per (pattern, sentiment, horizon); store Wilson 95% CI via the existing `wilson_interval`.
- The analyzer attaches stats to each detected pattern: `win_rate`, `ci`, `n`, `horizon: '5D'`. Gating uses the existing `winrate_is_reportable`; when a stat is missing or unreportable the pattern is still listed but with `win_rate: null` and copy that makes no statistical claim. **The hardcoded 62/58% strings are deleted.**
- Recompute weekly via celery beat (cheap: ~244 tickers × curated patterns) and on demand via a management command `compute_pattern_stats`.

## 2. Full-market scheduled scan with freshness (`pa_scan` + view)

- `run_pa_scan()`: market session date = `max(DailyStockPrice.date)`. Scan **all** companies (ThreadPool inside the task, workers=10). Include a ticker only if its latest bar equals the session date. Build the same per-ticker setup dicts as today plus `percent_change`, `turnover`, `rvol` (volume ÷ 20-bar mean). Write `{top_setups, meta: {session_date, scanned, fresh, included, computed_at}}` to Django cache key `pa_screener_scan` (timeout 24h).
- Celery beat: run every 15 minutes during market hours window (10:45–15:15 NPT, Sun–Thu) plus once at end of day; exact crontab in the plan. Stats recompute: weekly.
- `PriceActionScannerView`: return the cached payload; if cache is empty (cold deploy), run `run_pa_scan()` synchronously once. The `cache_page` decorator is dropped (the payload is already cached).
- Sort: turnover descending (replaces raw share volume).

## 3. Adjusted prices in the analyzer

- `PriceActionAnalyzer.__init__` loads raw df then applies corporate actions: reuse the actions-map fetch used by `price_forecast` and `apply_adjustments_long` semantics adapted to the analyzer's lowercase single-ticker frame (multiply o/h/l/c by the compounded factor for bars before each ex_date; divide volume). Implemented as a small `_apply_actions(df, ticker)` helper in the analyzer module so `_get_prices_df` remains untouched for other consumers.
- Effect: bonus/rights gaps stop producing phantom FVG/BOS/zone artifacts. (Daily Wrap-style consumers unaffected — they don't use this analyzer.)

## 4. Curated patterns

- Whitelist (14): ENGULFING, HAMMER, INVERTEDHAMMER, HANGINGMAN, SHOOTINGSTAR, MORNINGSTAR, EVENINGSTAR, 3WHITESOLDIERS, 3BLACKCROWS, PIERCING, DARKCLOUDCOVER, HARAMI, DOJISTAR, MARUBOZU. Only these are computed (faster scans too).
- Display names via an explicit map ("3 White Soldiers", "Dark Cloud Cover", …) — no more `replace('CDL','').capitalize()` mangling.
- Same-day collapse: list at most 3 patterns per bar, ordered by |talib value| then alphabetically; the strongest defines `shape_desc`.

## 5. Swing-pivot BOS + symmetric sniper

- Pivots: fractal swing high = a high strictly greater than the 2 bars on each side (confirmed 2 bars later); same inverted for swing lows.
- BOS fires only on the **first** close above the most recent confirmed swing high (or below the last swing low) — tracked by carrying the active level forward and clearing it once broken. No re-fires on every trend day.
- Sniper becomes symmetric: bullish = bullish pattern or bullish FVG with the bar's low within 1.5% of the demand zone; bearish = bearish pattern or bearish FVG with the bar's high within 1.5% of the supply zone (`type: 'SNIPER', sentiment: 'BEARISH', tag: 'Bearish Sniper'`).
- Zone copy drops the "Institutional" claim: "40-session range high (supply)" / "40-session range low (demand)".

## 7. Frontend table + metadata

- Header strip under the cards: "Scanned {scanned} symbols · {fresh} fresh · session {session_date} · updated {computed_at}". Subtitle becomes honest: "Full-market price-action scan — candlestick patterns, fair-value gaps, and structure breaks."
- Columns: Asset (+% change chip), Primary Triggers, Engine Signals (existing), Context, **Turnover** (replaces raw Volume) + RVOL chip.
- Pattern badges show the real win rate when present ("Engulfing · 61% (n=412)") and nothing statistical otherwise.
- BOS badge color follows `ev.sentiment` (bullish emerald / bearish rose) instead of hardcoded rose.

## Error handling

- Scan task: per-ticker failures are caught and counted in `meta.errors`; the scan never aborts on one bad ticker.
- View with empty cache and a failing synchronous scan returns 503 with `{error}`; the frontend shows its existing empty state plus the error toast pattern.
- Stats job: tickers with insufficient history are skipped silently; the command prints a summary line.

## Testing

- `pattern_stats` unit test: synthetic OHLC frame with a known engulfing firing and known forward returns → exact n/wins/win_rate.
- Analyzer unit tests (pytest, synthetic frames): bonus-adjustment kills a phantom FVG; pivot BOS fires once and only once across a trend; bearish sniper fires at the supply zone.
- Scanner freshness test: a ticker with a stale last bar is excluded; meta counts reflect it.
- Frontend: `npx tsc --noEmit` + build; manual run-through of the page.
- Backend tests run via the project's pytest setup inside the backend container.

## Out of scope (deferred)

- Confluence scoring, sector/direction filters, pagination (audit item 6).
- SNIPER push notifications (audit item 8).
- Backfilling CorporateAction coverage beyond the current 22 tickers (data task — adjustments apply wherever actions exist).
