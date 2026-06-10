"""Rank today's BUY entries by a validated, frequency-aware, fee-net edge.

Ranking currency (per the design review):
- **edge** = the strategy's ANNUALIZED, fee-net return ON THIS SYMBOL (from a
  per-symbol backtest). Annualized → frequency-aware (a single multi-year
  multi-bagger no longer dominates a steady frequent strategy); per-symbol →
  two symbols of the same strategy rank differently (the basket-pooled
  expectancy used previously could not distinguish them).
- scaled by **significance** (Plan-2 family p-value), **trust** (live
  SignalEpisode confirmation), **regime-alignment** (a BUY is worth more in a
  RISK_ON market), and **sample reportability**.
- **DIVERGENT** producers (backtest edge contradicted by live record) sink below
  everything (score <= 0), regardless of backtest shine.

Only BUY signals are ranked as *entries*. SELL signals from long-only strategies
are exits, not new opportunities — they're returned separately, not scored.
Read-only: this surfaces recommendations with confidence; it never trades.
"""
__all__ = [
    "score_opportunity", "rank_opportunities_from_rows", "rank_opportunities",
    "regime_alignment_factor",
]

_TRUST_FACTOR = {"CONFIRMED": 1.0, "UNCONFIRMED": 0.7, "DIVERGENT": 0.0}


def regime_alignment_factor(direction, regime):
    """A BUY is favoured in RISK_ON, penalised in RISK_OFF; neutral otherwise."""
    if regime == "RISK_ON":
        return 1.0 if direction == "BUY" else 0.7
    if regime == "RISK_OFF":
        return 0.7 if direction == "BUY" else 1.0
    return 0.9  # NEUTRAL / UNKNOWN


def score_opportunity(direction, edge, pvalue, trust, regime, win_rate_reportable):
    """Composite ranking score. DIVERGENT → -1.0 (sinks). Deterministic.

    ``edge`` is the annualized fee-net return fraction on this symbol.
    """
    if trust == "DIVERGENT":
        return -1.0
    base = float(edge or 0.0)
    sig = 1.0 if (pvalue is not None and pvalue <= 0.05) else 0.5
    trust_f = _TRUST_FACTOR.get(trust, 0.7)
    report_f = 1.0 if win_rate_reportable else 0.8
    regime_f = regime_alignment_factor(direction, regime)
    return base * sig * trust_f * report_f * regime_f


def rank_opportunities_from_rows(rows, regime):
    """Attach ``score`` to each row and return sorted (DIVERGENT always last)."""
    for r in rows:
        r["score"] = score_opportunity(
            r.get("direction"), r.get("edge"), r.get("pvalue"),
            r.get("trust"), regime, r.get("win_rate_reportable", True),
        )
    return sorted(
        rows,
        key=lambda r: (r.get("trust") == "DIVERGENT", -r["score"], str(r.get("key"))),
    )


