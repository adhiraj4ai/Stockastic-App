"""Component registry, spec compiler, and code generator.

Turns strategies into DATA: a declarative JSON spec is validated, compiled into a
backtesting.py Strategy (via build_strategy), or rendered to the equivalent Python
snippet. The registry also serves a JSON catalog (param schemas) that the visual
builder consumes, and whose min/max/step drive the optimizer's per-component ranges.

A spec node is ``{"type": "<ComponentName>", "params": {...}}``. The top-level spec:
    {"version": 1, "alpha": <node>, "regime": <node|null>, "stop": <node|null>,
     "exit": <node|null>, "rr": <float|null>, "name": "<str>"}
Only ``alpha`` is required. Component metadata lives here (not on the classes) so the
library stays focused on behaviour.
"""

from . import library as L
from .base import build_strategy

__all__ = [
    "REGISTRY", "registry_schema", "validate_spec", "compile_spec", "spec_to_code", "SpecError",
]

NAMESPACE = {"alpha": "alphas", "regime": "regimes", "stop": "stops", "exit": "exits"}


class SpecError(ValueError):
    """Raised when a strategy spec is malformed (clear, user-facing message)."""


REGISTRY = {}  # type name -> metadata dict


def _p(name, type_, default, lo=None, hi=None, step=None, options=None):
    d = {"name": name, "type": type_, "default": default}
    if lo is not None:
        d["min"] = lo
    if hi is not None:
        d["max"] = hi
    if step is not None:
        d["step"] = step
    if options is not None:
        d["options"] = options
    return d


def _reg(cls, kind, label, category, params, desc="", needs_symbol=False):
    REGISTRY[cls.__name__] = {
        "type": cls.__name__, "cls": cls, "kind": kind, "label": label,
        "category": category, "desc": desc, "params": params, "needs_symbol": needs_symbol,
    }


# --------------------------------------------------------------------------- #
# Alphas
# --------------------------------------------------------------------------- #
_reg(L.SupertrendFlip, "alpha", "Supertrend Flip", "Trend", [
    _p("period", "int", 10, 5, 50, 1), _p("multiplier", "float", 3.0, 1.0, 6.0, 0.5)],
    "Long on a bullish Supertrend flip; reverse exit on a bearish flip.")
_reg(L.SmaCross, "alpha", "SMA Crossover", "Trend", [
    _p("fast", "int", 20, 5, 100, 1), _p("slow", "int", 50, 20, 300, 5)],
    "Fast SMA crosses above slow SMA.")
_reg(L.MacdCross, "alpha", "MACD Cross", "Momentum", [
    _p("fast", "int", 12, 5, 30, 1), _p("slow", "int", 26, 15, 60, 1), _p("signal", "int", 9, 3, 20, 1)],
    "MACD line crosses above its signal line.")
_reg(L.DonchianBreakout, "alpha", "Donchian Breakout", "Breakout", [
    _p("entry_window", "int", 20, 5, 100, 1), _p("exit_window", "int", 10, 3, 60, 1)],
    "Close breaks the prior N-day high; exit on the M-day low.")
_reg(L.VolumeBreakout, "alpha", "Volume Breakout", "Breakout", [
    _p("lookback", "int", 20, 5, 60, 1), _p("vol_mult", "float", 2.0, 1.0, 5.0, 0.5)],
    "N-day-high breakout confirmed by a volume spike.")
_reg(L.ParabolicSarFlip, "alpha", "Parabolic SAR Flip", "Trend", [],
     "Close crosses above the Parabolic SAR.")
_reg(L.IchimokuCloud, "alpha", "Ichimoku Cloud", "Trend", [],
     "Price holds above the Ichimoku cloud (Span A/B).")
_reg(L.AdxDi, "alpha", "ADX / DI Trend", "Trend", [
    _p("length", "int", 14, 5, 40, 1), _p("threshold", "int", 25, 10, 50, 1)],
    "ADX strong and +DI over -DI.")
_reg(L.KeltnerReclaim, "alpha", "Keltner Pullback", "Trend", [
    _p("length", "int", 20, 5, 60, 1), _p("scalar", "float", 2.0, 1.0, 4.0, 0.5)],
    "Price reclaims a rising Keltner basis (pullback continuation).")
