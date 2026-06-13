# Plan 4: Money-Math Correctness — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Fix the portfolio money-math bugs that misstate a user's real numbers — CGT always charged short-term, no rights-share handling, dividend yield divided by the wrong basis — and add the return metrics that actually measure performance (TWR, XIRR). Lock every formula behind a golden test suite, since current coverage is near zero.

**Architecture:** A pure `finance.py` (no Django) holds the testable formulas: `is_long_term_holding`, `xirr`, `time_weighted_return`. CGT becomes holding-period-aware at both call sites (`portfolio_service.process_transaction` and chat `_trade_preview`). A `RIGHTS` transaction type is added (WACC behaves like a buy at the issue price). Dividend yield is fixed to a historical-cost basis with per-stock face value. A `PortfolioPerformanceView` action exposes TWR + XIRR from `PortfolioSnapshot` + transaction cash flows. Fractional-share support (quantity → Decimal) is explicitly DEFERRED (migration + serializer + frontend blast radius) — bonus/rights share counts are floored with a documented note instead.

**Tech Stack:** Django, DRF, Python `Decimal`, NumPy (for XIRR root-finding). Run tests in Docker: `docker-compose exec -T backend pytest <args>`.

**Branch:** `git checkout strategy-upgrade-phase0 && git checkout -b strategy-upgrade-phase4-money-math`

**Pre-existing failing test (ignore):** `stocks/tests/test_position_sizing.py::test_aggressive_risk`.

## Current-state facts (from the code map)

- `utils.calculate_cgt(profit, is_long_term=False)` is correct (5% long / 7.5% short); the bug is that **both callers hardcode `is_long_term=False`**: `portfolio_service.py:123` and `chat/tools.py:2272`.
- `process_transaction` (portfolio_service.py): BUY updates WACC incl. fees; BONUS dilutes WACC (`old_cost/new_qty`) correctly; SELL computes gross profit `(rate-wacc)*qty` → CGT → `receivable_amount`; **WACC not changed on SELL** (correct). No `RIGHTS`.
- `PortfolioTransaction.TransactionType`: BUY/SELL/SHORT_SELL/BUY_TO_COVER/BONUS/DIVIDEND. `quantity` is **IntegerField** (both models).
- `dividend_service.calculate_dividends`: cash = `qty_held * 100(face) * cash% /100 * (1-0.05 tax)`; **face value hardcoded 100**; `yield_on_cost = total_cash_in / CURRENT invested * 100` (wrong denominator — current basis, not historical); realized-P&L replay correctly nets fees+cgt (but uses the wrong stored cgt).
- Performance: simple total return, Sharpe, Alpha, Beta, Max DD (portfolio.py PortfolioPerformanceView). **No TWR/XIRR anywhere.**
- Money-math test coverage ≈ zero.

## File structure

| File | Status | Responsibility |
|---|---|---|
| `backend/stocks/services/finance.py` | Create | Pure: `is_long_term_holding`, `xirr`, `time_weighted_return` |
| `backend/stocks/services/portfolio_service.py` | Modify | holding-period CGT on SELL; `RIGHTS` handling |
| `backend/stocks/models/portfolio.py` | Modify | add `RIGHTS` to TransactionType |
| `backend/chat/tools.py` | Modify | holding-period CGT in `_trade_preview` |
| `backend/stocks/services/dividend_service.py` | Modify | historical-basis yield; per-stock face value; floor bonus |
| `backend/stocks/views/portfolio.py` | Modify | TWR + XIRR performance action |
| `backend/stocks/tests/test_finance.py` | Create | pure formula tests |
| `backend/stocks/tests/test_money_math.py` | Create | golden P&L/CGT/dividend/WACC suite |

---

### Task 1: Holding-period-aware CGT

**Files:** Create `services/finance.py`; modify `portfolio_service.py`, `chat/tools.py`; test `test_finance.py`.

NEPSE CGT: 5% if held ≥ 365 days, else 7.5%. Without per-lot tracking we use the **WACC-weighted average acquisition age** of the position as the holding period (documented approximation) — computed from the user's BUY/BONUS transactions for that ticker still held at sell time.

- [ ] **Step 1: Write failing tests**

