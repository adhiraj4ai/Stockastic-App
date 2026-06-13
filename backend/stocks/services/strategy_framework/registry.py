"""Component registry, spec compiler, and code generator.

Turns strategies into DATA: a declarative JSON spec is validated, compiled into a
backtesting.py Strategy (via build_strategy), or rendered to the equivalent Python
snippet. The registry also serves a JSON catalog (param schemas) that the visual
builder consumes, and whose min/max/step drive the optimizer's per-component ranges.

Spec node: ``{"type": "<ComponentName>", "params": {...}}``. Top-level spec:
    {"version": 1, "alpha": <node>, "regime": <node|[nodes]|null>,
     "stop": <node|null>, "exit": <node|[nodes]|null>, "rr": <float|null>, "name": "<str>"}
Only ``alpha`` is required. ``regime`` accepts several filters (combined with AND);
``exit`` accepts several rules (any one triggers a close). Param *names* are the
descriptive keys shown in the builder; ``arg`` maps to the terse component kwarg.
"""

from . import library as L
from .base import build_strategy

__all__ = [
    "REGISTRY", "registry_schema", "validate_spec", "compile_spec", "spec_to_code",
    "spec_to_sentence", "SpecError",
]

NAMESPACE = {"alpha": "alphas", "regime": "regimes", "stop": "stops", "exit": "exits"}


class SpecError(ValueError):
    """Raised when a strategy spec is malformed (clear, user-facing message)."""


REGISTRY = {}  # type name -> metadata dict


def _p(name, type_, default, lo=None, hi=None, step=None, label=None, arg=None, options=None):
    """A parameter schema entry. `name` = descriptive spec key shown in the builder;
    `label` = human caption; `arg` = component constructor kwarg when it differs from name."""
    d = {"name": name, "type": type_, "default": default,
         "label": label or name.replace("_", " ").title()}
    if arg is not None:
        d["arg"] = arg
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
    _p("supertrend_period", "int", 10, 5, 50, 1, "ATR period", arg="period"),
    _p("atr_multiplier", "float", 3.0, 1.0, 6.0, 0.5, "ATR multiplier", arg="multiplier")],
    "Long on a bullish Supertrend flip; reverse exit on a bearish flip.")
_reg(L.SmaCross, "alpha", "SMA Crossover", "Trend", [
    _p("fast_period", "int", 20, 5, 100, 1, "Fast SMA period", arg="fast"),
    _p("slow_period", "int", 50, 20, 300, 5, "Slow SMA period", arg="slow")],
    "Fast SMA crosses above slow SMA.")
_reg(L.MacdCross, "alpha", "MACD Cross", "Momentum", [
    _p("fast_period", "int", 12, 5, 30, 1, "Fast EMA period", arg="fast"),
    _p("slow_period", "int", 26, 15, 60, 1, "Slow EMA period", arg="slow"),
    _p("signal_period", "int", 9, 3, 20, 1, "Signal EMA period", arg="signal")],
    "MACD line crosses above its signal line.")
_reg(L.DonchianBreakout, "alpha", "Donchian Breakout", "Breakout", [
    _p("entry_window", "int", 20, 5, 100, 1, "Entry high window"),
    _p("exit_window", "int", 10, 3, 60, 1, "Exit low window")],
    "Close breaks the prior N-day high; exit on the M-day low.")
_reg(L.VolumeBreakout, "alpha", "Volume Breakout", "Breakout", [
    _p("lookback_window", "int", 20, 5, 60, 1, "High lookback window", arg="lookback"),
    _p("volume_multiplier", "float", 2.0, 1.0, 5.0, 0.5, "Volume spike multiplier", arg="vol_mult")],
    "N-day-high breakout confirmed by a volume spike.")
_reg(L.ParabolicSarFlip, "alpha", "Parabolic SAR Flip", "Trend", [],
     "Close crosses above the Parabolic SAR.")
_reg(L.IchimokuCloud, "alpha", "Ichimoku Cloud", "Trend", [],
     "Price holds above the Ichimoku cloud (Span A/B).")
_reg(L.AdxDi, "alpha", "ADX / DI Trend", "Trend", [
    _p("adx_period", "int", 14, 5, 40, 1, "ADX period", arg="length"),
    _p("adx_threshold", "int", 25, 10, 50, 1, "ADX strength threshold", arg="threshold")],
    "ADX strong and +DI over -DI.")
