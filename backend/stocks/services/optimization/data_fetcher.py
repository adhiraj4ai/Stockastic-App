from __future__ import annotations

from datetime import datetime, timedelta

import pandas as pd

from stocks.constants import MIN_OPTIMIZATION_DAYS, OPTIMIZATION_HISTORY_DAYS
from stocks.models import DailyStockPrice


def fetch_price_data(tickers: list[str]) -> pd.DataFrame | None:
    end_date = datetime.now().date()
    start_date = end_date - timedelta(days=OPTIMIZATION_HISTORY_DAYS)
    qs = DailyStockPrice.objects.filter(
        ticker__in=tickers,
        date__gte=start_date,
        date__lte=end_date,
    ).values("ticker", "date", "close")
    df = pd.DataFrame(list(qs))
    if df.empty:
        return None
    df["close"] = df["close"].apply(float)
    pivoted = df.pivot_table(index="date", columns="ticker", values="close", aggfunc="mean").ffill().dropna()
    if pivoted.empty or len(pivoted) < MIN_OPTIMIZATION_DAYS:
        return None
    return pivoted
