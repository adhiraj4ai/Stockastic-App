# Paper-Trading NEPSE Realism (T+2 + Short Flag) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Model NEPSE T+2 settlement for PAPER accounts (can't sell unsettled shares or spend unsettled proceeds) and flag short selling as simulation-only.

**Architecture:** Add a nullable `settlement_date` to `PortfolioTransaction`; a new `SettlementService` (trading-day calendar from `DailyMarketSummary`, T+2 date, settled-qty, unsettled-cash); `process_transaction` computes settlement_date + warnings and enforces settlement for PAPER accounts via a guard helper; both transaction-create sites store the settlement date.

**Tech Stack:** Django 5.2, DRF, pytest. Migration required.

## Global Constraints

- No function/method body over 30 lines; extract helpers.
- No magic numbers/strings — named constants (`_SETTLEMENT_TRADING_DAYS = 2`, `_DEFAULT_TRADING_WEEKDAYS = {6, 0, 1, 2, 3}`, `SHORT_SELL_WARNING`).
- TDD: failing test first, every task.
- Backend tests run in Docker: `docker-compose exec -T backend pytest <path> -v`. Paste real output; never "ready to run".
- LIVE accounts and existing balance/quantity checks are UNCHANGED — the settlement guard runs only for PAPER and only tightens.
- `settlement_date IS NULL` counts as **settled** (legacy rows + LIVE are backward-safe).
- Preserve `stocks/tests/test_paper_trading.py` (short-sell / buy-to-cover behavior) — green at the end.

---

### Task 1: Add `settlement_date` to PortfolioTransaction

**Files:**
- Modify: `backend/stocks/models/portfolio.py` (`PortfolioTransaction`)
- Create: `backend/stocks/migrations/0043_portfoliotransaction_settlement_date.py` (via makemigrations)
- Test: `backend/stocks/tests/test_settlement_field.py`

**Interfaces:**
- Produces: `PortfolioTransaction.settlement_date` (`DateField`, `null=True`, `blank=True`, `db_index=True`).

- [ ] **Step 1: Write the failing test**

```python
# backend/stocks/tests/test_settlement_field.py
import pytest
from datetime import date, datetime, timezone as tz
from django.contrib.auth import get_user_model
from stocks.models.portfolio import PortfolioTransaction, TransactionType

pytestmark = pytest.mark.django_db
User = get_user_model()


def _txn(user, **kw):
    return PortfolioTransaction.objects.create(
        user=user, ticker="NABIL", transaction_type=TransactionType.BUY, quantity=10,
        rate=500, amount=5000, receivable_amount=5000,
        transaction_date=datetime(2026, 1, 1, tzinfo=tz.utc), **kw)


def test_settlement_date_can_be_set():
    u = User.objects.create_user(username="s1", password="p")
    t = _txn(u, settlement_date=date(2026, 1, 5))
    assert t.settlement_date == date(2026, 1, 5)


def test_settlement_date_defaults_null():
    u = User.objects.create_user(username="s2", password="p")
    t = _txn(u)
    assert t.settlement_date is None
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker-compose exec -T backend pytest stocks/tests/test_settlement_field.py -v`
Expected: FAIL — `TypeError`/`FieldError` (no `settlement_date`), or migration-state error.

- [ ] **Step 3: Add the field and migration**

In `backend/stocks/models/portfolio.py`, add to `PortfolioTransaction` (after `transaction_date`):

```python
    settlement_date = models.DateField(null=True, blank=True, db_index=True)
```

Generate the migration:

```bash
docker-compose exec -T backend python manage.py makemigrations stocks --name portfoliotransaction_settlement_date
docker-compose exec -T backend python manage.py migrate stocks
```

- [ ] **Step 4: Run test to verify it passes**

Run: `docker-compose exec -T backend pytest stocks/tests/test_settlement_field.py -v`
Expected: PASS (2 passed).

