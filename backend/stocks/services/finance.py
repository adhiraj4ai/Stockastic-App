# backend/stocks/services/finance.py
"""Pure portfolio finance math (no Django). Testable in isolation."""
import datetime as dt

__all__ = [
    "is_long_term_holding",
    "weighted_acquisition_date",
    "LONG_TERM_DAYS",
    "xirr",
    "time_weighted_return",
]

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


def _xirr_prepare(cashflows):
    """Validate and normalize cashflows; return (amounts, years) or None if unsolvable."""
    flows = [(d, float(a)) for d, a in cashflows]
    if len(flows) < 2:
        return None
    amounts = [a for _, a in flows]
    if not (any(a > 0 for a in amounts) and any(a < 0 for a in amounts)):
        return None
    t0 = min(d for d, _ in flows)
    years = [(d - t0).days / 365.0 for d, _ in flows]
    return amounts, years


def _xirr_newton(npv, guess):
    """Newton's method for root-finding; return r if converged, else None."""
    r = guess
    for _ in range(100):
        f = npv(r)
        df = (npv(r + 1e-6) - f) / 1e-6
        if df == 0:
            break
        step = f / df
        r -= step
        if r <= -1.0:
            r = -0.999999
        if abs(step) < 1e-8:
            return r
    return None


def _xirr_bisection(npv):
    """Bisection fallback over [-0.999, 10]; return root or None if no sign change."""
    lo, hi = -0.999, 10.0
    flo, fhi = npv(lo), npv(hi)
    if flo * fhi > 0:
        return None
    for _ in range(200):
        mid = (lo + hi) / 2
        fmid = npv(mid)
        if abs(fmid) < 1e-7:
            return mid
        if flo * fmid < 0:
            hi, fhi = mid, fmid
        else:
            lo, flo = mid, fmid
    return (lo + hi) / 2


def xirr(cashflows, guess=0.1):
    """Money-weighted annualized return (IRR with irregular dates).

    cashflows: list of (date, amount); outflows negative, inflows positive.
    Solves sum(cf / (1+r)**(days/365)) = 0. Returns None if there's no sign
    change (unsolvable) or too few flows. Newton's method with a bisection
    fallback over [-0.999, 10].
    """
    prepared = _xirr_prepare(cashflows)
    if prepared is None:
        return None
    amounts, years = prepared

    def npv(r):
        return sum(a / (1.0 + r) ** y for a, y in zip(amounts, years))

    result = _xirr_newton(npv, guess)
    if result is not None:
        return result
    return _xirr_bisection(npv)


def time_weighted_return(points):
    """Geometric-linked time-weighted return, neutralising external cash flows.

    points: list of (date, value, external_flow) ordered by date, where
    external_flow is cash added (+) or withdrawn (-) AT that point (before the
    next sub-period). TWR = prod(value_i / (value_{i-1} + flow_{i-1})) - 1.

    Sign convention: external_flow > 0 means new money deposited INTO the
    portfolio (a BUY injects capital); external_flow < 0 means money withdrawn
    (a SELL/dividend takes cash out of the investable base).

    Returns None if fewer than 2 points or no valid sub-period.
    """
    pts = sorted(points, key=lambda p: p[0])
    if len(pts) < 2:
        return None
    factor = 1.0
    valid = 0
    for i in range(1, len(pts)):
        prev_val = pts[i - 1][1] + pts[i - 1][2]  # value + flow injected at start of period
        cur_val = pts[i][1]
        if prev_val <= 0:
            continue
        factor *= (cur_val / prev_val)
        valid += 1
    if valid == 0:
        return None
    return factor - 1.0
