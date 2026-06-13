"""
Tests for the helpers extracted during the portfolio_service.py SOLID refactor.
Each test verifies: correct return type + handles empty/minimal input without crashing.
"""
from decimal import Decimal
from unittest.mock import MagicMock, patch, PropertyMock
import pytest

from stocks.services.portfolio_service import (
    _apply_txn_to_position,
    _compute_wacc_from_transactions,
    _upsert_portfolio_item,
    _resolve_fees,
    _process_buy,
    _process_bonus,
    _process_rights,
    _process_short_sell,
    _process_buy_to_cover,
    _dispatch_txn_type,
    _fetch_price_data,
    _compute_volatilities,
    _annotate_item_metrics,
    _fetch_latest_signal_dates,
    _build_signal_entry,
)
from stocks.models.portfolio import TransactionType, AccountType


# ---------------------------------------------------------------------------
# _apply_txn_to_position
# ---------------------------------------------------------------------------

class TestApplyTxnToPosition:
    def _make_txn(self, txn_type, quantity, rate=100, commission=0, sebon_fee=0, dp_charge=0):
        txn = MagicMock()
        txn.transaction_type = txn_type
        txn.quantity = quantity
        txn.rate = rate
        txn.commission = commission
        txn.sebon_fee = sebon_fee
        txn.dp_charge = dp_charge
        return txn

    def test_buy_increases_qty_and_sets_wacc(self):
        txn = self._make_txn(TransactionType.BUY, 10, rate=100)
        qty, wacc = _apply_txn_to_position(0, Decimal('0'), txn)
        assert qty == 10
        assert wacc > Decimal('0')

    def test_sell_decreases_qty(self):
        txn = self._make_txn(TransactionType.SELL, 5)
        qty, wacc = _apply_txn_to_position(10, Decimal('100'), txn)
        assert qty == 5

    def test_bonus_increases_qty_dilutes_wacc(self):
        txn = self._make_txn(TransactionType.BONUS, 10)
        qty, wacc = _apply_txn_to_position(10, Decimal('100'), txn)
        assert qty == 20
        assert wacc == Decimal('50')

    def test_buy_to_cover_increases_qty(self):
        txn = self._make_txn(TransactionType.BUY_TO_COVER, 3)
        qty, wacc = _apply_txn_to_position(-5, Decimal('100'), txn)
        assert qty == -2


# ---------------------------------------------------------------------------
# _compute_wacc_from_transactions
# ---------------------------------------------------------------------------

class TestComputeWaccFromTransactions:
    def test_empty_list_returns_zero(self):
        qty, wacc = _compute_wacc_from_transactions([])
        assert qty == 0
        assert wacc == Decimal('0.00')

    def test_single_buy_returns_correct_position(self):
        txn = MagicMock()
        txn.transaction_type = TransactionType.BUY
        txn.quantity = 10
        txn.rate = 100
        txn.commission = 0
        txn.sebon_fee = 0
        txn.dp_charge = 0
        qty, wacc = _compute_wacc_from_transactions([txn])
        assert qty == 10
        assert wacc == Decimal('100')


# ---------------------------------------------------------------------------
# _upsert_portfolio_item
# ---------------------------------------------------------------------------

class TestUpsertPortfolioItem:
    @patch('stocks.services.portfolio_service.PortfolioItem.objects.get_or_create')
    def test_creates_new_item(self, mock_goc):
        item = MagicMock()
        mock_goc.return_value = (item, True)
        result = _upsert_portfolio_item('user', 'account', 'NABIL', 10, Decimal('100'))
        assert result is item

    @patch('stocks.services.portfolio_service.PortfolioItem.objects.get_or_create')
    def test_updates_existing_item(self, mock_goc):
        item = MagicMock()
        mock_goc.return_value = (item, False)
        result = _upsert_portfolio_item('user', 'account', 'NABIL', 10, Decimal('100'))
        item.save.assert_called_once()
        assert result is item


# ---------------------------------------------------------------------------
# _resolve_fees
# ---------------------------------------------------------------------------

class TestResolveFees:
    @patch('stocks.services.portfolio_service.calculate_broker_commission', return_value=Decimal('50'))
    @patch('stocks.services.portfolio_service.calculate_sebon_fee', return_value=Decimal('10'))
    @patch('stocks.services.portfolio_service.calculate_dp_charge', return_value=Decimal('25'))
    def test_uses_defaults_when_none(self, mock_dp, mock_sebon, mock_comm):
        amount, commission, sebon_fee, dp_charge = _resolve_fees(10, 100, None, None, None)
        assert amount == Decimal('1000')
        assert commission == Decimal('50')
        assert sebon_fee == Decimal('10')
        assert dp_charge == Decimal('25')

    def test_uses_provided_values(self):
        amount, commission, sebon_fee, dp_charge = _resolve_fees(10, 100, '5', '2', '3')
        assert commission == Decimal('5')
        assert sebon_fee == Decimal('2')
        assert dp_charge == Decimal('3')


