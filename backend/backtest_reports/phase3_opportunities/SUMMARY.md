# Phase 3 — Opportunity Engine: summary

**Run date:** 2026-06-10 · **Command:** `python manage.py rank_opportunities` (also `GET /api/stocks/opportunities/`, chat `get_top_opportunities`)

## What this delivers

The daily "best validated opportunities" surface — the product the whole roadmap was building toward. For every (strategy × symbol) signalling **BUY today**, it ranks by a composite of:

| Factor | Source | Why |
|---|---|---|
| **edge** = annualized, fee-net return on *this symbol* | Plan 1 fees + per-symbol `run_backtest` | frequency-aware (a single multi-bagger can't dominate) and symbol-specific |
| **significance** | Plan 2 family p-value (FDR) | is the strategy's edge distinguishable from luck? |
| **trust** | live `SignalEpisode` record (Plan 3) | does the live signal record confirm the backtest? |
| **regime-alignment** | universe breadth regime | a BUY is worth more in a RISK_ON market |

`DIVERGENT` producers (backtest looks good but the live record contradicts it) are forced to the bottom. SELL signals from long-only strategies are surfaced as **exits**, not ranked as entries.

## Today's reading (sample run, 8-symbol set)

- **Market regime: RISK_OFF** (breadth 0.228 — only 22.8% of the universe above its 200-day SMA). A defensible, bearish tape.
- **2 BUY entries vs 76 exits** — coherent: in a falling market most long strategies are exiting, few are entering.
  - `UPPER` via Smart Money Accumulation — **+36.8% annualized edge, p=0.003 (significant)**, ranks first.
  - `NRIC` via Turtle Soup Reversal — −33.4% edge, p=1.0 (not significant), ranks last.
- **Every opportunity is UNCONFIRMED.** This is the most important caveat: there are **zero resolved live `SignalEpisode`s** on this install yet, so the trust layer cannot yet promote anything to CONFIRMED or flag anything DIVERGENT. The infrastructure is in place and correct; its decisive value switches on once generated signals accumulate and resolve (hit target/stop) over coming weeks.

## How to read it (and its limits)

- **The fix that mattered:** an earlier version ranked on basket-pooled per-trade expectancy, producing 576%/trade artifacts and identical scores for every symbol of a strategy. The shipped engine ranks on per-symbol annualized fee-net edge — differentiated and sane (−33% … +37%).
- **Still in-sample-on-history for the edge.** The `edge` is a backtest annualized return; significance is family-level (Plan 2), not per-symbol. The genuinely out-of-sample layer is `trust` — and it is dormant until live episodes resolve. **Treat today's ranking as "backtested + significant candidates," not yet "live-confirmed."**
- **Engine producers** (broker-accumulation etc.) are ranked on their live realized record (`basis="live"`), a different basis than backtest-validated strategy entries — flagged per row. None surfaced today (no ACTIVE non-user episodes).
- **Residual config note:** `infer_current_signal` (the "signals today" call) and the per-symbol `run_backtest` now both use the strategy's `best_params`, but `infer_current_signal`'s fee assumptions differ slightly from the harness — a small known mismatch, tracked.

## Surfaces shipped

- `python manage.py rank_opportunities [--symbols] [--limit] [--out]`
- `GET /api/stocks/opportunities/?symbols=&limit=` → `{regime, opportunities, exits, skipped}`
- Chat: `get_top_opportunities`, `explain_opportunity` (buy-sell-strategist subagent)

## What would make it sing

1. **Accumulate & resolve live signals** (run `generate_all_signals` on a schedule; let episodes hit target/stop) — this is what activates CONFIRMED/DIVERGENT and turns the ranking from "backtested candidates" into "live-validated opportunities."
2. Frontend opportunity page (deferred — baked image; backend-only this plan).
3. Per-symbol significance (cheap bootstrap on the per-symbol backtest's trade returns) to replace the family-level p-value gate.