```python
# backend/stocks/tests/test_finance.py
"""Pure finance helpers."""
import datetime as dt
import pytest
from stocks.services.finance import is_long_term_holding


def test_long_term_at_365_days():
    buy = dt.date(2024, 1, 1)
    assert is_long_term_holding(buy, dt.date(2025, 1, 1)) is True   # exactly 365d (leap) ≥ 365
    assert is_long_term_holding(buy, dt.date(2024, 12, 30)) is False  # < 365


def test_short_term_recent():
    assert is_long_term_holding(dt.date(2025, 1, 1), dt.date(2025, 6, 1)) is False


def test_weighted_acquisition_date():
    from stocks.services.finance import weighted_acquisition_date
    # 100 sh bought 2024-01-01, 100 sh bought 2024-07-01 → midpoint ~2024-04-01
    lots = [(100, dt.date(2024, 1, 1)), (100, dt.date(2024, 7, 1))]
    wad = weighted_acquisition_date(lots)
    assert dt.date(2024, 3, 25) <= wad <= dt.date(2024, 4, 7)
```

- [ ] **Step 2: Run → fail.** `docker-compose exec -T backend pytest stocks/tests/test_finance.py -v`

- [ ] **Step 3: Implement `services/finance.py`** (the CGT helpers; `xirr`/`time_weighted_return` come in Task 4):

```python
# backend/stocks/services/finance.py
"""Pure portfolio finance math (no Django). Testable in isolation."""
import datetime as dt

__all__ = ["is_long_term_holding", "weighted_acquisition_date", "LONG_TERM_DAYS"]

LONG_TERM_DAYS = 365  # NEPSE CGT long-term threshold


def weighted_acquisition_date(lots):
    """Quantity-weighted mean acquisition date from [(qty, date), ...].

    Used (absent per-lot FIFO tracking) to judge a position's holding period.
    """
    total = sum(q for q, _ in lots)
    if total <= 0:
        return None
    epoch = dt.date(1970, 1, 1)
    weighted_days = sum(q * (d - epoch).days for q, d in lots) / total
    return epoch + dt.timedelta(days=round(weighted_days))


def is_long_term_holding(acquisition_date, sell_date):
    """True if held >= LONG_TERM_DAYS (NEPSE long-term CGT rate applies)."""
    if acquisition_date is None or sell_date is None:
        return False
    return (sell_date - acquisition_date).days >= LONG_TERM_DAYS
```

- [ ] **Step 4: Run → pass.**

- [ ] **Step 5: Wire into `process_transaction` (portfolio_service.py SELL branch).** READ the SELL branch (~lines 115-135). Before the `calculate_cgt` call, compute the position's weighted acquisition date from the user's prior BUY/BONUS transactions for this ticker+account, and pass `is_long_term=is_long_term_holding(wad, sell_date)`:

```python
        # Holding-period-aware CGT (WACC-weighted acquisition age; NEPSE: >=1yr = 5%).
        from stocks.services.finance import weighted_acquisition_date, is_long_term_holding
        prior = PortfolioTransaction.objects.filter(
            user=user, ticker=ticker, transaction_type__in=[TransactionType.BUY, TransactionType.BONUS],
        )
        if account:
            prior = prior.filter(account=account)
        lots = [(t.quantity, t.transaction_date.date()) for t in prior if t.quantity]
        sell_date = transaction_date.date() if hasattr(transaction_date, "date") else transaction_date
        long_term = is_long_term_holding(weighted_acquisition_date(lots), sell_date)
        if total_profit > 0:
            cgt = calculate_cgt(total_profit, is_long_term=long_term)
```

(Match the real variable names for `user`, `ticker`, `account`, `transaction_date`, `total_profit` in the method — READ it first.)

- [ ] **Step 6: Wire into chat `_trade_preview` (chat/tools.py:~2272).** READ `_trade_preview`. It estimates CGT for a SELL preview. Pass the same holding-period logic — if the preview has the user + ticker, compute the weighted acquisition date the same way; if it genuinely lacks holding context, default to short-term but ADD a comment that the preview is conservative (short-term) and actuals use holding period at execution. Prefer computing it if user/ticker are available.

- [ ] **Step 7: Regression + commit.** `docker-compose exec -T backend pytest stocks/tests/test_finance.py stocks/tests/ -q` (only pre-existing failure).
```bash
git add stocks/services/finance.py stocks/services/portfolio_service.py chat/tools.py stocks/tests/test_finance.py
git commit -m "fix(money): holding-period-aware CGT (long-term 5% vs short-term 7.5%)"
```

---

### Task 2: RIGHTS transaction type

**Files:** modify `models/portfolio.py`, `portfolio_service.py`; test in `test_money_math.py` (created here).

A rights issue: the holder buys `r%` new shares at an `issue_price` (often below market). Cost basis effect = a BUY at the issue price: `new_wacc = (old_qty*old_wacc + rights_qty*issue_price) / (old_qty+rights_qty)`. (This matches the TERP logic Plan 1 used for price adjustment.)

