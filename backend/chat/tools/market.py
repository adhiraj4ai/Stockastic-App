"""Market Analyst tools — NEPSE market data, prices, fundamentals, financials."""
from __future__ import annotations

from datetime import datetime, timedelta

from asgiref.sync import sync_to_async
from claude_agent_sdk import tool
from django.db.models import Q, Sum

from stocks.models.fundamentals import Dividend, FinancialReport, StockFundamental
from stocks.models.market import (
    Company,
    DailyCumulativeAccumulation,
    DailyFloorsheet,
    DailyMarketSummary,
    DailyStockPrice,
)
from stocks.services.fundamental_service import FundamentalService
from .base import _jsonable, _result


# ─── Market summary ───────────────────────────────────────────────────────────


@tool(
    "get_market_summary",
    "Latest NEPSE market snapshot: index points, turnover, volume, advancers/decliners, and the date.",
    {},
)
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
        last_date = last["date"].isoformat() if hasattr(last["date"], "isoformat") else str(last["date"])
        return _result(prose, card={"type": "market_summary", "data": {
            "date": last_date,
            "history": _jsonable(rows),
        }})

    return await _run()


# ─── Sector breakdown ─────────────────────────────────────────────────────────


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
            card={"type": "sector_breakdown", "data": {
                "date": latest.date.isoformat(),
                "sectors": [
                    {"name": s, "turnover": float(v or 0), "pct": float(v or 0) / total * 100}
                    for s, v in ranked
                ],
                "top_turnovers": top_turnovers,
                "top_volumes": top_volumes,
            }},
        )

    return await _run()


# ─── Floorsheet whales ────────────────────────────────────────────────────────


def _build_whale_entry(buyer_row, target_date, limit_picks=3):
    picks = list(
        DailyFloorsheet.objects.filter(
            transaction_date=target_date, buyer_id=buyer_row["buyer_id"]
        )
        .values("symbol")
        .annotate(turnover=Sum("transaction_amount"), quantity=Sum("transaction_quantity"))
        .order_by("-turnover")[:limit_picks]
    )
    return {
        "broker_id": buyer_row["buyer_id"],
        "total_turnover": float(buyer_row["turnover"] or 0),
        "top_picks": [
            {"symbol": p["symbol"], "turnover": float(p["turnover"] or 0), "quantity": int(p["quantity"] or 0)}
            for p in picks
        ],
    }


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
        whales = [_build_whale_entry(b, target) for b in buyers]
        prose = "\n".join(
            [f"Top buyer brokers on {target}:"]
            + [f"  #{w['broker_id']}: Rs {w['total_turnover']:,.0f}" for w in whales[:5]]
        )
        return _result(prose, card={"type": "whale_watch", "data": {"date": target.isoformat(), "whales": whales}})

    return await _run()


# ─── Broker trades floorsheet ─────────────────────────────────────────────────


def _aggregate_buyer_seller_maps(rows):
    buyer_agg: dict = {}
    seller_agg: dict = {}
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
    return buyer_agg, seller_agg


def _build_floorsheet_prose_and_card(ticker, rows, buyer_agg, seller_agg):
    trade_date = rows[0]["transaction_date"]
    total_vol = sum(r["transaction_quantity"] or 0 for r in rows)
    total_amt = sum(float(r["transaction_amount"] or 0) for r in rows)
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
    card = {"type": "floorsheet_detail", "data": {
        "symbol": ticker, "date": str(trade_date),
        "total_volume": total_vol, "total_amount": total_amt,
        "top_buyers": _jsonable(top_buyers), "top_sellers": _jsonable(top_sellers),
        "trades": _jsonable(rows[:20]),
    }}
    return "\n".join(lines), card


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
            "transaction_quantity", "transaction_rate", "transaction_amount", "transaction_date",
        )[:limit])
        if not rows:
            return _result(f"No trades found for {ticker}.", is_error=True)
        buyer_agg, seller_agg = _aggregate_buyer_seller_maps(rows)
        prose, card = _build_floorsheet_prose_and_card(ticker, rows, buyer_agg, seller_agg)
        return _result(prose, card=card)

    return await _run()


