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


# ---------------------------------------------------------------------------
# Task 3: confidence block + per-symbol verdicts
# ---------------------------------------------------------------------------
from stocks.services.backtest_harness.evaluate import score_results
from stocks.services.backtest_harness.runner import BacktestResult


def _result(symbol, ret, bh, sortino, dd, trades, wins=None, trade_returns=None):
    wins = trades // 2 if wins is None else wins
    if trade_returns is None:
        trade_returns = [0.02] * wins + [-0.02] * (trades - wins)
    return BacktestResult(symbol=symbol, ok=True, metrics={
        "return_pct": ret, "buy_hold_return_pct": bh, "sortino": sortino,
        "max_drawdown_pct": dd, "num_trades": trades,
        "win_rate_pct": 100.0 * wins / trades if trades else 0.0,
        "wins": wins, "losses": trades - wins, "trade_returns": trade_returns,
    })


def test_confidence_block_present_and_pooled():
    results = [_result(f"S{i}", ret=40, bh=20, sortino=1.5, dd=-10, trades=20) for i in range(10)]
    card = score_results("edge", results)
    c = card.confidence
    assert "win_rate_ci" in c and len(c["win_rate_ci"]) == 2
    assert "win_rate_reportable" in c
    assert c["win_rate_reportable"] is True       # 10*20 = 200 pooled trades
    assert "excess_pvalue" in c and 0.0 <= c["excess_pvalue"] <= 1.0
    assert "total_trades" in c and c["total_trades"] == 200


def test_low_sample_flagged_not_reportable():
    results = [_result(f"S{i}", ret=40, bh=20, sortino=1.5, dd=-10, trades=2) for i in range(5)]
    card = score_results("thin", results)
    assert card.confidence["total_trades"] == 10
    assert card.confidence["win_rate_reportable"] is False


def test_passed_still_only_depends_on_economic_verdicts():
    results = [_result(f"S{i}", ret=40, bh=20, sortino=1.5, dd=-10, trades=20) for i in range(10)]
    card = score_results("edge", results)
    assert card.passed is True
    assert set(card.verdicts.keys()) == {
        "runs_clean", "active", "beats_bh_return",
        "positive_risk_adjusted", "beats_bh_drawdown_adjusted",
    }


def test_per_symbol_verdicts_recorded():
    results = [_result(f"S{i}", ret=40, bh=20, sortino=1.5, dd=-10, trades=20) for i in range(10)]
    card = score_results("edge", results)
    d = card.to_dict()
    assert "symbols" in d and len(d["symbols"]) == 10
    assert "beats_bh" in d["symbols"][0]
