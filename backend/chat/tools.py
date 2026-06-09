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
from django.db.models import Avg, Count, Max, Min, Q, Sum

from stocks.models.fundamentals import Dividend, FinancialReport, StockFundamental
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
    PortfolioSnapshot,
    PortfolioTarget,
    PortfolioTransaction,
    TransactionType,
    WatchlistItem,
)
from stocks.models.strategy import Strategy, StrategyExperiment, StrategySignal
from stocks.models.system import GeneratedSignal, Notification
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
# Strategy signal ranking
# ─────────────────────────────────────────────────────────────────────────────

_SCOPE_RANK: dict[str, int] = {"SYMBOL": 3, "SECTOR": 2, "ALL": 1, "DEFAULT": 0}


def _rank_strategy_signals(strat_signals: list) -> tuple[list[dict], str | None]:
    """Enrich StrategySignal objects with strategy performance metrics and rank them.

    Ranking order (descending priority):
        1. optimization_scope: SYMBOL > SECTOR > ALL > DEFAULT
        2. win_rate
        3. sharpe_ratio
        4. pnl_percent (tiebreaker)

    Returns:
        (enriched_list, best_strategy_name)
        best_strategy_name is None when strat_signals is empty.
    """
    enriched = []
    for s in strat_signals:
        scope = (s.metadata or {}).get("optimization_scope", "DEFAULT")
        enriched.append({
            "strategy": s.strategy.name,
            "strategy_id": s.strategy.id,
            "signal": s.signal,
            "date": s.date.isoformat(),
            "last_close": float(s.last_close) if s.last_close else None,
            "pnl_pct": float(s.strategy.pnl_percent or 0),
            "win_rate": float(s.strategy.win_rate or 0),
            "sharpe": float(s.strategy.sharpe_ratio or 0),
            "max_drawdown": float(s.strategy.max_drawdown or 0),
            "best_objective": s.strategy.best_objective or "balanced",
            "optimization_scope": scope,
        })

    enriched.sort(
        key=lambda x: (
            _SCOPE_RANK.get(x["optimization_scope"], 0),
            x["win_rate"],
            x["sharpe"],
            x["pnl_pct"],
        ),
        reverse=True,
    )

    best = enriched[0]["strategy"] if enriched else None
    return enriched, best


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

        strat_data, best_strategy = _rank_strategy_signals(strat_signals)
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

        if best_strategy:
            best = strat_data[0]
            anchor = (
                f"best strategy: {best['strategy']} "
                f"(WR {best['win_rate']:.1f}%, Sharpe {best['sharpe']:.2f}, "
                f"scope: {best['optimization_scope']}) · "
            )
        else:
            anchor = ""
        prose = f"{anchor}{ticker}: {buys} buy / {sells} sell signals · verdict {verdict}."

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
# Market Analyst — supplementary tools
# ─────────────────────────────────────────────────────────────────────────────


@tool(
    "get_sector_breakdown",
    "Sector-level turnover breakdown for the latest trading day, ranked by turnover. "
    "Also returns top stocks by turnover and volume.",
    {},
)
async def get_sector_breakdown(args: dict) -> dict:
    @sync_to_async
    def _run():
        latest = DailyMarketSummary.objects.order_by("-date").first()
        if not latest:
            return _result("No market data available.", is_error=True)
        sector_turnover = _jsonable(latest.sector_turnover or {})
        top_turnovers = _jsonable(latest.top_turnovers or [])[:10]
        top_volumes = _jsonable(latest.top_volumes or [])[:10]

        ranked = sorted(sector_turnover.items(), key=lambda x: float(x[1] or 0), reverse=True)
        total = sum(float(v or 0) for _, v in ranked) or 1
        lines = [f"Sector turnover on {latest.date.isoformat()}:"]
        for sector, amount in ranked[:8]:
            pct = float(amount or 0) / total * 100
            lines.append(f"  {sector}: Rs {float(amount or 0):,.0f} ({pct:.1f}%)")
        return _result(
            "\n".join(lines),
            card={
                "type": "sector_breakdown",
                "data": {
                    "date": latest.date.isoformat(),
                    "sectors": [
                        {"name": s, "turnover": float(v or 0), "pct": float(v or 0) / total * 100}
                        for s, v in ranked
                    ],
                    "top_turnovers": top_turnovers,
                    "top_volumes": top_volumes,
                },
            },
        )

    return await _run()