# ─── Stock search ─────────────────────────────────────────────────────────────


def _build_search_result(sym, company_row, funds, prices):
    fund = funds.get(sym)
    price = prices.get(sym)
    health, _ = FundamentalService.calculate_health_score(fund) if fund else (None, {})
    return {
        "ticker": sym,
        "name": company_row["name"],
        "sector": company_row["sector"],
        "price": float(price["close"]) if price and price.get("close") else None,
        "change_pct": float(price["diff_percent"]) if price and price.get("diff_percent") else None,
        "pe": float(fund.pe_ratio) if fund and fund.pe_ratio else None,
        "health_score": health,
    }


@sync_to_async
def _run_search_stocks(query, sector_filter, limit):
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
    results = [_build_search_result(c["symbol"], c, funds, prices) for c in companies]
    lines = [f"Found {len(results)} stocks:"]
    for r in results[:8]:
        lines.append(
            f"  {r['ticker']} ({r['sector'] or '?'}): "
            f"Rs {r['price'] or '?'}, health {r['health_score'] or '?'}/100"
        )
    return _result("\n".join(lines), card={"type": "search_results", "data": {"results": results}})


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
    return await _run_search_stocks(query, sector_filter, limit)


# ─── Stock quote, price history, technicals ───────────────────────────────────


