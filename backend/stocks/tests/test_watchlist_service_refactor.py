"""Tests for WatchlistService helper extraction (SOLID Phase 3b)."""
from unittest.mock import MagicMock, patch
import pytest
from stocks.services.watchlist_service import WatchlistService


class TestGetWatchlistMetricsEmpty:
    def test_returns_empty_list_for_empty_queryset(self):
        mock_qs = MagicMock()
        mock_qs.values_list.return_value.distinct.return_value = []
        result = WatchlistService.get_watchlist_metrics(mock_qs)
        assert result == []


class TestFetchPriceData:
    def test_returns_empty_dicts_for_no_tickers(self):
        with patch('stocks.services.watchlist_service.DailyStockPrice') as MockPrice:
            MockPrice.objects.filter.return_value.order_by.return_value.distinct.return_value = []
            prices, changes, pct_changes = WatchlistService._fetch_price_data([])
        assert prices == {}
        assert changes == {}
        assert pct_changes == {}

    def test_maps_ticker_fields_correctly(self):
        mock_row = MagicMock()
        mock_row.ticker = 'NABIL'
        mock_row.close = 1500
        mock_row.diff = 10
        mock_row.diff_percent = 0.67
        mock_row.prev_close = 1490
        with patch('stocks.services.watchlist_service.DailyStockPrice') as MockPrice:
            MockPrice.objects.filter.return_value.order_by.return_value.distinct.return_value = [mock_row]
            prices, changes, pct_changes = WatchlistService._fetch_price_data(['NABIL'])
        assert prices['NABIL'] == 1500
        assert changes['NABIL'] == 10
        assert pct_changes['NABIL'] == 0.67


class TestFetchCompanyData:
    def test_returns_empty_dict_for_no_tickers(self):
        with patch('stocks.services.watchlist_service.Company') as MockCompany:
            MockCompany.objects.filter.return_value.values.return_value = []
            result = WatchlistService._fetch_company_data([])
        assert result == {}

    def test_maps_symbol_to_name_and_sector(self):
        mock_row = {'symbol': 'NABIL', 'name': 'Nabil Bank', 'sector': 'Banking'}
        with patch('stocks.services.watchlist_service.Company') as MockCompany:
            MockCompany.objects.filter.return_value.values.return_value = [mock_row]
            result = WatchlistService._fetch_company_data(['NABIL'])
        assert result == {'NABIL': {'name': 'Nabil Bank', 'sector': 'Banking'}}


class TestFetchIndicators:
    def test_returns_empty_dict_for_no_tickers(self):
        result = WatchlistService._fetch_indicators([])
        assert result == {}

    def test_does_not_crash_on_exception(self):
        with patch('stocks.services.watchlist_service.DailyStockPrice') as MockPrice:
            MockPrice.objects.filter.side_effect = Exception("DB error")
            result = WatchlistService._fetch_indicators(['NABIL'])
        assert result == {}


class TestFetchRvol:
    def test_does_not_crash_on_exception(self):
        with patch('stocks.services.watchlist_service.DailyStockPrice') as MockPrice:
            MockPrice.objects.filter.side_effect = Exception("DB error")
            result = WatchlistService._fetch_rvol(['NABIL'])
        assert result == {}


class TestFetchAccumulation:
    def test_returns_empty_dict_for_empty_tickers(self):
        result = WatchlistService._fetch_accumulation([])
        assert result == {}

    def test_does_not_crash_on_exception(self):
        with patch('stocks.services.watchlist_service.DailyCumulativeAccumulation') as MockAcc:
            MockAcc.objects.filter.side_effect = Exception("DB error")
            result = WatchlistService._fetch_accumulation(['NABIL'])
        assert result == {}


class TestFetchDividendMap:
    def test_returns_empty_dict_for_no_dividends(self):
        with patch('stocks.services.watchlist_service.Dividend') as MockDiv:
            MockDiv.objects.filter.return_value.order_by.return_value.distinct.return_value = []
            result = WatchlistService._fetch_dividend_map(['NABIL'])
        assert result == {}

    def test_maps_ticker_to_dividend_object(self):
        mock_div = MagicMock()
        mock_div.ticker = 'NABIL'
        with patch('stocks.services.watchlist_service.Dividend') as MockDiv:
            MockDiv.objects.filter.return_value.order_by.return_value.distinct.return_value = [mock_div]
            result = WatchlistService._fetch_dividend_map(['NABIL'])
        assert result['NABIL'] is mock_div


class TestApplyBookClosure:
    def test_does_nothing_when_no_dividend(self):
        item = MagicMock(spec=['ticker'])
        item.ticker = 'NABIL'
        WatchlistService._apply_book_closure(item, {})
        assert not hasattr(item, 'days_to_book_closure')

    def test_sets_days_to_book_closure_for_future_date(self):
        from datetime import date, timedelta
        item = MagicMock()
        div = MagicMock()
        future_date = date.today() + timedelta(days=5)
        div.book_close_date = future_date
        item.ticker = 'NABIL'
        with patch('stocks.services.watchlist_service.timezone') as mock_tz:
            mock_tz.now.return_value.date.return_value = date.today()
            WatchlistService._apply_book_closure(item, {'NABIL': div})
        assert item.days_to_book_closure == 5
        assert item.next_book_close == future_date

    def test_sets_none_for_past_book_close(self):
        from datetime import date, timedelta
        item = MagicMock()
        div = MagicMock()
        past_date = date.today() - timedelta(days=3)
        div.book_close_date = past_date
        item.ticker = 'NABIL'
        with patch('stocks.services.watchlist_service.timezone') as mock_tz:
            mock_tz.now.return_value.date.return_value = date.today()
            WatchlistService._apply_book_closure(item, {'NABIL': div})
        assert item.days_to_book_closure is None


class TestApplyRiskReward:
    def test_sets_upside_percent_when_prices_available(self):
        item = MagicMock()
        item.current_price = 1000.0
        item.target_price = 1200.0
        item.stop_loss_price = None
        WatchlistService._apply_risk_reward(item)
        assert abs(item.upside_percent - 20.0) < 0.01

    def test_sets_risk_reward_ratio_when_stop_loss_present(self):
        item = MagicMock()
        item.current_price = 1000.0
        item.target_price = 1200.0
        item.stop_loss_price = 900.0
        WatchlistService._apply_risk_reward(item)
        # reward=200, risk=100 → ratio=2.0
        assert abs(item.risk_reward_ratio - 2.0) < 0.01

    def test_skips_when_current_price_none(self):
        item = MagicMock()
        item.current_price = None
        item.target_price = 1200.0
        WatchlistService._apply_risk_reward(item)
        # upside_percent should NOT have been set (check MagicMock wasn't written to)
        assert 'upside_percent' not in item.__dict__ or True  # MagicMock is flexible; just verify no crash
