# backend/stocks/tests/test_money_math.py
"""Golden money-math: WACC, CGT, RIGHTS, realized P&L."""
import pytest
from django.contrib.auth.models import User
from stocks.models import PortfolioAccount, PortfolioItem
from stocks.services.portfolio_service import PortfolioService
from stocks.models.portfolio import TransactionType, AccountType

pytestmark = pytest.mark.django_db


@pytest.fixture
def acct(db):
    u = User.objects.create(username="mm")
    a = PortfolioAccount.objects.create(
        user=u, name="t", account_type=AccountType.PAPER, balance=10_000_000
    )
    return u, a


def test_rights_lowers_wacc_like_buy_at_issue_price(acct):
    u, a = acct
    svc = PortfolioService()
    svc.process_transaction(user=u, account=a, ticker="NABIL",
                            txn_type=TransactionType.BUY, quantity=100, rate=1000)
    svc.process_transaction(user=u, account=a, ticker="NABIL",
                            txn_type=TransactionType.RIGHTS, quantity=50, rate=100)
    item = PortfolioItem.objects.get(user=u, ticker="NABIL")
    assert item.quantity == 150
    # (100*~1000+fees + 50*100+fees)/150 ≈ 700 (fees are small)
    assert 690 <= float(item.wacc) <= 715
