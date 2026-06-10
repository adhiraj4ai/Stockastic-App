# backend/stocks/tests/test_confidence_scorecard.py
"""Per-trade capture and scorecard confidence block."""
import pandas as pd

from stocks.services.backtest_harness.runner import run_backtest

_CROSS_CODE = """
from backtesting import Strategy
from backtesting.lib import crossover
from backtesting.test import SMA

class Cross(Strategy):
    def init(self):
        self.f = self.I(SMA, self.data.Close, 5)
        self.s = self.I(SMA, self.data.Close, 20)
    def next(self):
        if crossover(self.f, self.s):
            self.buy()
        elif crossover(self.s, self.f):
            self.position.close()
"""


def _wave_df(n=200):
    import numpy as np
    idx = pd.date_range("2024-01-01", periods=n, freq="D")
    base = 100 + 20 * np.sin(np.linspace(0, 12, n))  # repeated swings → many closed trades
    return pd.DataFrame(
        {"Open": base, "High": base + 1, "Low": base - 1, "Close": base,
         "Volume": 10_000.0}, index=idx,
    )


def test_metrics_capture_per_trade_outcomes():
    res = run_backtest(_CROSS_CODE, "TEST", df=_wave_df(), commission=0.0, spread=0.0)
    assert res.ok, res.error
    m = res.metrics
    assert "wins" in m and "losses" in m and "trade_returns" in m
    assert m["wins"] + m["losses"] == m["num_trades"]
    assert isinstance(m["trade_returns"], list)
    assert len(m["trade_returns"]) == m["num_trades"]


def test_zero_trade_run_has_empty_trade_fields():
    flat = pd.DataFrame(
        {"Open": 100.0, "High": 100.0, "Low": 100.0, "Close": 100.0, "Volume": 1000.0},
        index=pd.date_range("2024-01-01", periods=30, freq="D"),
    )
    never_code = "from backtesting import Strategy\nclass N(Strategy):\n    def init(self): pass\n    def next(self): pass\n"
    res = run_backtest(never_code, "TEST", df=flat, commission=0.0, spread=0.0)
    assert res.ok, res.error
    assert res.metrics["wins"] == 0 and res.metrics["losses"] == 0
    assert res.metrics["trade_returns"] == []
