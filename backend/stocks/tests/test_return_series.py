import pytest
from datetime import date, timedelta
from stocks.models.market import DailyStockPrice, DailyIndexValue
from stocks.services.risk import return_series as rs
from stocks.services.fundamental_calculator import NEPSE_INDEX_NAME

_RECENT_START = date.today() - timedelta(days=10)

pytestmark = pytest.mark.django_db


def _seed_prices(ticker, start, closes):
    for offset, close in enumerate(closes):
        DailyStockPrice.objects.create(
            ticker=ticker, date=start + timedelta(days=offset),
            open=close, high=close, low=close, close=close, volume=1000,
        )


def _seed_index(start, values):
    for offset, value in enumerate(values):
        DailyIndexValue.objects.create(
            index_name=NEPSE_INDEX_NAME, date=start + timedelta(days=offset), value=value,
        )


def test_confidence_tiers():
    assert rs.confidence_for(70) == "full"
    assert rs.confidence_for(40) == "low"
    assert rs.confidence_for(5) == "none"


def test_build_aligns_ticker_and_index_returns():
    start = _RECENT_START
    closes = [100, 110, 121, 133.1]            # +10% each step
    _seed_prices("AAA", start, closes)
    _seed_index(start, [1000, 1100, 1210, 1331])  # +10% each step
    series = rs.build(["AAA"], window=180)
    assert rs.INDEX_COLUMN in series.returns.columns
    assert "AAA" in series.returns.columns
    assert series.sample_counts["AAA"] == 3       # 4 closes -> 3 returns


def test_build_reports_zero_samples_for_unknown_ticker():
    start = _RECENT_START
    _seed_index(start, [1000, 1100, 1210])
    series = rs.build(["ZZZ"], window=180)
    assert series.sample_counts["ZZZ"] == 0
