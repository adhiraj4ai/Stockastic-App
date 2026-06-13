"""Single-symbol strategy scan across strategies, timeframes, and parameter ranges.

For one ticker it backtests every strategy over one or more timeframes and (optionally)
searches each composed strategy's parameter ranges, then ranks everything to surface the
single best strategy + timeframe (+ tuned params) for that stock.

- Default (no optimize): multi-strategy × multi-timeframe at default params — fast enough
  for an on-demand UI button or chat tool (~strategies × timeframes backtests).
- optimize=True: also random-searches each composed strategy's registry parameter ranges on
  its best timeframe (bounded by `trials`) — heavier; use for a deliberate "deep scan".
"""

import copy
import random
from datetime import date, timedelta

from .backtest_harness import run_backtest
from .backtest_harness.statistics import wilson_interval, winrate_is_reportable

TF_DAYS = {"1y": 365, "2y": 730, "3y": 1095, "5y": 1825, "max": None}
DEFAULT_TIMEFRAMES = ("1y", "3y", "5y", "max")


def _tf_start(tf):
    days = TF_DAYS.get(tf)
    return None if days is None else (date.today() - timedelta(days=days)).isoformat()


def _row_confidence(win_rate_pct, wins, num_trades):
    lo, hi = wilson_interval(wins, num_trades)
    return {
        "win_rate_ci": [float(round(lo, 4)), float(round(hi, 4))],
        "win_rate_reportable": winrate_is_reportable(num_trades),
    }


def _row(s, m, tf, tuned_spec=None):
    row = {
        "id": s.id, "name": s.name, "kind": "composed" if s.spec else "custom", "ok": True,
        "timeframe": tf,
        "return_pct": round(m["return_pct"], 1),
        "buy_hold_return_pct": round(m["buy_hold_return_pct"], 1),
        "excess_pct": round(m["return_pct"] - m["buy_hold_return_pct"], 1),
        "sharpe": round(m["sharpe"], 2),
        "sortino": round(m["sortino"], 2),
        "max_drawdown_pct": round(m["max_drawdown_pct"], 1),
        "win_rate_pct": round(m["win_rate_pct"], 0),
        "num_trades": int(m["num_trades"]),
        "beats_bh": m["return_pct"] > m["buy_hold_return_pct"],
        **_row_confidence(m["win_rate_pct"], m.get("wins", 0), m["num_trades"]),
    }
    if tuned_spec is not None:
        row["tuned"] = True
        row["tuned_spec"] = tuned_spec
    return row


def _sample_node(node):
    """Randomly sample a node's params within their registry min/max."""
    from .strategy_framework import REGISTRY
    meta = REGISTRY.get(node["type"])
    if not meta:
        return node
    params = dict(node.get("params") or {})
    for p in meta["params"]:
        if "min" in p and "max" in p:
            if p["type"] == "int":
                params[p["name"]] = random.randint(int(p["min"]), int(p["max"]))
            elif p["type"] == "float":
                params[p["name"]] = round(random.uniform(p["min"], p["max"]), 3)
    return {"type": node["type"], "params": params}


def _optimize_composed(spec, symbol, start, trials):
    """Bounded random search of a composed spec's parameter ranges; returns the best
    {metrics, spec(the full tuned spec)} or None."""
    from .strategy_framework import spec_to_code
    best = None
    for _ in range(trials):
        cand = dict(spec)
        cand["alpha"] = _sample_node(spec["alpha"])
        if spec.get("regime"):
            cand["regime"] = [_sample_node(n) for n in (spec["regime"] if isinstance(spec["regime"], list) else [spec["regime"]])]
        if spec.get("stop"):
            cand["stop"] = _sample_node(spec["stop"])
        if spec.get("exit"):
            cand["exit"] = [_sample_node(n) for n in (spec["exit"] if isinstance(spec["exit"], list) else [spec["exit"]])]
        try:
            r = run_backtest(spec_to_code(cand), symbol, start=start)
        except Exception:  # noqa: BLE001
            continue
        if r.ok and (best is None or r.metrics["return_pct"] > best["metrics"]["return_pct"]):
            best = {"metrics": r.metrics, "spec": cand}
    return best


