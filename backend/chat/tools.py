"""Stockastic chat tools — Claude Agent SDK MCP server.

Each @tool function is async, reads the current user from chat._user_context,
queries Django models / services, and returns the SDK content shape. Render
payloads ("cards") are pushed to a per-turn ContextVar buffer via
``_user_context.push_card`` so the SSE adapter in ``chat.streaming`` can emit
them as separate ``card`` events without putting JSON in the model's context.
"""

from __future__ import annotations

import json
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Any

from asgiref.sync import sync_to_async
from claude_agent_sdk import create_sdk_mcp_server, tool
from django.db.models import Avg, Sum

from stocks.models.fundamentals import Dividend, StockFundamental
from stocks.models.market import (
    Company,
    DailyCumulativeAccumulation,
    DailyFloorsheet,
    DailyMarketSummary,
    DailyStockPrice,
)
from stocks.models.portfolio import (
    PortfolioAccount,
    PortfolioItem,
    PortfolioTransaction,
    TransactionType,
    WatchlistItem,
)
from stocks.models.strategy import StrategySignal
from stocks.models.system import GeneratedSignal
from stocks.services.fundamental_service import FundamentalService
from stocks.services.portfolio_service import PortfolioService
from stocks.services.position_sizing import PositionSizingService
from stocks.services.risk_service import RiskAnalysisService
from stocks.services.watchlist_service import WatchlistService
from stocks.technical import get_technical_indicators

from ._user_context import get_user, push_card


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────


