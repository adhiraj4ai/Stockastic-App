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


def test_paper_buy_dipping_into_unsettled_proceeds_is_rejected():
    u = User.objects.create_user(username="e5", password="p")
    acc = _paper(u, 4900)   # balance reflects credited-but-unsettled sale proceeds
    # A prior SELL whose proceeds are not yet settled (settles in the future).
    PortfolioTransaction.objects.create(
        user=u, account=acc, ticker="NABIL", transaction_type=TransactionType.SELL,
        quantity=10, rate=500, amount=5000, receivable_amount=Decimal("4900"),
        transaction_date=timezone.now(), settlement_date=date(2099, 1, 1))
    # Available settled cash = 4900 - 4900 = 0, so any BUY must be rejected.
    with pytest.raises(ValueError, match="unsettled"):
        PortfolioService.process_transaction(user=u, ticker="NABIL",
            txn_type=TransactionType.BUY, quantity=10, rate=500, account=acc)
