# backend/stocks/tests/test_corporate_actions.py
"""Corporate-action adjustment-factor math and DataFrame application."""
import pandas as pd
import pytest

from stocks.services.backtest_harness.adjustments import (
    apply_adjustments,
    bonus_adjustment_factor,
    rights_adjustment_factor,
)


def test_bonus_factor_20_percent():
    # 20% bonus: price drops to 1/1.2 of cum price.
    assert bonus_adjustment_factor(20) == pytest.approx(1 / 1.2)


def test_bonus_factor_zero_is_identity():
    assert bonus_adjustment_factor(0) == pytest.approx(1.0)


def test_rights_factor():
    # 50% rights at issue price 100, cum close 400:
    # TERP = (400 + 0.5*100) / 1.5 = 300 -> factor 0.75
    assert rights_adjustment_factor(50, 100, 400) == pytest.approx(0.75)


def test_rights_factor_guard_on_bad_close():
    assert rights_adjustment_factor(50, 100, 0) == pytest.approx(1.0)


def _df():
    idx = pd.date_range("2025-01-01", periods=4, freq="D")
    return pd.DataFrame(
        {"Open": [120.0, 120.0, 100.0, 100.0],
         "High": [121.0, 121.0, 101.0, 101.0],
         "Low": [119.0, 119.0, 99.0, 99.0],
         "Close": [120.0, 120.0, 100.0, 100.0],
         "Volume": [1000.0, 1000.0, 1200.0, 1200.0]},
        index=idx,
    )


def test_apply_adjustments_scales_prices_before_ex_date_only():
    # 20% bonus with ex-date 2025-01-03: bars on Jan 1-2 scale by 1/1.2;
    # Jan 3-4 untouched. Volume scales inversely to conserve turnover.
    out = apply_adjustments(_df(), [(pd.Timestamp("2025-01-03").date(), 1 / 1.2)])
    assert out["Close"].iloc[0] == pytest.approx(100.0)
    assert out["Open"].iloc[1] == pytest.approx(100.0)
    assert out["Close"].iloc[2] == pytest.approx(100.0)   # untouched
    assert out["Close"].iloc[3] == pytest.approx(100.0)   # untouched
    assert out["Volume"].iloc[0] == pytest.approx(1200.0)  # 1000 * 1.2
    assert out["Volume"].iloc[2] == pytest.approx(1200.0)  # untouched


def test_apply_adjustments_compounds_multiple_actions():
    out = apply_adjustments(
        _df(),
        [(pd.Timestamp("2025-01-02").date(), 0.5),
         (pd.Timestamp("2025-01-04").date(), 0.5)],
    )
    # Jan 1 is before both ex-dates: 120 * 0.5 * 0.5 = 30.
    assert out["Close"].iloc[0] == pytest.approx(30.0)
    # Jan 3 is before only the second: 100 * 0.5 = 50.
    assert out["Close"].iloc[2] == pytest.approx(50.0)


def test_apply_adjustments_no_actions_is_identity():
    df = _df()
    out = apply_adjustments(df.copy(), [])
    pd.testing.assert_frame_equal(out, df)


def test_apply_adjustments_does_not_mutate_input():
    # The caller's frame must survive unchanged even when actions apply.
    df = _df()
    before = df.copy()
    apply_adjustments(df, [(pd.Timestamp("2025-01-03").date(), 1 / 1.2)])
    pd.testing.assert_frame_equal(df, before)


import datetime as dt
from unittest import mock

from stocks.services.backtest_harness import runner


def _fake_ticks():
    return [
        {"date": dt.date(2025, 1, 1), "open": 120, "high": 121, "low": 119,
         "close": 120, "volume": 1000},
        {"date": dt.date(2025, 1, 2), "open": 100, "high": 101, "low": 99,
         "close": 100, "volume": 1200},
    ]


def test_load_price_df_applies_injected_actions():
    with mock.patch.object(runner, "_fetch_price_rows", return_value=_fake_ticks()):
        df = runner.load_price_df(
            "FAKE", actions=[(dt.date(2025, 1, 2), 1 / 1.2)]
        )
    assert df["Close"].iloc[0] == pytest.approx(100.0)   # 120 / 1.2
    assert df["Close"].iloc[1] == pytest.approx(100.0)   # after ex-date, raw


def test_load_price_df_adjust_false_returns_raw():
    with mock.patch.object(runner, "_fetch_price_rows", return_value=_fake_ticks()):
        df = runner.load_price_df(
            "FAKE", adjust=False, actions=[(dt.date(2025, 1, 2), 1 / 1.2)]
        )
    assert df["Close"].iloc[0] == pytest.approx(120.0)