@tool(
    "get_broker_trades_for_stock",
    "Raw floorsheet trades for a specific ticker: who bought/sold, at what price, and how much. "
    "Defaults to the most recent date. Pass date as YYYY-MM-DD to look at a specific day.",
    {"ticker": str, "date": str, "limit": int},
)
async def get_broker_trades_for_stock(args: dict) -> dict:
    ticker = (args.get("ticker") or "").upper().strip()
    requested_date = args.get("date")
    limit = int(args.get("limit") or 30)
    if not ticker:
        return _result("Ticker is required.", is_error=True)

    @sync_to_async
    def _run():
        qs = DailyFloorsheet.objects.filter(symbol=ticker)
        if requested_date:
            qs = qs.filter(transaction_date=requested_date)
        else:
            latest = qs.order_by("-transaction_date").values("transaction_date").first()
            if not latest:
                return _result(f"No floorsheet data for {ticker}.", is_error=True)
            qs = qs.filter(transaction_date=latest["transaction_date"])

        rows = list(qs.order_by("-transaction_amount").values(
            "buyer_id", "buyer_name", "seller_id", "seller_name",
            "transaction_quantity", "transaction_rate", "transaction_amount",
            "transaction_date",
        )[:limit])
        if not rows:
            return _result(f"No trades found for {ticker}.", is_error=True)

        trade_date = rows[0]["transaction_date"]
        total_vol = sum(r["transaction_quantity"] or 0 for r in rows)
        total_amt = sum(float(r["transaction_amount"] or 0) for r in rows)

        # Aggregate buyer/seller totals
        buyer_agg: dict[int, dict] = {}
        seller_agg: dict[int, dict] = {}
        for r in rows:
            bid = r["buyer_id"]
            if bid not in buyer_agg:
                buyer_agg[bid] = {"id": bid, "name": r.get("buyer_name"), "qty": 0, "amount": 0.0}
            buyer_agg[bid]["qty"] += r["transaction_quantity"] or 0
            buyer_agg[bid]["amount"] += float(r["transaction_amount"] or 0)

            sid = r["seller_id"]
            if sid not in seller_agg:
                seller_agg[sid] = {"id": sid, "name": r.get("seller_name"), "qty": 0, "amount": 0.0}
            seller_agg[sid]["qty"] += r["transaction_quantity"] or 0
            seller_agg[sid]["amount"] += float(r["transaction_amount"] or 0)

        top_buyers = sorted(buyer_agg.values(), key=lambda x: x["amount"], reverse=True)[:5]
        top_sellers = sorted(seller_agg.values(), key=lambda x: x["amount"], reverse=True)[:5]

        lines = [f"{ticker} floorsheet on {trade_date} — {len(rows)} trades, "
                 f"vol {total_vol:,}, Rs {total_amt:,.0f}:"]
        lines.append("  Top buyers: " + ", ".join(
            f"#{b['id']}({b['name'] or b['id']}) Rs {b['amount']:,.0f}" for b in top_buyers
        ))
        lines.append("  Top sellers: " + ", ".join(
            f"#{s['id']}({s['name'] or s['id']}) Rs {s['amount']:,.0f}" for s in top_sellers
        ))
        return _result(
            "\n".join(lines),
            card={
                "type": "floorsheet_detail",
                "data": {
                    "symbol": ticker,
                    "date": str(trade_date),
                    "total_volume": total_vol,
                    "total_amount": total_amt,
                    "top_buyers": _jsonable(top_buyers),
                    "top_sellers": _jsonable(top_sellers),
                    "trades": _jsonable(rows[:20]),
                },
            },
        )

    return await _run()


@tool(
    "search_stocks",
    "Search NEPSE-listed companies by ticker symbol or company name keyword. "
    "Returns matching tickers with sector, health score, and latest price.",
    {"query": str, "sector": str, "limit": int},
)
async def search_stocks(args: dict) -> dict:
    query = (args.get("query") or "").strip()
    sector_filter = (args.get("sector") or "").strip()
    limit = int(args.get("limit") or 15)
    if not query and not sector_filter:
        return _result("Provide a query or sector to search.", is_error=True)

    @sync_to_async
    def _run():
        qs = Company.objects
        if query:
            qs = qs.filter(Q(symbol__icontains=query) | Q(name__icontains=query))
        if sector_filter:
            qs = qs.filter(sector__icontains=sector_filter)
        companies = list(qs.values("symbol", "name", "sector")[:limit])
        if not companies:
            return _result(f"No companies found matching '{query or sector_filter}'.", is_error=True)

        symbols = [c["symbol"] for c in companies]
        funds = {f.ticker: f for f in StockFundamental.objects.filter(ticker__in=symbols)}
        prices = {
            p["ticker"]: p for p in
            DailyStockPrice.objects.filter(ticker__in=symbols)
            .order_by("ticker", "-date")
            .distinct("ticker")
            .values("ticker", "close", "diff_percent", "date")
        }

        results = []
        for c in companies:
            sym = c["symbol"]
            fund = funds.get(sym)
            price = prices.get(sym)
            health, _ = FundamentalService.calculate_health_score(fund) if fund else (None, {})
            results.append({
                "ticker": sym,
                "name": c["name"],
                "sector": c["sector"],
                "price": float(price["close"]) if price and price.get("close") else None,
                "change_pct": float(price["diff_percent"]) if price and price.get("diff_percent") else None,
                "pe": float(fund.pe_ratio) if fund and fund.pe_ratio else None,
                "health_score": health,
            })

        lines = [f"Found {len(results)} stocks:"]
        for r in results[:8]:
            lines.append(
                f"  {r['ticker']} ({r['sector'] or '?'}): "
                f"Rs {r['price'] or '?'}, health {r['health_score'] or '?'}/100"
            )
        return _result("\n".join(lines), card={"type": "search_results", "data": {"results": results}})

    return await _run()


# ─────────────────────────────────────────────────────────────────────────────
# Stock Analyst — supplementary tools
# ─────────────────────────────────────────────────────────────────────────────


