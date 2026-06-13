"""Buy/Sell Strategist tools — signals, strategies, experiments."""
from __future__ import annotations

from asgiref.sync import sync_to_async
from claude_agent_sdk import tool

from stocks.models.strategy import Strategy, StrategyExperiment
from stocks.models.signal import SignalEpisode, USER_STRATEGY

from .base import _jsonable, _result, _rank_strategy_signals


# ─── Signal helpers ───────────────────────────────────────────────────────────


def _format_gen_signals(gen_signals):
    return [
        {
            "source": g.source, "signal": g.direction, "tier": g.signal_tier,
            "strength": float(g.entry_strength), "status": g.status, "ltp": float(g.entry_price),
            "target": float(g.target_price) if g.target_price else None,
            "stop": float(g.stop_loss_price) if g.stop_loss_price else None,
            "date": g.start_date.isoformat(),
        }
        for g in gen_signals
    ]


def _build_signals_prose_and_card(ticker, strat_data, gen_data, best_strategy):
    buys = (sum(1 for s in strat_data if s["signal"] == "BUY")
            + sum(1 for g in gen_data if g["signal"] == "BUY"))
    sells = (sum(1 for s in strat_data if s["signal"] == "SELL")
             + sum(1 for g in gen_data if g["signal"] == "SELL"))
    verdict = "BUY" if buys > sells else "SELL" if sells > buys else "HOLD"
    if best_strategy:
        best = strat_data[0]
        anchor = (f"best strategy: {best['strategy']} "
                  f"(WR {best['win_rate']:.1f}%, Sharpe {best['sharpe']:.2f}, "
                  f"scope: {best['optimization_scope']}) · ")
    else:
        anchor = ""
    prose = f"{anchor}{ticker}: {buys} buy / {sells} sell signals · verdict {verdict}."
    card = {"type": "signal", "data": {
        "symbol": ticker, "verdict": verdict, "buy_count": buys, "sell_count": sells,
        "strategy_signals": strat_data, "generated_signals": gen_data,
    }}
    return prose, card


# ─── Signals for ticker ───────────────────────────────────────────────────────


@tool(
    "get_signals_for_ticker",
    "Latest BUY/SELL/HOLD signals for a ticker from both strategy backtests and the smart-money generator.",
    {"ticker": str},
)
async def get_signals_for_ticker(args: dict) -> dict:
    ticker = (args.get("ticker") or "").upper().strip()
    if not ticker:
        return _result("Ticker is required.", is_error=True)

    @sync_to_async
    def _run():
        strat_signals = list(
            SignalEpisode.objects.filter(symbol=ticker, source=USER_STRATEGY)
            .select_related("strategy")
            .order_by("-start_date")[:10]
        )
        gen_signals = list(
            SignalEpisode.objects.filter(symbol=ticker).exclude(source=USER_STRATEGY).order_by("-start_date")[:10]
        )
        if not strat_signals and not gen_signals:
            return _result(f"No signals found for {ticker}.", is_error=True)
        strat_data, best_strategy = _rank_strategy_signals(strat_signals)
        gen_data = _format_gen_signals(gen_signals)
        prose, card = _build_signals_prose_and_card(ticker, strat_data, gen_data, best_strategy)
        return _result(prose, card=card)

    return await _run()


@tool(
    "get_signal_track_record",
    "Aggregate win/loss/active track record for generated signals — overall or filtered by source.",
    {"source": str},
)
async def get_signal_track_record(args: dict) -> dict:
    source = (args.get("source") or "").strip() or None

    @sync_to_async
    def _run():
        qs = SignalEpisode.objects.all()
        if source:
            qs = qs.filter(source=source)
        total = qs.count()
        if total == 0:
            return _result("No signals on record.", is_error=True)
        won = qs.filter(status="WON").count()
        lost = qs.filter(status="LOST").count()
        active = qs.filter(status="ACTIVE").count()
        resolved = won + lost
        win_rate = (won / resolved * 100) if resolved else 0.0
        prose = (
            f"Track record{f' for {source}' if source else ''}: "
            f"{total} signals · {won} won, {lost} lost, {active} active · win rate {win_rate:.1f}%"
        )
        return _result(prose, card={"type": "signal", "data": {"track_record": {
            "source": source or "ALL", "total": total, "won": won,
            "lost": lost, "active": active, "win_rate": round(win_rate, 1),
        }}})

    return await _run()


# ─── Active signals ───────────────────────────────────────────────────────────


