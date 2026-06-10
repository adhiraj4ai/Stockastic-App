# backend/stocks/tests/test_finance.py
"""Pure finance helpers."""
import datetime as dt
import pytest
from stocks.services.finance import is_long_term_holding, weighted_acquisition_date


def test_long_term_at_365_days():
    buy = dt.date(2024, 1, 1)
    assert is_long_term_holding(buy, dt.date(2025, 1, 1)) is True
    assert is_long_term_holding(buy, dt.date(2024, 12, 30)) is False


def test_short_term_recent():
    assert is_long_term_holding(dt.date(2025, 1, 1), dt.date(2025, 6, 1)) is False


def test_none_dates_are_short_term():
    assert is_long_term_holding(None, dt.date(2025, 1, 1)) is False


def test_weighted_acquisition_date():
    lots = [(100, dt.date(2024, 1, 1)), (100, dt.date(2024, 7, 1))]
    wad = weighted_acquisition_date(lots)
    assert dt.date(2024, 3, 25) <= wad <= dt.date(2024, 4, 7)


def test_weighted_acquisition_date_empty_is_none():
    assert weighted_acquisition_date([]) is None


# ---------------------------------------------------------------------------
# TWR / XIRR tests
# ---------------------------------------------------------------------------
from stocks.services.finance import xirr, time_weighted_return


def test_xirr_simple_doubling_one_year():
    flows = [(dt.date(2024, 1, 1), -1000.0), (dt.date(2025, 1, 1), 2000.0)]
    r = xirr(flows)
    assert 0.95 <= r <= 1.05


def test_xirr_no_growth_is_zero():
    flows = [(dt.date(2024, 1, 1), -1000.0), (dt.date(2025, 1, 1), 1000.0)]
    assert abs(xirr(flows)) < 0.01


def test_xirr_empty_or_degenerate_returns_none():
    assert xirr([]) is None
    assert xirr([(dt.date(2024, 1, 1), -1000.0)]) is None  # no positive flow / no sign change


def test_time_weighted_return_chains_subperiods():
    # +10% then +10% with a deposit between → TWR = 21% (cash-flow neutral).
    points = [
        (dt.date(2024, 1, 1), 100.0, 0.0),
        (dt.date(2024, 6, 1), 110.0, 100.0),   # +100 external deposit at this point
        (dt.date(2024, 12, 1), 231.0, 0.0),
    ]
    twr = time_weighted_return(points)
    assert abs(twr - 0.21) < 0.01


def test_twr_empty_returns_none():
    assert time_weighted_return([]) is None
    assert time_weighted_return([(dt.date(2024, 1, 1), 100.0, 0.0)]) is None
