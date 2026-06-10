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


import pandas as pd

from stocks.services.backtest_harness.runner import run_backtest

_BH_CODE = """
from backtesting import Strategy

class HoldStrategy(Strategy):
    def init(self):
        pass

    def next(self):
        if not self.position:
            self.buy()
"""


def _flat_df(n=30, price=100.0):
    idx = pd.date_range("2025-01-01", periods=n, freq="D")
    return pd.DataFrame(
        {"Open": price, "High": price, "Low": price, "Close": price,
         "Volume": 10_000.0},
        index=idx,
    )


def test_runner_applies_real_fees_by_default():
    # Flat price: a buy-and-hold strategy's loss == round-trip cost... but the
    # position is still open at the end, so loss == entry-side cost + spread.
    # With the old flat commission=0.002 the loss would be ~0.2%; with the
    # NEPSE model on a ~Rs 1M position it must exceed 0.27% + 0.015%.
    res = run_backtest(_BH_CODE, "TEST", df=_flat_df())
    assert res.ok, res.error
    # On a perfectly flat series, buy & hold returns 0% before costs, so any
    # non-trivial loss is the fee-bearing entry itself. The old flat 0.002
    # commission loses ~0.2%; the NEPSE model (≈0.31% tier + 0.015% SEBON +
    # 10bps spread on a ~Rs 1M position) must exceed 0.28%. This single check
    # proves the real cost model is wired in. (num_trades/exposure read 0 here
    # because the position never closes — backtesting.py counts closed trades.)
    assert res.metrics["return_pct"] <= -0.28


def test_runner_accepts_float_commission_override():
    res = run_backtest(_BH_CODE, "TEST", df=_flat_df(), commission=0.0, spread=0.0)
    assert res.ok, res.error
    assert abs(res.metrics["return_pct"]) < 1e-6