def _build_active_signal_row(s):
    return {
        "symbol": s.symbol, "signal": s.direction, "source": s.source,
        "tier": s.signal_tier, "strength": float(s.entry_strength),
        "ltp": float(s.entry_price),
        "target": float(s.target_price) if s.target_price else None,
        "stop": float(s.stop_loss_price) if s.stop_loss_price else None,
        "rationale": s.rationale[:120] if s.rationale else None,
        "date": s.start_date.isoformat(),
    }


@sync_to_async
def _run_get_active_signals(signal_filter, source_filter, limit):
    qs = SignalEpisode.objects.filter(status="ACTIVE")
    if signal_filter in ("BUY", "SELL"):
        qs = qs.filter(direction=signal_filter)
    if source_filter:
        qs = qs.filter(source__icontains=source_filter)
    signals = list(qs.order_by("-entry_strength", "-start_date")[:limit])
    if not signals:
        return _result("No active signals found.", is_error=True)
    data = [_build_active_signal_row(s) for s in signals]
    buy_count = sum(1 for d in data if d["signal"] == "BUY")
    sell_count = sum(1 for d in data if d["signal"] == "SELL")
    lines = [f"{len(data)} active signals ({buy_count} BUY, {sell_count} SELL):"]
    for d in data[:8]:
        lines.append(
            f"  {d['symbol']} [{d['signal']}] src={d['source']} str={d['strength']:.0f} "
            f"ltp={d['ltp']} tgt={d['target'] or '?'}"
        )
    return _result(
        "\n".join(lines),
        card={"type": "active_signals", "data": {"buy_count": buy_count, "sell_count": sell_count, "signals": data}},
    )


@tool(
    "get_active_signals",
    "All currently ACTIVE generated signals across all sources, ranked by strength. "
    "Filter by signal='BUY'|'SELL' or source (e.g. 'SMART_MONEY'). limit defaults to 20.",
    {"signal": str, "source": str, "limit": int},
)
async def get_active_signals(args: dict) -> dict:
    signal_filter = (args.get("signal") or "").upper().strip()
    source_filter = (args.get("source") or "").upper().strip()
    limit = int(args.get("limit") or 20)
    return await _run_get_active_signals(signal_filter, source_filter, limit)


# ─── Strategy performance ─────────────────────────────────────────────────────


def _build_strategy_row(s):
    return {
        "id": s["id"], "name": s["name"],
        "description": s["description"][:100] if s.get("description") else None,
        "pnl_pct": float(s["pnl_percent"] or 0),
        "pnl_amount": float(s["pnl_amount"] or 0),
        "win_rate": float(s["win_rate"] or 0),
        "sharpe": float(s["sharpe_ratio"] or 0),
        "max_drawdown": float(s["max_drawdown"] or 0),
        "objective": s.get("best_objective") or "balanced",
    }


@tool(
    "get_strategy_performance",
    "Performance summary of the user's own strategies: P/L %, win rate, Sharpe ratio, max drawdown.",
    {},
)
async def get_strategy_performance(args: dict) -> dict:
    from chat._user_context import get_user
    user = get_user()

    @sync_to_async
    def _run():
        strategies = list(
            Strategy.objects.filter(user=user)
            .order_by("-pnl_percent")
            .values("id", "name", "description", "pnl_amount", "pnl", "pnl_percent",
                    "win_rate", "sharpe_ratio", "max_drawdown", "best_objective")
        )
        if not strategies:
            return _result("You have no strategies configured yet.", is_error=True)
        data = [_build_strategy_row(s) for s in strategies]
        top = max(data, key=lambda x: x["pnl_pct"])
        lines = [f"{len(data)} strategies:"]
        for d in data:
            lines.append(
                f"  {d['name']}: PnL {d['pnl_pct']:+.1f}%, WR {d['win_rate']:.1f}%, "
                f"Sharpe {d['sharpe']:.2f}, MaxDD {d['max_drawdown']:.1f}%"
            )
        return _result(
            "\n".join(lines),
            card={"type": "strategy_performance", "data": {"strategies": data, "best": top["name"]}},
        )

    return await _run()


# ─── Closed signals ───────────────────────────────────────────────────────────


def _build_closed_signal_row(s):
    return {
        "symbol": s.symbol, "signal": s.direction, "source": s.source,
        "tier": s.signal_tier, "status": s.status, "ltp": float(s.entry_price),
        "target": float(s.target_price) if s.target_price else None,
        "stop": float(s.stop_loss_price) if s.stop_loss_price else None,
        "pnl_pct": float(s.pnl_percent) if s.pnl_percent else None,
        "generated_date": s.start_date.isoformat(),
        "closed_date": s.end_date.isoformat() if s.end_date else None,
        "rationale": s.rationale[:120] if s.rationale else None,
    }