- [ ] **Step 5: Commit**

```bash
git add backend/stocks/models/portfolio.py backend/stocks/migrations/0043_*.py backend/stocks/tests/test_settlement_field.py
git commit -m "feat(portfolio): add settlement_date to PortfolioTransaction"
```

---

### Task 2: `SettlementService`

**Files:**
- Create: `backend/stocks/services/settlement_service.py`
- Test: `backend/stocks/tests/test_settlement_service.py`

**Interfaces:**
- Produces:
  - `SettlementService.trading_weekdays() -> set[int]` (Mon=0…Sun=6; from `DailyMarketSummary`, default `{6,0,1,2,3}`)
  - `SettlementService.next_settlement_date(trade_date, trading_days=2) -> date`
  - `SettlementService.settled_quantity(user, account, ticker, as_of) -> int`
  - `SettlementService.unsettled_sale_proceeds(user, account, as_of) -> Decimal`

- [ ] **Step 1: Write the failing test**

```python
# backend/stocks/tests/test_settlement_service.py
import pytest
from decimal import Decimal
from datetime import date, datetime, timezone as tz
from django.contrib.auth import get_user_model
from stocks.models.portfolio import PortfolioTransaction, TransactionType, PortfolioAccount, AccountType
from stocks.models.market import DailyMarketSummary
from stocks.services.settlement_service import SettlementService

pytestmark = pytest.mark.django_db
User = get_user_model()


def _seed_market_weekdays():
    # Sun(2026-01-04) Mon Tue Wed Thu — NEPSE-like Sun–Thu trading week.
    for d in [date(2026, 1, 4), date(2026, 1, 5), date(2026, 1, 6), date(2026, 1, 7), date(2026, 1, 8)]:
        DailyMarketSummary.objects.get_or_create(date=d, defaults={"total_turnover": 0})


def test_trading_weekdays_derived_from_market_summary():
    _seed_market_weekdays()
    wd = SettlementService.trading_weekdays()
    assert 4 not in wd and 5 not in wd        # Friday(4)/Saturday(5) excluded
    assert {6, 0, 1, 2, 3}.issubset(wd) or wd == {6, 0, 1, 2, 3}


def test_trading_weekdays_falls_back_when_no_market_data():
    assert SettlementService.trading_weekdays() == {6, 0, 1, 2, 3}


def test_next_settlement_skips_non_trading_weekdays():
    _seed_market_weekdays()
    # Thursday 2026-01-08 + 2 trading days -> skip Fri/Sat -> Sun(11) is T+1, Mon(12) is T+2.
    assert SettlementService.next_settlement_date(date(2026, 1, 8)) == date(2026, 1, 12)


def _buy(user, account, qty, settle):
    PortfolioTransaction.objects.create(
        user=user, account=account, ticker="NABIL", transaction_type=TransactionType.BUY,
        quantity=qty, rate=500, amount=qty*500, receivable_amount=qty*500,
        transaction_date=datetime(2026, 1, 1, tzinfo=tz.utc), settlement_date=settle)


def test_settled_quantity_excludes_unsettled_buys():
    u = User.objects.create_user(username="sq", password="p")
    acc = PortfolioAccount.objects.create(user=u, name="paper", account_type=AccountType.PAPER, balance=0)
    _buy(u, acc, 100, date(2026, 1, 5))     # settled before as_of
    _buy(u, acc, 50, date(2026, 1, 20))     # not yet settled
    _buy(u, acc, 10, None)                  # null -> treated settled
    assert SettlementService.settled_quantity(u, acc, "NABIL", date(2026, 1, 10)) == 110


def test_unsettled_sale_proceeds_sums_future_settling_sells():
    u = User.objects.create_user(username="up", password="p")
    acc = PortfolioAccount.objects.create(user=u, name="paper", account_type=AccountType.PAPER, balance=0)
    PortfolioTransaction.objects.create(
        user=u, account=acc, ticker="NABIL", transaction_type=TransactionType.SELL,
        quantity=10, rate=500, amount=5000, receivable_amount=Decimal("4900"),
        transaction_date=datetime(2026, 1, 9, tzinfo=tz.utc), settlement_date=date(2026, 1, 13))
    assert SettlementService.unsettled_sale_proceeds(u, acc, date(2026, 1, 10)) == Decimal("4900")
    assert SettlementService.unsettled_sale_proceeds(u, acc, date(2026, 1, 14)) == Decimal("0")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker-compose exec -T backend pytest stocks/tests/test_settlement_service.py -v`
