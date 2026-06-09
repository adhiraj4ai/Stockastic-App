# backend/stocks/services/signal_episode/state_machine.py
from dataclasses import dataclass
from typing import Optional

from .reading import SignalReading, DIRECTIONAL

# Actions
OPEN = "OPEN"          # open a new episode in reading.direction
EXTEND = "EXTEND"      # extend the open episode (re-affirm)
FLIP = "FLIP"          # close open episode (SIGNAL_FLIP) AND open opposite
SUPPRESS = "SUPPRESS"  # same run already consumed by TP/SL -> do nothing
NOOP = "NOOP"          # HOLD/NEUTRAL with nothing actionable

TPSL_REASONS = {"TARGET", "STOP"}


@dataclass
class EpisodeSnapshot:
    """Minimal view of an episode the decision needs — DB-free for testing."""
    direction: str
    exit_reason: Optional[str]


@dataclass
class Decision:
    action: str


def decide(open_ep: Optional[EpisodeSnapshot],
           latest_ep: Optional[EpisodeSnapshot],
           reading: SignalReading) -> Decision:
    """Spec §4A. HOLD/NEUTRAL never act; only BUY/SELL do."""
    d = reading.direction
    if d not in DIRECTIONAL:
        return Decision(NOOP)

    if open_ep is not None:
        if open_ep.direction == d:
            return Decision(EXTEND)
        return Decision(FLIP)

    # No open episode. Suppress only if the SAME direction's run was just
    # consumed by a TP/SL exit (no re-entry until a flip opens a new run).
    if latest_ep is not None and latest_ep.direction == d and latest_ep.exit_reason in TPSL_REASONS:
        return Decision(SUPPRESS)
    return Decision(OPEN)
