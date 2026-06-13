# backend/stocks/services/backtest_harness/fees.py
"""NEPSE trading-cost model for the backtest harness.

Float mirror of the Decimal math in ``stocks/utils.py`` (rates effective
May 14, 2024), shaped as a backtesting.py ``commission`` callable. A unit
test pins the two implementations against each other so they cannot drift.
"""

__all__ = ["nepse_commission", "total_cost_rate", "DEFAULT_SPREAD"]

# Per-side bid-ask/illiquidity cost assumption for NEPSE (10 bps).
DEFAULT_SPREAD = 0.001

_SEBON_RATE = 0.00015  # 0.015% regulatory fee
_DP_CHARGE = 25.0      # flat Rs 25 per transaction

_COMMISSION_TIERS = (  # (max_amount, rate)
    (50_000, 0.0036),
    (500_000, 0.0033),
    (2_000_000, 0.0031),
    (10_000_000, 0.0027),
    (float("inf"), 0.0024),
)


def _commission_rate(amount):
    for ceiling, rate in _COMMISSION_TIERS:
        if amount <= ceiling:
            return rate
    return _COMMISSION_TIERS[-1][1]


def nepse_commission(order_size, price):
    """Absolute cost (Rs) of one fill — backtesting.py ``commission`` callable.

    Applied by backtesting.py at both entry and exit, matching NEPSE charging
    commission + SEBON + DP on each side.
    """
    amount = abs(order_size) * price
    if amount <= 0:
        return 0.0
    return amount * (_commission_rate(amount) + _SEBON_RATE) + _DP_CHARGE


def total_cost_rate(amount):
    """Effective per-side cost rate for an order of ``amount`` Rs (for reporting)."""
    if amount <= 0:
        return 0.0
    return _commission_rate(amount) + _SEBON_RATE + _DP_CHARGE / amount
