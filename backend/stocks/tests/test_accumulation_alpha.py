import numpy as np
import pandas as pd
import pytest
from backtesting import Backtest

from stocks.models import DailyCumulativeAccumulation
from stocks.services.strategy_framework import build_strategy
from stocks.services.strategy_framework import library as L
from stocks.services.strategy_framework.registry import REGISTRY


ENTRY_BARS = 30
DISTRIBUTION_START = 45


def _seed_buy_then_distribute(symbol, dates):
    """Broker accumulates for ENTRY_BARS bars then distributes to trigger flip exit."""
    for i, d in enumerate(dates):
        net = i + 1 if i < DISTRIBUTION_START else DISTRIBUTION_START - (i - DISTRIBUTION_START)
        DailyCumulativeAccumulation.objects.create(
            symbol=symbol, transaction_date=d.date(), entity_id="1",
            cumulative_buy=max(net, 0), cumulative_sell=0, cumulative_buy_amount=0,
            cumulative_sell_amount=0, cumulative_net=max(net, 0))


def _coiling_then_breakout_df(n=60):
    idx = pd.date_range("2021-01-01", periods=n, freq="D")
    closes = np.concatenate([np.full(n - 5, 100.0), np.linspace(101, 140, 5)])
    return pd.DataFrame({"Open": closes, "High": closes * 1.01, "Low": closes * 0.99,
                         "Close": closes, "Volume": np.full(n, 5000.0)}, index=idx)


@pytest.mark.django_db
def test_accumulation_strength_alpha_trades_on_setup():
    df = _coiling_then_breakout_df()
    _seed_buy_then_distribute("AAA", df.index)
    strat = build_strategy(alpha=L.AccumulationStrength(symbol="AAA", entry_threshold=30),
                           name="AccTest")
    stats = Backtest(df, strat, cash=1_000_000, commission=.002,
                     exclusive_orders=True).run()
    assert stats["# Trades"] > 0


def test_accumulation_strength_is_registered():
    assert "AccumulationStrength" in REGISTRY
    assert REGISTRY["AccumulationStrength"]["needs_symbol"] is True
