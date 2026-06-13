from decimal import Decimal
from datetime import date
from unittest.mock import MagicMock, patch

import pytest


class TestGetHoldingsAtDate:
    def _txn(self, ticker, txn_type_str, qty, txn_date):
        m = MagicMock()
        m.ticker = ticker
        m.transaction_type = txn_type_str
        m.quantity = Decimal(str(qty))
        m.transaction_date.date.return_value = txn_date
        return m

    def test_buy_only_returns_buy_quantity(self):
        from stocks.services.dividend_service import _get_holdings_at_date
        buy = self._txn("NABIL", "BUY", 100, date(2024, 1, 1))
        result = _get_holdings_at_date([buy], "NABIL", date(2024, 3, 1))
        assert result == Decimal("100")

    def test_buy_minus_sell_returns_net(self):
        from stocks.services.dividend_service import _get_holdings_at_date
        buy = self._txn("NABIL", "BUY", 100, date(2024, 1, 1))
        sell = self._txn("NABIL", "SELL", 30, date(2024, 2, 1))
        result = _get_holdings_at_date([buy, sell], "NABIL", date(2024, 3, 1))
        assert result == Decimal("70")

    def test_floors_at_zero_on_oversell(self):
        from stocks.services.dividend_service import _get_holdings_at_date
        sell = self._txn("NABIL", "SELL", 200, date(2024, 1, 1))
        result = _get_holdings_at_date([sell], "NABIL", date(2024, 2, 1))
        assert result == Decimal("0")

    def test_ignores_transactions_after_cutoff(self):
        from stocks.services.dividend_service import _get_holdings_at_date
        buy = self._txn("NABIL", "BUY", 100, date(2024, 1, 1))
        late_buy = self._txn("NABIL", "BUY", 50, date(2025, 1, 1))
        result = _get_holdings_at_date([buy, late_buy], "NABIL", date(2024, 6, 1))
        assert result == Decimal("100")

    def test_ignores_different_ticker(self):
        from stocks.services.dividend_service import _get_holdings_at_date
        buy = self._txn("NICA", "BUY", 100, date(2024, 1, 1))
        result = _get_holdings_at_date([buy], "NABIL", date(2024, 3, 1))
        assert result == Decimal("0")

    def test_empty_transaction_list_returns_zero(self):
        from stocks.services.dividend_service import _get_holdings_at_date
        result = _get_holdings_at_date([], "NABIL", date(2024, 3, 1))
        assert result == Decimal("0")

    def test_bonus_shares_count_as_additions(self):
        from stocks.services.dividend_service import _get_holdings_at_date
        buy = self._txn("NABIL", "BUY", 100, date(2024, 1, 1))
        bonus = self._txn("NABIL", "BONUS", 10, date(2024, 2, 1))
        result = _get_holdings_at_date([buy, bonus], "NABIL", date(2024, 3, 1))
        assert result == Decimal("110")

    def test_transaction_on_cutoff_date_is_excluded(self):
        # Existing logic uses strict < for cutoff, so same-day txn must be excluded
        from stocks.services.dividend_service import _get_holdings_at_date
        buy = self._txn("NABIL", "BUY", 100, date(2024, 3, 1))
        result = _get_holdings_at_date([buy], "NABIL", date(2024, 3, 1))
        assert result == Decimal("0")


