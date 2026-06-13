"""Strategy builder / inference tools — build, describe, backtest, scan strategies."""
from __future__ import annotations

from asgiref.sync import sync_to_async
from claude_agent_sdk import tool

from stocks.models.strategy import Strategy

from .base import _result


# ─── List components ──────────────────────────────────────────────────────────


@tool(
    "list_strategy_components",
    "List the building blocks (signals, entry filters, stops, exits) available to compose "
    "a strategy, with their parameters. Call this BEFORE drafting a strategy spec.",
    {},
)
async def list_strategy_components(args: dict) -> dict:
    @sync_to_async
    def _run():
        from stocks.services.strategy_framework import registry_schema
        sch = registry_schema()
        lines = []
        for kind in ("alpha", "regime", "stop", "exit"):
            lines.append(f"{kind.upper()}S:")
            for c in sch[kind]:
                ps = ", ".join(p["name"] for p in c["params"]) or "no params"
                lines.append(f"  {c['type']} — {c['desc']} [{ps}]")
        return _result("\n".join(lines), card={"type": "strategy_components", "data": sch})

    return await _run()


@tool(
    "describe_strategy",
    "Explain a strategy in plain English with its headline metrics. Provide strategy_id.",
    {"strategy_id": int},
)
async def describe_strategy(args: dict) -> dict:
    sid = args.get("strategy_id")

    @sync_to_async
    def _run():
        from stocks.services.strategy_framework import spec_to_sentence
        from stocks.serializers.strategy import StrategySerializer
        s = Strategy.objects.filter(id=sid).first()
        if not s:
            return _result(f"No strategy with id {sid}.", is_error=True)
        d = StrategySerializer(s).data
        desc = spec_to_sentence(s.spec) if s.spec else (s.description or "Custom Python strategy.")
        m = d.get("metrics_summary") or {}
        prose = (f"{s.name} ({d['kind']}): {desc}\n"
                 f"Metrics — return {m.get('return_pct')}%, Sharpe {m.get('sharpe')}, "
                 f"win {m.get('win_rate')}%, max drawdown {m.get('max_drawdown')}%.")
        return _result(prose, card={"type": "strategy_description",
                                    "data": {"id": s.id, "name": s.name, "kind": d["kind"],
                                             "summary": desc, "metrics": m}})

    return await _run()


@tool(
    "backtest_strategy",
    "Run a backtest of a strategy on a symbol and report performance vs buy-and-hold. "
    "Provide strategy_id and symbol (e.g. NABIL).",
    {"strategy_id": int, "symbol": str},
)
async def backtest_strategy(args: dict) -> dict:
    sid = args.get("strategy_id")
    symbol = (args.get("symbol") or "").upper()

    @sync_to_async
    def _run():
        from stocks.services.backtest_harness import run_backtest
        s = Strategy.objects.filter(id=sid).first()
        if not s:
            return _result(f"No strategy with id {sid}.", is_error=True)
        r = run_backtest(s, symbol)
        if not r.ok:
            return _result(f"Backtest failed for {symbol}: {r.error}", is_error=True)
        m = r.metrics
        prose = (f"{s.name} on {symbol} (full history): return {m['return_pct']:.1f}% vs "
                 f"buy&hold {m['buy_hold_return_pct']:.1f}%, Sharpe {m['sharpe']:.2f}, "
                 f"Sortino {m['sortino']:.2f}, max drawdown {m['max_drawdown_pct']:.1f}%, "
                 f"win rate {m['win_rate_pct']:.0f}%, {m['num_trades']} trades.")
        return _result(prose, card={"type": "strategy_backtest",
                                    "data": {"strategy": s.name, "symbol": symbol, **m}})

    return await _run()