@tool(
    "get_financial_reports",
    "Quarterly or annual financial report series for a ticker: revenue, net profit, EPS, ROE, "
    "book value, and dividend history per period. report_type='QUARTERLY'|'ANNUAL'.",
    {"ticker": str, "report_type": str, "limit": int},
)
async def get_financial_reports(args: dict) -> dict:
    ticker = (args.get("ticker") or "").upper().strip()
    report_type = (args.get("report_type") or "QUARTERLY").upper()
    limit = int(args.get("limit") or 8)
    if not ticker:
        return _result("Ticker is required.", is_error=True)

    @sync_to_async
    def _run():
        qs = FinancialReport.objects.filter(ticker=ticker)
        if report_type in ("QUARTERLY", "ANNUAL"):
            qs = qs.filter(report_type=report_type)
        rows = list(qs.order_by("-fiscal_year", "-report_type", "-quarter")[:limit])
        if not rows:
            return _result(f"No financial reports for {ticker}.", is_error=True)

        data_rows = []
        for r in rows:
            data_rows.append({
                "fiscal_year": r.fiscal_year,
                "report_type": r.report_type,
                "quarter": r.quarter,
                "is_audited": r.is_audited,
                "revenue": float(r.revenue) if r.revenue else None,
                "operating_profit": float(r.operating_profit) if r.operating_profit else None,
                "net_profit": float(r.net_profit) if r.net_profit else None,
                "eps": float(r.eps) if r.eps else None,
                "pe_ratio": float(r.pe_ratio) if r.pe_ratio else None,
                "book_value": float(r.book_value) if r.book_value else None,
                "roe": float(r.return_on_equity) if r.return_on_equity else None,
                "bonus_share": float(r.bonus_share) if r.bonus_share else None,
                "cash_dividend": float(r.cash_dividend) if r.cash_dividend else None,
            })

        latest = data_rows[0]
        period = latest["fiscal_year"]
        if latest.get("quarter"):
            period += f" Q{latest['quarter']}"
        if latest.get("net_profit"):
            prose = f"{ticker} latest {report_type.lower()} ({period}): net profit Rs {latest['net_profit']:,.0f}"
        else:
            prose = f"{ticker}: {len(data_rows)} {report_type.lower()} reports available."
        return _result(
            prose,
            card={
                "type": "financial_reports",
                "data": {"symbol": ticker, "report_type": report_type, "reports": data_rows},
            },
        )

    return await _run()


@tool(
    "compare_stocks",
    "Side-by-side comparison of 2–5 tickers: price, PE, PB, ROE, health score, dividend yield, "
    "52-week range, and sector. Pass tickers as a comma-separated string.",
    {"tickers": str},
)
async def compare_stocks(args: dict) -> dict:
    raw = args.get("tickers") or ""
    tickers = [t.strip().upper() for t in raw.split(",") if t.strip()][:5]
    if len(tickers) < 2:
        return _result("Provide at least two comma-separated tickers to compare.", is_error=True)

    @sync_to_async
    def _run():
        funds = {f.ticker: f for f in StockFundamental.objects.filter(ticker__in=tickers)}
        companies = {c.symbol: c for c in Company.all_objects.filter(symbol__in=tickers)}
        prices = {}
        for p in (
            DailyStockPrice.objects.filter(ticker__in=tickers)
            .order_by("ticker", "-date")
            .distinct("ticker")
            .values("ticker", "close", "diff_percent", "volume", "date")
        ):
            prices[p["ticker"]] = p

        rows = []
        for ticker in tickers:
            fund = funds.get(ticker)
            co = companies.get(ticker)
            px = prices.get(ticker)
            health, _ = FundamentalService.calculate_health_score(fund) if fund else (None, {})
            rows.append({
                "ticker": ticker,
                "name": (co.name if co else (fund.company_name if fund else ticker)),
                "sector": (co.sector if co else (fund.sector if fund else None)),
                "price": float(px["close"]) if px and px.get("close") else None,
                "change_pct": float(px["diff_percent"]) if px and px.get("diff_percent") else None,
                "pe": float(fund.pe_ratio or fund.pe_ratio_unaudited) if fund and (fund.pe_ratio or fund.pe_ratio_unaudited) else None,
                "pb": float(fund.price_to_book) if fund and fund.price_to_book else None,
                "roe": float(fund.ro_equity) if fund and fund.ro_equity else None,
                "dividend_yield": float(fund.dividend_yield) if fund and fund.dividend_yield else None,
                "health_score": health,
                "high_52w": float(fund.fifty_two_week_high) if fund and fund.fifty_two_week_high else None,
                "low_52w": float(fund.fifty_two_week_low) if fund and fund.fifty_two_week_low else None,
                "market_cap": float(fund.market_cap) if fund and fund.market_cap else None,
            })

        lines = ["Comparison: " + " vs ".join(tickers)]
        for r in rows:
            lines.append(
                f"  {r['ticker']}: Rs {r['price'] or '?'}, PE={r['pe'] or '?'}, "
                f"health={r['health_score'] or '?'}/100, div_yield={r['dividend_yield'] or '?'}%"
            )
        return _result("\n".join(lines), card={"type": "compare", "data": {"rows": rows}})

    return await _run()


