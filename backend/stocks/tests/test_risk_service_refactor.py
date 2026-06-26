"""Tests for RiskAnalysisService helper extraction (SOLID Phase 3b)."""
from decimal import Decimal
from unittest.mock import MagicMock, patch
import pytest
from stocks.services.risk_service import RiskAnalysisService


def _make_holding(ticker='NABIL', quantity=100, value=Decimal('50000'), sector='Banking'):
    return {'ticker': ticker, 'quantity': quantity, 'value': value, 'sector': sector}


class TestFetchPriceMap:
    def test_returns_empty_dict_for_no_tickers(self):
        with patch('stocks.services.risk_service.DailyStockPrice') as MockPrice:
            MockPrice.objects.filter.return_value.order_by.return_value.distinct.return_value = []
            result = RiskAnalysisService._fetch_price_map([])
        assert result == {}

    def test_maps_ticker_to_decimal_close(self):
        mock_row = MagicMock()
        mock_row.ticker = 'NABIL'
        mock_row.close = '1500.00'
        with patch('stocks.services.risk_service.DailyStockPrice') as MockPrice:
            MockPrice.objects.filter.return_value.order_by.return_value.distinct.return_value = [mock_row]
            result = RiskAnalysisService._fetch_price_map(['NABIL'])
        assert result == {'NABIL': Decimal('1500.00')}


class TestFetchSectorMap:
    def test_returns_empty_for_no_companies(self):
        with patch('stocks.services.risk_service.Company') as MockCompany:
            MockCompany.objects.filter.return_value = []
            result = RiskAnalysisService._fetch_sector_map(['NABIL'])
        assert result == {}

    def test_maps_symbol_to_sector(self):
        mock_co = MagicMock()
        mock_co.symbol = 'NABIL'
        mock_co.sector = 'Banking'
        with patch('stocks.services.risk_service.Company') as MockCompany:
            MockCompany.objects.filter.return_value = [mock_co]
            result = RiskAnalysisService._fetch_sector_map(['NABIL'])
        assert result == {'NABIL': 'Banking'}

    def test_uses_unknown_when_sector_none(self):
        mock_co = MagicMock()
        mock_co.symbol = 'XYZ'
        mock_co.sector = None
        with patch('stocks.services.risk_service.Company') as MockCompany:
            MockCompany.objects.filter.return_value = [mock_co]
            result = RiskAnalysisService._fetch_sector_map(['XYZ'])
        assert result == {'XYZ': 'Unknown'}


class TestBuildHoldings:
    def test_returns_empty_triple_for_empty_queryset(self):
        holdings, total, sectors = RiskAnalysisService._build_holdings([], {}, {})
        assert holdings == []
        assert total == Decimal('0')
        assert sectors == {}

    def test_computes_value_from_price_map(self):
        item = MagicMock()
        item.ticker = 'NABIL'
        item.quantity = 10
        item.buy_price = Decimal('1400.00')
        price_map = {'NABIL': Decimal('1500.00')}
        sector_map = {'NABIL': 'Banking'}
        holdings, total, sectors = RiskAnalysisService._build_holdings([item], price_map, sector_map)
        assert len(holdings) == 1
        assert holdings[0]['value'] == Decimal('15000.00')
        assert total == Decimal('15000.00')
        assert sectors == {'Banking': Decimal('15000.00')}

    def test_falls_back_to_buy_price_when_not_in_price_map(self):
        item = MagicMock()
        item.ticker = 'UNKNOWN'
        item.quantity = 5
        item.buy_price = Decimal('200.00')
        holdings, total, _ = RiskAnalysisService._build_holdings([item], {}, {})
        assert holdings[0]['value'] == Decimal('1000.00')


class TestScoreConcentration:
    def test_low_concentration_no_alerts(self):
        holdings = [_make_holding(value=Decimal('10000'))]
        total = Decimal('100000')
        sector_values = {'Banking': Decimal('10000')}
        score, max_weight, alerts = RiskAnalysisService._score_concentration(
            holdings, total, sector_values
        )
        assert score == 1.0
        assert alerts == []

    def test_high_stock_concentration_triggers_high_alert(self):
        holdings = [_make_holding(value=Decimal('35000'))]
        total = Decimal('100000')
        sector_values = {'Banking': Decimal('35000')}
        score, max_weight, alerts = RiskAnalysisService._score_concentration(
            holdings, total, sector_values
        )
        concentration_alerts = [a for a in alerts if a['type'] == 'CONCENTRATION']
        assert len(concentration_alerts) == 1
        assert concentration_alerts[0]['level'] == 'HIGH'

    def test_medium_stock_concentration_triggers_medium_alert(self):
        holdings = [_make_holding(value=Decimal('25000'))]
        total = Decimal('100000')
        sector_values = {'Banking': Decimal('25000')}
        _, _, alerts = RiskAnalysisService._score_concentration(holdings, total, sector_values)
        concentration_alerts = [a for a in alerts if a['type'] == 'CONCENTRATION']
        assert concentration_alerts[0]['level'] == 'MEDIUM'

    def test_sector_risk_alert_when_sector_exceeds_30_pct(self):
        holdings = [_make_holding(value=Decimal('40000'))]
        total = Decimal('100000')
        sector_values = {'Banking': Decimal('40000')}
        _, _, alerts = RiskAnalysisService._score_concentration(holdings, total, sector_values)
        sector_alerts = [a for a in alerts if a['type'] == 'SECTOR_RISK']
        assert len(sector_alerts) == 1

    def test_no_sector_alert_below_30_pct(self):
        holdings = [_make_holding(value=Decimal('29000'))]
        total = Decimal('100000')
        sector_values = {'Banking': Decimal('29000')}
        _, _, alerts = RiskAnalysisService._score_concentration(holdings, total, sector_values)
        sector_alerts = [a for a in alerts if a['type'] == 'SECTOR_RISK']
        assert sector_alerts == []


_DUMMY_MARKET_RISK = {"portfolio_beta": 1.0, "window": 180}


class TestBuildResponse:
    def test_response_has_required_keys(self):
        holdings = [_make_holding()]
        result = RiskAnalysisService._build_response(
            holdings, Decimal('50000'), 3.0, 2.0, 5.0, 5.0, [], _DUMMY_MARKET_RISK
        )
        assert 'radar_data' in result
        assert 'alerts' in result
        assert 'holdings_metrics' in result
        assert 'summary' in result
        assert 'market_risk' in result

    def test_risk_level_low_when_scores_low(self):
        result = RiskAnalysisService._build_response(
            [], Decimal('50000'), 1.0, 1.0, 1.0, 5.0, [], _DUMMY_MARKET_RISK
        )
        assert result['summary']['risk_level'] == 'LOW'

    def test_risk_level_high_when_concentration_high(self):
        result = RiskAnalysisService._build_response(
            [], Decimal('50000'), 8.0, 1.0, 1.0, 5.0, [], _DUMMY_MARKET_RISK
        )
        assert result['summary']['risk_level'] == 'HIGH'
