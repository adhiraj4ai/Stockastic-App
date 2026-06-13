"""Unit tests for the backtest harness (Phase 0).

Covers the pure pieces (metric normalization, acceptance scorecard, scope
building / strategy execution) without needing the populated production DB.
"""

import numpy as np
import pandas as pd
import pytest

from stocks.services.backtest_harness import (
    build_strategy_scope,
    extract_strategy_class,
    resolve_code,
    run_backtest,
    normalize_metrics,
    score_results,
    BacktestResult,
)
from stocks.services.backtest_harness.scope import SPECIAL_CODE_SOURCES


# --------------------------------------------------------------------------- #
# Fixtures
# --------------------------------------------------------------------------- #
def _synthetic_df(n=300, seed=0):
    """Deterministic upward-drifting OHLCV series — no DB required."""
    rng = np.random.RandomState(seed)
    rets = rng.normal(0.001, 0.02, n)
    close = 100 * np.cumprod(1 + rets)
    idx = pd.date_range("2020-01-01", periods=n, freq="D")
    high = close * (1 + np.abs(rng.normal(0, 0.005, n)))
    low = close * (1 - np.abs(rng.normal(0, 0.005, n)))
    open_ = close * (1 + rng.normal(0, 0.003, n))
    vol = rng.randint(1000, 100000, n).astype(float)
    return pd.DataFrame(
        {"Open": open_, "High": high, "Low": low, "Close": close, "Volume": vol}, index=idx
    )


SMA_CROSS_CODE = """
from backtesting import Strategy
from backtesting.test import SMA

class SmaCross(Strategy):
    n1 = 10
    n2 = 30
    def init(self):
        self.f = self.I(SMA, self.data.Close, self.n1)
        self.s = self.I(SMA, self.data.Close, self.n2)
    def next(self):
        if self.f[-1] > self.s[-1] and not self.position:
            self.buy()
        elif self.f[-1] < self.s[-1] and self.position:
            self.position.close()
"""


def _result(symbol, ret, bh, sharpe, dd, trades, sortino=None):
    # The acceptance gate uses Sortino; default it to the sign of `sharpe` so
    # existing call sites that pass a positive/negative sharpe keep their intent.
    if sortino is None:
        sortino = 1.0 if sharpe > 0 else (-1.0 if sharpe < 0 else 0.0)
    return BacktestResult(
        symbol=symbol, ok=True,
        metrics={
            "return_pct": ret, "buy_hold_return_pct": bh, "sharpe": sharpe,
            "sortino": sortino, "calmar": 0.0, "max_drawdown_pct": dd,
            "win_rate_pct": 50.0, "num_trades": trades, "exposure_pct": 50.0,
            "profit_factor": 1.5, "ann_return_pct": ret / 3,
        },
    )


# --------------------------------------------------------------------------- #
# normalize_metrics
# --------------------------------------------------------------------------- #
def test_normalize_metrics_maps_keys():
    stats = pd.Series({
        "Return [%]": 42.0, "Buy & Hold Return [%]": 30.0, "Sharpe Ratio": 1.2,
        "Sortino Ratio": 1.8, "Calmar Ratio": 0.9, "Max. Drawdown [%]": -15.0,
        "Win Rate [%]": 55.0, "# Trades": 12, "Exposure Time [%]": 60.0,
        "Profit Factor": 2.1, "Return (Ann.) [%]": 14.0,
    })
    m = normalize_metrics(stats)
    assert m["return_pct"] == 42.0
    assert m["buy_hold_return_pct"] == 30.0
    assert m["num_trades"] == 12
    assert isinstance(m["num_trades"], int)


def test_normalize_metrics_coerces_nan_and_missing():
    stats = pd.Series({"Return [%]": np.nan, "Sharpe Ratio": np.inf})
    m = normalize_metrics(stats)
    assert m["return_pct"] == 0.0
    assert m["sharpe"] == 0.0
    assert m["buy_hold_return_pct"] == 0.0  # missing key -> default


