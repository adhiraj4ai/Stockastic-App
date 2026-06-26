# Paper-Trading NEPSE Realism (T+2 + Short Flag) — Design Spec

**Date:** 2026-06-26
**Status:** Approved (design); pre-build
**Tier:** Tier 3, feature 4 of 4

## Problem

Paper trading settles **instantly (T+0)**: a BUY's shares are immediately sellable and a SELL's
proceeds are immediately spendable. NEPSE settles **T+2** — shares bought today cannot be sold for
2 trading days, and sale proceeds aren't available until settlement. Separately, NEPSE **prohibits
short selling**, yet paper accounts allow `SHORT_SELL` / `BUY_TO_COVER` with no compliance signal.

## Goal

1. **T+2 settlement** for PAPER accounts:
   - Each transaction stores a `settlement_date` (2 NEPSE trading days after the trade).
   - A paper **SELL** of more shares than are *settled* is rejected.
   - A paper **BUY** that would spend *unsettled* sale proceeds is rejected.
2. **Short-selling compliance flag**: `SHORT_SELL` / `BUY_TO_COVER` keep working in paper accounts
   (existing tests preserved) but carry a "simulation only — not NEPSE-permitted" warning.

## Non-goals

- Changing LIVE-account behavior (real settlement happens at the broker; LIVE is untouched).
- Slippage, partial fills, intraday rules (deferred).
- Hard-removing short selling (the user chose flag-not-block to preserve existing functionality).
- A public-holiday calendar — settlement uses the *weekly* trading pattern; ad-hoc holidays are a
  documented approximation.

## Approach

### Migration

Add `settlement_date = models.DateField(null=True, blank=True, db_index=True)` to
`PortfolioTransaction` (migration `0043`). Nullable so existing rows are unaffected (treated as
already settled — see below).

### `SettlementService` (new, `stocks/services/settlement_service.py`)

- `trading_weekdays() -> set[int]`: the weekday numbers (Mon=0 … Sun=6) that actually trade,
  derived from recent `DailyMarketSummary.date` values. Falls back to NEPSE's default
  `{6, 0, 1, 2, 3}` (Sun–Thu) when market data is sparse.
- `next_settlement_date(trade_date, trading_days=2) -> date`: step forward from `trade_date`,
  counting only days whose weekday is in `trading_weekdays()`, until `trading_days` counted.
  Forward-computable without future market data. `_SETTLEMENT_TRADING_DAYS = 2` constant.
- `settled_quantity(user, account, ticker, as_of) -> int`: net **settled** position =
  Σ(BUY/BONUS/RIGHTS qty with `settlement_date <= as_of` OR `settlement_date IS NULL`) −
  Σ(SELL qty, all). Unsettled recent buys are excluded from what's sellable.
- `unsettled_sale_proceeds(user, account, as_of) -> Decimal`: Σ `receivable_amount` of SELLs with
  `settlement_date > as_of` — cash credited but not yet usable.

`settlement_date IS NULL` (legacy rows, and non-paper) counts as settled, so the feature is
backward-safe.

### Enforcement (PAPER accounts only)

In `PortfolioService.process_transaction`, before `_dispatch_txn_type`, add a settlement guard for
PAPER accounts (a new `_enforce_settlement(...)` helper, ≤30 lines):
- **SELL**: if `quantity > settled_quantity(user, account, ticker, today)` → raise
  `ValueError("Cannot sell unsettled shares — N share(s) settle on <date> (T+2).")`.
- **BUY / RIGHTS**: available cash = `account.balance − unsettled_sale_proceeds(user, account, today)`;
  if cost > available → raise `ValueError("Insufficient settled balance — Rs X is unsettled until <date> (T+2).")`.
- LIVE accounts and the existing balance/quantity checks are unchanged (the new guard runs only
  for PAPER and only tightens, never loosens).

"today" = `timezone.now().date()`. The trade's own `settlement_date` is set at creation time.

### Setting `settlement_date` at creation

Both `PortfolioTransaction.objects.create` sites (`trade_plan_viewset.py:98`,
`portfolio_drafts.py:56`) set `settlement_date=SettlementService.next_settlement_date(trade_date)`
for PAPER-account transactions (LIVE may leave it null — LIVE isn't settlement-gated here).

### Short-selling compliance flag

`_process_short_sell` / `_process_buy_to_cover` keep their current logic (still PAPER-only) but the
tool/result surfaces a warning. Implementation: a module constant
`SHORT_SELL_WARNING = "Short selling is simulation-only and not permitted on NEPSE."`; the
`process_transaction` result dict gains a `warnings: list[str]` carrying it for SHORT_SELL /
BUY_TO_COVER. The chat trade tools include it in their prose/preview warnings.

## Components

| Unit | Responsibility |
|------|----------------|
| migration `0043` | Add `settlement_date` to `PortfolioTransaction` |
| `stocks/services/settlement_service.py` (new) | Trading-day calendar, T+2 date, settled qty / unsettled cash |
| `PortfolioService.process_transaction` + `_enforce_settlement` | Reject unsettled sells / over-spends for PAPER; emit short warning |
| transaction-create sites | Set `settlement_date` on creation (PAPER) |
| chat trade tools | Surface the short-selling warning |

## Constants

- `_SETTLEMENT_TRADING_DAYS = 2`; `_DEFAULT_TRADING_WEEKDAYS = {6, 0, 1, 2, 3}` (Sun–Thu).
- `SHORT_SELL_WARNING` string constant. No magic numbers/strings inline.

## Testing (TDD)

- **`settlement_service`** (DB fixtures): `next_settlement_date` skips non-trading weekdays
  (e.g. a Thursday trade settles the following Monday given a Fri/Sat closure); derives trading
  weekdays from `DailyMarketSummary`; falls back to the default set when empty; `settled_quantity`
  excludes unsettled buys and treats NULL as settled; `unsettled_sale_proceeds` sums only
  future-settling sells.
- **Enforcement** (DB): a PAPER SELL of shares bought today is rejected with the T+2 message; a
  SELL of shares whose `settlement_date <= today` succeeds; a PAPER BUY that would dip into
  unsettled proceeds is rejected; a LIVE account is NOT settlement-gated (regression).
- **Short flag**: `process_transaction` for SHORT_SELL returns the warning; existing paper
  short-sell / buy-to-cover behavior (qty/balance effects) still passes (regression — preserve
  `test_paper_trading.py`).
- Existing `test_paper_trading.py` and portfolio regression must stay green.

## Deployment notes

- **Migration required**: `migrate stocks 0043` (adds nullable `settlement_date`; no backfill —
  nulls treated as settled).
- Backend-only logic; chat surfaces the short warning. No frontend change in scope (a paper-trading
  UI could later show settlement dates / the warning — deferred follow-up).

## Open details to confirm at build time

1. Confirm both `PortfolioTransaction.objects.create` sites pass a resolvable trade date
   (`transaction_date`) and account so `settlement_date` can be set; if a site lacks the account
   type, default to setting `settlement_date` whenever an account is PAPER and leaving it null
   otherwise.
2. Confirm `process_transaction` receives enough to know the account is PAPER (it takes `account`);
   the guard no-ops when `account is None` or LIVE.
3. If `DailyMarketSummary` is empty in a test DB, `trading_weekdays()` must fall back to the default
   set so settlement dates are still computed deterministically.