_reg(L.AroonCross, "alpha", "Aroon Cross", "Trend", [
    _p("period", "int", 14, 5, 40, 1), _p("strong", "int", 70, 50, 100, 5)],
    "Aroon Up crosses above Aroon Down with strong upside.")
_reg(L.CoppockTurn, "alpha", "Coppock Curve", "Momentum", [
    _p("length", "int", 10, 4, 20, 1), _p("fast", "int", 11, 5, 20, 1), _p("slow", "int", 14, 8, 30, 1)],
    "Long-term momentum: Coppock crosses up through zero.")
_reg(L.ForceIndexZero, "alpha", "Force Index", "Volume", [_p("period", "int", 13, 2, 40, 1)],
     "Elder Force Index turns positive.")
_reg(L.ObvAboveMA, "alpha", "OBV Trend", "Volume", [_p("ma", "int", 20, 5, 60, 1)],
     "On-Balance Volume above its moving average.")
_reg(L.CmfCross, "alpha", "Chaikin Money Flow", "Volume", [
    _p("period", "int", 20, 5, 60, 1), _p("entry", "float", 0.05, 0.0, 0.3, 0.05)],
    "CMF crosses up through a positive accumulation threshold.")
_reg(L.RsiOversold, "alpha", "RSI Oversold", "Mean reversion", [
    _p("period", "int", 14, 2, 30, 1), _p("lower", "int", 40, 10, 50, 1), _p("upper", "int", 70, 50, 90, 1)],
    "Buy oversold RSI; exit overbought.")
_reg(L.Rsi2Connors, "alpha", "Connors RSI-2", "Mean reversion", [
    _p("rsi_len", "int", 2, 2, 5, 1), _p("lower", "int", 10, 2, 30, 1),
    _p("sma_long", "int", 200, 50, 300, 10), _p("sma_exit", "int", 5, 2, 20, 1)],
    "Aggressive dip-buy above a long SMA, exit above a short SMA.")
_reg(L.StochRsiCross, "alpha", "Stochastic RSI Cross", "Mean reversion", [
    _p("oversold", "int", 20, 5, 40, 1), _p("overbought", "int", 80, 60, 95, 1)],
    "StochRSI K-over-D cross from oversold.")
_reg(L.MfiOversold, "alpha", "Money Flow Index", "Mean reversion", [
    _p("period", "int", 14, 5, 30, 1), _p("oversold", "int", 20, 5, 40, 1), _p("overbought", "int", 80, 60, 95, 1)],
    "Buy oversold money flow, sell into overbought.")
_reg(L.WilliamsROversold, "alpha", "Williams %R", "Mean reversion", [
    _p("period", "int", 14, 5, 30, 1), _p("lower", "int", -80, -95, -50, 5), _p("upper", "int", -20, -50, -5, 5)],
    "Buy deeply oversold Williams %R; exit overbought.")
_reg(L.ZScoreReversion, "alpha", "Z-Score Reversion", "Mean reversion", [
    _p("window", "int", 20, 5, 60, 1), _p("z_entry", "float", -2.0, -3.0, -1.0, 0.25),
    _p("z_exit", "float", 1.0, -1.0, 2.0, 0.25)],
    "Buy when price is z std below its rolling mean; exit on reversion.")
_reg(L.VwapReclaim, "alpha", "VWAP Reclaim", "Mean reversion", [],
     "Close reclaims the rolling VWAP from below.")
_reg(L.FibGoldenZone, "alpha", "Fibonacci Golden Zone", "Mean reversion", [_p("lookback", "int", 50, 20, 120, 5)],
     "Buy a pullback into the 50–61.8% retracement zone.")
_reg(L.TurtleSoupReversal, "alpha", "Turtle Soup Reversal", "Reversal", [_p("lookback", "int", 20, 5, 60, 1)],
     "False-breakout reversal: undercut then reclaim the prior N-day low.")
_reg(L.ThreeWhiteSoldiers, "alpha", "Three White Soldiers", "Price action", [_p("n", "int", 3, 2, 5, 1)],
     "N consecutive higher green closes.")
_reg(L.DualThrust, "alpha", "Dual Thrust", "Breakout", [
    _p("n", "int", 4, 2, 20, 1), _p("k1", "float", 0.5, 0.1, 1.5, 0.1), _p("k2", "float", 0.5, 0.1, 1.5, 0.1)],
    "Opening-range breakout above open + K1·range.")