@sync_to_async
def _run_get_closed_signals(symbol, source, outcome, limit):
    qs = SignalEpisode.objects.filter(status__in=["WON", "LOST"])
    if symbol:
        qs = qs.filter(symbol=symbol)
    if source:
        qs = qs.filter(source__icontains=source)
    if outcome in ("WON", "LOST"):
        qs = qs.filter(status=outcome)
    signals = list(qs.order_by("-end_date")[:limit])
    if not signals:
        return _result("No closed signals found.", is_error=True)
    data = [_build_closed_signal_row(s) for s in signals]
    won = sum(1 for d in data if d["status"] == "WON")
    lost = sum(1 for d in data if d["status"] == "LOST")
    pnl_vals = [d["pnl_pct"] for d in data if d["pnl_pct"] is not None]
    avg_pnl = sum(pnl_vals) / len(pnl_vals) if pnl_vals else 0.0
    lines = [f"{len(data)} closed signals: {won} WON / {lost} LOST, avg P/L {avg_pnl:+.2f}%:"]
    for d in data[:8]:
        pnl_str = f"{d['pnl_pct']:+.2f}%" if d["pnl_pct"] is not None else "?"
        lines.append(
            f"  {d['symbol']} [{d['signal']}→{d['status']}] P/L {pnl_str} "
            f"src={d['source']} closed={d['closed_date'] or '?'}"
        )
    return _result(
        "\n".join(lines),
        card={"type": "closed_signals", "data": {
            "won": won, "lost": lost, "avg_pnl_pct": round(avg_pnl, 2), "signals": data,
        }},
    )


@tool(
    "get_closed_signals",
    "Historical closed signals (WON or LOST) with actual P/L outcomes. "
    "Filter by symbol, source, or outcome='WON'|'LOST'. Defaults to last 30 closed signals.",
    {"symbol": str, "source": str, "outcome": str, "limit": int},
)
async def get_closed_signals(args: dict) -> dict:
    symbol = (args.get("symbol") or "").upper().strip()
    source = (args.get("source") or "").strip()
    outcome = (args.get("outcome") or "").upper().strip()
    limit = int(args.get("limit") or 30)
    return await _run_get_closed_signals(symbol, source, outcome, limit)


# ─── Strategy experiments ─────────────────────────────────────────────────────


def _build_experiment_row(e):
    m = e.metrics or {}
    return {
        "id": e.id, "strategy": e.strategy.name, "strategy_id": e.strategy_id,
        "run_type": e.run_type, "scope_type": e.scope_type, "scope_value": e.scope_value,
        "status": e.status, "parameters": _jsonable(e.parameters),
        "sharpe": m.get("sharpe_ratio") or m.get("sharpe"),
        "win_rate": m.get("win_rate"), "max_drawdown": m.get("max_drawdown"),
        "total_return": m.get("total_return") or m.get("pnl_percent"),
        "total_trades": m.get("total_trades"),
        "created_at": e.created_at.isoformat() if hasattr(e, "created_at") and e.created_at else None,
    }


@sync_to_async
def _fetch_strategy_experiments(user, strategy_id, limit):
    qs = StrategyExperiment.objects.filter(strategy__user=user)
    if strategy_id:
        qs = qs.filter(strategy_id=int(strategy_id))
    experiments = list(qs.select_related("strategy").order_by("-created_at")[:limit])
    if not experiments:
        return _result("No backtest experiments found.", is_error=True)
    data = [_build_experiment_row(e) for e in experiments]
    best = max(data, key=lambda x: float(x["total_return"] or 0), default=None)
    lines = [f"{len(data)} backtest run(s):"]
    for d in data[:6]:
        ret = f"{float(d['total_return']):+.2f}%" if d["total_return"] is not None else "?"
        sharpe = f"{float(d['sharpe']):.2f}" if d["sharpe"] is not None else "?"
        lines.append(
            f"  {d['strategy']} [{d['scope_value']}]: return={ret}, "
            f"WR={d['win_rate'] or '?'}%, Sharpe={sharpe}"
        )
    return _result(
        "\n".join(lines),
        card={"type": "strategy_experiments", "data": {"experiments": data, "best_run": best}},
    )


@tool(
    "get_strategy_experiments",
    "Backtest / optimization run results for the user's strategies. "
    "Shows metrics: total return, win rate, Sharpe ratio, max drawdown, and parameters. "
    "Pass strategy_id (integer) to filter to one strategy.",
    {"strategy_id": int, "limit": int},
)
async def get_strategy_experiments(args: dict) -> dict:
    from chat._user_context import get_user
    strategy_id = args.get("strategy_id")
    limit = int(args.get("limit") or 10)
    user = get_user()
    return await _fetch_strategy_experiments(user, strategy_id, limit)
