"""Portfolio Advisor tools — holdings, watchlist, accounts, history, alerts."""
from __future__ import annotations

from asgiref.sync import sync_to_async
from claude_agent_sdk import tool

from stocks.models.fundamentals import StockFundamental
from stocks.models.market import DailyStockPrice
from stocks.models.portfolio import (
    PortfolioAccount,
    PortfolioItem,
    PortfolioSnapshot,
    PortfolioTarget,
    PortfolioTransaction,
    TransactionType,
    WatchlistItem,
)
from stocks.models.system import Notification
from stocks.services.fundamental_service import FundamentalService
from stocks.services.portfolio_service import PortfolioService
from stocks.services.risk_service import RiskAnalysisService
from stocks.services.total_return_service import TotalReturnService
from stocks.services.watchlist_service import WatchlistService

from .base import _jsonable, _result, _resolve_account


# ─── Portfolio overview ───────────────────────────────────────────────────────


def _build_overview_card(items):
    invested = sum(float(it.investment_value) for it in items)
    current = sum(float(it.current_value) for it in items)
    total_pl = current - invested
    day_pl = sum(float(it.day_gain_loss) for it in items)
    best = max(items, key=lambda it: float(it.gain_loss_percent or 0))
    worst = min(items, key=lambda it: float(it.gain_loss_percent or 0))
    return invested, current, total_pl, day_pl, best, worst


def _build_overview_prose(invested, current, total_pl, day_pl, best, worst, tr):
    total_pl_pct = (total_pl / invested * 100) if invested else 0
    return (
        f"Portfolio: Rs {current:,.0f} (Rs {invested:,.0f} invested). "
        f"Total P/L Rs {total_pl:+,.0f} ({total_pl_pct:+.2f}%), "
        f"day P/L Rs {day_pl:+,.0f}. "
        f"Total return incl. dividends: Rs {tr['portfolio_total_return']:+,.0f} "
        f"({tr['portfolio_total_return_pct']:+.1f}%). "
        f"Dividend and realized figures reflect your live-account history. "
        f"Best: {best.ticker} {float(best.gain_loss_percent):+.2f}%. "
        f"Worst: {worst.ticker} {float(worst.gain_loss_percent):+.2f}%."
    )


@tool(
    "get_portfolio_overview",
    "User's holdings overview: invested, current value, total/day P/L, top winner & loser. Pass account_id or omit for all accounts.",
    {"account_id": str},
)
async def get_portfolio_overview(args: dict) -> dict:
    from chat._user_context import get_user
    account_id = args.get("account_id")
    user = get_user()

    @sync_to_async
    def _run():
        qs = PortfolioItem.objects.filter(user=user)
        account = _resolve_account(user, account_id)
        if account:
            qs = qs.filter(account=account)
        items = PortfolioService.get_portfolio_metrics(qs)
        if not items:
            return _result("Your portfolio is empty.", is_error=True)
        invested, current, total_pl, day_pl, best, worst = _build_overview_card(items)
        tr = TotalReturnService.compute(user, account_id)["summary"]
        prose = _build_overview_prose(invested, current, total_pl, day_pl, best, worst, tr)
        return _result(prose, card={"type": "portfolio", "data": {
            "invested": invested, "current": current, "total_pl": total_pl,
            "total_pl_pct": (total_pl / invested * 100) if invested else 0,
            "day_pl": day_pl, "holdings_count": len(items),
            "total_return": tr,
            "best": {"ticker": best.ticker, "pct": float(best.gain_loss_percent or 0)},
            "worst": {"ticker": worst.ticker, "pct": float(worst.gain_loss_percent or 0)},
        }})

    return await _run()