- [ ] **Step 1: Add `RIGHTS = 'RIGHTS', 'Rights Share'` to `PortfolioTransaction.TransactionType`** (models/portfolio.py). Migrate: `docker-compose exec -T backend python manage.py makemigrations stocks && python manage.py migrate` (force-add the migration per repo convention).

- [ ] **Step 2: Write failing test** in a new `backend/stocks/tests/test_money_math.py`:

```python
# backend/stocks/tests/test_money_math.py
"""Golden money-math: WACC, CGT, RIGHTS, realized P&L."""
import datetime as dt
import pytest
from django.contrib.auth.models import User
from stocks.models import PortfolioAccount, PortfolioItem
from stocks.services.portfolio_service import PortfolioService
from stocks.models.portfolio import TransactionType, AccountType

pytestmark = pytest.mark.django_db


@pytest.fixture
def acct(db):
    u = User.objects.create(username="mm")
    return u, PortfolioAccount.objects.create(user=u, name="t", account_type=AccountType.PAPER, balance=10_000_000)


def _txn(svc, u, a, ttype, qty, rate, when):
    return svc.process_transaction(
        user=u, account=a, ticker="NABIL", transaction_type=ttype,
        quantity=qty, rate=rate, transaction_date=when,
    )


def test_rights_lowers_wacc_like_buy_at_issue_price(acct):
    u, a = acct
    svc = PortfolioService()
    _txn(svc, u, a, TransactionType.BUY, 100, 1000, dt.datetime(2024, 1, 1))
    # 50% rights at issue price 100: +50 sh at 100.
    _txn(svc, u, a, TransactionType.RIGHTS, 50, 100, dt.datetime(2024, 6, 1))
    item = PortfolioItem.objects.get(user=u, ticker="NABIL")
    assert item.quantity == 150
    # ignoring fees on the BUY for approximate check: (100*~1000 + 50*100)/150 ≈ 700
    assert 690 <= float(item.wacc) <= 710
```

(ADAPT the `process_transaction` call signature to the real one — READ it; it may take positional/kw args differently.)

- [ ] **Step 3: Run → fail** (RIGHTS not handled — falls through or errors).

- [ ] **Step 4: Implement the RIGHTS branch** in `process_transaction`, mirroring BUY but at the issue price (and debiting paper cash by `qty*issue_price + fees`). Add it as an `elif txn_type == TransactionType.RIGHTS:` branch.

- [ ] **Step 5: Run → pass. Step 6: commit.**

---

### Task 3: Dividend service fixes

**Files:** modify `dividend_service.py`; tests in `test_money_math.py`.

- [ ] **Step 1: Write failing tests** for: (a) yield denominator uses the historical invested basis at book-close (cost of the shares that earned the dividend), not current portfolio cost; (b) face value resolves per stock with a 100 fallback; (c) bonus share quantity is floored to a whole number (documented — no fractional shares yet).

- [ ] **Step 2: Implement:**
  - **Yield**: compute per-dividend `cost_basis_at_close = qty_held_at_close * wacc_as_of_close`; aggregate `yield = total_net_cash / sum(cost_basis_at_close)`. READ the current `calculate_dividends` to reuse its WACC-replay state for the as-of-close WACC. If a clean as-of WACC is hard, use the position's average buy price up to book-close. Document the basis.
  - **Face value**: look up the stock's face value (check `StockFundamental`/`Company` for a face-value field; if none exists, keep the 100 default but extract it to a `_face_value(ticker)` helper with the fallback, so it's one place to fix). Report what you found.
  - **Bonus**: `bonus_qty = int((qty_held * bonus_percent) / 100)` (floor) with a comment that fractional bonus shares aren't supported yet (quantity is IntegerField — tracked follow-up).

- [ ] **Step 3: Run → pass. Step 4: commit.**

---

### Task 4: TWR + XIRR portfolio performance

**Files:** add `xirr`/`time_weighted_return` to `finance.py`; modify `views/portfolio.py`; tests in `test_finance.py`.

- [ ] **Step 1: Write failing tests**