_reg(L.KeltnerReclaim, "alpha", "Keltner Pullback", "Trend", [
    _p("keltner_period", "int", 20, 5, 60, 1, "Channel period", arg="length"),
    _p("band_multiplier", "float", 2.0, 1.0, 4.0, 0.5, "Band width (×ATR)", arg="scalar")],
    "Price reclaims a rising Keltner basis (pullback continuation).")
_reg(L.AroonCross, "alpha", "Aroon Cross", "Trend", [
    _p("aroon_period", "int", 14, 5, 40, 1, "Aroon period", arg="period"),
    _p("strength_threshold", "int", 70, 50, 100, 5, "Aroon-Up threshold", arg="strong")],
    "Aroon Up crosses above Aroon Down with strong upside.")
_reg(L.CoppockTurn, "alpha", "Coppock Curve", "Momentum", [
    _p("smoothing_period", "int", 10, 4, 20, 1, "WMA smoothing", arg="length"),
    _p("short_roc_period", "int", 11, 5, 20, 1, "Short ROC", arg="fast"),
    _p("long_roc_period", "int", 14, 8, 30, 1, "Long ROC", arg="slow")],
    "Long-term momentum: Coppock crosses up through zero.")
_reg(L.ForceIndexZero, "alpha", "Force Index", "Volume", [
    _p("ema_period", "int", 13, 2, 40, 1, "Smoothing EMA period", arg="period")],
    "Elder Force Index turns positive.")
_reg(L.ObvAboveMA, "alpha", "OBV Trend", "Volume", [
    _p("ma_period", "int", 20, 5, 60, 1, "OBV moving-average period", arg="ma")],
    "On-Balance Volume above its moving average.")
_reg(L.CmfCross, "alpha", "Chaikin Money Flow", "Volume", [
    _p("cmf_period", "int", 20, 5, 60, 1, "CMF period", arg="period"),
    _p("entry_threshold", "float", 0.05, 0.0, 0.3, 0.05, "Accumulation threshold", arg="entry")],
    "CMF crosses up through a positive accumulation threshold.")
_reg(L.RsiOversold, "alpha", "RSI Oversold", "Mean reversion", [
    _p("rsi_period", "int", 14, 2, 30, 1, "RSI period", arg="period"),
    _p("oversold_level", "int", 40, 10, 50, 1, "Oversold entry level", arg="lower"),
    _p("overbought_level", "int", 70, 50, 90, 1, "Overbought exit level", arg="upper")],
    "Buy oversold RSI; exit overbought.")
_reg(L.Rsi2Connors, "alpha", "Connors RSI-2", "Mean reversion", [
    _p("rsi_period", "int", 2, 2, 5, 1, "RSI period", arg="rsi_len"),
    _p("oversold_level", "int", 10, 2, 30, 1, "Oversold entry level", arg="lower"),
    _p("trend_sma_period", "int", 200, 50, 300, 10, "Trend SMA period", arg="sma_long"),
    _p("exit_sma_period", "int", 5, 2, 20, 1, "Exit SMA period", arg="sma_exit")],
    "Aggressive dip-buy above a long SMA, exit above a short SMA.")
_reg(L.StochRsiCross, "alpha", "Stochastic RSI Cross", "Mean reversion", [
    _p("oversold_level", "int", 20, 5, 40, 1, "Oversold level", arg="oversold"),
    _p("overbought_level", "int", 80, 60, 95, 1, "Overbought level", arg="overbought")],
    "StochRSI K-over-D cross from oversold.")
_reg(L.MfiOversold, "alpha", "Money Flow Index", "Mean reversion", [
    _p("mfi_period", "int", 14, 5, 30, 1, "MFI period", arg="period"),
    _p("oversold_level", "int", 20, 5, 40, 1, "Oversold level", arg="oversold"),
    _p("overbought_level", "int", 80, 60, 95, 1, "Overbought level", arg="overbought")],
    "Buy oversold money flow, sell into overbought.")
_reg(L.WilliamsROversold, "alpha", "Williams %R", "Mean reversion", [
    _p("williams_period", "int", 14, 5, 30, 1, "Williams %R period", arg="period"),
    _p("oversold_level", "int", -80, -95, -50, 5, "Oversold level", arg="lower"),
    _p("overbought_level", "int", -20, -50, -5, 5, "Overbought level", arg="upper")],
    "Buy deeply oversold Williams %R; exit overbought.")