class TestComputeCashItem:
    def _make_div(self, book_close_str, cash_percent, bonus_percent=0):
        div = MagicMock()
        div.id = 1
        div.ticker = "NABIL"
        div.fiscal_year = "2080/2081"
        div.book_close_date = date.fromisoformat(book_close_str)
        # The existing service uses div.cash_percent and div.bonus_percent
        div.cash_percent = Decimal(str(cash_percent))
        div.bonus_percent = Decimal(str(bonus_percent))
        return div

    def test_returns_none_when_no_holdings(self):
        from stocks.services.dividend_service import _compute_cash_item
        div = self._make_div("2024-03-01", 10)
        assert _compute_cash_item(div, Decimal("0"), date(2024, 6, 1)) is None

    def test_cash_dividend_gross_uses_face_value(self):
        from stocks.services.dividend_service import _compute_cash_item
        from stocks.constants import FACE_VALUE_PER_SHARE
        div = self._make_div("2024-03-01", 10)
        result = _compute_cash_item(div, Decimal("100"), date(2024, 6, 1))
        expected_gross = Decimal("100") * Decimal(str(FACE_VALUE_PER_SHARE)) * Decimal("10") / Decimal("100")
        assert result["cash_dividend_gross"] == expected_gross

    def test_tax_deducted_at_correct_rate(self):
        from stocks.services.dividend_service import _compute_cash_item
        from stocks.constants import WITHHOLDING_TAX_RATE
        div = self._make_div("2024-03-01", 10)
        result = _compute_cash_item(div, Decimal("100"), date(2024, 6, 1))
        expected_tax = result["cash_dividend_gross"] * Decimal(str(WITHHOLDING_TAX_RATE))
        assert result["tax"] == expected_tax

    def test_future_book_close_marked_upcoming(self):
        from stocks.services.dividend_service import _compute_cash_item
        div = self._make_div("2099-01-01", 10)
        assert _compute_cash_item(div, Decimal("50"), date(2024, 6, 1))["type"] == "Upcoming"

    def test_past_book_close_marked_received(self):
        from stocks.services.dividend_service import _compute_cash_item
        div = self._make_div("2020-01-01", 10)
        assert _compute_cash_item(div, Decimal("50"), date(2024, 6, 1))["type"] == "Received"

    def test_result_contains_required_keys(self):
        from stocks.services.dividend_service import _compute_cash_item
        div = self._make_div("2024-03-01", 10)
        result = _compute_cash_item(div, Decimal("100"), date(2024, 6, 1))
        required = {
            "id", "ticker", "fiscal_year", "book_close_date", "shares_held",
            "cash_dividend_gross", "tax", "cash_dividend_net",
            "bonus_shares", "cash_percent", "bonus_percent", "type",
        }
        assert required.issubset(result.keys())

    def test_net_equals_gross_minus_tax(self):
        from stocks.services.dividend_service import _compute_cash_item
        div = self._make_div("2020-01-01", 15)
        result = _compute_cash_item(div, Decimal("200"), date(2024, 6, 1))
        assert result["cash_dividend_net"] == result["cash_dividend_gross"] - result["tax"]


class TestUpdateTickerState:
    def _txn(self, txn_type, qty, rate):
        m = MagicMock()
        m.transaction_type = txn_type
        m.quantity = Decimal(str(qty))
        m.rate = Decimal(str(rate))
        m.commission = Decimal("0")
        m.sebon_fee = Decimal("0")
        m.dp_charge = Decimal("0")
        m.cgt = Decimal("0")
        return m

    def _empty_state(self):
        return {
            "qty": Decimal("0"),
            "wacc": Decimal("0.00"),
            "realized_pnl": Decimal("0.00"),
            "total_sold_qty": 0,
            "sell_count": 0,
            "profitable_sells": 0,
        }

    def test_buy_increases_qty_and_sets_wacc(self):
        from stocks.services.dividend_service import _update_ticker_state
        state = self._empty_state()
        _update_ticker_state(state, self._txn("BUY", 100, 500))
        assert state["qty"] == Decimal("100")
        assert state["wacc"] == Decimal("500")

    def test_second_buy_uses_weighted_average_wacc(self):
        from stocks.services.dividend_service import _update_ticker_state
        state = self._empty_state()
        _update_ticker_state(state, self._txn("BUY", 100, 500))
        _update_ticker_state(state, self._txn("BUY", 100, 600))
        assert state["qty"] == Decimal("200")
        assert state["wacc"] == Decimal("550")

    def test_sell_realizes_pnl_at_wacc(self):
        from stocks.services.dividend_service import _update_ticker_state
        state = self._empty_state()
        _update_ticker_state(state, self._txn("BUY", 100, 500))
        _update_ticker_state(state, self._txn("SELL", 50, 600))
        assert state["realized_pnl"] == Decimal("5000")
        assert state["qty"] == Decimal("50")

    def test_sell_reduces_qty(self):
        from stocks.services.dividend_service import _update_ticker_state
        state = self._empty_state()
        _update_ticker_state(state, self._txn("BUY", 100, 500))
        _update_ticker_state(state, self._txn("SELL", 50, 600))
        assert state["qty"] == Decimal("50")

    def test_full_sell_zeroes_qty(self):
        from stocks.services.dividend_service import _update_ticker_state
        state = self._empty_state()
        _update_ticker_state(state, self._txn("BUY", 100, 500))
        _update_ticker_state(state, self._txn("SELL", 100, 600))
        assert state["qty"] == Decimal("0")

    def test_profitable_sell_increments_profitable_sells(self):
        from stocks.services.dividend_service import _update_ticker_state
        state = self._empty_state()
        _update_ticker_state(state, self._txn("BUY", 100, 500))
        _update_ticker_state(state, self._txn("SELL", 50, 600))
        assert state["profitable_sells"] == 1

    def test_sell_at_loss_does_not_increment_profitable_sells(self):
        from stocks.services.dividend_service import _update_ticker_state
        state = self._empty_state()
        _update_ticker_state(state, self._txn("BUY", 100, 500))
        _update_ticker_state(state, self._txn("SELL", 50, 400))
        assert state["profitable_sells"] == 0