```python
# append to backend/stocks/tests/test_finance.py
import datetime as dt
import pytest
from stocks.services.finance import xirr, time_weighted_return


def test_xirr_simple_doubling_one_year():
    # -1000 at t0, +2000 one year later → ~100% IRR.
    flows = [(dt.date(2024, 1, 1), -1000.0), (dt.date(2025, 1, 1), 2000.0)]
    r = xirr(flows)
    assert 0.95 <= r <= 1.05


def test_xirr_no_growth_is_zero():
    flows = [(dt.date(2024, 1, 1), -1000.0), (dt.date(2025, 1, 1), 1000.0)]
    assert abs(xirr(flows)) < 0.01


def test_xirr_empty_or_degenerate_returns_none():
    assert xirr([]) is None
    assert xirr([(dt.date(2024, 1, 1), -1000.0)]) is None  # no positive flow


def test_time_weighted_return_chains_subperiods():
    # Two sub-periods +10% then +10%, with a deposit between → TWR = 21% (not cash-flow distorted).
    # values: start 100; before deposit 110; deposit +100 → 210; end 231 (210*1.10)
    points = [
        (dt.date(2024, 1, 1), 100.0, 0.0),
        (dt.date(2024, 6, 1), 110.0, 100.0),   # +100 external deposit at this point
        (dt.date(2024, 12, 1), 231.0, 0.0),
    ]
    twr = time_weighted_return(points)
    assert abs(twr - 0.21) < 0.01
```

- [ ] **Step 2: Run → fail.**

- [ ] **Step 3: Implement** in `finance.py`:
  - `xirr(cashflows, guess=0.1)`: Newton/bisection on `sum(cf / (1+r)**(days/365))`. Return `None` if no sign change (no solvable IRR). Use a robust bisection fallback over `[-0.999, 10]` if Newton diverges.
  - `time_weighted_return(points)`: `points = [(date, value, external_flow)]`; chain sub-period returns `(value_end / (value_start + flow_at_start)) - 1`, geometric-link `∏(1+r_i) - 1`. Handle zero/negative denominators by skipping the sub-period (return None if no valid sub-periods).

- [ ] **Step 4: Run → pass (pure tests).**

- [ ] **Step 5: Add a DRF action** `twr_xirr` (or extend the existing performance view) in `views/portfolio.py` that builds TWR points from `PortfolioSnapshot` (date, total_value) + external flows from BUY/SELL/RIGHTS/DIVIDEND transactions on those dates, and XIRR cashflows from the same transactions (buys negative, sells/dividends positive, plus current portfolio value as the final positive flow). READ the existing performance action to match its account-filtering + response style. Endpoint returns `{twr_pct, xirr_pct}` (None-safe). Smoke-test with the Django test client over a user that has snapshots; report output (may be None if no snapshots — acceptable, report it).

- [ ] **Step 6: Commit.**

---

### Task 5: Consolidated golden suite + summary + memory

- [ ] **Step 1:** Extend `test_money_math.py` with the golden cases the audit said were missing, asserting exact values:
  - CGT long-term (held ≥365d → 5%) vs short-term (<365d → 7.5%) end-to-end through `process_transaction` (create a BUY dated >1yr before the SELL, assert the stored `cgt` on the SELL transaction uses 5%).
  - WACC across a BUY → BONUS → BUY → SELL sequence (assert WACC after each).
  - Realized P&L nets all fees + the (now correct) CGT.
  - Dividend cash with the per-stock face value + 5% tax.
  Run the whole suite green.

- [ ] **Step 2:** Write `backend/backtest_reports/phase4_money_math/SUMMARY.md` (or `docs/`): the bugs fixed (CGT, RIGHTS, dividend yield), the new TWR/XIRR, and the explicitly-deferred fractional-shares migration. Update `memory/project_strategy_upgrade.md` with a Plan-4 paragraph.

- [ ] **Step 3: Commit.**

---

## Self-review checklist (done at planning time)

- **Coverage:** CGT holding-period (Task 1), rights shares (Task 2), dividend-yield denominator + face value (Task 3), TWR + XIRR (Task 4), golden P&L test suite (woven through + Task 5). Fractional-shares (quantity→Decimal) intentionally DEFERRED with rationale (migration/serializer/frontend blast radius) — bonus/rights floored + documented; tracked as a follow-up.
- **Type consistency:** `is_long_term_holding(acq_date, sell_date)`/`weighted_acquisition_date(lots)` used in both CGT call sites; `xirr(cashflows)→float|None`, `time_weighted_return(points)→float|None` used by the perf action.
- **Risk:** Task 1 touches the live `process_transaction` SELL path — Step 5 mandates reading the real method first; Task 2 adds a migration (force-add per repo convention); Task 4's perf action degrades to None when there are no snapshots.
- **No placeholders in pure tasks (1,4);** model/service tasks specify exact branches and say READ-first where signatures must match.