# ---------------------------------------------------------------------------
# _process_bonus
# ---------------------------------------------------------------------------

class TestProcessBonus:
    def test_dilutes_wacc_and_returns_zero(self):
        item = MagicMock()
        item.quantity = 10
        item.wacc = Decimal('200')
        result = _process_bonus(10, item)
        assert result == Decimal('0.00')
        assert item.quantity == 20
        assert item.wacc == Decimal('100')
        item.save.assert_called_once()


# ---------------------------------------------------------------------------
# _process_buy
# ---------------------------------------------------------------------------

class TestProcessBuy:
    def test_updates_item_and_returns_total_cost(self):
        item = MagicMock()
        item.quantity = 0
        item.wacc = Decimal('0')
        result = _process_buy(
            10, Decimal('1000'), Decimal('50'), Decimal('10'), Decimal('25'),
            None, item
        )
        assert result == Decimal('1085')
        item.save.assert_called_once()

    def test_raises_for_insufficient_paper_balance(self):
        item = MagicMock()
        item.quantity = 0
        item.wacc = Decimal('0')
        account = MagicMock()
        account.account_type = AccountType.PAPER
        account.balance = Decimal('10')
        with pytest.raises(ValueError, match="Insufficient paper balance"):
            _process_buy(10, Decimal('1000'), Decimal('50'), Decimal('10'), Decimal('25'),
                         account, item)


# ---------------------------------------------------------------------------
# _process_short_sell
# ---------------------------------------------------------------------------

class TestProcessShortSell:
    def test_raises_for_non_paper_account(self):
        account = MagicMock()
        account.account_type = AccountType.LIVE
        item = MagicMock()
        with pytest.raises(ValueError, match="Short selling is only allowed"):
            _process_short_sell(10, Decimal('1000'), Decimal('0'), Decimal('0'), Decimal('0'),
                                account, item)

    def test_no_account_returns_receivable(self):
        item = MagicMock()
        item.quantity = 0
        item.wacc = Decimal('0')
        result = _process_short_sell(
            10, Decimal('1000'), Decimal('0'), Decimal('0'), Decimal('0'), None, item
        )
        assert result == Decimal('1000')


# ---------------------------------------------------------------------------
# _process_buy_to_cover
# ---------------------------------------------------------------------------

class TestProcessBuyToCover:
    def test_raises_when_no_short_position(self):
        item = MagicMock()
        item.quantity = 5
        with pytest.raises(ValueError, match="No short position"):
            _process_buy_to_cover(5, Decimal('500'), Decimal('0'), Decimal('0'), Decimal('0'),
                                  None, item)

    def test_raises_when_covering_more_than_position(self):
        item = MagicMock()
        item.quantity = -3
        with pytest.raises(ValueError, match="Cannot cover more"):
            _process_buy_to_cover(5, Decimal('500'), Decimal('0'), Decimal('0'), Decimal('0'),
                                  None, item)


# ---------------------------------------------------------------------------
# _dispatch_txn_type
# ---------------------------------------------------------------------------

class TestDispatchTxnType:
    def test_routes_buy_and_returns_cgt_zero(self):
        item = MagicMock()
        item.quantity = 0
        item.wacc = Decimal('0')
        receivable, cgt = _dispatch_txn_type(
            TransactionType.BUY, None, 'NABIL', 10, 100,
            Decimal('1000'), Decimal('0'), Decimal('0'), Decimal('0'),
            None, item
        )
        assert cgt == Decimal('0.00')
        assert receivable == Decimal('1000')

    def test_unknown_type_returns_amount(self):
        item = MagicMock()
        receivable, cgt = _dispatch_txn_type(
            'UNKNOWN', None, 'NABIL', 10, 100,
            Decimal('1000'), Decimal('0'), Decimal('0'), Decimal('0'),
            None, item
        )
        assert receivable == Decimal('1000')
        assert cgt == Decimal('0.00')


# ---------------------------------------------------------------------------
# _fetch_price_data
# ---------------------------------------------------------------------------