class TestComputeRealizedPnl:
    @pytest.mark.django_db
    def test_returns_tuple_of_list_and_decimal(self):
        from stocks.services.dividend_service import _compute_realized_pnl
        with patch("stocks.services.dividend_service.PortfolioTransaction") as MockTxn:
            MockTxn.objects.filter.return_value.filter.return_value.order_by.return_value = []
            items, total = _compute_realized_pnl(MagicMock())
        assert isinstance(items, list) and isinstance(total, Decimal)

    @pytest.mark.django_db
    def test_no_transactions_returns_zero_total(self):
        from stocks.services.dividend_service import _compute_realized_pnl
        with patch("stocks.services.dividend_service.PortfolioTransaction") as MockTxn:
            MockTxn.objects.filter.return_value.filter.return_value.order_by.return_value = []
            _, total = _compute_realized_pnl(MagicMock())
        assert total == Decimal("0")

    @pytest.mark.django_db
    def test_buy_only_yields_zero_realized(self):
        from stocks.services.dividend_service import _compute_realized_pnl
        buy = MagicMock(
            ticker="NABIL", transaction_type="BUY",
            quantity=Decimal("100"), rate=Decimal("500"),
            commission=Decimal("0"), sebon_fee=Decimal("0"),
            dp_charge=Decimal("0"), cgt=Decimal("0"),
        )
        with patch("stocks.services.dividend_service.PortfolioTransaction") as MockTxn:
            MockTxn.objects.filter.return_value.filter.return_value.order_by.return_value = [buy]
            items, total = _compute_realized_pnl(MagicMock())
        assert total == Decimal("0") and items == []

    @pytest.mark.django_db
    def test_buy_then_sell_above_cost_gives_positive_pnl(self):
        from stocks.services.dividend_service import _compute_realized_pnl
        buy = MagicMock(
            ticker="NABIL", transaction_type="BUY",
            quantity=Decimal("100"), rate=Decimal("500"),
            commission=Decimal("0"), sebon_fee=Decimal("0"),
            dp_charge=Decimal("0"), cgt=Decimal("0"),
        )
        sell = MagicMock(
            ticker="NABIL", transaction_type="SELL",
            quantity=Decimal("100"), rate=Decimal("700"),
            commission=Decimal("0"), sebon_fee=Decimal("0"),
            dp_charge=Decimal("0"), cgt=Decimal("0"),
        )
        with patch("stocks.services.dividend_service.PortfolioTransaction") as MockTxn:
            MockTxn.objects.filter.return_value.filter.return_value.order_by.return_value = [buy, sell]
            items, total = _compute_realized_pnl(MagicMock())
        assert total == Decimal("20000")
        assert len(items) == 1 and items[0]["ticker"] == "NABIL"