@tool(
    "get_price_levels",
    "Key price levels for a ticker: VWAP, 120-day avg, 180-day avg, 52-week high/low, "
    "and distance of the current price from each level. Useful for entry/exit framing.",
    {"ticker": str},
)
async def get_price_levels(args: dict) -> dict:
    ticker = (args.get("ticker") or "").upper().strip()
    if not ticker:
        return _result("Ticker is required.", is_error=True)

    @sync_to_async
    def _run():
        latest = DailyStockPrice.objects.filter(ticker=ticker).order_by("-date").first()
        if not latest:
            return _result(f"No price data for {ticker}.", is_error=True)
        ltp = float(latest.close or 0)

        def _dist(level):
            if not level or level == 0:
                return None
            return round((ltp - float(level)) / float(level) * 100, 2)

        data = {
            "symbol": ticker,
            "date": latest.date.isoformat(),
            "ltp": ltp,
            "vwap": float(latest.vwap) if latest.vwap else None,
            "vwap_pct_from_ltp": _dist(latest.vwap),
            "days_120": float(latest.days_120) if latest.days_120 else None,
            "days_120_pct": _dist(latest.days_120),
            "days_180": float(latest.days_180) if latest.days_180 else None,
            "days_180_pct": _dist(latest.days_180),
            "weeks_52_high": float(latest.weeks_52_high) if latest.weeks_52_high else None,
            "weeks_52_high_pct": _dist(latest.weeks_52_high),
            "weeks_52_low": float(latest.weeks_52_low) if latest.weeks_52_low else None,
            "weeks_52_low_pct": _dist(latest.weeks_52_low),
        }
        lines = [f"{ticker} price levels (LTP Rs {ltp:.2f} on {data['date']}):"]
        level_labels = [
            ("vwap", "VWAP"),
            ("days_120", "120-day avg"),
            ("days_180", "180-day avg"),
            ("weeks_52_high", "52w High"),
            ("weeks_52_low", "52w Low"),
        ]
        for key, label in level_labels:
            val = data[key]
            pct = data.get(f"{key}_pct") or data.get(f"{key}_pct_from_ltp")
            if val:
                lines.append(f"  {label}: Rs {val:.2f} ({pct:+.2f}% vs LTP)")
        return _result("\n".join(lines), card={"type": "price_levels", "data": data})

    return await _run()


@tool(
    "get_financial_statements",
    "Full balance sheet, income statement (profit & loss), cash flow, or key ratios JSON "
    "for a ticker. statement='balance_sheet'|'profit_loss'|'cash_flow'|'key_ratios'. "
    "Defaults to key_ratios for the latest annual report.",
    {"ticker": str, "statement": str, "report_type": str},
)
async def get_financial_statements(args: dict) -> dict:
    ticker = (args.get("ticker") or "").upper().strip()
    statement = (args.get("statement") or "key_ratios").lower().strip()
    report_type = (args.get("report_type") or "ANNUAL").upper()
    if not ticker:
        return _result("Ticker is required.", is_error=True)
    if statement not in ("balance_sheet", "profit_loss", "cash_flow", "key_ratios"):
        statement = "key_ratios"

    @sync_to_async
    def _run():
        report = (
            FinancialReport.objects.filter(ticker=ticker, report_type=report_type)
            .order_by("-fiscal_year", "-quarter")
            .first()
        )
        if not report:
            report = FinancialReport.objects.filter(ticker=ticker).order_by("-fiscal_year", "-quarter").first()
        if not report:
            return _result(f"No financial statements found for {ticker}.", is_error=True)

        raw_data = getattr(report, statement, None)
        if not raw_data:
            return _result(
                f"No {statement.replace('_', ' ')} data for {ticker} "
                f"(FY {report.fiscal_year}, {report.report_type}).",
                is_error=True,
            )

        period = report.fiscal_year
        if report.quarter:
            period += f" Q{report.quarter}"

        if isinstance(raw_data, dict):
            top_keys = list(raw_data.keys())[:5]
            summary = ", ".join(f"{k}: {raw_data[k]}" for k in top_keys)
        else:
            summary = str(raw_data)[:250]

        prose = f"{ticker} {statement.replace('_', ' ')} [{period}]: {summary[:280]}"
        return _result(
            prose,
            card={
                "type": "financial_statement",
                "data": {
                    "symbol": ticker,
                    "fiscal_year": report.fiscal_year,
                    "report_type": report.report_type,
                    "quarter": report.quarter,
                    "statement": statement,
                    "data": _jsonable(raw_data),
                },
            },
        )

    return await _run()


# ─────────────────────────────────────────────────────────────────────────────
# Buy/Sell Strategist — supplementary tools
# ─────────────────────────────────────────────────────────────────────────────


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

    @sync_to_async
    def _run():
        qs = GeneratedSignal.objects.filter(status="ACTIVE")
        if signal_filter in ("BUY", "SELL"):
            qs = qs.filter(signal=signal_filter)
        if source_filter:
            qs = qs.filter(source__icontains=source_filter)
        signals = list(qs.order_by("-strength", "-generated_date")[:limit])
        if not signals:
            return _result("No active signals found.", is_error=True)

        data = [
            {
                "symbol": s.symbol,
                "signal": s.signal,
                "source": s.source,
                "tier": s.signal_tier,
                "strength": float(s.strength),
                "ltp": float(s.ltp),
                "target": float(s.target_price) if s.target_price else None,
                "stop": float(s.stop_loss_price) if s.stop_loss_price else None,
                "rationale": s.rationale[:120] if s.rationale else None,
                "date": s.generated_date.isoformat(),
            }
            for s in signals
        ]
        buy_count = sum(1 for d in data if d["signal"] == "BUY")
        sell_count = sum(1 for d in data if d["signal"] == "SELL")
        lines = [
            f"{len(data)} active signals ({buy_count} BUY, {sell_count} SELL):",
        ]
        for d in data[:8]:
            lines.append(
                f"  {d['symbol']} [{d['signal']}] src={d['source']} str={d['strength']:.0f} "
                f"ltp={d['ltp']} tgt={d['target'] or '?'}"
            )
        return _result(
            "\n".join(lines),
            card={"type": "active_signals", "data": {
                "buy_count": buy_count,
                "sell_count": sell_count,
                "signals": data,
            }},
        )

    return await _run()


