"""Rank today's (producer × symbol) signals by validated, fee-net expectancy.

Trust gating is decisive: a DIVERGENT producer (backtest edge contradicted by its
live SignalEpisode record) scores <= 0 and sinks below everything, no matter how
good its backtest looks. Significance (Plan 2) and reportable sample size scale
the score; expectancy (Plan 1, fee-net) is the base.
"""
from stocks.services.backtest_harness.expectancy import expectancy_stats  # noqa: F401 (re-export convenience)

__all__ = ["score_opportunity", "rank_opportunities_from_rows", "rank_opportunities"]

_TRUST_FACTOR = {"CONFIRMED": 1.0, "UNCONFIRMED": 0.7, "DIVERGENT": 0.0}


def score_opportunity(direction, expectancy, pvalue, trust, regime, win_rate_reportable):
    """Composite score for ranking. DIVERGENT → <= 0 (sinks). Deterministic."""
    if trust == "DIVERGENT":
        return -1.0
    base = float(expectancy or 0.0)
    sig = 1.0 if (pvalue is not None and pvalue <= 0.05) else 0.5
    trust_f = _TRUST_FACTOR.get(trust, 0.7)
    report_f = 1.0 if win_rate_reportable else 0.8
    return base * sig * trust_f * report_f


def rank_opportunities_from_rows(rows, regime):
    """Attach `score` to each row and return sorted (DIVERGENT always last)."""
    for r in rows:
        r["score"] = score_opportunity(
            r.get("direction"), r.get("expectancy"), r.get("pvalue"),
            r.get("trust"), regime, r.get("win_rate_reportable", True),
        )
    return sorted(
        rows,
        key=lambda r: (r.get("trust") == "DIVERGENT", -r["score"], str(r.get("key"))),
    )


def rank_opportunities(symbols=None, limit=50, include_engines=True):
    """Build & rank today's opportunities. Returns {regime, opportunities:[...]}.

    For each USER_STRATEGY strategy, find symbols it signals BUY/SELL today via
    infer_current_signal; pull its backtest expectancy + excess_pvalue from a
    per-strategy basket scorecard (computed once per strategy, cached in-run);
    its live trust tier from producer_track_record; tag the regime. Engine
    producers (include_engines): use their latest ACTIVE SignalEpisodes as the
    "today" signal, with the engine's own live track record.

    infer_current_signal returns {signal, position, close, date, symbol}.
    SignalEpisode.direction is "BUY" | "SELL".
    SignalEpisode.entry_price is the Decimal price at episode open.
    """
    from stocks.models import Strategy, SignalEpisode
    from stocks.services.universe import research_universe
    from stocks.services.strategy_service import StrategyService
    from stocks.services.live_validation import producer_track_record, trust_tier
    from stocks.services.market_regime import current_regime
    from stocks.services.backtest_harness import evaluate_over_basket, load_basket

    regime = current_regime()
    syms = [s.strip().upper() for s in symbols] if symbols else sorted(research_universe())
    basket, _ = load_basket()

    rows = []
    # cache per-producer backtest metrics (expensive basket score) within this run
    bt_cache = {}

    for strat in Strategy.objects.all().order_by("id"):
        producer = SignalEpisode.make_producer_key("USER_STRATEGY", strat.id)
        # backtest hypothesis (once per strategy)
        if producer not in bt_cache:
            try:
                card = evaluate_over_basket(strat, basket, strategy_name=strat.name)
                c = card.confidence or {}
                bt_cache[producer] = {
                    "expectancy": c.get("expectancy", 0.0),
                    "pvalue": c.get("excess_pvalue", 1.0),
                    "win_rate_reportable": c.get("win_rate_reportable", False),
                }
            except Exception:
                bt_cache[producer] = {"expectancy": 0.0, "pvalue": 1.0, "win_rate_reportable": False}
        bt = bt_cache[producer]
        live = producer_track_record(producer)
        tier = trust_tier(bt["expectancy"], live)
        for sym in syms:
            try:
                sig = StrategyService.infer_current_signal(strat, sym)
            except Exception:
                continue
            # infer_current_signal returns {"signal": "BUY"|"SELL"|"NEUTRAL"|..., ...}
            direction = (sig or {}).get("signal")
            if direction not in ("BUY", "SELL"):
                continue
            rows.append({
                "key": f"{producer}|{sym}",
                "producer": producer,
                "strategy_id": strat.id,
                "strategy_name": strat.name,
                "symbol": sym,
                "direction": direction,
                "close": (sig or {}).get("close"),
                "expectancy": bt["expectancy"],
                "pvalue": bt["pvalue"],
                "win_rate_reportable": bt["win_rate_reportable"],
                "trust": tier,
                "live_win_rate": live["live_win_rate"],
                "live_resolved": live["resolved"],
                "live_avg_pnl_pct": live["avg_pnl_pct"],
            })

    if include_engines:
        engine_actives = (
            SignalEpisode.objects.filter(status="ACTIVE")
            .exclude(source="USER_STRATEGY")
        )
        if symbols:
            engine_actives = engine_actives.filter(symbol__in=syms)
        for ep in engine_actives.order_by("-start_date")[:500]:
            live = producer_track_record(ep.producer_key)
            # engines have no basket expectancy; use live avg pnl (fraction) as the edge proxy
            edge = (live["avg_pnl_pct"] or 0.0) / 100.0
            tier = trust_tier(edge, live)
            rows.append({
                "key": f"{ep.producer_key}|{ep.symbol}",
                "producer": ep.producer_key,
                "strategy_id": None,
                "strategy_name": ep.source,
                "symbol": ep.symbol,
                "direction": ep.direction,
                "close": float(ep.entry_price) if ep.entry_price else None,
                "expectancy": edge,
                "pvalue": 1.0,
                "win_rate_reportable": live["resolved"] >= 30,
                "trust": tier,
                "live_win_rate": live["live_win_rate"],
                "live_resolved": live["resolved"],
                "live_avg_pnl_pct": live["avg_pnl_pct"],
            })

    ranked = rank_opportunities_from_rows(rows, regime["regime"])[:limit]
    return {"regime": regime, "opportunities": ranked}