@tool(
    "get_holdings",
    "All portfolio holdings with current price, P/L, sector, signals, and health score. Pass account_id to scope.",
    {"account_id": str},
)
async def get_holdings(args: dict) -> dict:
    from chat._user_context import get_user
    account_id = args.get("account_id")
    user = get_user()

    @sync_to_async
    def _run():
        qs = PortfolioItem.objects.filter(user=user)
        account = _resolve_account(user, account_id)
        if account:
            qs = qs.filter(account=account)
        items = PortfolioService.get_portfolio_metrics(qs)
        if not items:
            return _result("No holdings to display.", is_error=True)
        tr_by_ticker = {
            h["ticker"]: h
            for h in TotalReturnService.compute(user, account_id)["holdings"]
        }
        rows = _build_enriched_holding_rows(items, tr_by_ticker)
        prose = f"{len(rows)} holdings totalling Rs {sum(r['current_value'] for r in rows):,.0f}."
        return _result(prose, card={"type": "holdings", "data": {"holdings": rows}})

    return await _run()


def _build_holding_row(it):
    return {
        "ticker": it.ticker,
        "sector": getattr(it, "sector", None),
        "quantity": it.quantity,
        "wacc": float(it.wacc),
        "current_price": float(it.current_price),
        "investment": float(it.investment_value),
        "current_value": float(it.current_value),
        "gain_loss": float(it.gain_loss),
        "gain_loss_pct": float(it.gain_loss_percent or 0),
        "day_gain_loss": float(it.day_gain_loss),
        "health_score": getattr(it, "health_score", None),
        "signal": (getattr(it, "signals", None) or {}).get("summary"),
    }


def _build_enriched_holding_rows(items, tr_by_ticker):
    rows = [_build_holding_row(it) for it in items]
    for row in rows:
        tr = tr_by_ticker.get(row["ticker"], {})
        row["total_return_abs"] = tr.get("total_return_abs", 0.0)
        row["total_return_pct"] = tr.get("total_return_pct", 0.0)
    rows.sort(key=lambda r: r["current_value"], reverse=True)
    return rows


# ─── Watchlist ────────────────────────────────────────────────────────────────


@tool(
    "get_watchlist",
    "User's watchlist with current price, RSI, signal count, accumulation flag, and target/stop levels.",
    {},
)
async def get_watchlist(args: dict) -> dict:
    from chat._user_context import get_user
    user = get_user()

    @sync_to_async
    def _run():
        qs = WatchlistItem.objects.filter(user=user)
        items = WatchlistService.get_watchlist_metrics(qs)
        if not items:
            return _result("Your watchlist is empty.", is_error=True)
        rows = [_build_watchlist_row(it) for it in items]
        return _result(
            f"{len(rows)} watchlist items.",
            card={"type": "watchlist", "data": {"rows": rows}},
        )

    return await _run()


def _build_watchlist_row(it):
    return {
        "ticker": it.ticker,
        "name": getattr(it, "name", it.ticker),
        "sector": getattr(it, "sector", None),
        "current_price": float(it.current_price) if it.current_price else None,
        "day_change_pct": float(it.day_change_percent) if it.day_change_percent is not None else None,
        "rsi": getattr(it, "rsi", None),
        "target": float(it.target_price) if it.target_price else None,
        "stop": float(it.stop_loss_price) if it.stop_loss_price else None,
        "upside_pct": getattr(it, "upside_percent", None),
        "is_accumulating": getattr(it, "is_accumulating", False),
        "buy_signal_count": getattr(it, "buy_signal_count", 0),
        "health_score": getattr(it, "health_score", None),
    }


# ─── Risk, realized PnL ───────────────────────────────────────────────────────


def _market_risk_lines(market_risk):
    """Return prose lines summarising beta, VaR, and max-drawdown from market_risk block."""
    if not market_risk:
        return []
    lines = []
    beta = market_risk.get("portfolio_beta")
    if beta is not None:
        lines.append(f"  Market beta {beta} ({market_risk.get('beta_confidence')} confidence).")
    var = (market_risk.get("value_at_risk") or {}).get("var_95_1d")
    if var is not None:
        lines.append(f"  1-day 95% VaR: {var * 100:.1f}% of portfolio value.")
    dd = market_risk.get("max_drawdown")
    if dd is not None:
        lines.append(f"  Max drawdown over window: {abs(dd) * 100:.1f}%.")
    return lines