def _jsonable(value: Any) -> Any:
    """Recursively coerce Decimals, dates, and other Django values to JSON-safe types."""
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    if isinstance(value, dict):
        return {k: _jsonable(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_jsonable(v) for v in value]
    return value


def _result(text: str, *, card: dict | None = None, is_error: bool = False, _tool_name: str = "") -> dict:
    """Build the SDK tool-result shape and side-channel the card.

    The model sees only the text content. Cards go to streaming.py via
    the ContextVar buffer so they can be rendered as gen-UI without
    bloating the model's context window.
    """
    if card is not None:
        push_card(_tool_name, _jsonable(card))
    return {
        "content": [{"type": "text", "text": text}],
        "is_error": is_error,
    }


def _resolve_account(user, account_id: str | int | None) -> PortfolioAccount | None:
    if account_id in (None, "", "all"):
        return None
    try:
        return PortfolioAccount.objects.get(id=int(account_id), user=user)
    except (PortfolioAccount.DoesNotExist, ValueError, TypeError):
        return None


# ─────────────────────────────────────────────────────────────────────────────
# Market Analyst tools
# ─────────────────────────────────────────────────────────────────────────────


@tool("get_market_summary", "Latest NEPSE market snapshot: index points, turnover, volume, advancers/decliners, and the date.", {})
async def get_market_summary(args: dict) -> dict:
    @sync_to_async
    def _run():
        latest = DailyMarketSummary.objects.order_by("-date").first()
        if not latest:
            return _result("No market summary available yet — data ingestion may be pending.", is_error=True)
        data = {
            "date": latest.date.isoformat(),
            "total_turnover": float(latest.total_turnover or 0),
            "total_volume": int(latest.total_volume or 0),
            "total_transactions": int(latest.total_transactions or 0),
            "top_gainers": _jsonable(latest.top_gainers)[:5],
            "top_losers": _jsonable(latest.top_losers)[:5],
            "sector_turnover": _jsonable(latest.sector_turnover),
        }
        prose = (
            f"NEPSE summary for {data['date']}: turnover Rs {data['total_turnover']:,.0f} "
            f"across {data['total_transactions']:,} transactions, volume {data['total_volume']:,}."
        )
        return _result(prose, card={"type": "market_summary", "data": data})

    return await _run()


@tool(
    "get_top_movers",
    "Top gainers or losers for the latest trading day. direction='gainers'|'losers', limit defaults to 10.",
    {"direction": str, "limit": int},
)
async def get_top_movers(args: dict) -> dict:
    direction = (args.get("direction") or "gainers").lower()
    limit = int(args.get("limit") or 10)

    @sync_to_async
    def _run():
        latest = DailyMarketSummary.objects.order_by("-date").first()
        if not latest:
            return _result("No market data available.", is_error=True)
        rows = latest.top_gainers if direction == "gainers" else latest.top_losers
        rows = _jsonable(rows or [])[:limit]
        prose_lines = [f"Top {direction} on {latest.date.isoformat()}:"]
        for r in rows:
            sym = r.get("symbol") or r.get("ticker") or "?"
            chg = r.get("price_change") or r.get("change_percent") or r.get("change") or 0
            prose_lines.append(f"  {sym}: {chg}%")
        return _result(
            "\n".join(prose_lines),
            card={"type": "market_summary", "data": {
                "date": latest.date.isoformat(),
                "top_gainers": rows if direction == "gainers" else [],
                "top_losers": rows if direction == "losers" else [],
            }},
        )

    return await _run()


@tool(
    "get_index_history",
    "NEPSE total-turnover history for the last N trading days (default 30).",
    {"days": int},
)
async def get_index_history(args: dict) -> dict:
    days = int(args.get("days") or 30)

    @sync_to_async
    def _run():
        rows = list(
            DailyMarketSummary.objects.order_by("-date").values(
                "date", "total_turnover", "total_volume", "total_transactions"
            )[:days]
        )
        rows.reverse()
        if not rows:
            return _result("No market history available.", is_error=True)
        first, last = rows[0], rows[-1]
        prose = (
            f"Last {len(rows)} sessions: turnover went from "
            f"Rs {float(first['total_turnover']):,.0f} on {first['date']} to "
            f"Rs {float(last['total_turnover']):,.0f} on {last['date']}."
        )
        return _result(prose, card={"type": "market_summary", "data": {
            "date": last["date"].isoformat() if hasattr(last["date"], "isoformat") else str(last["date"]),
            "history": _jsonable(rows),
        }})

    return await _run()


@tool(
    "get_floorsheet_whales",
    "Top brokers by turnover on a given date (defaults to most recent). Returns broker IDs and total turnover.",
    {"date": str, "limit": int},
)
async def get_floorsheet_whales(args: dict) -> dict:
    requested_date = args.get("date")
    limit = int(args.get("limit") or 10)

    @sync_to_async
    def _run():
        latest = (
            DailyFloorsheet.objects.filter(transaction_date=requested_date).first()
            if requested_date
            else DailyFloorsheet.objects.order_by("-transaction_date").first()
        )
        if not latest:
            return _result("No floorsheet data found for that date.", is_error=True)
        target = latest.transaction_date

        buyers = list(
            DailyFloorsheet.objects.filter(transaction_date=target)
            .values("buyer_id")
            .annotate(turnover=Sum("transaction_amount"))
            .order_by("-turnover")[:limit]
        )
        whales = []
        for row in buyers:
            picks = list(
                DailyFloorsheet.objects.filter(
                    transaction_date=target, buyer_id=row["buyer_id"]
                )
                .values("symbol")
                .annotate(turnover=Sum("transaction_amount"), quantity=Sum("transaction_quantity"))
                .order_by("-turnover")[:3]
            )
            whales.append({
                "broker_id": row["buyer_id"],
                "total_turnover": float(row["turnover"] or 0),
                "top_picks": [
                    {
                        "symbol": p["symbol"],
                        "turnover": float(p["turnover"] or 0),
                        "quantity": int(p["quantity"] or 0),
                    }
                    for p in picks
                ],
            })

        prose = "\n".join(
            [f"Top buyer brokers on {target}:"]
            + [f"  #{w['broker_id']}: Rs {w['total_turnover']:,.0f}" for w in whales[:5]]
        )
        return _result(prose, card={"type": "whale_watch", "data": {"date": target.isoformat(), "whales": whales}})

    return await _run()


# ─────────────────────────────────────────────────────────────────────────────
# Stock Analyst tools
# ─────────────────────────────────────────────────────────────────────────────


@tool(
    "get_stock_quote",
    "Latest quote for a ticker: price, day change, volume, sector, 52w range.",
    {"ticker": str},
)
async def get_stock_quote(args: dict) -> dict:
    ticker = (args.get("ticker") or "").upper().strip()
    if not ticker:
        return _result("Ticker is required.", is_error=True)

    @sync_to_async
    def _run():
        price = DailyStockPrice.objects.filter(ticker=ticker).order_by("-date").first()
        if not price:
            return _result(f"No price data for {ticker}.", is_error=True)
        company = Company.all_objects.filter(symbol=ticker).first()
        fund = StockFundamental.objects.filter(ticker=ticker).first()
        data = {
            "symbol": ticker,
            "name": company.name if company else ticker,
            "sector": company.sector if company else None,
            "price": float(price.close or 0),
            "change": float(price.diff or 0),
            "change_pct": float(price.diff_percent or 0),
            "volume": int(price.volume or 0),
            "high_52w": float(fund.fifty_two_week_high) if fund and fund.fifty_two_week_high else None,
            "low_52w": float(fund.fifty_two_week_low) if fund and fund.fifty_two_week_low else None,
            "date": price.date.isoformat(),
        }
        prose = (
            f"{ticker} closed at Rs {data['price']:.2f} on {data['date']} "
            f"({'+' if data['change'] >= 0 else ''}{data['change_pct']:.2f}%). "
            f"Volume {data['volume']:,}."
        )
        return _result(prose, card={"type": "stock_card", "data": data})

    return await _run()


@tool(
    "get_price_history",
    "Daily OHLCV history for a ticker over the last N trading days (default 30).",
    {"ticker": str, "days": int},
)
async def get_price_history(args: dict) -> dict:
    ticker = (args.get("ticker") or "").upper().strip()
    days = int(args.get("days") or 30)
    if not ticker:
        return _result("Ticker is required.", is_error=True)

    @sync_to_async
    def _run():
        rows = list(
            DailyStockPrice.objects.filter(ticker=ticker)
            .order_by("-date")
            .values("date", "open", "high", "low", "close", "volume", "diff_percent")[:days]
        )
        if not rows:
            return _result(f"No price history for {ticker}.", is_error=True)
        rows.reverse()
        first, last = rows[0], rows[-1]
        chg = float(last["close"] or 0) - float(first["close"] or 0)
        pct = (chg / float(first["close"])) * 100 if first["close"] else 0
        prose = (
            f"{ticker} over {len(rows)} days: Rs {float(first['close']):.2f} → "
            f"Rs {float(last['close']):.2f} ({pct:+.2f}%)."
        )
        return _result(prose, card={"type": "price_history", "data": {
            "symbol": ticker,
            "rows": _jsonable(rows),
        }})

    return await _run()


@tool(
    "get_technicals",
    "Compute TA-Lib indicators for a ticker: RSI, MACD, ADX, SMA(50/200), Bollinger, ATR, MFI, OBV, supports/resistances.",
    {"ticker": str},
)
async def get_technicals(args: dict) -> dict:
    ticker = (args.get("ticker") or "").upper().strip()
    if not ticker:
        return _result("Ticker is required.", is_error=True)

    indicators = await sync_to_async(get_technical_indicators)(ticker)
    if not indicators:
        return _result(f"Not enough price history for {ticker} to compute indicators.", is_error=True)

    by_cat: dict[str, list[dict]] = {}
    for ind in indicators:
        by_cat.setdefault(ind["category"], []).append({
            "name": ind["name"],
            "value": ind["value"],
            "raw": _jsonable(ind.get("raw_value")),
        })

    headline_lines = [f"{ticker} technical snapshot:"]
    for cat in ("Momentum", "Trend", "Volatility", "Volume"):
        items = by_cat.get(cat, [])[:3]
        if items:
            headline_lines.append(
                f"  {cat}: " + ", ".join(f"{i['name']}={i['value']}" for i in items)
            )
    return _result(
        "\n".join(headline_lines),
        card={"type": "technicals", "data": {"symbol": ticker, "groups": by_cat}},
    )


@tool(
    "get_fundamentals",
    "Fundamentals + health score (0-100) for a ticker. Returns PE, PB, ROE, growth, debt/equity.",
    {"ticker": str},
)
async def get_fundamentals(args: dict) -> dict:
    ticker = (args.get("ticker") or "").upper().strip()
    if not ticker:
        return _result("Ticker is required.", is_error=True)

    @sync_to_async
    def _run():
        fund = StockFundamental.objects.filter(ticker=ticker).first()
        if not fund:
            return _result(f"No fundamental data for {ticker}.", is_error=True)
        health, metrics = FundamentalService.calculate_health_score(fund)
        data = {
            "symbol": ticker,
            "name": fund.company_name,
            "sector": fund.sector,
            "market_cap": float(fund.market_cap or 0),
            "health_score": health,
            "metrics": metrics,
            "dividend_yield": float(fund.dividend_yield or 0),
            "high_52w": float(fund.fifty_two_week_high) if fund.fifty_two_week_high else None,
            "low_52w": float(fund.fifty_two_week_low) if fund.fifty_two_week_low else None,
        }
        prose = (
            f"{ticker} health score: {health}/100. "
            f"PE={metrics.get('pe')}, PB={metrics.get('pb')}, ROE={metrics.get('roe')}%, "
            f"growth={metrics.get('growth')}%, D/E={metrics.get('de')}."
        )
        return _result(prose, card={"type": "fundamentals", "data": data})

    return await _run()


@tool(
    "get_dividend_history",
    "Last N years of cash and bonus dividends for a ticker.",
    {"ticker": str, "years": int},
)
async def get_dividend_history(args: dict) -> dict:
    ticker = (args.get("ticker") or "").upper().strip()
    years = int(args.get("years") or 5)
    if not ticker:
        return _result("Ticker is required.", is_error=True)

    @sync_to_async
    def _run():
        rows = list(
            Dividend.objects.filter(ticker=ticker)
            .order_by("-book_close_date")
            .values("fiscal_year", "bonus_percent", "cash_percent", "book_close_date")[:years]
        )
        if not rows:
            return _result(f"No dividend history for {ticker}.", is_error=True)
        lines = [f"{ticker} dividends (last {len(rows)} fiscal years):"]
        for r in rows:
            lines.append(
                f"  {r['fiscal_year']}: cash {float(r['cash_percent'] or 0):.1f}%, "
                f"bonus {float(r['bonus_percent'] or 0):.1f}%"
            )
        return _result("\n".join(lines), card={"type": "dividends", "data": {
            "symbol": ticker, "rows": _jsonable(rows),
        }})

    return await _run()


@tool(
    "get_accumulation",
    "Cumulative buy/sell/net by broker for a ticker over the last N days (default 30).",
    {"ticker": str, "days": int},
)
async def get_accumulation(args: dict) -> dict:
    ticker = (args.get("ticker") or "").upper().strip()
    days = int(args.get("days") or 30)
    if not ticker:
        return _result("Ticker is required.", is_error=True)

    @sync_to_async
    def _run():
        cutoff = (datetime.now().date() - timedelta(days=days))
        rows = list(
            DailyCumulativeAccumulation.objects.filter(symbol=ticker, transaction_date__gte=cutoff)
            .values("entity_id", "transaction_date", "cumulative_buy", "cumulative_sell", "cumulative_net")
            .order_by("-cumulative_net")[:50]
        )
        if not rows:
            return _result(f"No accumulation data for {ticker} in the last {days} days.", is_error=True)
        net_buyers = [r for r in rows if (r["cumulative_net"] or 0) > 0][:5]
        net_sellers = sorted(
            [r for r in rows if (r["cumulative_net"] or 0) < 0], key=lambda r: r["cumulative_net"]
        )[:5]
        lines = [f"{ticker} accumulation (last {days} days):"]
        if net_buyers:
            lines.append("  Top net buyers: " + ", ".join(f"#{r['entity_id']}" for r in net_buyers))
        if net_sellers:
            lines.append("  Top net sellers: " + ", ".join(f"#{r['entity_id']}" for r in net_sellers))
        return _result("\n".join(lines), card={"type": "accumulation", "data": {
            "symbol": ticker,
            "rows": _jsonable(rows[:20]),
        }})

    return await _run()


# ─────────────────────────────────────────────────────────────────────────────
# Buy/Sell Strategist tools
# ─────────────────────────────────────────────────────────────────────────────


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
            StrategySignal.objects.filter(symbol=ticker)
            .select_related("strategy")
            .order_by("-date")[:10]
        )
        gen_signals = list(
            GeneratedSignal.objects.filter(symbol=ticker).order_by("-generated_date")[:10]
        )
        if not strat_signals and not gen_signals:
            return _result(f"No signals found for {ticker}.", is_error=True)

        strat_data = [
            {
                "strategy": s.strategy.name,
                "signal": s.signal,
                "date": s.date.isoformat(),
                "last_close": float(s.last_close) if s.last_close else None,
            }
            for s in strat_signals
        ]
        gen_data = [
            {
                "source": g.source,
                "signal": g.signal,
                "tier": g.signal_tier,
                "strength": float(g.strength),
                "status": g.status,
                "ltp": float(g.ltp),
                "target": float(g.target_price) if g.target_price else None,
                "stop": float(g.stop_loss_price) if g.stop_loss_price else None,
                "date": g.generated_date.isoformat(),
            }
            for g in gen_signals
        ]
        buys = sum(1 for s in strat_data if s["signal"] == "BUY") + sum(1 for g in gen_data if g["signal"] == "BUY")
        sells = sum(1 for s in strat_data if s["signal"] == "SELL") + sum(1 for g in gen_data if g["signal"] == "SELL")
        verdict = "BUY" if buys > sells else "SELL" if sells > buys else "HOLD"
        prose = f"{ticker}: {buys} buy / {sells} sell signals · verdict {verdict}."

        return _result(prose, card={"type": "signal", "data": {
            "symbol": ticker,
            "verdict": verdict,
            "buy_count": buys,
            "sell_count": sells,
            "strategy_signals": strat_data,
            "generated_signals": gen_data,
        }})

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
        qs = GeneratedSignal.objects.all()
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
        return _result(prose, card={"type": "signal", "data": {
            "track_record": {
                "source": source or "ALL",
                "total": total,
                "won": won,
                "lost": lost,
                "active": active,
                "win_rate": round(win_rate, 1),
            }
        }})

    return await _run()