_reg(L.ZScoreReversion, "alpha", "Z-Score Reversion", "Mean reversion", [
    _p("lookback_window", "int", 20, 5, 60, 1, "Lookback window", arg="window"),
    _p("entry_zscore", "float", -2.0, -3.0, -1.0, 0.25, "Entry z-score", arg="z_entry"),
    _p("exit_zscore", "float", 1.0, -1.0, 2.0, 0.25, "Exit z-score", arg="z_exit")],
    "Buy when price is z std below its rolling mean; exit on reversion.")
_reg(L.VwapReclaim, "alpha", "VWAP Reclaim", "Mean reversion", [],
     "Close reclaims the rolling VWAP from below.")
_reg(L.FibGoldenZone, "alpha", "Fibonacci Golden Zone", "Mean reversion", [
    _p("swing_lookback", "int", 50, 20, 120, 5, "Swing lookback window", arg="lookback")],
    "Buy a pullback into the 50–61.8% retracement zone.")
_reg(L.TurtleSoupReversal, "alpha", "Turtle Soup Reversal", "Reversal", [
    _p("low_lookback", "int", 20, 5, 60, 1, "Prior-low lookback", arg="lookback")],
    "False-breakout reversal: undercut then reclaim the prior N-day low.")
_reg(L.ThreeWhiteSoldiers, "alpha", "Three White Soldiers", "Price action", [
    _p("consecutive_bars", "int", 3, 2, 5, 1, "Consecutive green bars", arg="n")],
    "N consecutive higher green closes.")
_reg(L.DualThrust, "alpha", "Dual Thrust", "Breakout", [
    _p("range_window", "int", 4, 2, 20, 1, "Range lookback window", arg="n"),
    _p("upper_thrust", "float", 0.5, 0.1, 1.5, 0.1, "Upper-band thrust (K1)", arg="k1"),
    _p("lower_thrust", "float", 0.5, 0.1, 1.5, 0.1, "Lower-band thrust (K2)", arg="k2")],
    "Opening-range breakout above open + upper_thrust × range.")
_reg(L.AlligatorBreakout, "alpha", "Williams Alligator", "Trend", [
    _p("jaw_period", "int", 13, 5, 30, 1, "Jaw (slow) period", arg="jaw"),
    _p("teeth_period", "int", 8, 3, 20, 1, "Teeth (mid) period", arg="teeth"),
    _p("lips_period", "int", 5, 2, 15, 1, "Lips (fast) period", arg="lips")],
    "Alligator 'eating' (Lips>Teeth>Jaw) + fractal breakout.")
_reg(L.Nr7Breakout, "alpha", "NR7 Breakout", "Breakout", [],
     "Narrowest-range-7 contraction then breakout.")
_reg(L.InsideBarBreakout, "alpha", "Inside Bar Breakout", "Price action", [],
     "Breakout of the mother bar after an inside bar.")
_reg(L.SmaPullback, "alpha", "Golden Cross Pullback", "Trend", [
    _p("fast_period", "int", 50, 20, 100, 5, "Fast SMA period", arg="fast"),
    _p("slow_period", "int", 200, 100, 300, 10, "Slow SMA period", arg="slow"),
    _p("proximity_pct", "float", 0.02, 0.005, 0.05, 0.005, "Proximity to fast SMA", arg="near")],
    "Buy a pullback to the fast SMA inside a golden-cross uptrend.")
_reg(L.AccumulationAboveMA, "alpha", "Broker Accumulation", "Broker flow", [
    _p("top_brokers", "int", 5, 1, 30, 1, "Top brokers tracked", arg="top_n"),
    _p("ma_period", "int", 20, 5, 60, 1, "Flow MA period", arg="ma")],
    "Top brokers' cumulative net position above its MA.", needs_symbol=True)
_reg(L.AccumulationMaCross, "alpha", "Accumulation MA Cross", "Broker flow", [
    _p("top_brokers", "int", 5, 1, 30, 1, "Top brokers tracked", arg="top_n"),
    _p("fast_period", "int", 10, 3, 30, 1, "Fast flow MA", arg="fast"),
    _p("slow_period", "int", 50, 20, 120, 5, "Slow flow MA", arg="slow")],
    "Fast/slow MA crossover of top brokers' flow.", needs_symbol=True)
_reg(L.AccumulationDivergence, "alpha", "Accumulation Divergence", "Broker flow", [
    _p("lookback_window", "int", 10, 3, 40, 1, "Divergence lookback", arg="lookback")],
    "Contrarian: price falling while broker accumulation rises.", needs_symbol=True)