Expected: FAIL — `ModuleNotFoundError: stocks.services.settlement_service`.

- [ ] **Step 3: Implement**

```python
# backend/stocks/services/settlement_service.py
"""NEPSE T+2 settlement: trading-day calendar, settlement dates, settled positions."""
from datetime import timedelta
from decimal import Decimal

from django.db.models import Q, Sum
from django.utils import timezone

from stocks.models.market import DailyMarketSummary
from stocks.models.portfolio import PortfolioTransaction, TransactionType

_SETTLEMENT_TRADING_DAYS = 2
_DEFAULT_TRADING_WEEKDAYS = {6, 0, 1, 2, 3}      # Sun–Thu (Mon=0 … Sun=6)
_WEEKDAY_SAMPLE = 120
_ADD_QTY_TYPES = (TransactionType.BUY, TransactionType.BONUS, TransactionType.RIGHTS)


class SettlementService:
    @staticmethod
    def trading_weekdays():
        dates = DailyMarketSummary.objects.order_by("-date").values_list("date", flat=True)[:_WEEKDAY_SAMPLE]
        weekdays = {d.weekday() for d in dates}
        return weekdays or set(_DEFAULT_TRADING_WEEKDAYS)

    @staticmethod
    def next_settlement_date(trade_date, trading_days=_SETTLEMENT_TRADING_DAYS):
        weekdays = SettlementService.trading_weekdays()
        counted, cursor = 0, trade_date
        while counted < trading_days:
            cursor = cursor + timedelta(days=1)
            if cursor.weekday() in weekdays:
                counted += 1
        return cursor

    @staticmethod
    def settled_quantity(user, account, ticker, as_of):
        base = PortfolioTransaction.objects.filter(user=user, account=account, ticker=ticker)
        added = base.filter(transaction_type__in=_ADD_QTY_TYPES).filter(
            Q(settlement_date__lte=as_of) | Q(settlement_date__isnull=True)
        ).aggregate(q=Sum("quantity"))["q"] or 0
        sold = base.filter(transaction_type=TransactionType.SELL).aggregate(q=Sum("quantity"))["q"] or 0
        return int(added) - int(sold)

    @staticmethod
    def unsettled_sale_proceeds(user, account, as_of):
        total = PortfolioTransaction.objects.filter(
            user=user, account=account, transaction_type=TransactionType.SELL,
            settlement_date__gt=as_of,
        ).aggregate(s=Sum("receivable_amount"))["s"]
        return Decimal(total) if total is not None else Decimal("0")
```

- [ ] **Step 4: Run test to verify it passes**

Run: `docker-compose exec -T backend pytest stocks/tests/test_settlement_service.py -v`
Expected: PASS (5 passed). If `DailyMarketSummary` requires fields beyond `date`, adjust the
fixture `defaults` minimally to satisfy non-null columns (note any such change in the report).

- [ ] **Step 5: Commit**

```bash
git add backend/stocks/services/settlement_service.py backend/stocks/tests/test_settlement_service.py
git commit -m "feat(portfolio): SettlementService (T+2 calendar, settled qty, unsettled cash)"
```

---

### Task 3: Enforce settlement + short warning in `process_transaction`

