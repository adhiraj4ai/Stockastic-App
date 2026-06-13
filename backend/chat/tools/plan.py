"""Next-day plan tools — daily plan, personal actions, ticker verdict, catalysts."""
from __future__ import annotations

from asgiref.sync import sync_to_async
from claude_agent_sdk import tool

from .base import _jsonable, _result


# ─── Plan & verdict formatting helpers ───────────────────────────────────────


def _fetch_or_compute_verdict(symbol):
    from django.core.cache import cache
    from stocks.services.ticker_verdict import build_verdict
    key = f"ticker_verdict:{symbol}"
    verdict = cache.get(key)
    if verdict is None:
        try:
            verdict = build_verdict(symbol)
        except Exception:
            return None
        cache.set(key, verdict, 900)
    return verdict


def _format_verdict_components(components):
    agreeing = components.get("agreeing_engines") or []
    conflicting = components.get("conflicting_engines") or []
    opp = components.get("opportunity") or {}
    acc = components.get("accumulation") or {}
    sector = components.get("sector") or {}
    n_agree = len(agreeing)
    agree_str = (f"{n_agree} engine{'s' if n_agree != 1 else ''} agree ({', '.join(agreeing)})"
                 if agreeing else "no agreeing engines")
    conflict_str = f"{len(conflicting)} conflicting" if conflicting else "0 conflicting"
    edge_label = opp.get("trust") or "UNCONFIRMED"
    edge_p = opp.get("pvalue")
    edge_detail = f"p={edge_p:.2f}" if edge_p is not None else "no backtest"
    acc_signal = acc.get("signal") or "unknown"
    sector_intensity = sector.get("intensity")
    sector_str = (f"sector accumulating ({sector_intensity:.1f})"
                  if sector_intensity is not None else "sector neutral")
    return agree_str, conflict_str, edge_label, edge_detail, acc_signal, sector_str


def _format_verdict_entry(entry, targets):
    status = entry.get("status", "?")
    zl = entry.get("zone_low")
    zh = entry.get("zone_high")
    close = entry.get("latest_close")
    age = entry.get("last_signal_age_days")
    tp = targets.get("tp1")
    sl = targets.get("sl")
    zone_str = (f"zone {zl:.1f}–{zh:.1f}" if zl is not None and zh is not None else "no zone")
    close_str = f", last close {close:.0f}" if close is not None else ""
    age_str = (f", signal {age} trading day{'s' if age != 1 else ''} old" if age is not None else "")
    if tp is not None and sl is not None:
        tp_sl_str = f" Targets: TP {tp:.0f} / SL {sl:.0f}."
    elif tp is not None:
        tp_sl_str = f" Target: TP {tp:.0f}."
    elif sl is not None:
        tp_sl_str = f" Stop: SL {sl:.0f}."
    else:
        tp_sl_str = ""
    return f"Entry: {status} — {zone_str}{close_str}{age_str}.{tp_sl_str}"


def _format_verdict_analog(analog):
    n = analog.get("n")
    med3d = analog.get("fwd_3d_median_pct")
    wr = analog.get("win_rate_3d")
    if n and med3d is not None:
        wr_str = f", {wr*100:.0f}% win rate" if wr is not None else ""
        return f"Similar setups (n={n}): {med3d:+.1f}% median over 3d{wr_str}."
    return None


def _build_verdict_prose(symbol, verdict):
    score = verdict.get("confluence_score", 0)
    components = verdict.get("components") or {}
    entry = verdict.get("entry")
    targets = verdict.get("targets") or {}
    analog = verdict.get("analog")
    catalyst = verdict.get("catalyst")
    as_of = verdict.get("as_of", "?")
    agree_str, conflict_str, edge_label, edge_detail, acc_signal, sector_str = _format_verdict_components(components)
    lines = [
        f"{symbol} verdict: {score}/100.",
        f"Components: {agree_str}, {conflict_str}; validated edge {edge_label} ({edge_detail}); "
        f"accumulation {acc_signal}; {sector_str}.",
    ]
    if entry:
        lines.append(_format_verdict_entry(entry, targets))
    else:
        lines.append(f"No active entry setup as of {as_of}.")
    if analog:
        analog_line = _format_verdict_analog(analog)
        if analog_line:
            lines.append(analog_line)
    if catalyst:
        ctype = catalyst.get("type", "").lower().replace("_", " ")
        days_away = catalyst.get("days_away", "?")
        lines.append(f"Catalyst: {ctype} in {days_away}d.")
    return "\n".join(lines)


# ─── Tools ────────────────────────────────────────────────────────────────────


