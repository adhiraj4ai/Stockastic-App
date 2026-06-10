# Phase 2 — Statistical Rigor: family ranking summary

**Run date:** 2026-06-10 · **Basket:** 24 pinned NEPSE tickers, 2020–2026 full cycle
**Command:** `python manage.py rank_strategies --out backtest_reports/phase2_ranking`

## Headline

| Filter | Count | Meaning |
|---|---:|---|
| Pass the **economic** bar (5-verdict scorecard) | 21 / 41 | beats buy & hold, risk-adjusted, trades enough |
| Survive **FDR@0.05** (Benjamini–Hochberg over the family) | 20 / 41 | edge over B&H is statistically distinguishable from luck, *after* correcting for testing 41 strategies |
| **Pass BOTH** — the defensible shortlist | **16 / 41** | economically meaningful AND statistically significant |

The economic bar and the significance test are **different questions**, and the gap between them is the whole point of Plan 2:

- **Overfit suspects — pass economics, FAIL significance (5):** Williams %R Trend, Chaikin Money Flow Divergence, Supertrend Follower, RSI-2 Mean Reversion, Z-Score Mean Reversion. These beat B&H on the basket but their per-symbol excess edge does not survive multiple-testing correction — exactly the "looked great in backtest, probably luck" trap. **Do not rank these as top opportunities** without out-of-sample confirmation.
- **Significant but fail a verdict (4):** Fibonacci Golden Zone, VWAP Pullback, Smart Money Accumulation, MACD + Parabolic SAR. A real edge over B&H, but they trip an economic verdict (e.g. drawdown-adjusted or activity). Worth a second look / re-parameterization rather than discarding.

## What "significance" means here (and its limits)

`excess_pvalue` is a one-sample bootstrap of the mean of **per-symbol excess-over-buy&hold returns** against a mean-shifted null (calibrated for asymmetric P&L; not a symmetry-assuming sign-flip). The family p-values are corrected with Benjamini–Hochberg at FDR 0.05. Win rates are shown with Wilson 95% intervals and gated at ≥30 pooled trades (all 41 cleared the gate this run; none shown as `low-n`).

Honest limitations to carry into Plan 3:
- **24 symbols is a modest n** for the bootstrap; q-values near the 0.05 boundary (e.g. NR7, Force Index at q≈0.042) are fragile.
- Per-symbol excess returns in a single correlated market (NEPSE) are not fully independent; the symbol-level bootstrap is a reasonable but not perfect treatment of that dependence.
- **This is still in-sample-on-history significance.** The decisive validation is *forward*: Plan 3's `SignalEpisode` backtest-vs-live divergence loop, where realized signal outcomes confirm or refute these rankings on data the strategies never saw.

## Top of the ranking (pass + FDR-survivors, by median excess)

| Strategy | medExcess% | win rate (95% CI) | q |
|---|---:|---|---:|
| Dual Thrust Breakout | 745.9 | 37% [35–40] | 0.004 |
| Three White Soldiers | 616.5 | 41% [37–45] | 0.016 |
| RSI & Bollinger Mean Reversion | 608.5 | 65% [56–73] | 0.016 |
| On-Balance Volume Trend | 212.2 | 26% [22–29] | 0.008 |
| NR7 Volatility Breakout | 164.8 | 30% [25–36] | 0.042 |
| Volatility Stop (ATR Trailing) | 154.5 | 29% [26–32] | 0.010 |
| Elder's Triple Screen | 115.3 | 56% [51–61] | 0.017 |

(Full 41-row table with all metrics: `ranking.json`.)

## For Plan 3 (Opportunity Engine)

The **16 pass-both strategies are the trustworthy shortlist** to feed the daily opportunity ranking — ranked by validated, fee-net expectancy and displayed with their win-rate CI. The 5 overfit suspects are the cautionary set: they must earn their place via live `SignalEpisode` confirmation, not backtest shine. Optimization now stores walk-forward OOS metrics (`oos_value`/`oos_accepted`) per experiment, so per-symbol tuning can be filtered to params that held up out-of-sample.
