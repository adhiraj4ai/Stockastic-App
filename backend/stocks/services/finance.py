# backend/stocks/services/finance.py
"""Pure portfolio finance math (no Django). Testable in isolation."""
import datetime as dt

__all__ = ["is_long_term_holding", "weighted_acquisition_date", "LONG_TERM_DAYS"]

LONG_TERM_DAYS = 365  # NEPSE CGT long-term threshold


def weighted_acquisition_date(lots):
    """Quantity-weighted mean acquisition date from [(qty, date), ...].

    Used (absent per-lot FIFO tracking) to judge a position's holding period.
    Returns None if total quantity is non-positive / no lots.
    """
    total = sum(q for q, _ in lots)
    if total <= 0:
        return None
    epoch = dt.date(1970, 1, 1)
    weighted_days = sum(q * (d - epoch).days for q, d in lots) / total
    return epoch + dt.timedelta(days=round(weighted_days))


def is_long_term_holding(acquisition_date, sell_date):
    """True if held >= LONG_TERM_DAYS (NEPSE long-term CGT rate applies)."""
    if acquisition_date is None or sell_date is None:
        return False
    return (sell_date - acquisition_date).days >= LONG_TERM_DAYS
