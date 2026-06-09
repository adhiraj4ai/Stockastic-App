# backend/stocks/services/signal_episode/adapters.py
from decimal import Decimal
from .reading import SignalReading


def _dec(v):
    return None if v is None else Decimal(str(v))


def strategy_reading(d, signal, last_close, metadata=None):
    """User-strategy producers: no target/stop (closes only on flip)."""
    return SignalReading(
        date=d, direction=signal, close=_dec(last_close) or Decimal("0"),
        metadata=metadata or {},
    )


def engine_reading(d, signal, ltp, strength=0, tier="", rationale="",
                   target=None, stop=None, metadata=None):
    """Engine producers: carry the TP/SL plan computed by the engine pipeline."""
    return SignalReading(
        date=d, direction=signal, close=_dec(ltp) or Decimal("0"), strength=strength or 0,
        target_price=_dec(target), stop_loss_price=_dec(stop), signal_tier=tier,
        rationale=rationale, metadata=metadata or {},
    )
