import pytest
import numpy as np
import pandas as pd
from unittest.mock import patch
from stocks.services.analogs import (
    intensity_bucket, rsi_band, compute_rsi, forward_return_stats, analog_stats,
)


class TestBuckets:
    def test_intensity_bucket(self):
        assert intensity_bucket(15.0) == "STRONG"
        assert intensity_bucket(5.0) == "MILD"
        assert intensity_bucket(0.0) == "FLAT"
        assert intensity_bucket(-7.0) == "NEG"

    def test_rsi_band(self):
        assert rsi_band(25.0) == "OVERSOLD"
        assert rsi_band(45.0) == "LOW"
        assert rsi_band(60.0) == "HIGH"
        assert rsi_band(75.0) == "OVERBOUGHT"


class TestComputeRsi:
    def test_all_gains_is_100(self):
        closes = pd.Series(np.arange(1.0, 31.0))
        rsi = compute_rsi(closes, period=14)
        assert rsi.iloc[-1] == pytest.approx(100.0)


class TestForwardReturnStats:
    def test_medians_and_winrate(self):
        closes = pd.Series([100.0, 102, 104, 106, 108, 110, 112, 114, 116, 118, 120],
                           index=pd.RangeIndex(11))
        # match days at positions 0 and 2
        stats = forward_return_stats(closes, match_positions=[0, 2], min_matches=2)
        assert stats["n"] == 2
        assert stats["fwd_1d_median_pct"] == pytest.approx(2.0, abs=0.1)
        assert stats["win_rate_3d"] == 1.0

    def test_none_when_fewer_than_five_matches(self):
        closes = pd.Series([100.0] * 20)
        assert forward_return_stats(closes, match_positions=[1, 2, 3]) is None


@pytest.mark.django_db
class TestAnalogStats:
    @patch("stocks.services.analogs._load_price_df", return_value=pd.DataFrame())
    def test_returns_none_with_no_history(self, _mock):
        assert analog_stats("NOSUCH") is None
