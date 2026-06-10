# backend/stocks/tests/test_money_math.py
"""Golden money-math: WACC, CGT, RIGHTS, realized P&L."""
import pytest
from decimal import Decimal
import datetime
from django.contrib.auth.models import User
from stocks.models import PortfolioAccount, PortfolioItem
from stocks.services.portfolio_service import PortfolioService
from stocks.models.portfolio import TransactionType, AccountType, PortfolioTransaction
from stocks.models.fundamentals import Dividend
from stocks.services.dividend_service import _face_value, _wacc_at_date, DividendService

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


# ---------------------------------------------------------------------------
# Task 3: Dividend service money-math fixes
# ---------------------------------------------------------------------------

class TestFaceValue:
    """Bug fix (a): _face_value helper returns per-stock face value or 100."""

    def test_unknown_ticker_returns_100(self):
        # No face_value field exists in StockFundamental or Company as of
        # 2026-06-10 inspection; helper always returns 100 as the NEPSE default.
        assert _face_value("NONEXISTENT") == Decimal('100')

    def test_nabil_returns_100(self):
        # NEPSE standard — Rs. 100 par value
        assert _face_value("NABIL") == Decimal('100')

    def test_return_type_is_decimal(self):
        result = _face_value("ANY")
        assert isinstance(result, Decimal)


class TestBonusFloor:
    """Bug fix (b): bonus shares are floored to int — no silent truncation."""

    def test_2_5_pct_on_100_shares_yields_2_not_2_5(self, db):
        # 100 * 2.5 / 100 = 2.5 → must floor to 2
        u = User.objects.create(username="bonus_user")
        a = PortfolioAccount.objects.create(
            user=u, name="t", account_type=AccountType.PAPER, balance=10_000_000
        )
        book_close = datetime.date(2024, 3, 1)
        # Create a BUY transaction before book-close
        PortfolioTransaction.objects.create(
            user=u, account=a, ticker="TESTCO",
            transaction_type=TransactionType.BUY,
            quantity=100, rate=Decimal('500'),
            amount=Decimal('50000'), commission=Decimal('0'),
            sebon_fee=Decimal('0'), dp_charge=Decimal('0'),
            cgt=Decimal('0'), receivable_amount=Decimal('50000'),
            transaction_date=datetime.datetime(2024, 1, 15, tzinfo=datetime.timezone.utc),
        )
        Dividend.objects.create(
            ticker="TESTCO",
            fiscal_year="2080-81",
            bonus_percent=Decimal('2.50'),
            cash_percent=Decimal('0'),
            total_percent=Decimal('2.50'),
            book_close_date=book_close,
        )
        result = DividendService.calculate_dividends(u)
        history = result["history"]
        assert len(history) == 1
        assert history[0]["bonus_shares"] == 2  # floored, not 2.5 or 3
        assert isinstance(history[0]["bonus_shares"], int)

    def test_exact_bonus_no_fractional(self, db):
        # 100 * 10 / 100 = 10 exactly — floor is a no-op
        u = User.objects.create(username="bonus_user2")
        a = PortfolioAccount.objects.create(
            user=u, name="t", account_type=AccountType.PAPER, balance=10_000_000
        )
        book_close = datetime.date(2024, 3, 1)
        PortfolioTransaction.objects.create(
            user=u, account=a, ticker="EXACTCO",
            transaction_type=TransactionType.BUY,
            quantity=100, rate=Decimal('500'),
            amount=Decimal('50000'), commission=Decimal('0'),
            sebon_fee=Decimal('0'), dp_charge=Decimal('0'),
            cgt=Decimal('0'), receivable_amount=Decimal('50000'),
            transaction_date=datetime.datetime(2024, 1, 15, tzinfo=datetime.timezone.utc),
        )
        Dividend.objects.create(
            ticker="EXACTCO",
            fiscal_year="2080-81",
            bonus_percent=Decimal('10.00'),
            cash_percent=Decimal('0'),
            total_percent=Decimal('10.00'),
            book_close_date=book_close,
        )
        result = DividendService.calculate_dividends(u)
        history = result["history"]
        assert history[0]["bonus_shares"] == 10


