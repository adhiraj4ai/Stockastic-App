"""Analysis tools — opportunities, watchlist actions, user memory, saved analyses, accountability."""
from __future__ import annotations

from asgiref.sync import sync_to_async
from claude_agent_sdk import tool
from django.db.utils import OperationalError, ProgrammingError

from chat.models import SavedAnalysis
from chat.services.saved_match import match_saved_analyses

from .base import _jsonable, _result


# ─── Opportunity Engine ───────────────────────────────────────────────────────


@tool(
    "get_top_opportunities",
    "Today's best NEPSE BUY opportunities, ranked by validated, regime-aware, fee-net edge with live-track-record trust. Use when the user asks what to buy / best trades / opportunities right now.",
    {"limit": int, "symbols": str},
)
async def get_top_opportunities(args: dict) -> dict:
    limit = args.get("limit") or 15
    symbols_arg = (args.get("symbols") or "").strip()
    symbols = [s.strip() for s in symbols_arg.split(",")] if symbols_arg else None

    @sync_to_async
    def _run():
        from stocks.services.opportunity_engine import rank_opportunities
        res = rank_opportunities(symbols=symbols, limit=int(limit))
        reg = res["regime"]
        opps = res["opportunities"]
        if not opps:
            return _result(
                f"No ranked BUY entries right now (market regime: {reg['regime']}, "
                f"breadth {reg['breadth']}). {len(res.get('exits', []))} exit signals today.",
            )
        lines = _build_opportunity_lines(opps, int(limit))
        prose = (f"Top opportunities in a {reg['regime']} market (breadth {reg['breadth']}):\n"
                 + "\n".join(lines)
                 + "\n\nEdge is annualized, fee-net, per-symbol. CONFIRMED = backtest agrees with the "
                   "live signal record; UNCONFIRMED = not enough resolved live signals yet.")
        return _result(prose, card={"type": "opportunities", "data": res})

    return await _run()


def _build_opportunity_lines(opps, limit):
    lines = []
    for i, o in enumerate(opps[:limit]):
        live_part = ""
        if o["live_resolved"]:
            live_part = f", live win {o['live_win_rate']*100:.0f}% (n={o['live_resolved']})"
        lines.append(
            f"{i+1}. {o['symbol']} via {o['strategy_name']} — "
            f"annualized edge {o['edge']*100:.1f}%, trust {o['trust']}{live_part}"
        )
    return lines


@tool(
    "explain_opportunity",
    "Full breakdown of one opportunity: backtest edge, significance, live track record, trust tier, regime. Args: producer (e.g. 'USER_STRATEGY:15') and symbol.",
    {"producer": str, "symbol": str},
)
async def explain_opportunity(args: dict) -> dict:
    producer = (args.get("producer") or "").strip()
    symbol = (args.get("symbol") or "").strip().upper()
    if not producer or not symbol:
        return _result("Both 'producer' and 'symbol' are required.", is_error=True)

    @sync_to_async
    def _run():
        from stocks.services.opportunity_engine import rank_opportunities
        from stocks.services.live_validation import producer_track_record
        res = rank_opportunities(symbols=[symbol], limit=100)
        match = next((o for o in res["opportunities"] if o["producer"] == producer and o["symbol"] == symbol), None)
        live = producer_track_record(producer)
        reg = res["regime"]
        if not match:
            return _result(
                f"{producer} is not signalling a BUY on {symbol} today (regime {reg['regime']}). "
                f"Live record: {live['won']}W/{live['lost']}L/{live['active']}A, "
                f"avg P&L {live['avg_pnl_pct']:.1f}%.",
            )
        prose = _build_explain_prose(symbol, match, reg, live)
        return _result(prose, card={"type": "opportunity_detail",
                                    "data": {"opportunity": match, "live": live, "regime": reg}})

    return await _run()


def _build_explain_prose(symbol, match, reg, live):
    return (
        f"{symbol} via {match['strategy_name']} ({match['producer']}) — {reg['regime']} market.\n"
        f"- Annualized fee-net edge (this symbol): {match['edge']*100:.1f}%\n"
        f"- Backtest significance p-value: {match['pvalue']:.3f}"
        f" ({'significant' if match['pvalue']<=0.05 else 'not significant'})\n"
        f"- Trust: {match['trust']} — live record {live['won']}W/{live['lost']}L "
        f"(avg P&L {live['avg_pnl_pct']:.1f}%, {live['resolved']} resolved)\n"
        f"- Composite score: {match['score']:.4f}"
    )