def _scan_strategy(s, symbol, timeframes, optimize, trials, bh_by_tf):
    """Backtest one strategy across timeframes; return (row, error_or_None)."""
    cands = []
    for tf in timeframes:
        r = run_backtest(s, symbol, start=_tf_start(tf))
        if r.ok:
            cands.append((tf, r.metrics))
            bh_by_tf.setdefault(tf, round(r.metrics["buy_hold_return_pct"], 1))
    if not cands:
        return None, {"id": s.id, "name": s.name, "error": "no successful backtest"}
    tf, m = max(cands, key=lambda c: c[1]["return_pct"])
    tuned = None
    if optimize and s.spec:
        opt = _optimize_composed(s.spec, symbol, _tf_start(tf), trials)
        if opt and opt["metrics"]["return_pct"] > m["return_pct"]:
            m, tuned = opt["metrics"], opt["spec"]
    return _row(s, m, tf, tuned), None


def _pick_best(rows, min_trades):
    """Select best-return and best-sortino rows from `rows`."""
    ranked = sorted(rows, key=lambda r: r["return_pct"], reverse=True)
    active = [r for r in rows if r["num_trades"] >= min_trades]
    qualified = [r for r in active if r["beats_bh"]]
    best = (sorted(qualified, key=lambda r: r["return_pct"], reverse=True) or ranked or [None])[0]
    reportable_active = [r for r in active if r["win_rate_reportable"]]
    best_ra = max(reportable_active or active, key=lambda r: r["sortino"], default=None)
    return ranked, best, best_ra


def _build_scan_result(symbol, timeframes, optimize, bh_by_tf, rows, errors, ranked, best, best_ra):
    return {
        "symbol": symbol,
        "timeframes": list(timeframes),
        "optimized": bool(optimize),
        "buy_hold_by_tf": bh_by_tf,
        "count": len(rows),
        "beating_bh": sum(1 for r in rows if r["beats_bh"]),
        "best": best,
        "best_risk_adjusted": best_ra,
        "results": ranked,
        "errors": errors,
    }


def scan_symbol(symbol, strategies=None, timeframes=DEFAULT_TIMEFRAMES, optimize=False,
                trials=12, min_trades=3):
    """Scan all strategies on `symbol` across timeframes (and optionally parameter ranges).

    Returns {symbol, timeframes, optimized, buy_hold_by_tf, count, beating_bh, best,
             best_risk_adjusted, results (ranked by return desc), errors}.
    """
    from ..models.strategy import Strategy
    symbol = (symbol or "").upper()
    strategies = strategies if strategies is not None else list(Strategy.objects.all())
    timeframes = tuple(timeframes)
    rows, errors, bh_by_tf = [], [], {}
    for s in strategies:
        row, err = _scan_strategy(s, symbol, timeframes, optimize, trials, bh_by_tf)
        if err:
            errors.append(err)
        else:
            rows.append(row)
    ranked, best, best_ra = _pick_best(rows, min_trades)
    return _build_scan_result(symbol, timeframes, optimize, bh_by_tf, rows, errors, ranked, best, best_ra)


# ─────────────────────────────────────────────────────────────────────────────
# Spec-based optimization (composed strategies)
#
# Composed strategies can't be tuned by the regex/class-attr optimizer because their
# parameters live inside spec components. This searches the spec's registry parameter
# ranges directly (recompiling the spec each trial) so backtest, optimize, and code all
# stay consistent — and publishing simply replaces the strategy's spec with the best one.
# ─────────────────────────────────────────────────────────────────────────────
def _as_node_list(v):
    return v if isinstance(v, list) else ([v] if v else [])


def _normalize_spec(spec):
    spec = copy.deepcopy(spec)
    spec["regime"] = _as_node_list(spec.get("regime"))
    spec["exit"] = _as_node_list(spec.get("exit"))
    return spec


