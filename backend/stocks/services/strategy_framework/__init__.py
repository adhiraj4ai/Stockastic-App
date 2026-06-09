"""Composable strategy framework.

Compose a strategy from orthogonal parts instead of writing a monolithic class:

    from stocks.services.strategy_framework import build_strategy, alphas, regimes, stops, exits

    Strategy = build_strategy(
        alpha=alphas.SupertrendFlip(period=10, multiplier=3.0),
        regime=regimes.AboveEMA(200),
        stop=stops.AtrTrail(multiplier=3.0),
        # exit defaults to the alpha's own reverse-signal exit
        name="Supertrend",
    )

The returned object is a backtesting.py Strategy subclass; the backtest harness
runs it like any other strategy.
"""

from . import library as _lib
from .base import build_strategy, Component, Alpha, Regime, Stop, ExitRule
from .registry import (
    REGISTRY, registry_schema, validate_spec, compile_spec, spec_to_code, SpecError,
)

# Namespaced accessors so composition reads declaratively.
alphas = _lib
regimes = _lib
stops = _lib
exits = _lib

__all__ = [
    "build_strategy", "Component", "Alpha", "Regime", "Stop", "ExitRule",
    "alphas", "regimes", "stops", "exits", "library",
    "REGISTRY", "registry_schema", "validate_spec", "compile_spec", "spec_to_code", "SpecError",
]
library = _lib