# --------------------------------------------------------------------------- #
# Regimes (entry filters — combine several with AND)
# --------------------------------------------------------------------------- #
_reg(L.AboveEMA, "regime", "Above EMA (uptrend)", "Trend filter", [
    _p("ema_period", "int", 200, 20, 300, 10, "EMA period", arg="period")],
    "Only allow entries while price is above a long EMA.")
_reg(L.AboveSMA, "regime", "Above SMA", "Trend filter", [
    _p("sma_period", "int", 50, 10, 300, 5, "SMA period")],
    "Only allow entries while price is above a simple moving average.")
_reg(L.AdxAbove, "regime", "ADX Above", "Trend filter", [
    _p("adx_threshold", "int", 25, 10, 50, 1, "ADX threshold", arg="threshold"),
    _p("adx_period", "int", 14, 5, 40, 1, "ADX period", arg="length")],
    "Only allow entries when ADX confirms a strong trend.")
_reg(L.RsiBand, "regime", "RSI Band", "Momentum filter", [
    _p("rsi_period", "int", 14, 2, 30, 1, "RSI period"),
    _p("min_level", "int", 35, 10, 50, 1, "Min RSI"),
    _p("max_level", "int", 70, 50, 90, 1, "Max RSI")],
    "Only enter when RSI sits in a sane band (avoid buying froth).")
_reg(L.VolumeAboveAverage, "regime", "Volume Confirmation", "Volume filter", [
    _p("volume_period", "int", 20, 5, 60, 1, "Average period"),
    _p("volume_multiplier", "float", 1.0, 0.5, 5.0, 0.25, "× average volume")],
    "Only enter when current volume is above its average.")

# --------------------------------------------------------------------------- #
# Stops
# --------------------------------------------------------------------------- #
_reg(L.AtrTrail, "stop", "ATR Trailing Stop", "Risk", [
    _p("atr_period", "int", 14, 5, 40, 1, "ATR period", arg="period"),
    _p("atr_multiplier", "float", 3.0, 1.0, 8.0, 0.5, "ATR multiplier", arg="multiplier")],
    "Trailing ATR stop — suits trend-following.")
_reg(L.FixedAtr, "stop", "Fixed ATR Stop", "Risk", [
    _p("atr_period", "int", 14, 5, 40, 1, "ATR period", arg="period"),
    _p("atr_multiplier", "float", 6.0, 1.0, 10.0, 0.5, "ATR multiplier", arg="multiplier")],
    "Fixed catastrophic ATR stop set at entry — suits mean reversion.")

# --------------------------------------------------------------------------- #
# Exits (combine several — any one triggers a close)
# --------------------------------------------------------------------------- #
_reg(L.TrendBreak, "exit", "Trend Break", "Exit", [
    _p("ema_period", "int", 200, 20, 300, 10, "EMA period")],
    "Exit when price loses a long EMA (lets winners run otherwise).")
_reg(L.TakeProfitPct, "exit", "Take Profit %", "Exit", [
    _p("target_pct", "float", 15.0, 2.0, 100.0, 1.0, "Target gain %")],
    "Bank a fixed percentage gain from the entry price.")
_reg(L.TrailingStopPct, "exit", "Trailing Stop %", "Exit", [
    _p("trail_pct", "float", 10.0, 2.0, 50.0, 1.0, "Trail distance %")],
    "Percent trailing stop from the highest close since entry.")
_reg(L.TimeExit, "exit", "Time Exit", "Exit", [
    _p("max_bars", "int", 20, 2, 250, 1, "Max bars held")],
    "Exit after a maximum number of bars held.")
_reg(L.RsiExit, "exit", "RSI Overbought Exit", "Exit", [
    _p("rsi_period", "int", 14, 2, 30, 1, "RSI period"),
    _p("exit_level", "int", 70, 50, 95, 1, "Overbought level")],
    "Exit when RSI becomes overbought.")
_reg(L.MaCrossExit, "exit", "MA Cross-Down Exit", "Exit", [
    _p("fast_period", "int", 10, 3, 60, 1, "Fast MA period"),
    _p("slow_period", "int", 30, 10, 120, 1, "Slow MA period")],
    "Exit when a fast MA crosses back below a slow MA.")


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
    kwargs = {(p.get("arg") or p["name"]): _coerce(p, given.get(p["name"], p["default"]))
              for p in meta["params"]}
    if meta["needs_symbol"]:
        if not symbol:
            raise SpecError(f"{node['type']} requires a symbol")
        kwargs["symbol"] = symbol
    return meta["cls"](**kwargs)