@tool(
    "get_strategy_performance",
    "Performance summary of the user's own strategies: P/L %, win rate, Sharpe ratio, max drawdown.",
    {},
)
async def get_strategy_performance(args: dict) -> dict:
    user = get_user()

    @sync_to_async
    def _run():
        strategies = list(
            Strategy.objects.filter(user=user)
            .order_by("-pnl_percent")
            .values(
                "id", "name", "description", "pnl_amount", "pnl", "pnl_percent",
                "win_rate", "sharpe_ratio", "max_drawdown", "best_objective",
            )
        )
        if not strategies:
            return _result("You have no strategies configured yet.", is_error=True)

        data = [
            {
                "id": s["id"],
                "name": s["name"],
                "description": s["description"][:100] if s.get("description") else None,
                "pnl_pct": float(s["pnl_percent"] or 0),
                "pnl_amount": float(s["pnl_amount"] or 0),
                "win_rate": float(s["win_rate"] or 0),
                "sharpe": float(s["sharpe_ratio"] or 0),
                "max_drawdown": float(s["max_drawdown"] or 0),
                "objective": s.get("best_objective") or "balanced",
            }
            for s in strategies
        ]
        top = max(data, key=lambda x: x["pnl_pct"])
        lines = [f"{len(data)} strategies:"]
        for d in data:
            lines.append(
                f"  {d['name']}: PnL {d['pnl_pct']:+.1f}%, WR {d['win_rate']:.1f}%, "
                f"Sharpe {d['sharpe']:.2f}, MaxDD {d['max_drawdown']:.1f}%"
            )
        return _result(
            "\n".join(lines),
            card={"type": "strategy_performance", "data": {
                "strategies": data,
                "best": top["name"],
            }},
        )

    return await _run()


@tool(
    "screen_stocks",
    "Filter NEPSE stocks by criteria and return the best matches. "
    "sector: filter by sector name (partial match). "
    "min_pe / max_pe: P/E ratio bounds. "
    "has_signal: 'BUY' or 'SELL' to include only stocks with active generated signals. "
    "limit defaults to 15.",
    {"sector": str, "min_pe": float, "max_pe": float, "has_signal": str, "limit": int},
)
async def screen_stocks(args: dict) -> dict:
    sector_filter = (args.get("sector") or "").strip()
    min_pe = args.get("min_pe")
    max_pe = args.get("max_pe")
    has_signal = (args.get("has_signal") or "").upper().strip()
    limit = int(args.get("limit") or 15)

    @sync_to_async
    def _run():
        qs = StockFundamental.objects.all()
        if sector_filter:
            qs = qs.filter(sector__icontains=sector_filter)
        if min_pe is not None:
            qs = qs.filter(pe_ratio__gte=min_pe)
        if max_pe is not None:
            qs = qs.filter(pe_ratio__lte=max_pe)

        funds = list(qs.order_by("ticker")[:200])
        if not funds:
            return _result("No stocks match your criteria.", is_error=True)

        # Filter by active signal if requested
        signal_map: dict[str, dict] = {}
        if has_signal in ("BUY", "SELL"):
            active = GeneratedSignal.objects.filter(
                status="ACTIVE", signal=has_signal, symbol__in=[f.ticker for f in funds]
            ).values("symbol", "strength", "source").order_by("symbol", "-strength")
            for s in active:
                if s["symbol"] not in signal_map:
                    signal_map[s["symbol"]] = s
            funds = [f for f in funds if f.ticker in signal_map]

        # Pull latest prices
        tickers = [f.ticker for f in funds]
        price_map = {}
        for p in (
            DailyStockPrice.objects.filter(ticker__in=tickers)
            .order_by("ticker", "-date")
            .distinct("ticker")
            .values("ticker", "close", "diff_percent")
        ):
            price_map[p["ticker"]] = p

        # Score each stock
        results = []
        for fund in funds:
            health, _ = FundamentalService.calculate_health_score(fund)
            px = price_map.get(fund.ticker)
            sig = signal_map.get(fund.ticker)
            results.append({
                "ticker": fund.ticker,
                "name": fund.company_name,
                "sector": fund.sector,
                "price": float(px["close"]) if px and px.get("close") else None,
                "change_pct": float(px["diff_percent"]) if px and px.get("diff_percent") else None,
                "pe": float(fund.pe_ratio) if fund.pe_ratio else None,
                "health_score": health,
                "dividend_yield": float(fund.dividend_yield) if fund.dividend_yield else None,
                "signal": sig["signal"] if sig else None,
                "signal_source": sig["source"] if sig else None,
                "signal_strength": float(sig["strength"]) if sig else None,
            })

        # Sort by health score desc
        results.sort(key=lambda r: (r["health_score"] or 0), reverse=True)
        results = results[:limit]

        lines = [f"Screener results ({len(results)} stocks):"]
        for r in results[:8]:
            lines.append(
                f"  {r['ticker']} [{r['sector']}]: PE={r['pe'] or '?'}, "
                f"health={r['health_score'] or '?'}/100"
                + (f", signal={r['signal']}" if r.get("signal") else "")
            )
        return _result(
            "\n".join(lines),
            card={"type": "screener", "data": {
                "criteria": {
                    "sector": sector_filter or None,
                    "min_pe": min_pe,
                    "max_pe": max_pe,
                    "has_signal": has_signal or None,
                },
                "results": results,
            }},
        )

    return await _run()


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

    @sync_to_async
    def _run():
        qs = GeneratedSignal.objects.filter(status__in=["WON", "LOST"])
        if symbol:
            qs = qs.filter(symbol=symbol)
        if source:
            qs = qs.filter(source__icontains=source)
        if outcome in ("WON", "LOST"):
            qs = qs.filter(status=outcome)
        signals = list(qs.order_by("-closed_date")[:limit])
        if not signals:
            return _result("No closed signals found.", is_error=True)

        data = [
            {
                "symbol": s.symbol,
                "signal": s.signal,
                "source": s.source,
                "tier": s.signal_tier,
                "status": s.status,
                "ltp": float(s.ltp),
                "target": float(s.target_price) if s.target_price else None,
                "stop": float(s.stop_loss_price) if s.stop_loss_price else None,
                "pnl_pct": float(s.pnl_percent) if s.pnl_percent else None,
                "generated_date": s.generated_date.isoformat(),
                "closed_date": s.closed_date.isoformat() if s.closed_date else None,
                "rationale": s.rationale[:120] if s.rationale else None,
            }
            for s in signals
        ]
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
                "won": won,
                "lost": lost,
                "avg_pnl_pct": round(avg_pnl, 2),
                "signals": data,
            }},
        )

    return await _run()