**Files:**
- Modify: `backend/stocks/services/portfolio_service.py` (`process_transaction`, new `_enforce_settlement`, `_settlement_for`)
- Modify: `backend/stocks/services/portfolio_drafts.py` (set `settlement_date` on create)
- Modify: `backend/stocks/views/portfolio_views/trade_plan_viewset.py` (set `settlement_date` on create)
- Test: `backend/stocks/tests/test_settlement_enforcement.py`

**Interfaces:**
- Consumes: `SettlementService` (Task 2).
- Produces: `process_transaction(...)` result dict gains `settlement_date` (date|None) and
  `warnings` (list[str]); raises `ValueError` on PAPER unsettled-sell / unsettled-spend; both
  create sites pass `settlement_date=metrics["settlement_date"]`.

- [ ] **Step 1: Write the failing test**

```python
# backend/stocks/tests/test_settlement_enforcement.py
import pytest
from decimal import Decimal
from datetime import datetime, date, timezone as tz
from django.contrib.auth import get_user_model
from django.utils import timezone
from stocks.models.portfolio import (PortfolioTransaction, PortfolioItem,
                                      PortfolioAccount, AccountType, TransactionType)
from stocks.services.portfolio_service import PortfolioService

pytestmark = pytest.mark.django_db
User = get_user_model()


def _paper(user, balance):
    return PortfolioAccount.objects.create(user=user, name="paper",
                                           account_type=AccountType.PAPER, balance=Decimal(balance))


def _settled_buy(user, acc, qty):
    PortfolioTransaction.objects.create(
        user=user, account=acc, ticker="NABIL", transaction_type=TransactionType.BUY,
        quantity=qty, rate=500, amount=qty*500, receivable_amount=qty*500,
        transaction_date=datetime(2025, 1, 1, tzinfo=tz.utc), settlement_date=date(2025, 1, 3))
    PortfolioItem.objects.update_or_create(user=user, account=acc, ticker="NABIL",
        defaults={"quantity": qty, "buy_price": 500, "wacc": 500})


def test_paper_sell_of_unsettled_shares_is_rejected(monkeypatch):
    u = User.objects.create_user(username="e1", password="p")
    acc = _paper(u, 0)
    # Bought today (unsettled) — hold 100 but none settled.
    PortfolioTransaction.objects.create(
        user=u, account=acc, ticker="NABIL", transaction_type=TransactionType.BUY,
        quantity=100, rate=500, amount=50000, receivable_amount=50000,
        transaction_date=timezone.now(), settlement_date=date(2099, 1, 1))
    PortfolioItem.objects.update_or_create(user=u, account=acc, ticker="NABIL",
        defaults={"quantity": 100, "buy_price": 500, "wacc": 500})
    with pytest.raises(ValueError, match="unsettled"):
        PortfolioService.process_transaction(user=u, ticker="NABIL",
            txn_type=TransactionType.SELL, quantity=10, rate=510, account=acc)


def test_paper_sell_of_settled_shares_succeeds():
    u = User.objects.create_user(username="e2", password="p")
    acc = _paper(u, 0)
    _settled_buy(u, acc, 100)
    out = PortfolioService.process_transaction(user=u, ticker="NABIL",
        txn_type=TransactionType.SELL, quantity=10, rate=510, account=acc)
    assert out["settlement_date"] is not None


def test_short_sell_carries_compliance_warning():
    u = User.objects.create_user(username="e3", password="p")
    acc = _paper(u, 100000)
    PortfolioItem.objects.update_or_create(user=u, account=acc, ticker="NABIL",
        defaults={"quantity": 0, "buy_price": 0, "wacc": 0})
    out = PortfolioService.process_transaction(user=u, ticker="NABIL",
        txn_type=TransactionType.SHORT_SELL, quantity=10, rate=500, account=acc)
    assert any("not permitted on NEPSE" in w for w in out["warnings"])


def test_live_account_not_settlement_gated():
    u = User.objects.create_user(username="e4", password="p")
    live = PortfolioAccount.objects.create(user=u, name="live",
                                           account_type=AccountType.LIVE, balance=Decimal("0"))
    # Unsettled buy today, LIVE — selling is allowed (broker handles real settlement).
    PortfolioTransaction.objects.create(
        user=u, account=live, ticker="NABIL", transaction_type=TransactionType.BUY,
        quantity=100, rate=500, amount=50000, receivable_amount=50000,
        transaction_date=timezone.now(), settlement_date=date(2099, 1, 1))
    PortfolioItem.objects.update_or_create(user=u, account=live, ticker="NABIL",
        defaults={"quantity": 100, "buy_price": 500, "wacc": 500})
    out = PortfolioService.process_transaction(user=u, ticker="NABIL",
        txn_type=TransactionType.SELL, quantity=10, rate=510, account=live)
    assert "warnings" in out      # no raise
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker-compose exec -T backend pytest stocks/tests/test_settlement_enforcement.py -v`
Expected: FAIL — no `settlement_date`/`warnings` keys; no unsettled-sell guard.

