# backend/stocks/services/ingest_validation.py
"""Validation gate for manually ingested daily price rows.

The upload sources (CSV / GitHub mirror) map missing numeric cells to 0, so
zero open/high/low is tolerated when the close is valid — but instead of
storing an internally-inconsistent bar (High=0 < Close), the missing legs are
back-filled to the close so H/L-based indicators (ATR, Donchian, 52w-high)
read a flat-but-coherent bar. A zero close is fatal (the row is unusable).

NEPSE also sends fully-populated OHLC rows for bonds/debentures where the
API-reported high/low don't properly bound open/close (likely rounding or
LTP-vs-session close mismatch). These are clamped rather than rejected so the
close price — always the authoritative value — is preserved.
"""

__all__ = ["validate_price_rows"]

_EPS = 1e-9


def validate_price_rows(items):
    """Partition unsaved DailyStockPrice instances into (valid, rejected).

    Close-only rows have open/high/low back-filled to the close (in place).
    Rows with inconsistent OHLC have high/low clamped to span open/close.
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

        # Back-fill missing legs, then clamp H/L to always span open/close.
        # This covers both zero-legs (CSV sentinel) and OHLC-inconsistent rows
        # from the NEPSE API (bonds/debentures where LTP != session H/L range).
        it.open = it.open or it.close
        it.high = it.high or it.close
        it.low = it.low or it.close
        it.high = max(float(it.high), float(it.open), float(it.close))
        it.low = min(float(it.low), float(it.open), float(it.close))

        valid.append(it)
    return valid, rejected