@tool(
    "get_strategy_experiments",
    "Backtest / optimization run results for the user's strategies. "
    "Shows metrics: total return, win rate, Sharpe ratio, max drawdown, and parameters. "
    "Pass strategy_id (integer) to filter to one strategy.",
    {"strategy_id": int, "limit": int},
)
async def get_strategy_experiments(args: dict) -> dict:
    strategy_id = args.get("strategy_id")
    limit = int(args.get("limit") or 10)
    user = get_user()

    @sync_to_async
    def _run():
        qs = StrategyExperiment.objects.filter(strategy__user=user)
        if strategy_id:
            qs = qs.filter(strategy_id=int(strategy_id))
        experiments = list(qs.select_related("strategy").order_by("-created_at")[:limit])
        if not experiments:
            return _result("No backtest experiments found.", is_error=True)

        data = []
        for e in experiments:
            m = e.metrics or {}
            data.append({
                "id": e.id,
                "strategy": e.strategy.name,
                "strategy_id": e.strategy_id,
                "run_type": e.run_type,
                "scope_type": e.scope_type,
                "scope_value": e.scope_value,
                "status": e.status,
                "parameters": _jsonable(e.parameters),
                "sharpe": m.get("sharpe_ratio") or m.get("sharpe"),
                "win_rate": m.get("win_rate"),
                "max_drawdown": m.get("max_drawdown"),
                "total_return": m.get("total_return") or m.get("pnl_percent"),
                "total_trades": m.get("total_trades"),
                "created_at": e.created_at.isoformat() if hasattr(e, "created_at") and e.created_at else None,
            })

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
            card={"type": "strategy_experiments", "data": {
                "experiments": data,
                "best_run": best,
            }},
        )

    return await _run()


# ─────────────────────────────────────────────────────────────────────────────
# Portfolio Advisor — supplementary tools
# ─────────────────────────────────────────────────────────────────────────────


@tool(
    "get_portfolio_accounts",
    "List the user's portfolio accounts with account type (live/paper), balance, and default risk %.",
    {},
)
async def get_portfolio_accounts(args: dict) -> dict:
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
        data = [
            {
                "id": a["id"],
                "name": a["name"],
                "type": a["account_type"],
                "balance": float(a["balance"] or 0),
                "default_risk_pct": float(a["default_risk_percentage"] or 2),
            }
            for a in accounts
        ]
        lines = [f"{len(data)} account(s):"]
        for a in data:
            lines.append(f"  [{a['id']}] {a['name']} ({a['type']}): Rs {a['balance']:,.0f}")
        return _result(
            "\n".join(lines),
            card={"type": "portfolio_accounts", "data": {"accounts": data}},
        )

    return await _run()


@tool(
    "get_transaction_history",
    "User's buy/sell transaction ledger. Filter by ticker or transaction_type='BUY'|'SELL'. "
    "Returns last N transactions with gross amount, fees (commission, SEBON, DP), CGT, and net receivable.",
    {"ticker": str, "transaction_type": str, "limit": int, "account_id": str},
)
async def get_transaction_history(args: dict) -> dict:
    ticker = (args.get("ticker") or "").upper().strip()
    txn_type = (args.get("transaction_type") or "").upper().strip()
    limit = int(args.get("limit") or 20)
    account_id = args.get("account_id")
    user = get_user()

    @sync_to_async
    def _run():
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

        data = [
            {
                "ticker": r["ticker"],
                "type": r["transaction_type"],
                "qty": r["quantity"],
                "rate": float(r["rate"]),
                "gross": float(r["amount"]),
                "commission": float(r["commission"] or 0),
                "sebon_fee": float(r["sebon_fee"] or 0),
                "dp_charge": float(r["dp_charge"] or 0),
                "cgt": float(r["cgt"] or 0),
                "net": float(r["receivable_amount"]),
                "date": r["transaction_date"].isoformat() if hasattr(r["transaction_date"], "isoformat") else str(r["transaction_date"]),
                "reason": r.get("reason"),
            }
            for r in rows
        ]
        lines = [f"Last {len(data)} transactions:"]
        for d in data[:6]:
            lines.append(
                f"  {d['date']} {d['type']} {d['ticker']} x{d['qty']} @ Rs {d['rate']:.2f} "
                f"(gross Rs {d['gross']:,.0f})"
            )
        return _result(
            "\n".join(lines),
            card={"type": "transaction_history", "data": {"transactions": data}},
        )

    return await _run()


