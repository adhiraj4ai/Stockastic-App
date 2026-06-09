"""Single-symbol strategy scan across strategies, timeframes, and parameter ranges.

For one ticker it backtests every strategy over one or more timeframes and (optionally)
searches each composed strategy's parameter ranges, then ranks everything to surface the
single best strategy + timeframe (+ tuned params) for that stock.

- Default (no optimize): multi-strategy × multi-timeframe at default params — fast enough
  for an on-demand UI button or chat tool (~strategies × timeframes backtests).
- optimize=True: also random-searches each composed strategy's registry parameter ranges on
  its best timeframe (bounded by `trials`) — heavier; use for a deliberate "deep scan".
"""

import random
from datetime import date, timedelta

from .backtest_harness import run_backtest

TF_DAYS = {"1y": 365, "2y": 730, "3y": 1095, "5y": 1825, "max": None}
DEFAULT_TIMEFRAMES = ("1y", "3y", "5y", "max")


def _tf_start(tf):
    days = TF_DAYS.get(tf)
    return None if days is None else (date.today() - timedelta(days=days)).isoformat()


def _row(s, m, tf, tuned=None):
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
    }
    if tuned is not None:
        row["tuned_params"] = tuned
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
    {metrics, params(alpha node only, for brevity)} or None."""
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
            best = {"metrics": r.metrics, "params": cand["alpha"].get("params", {})}
    return best


def scan_symbol(symbol, strategies=None, timeframes=DEFAULT_TIMEFRAMES, optimize=False,
                trials=12, min_trades=3):
    """Scan all strategies on `symbol` across timeframes (and optionally parameter ranges).

    Returns {symbol, timeframes, optimized, buy_hold_by_tf, count, beating_bh, best,
             best_risk_adjusted, results (ranked by return desc), errors}.
    For each strategy the strongest timeframe is kept; `best` is the top return that beats
    buy-and-hold and trades >= min_trades; `best_risk_adjusted` is the top Sortino.
    """
    from ..models.strategy import Strategy
    symbol = (symbol or "").upper()
    strategies = strategies if strategies is not None else list(Strategy.objects.all())
    timeframes = tuple(timeframes)

    rows, errors, bh_by_tf = [], [], {}
    for s in strategies:
        cands = []
        for tf in timeframes:
            r = run_backtest(s, symbol, start=_tf_start(tf))
            if r.ok:
                cands.append((tf, r.metrics))
                bh_by_tf.setdefault(tf, round(r.metrics["buy_hold_return_pct"], 1))
        if not cands:
            errors.append({"id": s.id, "name": s.name, "error": "no successful backtest"})
            continue
        tf, m = max(cands, key=lambda c: c[1]["return_pct"])  # best timeframe by return
        tuned = None
        if optimize and s.spec:
            opt = _optimize_composed(s.spec, symbol, _tf_start(tf), trials)
            if opt and opt["metrics"]["return_pct"] > m["return_pct"]:
                m, tuned = opt["metrics"], opt["params"]
        rows.append(_row(s, m, tf, tuned))

    ranked = sorted(rows, key=lambda r: r["return_pct"], reverse=True)
    active = [r for r in rows if r["num_trades"] >= min_trades]
    qualified = [r for r in active if r["beats_bh"]]
    best = (sorted(qualified, key=lambda r: r["return_pct"], reverse=True) or ranked or [None])[0]
    best_ra = max(active, key=lambda r: r["sortino"], default=None)

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
