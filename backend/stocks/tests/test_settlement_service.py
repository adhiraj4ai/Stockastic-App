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
        DailyMarketSummary.objects.get_or_create(
            date=d,
            defaults={"total_turnover": 0, "total_volume": 0, "total_transactions": 0},
        )


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
