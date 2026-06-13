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


class TestComputeCore:
    def test_basic_computation(self):
        balance = Decimal("100000")
        risk_pct = Decimal("2")
        entry = Decimal("500")
        stop_loss = Decimal("450")
        risk_amount, risk_per_share, max_shares, total_investment, max_loss, pos_pct = (
            PositionSizingService._compute_core(balance, risk_pct, entry, stop_loss)
        )
        assert risk_amount == Decimal("2000")
        assert risk_per_share == Decimal("50")
        assert max_shares == 40
        assert total_investment == Decimal("20000")
        assert max_loss == Decimal("2000")
        assert pos_pct == Decimal("20")

    def test_returns_six_tuple(self):
        result = PositionSizingService._compute_core(
            Decimal("50000"), Decimal("1"), Decimal("200"), Decimal("180")
        )
        assert len(result) == 6


class TestAppendRrFields:
    def test_adds_rr_keys_to_result(self):
        result = {
            "entry_price": 500.0,
            "stop_loss_price": 450.0,
            "warnings": [],
        }
        PositionSizingService._append_rr_fields(
            result,
            target_price=Decimal("600"),
            entry=Decimal("500"),
            risk_per_share=Decimal("50"),
            max_shares=40,
            warnings=result["warnings"],
        )
        assert "reward_per_share" in result
        assert "risk_reward_ratio" in result
        assert "potential_profit" in result
        assert result["risk_reward_ratio"] == pytest.approx(2.0)

    def test_appends_poor_rr_warning_when_ratio_below_1_5(self):
        result = {"warnings": []}
        warnings = result["warnings"]
        PositionSizingService._append_rr_fields(
            result,
            target_price=Decimal("520"),
            entry=Decimal("500"),
            risk_per_share=Decimal("50"),
            max_shares=10,
            warnings=warnings,
        )
        types = [w["type"] for w in warnings]
        assert "POOR_RISK_REWARD" in types

    def test_no_poor_rr_warning_when_ratio_above_1_5(self):
        result = {"warnings": []}
        warnings = result["warnings"]
        PositionSizingService._append_rr_fields(
            result,
            target_price=Decimal("600"),
            entry=Decimal("500"),
            risk_per_share=Decimal("50"),
            max_shares=40,
            warnings=warnings,
        )
        types = [w["type"] for w in warnings]
        assert "POOR_RISK_REWARD" not in types


class TestCalculatePositionSizeIntegration:
    def test_returns_expected_keys(self):
        result = PositionSizingService.calculate_position_size(
            account_balance=100000,
            risk_percentage=2,
            entry_price=500,
            stop_loss_price=450,
        )
        expected_keys = {
            "max_shares", "total_investment", "risk_amount", "max_loss_if_stopped",
            "risk_per_share", "position_size_percentage", "warnings",
            "account_balance", "risk_percentage", "entry_price", "stop_loss_price",
        }
        assert expected_keys.issubset(result.keys())

    def test_includes_rr_fields_when_target_provided(self):
        result = PositionSizingService.calculate_position_size(
            account_balance=100000,
            risk_percentage=2,
            entry_price=500,
            stop_loss_price=450,
            target_price=600,
        )
        assert "risk_reward_ratio" in result
        assert "potential_profit" in result

    def test_no_rr_fields_when_target_omitted(self):
        result = PositionSizingService.calculate_position_size(
            account_balance=100000,
            risk_percentage=2,
            entry_price=500,
            stop_loss_price=450,
        )
        assert "risk_reward_ratio" not in result