- [ ] **Step 3: Implement**

In `backend/stocks/services/portfolio_service.py`, add imports + constant near the top:

```python
from stocks.services.settlement_service import SettlementService

SHORT_SELL_WARNING = "Short selling is simulation-only and not permitted on NEPSE."
_SHORT_TYPES = (TransactionType.SHORT_SELL, TransactionType.BUY_TO_COVER)
_SETTLEMENT_GATED_SELL = (TransactionType.SELL,)
_SETTLEMENT_GATED_BUY = (TransactionType.BUY, TransactionType.RIGHTS)
```

Add helpers (module level):

```python
def _is_paper(account):
    return account is not None and account.account_type == AccountType.PAPER


def _settlement_for(account, today):
    return SettlementService.next_settlement_date(today) if _is_paper(account) else None


def _enforce_settlement(user, ticker, txn_type, quantity, amount, account, today):
    """Raise ValueError if a PAPER trade would use unsettled shares or cash."""
    if not _is_paper(account):
        return
    if txn_type in _SETTLEMENT_GATED_SELL:
        settled = SettlementService.settled_quantity(user, account, ticker, today)
        if quantity > settled:
            settle_on = SettlementService.next_settlement_date(today)
            raise ValueError(
                f"Cannot sell unsettled shares — only {settled} settled; "
                f"recent buys settle ~{settle_on} (T+2).")
    elif txn_type in _SETTLEMENT_GATED_BUY:
        unsettled = SettlementService.unsettled_sale_proceeds(user, account, today)
        available = Decimal(account.balance) - unsettled
        if Decimal(amount) > available:
            raise ValueError(
                f"Insufficient settled balance — Rs {unsettled:,.2f} of proceeds is "
                f"unsettled until T+2.")
```

Modify `process_transaction` to enforce + return the new keys:

```python
    @staticmethod
    @transaction.atomic
    def process_transaction(user, ticker, txn_type, quantity, rate, account=None,
                            commission=None, sebon_fee=None, dp_charge=None):
        """Processes a new transaction and updates the PortfolioItem."""
        amount, commission, sebon_fee, dp_charge = _resolve_fees(
            quantity, rate, commission, sebon_fee, dp_charge
        )
        today = timezone.now().date()
        _enforce_settlement(user, ticker, txn_type, quantity, amount, account, today)
        portfolio_item, _created = PortfolioItem.objects.get_or_create(
            user=user, ticker=ticker, account=account,
            defaults={'quantity': 0, 'buy_price': 0, 'wacc': 0}
        )
        receivable_amount, cgt = _dispatch_txn_type(
            txn_type, user, ticker, quantity, rate, amount,
            commission, sebon_fee, dp_charge, account, portfolio_item
        )
        warnings = [SHORT_SELL_WARNING] if txn_type in _SHORT_TYPES else []
        return {
            'amount': amount, 'commission': commission, 'sebon_fee': sebon_fee,
            'dp_charge': dp_charge, 'cgt': cgt, 'receivable_amount': receivable_amount,
            'settlement_date': _settlement_for(account, today), 'warnings': warnings,
        }
```

