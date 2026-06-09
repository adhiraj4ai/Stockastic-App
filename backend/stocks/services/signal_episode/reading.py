# backend/stocks/services/signal_episode/reading.py
from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal
from typing import Optional

BUY, SELL, HOLD, NEUTRAL = "BUY", "SELL", "HOLD", "NEUTRAL"
DIRECTIONAL = {BUY, SELL}


@dataclass
class SignalReading:
    """One producer's read on one symbol for one day, normalized across
    user-strategy and engine producers."""
    date: date
    direction: str                      # BUY | SELL | HOLD | NEUTRAL
    close: Decimal                       # candidate entry/exit price (last close / ltp)
    strength: float = 0.0
    target_price: Optional[Decimal] = None
    stop_loss_price: Optional[Decimal] = None
    signal_tier: str = ""
    rationale: str = ""
    metadata: dict = field(default_factory=dict)

    def __post_init__(self):
        # Strategy producers emit HOLD_SHORT; collapse to HOLD (maintain run).
        if self.direction == "HOLD_SHORT":
            self.direction = HOLD
