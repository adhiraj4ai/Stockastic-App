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