def spec_param_space(spec):
    """{path -> {type, min, max, default}} for every tunable param in the spec.

    Path = 'alpha.<p>' | 'regime{i}.<p>' | 'stop.<p>' | 'exit{i}.<p>'.
    """
    from .strategy_framework import REGISTRY
    spec = _normalize_spec(spec)
    space = {}

    def add(node, prefix):
        meta = REGISTRY.get(node["type"])
        if not meta:
            return
        for p in meta["params"]:
            if "min" in p and "max" in p:
                space[f"{prefix}.{p['name']}"] = {
                    "type": p["type"], "min": p["min"], "max": p["max"], "label": p.get("label", p["name"]),
                    "default": (node.get("params") or {}).get(p["name"], p["default"]),
                }

    if spec.get("alpha"):
        add(spec["alpha"], "alpha")
    for i, n in enumerate(spec["regime"]):
        add(n, f"regime{i}")
    if spec.get("stop"):
        add(spec["stop"], "stop")
    for i, n in enumerate(spec["exit"]):
        add(n, f"exit{i}")
    return space


def _node_at(spec, path):
    kind = path.split(".")[0]
    if kind == "alpha":
        return spec.get("alpha")
    if kind == "stop":
        return spec.get("stop")
    if kind.startswith("regime"):
        return spec["regime"][int(kind[len("regime"):])]
    if kind.startswith("exit"):
        return spec["exit"][int(kind[len("exit"):])]
    return None


def _apply_path(spec, path, value):
    node = _node_at(spec, path)
    if node is not None:
        node.setdefault("params", {})[path.split(".", 1)[1]] = value


def _score(m, objective):
    if objective == "win_rate":
        return m["win_rate_pct"]
    if objective == "profit":
        return m["return_pct"]
    return m["win_rate_pct"] * 2 + m["return_pct"] / 10.0  # balanced


def _make_sampler(space, ranges):
    """Return a callable sample(path, info) that draws from overridden or registry ranges."""
    def sample(path, info):
        lo, hi = ranges.get(path, [info["min"], info["max"]])[:2]
        if info["type"] == "int":
            return random.randint(int(lo), int(hi))
        return round(random.uniform(float(lo), float(hi)), 3)
    return sample


def _make_evaluator(symbol, starts, min_trades):
    """Return a callable evaluate(code) that backtests code across all starts."""
    def evaluate(code):
        out = []
        for st in starts:
            try:
                r = run_backtest(code, symbol, start=st)
            except Exception:  # noqa: BLE001
                continue
            if r.ok and r.metrics["num_trades"] >= min_trades:
                out.append(r.metrics)
        return out
    return evaluate


def _run_spec_trials(spec, space, n_trials, sample, evaluate, objective):
    """Random-search the spec's param space; return the best candidate dict or None."""
    from .strategy_framework import spec_to_code
    best = None
    for _ in range(n_trials):
        cand = copy.deepcopy(spec)
        for path, info in space.items():
            _apply_path(cand, path, sample(path, info))
        mets = evaluate(spec_to_code(cand))
        if not mets:
            continue
        avg = sum(_score(m, objective) for m in mets) / len(mets)
        if best is None or avg > best["score"]:
            best = {
                "score": round(avg, 2), "spec": cand,
                "params": {p: (_node_at(cand, p).get("params") or {}).get(p.split(".", 1)[1]) for p in space},
                "metrics": mets[-1],
            }
    return best


def optimize_spec(spec, symbol, param_ranges=None, n_trials=40,
                  timeframes=("3y", "max"), objective="balanced", min_trades=2):
    """Random-search a composed spec's parameter ranges on `symbol` across timeframes.

    Returns {best:{params(path->value), spec, metrics, score}, baseline_metrics, space, ...}.
    `param_ranges` (optional) overrides registry ranges, keyed by the same paths.
    """
    from .strategy_framework import spec_to_code
    spec = _normalize_spec(spec)
    space = spec_param_space(spec)
    starts = [_tf_start(tf) for tf in timeframes]
    evaluate = _make_evaluator(symbol, starts, min_trades)
    sample = _make_sampler(space, param_ranges or {})
    base = evaluate(spec_to_code(spec))
    best = _run_spec_trials(spec, space, n_trials, sample, evaluate, objective)
    return {
        "symbol": symbol, "objective": objective, "timeframes": list(timeframes),
        "space": {k: {"min": v["min"], "max": v["max"], "type": v["type"], "label": v["label"], "default": v["default"]} for k, v in space.items()},
        "baseline_metrics": base[-1] if base else None,
        "best": best,
    }