@tool(
    "get_risk_profile",
    "Concentration, liquidity, and volatility radar with alerts for the user's portfolio.",
    {"account_id": str},
)
async def get_risk_profile(args: dict) -> dict:
    from chat._user_context import get_user
    account_id = args.get("account_id")
    user = get_user()

    @sync_to_async
    def _run():
        result = RiskAnalysisService.get_risk_analysis(user, account_id=account_id)
        if not result.get("radar_data"):
            return _result("No risk data — portfolio is empty.", is_error=True)
        summary = result["summary"]
        prose_lines = [f"Portfolio risk: {summary['risk_level']} (value Rs {summary['total_value']:,.0f})."]
        prose_lines.extend(_market_risk_lines(result.get("market_risk")))
        for a in result["alerts"][:5]:
            prose_lines.append(f"  [{a['level']}] {a['message']}")
        return _result("\n".join(prose_lines), card={"type": "risk", "data": result})

    return await _run()


@tool(
    "get_realized_pnl",
    "Sum realized P/L from sell transactions, optionally scoped to an account.",
    {"account_id": str},
)
async def get_realized_pnl(args: dict) -> dict:
    from chat._user_context import get_user
    account_id = args.get("account_id")
    user = get_user()

    @sync_to_async
    def _run():
        qs = PortfolioTransaction.objects.filter(user=user, transaction_type=TransactionType.SELL)
        account = _resolve_account(user, account_id)
        if account:
            qs = qs.filter(account=account)
        agg = qs.aggregate(
            total_amount=_sum("amount"), total_receivable=_sum("receivable_amount"),
            total_cgt=_sum("cgt"), total_commission=_sum("commission"),
            total_dp=_sum("dp_charge"), total_sebon=_sum("sebon_fee"), count=_sum("quantity"),
        )
        total_amount = float(agg["total_amount"] or 0)
        total_receivable = float(agg["total_receivable"] or 0)
        total_fees = float((agg["total_commission"] or 0) + (agg["total_dp"] or 0) + (agg["total_sebon"] or 0))
        total_cgt = float(agg["total_cgt"] or 0)
        prose = (
            f"Sell transactions: Rs {total_amount:,.0f} gross, Rs {total_receivable:,.0f} net "
            f"(fees Rs {total_fees:,.0f}, CGT Rs {total_cgt:,.0f})."
        )
        return _result(prose, card={"type": "realized_pnl", "data": {
            "gross": total_amount, "net_receivable": total_receivable,
            "fees": total_fees, "cgt": total_cgt,
        }})

    return await _run()


def _sum(field):
    from django.db.models import Sum
    return Sum(field)


# ─── Portfolio accounts ───────────────────────────────────────────────────────


@tool(
    "get_portfolio_accounts",
    "List the user's portfolio accounts with account type (live/paper), balance, and default risk %.",
    {},
)
async def get_portfolio_accounts(args: dict) -> dict:
    from chat._user_context import get_user
    user = get_user()

    @sync_to_async
    def _run():
        accounts = list(
            PortfolioAccount.objects.filter(user=user).values(
                "id", "name", "account_type", "balance", "default_risk_percentage"
            )
        )
        if not accounts:
            return _result("No portfolio accounts found.", is_error=True)
        data = [_build_account_row(a) for a in accounts]
        lines = [f"{len(data)} account(s):"]
        for a in data:
            lines.append(f"  [{a['id']}] {a['name']} ({a['type']}): Rs {a['balance']:,.0f}")
        return _result("\n".join(lines), card={"type": "portfolio_accounts", "data": {"accounts": data}})

    return await _run()