Ensure `from django.utils import timezone` and `from stocks.models.portfolio import AccountType`
are imported in this module (add if missing).

In `backend/stocks/services/portfolio_drafts.py` `_process_one_trade`, add `settlement_date` to the
`PortfolioTransaction.objects.create(...)`:

```python
        cgt=metrics["cgt"], receivable_amount=metrics["receivable_amount"],
        transaction_date=timezone.now(), settlement_date=metrics["settlement_date"],
```

In `backend/stocks/views/portfolio_views/trade_plan_viewset.py` `_execute_leg_transaction`, add to
its `PortfolioTransaction.objects.create(...)`:

```python
        transaction_date=timezone.now(), settlement_date=metrics['settlement_date'],
```

- [ ] **Step 4: Run test to verify it passes**

Run: `docker-compose exec -T backend pytest stocks/tests/test_settlement_enforcement.py -v`
Expected: PASS (4 passed).

- [ ] **Step 5: Commit**

```bash
git add backend/stocks/services/portfolio_service.py backend/stocks/services/portfolio_drafts.py backend/stocks/views/portfolio_views/trade_plan_viewset.py backend/stocks/tests/test_settlement_enforcement.py
git commit -m "feat(portfolio): enforce T+2 settlement and flag short selling for paper accounts"
```

---

### Task 4: Full-suite verification

- [ ] **Step 1: Feature suite**

Run: `docker-compose exec -T backend pytest stocks/tests/test_settlement_field.py stocks/tests/test_settlement_service.py stocks/tests/test_settlement_enforcement.py -v`
Expected: all PASS.

- [ ] **Step 2: Paper-trading + portfolio regression**

Run: `docker-compose exec -T backend pytest stocks/tests/test_paper_trading.py stocks/tests/ -k "portfolio or paper or dividend" -q`
Expected: PASS — existing paper short-sell / buy-to-cover behavior preserved; no regression.
If `test_paper_trading.py` fails because a paper SELL now hits the settlement guard (its fixtures
buy then immediately sell), that is the guard working as designed — update ONLY those fixtures to
set the buy's `settlement_date` in the past (or mark the buy settled), preserving each test's
intent. Report any such change.

- [ ] **Step 3: Commit (if verification fixes needed)**

```bash
git add -A && git commit -m "test(portfolio): verify T+2 settlement + short flag"
```

---

## Self-Review

**Spec coverage:**
- `settlement_date` field + migration → Task 1. ✓
- Trading-day calendar (DailyMarketSummary + default), T+2 date, settled-qty, unsettled-cash → Task 2. ✓
- PAPER SELL rejects unsettled shares; PAPER BUY/RIGHTS rejects unsettled spend; LIVE untouched → Task 3 (`_enforce_settlement`). ✓
- NULL settlement_date = settled (backward-safe) → Task 2 (`settled_quantity` `Q(...isnull=True)`). ✓
- Short flag warning in result → Task 3 (`SHORT_SELL_WARNING`, `warnings`). ✓
- settlement_date set at both create sites → Task 3. ✓
- Preserve test_paper_trading.py → Task 4 (with guarded fixture-update note). ✓

**Placeholder scan:** No TBD/TODO; complete code in every step. The Task 4 fixture-update note is a
conditional, intent-preserving instruction, not a placeholder.

**Type consistency:** `process_transaction` result gains `settlement_date` (date|None) + `warnings`
(list[str]), consumed at both create sites by exact key. `SettlementService` method names/signatures
match across Tasks 2–3. `AccountType.PAPER`/`LIVE` and `TransactionType.*` match the model.
