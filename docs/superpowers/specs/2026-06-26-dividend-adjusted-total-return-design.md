# Dividend-Adjusted Total Return — Design Spec

**Date:** 2026-06-26
**Status:** Approved (design); pre-build
**Tier:** Tier 3, feature 3 of 4

## Problem

Portfolio returns today are **capital-gain only**: `(current_price − wacc) × qty`. They ignore
cash dividends received and the realized P&L of sold portions. On NEPSE — a market with heavy
cash-dividend and bonus culture — this understates an investor's *true* return. A holding flat on
price but paying 8% cash dividends for years shows ~0% return today.

## Goal

Compute and surface a **total return** per holding and per portfolio:

> total return = realized capital gain + unrealized capital gain + cash dividends received (net)

as both absolute Rs and a percentage of cost basis. Surface it in the portfolio metrics API and
the chat `get_holdings` / `get_portfolio_overview` tools.

## Key correctness decision — no bonus double-counting

Bonus shares are **already captured** in unrealized gain: a `BONUS` transaction raises `quantity`
and dilutes `wacc` while holding total cost flat (see `portfolio_service._process_bonus` and
`dividend_service._update_ticker_state`). So `current_value = qty(incl. bonus) × price` and
`unrealized = current_value − qty × wacc` already reflect the bonus shares' value. Adding a
separate "bonus-share value" term would double-count. Therefore:

- Total return does **not** add bonus value separately.
- `bonus_shares_received` (a count, from `DividendService`) is reported as an **informational**
  line, not summed into the return.

## Non-goals

- Dividend/bonus-adjusted historical *price series* for charts (deferred — touches charting).
- Time-weighted or money-weighted return (IRR). This build is a simple cumulative total return.
- Changing how dividends or WACC are stored.

## Approach

### Reuse `DividendService.calculate_dividends(user)`

It already returns (verified):
- `summary.total_cash_net` and per-row `history[].{ticker, cash_dividend_net, bonus_shares}` —
  dividends *received while held* (segregated from upcoming by `book_close_date`).
- `realized_pnl: [{ticker, realized_pnl, ...}]` and `summary.total_realized_pnl` — realized P&L
  per ticker, already net of fees + CGT.

So the cash-dividend and realized-gain pieces are **read from `DividendService`**, not recomputed.

### New `total_return_service`

`backend/stocks/services/total_return_service.py` — composes `DividendService` output with current
holdings:

- `TotalReturnService.compute(user, account_id=None) -> dict`:
  - Build per-ticker aggregates: `cash_dividends_net` (sum of `history` rows by ticker),
    `realized_pnl` (from `realized_pnl` list), `bonus_shares_received` (sum of `history` bonus by
    ticker — informational).
  - For each **currently-held** `PortfolioItem` (qty > 0): `invested = qty × wacc`,
    `unrealized = qty × latest_close − invested`.
  - Per-holding `total_return_abs = unrealized + cash_dividends_net[ticker]`;
    `total_return_pct = total_return_abs / invested` (guard `invested == 0`).
    (Realized P&L belongs to *sold* shares, so it is reported at the portfolio level, not folded
    into a held position's percentage — keeps the per-holding % interpretable.)
  - Portfolio level: `portfolio_total_return = Σ held unrealized + total_cash_net + total_realized_pnl`;
    `portfolio_total_return_pct = portfolio_total_return / total_invested` (Σ held `qty × wacc`).
  - Returns `{holdings: [{ticker, invested, unrealized, cash_dividends_net, bonus_shares_received,
    total_return_abs, total_return_pct}], summary: {total_invested, total_unrealized,
    total_cash_dividends, total_realized_pnl, portfolio_total_return, portfolio_total_return_pct}}`.

Helpers keep each function ≤30 lines (price lookup, per-ticker dividend aggregation, per-holding
row, summary).

### Surfaces

- **API:** add a `total_return` block to the portfolio metrics endpoint
  (`portfolio_metrics_service` / its view) — additive, no contract break.
- **Chat:** `get_holdings` adds per-holding `total_return_abs`/`total_return_pct`;
  `get_portfolio_overview` adds the portfolio-level total-return summary + a one-line prose
  ("Total return incl. dividends: Rs X (Y%)"). Reuse the existing card; add fields to its data.

## Components

| Unit | Responsibility |
|------|----------------|
| `stocks/services/total_return_service.py` (new) | Compose DividendService + holdings into total-return figures |
| `portfolio_metrics_service` (or its view) | Expose additive `total_return` block |
| `chat/tools/portfolio.py` (`get_holdings`, `get_portfolio_overview`) | Surface per-holding + portfolio total return |

## Constants

- Reuse existing percent/face-value constants; no new magic numbers.
- Withholding tax already applied inside `DividendService` (`cash_dividend_net`) — do not re-apply.

## Testing (TDD)

- **`total_return_service`** (DB fixtures): a holding flat on price with recorded cash dividends
  shows positive total return from dividends alone; a held position with price gain + dividends
  sums both; a position with a recorded BONUS txn is NOT double-counted (total return equals
  unrealized + cash, with unrealized already reflecting the bonus shares); `invested == 0` guard;
  portfolio summary aggregates held unrealized + total cash + total realized.
- **DividendService reuse**: assert the service is called and its `history`/`realized_pnl` feed the
  aggregates (monkeypatch `DividendService.calculate_dividends` to a fixed dict and verify mapping).
- **Chat tools**: `get_holdings` includes `total_return_abs`/`total_return_pct`;
  `get_portfolio_overview` prose mentions total return (invoke via `.handler(...)`, the established
  pattern; set user via `chat._user_context.set_user`).

## Deployment notes

- Backend-only; **no migration** (read-only aggregation).
- Chat + API behavior change. Frontend that renders the holdings/overview cards may need a small
  display tweak to show the new fields — flagged for a follow-up frontend task; the backend ships
  the data regardless. (No frontend change is in this feature's scope; if the existing card reads
  fields defensively, the new fields are simply ignored until surfaced.)

## Open detail to confirm at build time

`DividendService.calculate_dividends` scopes to LIVE/`account__isnull` transactions for realized
P&L. Confirm whether `total_return` should be account-scoped (e.g. a specific PAPER account) or
LIVE-only; default to **mirroring DividendService's existing scoping** (LIVE + null-account) for
consistency, and compute held-position unrealized from `PortfolioItem` filtered by `account_id`
when provided. If the two scopings can disagree, document the chosen scope in the tool prose.