# ─── Watchlist actions ────────────────────────────────────────────────────────


def _upsert_watchlist_item(user, symbol, updates):
    from stocks.models import WatchlistItem
    return WatchlistItem.objects.update_or_create(
        user=user, ticker=symbol,
        defaults=updates,
        create_defaults={**updates, "alert_enabled": updates.get("alert_enabled", True)},
    )


def _build_watchlist_add_prose(symbol, item, created, known):
    parts = [f"{'Added' if created else 'Updated'} {symbol} on the watchlist"]
    if item.target_price is not None:
        parts.append(f"entry target {float(item.target_price):.1f}")
    if item.stop_loss_price is not None:
        parts.append(f"stop {float(item.stop_loss_price):.1f}")
    parts.append("alerts on" if item.alert_enabled else "alerts off")
    prose = ", ".join(parts) + "."
    if not known:
        prose += f" (Note: '{symbol}' is not a listed equity I recognize — double-check the ticker.)"
    return prose


@tool(
    "add_to_watchlist",
    "Add a stock to the user's watchlist or update its levels (upsert). Optional entry "
    "target_price, stop_loss_price, notes. Alerts are enabled by default — the user gets "
    "notified on level hits and when the symbol enters its canonical entry zone. "
    "Args: symbol, target_price?, stop_loss_price?, notes?, alerts?.",
    {"symbol": str, "target_price": float, "stop_loss_price": float, "notes": str, "alerts": bool},
)
async def add_to_watchlist(args: dict) -> dict:
    symbol = (args.get("symbol") or "").strip().upper()
    if not symbol:
        return _result("'symbol' is required.", is_error=True)

    @sync_to_async
    def _run():
        from stocks.models import Company
        from chat._user_context import get_user
        user = get_user()
        try:
            known = Company.objects.filter(symbol=symbol).exists()
        except (OperationalError, ProgrammingError):
            known = True
        updates = _build_watchlist_updates(args)
        item, created = _upsert_watchlist_item(user, symbol, updates)
        prose = _build_watchlist_add_prose(symbol, item, created, known)
        return _result(prose)

    return await _run()


def _build_watchlist_updates(args):
    updates = {}
    if args.get("target_price") is not None:
        updates["target_price"] = args["target_price"]
    if args.get("stop_loss_price") is not None:
        updates["stop_loss_price"] = args["stop_loss_price"]
    if args.get("notes"):
        updates["notes"] = str(args["notes"])[:500]
    if "alerts" in args and args["alerts"] is not None:
        updates["alert_enabled"] = bool(args["alerts"])
    return updates


@tool(
    "remove_from_watchlist",
    "Remove a stock from the user's watchlist. Args: symbol.",
    {"symbol": str},
)
async def remove_from_watchlist(args: dict) -> dict:
    symbol = (args.get("symbol") or "").strip().upper()
    if not symbol:
        return _result("'symbol' is required.", is_error=True)

    @sync_to_async
    def _run():
        from stocks.models import WatchlistItem
        from chat._user_context import get_user
        deleted, _ = WatchlistItem.objects.filter(user=get_user(), ticker=symbol).delete()
        if deleted:
            return _result(f"Removed {symbol} from the watchlist.")
        return _result(f"{symbol} is not on the watchlist.")

    return await _run()


# ─── User memory ──────────────────────────────────────────────────────────────


def _clean_fact(raw: str) -> str:
    cleaned = " ".join(str(raw or "").split())
    return cleaned[:220]


@tool(
    "remember_about_user",
    "Save a short durable fact about the user for ALL future conversations (risk appetite, "
    "horizon, sector preferences/aversions, capital constraints, recurring goals). Use when the "
    "user states a lasting preference — not for one-off questions. Never store secrets, "
    "passwords, or account numbers. Args: fact.",
    {"fact": str},
)
async def remember_about_user(args: dict) -> dict:
    fact = _clean_fact(args.get("fact"))
    if not fact:
        return _result("A non-empty 'fact' is required.", is_error=True)

    @sync_to_async
    def _run():
        from chat.models import UserMemory
        from chat._user_context import get_user
        user = get_user()
        if UserMemory.objects.filter(user=user, content=fact).exists():
            return _result(f"Already remembered: {fact}")
        if UserMemory.objects.filter(user=user).count() >= UserMemory.MAX_FACTS_PER_USER:
            return _result(
                f"Memory is full ({UserMemory.MAX_FACTS_PER_USER} facts). "
                "Use forget_about_user to remove an outdated fact first.",
                is_error=True,
            )
        UserMemory.objects.create(user=user, content=fact)
        return _result(f"Remembered: {fact}")

    return await _run()


