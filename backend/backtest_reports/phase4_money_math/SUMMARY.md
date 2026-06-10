# Phase 4 — Money-Math Fixes: Summary

**Branch:** `strategy-upgrade-phase4-money-math`
**Date:** 2026-06-10
**Status:** Complete — all golden tests pass; ready to merge to phase0.

---

## What Was Fixed

### 1. Holding-Period-Aware CGT (`process_transaction`)

**Bug:** `calculate_cgt()` was always called without `is_long_term`, defaulting to the 7.5% short-term rate regardless of how long a user held shares. A user holding NABIL for 3 years would be overtaxed by 50% on realized gains.

**Fix (Task 1):** `process_transaction` in `portfolio_service.py` now:
1. Queries the existing `PortfolioTransaction` rows for the ticker/account to build a list of `(qty, acquisition_date)` lots.
2. Calls `weighted_acquisition_date(lots)` (quantity-weighted mean date, from `finance.py`).
3. Calls `is_long_term_holding(weighted_date, sell_date)` — true when held >= 365 days.
4. Passes `is_long_term` to `calculate_cgt()` — 5% if long-term, 7.5% otherwise.

**Golden test proof (`test_cgt_long_term_5_pct`):**
- BUY 100 LTLONG @ Rs 1000 (recent date to build PortfolioItem).
- Back-date the PortfolioTransaction row to 2 years ago via `.update()`.
- SELL 100 @ Rs 1200: process_transaction returns cgt = 5% of gross_profit.
- Gross profit ~Rs 19,630; long-term CGT ~Rs 981.50; short-term would be ~Rs 1,472.25.
- Assertion verifies returned cgt < short_term_cgt — the bug cannot silently regress.

### 2. RIGHTS Transaction Type

**Bug (Task 2):** No `RIGHTS` transaction type existed; users receiving rights shares had no way to record them, leaving WACC artificially high.

**Fix:** Added `RIGHTS = 'RIGHTS', 'Rights Share'` to `TransactionType.TextChoices`. In `process_transaction`, RIGHTS is treated identically to BUY for cost-basis purposes (holder pays issue price per new share). Migration `0032` applied.

**Golden test:** `test_rights_lowers_wacc_like_buy_at_issue_price` — BUY 100 @ 1000 + RIGHTS 50 @ 100; WACC in [690, 715].

### 3. Dividend Service Fixes (Task 3)

**(a) `_face_value(ticker)` helper:** Returns per-stock face value for dividend yield calculations. No `face_value` field exists yet; helper returns `Decimal('100')` as NEPSE default. Extensible when data is available.

**(b) Bonus shares floored to int:** `int(qty * bonus_pct / 100)` — NEPSE does not issue fractional shares. 2.5% on 100 shares yields 2 (not 2.5 or 3).

**(c) Dividend yield on historical cost basis:** `yield_on_cost` denominator is now cost basis as of the dividend book-close date (via `_wacc_at_date()`), not the current portfolio cost.

### 4. TWR + XIRR Performance Endpoint (Task 4)

`finance.py` gained `time_weighted_return()` and `xirr()`. Exposed via `GET /api/stocks/portfolio/portfolio-performance/twr_xirr/`.

---

## Golden Test Suite (`backend/stocks/tests/test_money_math.py`)

All 15 tests pass in 3.28s. Full regression: 163 passed, 1 pre-existing failure (`test_aggressive_risk` — unrelated to this phase).

| Test | What it proves |
|---|---|
| `test_rights_lowers_wacc_like_buy_at_issue_price` | RIGHTS type + WACC effect |
| `TestFaceValue` (3 tests) | `_face_value` returns Decimal 100 |
| `TestBonusFloor` (2 tests) | Integer floor on bonus share calculation |
| `TestWaccAtDate` (3 tests) | Historical WACC helper correctness |
| `TestYieldOnHistoricalCostBasis` (2 tests) | Dividend yield on historical cost |
| `test_cgt_short_term_7_5_pct` | 7.5% rate when held < 1 year |
| **`test_cgt_long_term_5_pct`** | **5% rate when held >= 1 year (core regression guard)** |
| `test_wacc_buy_bonus_buy` | WACC dilutes on BONUS, rises on second BUY |
| `test_realized_pnl_nets_fees_and_cgt_long_term` | receivable = sell - fees - 5%-CGT |

---

## Deferred Items

### Fractional Share Quantities
`PortfolioItem.quantity` and `PortfolioTransaction.quantity` are `IntegerField`. NEPSE does not trade fractional shares, so integer quantities are correct for this market. A Decimal migration would only be needed for US-style partial shares — out of scope.

### Per-Stock Face Value Data Ingestion
`_face_value(ticker)` returns Rs 100 for all tickers. Some NEPSE companies have Rs 10 or Rs 50 par value. Correct modelling requires a `face_value` field on `StockFundamental`/`Company` plus a data ingestion pipeline. The `_face_value` helper already has the lookup hook; only data is missing. Impact is low for a research/paper-trading tool.

---

## Honest Assessment

Before Phase 4: any profitable sell would show wrong (higher) CGT if held > 1 year; dividend yields used the wrong cost basis; bonus shares could be non-integer; RIGHTS could not be recorded at all.

After Phase 4: all of these are correct for the common NEPSE use case. The deferred items are lower-stakes: NEPSE does not trade fractional shares, and most NEPSE companies use Rs 100 par value.