@tool(
    "calc_position_size",
    "Compute max shares, total cost, and warnings for a trade given account balance, entry, stop-loss, target.",
    {"ticker": str, "entry_price": float, "stop_loss": float, "target_price": float, "risk_percent": float, "account_id": str},
)
async def calc_position_size(args: dict) -> dict:
    ticker = (args.get("ticker") or "").upper().strip()
    entry = args.get("entry_price")
    stop = args.get("stop_loss")
    target = args.get("target_price")
    risk_pct = float(args.get("risk_percent") or 2.0)
    account_id = args.get("account_id")
    if entry is None or stop is None:
        return _result("entry_price and stop_loss are required.", is_error=True)

    user = get_user()

    @sync_to_async
    def _run():
        account = _resolve_account(user, account_id)
        balance = float(account.balance) if account and account.balance else 100000.0
        try:
            sizing = PositionSizingService.calculate_position_size(
                account_balance=balance,
                risk_percentage=risk_pct,
                entry_price=float(entry),
                stop_loss_price=float(stop),
                target_price=float(target) if target is not None else None,
            )
        except ValueError as e:
            return _result(str(e), is_error=True)
        prose = (
            f"{ticker or 'Position'}: {sizing['max_shares']} shares @ Rs {sizing['entry_price']:.2f} "
            f"(Rs {sizing['total_investment']:,.0f}, risking Rs {sizing['risk_amount']:,.0f}/{sizing['risk_percentage']:.1f}%)."
        )
        return _result(prose, card={"type": "position_sizing", "data": {**sizing, "symbol": ticker or None}})

    return await _run()