class TestWaccAtDate:
    """Bug fix (c): _wacc_at_date helper returns WACC as of a cutoff date."""

    def test_single_buy_wacc_equals_rate_plus_fees(self, db):
        u = User.objects.create(username="wacc_user1")
        a = PortfolioAccount.objects.create(
            user=u, name="t", account_type=AccountType.PAPER, balance=10_000_000
        )
        PortfolioTransaction.objects.create(
            user=u, account=a, ticker="NABIL",
            transaction_type=TransactionType.BUY,
            quantity=100, rate=Decimal('1000'),
            amount=Decimal('100000'), commission=Decimal('50'),
            sebon_fee=Decimal('10'), dp_charge=Decimal('25'),
            cgt=Decimal('0'), receivable_amount=Decimal('100085'),
            transaction_date=datetime.datetime(2024, 1, 15, tzinfo=datetime.timezone.utc),
        )
        txns = list(PortfolioTransaction.objects.filter(user=u).order_by('transaction_date', 'created_at'))
        cutoff = datetime.date(2024, 3, 1)
        wacc = _wacc_at_date(txns, "NABIL", cutoff)
        # cost = 100*1000 + 50 + 10 + 25 = 100085 / 100 = 1000.85
        assert wacc == Decimal('1000.85')

    def test_wacc_excludes_txns_on_or_after_cutoff(self, db):
        u = User.objects.create(username="wacc_user2")
        a = PortfolioAccount.objects.create(
            user=u, name="t", account_type=AccountType.PAPER, balance=10_000_000
        )
        cutoff = datetime.date(2024, 3, 1)
        # BUY before cutoff
        PortfolioTransaction.objects.create(
            user=u, account=a, ticker="NABIL",
            transaction_type=TransactionType.BUY,
            quantity=100, rate=Decimal('500'),
            amount=Decimal('50000'), commission=Decimal('0'),
            sebon_fee=Decimal('0'), dp_charge=Decimal('0'),
            cgt=Decimal('0'), receivable_amount=Decimal('50000'),
            transaction_date=datetime.datetime(2024, 1, 15, tzinfo=datetime.timezone.utc),
        )
        # BUY on cutoff — must be excluded (strictly before)
        PortfolioTransaction.objects.create(
            user=u, account=a, ticker="NABIL",
            transaction_type=TransactionType.BUY,
            quantity=100, rate=Decimal('1000'),
            amount=Decimal('100000'), commission=Decimal('0'),
            sebon_fee=Decimal('0'), dp_charge=Decimal('0'),
            cgt=Decimal('0'), receivable_amount=Decimal('100000'),
            transaction_date=datetime.datetime(2024, 3, 1, tzinfo=datetime.timezone.utc),
        )
        txns = list(PortfolioTransaction.objects.filter(user=u).order_by('transaction_date', 'created_at'))
        wacc = _wacc_at_date(txns, "NABIL", cutoff)
        # Only the 500-rate buy counts; 1000-rate buy is excluded (on cutoff date)
        assert wacc == Decimal('500')

    def test_no_txns_returns_zero(self, db):
        u = User.objects.create(username="wacc_user3")
        txns = []
        wacc = _wacc_at_date(txns, "NABIL", datetime.date(2024, 3, 1))
        assert wacc == Decimal('0')


class TestYieldOnHistoricalCostBasis:
    """Bug fix (c) end-to-end: yield denominator uses historical cost, not current portfolio."""

    def test_yield_uses_historical_wacc_not_current_portfolio(self, db):
        """
        Scenario:
        - User buys 100 shares of TICKER at Rs. 500 (no fees for simplicity).
        - A cash dividend of 10% is declared with book_close = 2024-03-01.
        - After the dividend, user buys 100 more at Rs. 1000 (current portfolio
          cost basis becomes much higher).
        - Yield-on-cost must use the historical cost basis (100 × 500 = 50,000),
          NOT the current portfolio basis (100×500 + 100×1000 = 150,000).
        """
        u = User.objects.create(username="yield_hist_user")
        a = PortfolioAccount.objects.create(
            user=u, name="t", account_type=AccountType.PAPER, balance=10_000_000
        )
        book_close = datetime.date(2024, 3, 1)

        # BUY before dividend book-close
        PortfolioTransaction.objects.create(
            user=u, account=a, ticker="TICKER",
            transaction_type=TransactionType.BUY,
            quantity=100, rate=Decimal('500'),
            amount=Decimal('50000'), commission=Decimal('0'),
            sebon_fee=Decimal('0'), dp_charge=Decimal('0'),
            cgt=Decimal('0'), receivable_amount=Decimal('50000'),
            transaction_date=datetime.datetime(2024, 1, 15, tzinfo=datetime.timezone.utc),
        )

        Dividend.objects.create(
            ticker="TICKER",
            fiscal_year="2080-81",
            bonus_percent=Decimal('0'),
            cash_percent=Decimal('10.00'),
            total_percent=Decimal('10.00'),
            book_close_date=book_close,
        )

        # BUY after dividend — inflates current portfolio cost basis
        PortfolioTransaction.objects.create(
            user=u, account=a, ticker="TICKER",
            transaction_type=TransactionType.BUY,
            quantity=100, rate=Decimal('1000'),
            amount=Decimal('100000'), commission=Decimal('0'),
            sebon_fee=Decimal('0'), dp_charge=Decimal('0'),
            cgt=Decimal('0'), receivable_amount=Decimal('100000'),
            transaction_date=datetime.datetime(2024, 6, 1, tzinfo=datetime.timezone.utc),
        )

        result = DividendService.calculate_dividends(u)
        summary = result["summary"]

        # Cash dividend: 100 qty × Rs.100 face value × 10% / 100 = Rs.1000 gross
        # After 5% tax: Rs.950 net
        assert summary["total_cash_net"] == pytest.approx(950.0, abs=0.01)

        # historical_cost_basis = 100 qty × Rs.500 wacc = Rs.50,000
        assert summary["historical_cost_basis"] == pytest.approx(50000.0, abs=0.01)

        # yield = 950 / 50000 × 100 = 1.9 %
        # (NOT 950/150000×100 = 0.633% which would use current-portfolio basis)
        assert summary["yield_on_cost"] == pytest.approx(1.9, abs=0.01)

    def test_yield_zero_when_no_dividends(self, db):
        u = User.objects.create(username="yield_empty_user")
        result = DividendService.calculate_dividends(u)
        assert result["summary"]["yield_on_cost"] == 0.0
        assert result["summary"]["historical_cost_basis"] == 0.0