@tool(
    "strategy_signal_today",
    "What is a strategy signaling for a symbol right now (BUY / SELL / HOLD / NEUTRAL)? "
    "Runs the strategy to the latest bar. Provide strategy_id and symbol.",
    {"strategy_id": int, "symbol": str},
)
async def strategy_signal_today(args: dict) -> dict:
    sid = args.get("strategy_id")
    symbol = (args.get("symbol") or "").upper()

    @sync_to_async
    def _run():
        from stocks.services.strategy_service import StrategyService
        s = Strategy.objects.filter(id=sid).first()
        if not s:
            return _result(f"No strategy with id {sid}.", is_error=True)
        res = StrategyService.infer_current_signal(s, symbol)
        prose = f"{s.name} on {symbol}: currently {res['signal']} (as of {res.get('date')}, close {res.get('close')})."
        return _result(prose, card={"type": "strategy_signal", "data": {"strategy": s.name, **res}})

    return await _run()


@tool(
    "draft_strategy",
    "Create a DRAFT strategy from a composition spec for the user to review and save in the "
    "builder. Provide name and spec — a JSON object with alpha (required), optional regime "
    "(list), stop, exit (list) and rr, using component types from list_strategy_components, "
    "e.g. {'alpha':{'type':'SupertrendFlip'},'regime':[{'type':'AboveEMA'}],'stop':{'type':'AtrTrail'}}.",
    {"name": str, "spec": dict},
)
async def draft_strategy(args: dict) -> dict:
    from chat._user_context import get_user
    user = get_user()
    name = args.get("name") or "Drafted Strategy"
    spec = args.get("spec")

    @sync_to_async
    def _run():
        from stocks.services.strategy_framework import validate_spec, spec_to_code, spec_to_sentence, SpecError
        try:
            validate_spec(spec)
            code = spec_to_code(spec)
        except SpecError as e:
            return _result(f"That spec is invalid: {e}. Call list_strategy_components for valid types.", is_error=True)
        sentence = spec_to_sentence(spec)
        s = Strategy.objects.create(
            user=user, name=name,
            description=f"Drafted via chat. {sentence}",
            code=code, spec=spec, is_public=False,
        )
        return _result(
            f"Drafted '{name}' (id {s.id}). {sentence}\nReview & save it in the builder: /strategies/{s.id}/builder",
            card={"type": "strategy_draft", "data": {
                "id": s.id, "name": name, "summary": sentence,
                "url": f"/strategies/{s.id}/builder",
            }},
        )

    return await _run()


@tool(
    "scan_strategies_for_symbol",
    "Backtest ALL strategies on one symbol across multiple timeframes (1y/3y/5y/max) and "
    "rank them to find the best strategy for THAT stock. Use for 'which strategy works best "
    "on X' or as part of an in-depth symbol analysis. Provide symbol.",
    {"symbol": str},
)
async def scan_strategies_for_symbol(args: dict) -> dict:
    symbol = (args.get("symbol") or "").upper()

    @sync_to_async
    def _run():
        from stocks.services.strategy_scan import scan_symbol
        res = scan_symbol(symbol, timeframes=("1y", "3y", "5y", "max"))
        if not res["results"]:
            return _result(f"No strategies could be backtested on {symbol}.", is_error=True)
        b, ra = res["best"], res["best_risk_adjusted"]
        lines = [f"Scanned {res['count']} strategies on {symbol} across 1y/3y/5y/max — "
                 f"{res['beating_bh']} beat buy-and-hold on their best timeframe."]
        if b:
            lines.append(f"Best by return: {b['name']} {b['return_pct']:+.0f}% on {b['timeframe']} "
                         f"(buy&hold {b['buy_hold_return_pct']:+.0f}%, Sharpe {b['sharpe']}, {b['num_trades']} trades).")
        if ra:
            lines.append(f"Best risk-adjusted: {ra['name']} (Sortino {ra['sortino']}, "
                         f"{ra['return_pct']:+.0f}% on {ra['timeframe']}).")
        lines.append("Top: " + "; ".join(f"{r['name']} {r['return_pct']:+.0f}% ({r['timeframe']})"
                                         for r in res["results"][:5]))
        return _result("\n".join(lines), card={"type": "strategy_scan", "data": res})

    return await _run()
