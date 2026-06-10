# backend/stocks/tests/test_backtest_fees.py
"""NEPSE fee model used by the backtest harness."""
from decimal import Decimal

from stocks.services.backtest_harness.fees import nepse_commission, total_cost_rate
from stocks.utils import calculate_broker_commission, calculate_sebon_fee


def test_small_trade_uses_top_tier():
    # 100 shares @ 400 = Rs 40,000 -> 0.36% + 0.015% + Rs 25
    cost = nepse_commission(100, 400.0)
    expected = 40_000 * (0.0036 + 0.00015) + 25.0
    assert abs(cost - expected) < 0.01


def test_large_trade_uses_low_tier():
    # 30,000 shares @ 400 = Rs 12,000,000 -> 0.24% tier
    cost = nepse_commission(30_000, 400.0)
    expected = 12_000_000 * (0.0024 + 0.00015) + 25.0
    assert abs(cost - expected) < 0.01


def test_sell_side_negative_size_same_cost():
    assert nepse_commission(-100, 400.0) == nepse_commission(100, 400.0)


def test_matches_portfolio_layer_math():
    # The harness float math must agree with the Decimal portfolio math
    # (within a paisa) so backtests and real P&L never disagree on fees.
    for amount in (10_000, 50_000, 50_001, 500_000, 2_000_000, 10_000_001):
        size, price = amount / 100.0, 100.0
        harness = nepse_commission(size, price)
        portfolio = float(
            calculate_broker_commission(amount) + calculate_sebon_fee(amount) + Decimal("25")
        )
        assert abs(harness - portfolio) < 0.01, f"drift at amount={amount}"


def test_total_cost_rate_for_reporting():
    # Effective per-side rate on a Rs 100,000 trade: 0.33% + 0.015% + 25/100000
    rate = total_cost_rate(100_000)
    assert abs(rate - (0.0033 + 0.00015 + 0.00025)) < 1e-9


def test_non_positive_amount_is_zero_cost():
    # A zero or degenerate order must not invent a Rs 25 DP charge out of nothing.
    assert nepse_commission(0, 100.0) == 0.0
    assert nepse_commission(100, 0.0) == 0.0
    assert total_cost_rate(0) == 0.0
    assert total_cost_rate(-5) == 0.0
