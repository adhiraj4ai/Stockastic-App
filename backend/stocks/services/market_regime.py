# backend/stocks/services/market_regime.py
"""NEPSE market regime from universe breadth (fraction above 200-day SMA).

A breadth-based regime is more honest market-wide than one index print: it asks
how many liquid equities are actually in uptrends. Used to TAG opportunities with
the prevailing regime so a strategy's edge can be read in context.
"""
from django.utils import timezone

__all__ = ["current_regime", "classify_breadth", "SMA_WINDOW", "RISK_ON_MIN", "RISK_OFF_MAX"]

SMA_WINDOW = 200
RISK_ON_MIN = 0.60   # breadth >= 0.60 → RISK_ON
RISK_OFF_MAX = 0.40  # breadth <= 0.40 → RISK_OFF


def classify_breadth(breadth):
    """Map a breadth fraction in [0,1] to a regime label."""
    if breadth >= RISK_ON_MIN:
        return "RISK_ON"
    if breadth <= RISK_OFF_MAX:
        return "RISK_OFF"
    return "NEUTRAL"


def _universe_breadth(as_of=None):
    """Fraction of the research universe with latest close above its 200-day SMA.

    Returns None if no symbol has enough history to judge.
    """
    from stocks.services.universe import research_universe
    from stocks.services.backtest_harness.runner import load_price_df

    symbols = research_universe(as_of=as_of)
    above = 0
    judged = 0
    for sym in symbols:
        df = load_price_df(sym, end=as_of)
        if df is None or len(df) < SMA_WINDOW:
            continue
        closes = df["Close"]
        sma = closes.tail(SMA_WINDOW).mean()
        judged += 1
        if float(closes.iloc[-1]) > float(sma):
            above += 1
    if judged == 0:
        return None
    return above / judged


def current_regime(as_of=None):
    """Current market regime block: {regime, breadth, judged_as_of}."""
    as_of = as_of or timezone.now().date()
    breadth = _universe_breadth(as_of=as_of)
    if breadth is None:
        return {"regime": "UNKNOWN", "breadth": None, "as_of": str(as_of)}
    return {"regime": classify_breadth(breadth), "breadth": round(breadth, 3), "as_of": str(as_of)}