def _build_account_row(a):
    return {
        "id": a["id"], "name": a["name"], "type": a["account_type"],
        "balance": float(a["balance"] or 0),
        "default_risk_pct": float(a["default_risk_percentage"] or 2),
    }


# ─── Transaction history ──────────────────────────────────────────────────────


def _build_transaction_row(r):
    return {
        "ticker": r["ticker"], "type": r["transaction_type"], "qty": r["quantity"],
        "rate": float(r["rate"]), "gross": float(r["amount"]),
        "commission": float(r["commission"] or 0), "sebon_fee": float(r["sebon_fee"] or 0),
        "dp_charge": float(r["dp_charge"] or 0), "cgt": float(r["cgt"] or 0),
        "net": float(r["receivable_amount"]),
        "date": r["transaction_date"].isoformat() if hasattr(r["transaction_date"], "isoformat") else str(r["transaction_date"]),
        "reason": r.get("reason"),
    }


@sync_to_async
def _fetch_transaction_history(user, ticker, txn_type, limit, account_id):
    qs = PortfolioTransaction.objects.filter(user=user).order_by("-transaction_date")
    if ticker:
        qs = qs.filter(ticker=ticker)
    if txn_type in ("BUY", "SELL", "BONUS", "DIVIDEND"):
        qs = qs.filter(transaction_type=txn_type)
    account = _resolve_account(user, account_id)
    if account:
        qs = qs.filter(account=account)
    rows = list(qs.values(
        "ticker", "transaction_type", "quantity", "rate", "amount",
        "commission", "sebon_fee", "dp_charge", "cgt",
        "receivable_amount", "transaction_date", "reason",
    )[:limit])
    if not rows:
        return _result("No transactions found.", is_error=True)
    data = [_build_transaction_row(r) for r in rows]
    lines = [f"Last {len(data)} transactions:"]
    for d in data[:6]:
        lines.append(
            f"  {d['date']} {d['type']} {d['ticker']} x{d['qty']} @ Rs {d['rate']:.2f} "
            f"(gross Rs {d['gross']:,.0f})"
        )
    return _result("\n".join(lines), card={"type": "transaction_history", "data": {"transactions": data}})


@tool(
    "get_transaction_history",
    "User's buy/sell transaction ledger. Filter by ticker or transaction_type='BUY'|'SELL'. "
    "Returns last N transactions with gross amount, fees (commission, SEBON, DP), CGT, and net receivable.",
    {"ticker": str, "transaction_type": str, "limit": int, "account_id": str},
)
async def get_transaction_history(args: dict) -> dict:
    from chat._user_context import get_user
    ticker = (args.get("ticker") or "").upper().strip()
    txn_type = (args.get("transaction_type") or "").upper().strip()
    limit = int(args.get("limit") or 20)
    account_id = args.get("account_id")
    user = get_user()
    return await _fetch_transaction_history(user, ticker, txn_type, limit, account_id)


# ─── Portfolio history ────────────────────────────────────────────────────────


def _build_portfolio_history_rows(rows):
    return [
        {
            "date": r["date"].isoformat(),
            "total_value": float(r["total_value"] or 0),
            "invested_value": float(r["invested_value"] or 0),
            "cash_balance": float(r["cash_balance"] or 0),
            "nepse_index": float(r["nepse_index"]) if r["nepse_index"] else None,
        }
        for r in rows
    ]


@sync_to_async
def _fetch_portfolio_history(user, days, account_id):
    qs = PortfolioSnapshot.objects.filter(user=user)
    account = _resolve_account(user, account_id)
    if account:
        qs = qs.filter(account=account)
    rows = list(qs.order_by("-date").values(
        "date", "total_value", "invested_value", "cash_balance", "nepse_index"
    )[:days])
    if not rows:
        return _result("No portfolio history snapshots available.", is_error=True)
    rows.reverse()
    first, last = rows[0], rows[-1]
    first_val = float(first["total_value"] or 0)
    last_val = float(last["total_value"] or 0)
    total_return = ((last_val - first_val) / first_val * 100) if first_val > 0 else 0
    prose = (
        f"Portfolio over {len(rows)} days: Rs {first_val:,.0f} → "
        f"Rs {last_val:,.0f} ({total_return:+.2f}% total return)."
    )
    return _result(prose, card={"type": "portfolio_history", "data": {
        "rows": _build_portfolio_history_rows(rows),
        "total_return_pct": total_return,
    }})


