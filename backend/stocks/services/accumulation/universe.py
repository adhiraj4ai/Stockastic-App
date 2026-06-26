"""Shared liquidity floor — identical gate for calibration and live scan."""
from datetime import timedelta

import numpy as np

MIN_MEDIAN_TURNOVER = 500_000.0
MIN_ACTIVE_BROKERS = 5
TURNOVER_LOOKBACK_DAYS = 30


def _median_turnover(symbol, as_of):
    from stocks.models.market import DailyStockPrice
    start = as_of - timedelta(days=TURNOVER_LOOKBACK_DAYS)
    rows = DailyStockPrice.objects.filter(
        ticker=symbol, date__range=[start, as_of]).values_list("close", "volume")
    turnovers = [float(c) * float(v) for c, v in rows if c and v]
    return float(np.median(turnovers)) if turnovers else 0.0


def _active_broker_count(symbol, as_of):
    from stocks.models import DailyCumulativeAccumulation
    return (DailyCumulativeAccumulation.objects
            .filter(symbol=symbol, transaction_date=as_of)
            .values("entity_id").distinct().count())


def passes_liquidity_floor(symbol, as_of, min_turnover=MIN_MEDIAN_TURNOVER,
                           min_brokers=MIN_ACTIVE_BROKERS):
    if _median_turnover(symbol, as_of) < min_turnover:
        return False
    return _active_broker_count(symbol, as_of) >= min_brokers


def liquid_universe(as_of):
    from stocks.models import DailyCumulativeAccumulation
    symbols = (DailyCumulativeAccumulation.objects
               .filter(transaction_date=as_of).values_list("symbol", flat=True).distinct())
    return [s for s in symbols if passes_liquidity_floor(s, as_of)]
