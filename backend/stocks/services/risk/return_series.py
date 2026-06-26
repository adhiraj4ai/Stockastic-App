"""Build a date-aligned daily-return matrix for holdings plus the NEPSE index."""
from dataclasses import dataclass
from datetime import timedelta

import pandas as pd
from django.utils import timezone

from stocks.models.market import DailyStockPrice, DailyIndexValue
from stocks.services.fundamental_calculator import NEPSE_INDEX_NAME

INDEX_COLUMN = "__INDEX__"
LOOKBACK_CALENDAR_MULTIPLIER = 2
_MIN_FULL_CONFIDENCE = 60
_MIN_COMPUTE = 20


@dataclass
class ReturnSeries:
    returns: pd.DataFrame
    sample_counts: dict
    window: int


def confidence_for(sample_count):
    """Map aligned-sample count to a confidence tier."""
    if sample_count >= _MIN_FULL_CONFIDENCE:
        return "full"
    if sample_count >= _MIN_COMPUTE:
        return "low"
    return "none"


def build(tickers, window=180):
    """Return a ReturnSeries of daily returns for tickers + the NEPSE index."""
    start = timezone.now().date() - timedelta(days=window * LOOKBACK_CALENDAR_MULTIPLIER)
    closes = _close_frame(tickers, start)
    closes[INDEX_COLUMN] = _index_close_series(start)
    returns = closes.sort_index().pct_change(fill_method=None).tail(window)
    counts = {t: int(returns[t].count()) if t in returns else 0 for t in tickers}
    return ReturnSeries(returns=returns, sample_counts=counts, window=window)


def _close_frame(tickers, start):
    rows = (
        DailyStockPrice.objects.filter(ticker__in=tickers, date__gte=start)
        .values("ticker", "date", "close").order_by("date")
    )
    frame = pd.DataFrame.from_records(rows)
    if frame.empty:
        return pd.DataFrame(index=pd.Index([], name="date"), columns=tickers, dtype=float)
    pivot = frame.pivot(index="date", columns="ticker", values="close").astype(float)
    return pivot.reindex(columns=tickers)


def _index_close_series(start):
    rows = (
        DailyIndexValue.objects.filter(index_name=NEPSE_INDEX_NAME, date__gte=start)
        .values("date", "value").order_by("date")
    )
    frame = pd.DataFrame.from_records(rows)
    if frame.empty:
        return pd.Series(dtype=float)
    return frame.set_index("date")["value"].astype(float)
