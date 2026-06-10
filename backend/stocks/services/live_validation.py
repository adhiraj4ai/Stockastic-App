# backend/stocks/services/live_validation.py
"""Compare a producer's backtest hypothesis against its realized SignalEpisode record.

The realized record is genuine out-of-sample evidence (signals were emitted live,
then resolved by hitting target/stop). trust_tier turns "backtest says good" into
CONFIRMED / UNCONFIRMED / DIVERGENT using that evidence.
"""
from django.db.models import Avg

__all__ = ["producer_track_record", "trust_tier", "MIN_RESOLVED_FOR_TRUST"]

# Need at least this many resolved (WON+LOST) live episodes to trust/refute a backtest.
MIN_RESOLVED_FOR_TRUST = 8


def producer_track_record(producer_key):
    """Realized live stats for one producer across all symbols."""
    from stocks.models import SignalEpisode
    qs = SignalEpisode.objects.filter(producer_key=producer_key)
    won = qs.filter(status="WON").count()
    lost = qs.filter(status="LOST").count()
    active = qs.filter(status="ACTIVE").count()
    resolved = won + lost
    avg_pnl = qs.filter(status__in=["WON", "LOST"]).aggregate(a=Avg("pnl_percent"))["a"]
    return {
        "producer_key": producer_key,
        "won": won, "lost": lost, "active": active, "resolved": resolved,
        "live_win_rate": (won / resolved) if resolved else 0.0,
        "avg_pnl_pct": float(avg_pnl) if avg_pnl is not None else 0.0,
    }


def trust_tier(backtest_expectancy, live):
    """CONFIRMED | UNCONFIRMED | DIVERGENT from backtest hypothesis + live evidence.

    - UNCONFIRMED: < MIN_RESOLVED_FOR_TRUST resolved live episodes (not enough evidence).
    - DIVERGENT: backtest says positive edge, but live avg P&L is negative (overfit suspect).
    - CONFIRMED: enough live episodes AND live avg P&L positive AND backtest positive.
    """
    if live["resolved"] < MIN_RESOLVED_FOR_TRUST:
        return "UNCONFIRMED"
    live_positive = live["avg_pnl_pct"] > 0
    bt_positive = (backtest_expectancy or 0) > 0
    if bt_positive and not live_positive:
        return "DIVERGENT"
    if bt_positive and live_positive:
        return "CONFIRMED"
    return "UNCONFIRMED"