# --------------------------------------------------------------------------- #
# score_results acceptance rule
# --------------------------------------------------------------------------- #
def test_scorecard_passes_when_beating_buy_and_hold():
    results = [_result(f"S{i}", ret=40, bh=20, sharpe=1.5, dd=-10, trades=8) for i in range(10)]
    card = score_results("good", results)
    assert card.passed is True
    assert all(card.verdicts.values())
    assert card.aggregates["median_excess_return_pct"] == 20.0


def test_scorecard_fails_when_not_beating_buy_and_hold():
    results = [_result(f"S{i}", ret=10, bh=30, sharpe=0.5, dd=-10, trades=8) for i in range(10)]
    card = score_results("laggard", results)
    assert card.passed is False
    assert card.verdicts["beats_bh_return"] is False


def test_scorecard_fails_when_degenerate_trade_count():
    # Beats B&H on return but only trades on a couple of symbols.
    results = [_result(f"S{i}", ret=40, bh=20, sharpe=1.5, dd=-10, trades=0) for i in range(8)]
    results += [_result(f"S{i}", ret=40, bh=20, sharpe=1.5, dd=-10, trades=8) for i in range(2)]
    card = score_results("inactive", results)
    assert card.verdicts["active"] is False
    assert card.passed is False


def test_scorecard_fails_when_a_symbol_errors():
    results = [_result(f"S{i}", ret=40, bh=20, sharpe=1.5, dd=-10, trades=8) for i in range(9)]
    results.append(BacktestResult(symbol="BROKEN", ok=False, error="boom"))
    card = score_results("partly_broken", results)
    assert card.verdicts["runs_clean"] is False
    assert card.passed is False
    assert ("BROKEN", "boom") in card.errors


def test_scorecard_all_errors():
    results = [BacktestResult(symbol=f"S{i}", ok=False, error="boom") for i in range(5)]
    card = score_results("all_broken", results)
    assert card.passed is False
    assert card.aggregates["symbols_ok"] == 0


# --------------------------------------------------------------------------- #
# scope / execution
# --------------------------------------------------------------------------- #
def test_build_scope_has_expected_keys():
    scope = build_strategy_scope("NABIL")
    for key in ("Strategy", "Backtest", "crossover", "SMA", "ta", "talib", "np", "pd", "symbol"):
        assert key in scope
    assert scope["symbol"] == "NABIL"


def test_extract_strategy_class_finds_subclass():
    scope = build_strategy_scope("NABIL")
    exec(SMA_CROSS_CODE, scope)
    cls = extract_strategy_class(scope)
    assert cls is not None
    assert cls.__name__ == "SmaCross"


def test_extract_strategy_class_none_when_absent():
    scope = build_strategy_scope("NABIL")
    exec("x = 1", scope)
    assert extract_strategy_class(scope) is None


def test_run_backtest_on_synthetic_df():
    res = run_backtest(SMA_CROSS_CODE, "SYNTH", df=_synthetic_df())
    assert res.ok is True
    assert "return_pct" in res.metrics
    assert "buy_hold_return_pct" in res.metrics
    assert res.excess_return is not None


def test_run_backtest_reports_error_on_broken_code():
    res = run_backtest("this is not python", "SYNTH", df=_synthetic_df())
    assert res.ok is False
    assert res.error


def test_run_backtest_reports_error_when_no_strategy_class():
    res = run_backtest("y = 2 + 2", "SYNTH", df=_synthetic_df())
    assert res.ok is False
    assert "No Strategy subclass" in res.error


def test_run_backtest_insufficient_data():
    res = run_backtest(SMA_CROSS_CODE, "SYNTH", df=_synthetic_df(n=5))
    assert res.ok is False
    assert "Insufficient data" in res.error


# --------------------------------------------------------------------------- #
# resolve_code
# --------------------------------------------------------------------------- #
def test_resolve_code_special_tokens():
    for token in SPECIAL_CODE_SOURCES:
        assert "class " in resolve_code(token)
    # ichimoku token may carry a suffix
    assert "IchimokuAccumulation" in resolve_code("ichimoku_accumulation_v1(foo=1)")


def test_resolve_code_passthrough():
    assert resolve_code(SMA_CROSS_CODE) == SMA_CROSS_CODE