@tool(
    "forget_about_user",
    "Delete remembered facts about the user whose text contains the given substring "
    "(case-insensitive). Reports exactly what was removed. Args: match.",
    {"match": str},
)
async def forget_about_user(args: dict) -> dict:
    match = (args.get("match") or "").strip()
    if not match:
        return _result("A non-empty 'match' is required.", is_error=True)

    @sync_to_async
    def _run():
        from chat.models import UserMemory
        from chat._user_context import get_user
        user = get_user()
        hits = list(UserMemory.objects.filter(user=user, content__icontains=match))
        if not hits:
            return _result(f"No remembered facts match '{match}'.")
        removed = [m.content for m in hits]
        UserMemory.objects.filter(id__in=[m.id for m in hits]).delete()
        return _result("Forgot:\n" + "\n".join(f"- {c}" for c in removed))

    return await _run()


# ─── Accountability ───────────────────────────────────────────────────────────


@tool(
    "get_chat_action_record",
    "Honest accounting of chat's own past proposals for THIS user (last 90 days): "
    "action drafts by kind and status (proposed/confirmed/cancelled/expired), trade plans "
    "with executed/skipped legs and recorded entry prices. Consult this before giving "
    "high-conviction advice — it is your own track record. No args.",
    {},
)
async def get_chat_action_record(args: dict) -> dict:
    @sync_to_async
    def _run():
        from collections import Counter
        from datetime import timedelta
        from django.utils import timezone
        from stocks.models import TradePlan
        from stocks.models.portfolio import PortfolioActionDraft
        from chat._user_context import get_user

        user = get_user()
        since = timezone.now() - timedelta(days=90)
        drafts = PortfolioActionDraft.objects.filter(user=user, created_at__gte=since)
        plans = TradePlan.objects.filter(user=user, created_at__gte=since).prefetch_related("legs")
        if not drafts.exists() and not plans.exists():
            return _result("No chat-proposed actions in the last 90 days.")
        lines = _build_action_record_lines(drafts, plans)
        combo = Counter((d.kind, d.status) for d in drafts)
        return _result("\n".join(lines), card={"type": "chat_action_record", "data": {
            "drafts": [{"kind": k, "status": s, "count": n} for (k, s), n in combo.items()],
        }})

    return await _run()


def _build_action_record_lines(drafts, plans):
    from collections import Counter
    lines = ["Chat action record (last 90 days):"]
    combo = Counter((d.kind, d.status) for d in drafts)
    if combo:
        lines.append("Proposals:")
        for (kind, status), n in sorted(combo.items()):
            lines.append(f"- {kind} {status}: {n}")
    if plans.exists():
        lines.append("Trade plans:")
        for p in plans:
            legs = list(p.legs.all())
            executed = [l for l in legs if l.status == "EXECUTED"]
            skipped = [l for l in legs if l.status == "SKIPPED"]
            leg_bits = f"{len(executed)}/{len(legs)} legs executed"
            if skipped:
                leg_bits += f", {len(skipped)} skipped"
            entries = [f"{float(l.transaction.rate):.1f}" for l in executed if getattr(l, "transaction", None)]
            entry_bits = f" (entries at {', '.join(entries)})" if entries else ""
            lines.append(f"- {p.ticker} [{p.status}]: {leg_bits}{entry_bits}")
    lines.append(
        "Note: realized P&L attribution to chat proposals is not yet tracked — "
        "executed entries are recorded, outcomes are not attributed."
    )
    return lines


# ─── Saved analyses ───────────────────────────────────────────────────────────


@tool(
    "search_saved_analyses",
    "Search the user's saved analyses (bookmarked past analyses). Returns a compact "
    "catalog — title, category, tags, tickers, series, date, one-line summary, verdict. "
    "Call this BEFORE a fundamental or technical analysis to check for a prior analysis "
    "or recurring series on this ticker/topic, then fetch the full one with "
    "get_saved_analysis to compare what changed. Args (all optional): ticker, category, "
    "tag, series_key, query, limit.",
    {"ticker": str, "category": str, "tag": str, "series_key": str, "query": str, "limit": int},
)
def _query_saved_analyses(user, args):
    ticker = (args.get("ticker") or "").upper().strip()
    category = (args.get("category") or "").strip()
    tag = (args.get("tag") or "").strip()
    series_key = (args.get("series_key") or "").strip()
    query = (args.get("query") or "").strip()
    limit = int(args.get("limit") or 20)
    qs = SavedAnalysis.objects.filter(user=user)
    if ticker:
        qs = qs.filter(tickers__contains=[ticker])
    if category:
        qs = qs.filter(category=category)
    if tag:
        qs = qs.filter(tags__contains=[tag])
    if series_key:
        qs = qs.filter(series_key=series_key)
    records = list(qs.order_by("-created_at")[:max(1, min(limit, 50))])
    if query and not (ticker or category or tag or series_key):
        records = match_saved_analyses(user, query, limit=max(1, min(limit, 50)))
    return records


