"""Composable strategy framework — the orthogonal pieces a strategy is made of.

A strategy is no longer a copy-pasted 40-line class. It is a composition:

    Strategy = Alpha × Regime × Stop × Exit

``build_strategy(...)`` compiles those components into a backtesting.py Strategy
subclass that runs in the existing backtest harness unchanged. Every cross-cutting
concern that the 41 hand-written strategies each re-implemented (the EMA trend
filter, the ATR trailing stop, signal-reversal exits) now lives in exactly one place.

Component contract
------------------
Each component implements ``register(strat)`` (called once in Strategy.init — use
``strat.I(...)`` to build indicators and stash them via ``self._put``). Per-bar logic
reads them back via ``self._get``. Indicator handles are keyed by the strategy
instance, so the same component object is safe to reuse across many backtests.
"""

import pandas as pd
import talib
from backtesting import Strategy as _BTStrategy

from ..optimization_service import SafeTa

ta = SafeTa(talib)

__all__ = ["Component", "Alpha", "Regime", "Stop", "ExitRule", "build_strategy", "ta"]


class Component:
    def register(self, strat):
        """Build indicators on `strat` (called in init). Override as needed."""

    # Indicators MUST be stored as attributes on the strategy: backtesting.py
    # discovers indicators via strategy.__dict__ and re-slices them to the current
    # bar each step. A uniquely-named attr per (component, key) keeps them visible to
    # that slicing while avoiding collisions between components.
    def _attr(self, key):
        return f"_fwi_{id(self)}_{key}"

    def _put(self, strat, **handles):
        for k, v in handles.items():
            setattr(strat, self._attr(k), v)

    def _get(self, strat, key):
        return getattr(strat, self._attr(key))


class Alpha(Component):
    """Produces the entry trigger (and, optionally, its natural reverse exit)."""

    def entry(self, strat) -> bool:
        raise NotImplementedError

    def exit(self, strat) -> bool:
        return False


class Regime(Component):
    """A gate: entries are only allowed when ok() is True."""

    def ok(self, strat) -> bool:
        return True

    def __and__(self, other):
        return _AndRegime(self, other)


class _AndRegime(Regime):
    def __init__(self, a, b):
        self.a, self.b = a, b

    def register(self, strat):
        self.a.register(strat)
        self.b.register(strat)

    def ok(self, strat):
        return self.a.ok(strat) and self.b.ok(strat)


class Stop(Component):
    """Risk model: an initial protective stop and an optional per-bar trail."""

    def initial(self, strat, price):
        return None

    def trail(self, strat, trade):
        pass


class ExitRule(Component):
    def exit(self, strat) -> bool:
        return False


def build_strategy(alpha, regime=None, stop=None, exit=None, name="ComposedStrategy", **params):
    """Compile components into a backtesting.py Strategy subclass.

    `exit` may be an ExitRule or a list of them; if omitted, the alpha's own
    reverse-signal exit is used. `params` become class attributes (so the existing
    regex-based optimizer can still tune them).
    """
    exits = list(exit) if isinstance(exit, (list, tuple)) else ([exit] if exit else [])
    _alpha, _regime, _stop = alpha, regime, stop

    class _Composed(_BTStrategy):
        def init(self):
            for c in (_alpha, _regime, _stop, *exits):
                if c is not None:
                    c.register(self)

        def next(self):
            price = self.data.Close[-1]
            if self.position and _stop is not None:
                for trade in self.trades:
                    _stop.trail(self, trade)

            if not self.position:
                if _alpha.entry(self) and (_regime is None or _regime.ok(self)):
                    sl = _stop.initial(self, price) if _stop is not None else None
                    if sl is not None and sl < price:
                        self.buy(sl=sl)
                    else:
                        self.buy()
            else:
                if _alpha.exit(self) or any(e.exit(self) for e in exits):
                    self.position.close()

    for k, v in params.items():
        setattr(_Composed, k, v)
    _Composed.__name__ = _Composed.__qualname__ = name
    return _Composed