class TestFetchPriceData:
    @patch('stocks.services.portfolio_service.DailyStockPrice.objects')
    def test_returns_empty_dicts_when_no_prices(self, mock_mgr):
        mock_mgr.order_by.return_value.values_list.return_value.distinct.return_value.__getitem__.return_value = []
        latest_prices, prev_closes, dates = _fetch_price_data(['NABIL'])
        assert isinstance(latest_prices, dict)
        assert isinstance(prev_closes, dict)

    @patch('stocks.services.portfolio_service.DailyStockPrice.objects')
    def test_returns_dicts_for_empty_tickers(self, mock_mgr):
        mock_mgr.order_by.return_value.values_list.return_value.distinct.return_value.__getitem__.return_value = []
        latest_prices, prev_closes, dates = _fetch_price_data([])
        assert latest_prices == {} or isinstance(latest_prices, dict)


# ---------------------------------------------------------------------------
# _compute_volatilities
# ---------------------------------------------------------------------------

class TestComputeVolatilities:
    @patch('stocks.services.portfolio_service.DailyStockPrice.objects')
    def test_returns_empty_dict_for_empty_tickers(self, mock_mgr):
        mock_mgr.filter.return_value.values.return_value.order_by.return_value = []
        result = _compute_volatilities([], [])
        assert isinstance(result, dict)
        assert result == {}

    @patch('stocks.services.portfolio_service.DailyStockPrice.objects')
    def test_handles_db_exception_gracefully(self, mock_mgr):
        mock_mgr.filter.side_effect = Exception("DB error")
        result = _compute_volatilities(['NABIL'], ['2025-01-01'])
        assert isinstance(result, dict)


# ---------------------------------------------------------------------------
# _annotate_item_metrics
# ---------------------------------------------------------------------------

class TestAnnotateItemMetrics:
    def test_annotates_long_position(self):
        item = MagicMock()
        item.quantity = 10
        item.buy_price = Decimal('100')
        _annotate_item_metrics(
            item, Decimal('120'), Decimal('110'),
            'Banking', 0.5, None, 75, {}
        )
        assert item.current_price == Decimal('120')
        assert item.gain_loss == Decimal('200')
        assert item.sector == 'Banking'
        assert item.health_score == 75

    def test_annotates_short_position(self):
        item = MagicMock()
        item.quantity = -10
        item.buy_price = Decimal('100')
        _annotate_item_metrics(
            item, Decimal('80'), Decimal('90'),
            'Banking', 0.4, None, 60, {}
        )
        # Short gain = entry_value - current_value = 1000 - 800 = 200
        assert item.gain_loss == Decimal('200')


# ---------------------------------------------------------------------------
# _fetch_latest_signal_dates
# ---------------------------------------------------------------------------

class TestFetchLatestSignalDates:
    @patch('stocks.services.portfolio_service.SignalEpisode.objects')
    def test_returns_empty_dict_for_empty_tickers(self, mock_mgr):
        mock_mgr.filter.return_value.values.return_value.annotate.return_value = []
        result = _fetch_latest_signal_dates([])
        assert result == {}

    @patch('stocks.services.portfolio_service.SignalEpisode.objects')
    def test_returns_dict_with_symbol_keys(self, mock_mgr):
        mock_mgr.filter.return_value.values.return_value.annotate.return_value = [
            {'symbol': 'NABIL', 'max_date': '2025-01-10'}
        ]
        result = _fetch_latest_signal_dates(['NABIL'])
        assert 'NABIL' in result
        assert result['NABIL'] == '2025-01-10'


# ---------------------------------------------------------------------------
# _build_signal_entry
# ---------------------------------------------------------------------------

class TestBuildSignalEntry:
    @patch('stocks.services.portfolio_service.SignalEpisode.objects')
    def test_returns_neutral_for_no_episodes(self, mock_mgr):
        mock_mgr.filter.return_value.select_related.return_value = []
        result = _build_signal_entry('NABIL', '2025-01-10')
        assert result['summary'] == 'NEUTRAL'
        assert result['latest_date'] == '2025-01-10'
        assert isinstance(result['details'], list)

    @patch('stocks.services.portfolio_service.SignalEpisode.objects')
    def test_returns_buy_when_buy_count_dominates(self, mock_mgr):
        ep = MagicMock()
        ep.direction = 'BUY'
        ep.strategy.name = 'RSI'
        ep.strategy.description = 'RSI strategy'
        mock_mgr.filter.return_value.select_related.return_value = [ep, ep]
        result = _build_signal_entry('NABIL', '2025-01-10')
        assert result['summary'] == 'BUY'
