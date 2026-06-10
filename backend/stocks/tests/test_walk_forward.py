# backend/stocks/tests/test_walk_forward.py
"""Anchored in-sample/out-of-sample split in optimization."""
import numpy as np
import pandas as pd

from stocks.services.optimization_service import OptimizationService, OOS_FRACTION


def _series(n=400):
    idx = pd.date_range("2023-01-01", periods=n, freq="D")
    base = 100 + 15 * np.sin(np.linspace(0, 16, n)) + np.linspace(0, 10, n)
    return pd.DataFrame(
        {"open": base, "high": base + 1, "low": base - 1, "close": base, "volume": 1000.0},
        index=idx,
    )


def test_anchored_split_helper_partitions_by_fraction():
    df = _series(400)
    is_df, oos_df = OptimizationService.anchored_split(df, OOS_FRACTION)
    assert len(is_df) + len(oos_df) == len(df)
    assert is_df.index.max() < oos_df.index.min()
    assert abs(len(oos_df) / len(df) - OOS_FRACTION) < 0.02


def test_oos_fraction_is_sane_default():
    assert 0.2 <= OOS_FRACTION <= 0.4
