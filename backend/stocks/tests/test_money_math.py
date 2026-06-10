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


# ---------------------------------------------------------------------------
# Task 5: End-to-end golden tests through process_transaction
#
# Architecture note: process_transaction() updates PortfolioItem and returns
# a metrics dict {amount, commission, sebon_fee, dp_charge, cgt,
# receivable_amount}.  It does NOT create PortfolioTransaction rows — that is
# the view's responsibility.  However the SELL branch queries
# PortfolioTransaction to find prior BUY/BONUS/RIGHTS lots for the
# holding-period check.  Therefore tests that care about CGT must:
#   1. Create PortfolioTransaction rows (simulating what the view does).
#   2. Call process_transaction to set up PortfolioItem state.
#   3. Then (for long-term) back-date the BUY rows so the holding-period query
#      sees an old acquisition date.
#   4. Call process_transaction for the SELL and inspect the returned cgt.
# ---------------------------------------------------------------------------

class TestEndToEndCGT:
    """Golden regression guard: correct CGT rate through the real process_transaction."""

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _create_buy_txn(u, a, ticker, qty, rate, txn_date):
        """Create a PortfolioTransaction BUY row with zero manual fees (fees
        computed below) so that the holding-period query finds it, then call
        process_transaction so PortfolioItem is updated correctly."""
        from stocks.utils import (
            calculate_broker_commission, calculate_sebon_fee,
            calculate_dp_charge,
        )
        amount = Decimal(qty) * Decimal(rate)
        comm = calculate_broker_commission(amount)
        sbn = calculate_sebon_fee(amount)
        dp = calculate_dp_charge()
        # Create the PortfolioTransaction row (view duty) so SELL's lot query finds it.
        txn = PortfolioTransaction.objects.create(
            user=u, account=a, ticker=ticker,
            transaction_type=TransactionType.BUY,
            quantity=qty, rate=Decimal(rate),
            amount=amount, commission=comm,
            sebon_fee=sbn, dp_charge=dp,
            cgt=Decimal('0'), receivable_amount=amount + comm + sbn + dp,
            transaction_date=txn_date,
        )
        # Call process_transaction so PortfolioItem reflects this BUY.
        PortfolioService.process_transaction(
            user=u, account=a, ticker=ticker,
            txn_type=TransactionType.BUY,
            quantity=qty, rate=rate,
        )
        return txn

    # ------------------------------------------------------------------
    # Test 1: short-term CGT (held < 1 yr → 7.5%)
    # ------------------------------------------------------------------

    def test_cgt_short_term_7_5_pct(self, acct):
        """Selling within <1 year of BUY must produce CGT at 7.5%."""
        u, a = acct
        from django.utils import timezone

        # BUY 100 @ 1000 — transaction_date is now (recent, so holding < 1 yr).
        buy_date = timezone.now()
        self._create_buy_txn(u, a, "STSHORT", 100, 1000, buy_date)

        item = PortfolioItem.objects.get(user=u, account=a, ticker="STSHORT")
        wacc = item.wacc  # fee-inclusive

        # SELL 100 @ 1200
        sell_metrics = PortfolioService.process_transaction(
            user=u, account=a, ticker="STSHORT",
            txn_type=TransactionType.SELL,
            quantity=100, rate=1200,
        )

        gross_profit = (Decimal('1200') - wacc) * Decimal('100')
        expected_cgt = (gross_profit * Decimal('0.075')).quantize(Decimal('0.01'))

        # Allow ±1 due to rounding in calculate_cgt (round to 2 dp).
        assert sell_metrics['cgt'] == pytest.approx(float(expected_cgt), abs=1.0), (
            f"Short-term CGT should be 7.5% of gross profit {gross_profit:.2f}; "
            f"got {sell_metrics['cgt']}, expected ~{expected_cgt}"
        )
        # Sanity: must NOT be 5% rate
        long_term_cgt = (gross_profit * Decimal('0.05')).quantize(Decimal('0.01'))
        assert float(sell_metrics['cgt']) > float(long_term_cgt), (
            "Short-term CGT must exceed the 5% long-term rate — wrong rate applied."
        )

    # ------------------------------------------------------------------
    # Test 2: long-term CGT (held ≥ 1 yr → 5%) — core regression guard
    # ------------------------------------------------------------------

    def test_cgt_long_term_5_pct(self, acct):
        """BUY back-dated >365 days ago: process_transaction SELL must apply 5% CGT,
        not 7.5%.  A failure here means the holding-period wiring is broken."""
        u, a = acct
        from django.utils import timezone

        # BUY with a recent transaction_date first (so process_transaction builds PortfolioItem).
        buy_date = timezone.now()
        buy_txn = self._create_buy_txn(u, a, "LTLONG", 100, 1000, buy_date)

        item = PortfolioItem.objects.get(user=u, account=a, ticker="LTLONG")
        wacc = item.wacc

        # Back-date the BUY row to >365 days ago so the holding-period query
        # sees a long-term acquisition.  We update() directly to bypass auto_now.
        old_date = timezone.now() - datetime.timedelta(days=730)  # 2 years ago
        PortfolioTransaction.objects.filter(pk=buy_txn.pk).update(transaction_date=old_date)

        # SELL 100 @ 1200 — process_transaction reads the (now old) BUY date.
        sell_metrics = PortfolioService.process_transaction(
            user=u, account=a, ticker="LTLONG",
            txn_type=TransactionType.SELL,
            quantity=100, rate=1200,
        )

        gross_profit = (Decimal('1200') - wacc) * Decimal('100')
        expected_cgt_long = (gross_profit * Decimal('0.05')).quantize(Decimal('0.01'))
        expected_cgt_short = (gross_profit * Decimal('0.075')).quantize(Decimal('0.01'))

        # Core assertion: long-term rate (5%), NOT short-term (7.5%).
        assert sell_metrics['cgt'] == pytest.approx(float(expected_cgt_long), abs=1.0), (
            f"LONG-TERM CGT BUG: expected 5% of profit={gross_profit:.2f} "
            f"→ {expected_cgt_long}, but got {sell_metrics['cgt']} "
            f"(7.5% would give {expected_cgt_short}).  "
            f"The holding-period wiring in process_transaction is broken."
        )
        # Strict guard: returned CGT must be less than the 7.5% value.
        assert float(sell_metrics['cgt']) < float(expected_cgt_short), (
            f"Long-term CGT {sell_metrics['cgt']} >= short-term CGT {expected_cgt_short}; "
            f"the 5% rate was not applied."
        )

    # ------------------------------------------------------------------
    # Test 3: WACC progression — BUY → BONUS → BUY
    # ------------------------------------------------------------------

    def test_wacc_buy_bonus_buy(self, acct):
        """WACC must dilute on BONUS (cost unchanged, qty up) then rise on second BUY."""
        u, a = acct
        from django.utils import timezone
        from stocks.utils import (
            calculate_broker_commission, calculate_sebon_fee,
            calculate_dp_charge,
        )

        # --- Step 1: BUY 100 @ 1000 ---
        buy1_date = timezone.now()
        self._create_buy_txn(u, a, "WACCTEST", 100, 1000, buy1_date)

        item = PortfolioItem.objects.get(user=u, account=a, ticker="WACCTEST")
        wacc_after_buy1 = item.wacc
        # WACC = (100*1000 + commission + sebon + dp) / 100
        # commission on 100k: 100000 * 0.33% = 330
        # sebon: 100000 * 0.015% = 15
        # dp: 25
        # expected: (100000 + 330 + 15 + 25) / 100 = 100370 / 100 = 1003.70
        assert wacc_after_buy1 == pytest.approx(Decimal('1003.70'), abs=Decimal('0.02')), (
            f"WACC after first BUY should be ~1003.70, got {wacc_after_buy1}"
        )
        total_cost_after_buy1 = wacc_after_buy1 * Decimal('100')

        # --- Step 2: BONUS 10 shares (10% bonus on 100) ---
        # process_transaction for BONUS: wacc = old_total_cost / new_qty
        PortfolioService.process_transaction(
            user=u, account=a, ticker="WACCTEST",
            txn_type=TransactionType.BONUS,
            quantity=10, rate=0,
        )
        item.refresh_from_db()
        wacc_after_bonus = item.wacc
        # BONUS dilutes: cost stays, qty increases to 110.
        # expected_wacc_after_bonus = total_cost_after_buy1 / 110
        expected_wacc_bonus = total_cost_after_buy1 / Decimal('110')
        assert wacc_after_bonus == pytest.approx(expected_wacc_bonus, abs=Decimal('0.02')), (
            f"After BONUS, WACC should dilute to ~{expected_wacc_bonus:.4f}, got {wacc_after_bonus}"
        )
        assert wacc_after_bonus < wacc_after_buy1, "BONUS must dilute WACC (lower than pre-bonus WACC)"
        total_cost_after_bonus = wacc_after_bonus * Decimal('110')

        # --- Step 3: BUY 50 @ 1200 ---
        buy2_date = timezone.now()
        buy2_amount = Decimal('50') * Decimal('1200')  # 60000
        buy2_comm = calculate_broker_commission(buy2_amount)   # 60000 * 0.33% = 198
        buy2_sbn = calculate_sebon_fee(buy2_amount)            # 60000 * 0.015% = 9
        buy2_dp = calculate_dp_charge()                         # 25
        buy2_total_cost = buy2_amount + buy2_comm + buy2_sbn + buy2_dp

        self._create_buy_txn(u, a, "WACCTEST", 50, 1200, buy2_date)
        item.refresh_from_db()
        wacc_after_buy2 = item.wacc
        # WACC after second BUY = (total_cost_110 + buy2_total_cost) / 160
        expected_wacc_buy2 = (total_cost_after_bonus + buy2_total_cost) / Decimal('160')
        assert wacc_after_buy2 == pytest.approx(expected_wacc_buy2, abs=Decimal('0.05')), (
            f"WACC after second BUY should be ~{expected_wacc_buy2:.4f}, got {wacc_after_buy2}. "
            f"(fee-inclusive: buy2_total_cost={buy2_total_cost})"
        )
        assert wacc_after_buy2 > wacc_after_bonus, "Second BUY at higher price must raise WACC"

    # ------------------------------------------------------------------
    # Test 4: Realized P&L nets fees + correct CGT on long-term hold
    # ------------------------------------------------------------------

    def test_realized_pnl_nets_fees_and_cgt_long_term(self, acct):
        """After a profitable long-term SELL, the returned receivable_amount must equal
        sell_amount - commission - sebon_fee - dp_charge - cgt, with cgt computed at 5%."""
        u, a = acct
        from django.utils import timezone

        # BUY 100 @ 1000
        buy_date = timezone.now()
        buy_txn = self._create_buy_txn(u, a, "REALPNL", 100, 1000, buy_date)

        item = PortfolioItem.objects.get(user=u, account=a, ticker="REALPNL")
        wacc = item.wacc

        # Back-date BUY to 2 years ago → long-term CGT applies
        old_date = timezone.now() - datetime.timedelta(days=730)
        PortfolioTransaction.objects.filter(pk=buy_txn.pk).update(transaction_date=old_date)

        # SELL 100 @ 1200
        sell_metrics = PortfolioService.process_transaction(
            user=u, account=a, ticker="REALPNL",
            txn_type=TransactionType.SELL,
            quantity=100, rate=1200,
        )

        sell_amount = Decimal('120000')  # 100 * 1200
        gross_profit = (Decimal('1200') - wacc) * Decimal('100')

        # CGT must be at long-term rate (5%)
        expected_cgt = (gross_profit * Decimal('0.05')).quantize(Decimal('0.01'))
        assert sell_metrics['cgt'] == pytest.approx(float(expected_cgt), abs=1.0), (
            f"CGT should be 5% (long-term) of profit {gross_profit:.2f} = {expected_cgt}; "
            f"got {sell_metrics['cgt']}"
        )

        # receivable_amount = sell_amount - commission - sebon_fee - dp_charge - cgt
        computed_receivable = (
            sell_amount
            - Decimal(str(sell_metrics['commission']))
            - Decimal(str(sell_metrics['sebon_fee']))
            - Decimal(str(sell_metrics['dp_charge']))
            - Decimal(str(sell_metrics['cgt']))
        )
        assert float(sell_metrics['receivable_amount']) == pytest.approx(
            float(computed_receivable), abs=1.0
        ), (
            f"receivable_amount mismatch: "
            f"sell_amount={sell_amount} - comm={sell_metrics['commission']} "
            f"- sebon={sell_metrics['sebon_fee']} - dp={sell_metrics['dp_charge']} "
            f"- cgt={sell_metrics['cgt']} = {computed_receivable:.2f}; "
            f"got {sell_metrics['receivable_amount']}"
        )