@tool(
    "get_portfolio_history",
    "Portfolio NAV over time: total value, invested value, and cash balance per day "
    "compared to the NEPSE index. Useful for tracking growth vs benchmark.",
    {"days": int, "account_id": str},
)
async def get_portfolio_history(args: dict) -> dict:
    from chat._user_context import get_user
    days = int(args.get("days") or 30)
    account_id = args.get("account_id")
    user = get_user()
    return await _fetch_portfolio_history(user, days, account_id)


# ─── Sector allocation ────────────────────────────────────────────────────────


def _group_items_by_sector(items, sector_map):
    sectors: dict[str, dict] = {}
    for it in items:
        sector = sector_map.get(it.ticker) or "Unknown"
        if sector not in sectors:
            sectors[sector] = {"sector": sector, "current_value": 0.0, "invested": 0.0, "count": 0, "tickers": []}
        sectors[sector]["current_value"] += float(it.current_value)
        sectors[sector]["invested"] += float(it.investment_value)
        sectors[sector]["count"] += 1
        sectors[sector]["tickers"].append(it.ticker)
    total = sum(s["current_value"] for s in sectors.values()) or 1
    allocation = sorted(sectors.values(), key=lambda s: s["current_value"], reverse=True)
    for s in allocation:
        s["weight_pct"] = s["current_value"] / total * 100
    return allocation, total


@sync_to_async
def _fetch_sector_allocation(user, account_id):
    qs = PortfolioItem.objects.filter(user=user)
    account = _resolve_account(user, account_id)
    if account:
        qs = qs.filter(account=account)
    items = PortfolioService.get_portfolio_metrics(qs)
    if not items:
        return _result("Portfolio is empty.", is_error=True)
    tickers = [it.ticker for it in items]
    sector_map = {
        f.ticker: f.sector
        for f in StockFundamental.objects.filter(ticker__in=tickers).only("ticker", "sector")
    }
    allocation, total = _group_items_by_sector(items, sector_map)
    lines = ["Portfolio sector allocation:"]
    for s in allocation[:8]:
        lines.append(
            f"  {s['sector']}: Rs {s['current_value']:,.0f} ({s['weight_pct']:.1f}%), "
            f"{s['count']} holding(s)"
        )
    return _result("\n".join(lines), card={"type": "sector_allocation", "data": {
        "total_value": total, "sectors": _jsonable(allocation),
    }})


@tool(
    "get_sector_allocation",
    "Breakdown of the user's portfolio by sector (and by tag): invested amount, current value, "
    "weight %, and number of holdings per sector.",
    {"account_id": str},
)
async def get_sector_allocation(args: dict) -> dict:
    from chat._user_context import get_user
    account_id = args.get("account_id")
    user = get_user()
    return await _fetch_sector_allocation(user, account_id)


# ─── Recent alerts ────────────────────────────────────────────────────────────