# ─────────────────────────────────────────────────────────────────────────────
# Portfolio Advisor tools
# ─────────────────────────────────────────────────────────────────────────────


@tool(
    "get_portfolio_overview",
    "User's holdings overview: invested, current value, total/day P/L, top winner & loser. Pass account_id or omit for all accounts.",
    {"account_id": str},
)
async def get_portfolio_overview(args: dict) -> dict:
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
        invested = sum(float(it.investment_value) for it in items)
        current = sum(float(it.current_value) for it in items)
        total_pl = current - invested
        day_pl = sum(float(it.day_gain_loss) for it in items)
        best = max(items, key=lambda it: float(it.gain_loss_percent or 0))
        worst = min(items, key=lambda it: float(it.gain_loss_percent or 0))
        prose = (
            f"Portfolio: Rs {current:,.0f} (Rs {invested:,.0f} invested). "
            f"Total P/L Rs {total_pl:+,.0f} ({(total_pl/invested*100 if invested else 0):+.2f}%), "
            f"day P/L Rs {day_pl:+,.0f}. "
            f"Best: {best.ticker} {float(best.gain_loss_percent):+.2f}%. "
            f"Worst: {worst.ticker} {float(worst.gain_loss_percent):+.2f}%."
        )
        return _result(prose, card={"type": "portfolio", "data": {
            "invested": invested,
            "current": current,
            "total_pl": total_pl,
            "total_pl_pct": (total_pl / invested * 100) if invested else 0,
            "day_pl": day_pl,
            "holdings_count": len(items),
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
        rows = []
        for it in items:
            rows.append({
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
            })
        rows.sort(key=lambda r: r["current_value"], reverse=True)
        prose = f"{len(rows)} holdings totalling Rs {sum(r['current_value'] for r in rows):,.0f}."
        return _result(prose, card={"type": "holdings", "data": {"holdings": rows}})

    return await _run()


@tool(
    "get_watchlist",
    "User's watchlist with current price, RSI, signal count, accumulation flag, and target/stop levels.",
    {},
)
async def get_watchlist(args: dict) -> dict:
    user = get_user()

    @sync_to_async
    def _run():
        qs = WatchlistItem.objects.filter(user=user)
        items = WatchlistService.get_watchlist_metrics(qs)
        if not items:
            return _result("Your watchlist is empty.", is_error=True)
        rows = []
        for it in items:
            rows.append({
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
            })
        return _result(
            f"{len(rows)} watchlist items.",
            card={"type": "watchlist", "data": {"rows": rows}},
        )

    return await _run()


@tool(
    "get_risk_profile",
    "Concentration, liquidity, and volatility radar with alerts for the user's portfolio.",
    {"account_id": str},
)
async def get_risk_profile(args: dict) -> dict:
    account_id = args.get("account_id")
    user = get_user()

    @sync_to_async
    def _run():
        result = RiskAnalysisService.get_risk_analysis(user, account_id=account_id)
        if not result.get("radar_data"):
            return _result("No risk data — portfolio is empty.", is_error=True)
        summary = result["summary"]
        alerts = result["alerts"]
        prose_lines = [
            f"Portfolio risk: {summary['risk_level']} (value Rs {summary['total_value']:,.0f}).",
        ]
        for a in alerts[:5]:
            prose_lines.append(f"  [{a['level']}] {a['message']}")
        return _result("\n".join(prose_lines), card={"type": "risk", "data": result})

    return await _run()


@tool(
    "get_realized_pnl",
    "Sum realized P/L from sell transactions, optionally scoped to an account.",
    {"account_id": str},
)
async def get_realized_pnl(args: dict) -> dict:
    account_id = args.get("account_id")
    user = get_user()

    @sync_to_async
    def _run():
        qs = PortfolioTransaction.objects.filter(user=user, transaction_type=TransactionType.SELL)
        account = _resolve_account(user, account_id)
        if account:
            qs = qs.filter(account=account)

        # Cost basis per ticker from WACC at the time of sale is non-trivial without per-lot tracking,
        # so we approximate: realized P/L ≈ sale receivable - sale gross - fees on the same ticker.
        # The portfolio service already stores WACC on PortfolioItem, but historic WACC isn't kept.
        # For now we report total fees + total CGT and total receivable from sells; the strategist
        # interprets this as an "executed-trades summary" rather than a precise realized P/L.
        agg = qs.aggregate(
            total_amount=Sum("amount"),
            total_receivable=Sum("receivable_amount"),
            total_cgt=Sum("cgt"),
            total_commission=Sum("commission"),
            total_dp=Sum("dp_charge"),
            total_sebon=Sum("sebon_fee"),
            count=Sum("quantity"),
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
            "gross": total_amount,
            "net_receivable": total_receivable,
            "fees": total_fees,
            "cgt": total_cgt,
        }})

    return await _run()


# ─────────────────────────────────────────────────────────────────────────────
# MCP server registration
# ─────────────────────────────────────────────────────────────────────────────


ALL_TOOLS = [
    # Market Analyst
    get_market_summary,
    get_top_movers,
    get_index_history,
    get_floorsheet_whales,
    # Stock Analyst
    get_stock_quote,
    get_price_history,
    get_technicals,
    get_fundamentals,
    get_dividend_history,
    get_accumulation,
    # Buy/Sell Strategist
    get_signals_for_ticker,
    get_signal_track_record,
    calc_position_size,
    # Portfolio Advisor
    get_portfolio_overview,
    get_holdings,
    get_watchlist,
    get_risk_profile,
    get_realized_pnl,
]


STOCKASTIC_MCP_SERVER = create_sdk_mcp_server(
    name="stockastic",
    version="1.0.0",
    tools=ALL_TOOLS,
)


def tool_id(name: str) -> str:
    """Helper for subagent tool allowlists. ``tool_id('get_holdings')`` → ``'mcp__stockastic__get_holdings'``."""
    return f"mcp__stockastic__{name}"