@tool(
    "get_tomorrows_plan",
    "Tomorrow's precomputed trading plan: market regime, top IN_ZONE confluence picks with entry zones/targets/analog base rates, watch list, and upcoming catalysts. Use for 'what should I trade tomorrow', daily briefings, or before recommending entries.",
    {},
)
async def get_tomorrows_plan(args: dict) -> dict:
    @sync_to_async
    def _run():
        from chat.briefing import render_plan_briefing
        from stocks.models import DailyTradingPlan
        plan = DailyTradingPlan.objects.order_by("-date").first()
        if plan is None:
            return _result("No trading plan has been generated yet. Try again after the nightly pipeline has run.")
        prose = render_plan_briefing(plan)
        card_data = _jsonable({
            "date": plan.date.isoformat(),
            "regime": plan.regime,
            "breadth": plan.breadth,
            **(plan.payload or {}),
        })
        return _result(prose, card={"type": "daily_plan", "data": card_data}, _tool_name="get_tomorrows_plan")

    return await _run()


@tool(
    "get_my_actions",
    "The user's personal action list for the next session: their positions near "
    "stop-loss/targets, active SELL signals against their holdings, watchlist entry "
    "triggers, and risk-sized suggestions for tomorrow's plan picks. ALWAYS use this "
    "for 'what should I do with my positions/portfolio tomorrow'. No args.",
    {},
)
async def get_my_actions(args: dict) -> dict:
    @sync_to_async
    def _run():
        from chat.briefing import render_my_actions
        from stocks.models import DailyTradingPlan
        from stocks.services.daily_plan import user_overlay
        from stocks.services.position_sizing import sizing_map_for_user
        from chat._user_context import get_user
        user = get_user()
        plan = DailyTradingPlan.objects.order_by("-date").first()
        picks = plan.payload.get("picks", []) if plan else []
        overlay = user_overlay(user)
        sizing = sizing_map_for_user(user, picks)
        prose = render_my_actions(overlay, sizing, picks)
        if plan:
            prose = f"Your actions for {plan.date} (plan as of {plan.payload.get('as_of')}):\n" + prose
        return _result(prose, card={"type": "my_actions", "data": {"overlay": overlay, "sizing": sizing}})

    return await _run()


@tool(
    "get_ticker_verdict",
    "Canonical per-symbol verdict: cross-engine confluence score (0-100) with component breakdown, ATR entry-zone status (IN_ZONE/EXTENDED/STALE), TP/SL, historical analog base rates, and upcoming catalyst. ALWAYS prefer this over raw signal lists when judging whether a setup is actionable now. Args: symbol.",
    {"symbol": str},
)
async def get_ticker_verdict(args: dict) -> dict:
    symbol = (args.get("symbol") or "").strip().upper()
    if not symbol:
        return _result("A symbol is required.", is_error=True)

    @sync_to_async
    def _run():
        verdict = _fetch_or_compute_verdict(symbol)
        if verdict is None:
            return _result(f"Verdict computation failed for {symbol}.", is_error=True)
        prose = _build_verdict_prose(symbol, verdict)
        return _result(
            prose,
            card={"type": "ticker_verdict", "data": _jsonable(verdict)},
            _tool_name="get_ticker_verdict",
        )

    return await _run()


def _run_upcoming_catalysts(symbol, horizon):
    from stocks.services.catalysts import upcoming_catalysts
    all_items = upcoming_catalysts(horizon_days=horizon)
    items = [c for c in all_items if c.get("symbol") == symbol] if symbol else all_items
    if not items:
        scope = f"for {symbol}" if symbol else "market-wide"
        return _result(
            f"No dividend/book-close catalysts {scope} in the next {horizon} days.",
            card={"type": "catalysts", "data": {"horizon_days": horizon, "items": []}},
            _tool_name="get_upcoming_catalysts",
        )
    lines = [_format_catalyst_line(c) for c in items]
    scope_label = f"for {symbol}" if symbol else "(market-wide)"
    prose = f"Catalysts in the next {horizon} days {scope_label}:\n" + "\n".join(lines)
    return _result(
        prose,
        card={"type": "catalysts", "data": {"horizon_days": horizon, "items": _jsonable(items)}},
        _tool_name="get_upcoming_catalysts",
    )


@tool(
    "get_upcoming_catalysts",
    "Forward catalyst calendar (book-close dates and dividend announcements) within the next N days (default 14), market-wide or for one symbol. Book-close runs are a known NEPSE price phenomenon. Args: symbol (optional), days (optional).",
    {"symbol": str, "days": int},
)
async def get_upcoming_catalysts(args: dict) -> dict:
    raw_symbol = (args.get("symbol") or "").strip().upper()
    symbol = raw_symbol or None
    raw_days = args.get("days")
    try:
        horizon = int(raw_days) if raw_days is not None else 14
    except (TypeError, ValueError):
        horizon = 14
    horizon = max(1, min(60, horizon))
    return await sync_to_async(_run_upcoming_catalysts)(symbol, horizon)


def _format_catalyst_line(c):
    sym = c.get("symbol", "?")
    ctype = c.get("type", "").lower().replace("_", " ")
    cat_date = c.get("date", "?")
    days_away = c.get("days_away", "?")
    detail = c.get("detail", "")
    return f"{sym} — {ctype} {cat_date} (in {days_away}d): {detail}"