@tool(
    "get_portfolio_history",
    "Portfolio NAV over time: total value, invested value, and cash balance per day "
    "compared to the NEPSE index. Useful for tracking growth vs benchmark.",
    {"days": int, "account_id": str},
)
async def get_portfolio_history(args: dict) -> dict:
    days = int(args.get("days") or 30)
    account_id = args.get("account_id")
    user = get_user()

    @sync_to_async
    def _run():
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
        total_return = (
            (float(last["total_value"]) - float(first["total_value"])) / float(first["total_value"]) * 100
            if float(first["total_value"] or 0) > 0 else 0
        )
        prose = (
            f"Portfolio over {len(rows)} days: Rs {float(first['total_value']):,.0f} → "
            f"Rs {float(last['total_value']):,.0f} ({total_return:+.2f}% total return)."
        )
        return _result(
            prose,
            card={
                "type": "portfolio_history",
                "data": {
                    "rows": [
                        {
                            "date": r["date"].isoformat(),
                            "total_value": float(r["total_value"] or 0),
                            "invested_value": float(r["invested_value"] or 0),
                            "cash_balance": float(r["cash_balance"] or 0),
                            "nepse_index": float(r["nepse_index"]) if r["nepse_index"] else None,
                        }
                        for r in rows
                    ],
                    "total_return_pct": total_return,
                },
            },
        )

    return await _run()


@tool(
    "get_sector_allocation",
    "Breakdown of the user's portfolio by sector (and by tag): invested amount, current value, "
    "weight %, and number of holdings per sector.",
    {"account_id": str},
)
async def get_sector_allocation(args: dict) -> dict:
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
            return _result("Portfolio is empty.", is_error=True)

        # Enrich with sector from StockFundamental
        tickers = [it.ticker for it in items]
        sector_map = {
            f.ticker: f.sector
            for f in StockFundamental.objects.filter(ticker__in=tickers).only("ticker", "sector")
        }

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

        lines = ["Portfolio sector allocation:"]
        for s in allocation[:8]:
            lines.append(
                f"  {s['sector']}: Rs {s['current_value']:,.0f} ({s['weight_pct']:.1f}%), "
                f"{s['count']} holding(s)"
            )
        return _result(
            "\n".join(lines),
            card={"type": "sector_allocation", "data": {
                "total_value": total,
                "sectors": _jsonable(allocation),
            }},
        )

    return await _run()


@tool(
    "get_recent_alerts",
    "User's recent notifications/alerts. filter_type filters by alert type "
    "(e.g. 'STOP_LOSS_HIT', 'TARGET_REACHED', 'RSI_OVERSOLD', 'SIGNAL_BUY'). "
    "unread_only=true returns only unread alerts. limit defaults to 15.",
    {"filter_type": str, "unread_only": bool, "limit": int},
)
async def get_recent_alerts(args: dict) -> dict:
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

        data = [
            {
                "id": a["id"],
                "title": a["title"],
                "message": a["message"],
                "type": a["type"],
                "ticker": a["ticker"],
                "read": a["read"],
                "created_at": a["created_at"].isoformat(),
            }
            for a in alerts
        ]
        unread = sum(1 for a in data if not a["read"])
        lines = [f"{len(data)} alerts ({unread} unread):"]
        for a in data[:6]:
            mark = "•" if not a["read"] else " "
            lines.append(f"  {mark} [{a['type']}] {a['ticker'] or ''} — {a['title']}")
        return _result(
            "\n".join(lines),
            card={"type": "alerts", "data": {"alerts": data, "unread_count": unread}},
        )

    return await _run()