_reg(L.AlligatorBreakout, "alpha", "Williams Alligator", "Trend", [
    _p("jaw", "int", 13, 5, 30, 1), _p("teeth", "int", 8, 3, 20, 1), _p("lips", "int", 5, 2, 15, 1)],
    "Alligator 'eating' (Lips>Teeth>Jaw) + fractal breakout.")
_reg(L.Nr7Breakout, "alpha", "NR7 Breakout", "Breakout", [],
     "Narrowest-range-7 contraction then breakout.")
_reg(L.InsideBarBreakout, "alpha", "Inside Bar Breakout", "Price action", [],
     "Breakout of the mother bar after an inside bar.")
_reg(L.SmaPullback, "alpha", "Golden Cross Pullback", "Trend", [
    _p("fast", "int", 50, 20, 100, 5), _p("slow", "int", 200, 100, 300, 10), _p("near", "float", 0.02, 0.005, 0.05, 0.005)],
    "Buy a pullback to the fast SMA inside a golden-cross uptrend.")
_reg(L.AccumulationAboveMA, "alpha", "Broker Accumulation", "Broker flow", [
    _p("top_n", "int", 5, 1, 30, 1), _p("ma", "int", 20, 5, 60, 1)],
    "Top brokers' cumulative net position above its MA.", needs_symbol=True)
_reg(L.AccumulationMaCross, "alpha", "Accumulation MA Cross", "Broker flow", [
    _p("top_n", "int", 5, 1, 30, 1), _p("fast", "int", 10, 3, 30, 1), _p("slow", "int", 50, 20, 120, 5)],
    "Fast/slow MA crossover of top brokers' flow.", needs_symbol=True)
_reg(L.AccumulationDivergence, "alpha", "Accumulation Divergence", "Broker flow", [_p("lookback", "int", 10, 3, 40, 1)],
     "Contrarian: price falling while broker accumulation rises.", needs_symbol=True)

# --------------------------------------------------------------------------- #
# Regimes
# --------------------------------------------------------------------------- #
_reg(L.AboveEMA, "regime", "Above EMA (uptrend)", "Trend filter", [_p("period", "int", 200, 20, 300, 10)],
     "Only allow entries while price is above a long EMA.")
_reg(L.AdxAbove, "regime", "ADX Above", "Trend filter", [
    _p("threshold", "int", 25, 10, 50, 1), _p("length", "int", 14, 5, 40, 1)],
    "Only allow entries when ADX confirms a strong trend.")

# --------------------------------------------------------------------------- #
# Stops
# --------------------------------------------------------------------------- #
_reg(L.AtrTrail, "stop", "ATR Trailing Stop", "Risk", [
    _p("period", "int", 14, 5, 40, 1), _p("multiplier", "float", 3.0, 1.0, 8.0, 0.5)],
    "Trailing ATR stop — suits trend-following.")
_reg(L.FixedAtr, "stop", "Fixed ATR Stop", "Risk", [
    _p("period", "int", 14, 5, 40, 1), _p("multiplier", "float", 6.0, 1.0, 10.0, 0.5)],
    "Fixed catastrophic ATR stop set at entry — suits mean reversion.")

# --------------------------------------------------------------------------- #
# Exits
# --------------------------------------------------------------------------- #
_reg(L.TrendBreak, "exit", "Trend Break Exit", "Exit", [_p("period", "int", 200, 20, 300, 10)],
     "Exit when price loses a long EMA (lets winners run otherwise).")


# --------------------------------------------------------------------------- #
# Schema / validation / compile / codegen
# --------------------------------------------------------------------------- #
def registry_schema():
    """JSON catalog grouped by kind — consumed by the builder palette."""
    out = {"alpha": [], "regime": [], "stop": [], "exit": []}
    for meta in REGISTRY.values():
        out[meta["kind"]].append({
            "type": meta["type"], "label": meta["label"], "category": meta["category"],
            "desc": meta["desc"], "needs_symbol": meta["needs_symbol"], "params": meta["params"],
        })
    for kind in out:
        out[kind].sort(key=lambda c: (c["category"], c["label"]))
    return out


