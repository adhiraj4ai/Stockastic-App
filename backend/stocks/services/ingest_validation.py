# backend/stocks/services/ingest_validation.py
"""Validation gate for manually ingested daily price rows.

The upload sources (CSV / GitHub mirror) map missing numeric cells to 0, so
zero open/high/low is tolerated; a zero close is not (a price row without a
close is unusable everywhere downstream).
"""

__all__ = ["validate_price_rows"]

_EPS = 1e-9


def validate_price_rows(items):
    """Partition unsaved DailyStockPrice instances into (valid, rejected).

    ``rejected`` is a list of ``(ticker, reason)`` for logging.
    """
    valid, rejected = [], []
    for it in items:
        o = float(it.open or 0)
        h = float(it.high or 0)
        low = float(it.low or 0)
        c = float(it.close or 0)
        vol = float(it.volume or 0)

        if c <= 0:
            rejected.append((it.ticker, "non-positive close"))
            continue
        if min(o, h, low, vol) < 0:
            rejected.append((it.ticker, "negative field"))
            continue
        if o > 0 and h > 0 and low > 0:
            if low > min(o, c) + _EPS or h < max(o, c) - _EPS or low > h + _EPS:
                rejected.append((it.ticker, "OHLC inconsistent"))
                continue
        valid.append(it)
    return valid, rejected
