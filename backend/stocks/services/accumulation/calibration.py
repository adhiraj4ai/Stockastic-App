"""Build + gate the calibrated AccumulationStrength strategy."""

ACCUMULATION_STRATEGY_NAME = "Accumulation Strength"

_CODE_TEMPLATE = """from stocks.services.strategy_framework import build_strategy, alphas, stops
top_n = {top_n}  # range: [1, 15]
entry_threshold = {entry_threshold}  # range: [40, 90]
w_concentration = {w_concentration}  # range: [0, 3]
w_coiling = {w_coiling}  # range: [0, 3]
w_breakout = {w_breakout}  # range: [0, 3]
conc_lookback = {conc_lookback}  # range: [5, 30]
coil_lookback = {coil_lookback}  # range: [10, 40]
Strategy = build_strategy(
    alpha=alphas.AccumulationStrength(
        symbol=symbol, top_n=top_n, entry_threshold=entry_threshold,
        w_concentration=w_concentration, w_coiling=w_coiling, w_breakout=w_breakout,
        conc_lookback=conc_lookback, coil_lookback=coil_lookback),
    stop=stops.AtrTrail(multiplier=3.0),
    name="AccumulationStrength")
"""

_DEFAULTS = dict(
    top_n=5,
    entry_threshold=70,
    w_concentration=1.0,
    w_coiling=1.0,
    w_breakout=1.0,
    conc_lookback=10,
    coil_lookback=20,
)


def build_accumulation_code(params):
    """Return strategy code with # range: comments for optimizer param discovery."""
    merged = {**_DEFAULTS, **(params or {})}
    return _CODE_TEMPLATE.format(**merged)


def decide_validation_state(card):
    """Map OOS ScoreCard result to a validation_state string."""
    return "validated" if getattr(card, "passed", False) else "research"
