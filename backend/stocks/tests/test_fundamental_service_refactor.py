"""Tests for FundamentalService health-score helper extraction (SOLID Phase 3b)."""
from unittest.mock import MagicMock
import pytest
from stocks.services.fundamental_service import FundamentalService


def _make_fundamental(**kwargs):
    """Return a MagicMock that looks like a StockFundamental instance."""
    f = MagicMock()
    f.pe_ratio = kwargs.get('pe_ratio', None)
    f.pe_ratio_unaudited = kwargs.get('pe_ratio_unaudited', None)
    f.price_to_book = kwargs.get('price_to_book', None)
    f.ro_equity = kwargs.get('ro_equity', None)
    f.yoy_earnings_growth = kwargs.get('yoy_earnings_growth', None)
    f.debt_to_equity = kwargs.get('debt_to_equity', None)
    return f


class TestScoreValuation:
    def test_returns_50_when_all_none(self):
        fund = _make_fundamental()
        assert FundamentalService._score_valuation(fund) == 50.0

    def test_pe_15_scores_100_pe_half(self):
        # PE=15 → p_score=100; PB missing → 50; val = 100*0.5 + 50*0.5 = 75
        fund = _make_fundamental(pe_ratio=15)
        assert FundamentalService._score_valuation(fund) == 75.0

    def test_pb_1_5_scores_100_pb_half(self):
        # PE missing → 50; PB=1.5 → b_score=100; val = 50*0.5 + 100*0.5 = 75
        fund = _make_fundamental(price_to_book=1.5)
        assert FundamentalService._score_valuation(fund) == 75.0

    def test_clamped_below_zero_for_very_high_pe(self):
        # PE=100 → 100-(100-15)*2.5 = 100-212.5 < 0 → clamped 0; PB missing → 25
        fund = _make_fundamental(pe_ratio=100)
        assert FundamentalService._score_valuation(fund) == 25.0

    def test_both_inputs_combine_correctly(self):
        # PE=15 → 100, PB=1.5 → 100; val = 100*0.5 + 100*0.5 = 100
        fund = _make_fundamental(pe_ratio=15, price_to_book=1.5)
        assert FundamentalService._score_valuation(fund) == 100.0


class TestScoreProfitability:
    def test_returns_50_when_roe_none(self):
        fund = _make_fundamental()
        assert FundamentalService._score_profitability(fund) == 50.0

    def test_roe_5_scores_0(self):
        # (5-5)*6.67 = 0
        fund = _make_fundamental(ro_equity=5)
        assert FundamentalService._score_profitability(fund) == 0.0

    def test_roe_20_scores_100(self):
        # (20-5)*6.67 = 100.05 → clamped 100
        fund = _make_fundamental(ro_equity=20)
        assert FundamentalService._score_profitability(fund) == 100.0

    def test_roe_negative_clamped_to_0(self):
        fund = _make_fundamental(ro_equity=-10)
        assert FundamentalService._score_profitability(fund) == 0.0


class TestScoreGrowth:
    def test_returns_50_when_growth_none(self):
        fund = _make_fundamental()
        assert FundamentalService._score_growth(fund) == 50.0

    def test_growth_25_scores_100(self):
        # 25*4 = 100
        fund = _make_fundamental(yoy_earnings_growth=25)
        assert FundamentalService._score_growth(fund) == 100.0

    def test_growth_negative_clamped_to_0(self):
        fund = _make_fundamental(yoy_earnings_growth=-5)
        assert FundamentalService._score_growth(fund) == 0.0


class TestScoreStability:
    def test_returns_50_when_de_none(self):
        fund = _make_fundamental()
        assert FundamentalService._score_stability(fund) == 50.0

    def test_de_0_5_scores_100(self):
        # 100-(0.5-0.5)*50 = 100
        fund = _make_fundamental(debt_to_equity=0.5)
        assert FundamentalService._score_stability(fund) == 100.0

    def test_de_2_5_scores_0(self):
        # 100-(2.5-0.5)*50 = 100-100 = 0
        fund = _make_fundamental(debt_to_equity=2.5)
        assert FundamentalService._score_stability(fund) == 0.0

    def test_very_high_de_clamped_to_0(self):
        fund = _make_fundamental(debt_to_equity=10)
        assert FundamentalService._score_stability(fund) == 0.0


class TestBuildMetrics:
    def test_returns_none_values_when_all_none(self):
        fund = _make_fundamental()
        result = FundamentalService._build_metrics(fund)
        assert result == {'pe': None, 'pb': None, 'roe': None, 'growth': None, 'de': None}

    def test_returns_float_values_when_present(self):
        fund = _make_fundamental(pe_ratio=15, price_to_book=1.5, ro_equity=20,
                                 yoy_earnings_growth=10, debt_to_equity=0.5)
        result = FundamentalService._build_metrics(fund)
        assert result['pe'] == 15.0
        assert result['pb'] == 1.5
        assert result['roe'] == 20.0
        assert result['growth'] == 10.0
        assert result['de'] == 0.5


class TestCalculateHealthScore:
    def test_returns_none_for_falsy_fundamental(self):
        score, metrics = FundamentalService.calculate_health_score(None)
        assert score is None
        assert metrics == {}

    def test_all_neutral_inputs_score_50(self):
        # All None → each sub-score uses neutral 50
        # val=50*0.4=20, prof=50*0.3=15, growth=50*0.2=10, stab=50*0.1=5 → 50.0
        fund = _make_fundamental()
        score, metrics = FundamentalService.calculate_health_score(fund)
        assert score == 50.0

    def test_all_perfect_inputs_score_100(self):
        fund = _make_fundamental(pe_ratio=15, price_to_book=1.5,
                                 ro_equity=20, yoy_earnings_growth=25,
                                 debt_to_equity=0.5)
        score, metrics = FundamentalService.calculate_health_score(fund)
        assert score == 100.0

    def test_returns_metrics_dict(self):
        fund = _make_fundamental(pe_ratio=20)
        _, metrics = FundamentalService.calculate_health_score(fund)
        assert 'pe' in metrics
        assert metrics['pe'] == 20.0