def _as_nodes(value):
    if value is None:
        return []
    return value if isinstance(value, list) else [value]


def _build_regime(spec, symbol):
    nodes = _as_nodes(spec.get("regime"))
    if not nodes:
        return None
    combined = _build_node(nodes[0], "regime", symbol)
    for n in nodes[1:]:
        combined = combined & _build_node(n, "regime", symbol)  # AND
    return combined


def _build_exits(spec, symbol):
    return [_build_node(n, "exit", symbol) for n in _as_nodes(spec.get("exit"))] or None


def validate_spec(spec):
    if not isinstance(spec, dict):
        raise SpecError("Spec must be an object")
    if not spec.get("alpha"):
        raise SpecError("Spec requires an 'alpha'")
    _build_node(spec["alpha"], "alpha", symbol="__validate__")
    for n in _as_nodes(spec.get("regime")):
        _build_node(n, "regime", symbol="__validate__")
    if spec.get("stop"):
        _build_node(spec["stop"], "stop", symbol="__validate__")
    for n in _as_nodes(spec.get("exit")):
        _build_node(n, "exit", symbol="__validate__")
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
    regime = _build_regime(spec, symbol)
    stop = _build_node(spec["stop"], "stop", symbol) if spec.get("stop") else None
    exits = _build_exits(spec, symbol)
    rr = float(spec["rr"]) if spec.get("rr") is not None else None
    return build_strategy(alpha=alpha, regime=regime, stop=stop, exit=exits, rr=rr,
                          name=name or spec.get("name") or "ComposedStrategy")


def _node_code(node):
    meta = REGISTRY[node["type"]]
    given = node.get("params") or {}
    args = []
    if meta["needs_symbol"]:
        args.append("symbol=symbol")
    for p in meta["params"]:
        v = given.get(p["name"], p["default"])
        args.append(f"{p.get('arg') or p['name']}={v!r}")
    return f"{NAMESPACE[meta['kind']]}.{node['type']}({', '.join(args)})"


def _phrase(node):
    meta = REGISTRY[node["type"]]
    params = node.get("params") or {}
    detail = ", ".join(f"{p['label'].lower()} {params.get(p['name'], p['default'])}"
                       for p in meta["params"][:2])
    return f"{meta['label']}" + (f" ({detail})" if detail else "")


def spec_to_sentence(spec):
    """Plain-English description of a composed strategy (for headers / chat)."""
    if not spec or not spec.get("alpha"):
        return "Empty strategy."
    s = f"Signal: {_phrase(spec['alpha'])}."
    regimes = _as_nodes(spec.get("regime"))
    if regimes:
        s += " Only enters while " + " and ".join(_phrase(n) for n in regimes) + "."
    if spec.get("stop"):
        s += f" Risk-managed with {_phrase(spec['stop'])}."
    exits = _as_nodes(spec.get("exit"))
    if exits:
        s += " Exits on " + ", or ".join(REGISTRY[n["type"]]["label"] for n in exits) \
             + " (plus the signal's own reverse)."
    if spec.get("rr") is not None:
        s += f" Take-profit at {spec['rr']}× risk."
    return s


def spec_to_code(spec):
    """Render a spec to the equivalent build_strategy(...) Python (the escape-hatch view
    and what gets stored in Strategy.code so existing run paths work unchanged)."""
    validate_spec(spec)
    parts = [f"alpha={_node_code(spec['alpha'])}"]
    regimes = _as_nodes(spec.get("regime"))
    if regimes:
        parts.append("regime=" + " & ".join(_node_code(n) for n in regimes))
    if spec.get("stop"):
        parts.append(f"stop={_node_code(spec['stop'])}")
    exits = _as_nodes(spec.get("exit"))
    if exits:
        parts.append("exit=[" + ", ".join(_node_code(n) for n in exits) + "]")
    if spec.get("rr") is not None:
        parts.append(f"rr={float(spec['rr'])!r}")
    name = (spec.get("name") or "ComposedStrategy").replace("'", "")
    parts.append(f"name={name!r}")
    return ("from stocks.services.strategy_framework import build_strategy, alphas, regimes, stops, exits\n"
            f"Strategy = build_strategy({', '.join(parts)})")
