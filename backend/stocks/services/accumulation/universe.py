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


def latest_data_date():
    """Most recent date with accumulation data, or None if there is none.

    Pipeline jobs use this instead of ``date.today()`` so a lagging ingest does
    not yield an empty universe.
    """
    from django.db.models import Max

    from stocks.models import DailyCumulativeAccumulation
    return DailyCumulativeAccumulation.objects.aggregate(
        d=Max("transaction_date"))["d"]


def liquid_universe(as_of, limit=None):
    """Symbols passing the liquidity floor on ``as_of``.

    With ``limit`` set, returns only the ``limit`` most-liquid (highest median
    turnover) names — used to bound the calibration basket to a stable,
    representative sample. Without it, returns every passing symbol (the scan).
    """
    from stocks.models import DailyCumulativeAccumulation
    symbols = (DailyCumulativeAccumulation.objects
               .filter(transaction_date=as_of).values_list("symbol", flat=True).distinct())
    passing = [s for s in symbols if passes_liquidity_floor(s, as_of)]
    if limit is None:
        return passing
    ranked = sorted(passing, key=lambda s: _median_turnover(s, as_of), reverse=True)
    return ranked[:limit]