async def search_saved_analyses(args: dict) -> dict:
    from chat._user_context import get_user
    user = get_user()

    @sync_to_async
    def _run():
        records = _query_saved_analyses(user, args)
        catalog = _build_catalog(records)
        if not catalog:
            return _result("No saved analyses match.", card=None, _tool_name="search_saved_analyses")
        lines = [
            f"- [{c['id']}] {c['title']} ({c['date']}) — {c['one_liner']} "
            f"[{', '.join(c['tickers'])}{' · ' + c['series_key'] if c['series_key'] else ''}]"
            for c in catalog
        ]
        prose = "Saved analyses (use get_saved_analysis with the id for full detail):\n" + "\n".join(lines)
        return _result(prose, card={"type": "saved_analyses", "data": {"items": catalog}},
                       _tool_name="search_saved_analyses")

    return await _run()


def _build_catalog(records):
    return [{
        "id": str(r.id), "title": r.title, "category": r.category,
        "tags": r.tags, "tickers": r.tickers, "series_key": r.series_key,
        "verdict": r.verdict, "date": r.created_at.date().isoformat(), "one_liner": r.one_liner,
    } for r in records]


def _build_saved_analysis_prose(sa, series):
    transcript_link = (
        f"/chat?session={sa.session_id}" if sa.session_id else "original chat deleted"
    )
    series_lines = "\n".join(
        f"  - {s['created_at'].date().isoformat()}: {s['title']} "
        f"({s['verdict'] or 'no verdict'}) — {s['one_liner']}"
        for s in series
    )
    prose_parts = [
        f"# {sa.title}",
        f"Saved {sa.created_at.date().isoformat()} · category: {sa.category or 'none'} · "
        f"tickers: {', '.join(sa.tickers) or 'none'} · verdict: {sa.verdict or 'none'}",
        f"Transcript: {transcript_link}", "", sa.summary,
    ]
    if series_lines:
        prose_parts += ["", f"Series '{sa.series_key}' (oldest→newest):", series_lines]
    return "\n".join(prose_parts), transcript_link


def _build_saved_analysis_card(sa, series, transcript_link):
    return {
        "type": "saved_analysis",
        "data": {
            "id": str(sa.id), "title": sa.title, "summary": sa.summary,
            "category": sa.category, "tags": sa.tags, "tickers": sa.tickers,
            "series_key": sa.series_key, "verdict": sa.verdict,
            "structured": sa.structured,
            "date": sa.created_at.date().isoformat(), "transcript": transcript_link,
            "series": [
                {"id": str(s["id"]), "title": s["title"],
                 "date": s["created_at"].date().isoformat(),
                 "verdict": s["verdict"], "one_liner": s["one_liner"]}
                for s in series
            ],
        },
    }


@tool(
    "get_saved_analysis",
    "Fetch one saved analysis in full by id: the frozen summary, captured verdict, and "
    "any earlier analyses in the same series (oldest→newest) so you can describe the trend. "
    "Args: id.",
    {"id": str},
)
async def get_saved_analysis(args: dict) -> dict:
    from chat._user_context import get_user
    user = get_user()
    sa_id = (args.get("id") or "").strip()
    if not sa_id:
        return _result("id is required.", is_error=True, _tool_name="get_saved_analysis")

    @sync_to_async
    def _run():
        sa = SavedAnalysis.objects.filter(id=sa_id, user=user).first()
        if not sa:
            return _result("No saved analysis with that id.", is_error=True, _tool_name="get_saved_analysis")
        series = []
        if sa.series_key:
            series = list(
                SavedAnalysis.objects.filter(user=user, series_key=sa.series_key)
                .order_by("created_at")
                .values("id", "title", "created_at", "verdict", "one_liner")
            )
        prose, transcript_link = _build_saved_analysis_prose(sa, series)
        card = _build_saved_analysis_card(sa, series, transcript_link)
        return _result(prose, card=card, _tool_name="get_saved_analysis")

    return await _run()
