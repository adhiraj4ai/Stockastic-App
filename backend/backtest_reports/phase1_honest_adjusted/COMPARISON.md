# Fully-adjusted re-baseline (Task 11: real corporate-action history)

**Run date:** 2026-06-10 · **New honest baseline: 20/41** (was 21/41 with only 1 corporate action in the DB)

## What changed

`fetch_dividends` (new ShareSansar scraper) ingested the basket's real dividend history:
**198 dividend records → 154 bonus events → 152 CorporateActions across 22 of 24 tickers** (previously 1).
Two contradicted legacy seed rows (and their stale action) were purged.

The effect is large and verified:
- NABIL 2020 close: raw 680 → adjusted **321.7** (factor 0.473 — its ~86% cumulative bonus issuance)
- CBBL: 927 → **384.4** (factor 0.415)
- Last closes identical in raw vs adjusted (adjustment only rescales history) ✓

**Buy-and-hold was previously massively understated** — bonus ex-date drops read as price losses.
NABIL raw B&H 2020-2026 was −16%; adjusted it is **+61%**. The strategy bar got honestly harder.

## Pass-list changes (21 → 20)

| Direction | Strategies | Why |
|---|---|---|
| LOST pass | Z-Score Mean Reversion, Chaikin Money Flow Divergence, Williams %R Trend | adjusted B&H is harder to beat |
| GAINED pass | Smart Money Accumulation, MACD + Parabolic SAR | continuous prices removed phantom crashes from their indicators |

**The validation that matters:** all three strategies that lost their pass were already flagged as
**overfit suspects by Plan 2's FDR analysis** (economic pass, significance fail). The statistical
layer predicted which passes were fragile before the corrected data existed; the corrected data
confirmed it. The remaining 20 are measured against honest fees AND honest prices.

Also in this change (Task 12): the price-forecast event study and sector-rotation analytics now load
**adjusted** prices via `apply_adjustments_long` (consistent with the harness — broker-flow studies
no longer read bonus drops as moves), and close-only ingested bars are back-filled to coherent flat
bars instead of storing High=0 < Close.

**20/41 on fully-adjusted, fee-honest, full-cycle data is the reference for all future strategy work.**
Re-run `rank_strategies` for the updated FDR view when convenient.