@tool(
    "get_recent_alerts",
    "User's recent notifications/alerts. filter_type filters by alert type "
    "(e.g. 'STOP_LOSS_HIT', 'TARGET_REACHED', 'RSI_OVERSOLD', 'SIGNAL_BUY'). "
    "unread_only=true returns only unread alerts. limit defaults to 15.",
    {"filter_type": str, "unread_only": bool, "limit": int},
)
async def get_recent_alerts(args: dict) -> dict:
    from chat._user_context import get_user
    filter_type = (args.get("filter_type") or "").strip().upper()
    unread_only = bool(args.get("unread_only", False))
    limit = int(args.get("limit") or 15)
    user = get_user()

    @sync_to_async
    def _run():
        qs = Notification.objects.filter(user=user)
        if filter_type:
            qs = qs.filter(type__icontains=filter_type)
        if unread_only:
            qs = qs.filter(read=False)
        alerts = list(qs.order_by("-created_at").values(
            "id", "title", "message", "type", "ticker", "read", "created_at"
        )[:limit])
        if not alerts:
            return _result("No alerts found.", is_error=True)
        data = [_build_alert_row(a) for a in alerts]
        unread = sum(1 for a in data if not a["read"])
        lines = [f"{len(data)} alerts ({unread} unread):"]
        for a in data[:6]:
            mark = "•" if not a["read"] else " "
            lines.append(f"  {mark} [{a['type']}] {a['ticker'] or ''} — {a['title']}")
        return _result("\n".join(lines), card={"type": "alerts", "data": {"alerts": data, "unread_count": unread}})

    return await _run()


def _build_alert_row(a):
    return {
        "id": a["id"], "title": a["title"], "message": a["message"],
        "type": a["type"], "ticker": a["ticker"], "read": a["read"],
        "created_at": a["created_at"].isoformat(),
    }


# ─── Watchlist item detail ────────────────────────────────────────────────────


def _build_watchlist_item_data(ticker, item, price, fund):
    ltp = float(price.close) if price and price.close else None

    def _upside(target):
        if ltp and target:
            return round((float(target) - ltp) / ltp * 100, 2)
        return None

    return {
        "ticker": ticker, "notes": item.notes,
        "target_1": float(item.target_price) if item.target_price else None,
        "target_2": float(item.target_price_2) if item.target_price_2 else None,
        "target_3": float(item.target_price_3) if item.target_price_3 else None,
        "stop_loss": float(item.stop_loss_price) if item.stop_loss_price else None,
        "alert_enabled": item.alert_enabled, "ltp": ltp,
        "date": price.date.isoformat() if price else None,
        "change_pct": float(price.diff_percent) if price and price.diff_percent else None,
        "upside_t1_pct": _upside(item.target_price),
        "upside_t2_pct": _upside(item.target_price_2),
        "downside_stop_pct": _upside(item.stop_loss_price),
        "pe": float(fund.pe_ratio) if fund and fund.pe_ratio else None,
        "dividend_yield": float(fund.dividend_yield) if fund and fund.dividend_yield else None,
    }


def _format_watchlist_item_prose(ticker, data):
    lines = [f"{ticker} watchlist detail:"]
    if data["ltp"]:
        chg = data["change_pct"] or 0
        lines.append(f"  LTP: Rs {data['ltp']:.2f} ({chg:+.2f}%)")
    if data["target_1"]:
        lines.append(f"  Target 1: Rs {data['target_1']:.2f} ({data['upside_t1_pct']:+.2f}% upside)")
    if data["target_2"]:
        lines.append(f"  Target 2: Rs {data['target_2']:.2f} ({data['upside_t2_pct']:+.2f}%)")
    if data["stop_loss"]:
        lines.append(f"  Stop Loss: Rs {data['stop_loss']:.2f} ({data['downside_stop_pct']:+.2f}%)")
    if data["notes"]:
        lines.append(f"  Notes: {data['notes'][:150]}")
    lines.append(f"  Alert: {'enabled' if data['alert_enabled'] else 'disabled'}")
    return "\n".join(lines)


