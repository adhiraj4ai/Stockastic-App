# Cost & Tax-Aware Rebalance — Design Spec

**Date:** 2026-06-26
**Status:** Approved (design); pre-build
**Tier:** Tier 3, feature 2 of 4

## Problem

`propose_rebalance` (chat) drafts BUY/SELL legs to move a portfolio toward an optimizer's
target weights. Two defects:

1. **Broken optimizer-result wiring (pre-existing bug).** `_run_optimizer`
   (`chat/tools/trading.py:282`) reads `opt.get("optimal_weights")` and
   `opt.get("latest_prices")`, but `perform_portfolio_optimization`
   (`stocks/services/optimization/__init__.py`) returns `weights`, `metrics`, `trades`,
   `note` — there are no `optimal_weights`/`latest_prices` keys. So `weights` resolves to
   `{}`, every target weight becomes 0, and the tool would propose **selling the entire
   portfolio**. No behavioral test guards this.
2. **No cost/tax awareness.** `_compute_rebalance_trades` already computes per-leg fees + CGT
   via `_trade_preview` (stored in `lines[].fees`) but never aggregates them, never weighs them
   against expected benefit, and proposes every leg the optimizer suggests — including
   micro-legs whose NEPSE commission + SEBON + DP (Rs 25 flat) + CGT exceed any plausible gain.

## Goal

1. **Fix** the optimizer-result wiring so real target weights drive the legs.
2. Make rebalance **cost & tax aware**: aggregate per-leg friction, estimate each leg's expected
   annual benefit, **suppress legs whose friction ≥ benefit (net-negative)**, and report total
   friction, net-of-cost benefit, and the suppressed legs.

## Non-goals

- Rewriting the optimizer or its weighting math.
- Modeling exact future returns — the benefit estimate is an explicitly-labeled 1-year,
  historical-mean heuristic, not a forecast.
- The other three Tier 3 features (each has its own spec).

## Approach

### Part 1 — Fix optimizer-result wiring

`_run_optimizer` must read the keys the service actually returns:
- `weights = opt.get("weights") or {}`
- Prices: the service does not return `latest_prices`. Resolve price per ticker from the
  holdings map (`holdings[t]["price"]`, already the latest `DailyStockPrice` close), which is
  the same source `_build_holdings_map` uses. Keep the existing `total_value` computation.
- Add a guard: if `weights` is empty after a `success` result, return an error rather than
  silently proposing a full liquidation.

### Part 2 — Expose per-asset expected returns from the optimizer

`metrics` is portfolio-level only, so add an additive, backward-compatible key to
`perform_portfolio_optimization`'s return dict:
- `expected_returns: dict[str, float]` = annualized mean of each asset's daily returns
  (`returns.mean() * TRADING_DAYS_PER_YEAR`), computed from the `returns` DataFrame already in
  scope. Existing callers ignore the new key; no behavior change for them.

### Part 3 — Cost/tax-aware leg economics (new pure module)

New `chat/tools/rebalance_economics.py` — pure functions, no DB, independently testable:
- `leg_friction(fees: dict) -> float` — sum of `commission + sebon_fee + dp_charge + cgt`.
- `expected_annual_benefit(delta_weight_value: float, asset_annual_return: float) -> float` —
  `abs(delta_weight_value) * abs(asset_annual_return)`. The magnitude of the asset's expected
  one-year move on the capital being shifted. (Heuristic, 1-year horizon — labeled as such.)
- `is_net_negative(friction: float, benefit: float) -> bool` — `friction >= benefit`.

`_compute_rebalance_trades` then, per leg:
- computes `friction` from the already-computed `pv` fees,
- computes `delta_weight_value = abs(delta) * price` and pulls the asset's annual return from
  `expected_returns`,
- computes `benefit` and, if `is_net_negative`, **drops the leg** from `trades`/`lines` and adds
  it to a `suppressed` list with `{ticker, action, quantity, friction, benefit, reason}`.

### Part 4 — Reporting

`_run_propose_rebalance` and the proposal card report:
- per-leg friction (already in `lines[].fees`) and per-leg `net_benefit`,
- `total_friction` across kept legs,
- the `suppressed` legs with a one-line reason ("fees + CGT (Rs X) exceed expected 1-year
  benefit (Rs Y)"),
- if ALL legs are suppressed: "Optimal allocation is within rebalancing costs — no
  cost-justified trades." (not an error, a valid outcome).

The benefit estimate is presented with explicit framing ("estimated 1-year benefit, based on
historical average returns") so it is never read as a guarantee.

## Components

| Unit | Responsibility |
|------|----------------|
| `stocks/services/optimization/__init__.py` | + `expected_returns` key (annualized per-asset mean) |
| `chat/tools/rebalance_economics.py` (new) | Pure leg-economics functions (friction, benefit, net-negative) |
| `chat/tools/trading.py` `_run_optimizer` | Read correct keys (`weights`); empty-weights guard |
| `chat/tools/trading.py` `_compute_rebalance_trades` | Use economics module; suppress net-negative legs; collect `suppressed` |
| `chat/tools/trading.py` `_run_propose_rebalance` | Report total friction, net benefit, suppressed legs |

## Constants

- `TRADING_DAYS_PER_YEAR = 252` (annualization).
- No magic numbers; suppression threshold is `friction >= benefit` (no tunable knob in this
  build — keeps it simple and defensible).

## Testing (TDD)

- **Pure `rebalance_economics`:** friction summation; benefit magnitude; net-negative boundary
  (friction just below / equal / above benefit). Exact-value assertions.
- **`expected_returns` key:** optimizer result includes per-asset annualized returns; value
  matches `returns.mean()*252` on a small synthetic frame.
- **`_run_optimizer` fix:** with a `weights` dict present, target weights are read (not `{}`);
  empty weights → error, not full liquidation. (Mock `perform_portfolio_optimization`.)
- **`_compute_rebalance_trades`:** a micro-leg with friction > benefit is suppressed and listed;
  a large beneficial leg is kept; the all-suppressed case returns the "within costs" message.
- Existing optimization tests (`stocks/tests/test_optimization_*`) must stay green (the
  `expected_returns` addition is additive).

## Deployment notes

- Backend-only; no migration (no model changes).
- Chat behavior change only; frontend renders the existing proposal card (now with friction +
  suppressed legs in the preview payload — no frontend change required, but the card will show
  the richer preview).

## Open detail to confirm at build time

`perform_portfolio_optimization` for the single-ticker path returns via `single_stock_result`
(a different code path) — confirm the `expected_returns` key is added there too, or that the
rebalance flow (which needs ≥2 holdings to rebalance) never hits the single-stock path. The
suppression logic must degrade gracefully if `expected_returns` lacks a ticker (treat missing
as benefit 0 → leg suppressed only if it also has friction, with a "no return estimate" note).
