import numpy as np
import pandas as pd
import pytest

from stocks.services.accumulation.score_service import (
    ScoreParams, concentration_factor, coiling_factor, breakout_factor,
)


def _price_df(closes):
    idx = pd.date_range("2021-01-01", periods=len(closes), freq="D")
    c = np.array(closes, dtype=float)
    return pd.DataFrame({"Open": c, "High": c * 1.01, "Low": c * 0.99,
                         "Close": c, "Volume": np.full(len(c), 1000.0)}, index=idx)


def test_concentration_factor_is_top3_share_of_net_buyers_when_rising():
    idx = pd.date_range("2021-01-01", periods=4, freq="D")
    # 3 big buyers (90 of 100 positive net) + a seller (ignored in denominator).
    pivot = pd.DataFrame(
        {"1": [10, 20, 30, 40], "2": [10, 20, 30, 30], "3": [5, 10, 20, 20],
         "4": [1, 1, 1, 1], "5": [-9, -9, -9, -9]}, index=idx)
    top_sum = pivot[["1", "2", "3"]].sum(axis=1)  # strictly rising -> gate open
    f = concentration_factor(pivot, top_sum, lookback=2)
    # last bar: top-3 positive = 40+30+20=90; all positive = 90+1=91 -> ~0.989
    assert f.iloc[-1] == pytest.approx(90 / 91, abs=1e-3)


def test_concentration_factor_zero_when_flow_not_rising():
    idx = pd.date_range("2021-01-01", periods=4, freq="D")
    pivot = pd.DataFrame({"1": [40, 40, 40, 40], "2": [10, 10, 10, 10]}, index=idx)
    top_sum = pivot.sum(axis=1)  # flat -> slope 0, gate closed
    f = concentration_factor(pivot, top_sum, lookback=2)
    assert f.iloc[-1] == 0.0


def test_coiling_factor_high_when_accum_rising_and_price_flat():
    closes = [100.0] * 30  # dead flat -> compressed vol, range-bound
    top_sum = pd.Series(np.arange(30, dtype=float), index=_price_df(closes).index)
    f = coiling_factor(top_sum, _price_df(closes), lookback=20)
    assert f.iloc[-1] > 0.5


def test_breakout_factor_fires_on_new_high():
    closes = [100.0] * 20 + [110.0]  # day 21 breaks the 20-day high
    f = breakout_factor(_price_df(closes), lookback=20)
    assert f.iloc[-1] == 1.0
    assert f.iloc[-2] == 0.0
