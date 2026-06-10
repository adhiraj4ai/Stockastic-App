# Stockastic Research Engine — Master Roadmap

**Mission:** Turn Stockastic into a trustworthy offline research engine for NEPSE — one that identifies the trades and strategies with the highest *validated* win rate and return, with numbers a user can act on with real money.

**Context:** Full architecture audit completed 2026-06-10. Key finding: every measurement bias found (unadjusted prices, survivorship, understated fees, in-sample optimization) pushes win rates and returns UP, so current "best opportunity" rankings are not trustworthy. The platform's unique assets — floorsheet/broker-flow data and the live `SignalEpisode` track record — are underexploited.

**Constraint:** No NEPSE API access. Data ingest stays manual (CSV upload / GitHub mirror) but gets validation gates. Nothing in this roadmap requires live market connectivity.

**Sequencing rule:** Plans must execute in order 1 → 2 → 3. Plans 4 and 5 are independent and can interleave anytime. Do NOT tune or rank strategies (Plan 3) before the measurement layer (Plans 1–2) is honest — that would just rank bias artifacts.

---

## Plan 1 — Honest Backtest Foundation *(detailed plan written: `2026-06-10-plan1-honest-backtest-foundation.md`)*

Make every number the harness produces reflect reality.

- Real NEPSE trading costs in the backtest harness: tiered broker commission (0.24–0.36%) + SEBON 0.015% + Rs 25 DP charge, plus a bid-ask spread assumption — replacing the flat `commission=0.002`.
- Fill-realism regression test guarding against same-bar (lookahead) fills.
- `CorporateAction` model + adjustment-factor math (bonus/rights/split), backfilled from the existing `Dividend` table.
- Adjusted OHLCV in `load_price_df` so indicators and returns are continuous across bonus events.
- Ingest validation gates on the manual CSV/GitHub upload endpoints (OHLC sanity, rejection logging) — garbage can no longer enter silently.
- `DelistingRecord` registry + as-of-date research universe helper (survivorship-bias mitigation going forward).
- Re-baseline all 41 strategies with honest settings; commit the before/after report.

**Exit criteria:** new baseline report committed; every harness run uses adjusted prices and real fees by default; ingest rejects malformed rows with logged reasons.

## Plan 2 — Statistical Rigor Layer

Stop the scorecard from blessing lucky strategies.

- Wilson confidence intervals on every reported win rate; minimum-trade-count gates before any win rate is displayed (raise `MIN_MEDIAN_TRADES` for win-rate claims; keep 3 only for "not degenerate").
- Walk-forward optimization in `optimization_service.py`: anchored train/test split (tune on first ~70%, accept on OOS tail via the existing `oos_fraction` seam); `best_params` stored with their OOS metrics, never in-sample ones.
- Monte Carlo permutation test per strategy (shuffle entry dates, compare realized vs. null distribution) added to the scorecard as a `statistically_significant` verdict.
- Multiple-testing awareness: when ranking the 41-strategy family, report deflated/adjusted significance, not raw ranks.
- Per-symbol verdict logging so "weak alpha" failures are distinguishable from "bad data" failures.
- Fix the 6 SafeTa indicator gaps (supertrend, psar, aroon, coppock, cmf, kc/efi) so `runs_clean` failures disappear.

**Exit criteria:** scorecard shows CI + significance per strategy; optimization never reports in-sample metrics as results.

## Plan 3 — Opportunity Engine (the product)

Turn validated measurements into a daily "best opportunities" surface.

- **Daily opportunity ranking:** every (strategy × symbol) pair with a current signal, ranked by validated OOS expectancy — `win_rate × avg_win − loss_rate × avg_loss`, net of Plan 1 fees — displayed with confidence interval and sample size.
- **Backtest-vs-live divergence dashboard** built on `SignalEpisode`: realized episode win rate vs. backtested expectation per producer; divergent strategies get demoted/flagged as overfit. This is the platform's true out-of-sample validation loop.
- **Regime conditioning:** win rates reported conditional on market regime (NEPSE index trend filter), using the existing Regime components from the strategy framework.
- Broker-accumulation event study upgraded with the same OOS discipline and folded into the ranking as an independent signal family; rebrand current "forecast" bands as *historical analogues* with calibration tracking (how often did the p50 band contain the realized price?).
- Chat agent gets `get_top_opportunities` / `explain_opportunity` tools over the same ranked data.

**Exit criteria:** one screen (and one chat tool) answers "what are today's best validated opportunities and how sure are we?"

## Plan 4 — Money-Math Correctness *(independent; high value, small scope)*

- CGT holding-period fix: derive `is_long_term` from buy/sell dates instead of hardcoded `False` (`portfolio_service.py:123`).
- `RIGHTS` transaction type + WACC handling; Decimal quantities for fractional bonus shares.
- TWR and XIRR portfolio performance endpoints; dividend-yield denominator fix (historical cost at book close, not current invested).
- **P&L golden test suite** — WACC across BUY/BONUS/SELL sequences, CGT both rates, dividend tax, short P&L — written BEFORE the fixes, locked in after.

## Plan 5 — Platform Hygiene *(independent; do opportunistically)*

- `requirements.txt`: add `celery` + `redis` (settings/compose already assume them); harden `DEBUG`/`ALLOWED_HOSTS`/`SECRET_KEY` defaults; remove `makemigrations` from `entrypoint.sh`.
- Chat cost controls: per-user token budget, rate limit on `/send/`, sanitized error frames, escaped username in prompts.
- Nightly `pg_dump` backup job (the price/floorsheet history is the moat — protect it).
- Minimal CI: pytest + lint on push.
- Frontend: remove localStorage token copy (`login/page.tsx:52`), add error boundaries, adopt TanStack Query for server state.
- README truth pass: remove/mark "LSTM and Prophet forecasting" until it exists.

---

## Explicitly out of scope (per product direction)

Live order routing, T+2 settlement simulation beyond a note in docs, circuit-breaker fill enforcement, draft→execute trade endpoint as a trading feature, production TLS/HA infra, the Flutter mobile app.