def _build_stock_quote_data(ticker, price, company, fund):
    return {
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
        data = _build_stock_quote_data(ticker, price, company, fund)
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
            "symbol": ticker, "rows": _jsonable(rows),
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

    from stocks.technical import get_technical_indicators
    indicators = await sync_to_async(get_technical_indicators)(ticker)
    if not indicators:
        return _result(f"Not enough price history for {ticker} to compute indicators.", is_error=True)

    by_cat: dict[str, list[dict]] = {}
    for ind in indicators:
        by_cat.setdefault(ind["category"], []).append({
            "name": ind["name"], "value": ind["value"], "raw": _jsonable(ind.get("raw_value")),
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


# ─── Fundamentals & dividends ─────────────────────────────────────────────────


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
            "symbol": ticker, "name": fund.company_name, "sector": fund.sector,
            "market_cap": float(fund.market_cap or 0), "health_score": health, "metrics": metrics,
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


def _series_from_rows(rows: list[dict]) -> list[dict]:
    """Map date-aggregated ORM rows to chart-ready series points.

    Expects rows already aggregated by date (each row is one date),
    ordered ascending. No aggregation happens here — the ORM did it.
    """
    return [{"date": str(r["transaction_date"]), "net": float(r["net"] or 0)} for r in rows]


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
        series_qs = (
            DailyCumulativeAccumulation.objects
            .filter(symbol=ticker, transaction_date__gte=cutoff)
            .values("transaction_date")
            .annotate(net=Sum("cumulative_net"))
            .order_by("transaction_date")
        )
        series = _series_from_rows(list(series_qs))
        lines = [f"{ticker} accumulation (last {days} days):"]
        if net_buyers:
            lines.append("  Top net buyers: " + ", ".join(f"#{r['entity_id']}" for r in net_buyers))
        if net_sellers:
            lines.append("  Top net sellers: " + ", ".join(f"#{r['entity_id']}" for r in net_sellers))
        return _result("\n".join(lines), card={"type": "accumulation", "data": {
            "symbol": ticker,
            "rows": _jsonable(rows[:20]),
            "series": series,
        }})

    return await _run()


# ─── Financial reports & statements ───────────────────────────────────────────


def _build_financial_report_row(r):
    return {
        "fiscal_year": r.fiscal_year, "report_type": r.report_type, "quarter": r.quarter,
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
    }


@sync_to_async
def _run_get_financial_reports(ticker, report_type, limit):
    qs = FinancialReport.objects.filter(ticker=ticker)
    if report_type in ("QUARTERLY", "ANNUAL"):
        qs = qs.filter(report_type=report_type)
    rows = list(qs.order_by("-fiscal_year", "-report_type", "-quarter")[:limit])
    if not rows:
        return _result(f"No financial reports for {ticker}.", is_error=True)
    data_rows = [_build_financial_report_row(r) for r in rows]
    latest = data_rows[0]
    period = latest["fiscal_year"]
    if latest.get("quarter"):
        period += f" Q{latest['quarter']}"
    if latest.get("net_profit"):
        prose = f"{ticker} latest {report_type.lower()} ({period}): net profit Rs {latest['net_profit']:,.0f}"
    else:
        prose = f"{ticker}: {len(data_rows)} {report_type.lower()} reports available."
    return _result(prose, card={"type": "financial_reports", "data": {
        "symbol": ticker, "report_type": report_type, "reports": data_rows,
    }})


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
    return await _run_get_financial_reports(ticker, report_type, limit)


def _build_compare_row(ticker, funds, companies, prices):
    fund = funds.get(ticker)
    co = companies.get(ticker)
    px = prices.get(ticker)
    health, _ = FundamentalService.calculate_health_score(fund) if fund else (None, {})
    return {
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
    }


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
        rows = [_build_compare_row(ticker, funds, companies, prices) for ticker in tickers]
        lines = ["Comparison: " + " vs ".join(tickers)]
        for r in rows:
            lines.append(
                f"  {r['ticker']}: Rs {r['price'] or '?'}, PE={r['pe'] or '?'}, "
                f"health={r['health_score'] or '?'}/100, div_yield={r['dividend_yield'] or '?'}%"
            )
        return _result("\n".join(lines), card={"type": "compare", "data": {"rows": rows}})

    return await _run()


def _compute_price_level_distances(latest):
    ltp = float(latest.close or 0)

    def _dist(level):
        if not level or level == 0:
            return None
        return round((ltp - float(level)) / float(level) * 100, 2)

    return ltp, {
        "date": latest.date.isoformat(), "ltp": ltp,
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
        ltp, data = _compute_price_level_distances(latest)
        data["symbol"] = ticker
        lines = [f"{ticker} price levels (LTP Rs {ltp:.2f} on {data['date']}):"]
        level_labels = [
            ("vwap", "VWAP"), ("days_120", "120-day avg"), ("days_180", "180-day avg"),
            ("weeks_52_high", "52w High"), ("weeks_52_low", "52w Low"),
        ]
        for key, label in level_labels:
            val = data[key]
            pct = data.get(f"{key}_pct") or data.get(f"{key}_pct_from_ltp")
            if val:
                lines.append(f"  {label}: Rs {val:.2f} ({pct:+.2f}% vs LTP)")
        return _result("\n".join(lines), card={"type": "price_levels", "data": data})

    return await _run()


def _fetch_financial_report(ticker, report_type):
    report = (
        FinancialReport.objects.filter(ticker=ticker, report_type=report_type)
        .order_by("-fiscal_year", "-quarter")
        .first()
    )
    if not report:
        report = FinancialReport.objects.filter(ticker=ticker).order_by("-fiscal_year", "-quarter").first()
    return report


def _summarise_statement_data(raw_data):
    if isinstance(raw_data, dict):
        top_keys = list(raw_data.keys())[:5]
        return ", ".join(f"{k}: {raw_data[k]}" for k in top_keys)
    return str(raw_data)[:250]


@sync_to_async
def _run_get_financial_statements(ticker, statement, report_type):
    report = _fetch_financial_report(ticker, report_type)
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
    summary = _summarise_statement_data(raw_data)
    prose = f"{ticker} {statement.replace('_', ' ')} [{period}]: {summary[:280]}"
    return _result(prose, card={"type": "financial_statement", "data": {
        "symbol": ticker, "fiscal_year": report.fiscal_year,
        "report_type": report.report_type, "quarter": report.quarter,
        "statement": statement, "data": _jsonable(raw_data),
    }})


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
    return await _run_get_financial_statements(ticker, statement, report_type)


# ─── Stock screener ───────────────────────────────────────────────────────────


def _apply_screener_filters(sector_filter, min_pe, max_pe):
    qs = StockFundamental.objects.all()
    if sector_filter:
        qs = qs.filter(sector__icontains=sector_filter)
    if min_pe is not None:
        qs = qs.filter(pe_ratio__gte=min_pe)
    if max_pe is not None:
        qs = qs.filter(pe_ratio__lte=max_pe)
    return list(qs.order_by("ticker")[:200])


def _build_signal_map(funds, has_signal):
    from stocks.models.signal import SignalEpisode
    if has_signal not in ("BUY", "SELL"):
        return {}
    signal_map = {}
    active = (SignalEpisode.objects.filter(
        status="ACTIVE", direction=has_signal,
        symbol__in=[f.ticker for f in funds],
    ).values("symbol", "entry_strength", "source").order_by("symbol", "-entry_strength"))
    for s in active:
        if s["symbol"] not in signal_map:
            signal_map[s["symbol"]] = {
                "symbol": s["symbol"], "strength": s["entry_strength"],
                "source": s["source"], "signal": has_signal,
            }
    return signal_map


def _fetch_price_map(tickers):
    price_map = {}
    for p in (
        DailyStockPrice.objects.filter(ticker__in=tickers)
        .order_by("ticker", "-date")
        .distinct("ticker")
        .values("ticker", "close", "diff_percent")
    ):
        price_map[p["ticker"]] = p
    return price_map


def _build_screener_result(fund, health, px, sig):
    return {
        "ticker": fund.ticker, "name": fund.company_name, "sector": fund.sector,
        "price": float(px["close"]) if px and px.get("close") else None,
        "change_pct": float(px["diff_percent"]) if px and px.get("diff_percent") else None,
        "pe": float(fund.pe_ratio) if fund.pe_ratio else None,
        "health_score": health,
        "dividend_yield": float(fund.dividend_yield) if fund.dividend_yield else None,
        "signal": sig["signal"] if sig else None,
        "signal_source": sig["source"] if sig else None,
        "signal_strength": float(sig["strength"]) if sig else None,
    }


def _run_screen_stocks_sync(sector_filter, min_pe, max_pe, has_signal, limit):
    funds = _apply_screener_filters(sector_filter, min_pe, max_pe)
    if not funds:
        return _result("No stocks match your criteria.", is_error=True)
    signal_map = _build_signal_map(funds, has_signal)
    if has_signal in ("BUY", "SELL"):
        funds = [f for f in funds if f.ticker in signal_map]
    tickers = [f.ticker for f in funds]
    price_map = _fetch_price_map(tickers)
    results = []
    for fund in funds:
        health, _ = FundamentalService.calculate_health_score(fund)
        px = price_map.get(fund.ticker)
        sig = signal_map.get(fund.ticker)
        results.append(_build_screener_result(fund, health, px, sig))
    results.sort(key=lambda r: (r["health_score"] or 0), reverse=True)
    return results[:limit]


def _format_screener_results(results, sector_filter, min_pe, max_pe, has_signal):
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
            "criteria": {"sector": sector_filter or None, "min_pe": min_pe, "max_pe": max_pe,
                         "has_signal": has_signal or None},
            "results": results,
        }},
    )


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
        results = _run_screen_stocks_sync(sector_filter, min_pe, max_pe, has_signal, limit)
        if isinstance(results, dict):  # error result
            return results
        return _format_screener_results(results, sector_filter, min_pe, max_pe, has_signal)

    return await _run()