def rank_opportunities(symbols=None, limit=50, include_engines=True):
    """Build & rank today's BUY entries. Returns {regime, opportunities, exits, skipped}.

    For each USER_STRATEGY strategy: find symbols it signals today via
    ``infer_current_signal``. A BUY becomes a ranked entry; its **edge** is the
    annualized fee-net return from a per-symbol backtest (``run_backtest`` with
    the strategy's best_params, so the measured config matches the rule). Its
    significance is the strategy's basket family p-value (cached per producer),
    its trust the producer's live track record, tagged with the current regime.
    SELL signals are collected into ``exits`` (not scored). Engine producers
    (``include_engines``) contribute BUY entries from their latest ACTIVE
    episodes, ranked on their live realized edge (``basis="live"``).
    """
    from stocks.models import Strategy, SignalEpisode
    from stocks.services.universe import research_universe
    from stocks.services.strategy_service import StrategyService
    from stocks.services.live_validation import producer_track_record, trust_tier
    from stocks.services.market_regime import current_regime
    from stocks.services.backtest_harness import evaluate_over_basket, load_basket
    from stocks.services.backtest_harness.runner import run_backtest

    regime = current_regime()
    regime_label = regime["regime"]
    syms = [s.strip().upper() for s in symbols] if symbols else sorted(research_universe())
    basket, _ = load_basket()

    rows, exits = [], []
    skipped = 0
    # Cache the expensive per-producer basket scorecard (significance + trust input).
    bt_cache = {}

    for strat in Strategy.objects.all().order_by("id"):
        producer = SignalEpisode.make_producer_key("USER_STRATEGY", strat.id)
        if producer not in bt_cache:
            try:
                card = evaluate_over_basket(strat, basket, strategy_name=strat.name)
                c = card.confidence or {}
                bt_cache[producer] = {
                    "pvalue": c.get("excess_pvalue", 1.0),
                    "expectancy": c.get("expectancy", 0.0),  # hypothesis sign for trust
                }
            except Exception:
                bt_cache[producer] = {"pvalue": 1.0, "expectancy": 0.0}
                skipped += 1
        bt = bt_cache[producer]
        live = producer_track_record(producer)
        tier = trust_tier(bt["expectancy"], live)
        best_params = strat.best_params or None

        for sym in syms:
            try:
                sig = StrategyService.infer_current_signal(strat, sym)
            except Exception:
                skipped += 1
                continue
            direction = (sig or {}).get("signal")
            if direction == "SELL":
                exits.append({"producer": producer, "strategy_name": strat.name,
                              "symbol": sym, "close": (sig or {}).get("close")})
                continue
            if direction != "BUY":
                continue
            # Per-symbol, frequency-aware, fee-net edge — measured with the same
            # params the live rule uses, so the edge matches what fired.
            try:
                res = run_backtest(strat, sym, params=best_params)
            except Exception:
                skipped += 1
                continue
            if not res.ok:
                continue
            m = res.metrics
            edge = (m.get("ann_return_pct", 0.0) or 0.0) / 100.0
            rows.append({
                "key": f"{producer}|{sym}",
                "basis": "backtest",
                "producer": producer,
                "strategy_id": strat.id,
                "strategy_name": strat.name,
                "symbol": sym,
                "direction": "BUY",
                "close": (sig or {}).get("close"),
                "edge": edge,                       # annualized fee-net return, this symbol
                "ann_return_pct": m.get("ann_return_pct", 0.0),
                "num_trades": m.get("num_trades", 0),
                "win_rate_pct": m.get("win_rate_pct", 0.0),
                "sortino": m.get("sortino", 0.0),
                "win_rate_reportable": (m.get("num_trades", 0) >= 30),
                "pvalue": bt["pvalue"],
                "trust": tier,
                "live_win_rate": live["live_win_rate"],
                "live_resolved": live["resolved"],
                "live_avg_pnl_pct": live["avg_pnl_pct"],
            })

    if include_engines:
        engine_actives = (
            SignalEpisode.objects.filter(status="ACTIVE", direction="BUY")
            .exclude(source="USER_STRATEGY")
        )
        if symbols:
            engine_actives = engine_actives.filter(symbol__in=syms)
        for ep in engine_actives.order_by("-start_date")[:500]:
            live = producer_track_record(ep.producer_key)
            # Engines have no backtest; their edge is the live realized average.
            # basis="live" flags that this is ranked on a different basis than
            # the backtest-validated strategy entries.
            edge = (live["avg_pnl_pct"] or 0.0) / 100.0
            tier = trust_tier(edge, live)
            rows.append({
                "key": f"{ep.producer_key}|{ep.symbol}",
                "basis": "live",
                "producer": ep.producer_key,
                "strategy_id": None,
                "strategy_name": ep.source,
                "symbol": ep.symbol,
                "direction": "BUY",
                "close": float(ep.entry_price) if ep.entry_price else None,
                "edge": edge,
                "ann_return_pct": None,
                "num_trades": None,
                "win_rate_pct": round(live["live_win_rate"] * 100, 1),
                "sortino": None,
                "win_rate_reportable": live["resolved"] >= 30,
                "pvalue": 1.0,
                "trust": tier,
                "live_win_rate": live["live_win_rate"],
                "live_resolved": live["resolved"],
                "live_avg_pnl_pct": live["avg_pnl_pct"],
            })

    ranked = rank_opportunities_from_rows(rows, regime_label)[:limit]
    return {"regime": regime, "opportunities": ranked, "exits": exits, "skipped": skipped}
