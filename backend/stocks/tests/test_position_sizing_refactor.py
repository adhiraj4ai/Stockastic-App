import pytest
from decimal import Decimal
from stocks.services.position_sizing import PositionSizingService


class TestRiskWarning:
    def test_no_warning_below_threshold(self):
        assert PositionSizingService._risk_warning(2.0) == []

    def test_medium_warning_above_3_pct(self):
        result = PositionSizingService._risk_warning(4.0)
        assert len(result) == 1
        assert result[0]["severity"] == "MEDIUM"

    def test_high_warning_above_5_pct(self):
        result = PositionSizingService._risk_warning(6.0)
        assert len(result) == 1
        assert result[0]["severity"] == "HIGH"

    def test_boundary_exactly_5_pct_is_medium(self):
        result = PositionSizingService._risk_warning(5.0)
        assert result[0]["severity"] == "MEDIUM"

    def test_boundary_exactly_3_pct_no_warning(self):
        assert PositionSizingService._risk_warning(3.0) == []


class TestPositionWarning:
    def test_no_warning_below_25_pct(self):
        assert PositionSizingService._position_warning(20.0) == []

    def test_medium_warning_above_25_pct(self):
        result = PositionSizingService._position_warning(30.0)
        assert len(result) == 1
        assert result[0]["severity"] == "MEDIUM"

    def test_high_warning_above_50_pct(self):
        result = PositionSizingService._position_warning(55.0)
        assert len(result) == 1
        assert result[0]["severity"] == "HIGH"

    def test_boundary_exactly_50_pct_is_medium(self):
        result = PositionSizingService._position_warning(50.0)
        assert result[0]["severity"] == "MEDIUM"


class TestSharesWarning:
    def test_critical_when_zero_shares(self):
        result = PositionSizingService._shares_warning(0)
        assert len(result) == 1
        assert result[0]["severity"] == "HIGH"
        assert result[0]["type"] == "INSUFFICIENT_CAPITAL"

    def test_low_warning_when_fewer_than_10(self):
        result = PositionSizingService._shares_warning(5)
        assert len(result) == 1
        assert result[0]["severity"] == "LOW"
        assert result[0]["type"] == "LOW_SHARES"

    def test_no_warning_when_10_or_more(self):
        assert PositionSizingService._shares_warning(10) == []

    def test_no_warning_for_large_share_count(self):
        assert PositionSizingService._shares_warning(500) == []


class TestLeverageWarning:
    def test_critical_when_investment_exceeds_balance(self):
        result = PositionSizingService._leverage_warning(
            total_investment=Decimal("120000"),
            account_balance=Decimal("100000"),
        )
        assert len(result) == 1
        assert result[0]["severity"] == "CRITICAL"
        assert result[0]["type"] == "OVER_LEVERAGE"

    def test_no_warning_when_investment_equals_balance(self):
        assert PositionSizingService._leverage_warning(
            Decimal("100000"), Decimal("100000")
        ) == []

    def test_no_warning_when_investment_below_balance(self):
        assert PositionSizingService._leverage_warning(
            Decimal("80000"), Decimal("100000")
        ) == []


class TestGenerateWarningsDelegates:
    def test_combines_all_four_helpers(self):
        result = PositionSizingService._generate_warnings(
            risk_percentage=6.0,
            position_size_percentage=10.0,
            max_shares=0,
            total_investment=Decimal("0"),
            account_balance=Decimal("100000"),
        )
        severities = {w["severity"] for w in result}
        assert "HIGH" in severities