@tool(
    "get_watchlist_item",
    "Deep detail on a single watchlist item for the current user: notes, target prices (up to 3), "
    "stop loss, alert enabled flag, latest price, upside %, and downside to stop.",
    {"ticker": str},
)
async def get_watchlist_item(args: dict) -> dict:
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
        ltp = float(price.close) if price and price.close else None

        def _upside(target):
            if ltp and target:
                return round((float(target) - ltp) / ltp * 100, 2)
            return None

        data = {
            "ticker": ticker,
            "notes": item.notes,
            "target_1": float(item.target_price) if item.target_price else None,
            "target_2": float(item.target_price_2) if item.target_price_2 else None,
            "target_3": float(item.target_price_3) if item.target_price_3 else None,
            "stop_loss": float(item.stop_loss_price) if item.stop_loss_price else None,
            "alert_enabled": item.alert_enabled,
            "ltp": ltp,
            "date": price.date.isoformat() if price else None,
            "change_pct": float(price.diff_percent) if price and price.diff_percent else None,
            "upside_t1_pct": _upside(item.target_price),
            "upside_t2_pct": _upside(item.target_price_2),
            "downside_stop_pct": _upside(item.stop_loss_price),
            "pe": float(fund.pe_ratio) if fund and fund.pe_ratio else None,
            "dividend_yield": float(fund.dividend_yield) if fund and fund.dividend_yield else None,
        }

        lines = [f"{ticker} watchlist detail:"]
        if ltp:
            chg = data["change_pct"] or 0
            lines.append(f"  LTP: Rs {ltp:.2f} ({chg:+.2f}%)")
        if data["target_1"]:
            lines.append(f"  Target 1: Rs {data['target_1']:.2f} ({data['upside_t1_pct']:+.2f}% upside)")
        if data["target_2"]:
            lines.append(f"  Target 2: Rs {data['target_2']:.2f} ({data['upside_t2_pct']:+.2f}%)")
        if data["stop_loss"]:
            lines.append(f"  Stop Loss: Rs {data['stop_loss']:.2f} ({data['downside_stop_pct']:+.2f}%)")
        if data["notes"]:
            lines.append(f"  Notes: {data['notes'][:150]}")
        lines.append(f"  Alert: {'enabled' if data['alert_enabled'] else 'disabled'}")
        return _result("\n".join(lines), card={"type": "watchlist_item", "data": data})

    return await _run()


@tool(
    "get_rebalance_targets",
    "Compare the user's portfolio target allocations vs actual allocations by sector. "
    "Shows target %, actual %, deviation, and whether each sector is over/under-weight.",
    {"account_id": str},
)
async def get_rebalance_targets(args: dict) -> dict:
    account_id = args.get("account_id")
    user = get_user()

    @sync_to_async
    def _run():
        targets = list(PortfolioTarget.objects.filter(user=user).values(
            "target_type", "category_name", "target_percentage"
        ))
        if not targets:
            return _result("No portfolio targets configured. Set up allocation targets in settings.", is_error=True)

        qs = PortfolioItem.objects.filter(user=user)
        account = _resolve_account(user, account_id)
        if account:
            qs = qs.filter(account=account)
        items = PortfolioService.get_portfolio_metrics(qs)
        if not items:
            return _result("Portfolio is empty — cannot compare to targets.", is_error=True)

        tickers = [it.ticker for it in items]
        sector_map = {
            f.ticker: f.sector
            for f in StockFundamental.objects.filter(ticker__in=tickers).only("ticker", "sector")
        }
        total_value = sum(float(it.current_value) for it in items) or 1

        actual_sectors: dict[str, float] = {}
        for it in items:
            sector = sector_map.get(it.ticker) or "Unknown"
            actual_sectors[sector] = actual_sectors.get(sector, 0.0) + float(it.current_value)

        actual_pct: dict[str, float] = {s: v / total_value * 100 for s, v in actual_sectors.items()}

        rows = []
        for t in targets:
            cat = t["category_name"]
            target_pct = float(t["target_percentage"])
            actual = actual_pct.get(cat, 0.0)
            deviation = actual - target_pct
            rows.append({
                "category": cat,
                "type": t["target_type"],
                "target_pct": target_pct,
                "actual_pct": round(actual, 2),
                "deviation": round(deviation, 2),
                "status": "OVER" if deviation > 2 else ("UNDER" if deviation < -2 else "ON_TARGET"),
            })

        rows.sort(key=lambda r: abs(r["deviation"]), reverse=True)
        lines = [f"Portfolio vs target allocation ({len(rows)} targets):"]
        for r in rows:
            mark = "+" if r["status"] == "OVER" else ("-" if r["status"] == "UNDER" else "=")
            lines.append(
                f"  [{mark}] {r['category']}: target {r['target_pct']:.1f}%, "
                f"actual {r['actual_pct']:.1f}% ({r['deviation']:+.1f}%)"
            )
        return _result(
            "\n".join(lines),
            card={"type": "rebalance_targets", "data": {"total_value": total_value, "rows": rows}},
        )

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
    get_sector_breakdown,
    get_broker_trades_for_stock,
    search_stocks,
    # Stock Analyst
    get_stock_quote,
    get_price_history,
    get_technicals,
    get_fundamentals,
    get_dividend_history,
    get_accumulation,
    get_financial_reports,
    compare_stocks,
    get_price_levels,
    get_financial_statements,
    # Buy/Sell Strategist
    get_signals_for_ticker,
    get_signal_track_record,
    calc_position_size,
    get_active_signals,
    get_strategy_performance,
    screen_stocks,
    get_closed_signals,
    get_strategy_experiments,
    # Portfolio Advisor
    get_portfolio_overview,
    get_holdings,
    get_watchlist,
    get_risk_profile,
    get_realized_pnl,
    get_portfolio_accounts,
    get_transaction_history,
    get_portfolio_history,
    get_sector_allocation,
    get_recent_alerts,
    get_watchlist_item,
    get_rebalance_targets,
]


STOCKASTIC_MCP_SERVER = create_sdk_mcp_server(
    name="stockastic",
    version="1.0.0",
    tools=ALL_TOOLS,
)


def tool_id(name: str) -> str:
    """Helper for subagent tool allowlists. ``tool_id('get_holdings')`` → ``'mcp__stockastic__get_holdings'``."""
    return f"mcp__stockastic__{name}"
