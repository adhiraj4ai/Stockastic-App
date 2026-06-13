"""Tests for the composable strategy framework.

The key regression here is the indicator-slicing contract: backtesting.py only
slices indicators it finds in strategy.__dict__, so framework components MUST store
their indicators as strategy attributes. If that breaks, composed strategies silently
stop trading (every bar reads the final indicator value) — these tests catch that.
"""

import numpy as np
import pandas as pd

from stocks.services.backtest_harness.runner import run_backtest
from stocks.services.strategy_framework import build_strategy, alphas, regimes, stops, exits


def _trending_df(n=400, seed=1):
    rng = np.random.RandomState(seed)
    # Upward drift with pullbacks so both trend and mean-reversion alphas can fire.
    rets = rng.normal(0.0015, 0.02, n)
    close = 100 * np.cumprod(1 + rets)
    idx = pd.date_range("2020-01-01", periods=n, freq="D")
    high = close * (1 + np.abs(rng.normal(0, 0.006, n)))
    low = close * (1 - np.abs(rng.normal(0, 0.006, n)))
    open_ = close * (1 + rng.normal(0, 0.003, n))
    vol = rng.randint(1000, 50000, n).astype(float)
    return pd.DataFrame({"Open": open_, "High": high, "Low": low, "Close": close, "Volume": vol}, index=idx)


def _run(strategy_cls, df):
    # run_backtest accepts a Strategy class indirectly via code; here we exercise the
    # compiled class directly through a tiny shim that mirrors the harness runner.
    from backtesting import Backtest
    bt = Backtest(df, strategy_cls, cash=1_000_000, commission=.002, exclusive_orders=True)
    return bt.run()


def test_compose_trend_follower_trades():
    s = build_strategy(alpha=alphas.SmaCross(20, 50), regime=regimes.AboveEMA(100),
                       stop=stops.AtrTrail(multiplier=3.0), name="SmaTrend")
    stats = _run(s, _trending_df())
    assert stats["# Trades"] > 0  # would be 0 if indicators weren't sliced per-bar


def test_compose_mean_reverter_trades():
    s = build_strategy(alpha=alphas.RsiOversold(14, 40, 70), regime=regimes.AboveEMA(100),
                       stop=stops.FixedAtr(multiplier=6.0), name="RsiDip")
    stats = _run(s, _trending_df())
    assert stats["# Trades"] > 0


def test_indicator_is_sliced_per_bar():
    """Direct regression for the slicing bug: the alpha must see a GROWING view, not
    the full array, inside next()."""
    a = alphas.SmaCross(5, 10)
    base = build_strategy(alpha=a, name="Probe")
    seen_lengths = []

    class Probe(base):
        def next(self):
            seen_lengths.append(len(a._get(self, "fast")))
            super().next()

    _run(Probe, _trending_df(n=120))
    # If sliced correctly the lengths grow (…,118,119,120); if not they'd all equal 120.
    assert seen_lengths[0] < seen_lengths[-1]
    assert len(set(seen_lengths)) > 1


def test_regime_and_composition():
    r = regimes.AboveEMA(50) & regimes.AdxAbove(10, 14)
    s = build_strategy(alpha=alphas.DonchianBreakout(20, 10), regime=r,
                       stop=stops.AtrTrail(), exit=exits.TrendBreak(50), name="DonchianGated")
    stats = _run(s, _trending_df())
    assert stats["# Trades"] >= 0  # runs cleanly with a compound regime + explicit exit


def test_params_become_class_attributes():
    s = build_strategy(alpha=alphas.SmaCross(20, 50), name="P", fast=20, slow=50)
    assert s.fast == 20 and s.slow == 50  # so the existing regex optimizer can tune them