@tool(
    "get_watchlist_item",
    "Deep detail on a single watchlist item for the current user: notes, target prices (up to 3), "
    "stop loss, alert enabled flag, latest price, upside %, and downside to stop.",
    {"ticker": str},
)
async def get_watchlist_item(args: dict) -> dict:
    from chat._user_context import get_user
    ticker = (args.get("ticker") or "").upper().strip()
    if not ticker:
        return _result("Ticker is required.", is_error=True)
    user = get_user()

    @sync_to_async
    def _run():
        item = WatchlistItem.objects.filter(user=user, ticker=ticker).first()
        if not item:
            return _result(f"{ticker} is not on your watchlist.", is_error=True)
        price = DailyStockPrice.objects.filter(ticker=ticker).order_by("-date").first()
        fund = StockFundamental.objects.filter(ticker=ticker).first()
        data = _build_watchlist_item_data(ticker, item, price, fund)
        prose = _format_watchlist_item_prose(ticker, data)
        return _result(prose, card={"type": "watchlist_item", "data": data})

    return await _run()


# ─── Rebalance targets ────────────────────────────────────────────────────────


def _compute_actual_sector_pct(items, sector_map):
    total_value = sum(float(it.current_value) for it in items) or 1
    actual_sectors: dict[str, float] = {}
    for it in items:
        sector = sector_map.get(it.ticker) or "Unknown"
        actual_sectors[sector] = actual_sectors.get(sector, 0.0) + float(it.current_value)
    return {s: v / total_value * 100 for s, v in actual_sectors.items()}, total_value


def _build_rebalance_target_rows(targets, actual_pct):
    rows = []
    for t in targets:
        cat = t["category_name"]
        target_pct = float(t["target_percentage"])
        actual = actual_pct.get(cat, 0.0)
        deviation = actual - target_pct
        rows.append({
            "category": cat, "type": t["target_type"],
            "target_pct": target_pct, "actual_pct": round(actual, 2),
            "deviation": round(deviation, 2),
            "status": "OVER" if deviation > 2 else ("UNDER" if deviation < -2 else "ON_TARGET"),
        })
    rows.sort(key=lambda r: abs(r["deviation"]), reverse=True)
    return rows


def _load_rebalance_data(user, account_id):
    targets = list(PortfolioTarget.objects.filter(user=user).values(
        "target_type", "category_name", "target_percentage"
    ))
    if not targets:
        return None, None, None, "no_targets"
    qs = PortfolioItem.objects.filter(user=user)
    account = _resolve_account(user, account_id)
    if account:
        qs = qs.filter(account=account)
    items = PortfolioService.get_portfolio_metrics(qs)
    if not items:
        return None, None, None, "empty"
    tickers = [it.ticker for it in items]
    sector_map = {
        f.ticker: f.sector
        for f in StockFundamental.objects.filter(ticker__in=tickers).only("ticker", "sector")
    }
    return targets, items, sector_map, None


def _format_rebalance_prose(rows, total_value):
    lines = [f"Portfolio vs target allocation ({len(rows)} targets):"]
    for r in rows:
        mark = "+" if r["status"] == "OVER" else ("-" if r["status"] == "UNDER" else "=")
        lines.append(
            f"  [{mark}] {r['category']}: target {r['target_pct']:.1f}%, "
            f"actual {r['actual_pct']:.1f}% ({r['deviation']:+.1f}%)"
        )
    return _result("\n".join(lines), card={"type": "rebalance_targets", "data": {"total_value": total_value, "rows": rows}})


@tool(
    "get_rebalance_targets",
    "Compare the user's portfolio target allocations vs actual allocations by sector. "
    "Shows target %, actual %, deviation, and whether each sector is over/under-weight.",
    {"account_id": str},
)
async def get_rebalance_targets(args: dict) -> dict:
    from chat._user_context import get_user
    account_id = args.get("account_id")
    user = get_user()

    @sync_to_async
    def _run():
        targets, items, sector_map, err = _load_rebalance_data(user, account_id)
        if err == "no_targets":
            return _result("No portfolio targets configured. Set up allocation targets in settings.", is_error=True)
        if err == "empty":
            return _result("Portfolio is empty — cannot compare to targets.", is_error=True)
        actual_pct, total_value = _compute_actual_sector_pct(items, sector_map)
        rows = _build_rebalance_target_rows(targets, actual_pct)
        return _format_rebalance_prose(rows, total_value)

    return await _run()