def _coerce(meta_param, value):
    t = meta_param["type"]
    try:
        if t == "int":
            value = int(value)
        elif t == "float":
            value = float(value)
    except (TypeError, ValueError):
        raise SpecError(f"Parameter '{meta_param['name']}' must be {t}, got {value!r}")
    if "min" in meta_param and value < meta_param["min"]:
        raise SpecError(f"Parameter '{meta_param['name']}'={value} below min {meta_param['min']}")
    if "max" in meta_param and value > meta_param["max"]:
        raise SpecError(f"Parameter '{meta_param['name']}'={value} above max {meta_param['max']}")
    return value


def _build_node(node, kind, symbol=None):
    if not isinstance(node, dict) or "type" not in node:
        raise SpecError(f"{kind} node must be an object with a 'type'")
    meta = REGISTRY.get(node["type"])
    if meta is None:
        raise SpecError(f"Unknown {kind} component: {node['type']!r}")
    if meta["kind"] != kind:
        raise SpecError(f"{node['type']!r} is a {meta['kind']}, not a {kind}")
    schema = {p["name"]: p for p in meta["params"]}
    given = node.get("params") or {}
    unknown = set(given) - set(schema)
    if unknown:
        raise SpecError(f"{node['type']} got unknown params: {sorted(unknown)}")
    kwargs = {p["name"]: _coerce(p, given.get(p["name"], p["default"])) for p in meta["params"]}
    if meta["needs_symbol"]:
        if not symbol:
            raise SpecError(f"{node['type']} requires a symbol")
        kwargs["symbol"] = symbol
    return meta["cls"](**kwargs)


def validate_spec(spec):
    if not isinstance(spec, dict):
        raise SpecError("Spec must be an object")
    if "alpha" not in spec or spec["alpha"] is None:
        raise SpecError("Spec requires an 'alpha'")
    # Validate each present node against the registry (a placeholder symbol satisfies
    # needs_symbol components — they only touch the DB at register(), not construction).
    for kind in ("alpha", "regime", "stop", "exit"):
        node = spec.get(kind)
        if node is not None:
            _build_node(node, kind, symbol="__validate__")
    if spec.get("rr") is not None:
        try:
            float(spec["rr"])
        except (TypeError, ValueError):
            raise SpecError("'rr' must be a number or null")
    return True


def compile_spec(spec, symbol=None, name=None):
    """Compile a validated spec into a backtesting.py Strategy subclass."""
    validate_spec(spec)
    alpha = _build_node(spec["alpha"], "alpha", symbol)
    regime = _build_node(spec["regime"], "regime", symbol) if spec.get("regime") else None
    stop = _build_node(spec["stop"], "stop", symbol) if spec.get("stop") else None
    exit_ = _build_node(spec["exit"], "exit", symbol) if spec.get("exit") else None
    rr = float(spec["rr"]) if spec.get("rr") is not None else None
    return build_strategy(alpha=alpha, regime=regime, stop=stop, exit=exit_, rr=rr,
                          name=name or spec.get("name") or "ComposedStrategy")


def _node_code(node):
    meta = REGISTRY[node["type"]]
    given = node.get("params") or {}
    args = []
    if meta["needs_symbol"]:
        args.append("symbol=symbol")
    for p in meta["params"]:
        v = given.get(p["name"], p["default"])
        args.append(f"{p['name']}={v!r}")
    return f"{NAMESPACE[meta['kind']]}.{node['type']}({', '.join(args)})"


def spec_to_code(spec):
    """Render a spec to the equivalent build_strategy(...) Python (the escape-hatch view
    and what gets stored in Strategy.code so existing run paths work unchanged)."""
    validate_spec(spec)
    parts = [f"alpha={_node_code(spec['alpha'])}"]
    for kind in ("regime", "stop", "exit"):
        if spec.get(kind):
            parts.append(f"{kind}={_node_code(spec[kind])}")
    if spec.get("rr") is not None:
        parts.append(f"rr={float(spec['rr'])!r}")
    name = (spec.get("name") or "ComposedStrategy").replace("'", "")
    parts.append(f"name={name!r}")
    return ("from stocks.services.strategy_framework import build_strategy, alphas, regimes, stops, exits\n"
            f"Strategy = build_strategy({', '.join(parts)})")
