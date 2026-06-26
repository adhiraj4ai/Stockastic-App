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
