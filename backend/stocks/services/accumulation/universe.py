"""Shared liquidity floor — identical gate for calibration and live scan."""
from datetime import timedelta

import numpy as np

MIN_MEDIAN_TURNOVER = 500_000.0
MIN_ACTIVE_BROKERS = 5
TURNOVER_LOOKBACK_DAYS = 30
ACCUM_GROWTH_WINDOW = 20
ACCUM_GROWTH_TOP_N = 5
# Floor on the denominator so a near-zero prior accumulation base cannot make
# the percentage-growth rank explode.
_MIN_ACCUM_BASE = 1.0


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


def _top_broker_accumulation_line(symbol, as_of, top_n):
    """Top-N brokers' summed cumulative_net level through `as_of` (a pd.Series)."""
    import pandas as pd

    from stocks.models import DailyCumulativeAccumulation
    qs = DailyCumulativeAccumulation.objects.filter(
        symbol=symbol, transaction_date__lte=as_of).values(
        "transaction_date", "entity_id", "cumulative_net")
    if not qs:
        return pd.Series(dtype=float)
    df = pd.DataFrame(list(qs))
    pivot = df.pivot_table(index="transaction_date", columns="entity_id",
                           values="cumulative_net", aggfunc="last").ffill().fillna(0)
    top = pivot.iloc[-1].sort_values(ascending=False).head(top_n).index
    return pivot[top].sum(axis=1).astype(float)


def accumulation_growth(symbol, as_of, window=ACCUM_GROWTH_WINDOW, top_n=ACCUM_GROWTH_TOP_N):
    """Scale-free % growth of the top-N brokers' net accumulated volume over `window`.

    `(line[-1] - line[-1-window]) / max(|line[-1-window]|, _MIN_ACCUM_BASE)`.
    Ranks symbols by how fast large players are accumulating, independent of size.
    """
    line = _top_broker_accumulation_line(symbol, as_of, top_n)
    if len(line) < 2:
        return 0.0
    base = line.iloc[-min(window + 1, len(line))]
    return float((line.iloc[-1] - base) / max(abs(base), _MIN_ACCUM_BASE))


def latest_data_date():
    """Most recent date with accumulation data, or None if there is none.

    Pipeline jobs use this instead of ``date.today()`` so a lagging ingest does
    not yield an empty universe.
    """
    from django.db.models import Max

    from stocks.models import DailyCumulativeAccumulation
    return DailyCumulativeAccumulation.objects.aggregate(
        d=Max("transaction_date"))["d"]


_RANK_METRICS = {
    "turnover": _median_turnover,
    "accumulation_growth": accumulation_growth,
}


def liquid_universe(as_of, limit=None, rank_by="turnover"):
    """Symbols passing the liquidity floor on ``as_of``.

    With ``limit`` set, returns the top ``limit`` names ranked by ``rank_by``
    (``"accumulation_growth"`` for the calibration sample — picks where large
    players are accumulating fastest; ``"turnover"`` otherwise). Without
    ``limit``, returns every passing symbol (the scan), unranked.
    """
    from stocks.models import DailyCumulativeAccumulation
    symbols = (DailyCumulativeAccumulation.objects
               .filter(transaction_date=as_of).values_list("symbol", flat=True).distinct())
    passing = [s for s in symbols if passes_liquidity_floor(s, as_of)]
    if limit is None:
        return passing
    metric = _RANK_METRICS.get(rank_by, _median_turnover)
    ranked = sorted(passing, key=lambda s: metric(s, as_of), reverse=True)
    return ranked[:limit]
