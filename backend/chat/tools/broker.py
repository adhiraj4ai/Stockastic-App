"""Broker Intelligence tools — accumulation flows, smart money, broker analysis."""
from __future__ import annotations

from asgiref.sync import sync_to_async
from claude_agent_sdk import tool

from stocks.services import broker_research

from .base import _result


# ─── Table card helper ────────────────────────────────────────────────────────


def _broker_table_card(title: str, columns: list[dict], rows: list[dict], meta: dict | None = None) -> dict:
    """Generic table card payload rendered by BrokerTableCard on the frontend."""
    return {"type": "broker_table", "data": {"title": title, "columns": columns, "rows": rows, "meta": meta or {}}}


# ─── Accumulation flows ───────────────────────────────────────────────────────


def _accumulation_flows_columns():
    return [
        {"key": "symbol", "label": "Symbol"},
        {"key": "net_qty", "label": "Net Qty", "align": "right", "format": "number"},
        {"key": "buy_qty", "label": "Buy Qty", "align": "right", "format": "number"},
        {"key": "sell_qty", "label": "Sell Qty", "align": "right", "format": "number"},
        {"key": "accumulation_ratio", "label": "Acc Ratio", "align": "right", "format": "decimal"},
        {"key": "close", "label": "Close", "align": "right", "format": "decimal"},
        {"key": "rsi", "label": "RSI", "align": "right", "format": "decimal"},
        {"key": "roc", "label": "ROC %", "align": "right", "format": "percent"},
    ]


@sync_to_async
def _run_get_accumulation_flows(range_key: str, sector: str, symbol) -> dict:
    try:
        rows = broker_research.accumulation_flows(range_key=range_key, sector=sector, symbol=symbol)
    except Exception as exc:
        return _result(f"Data unavailable: {exc}", is_error=True, _tool_name="get_accumulation_flows")
    if not rows:
        return _result(
            f"No accumulation flow data found for range={range_key}, sector={sector}.",
            is_error=True, _tool_name="get_accumulation_flows",
        )
    top = rows[:15]
    lines = [f"Accumulation flows ({range_key}, {sector}), top {len(top)} of {len(rows)} by net qty:"]
    for r in top:
        lines.append(
            f"- {r.get('symbol')}: net {int(r.get('net_qty') or 0):,} sh, "
            f"acc_ratio {r.get('accumulation_ratio')}, RSI {r.get('rsi')}, ROC {r.get('roc')}"
        )
    return _result(
        "\n".join(lines),
        card=_broker_table_card(f"Accumulation Flows ({range_key})", _accumulation_flows_columns(), rows),
        _tool_name="get_accumulation_flows",
    )


@tool(
    "get_accumulation_flows",
    "Market-wide smart-money accumulation: per-symbol buy/sell/net broker flow with RSI/ROC and top buyers/sellers. Optional sector or symbol filter. Valid range values: 1D, 1W, 2W, 1M, 3M, 6M, 1Y, 2Y, ALL.",
    {"range": str, "sector": str, "symbol": str},
)
async def get_accumulation_flows(args: dict) -> dict:
    range_key = (args.get("range") or "1D").upper()
    sector = args.get("sector") or "All"
    symbol = (args.get("symbol") or "").upper().strip() or None
    return await _run_get_accumulation_flows(range_key, sector, symbol)


# ─── Smart money flows ────────────────────────────────────────────────────────


def _build_smart_money_lines(range_key: str, leaderboard: list, symbol_flows: list, kpi: dict) -> list:
    lines = [f"Smart money flows ({range_key}):"]
    lines.append(
        f"KPI: whale vol {int(kpi.get('total_whale_volume') or 0):,} sh, "
        f"Rs {float(kpi.get('total_whale_amount') or 0):,.0f}, "
        f"{kpi.get('active_symbols')} symbols, {kpi.get('active_brokers')} brokers."
    )
    if leaderboard:
        lines.append("Leaderboard: " + ", ".join(
            f"#{b.get('broker_id')}({b.get('rank')},score={b.get('score')})" for b in leaderboard[:10]
        ))
    top_flows = symbol_flows[:15]
    if top_flows:
        lines.append(f"Top symbol flows ({len(top_flows)}):")
        for sf in top_flows:
            lines.append(
                f"- {sf.get('symbol')}: smart_buy {int(sf.get('smart_buy_qty') or 0):,}, "
                f"net {int(sf.get('net_qty') or 0):,}"
            )
    return lines


@sync_to_async
def _run_get_smart_money_flows(range_key: str) -> dict:
    try:
        data = broker_research.smart_money(range_key=range_key)
    except Exception as exc:
        return _result(f"Data unavailable: {exc}", is_error=True, _tool_name="get_smart_money_flows")
    leaderboard = data.get("leaderboard") or []
    symbol_flows = data.get("symbol_flows") or []
    kpi = data.get("kpi") or {}
    if not leaderboard and not symbol_flows:
        return _result(f"No smart money data found for range={range_key}.", is_error=True, _tool_name="get_smart_money_flows")
    lines = _build_smart_money_lines(range_key, leaderboard, symbol_flows, kpi)
    columns = [
        {"key": "symbol", "label": "Symbol"},
        {"key": "smart_buy_qty", "label": "Smart Buy", "align": "right", "format": "number"},
        {"key": "net_qty", "label": "Net Qty", "align": "right", "format": "number"},
    ]
    return _result(
        "\n".join(lines),
        card=_broker_table_card(f"Smart Money Flows ({range_key})", columns, symbol_flows,
                                meta={"leaderboard": leaderboard, "kpi": kpi}),
        _tool_name="get_smart_money_flows",
    )


@tool(
    "get_smart_money_flows",
    "Top-10 whale brokers for a period: leaderboard, their per-symbol net buys, and aggregate whale volume KPIs. Valid range values: 1D, 2D, 3D, 1W, 1M, 3M, 6M.",
    {"range": str},
)
async def get_smart_money_flows(args: dict) -> dict:
    range_key = (args.get("range") or "1D").upper()
    return await _run_get_smart_money_flows(range_key)


# ─── Broker trends ────────────────────────────────────────────────────────────


def _broker_trends_columns():
    return [
        {"key": "symbol", "label": "Symbol"},
        {"key": "broker", "label": "Broker"},
        {"key": "cumulative_net", "label": "Cum Net", "align": "right", "format": "number"},
        {"key": "wac", "label": "WAC", "align": "right", "format": "decimal"},
        {"key": "ltp", "label": "LTP", "align": "right", "format": "decimal"},
        {"key": "trend_5d", "label": "5D Trend"},
        {"key": "trend_20d", "label": "20D Trend"},
        {"key": "change_20d", "label": "Chg 20D %", "align": "right", "format": "percent"},
    ]


@sync_to_async
def _run_get_broker_trends(symbol, range_key: str) -> dict:
    try:
        rows = broker_research.broker_trends(symbol=symbol, range_key=range_key)
    except Exception as exc:
        return _result(f"Data unavailable: {exc}", is_error=True, _tool_name="get_broker_trends")
    if not rows:
        return _result(
            f"No broker trend data found{f' for {symbol}' if symbol else ''} (range={range_key}).",
            is_error=True, _tool_name="get_broker_trends",
        )
    top = rows[:15]
    lines = [f"Broker trends ({range_key}{f', {symbol}' if symbol else ''}), top {len(top)} by cumulative net:"]
    for r in top:
        lines.append(
            f"- {r.get('symbol')} broker#{r.get('broker')}: cumnet {int(r.get('cumulative_net') or 0):,}, "
            f"WAC {float(r.get('wac') or 0):.2f}, LTP {r.get('ltp')}, trend_20d {r.get('trend_20d')}"
        )
    return _result(
        "\n".join(lines),
        card=_broker_table_card(f"Broker Trends ({range_key})", _broker_trends_columns(), rows),
        _tool_name="get_broker_trends",
    )


@tool(
    "get_broker_trends",
    "Per-broker cumulative net position, weighted avg cost, and 5/10/20/50-day accumulation trends. Optionally for one symbol; otherwise top global positions. Valid range values: 1D, 1W, 2W, 1M, 3M, 6M, 1Y, 2Y, ALL.",
    {"symbol": str, "range": str},
)
async def get_broker_trends(args: dict) -> dict:
    symbol = (args.get("symbol") or "").upper().strip() or None
    range_key = (args.get("range") or "ALL").upper()
    return await _run_get_broker_trends(symbol, range_key)


# ─── Broker focus ranking ─────────────────────────────────────────────────────


def _broker_focus_columns():
    return [
        {"key": "symbol", "label": "Symbol"},
        {"key": "ltp", "label": "LTP", "align": "right", "format": "decimal"},
        {"key": "appearances", "label": "Appearances", "align": "right", "format": "number"},
        {"key": "avg_rank", "label": "Avg Rank", "align": "right", "format": "decimal"},
    ]


@tool(
    "get_broker_focus_ranking",
    "Which symbols the top brokers focused their buying on each day (rank series over the period). Valid range values: 1W, 2W, 1M.",
    {"range": str},
)
async def get_broker_focus_ranking(args: dict) -> dict:
    range_key = (args.get("range") or "1W").upper()

    @sync_to_async
    def _run():
        try:
            data = broker_research.focus_ranking(range_key=range_key)
        except Exception as exc:
            return _result(f"Data unavailable: {exc}", is_error=True, _tool_name="get_broker_focus_ranking")
        series = data.get("series") or []
        dates = data.get("dates") or []
        if not series:
            return _result(f"No broker focus ranking data found for range={range_key}.",
                           is_error=True, _tool_name="get_broker_focus_ranking")
        top = series[:15]
        lines = [f"Broker focus ranking ({range_key}), {len(series)} symbols over {len(dates)} days:"]
        for s in top:
            lines.append(
                f"- {s.get('symbol')}: appearances {s.get('appearances')}, avg_rank {s.get('avg_rank')}, LTP {s.get('ltp')}"
            )
        card_rows = [{k: v for k, v in row.items() if k not in ("ranks", "volumes")} for row in series]
        return _result(
            "\n".join(lines),
            card=_broker_table_card(f"Broker Focus Ranking ({range_key})", _broker_focus_columns(), card_rows,
                                    meta={"dates": dates}),
            _tool_name="get_broker_focus_ranking",
        )

    return await _run()


# ─── Broker favorites ─────────────────────────────────────────────────────────


def _broker_favorites_columns():
    return [
        {"key": "symbol", "label": "Symbol"},
        {"key": "current_net", "label": "Net Qty", "align": "right", "format": "number"},
        {"key": "wac", "label": "WAC", "align": "right", "format": "decimal"},
        {"key": "ltp", "label": "LTP", "align": "right", "format": "decimal"},
        {"key": "buy_qty", "label": "Bought", "align": "right", "format": "number"},
        {"key": "sell_qty", "label": "Sold", "align": "right", "format": "number"},
        {"key": "roc", "label": "ROC %", "align": "right", "format": "percent"},
        {"key": "rsi", "label": "RSI", "align": "right", "format": "decimal"},
    ]


@tool(
    "get_broker_favorites",
    "A broker's accumulated stocks over a period: current net position, WAC, buy/sell qty, LTP, RSI/ROC. Requires broker_id. Valid range values: 1D, 1W, 2W, 1M, 3M, 6M, 1Y, 2Y, ALL.",
    {"broker_id": int, "range": str},
)
async def get_broker_favorites(args: dict) -> dict:
    broker_id = args.get("broker_id")
    range_key = (args.get("range") or "3M").upper()
    if not broker_id:
        return _result("broker_id is required (integer broker number).", is_error=True, _tool_name="get_broker_favorites")

    @sync_to_async
    def _run():
        try:
            rows = broker_research.broker_favorites(broker_id=int(broker_id), range_key=range_key)
        except Exception as exc:
            return _result(f"Data unavailable: {exc}", is_error=True, _tool_name="get_broker_favorites")
        if not rows:
            return _result(f"No accumulation activity found for broker {broker_id} in range {range_key}.",
                           is_error=True, _tool_name="get_broker_favorites")
        top = rows[:15]
        lines = [f"Broker {broker_id} favorites ({range_key}), top {len(top)} of {len(rows)} by net amount:"]
        for r in top:
            lines.append(
                f"- {r.get('symbol')}: net {int(r.get('current_net') or 0):,} sh @ WAC {float(r.get('wac') or 0):.2f}, "
                f"LTP {r.get('ltp')}, ROC {r.get('roc')}"
            )
        return _result(
            "\n".join(lines),
            card=_broker_table_card(f"Broker {broker_id} Favorites ({range_key})", _broker_favorites_columns(), rows),
            _tool_name="get_broker_favorites",
        )

    return await _run()


# ─── Navigator signals ────────────────────────────────────────────────────────


def _navigator_columns():
    return [
        {"key": "symbol", "label": "Symbol"},
        {"key": "signal_type", "label": "Signal"},
        {"key": "cluster_count", "label": "Clusters", "align": "right", "format": "number"},
        {"key": "inst_net_5d", "label": "Inst Net 5D", "align": "right", "format": "number"},
        {"key": "top_broker_wac", "label": "Top WAC", "align": "right", "format": "decimal"},
        {"key": "ltp", "label": "LTP", "align": "right", "format": "decimal"},
        {"key": "strength", "label": "Strength"},
    ]


@tool(
    "get_navigator_signals",
    "Institutional clustering signals: Platinum/Gold/Silver buys and bullish divergences where multiple smart-money brokers accumulate together, with rationale and strength.",
    {},
)
async def get_navigator_signals(args: dict) -> dict:
    @sync_to_async
    def _run():
        try:
            rows = broker_research.navigator_signals()
        except Exception as exc:
            return _result(f"Data unavailable: {exc}", is_error=True, _tool_name="get_navigator_signals")
        if not rows:
            return _result("No navigator signals found at this time.", is_error=True, _tool_name="get_navigator_signals")
        top = rows[:15]
        lines = [f"Navigator signals — {len(rows)} active signal(s):"]
        for r in top:
            lines.append(
                f"- {r.get('symbol')} [{r.get('signal_type')}] strength={r.get('strength')}, "
                f"clusters={r.get('cluster_count')}, inst_net_5d={int(r.get('inst_net_5d') or 0):,}, "
                f"LTP {r.get('ltp')}, WAC {r.get('top_broker_wac')}"
            )
        return _result(
            "\n".join(lines),
            card=_broker_table_card("Navigator Signals", _navigator_columns(), rows),
            _tool_name="get_navigator_signals",
        )

    return await _run()


# ─── Below cost positions ─────────────────────────────────────────────────────


def _below_cost_columns():
    return [
        {"key": "symbol", "label": "Symbol"},
        {"key": "broker", "label": "Broker"},
        {"key": "cumulative_net", "label": "Net Qty", "align": "right", "format": "number"},
        {"key": "wac", "label": "WAC", "align": "right", "format": "decimal"},
        {"key": "ltp", "label": "LTP", "align": "right", "format": "decimal"},
        {"key": "roc", "label": "ROC %", "align": "right", "format": "percent"},
        {"key": "rsi", "label": "RSI", "align": "right", "format": "decimal"},
        {"key": "trend_20d", "label": "Trend 20D"},
    ]


def _run_below_cost_positions(range_key, sector, limit):
    try:
        rows = broker_research.below_cost(range_key=range_key, sector=sector)
    except Exception as exc:
        return _result(f"Data unavailable: {exc}", is_error=True, _tool_name="get_below_cost_positions")
    rows = rows[:limit]
    if not rows:
        return _result(f"No below-cost positions found for range={range_key}, sector={sector}.",
                       is_error=True, _tool_name="get_below_cost_positions")
    top = rows[:15]
    lines = [f"Below-cost positions ({range_key}, {sector}), top {len(top)} of {len(rows)} most underwater:"]
    for r in top:
        lines.append(
            f"- {r.get('symbol')} broker#{r.get('broker')}: "
            f"WAC {float(r.get('wac') or 0):.2f} vs LTP {r.get('ltp')}, "
            f"ROC {r.get('roc')}, net {int(r.get('cumulative_net') or 0):,}"
        )
    return _result(
        "\n".join(lines),
        card=_broker_table_card(f"Below-Cost Positions ({range_key})", _below_cost_columns(), rows),
        _tool_name="get_below_cost_positions",
    )


@tool(
    "get_below_cost_positions",
    "Broker positions currently priced below the broker's weighted average cost (underwater accumulations), most underwater first. Optional sector filter. Valid range values: 1D, 1W, 2W, 1M, 3M, 6M, 1Y, 2Y, ALL.",
    {"range": str, "sector": str, "limit": int},
)
async def get_below_cost_positions(args: dict) -> dict:
    range_key = (args.get("range") or "ALL").upper()
    sector = args.get("sector") or "All"
    try:
        limit = min(int(args.get("limit") or 50), 200)
    except (TypeError, ValueError):
        limit = 50
    return await sync_to_async(_run_below_cost_positions)(range_key, sector, limit)


# ─── Accumulation history ─────────────────────────────────────────────────────


def _accumulation_history_columns(broker_id, symbol):
    return [
        {"key": "date", "label": "Date"},
        {"key": "buy_qty", "label": "Buy Qty", "align": "right", "format": "number"},
        {"key": "buy_rate", "label": "Buy Rate", "align": "right", "format": "decimal"},
        {"key": "sell_qty", "label": "Sell Qty", "align": "right", "format": "number"},
        {"key": "sell_rate", "label": "Sell Rate", "align": "right", "format": "decimal"},
        {"key": "net_quantity", "label": "Net Qty", "align": "right", "format": "number"},
        {"key": "cumulative_qty", "label": "Cum Qty", "align": "right", "format": "number"},
        {"key": "wac", "label": "WAC", "align": "right", "format": "decimal"},
    ]


def _run_accumulation_history(broker_id, symbol, limit):
    try:
        rows = broker_research.accumulation_history(broker_id=int(broker_id), symbol=symbol, page=1, page_size=limit)
    except Exception as exc:
        return _result(f"Data unavailable: {exc}", is_error=True, _tool_name="get_accumulation_history")
    if not rows:
        return _result(f"No accumulation history for broker {broker_id} / {symbol}.",
                       is_error=True, _tool_name="get_accumulation_history")
    top = rows[:10]
    lines = [f"Accumulation history for broker {broker_id} in {symbol} (last {len(rows)} days):"]
    for r in top:
        lines.append(
            f"- {r.get('date')}: buy {int(r.get('buy_qty') or 0):,}@{float(r.get('buy_rate') or 0):.2f}, "
            f"sell {int(r.get('sell_qty') or 0):,}, net {int(r.get('net_quantity') or 0):,}, "
            f"cum {int(r.get('cumulative_qty') or 0):,}, WAC {float(r.get('wac') or 0):.2f}"
        )
    return _result(
        "\n".join(lines),
        card=_broker_table_card(f"Broker {broker_id} History — {symbol}",
                                _accumulation_history_columns(broker_id, symbol), rows),
        _tool_name="get_accumulation_history",
    )


@tool(
    "get_accumulation_history",
    "Daily buy/sell/net delta history for one broker in one symbol (rates, amounts, cumulative position, WAC).",
    {"broker_id": int, "symbol": str, "limit": int},
)
async def get_accumulation_history(args: dict) -> dict:
    broker_id = args.get("broker_id")
    symbol = (args.get("symbol") or "").upper().strip()
    limit = min(int(args.get("limit") or 60), 250)
    if not broker_id:
        return _result("broker_id is required.", is_error=True, _tool_name="get_accumulation_history")
    if not symbol:
        return _result("symbol is required.", is_error=True, _tool_name="get_accumulation_history")
    return await sync_to_async(_run_accumulation_history)(broker_id, symbol, limit)


# ─── Share transfers ──────────────────────────────────────────────────────────


def _run_share_transfers(symbol, broker1, broker2, range_key):
    try:
        data = broker_research.share_transfers(
            symbol=symbol, broker1=int(broker1), broker2=int(broker2), range_key=range_key
        )
    except Exception as exc:
        return _result(f"Data unavailable: {exc}", is_error=True, _tool_name="get_share_transfers")
    summary = data.get("summary") or {}
    daily_stats = data.get("daily_stats") or []
    b1_to_b2 = summary.get("broker1_to_broker2") or {}
    b2_to_b1 = summary.get("broker2_to_broker1") or {}
    if not b1_to_b2.get("total_volume") and not b2_to_b1.get("total_volume"):
        return _result(
            f"No transfers found between broker {broker1} and broker {broker2} for {symbol} in range {range_key}.",
            is_error=True, _tool_name="get_share_transfers",
        )
    lines = _build_transfer_lines(symbol, broker1, broker2, range_key, b1_to_b2, b2_to_b1, daily_stats)
    return _result("\n".join(lines), _tool_name="get_share_transfers")


@tool(
    "get_share_transfers",
    "Share transfer analysis between two specific brokers in one symbol: volumes each direction, net accumulation, and daily stats. Valid range values: 1D, 1W, 2W, 1M, 3M, 6M, 1Y, ALL.",
    {"symbol": str, "broker1": int, "broker2": int, "range": str},
)
async def get_share_transfers(args: dict) -> dict:
    symbol = (args.get("symbol") or "").upper().strip()
    broker1 = args.get("broker1")
    broker2 = args.get("broker2")
    range_key = (args.get("range") or "1M").upper()
    if not symbol:
        return _result("symbol is required.", is_error=True, _tool_name="get_share_transfers")
    if not broker1:
        return _result("broker1 is required.", is_error=True, _tool_name="get_share_transfers")
    if not broker2:
        return _result("broker2 is required.", is_error=True, _tool_name="get_share_transfers")
    return await sync_to_async(_run_share_transfers)(symbol, broker1, broker2, range_key)


def _build_transfer_lines(symbol, broker1, broker2, range_key, b1_to_b2, b2_to_b1, daily_stats):
    lines = [
        f"Share transfers {symbol}: broker {broker1} ↔ broker {broker2} ({range_key})",
        f"- {broker1}→{broker2}: vol {int(b1_to_b2.get('total_volume') or 0):,}, "
        f"amt {float(b1_to_b2.get('total_amount') or 0):,.0f}, avg rate {float(b1_to_b2.get('avg_rate') or 0):.2f}",
        f"- {broker2}→{broker1}: vol {int(b2_to_b1.get('total_volume') or 0):,}, "
        f"amt {float(b2_to_b1.get('total_amount') or 0):,.0f}, avg rate {float(b2_to_b1.get('avg_rate') or 0):.2f}",
    ]
    recent = daily_stats[-5:] if daily_stats else []
    if recent:
        lines.append(f"Last {len(recent)} daily stats:")
        for d in recent:
            dt = d.get("transaction_date") or d.get("date") or ""
            lines.append(
                f"  {dt}: {broker1}→{broker2} {int(d.get('volume_1_to_2') or 0):,}, "
                f"{broker2}→{broker1} {int(d.get('volume_2_to_1') or 0):,}"
            )
    return lines


# ─── Broker portfolio ─────────────────────────────────────────────────────────


def _broker_portfolio_columns():
    return [
        {"key": "symbol", "label": "Symbol"},
        {"key": "sector", "label": "Sector"},
        {"key": "quantity", "label": "Qty", "align": "right", "format": "number"},
        {"key": "value", "label": "Value", "align": "right", "format": "number"},
        {"key": "wac", "label": "WAC", "align": "right", "format": "decimal"},
        {"key": "current_price", "label": "LTP", "align": "right", "format": "decimal"},
        {"key": "trend_5d", "label": "5D Trend", "align": "right"},
        {"key": "trend_1m", "label": "1M Trend", "align": "right"},
    ]


@tool(
    "get_broker_portfolio",
    "A broker's full current holdings book: quantity, value, WAC, and 5d/10d/1m/3m position trends per symbol.",
    {"broker_id": int},
)
async def get_broker_portfolio(args: dict) -> dict:
    broker_id = args.get("broker_id")
    if not broker_id:
        return _result("broker_id is required.", is_error=True, _tool_name="get_broker_portfolio")

    @sync_to_async
    def _run():
        try:
            data = broker_research.broker_portfolio(broker_id=int(broker_id))
        except Exception as exc:
            return _result(f"Data unavailable: {exc}", is_error=True, _tool_name="get_broker_portfolio")
        holdings = data.get("holdings") or []
        total_value = float(data.get("total_value") or 0)
        if not holdings:
            return _result(f"No holdings found for broker {broker_id}.", is_error=True, _tool_name="get_broker_portfolio")
        top = holdings[:10]
        lines = [f"Broker {broker_id} portfolio — {len(holdings)} holding(s), total value Rs {total_value:,.0f}:"]
        for h in top:
            lines.append(
                f"- {h.get('symbol')} ({h.get('sector')}): {int(h.get('quantity') or 0):,} sh @ "
                f"WAC {float(h.get('wac') or 0):.2f}, LTP {h.get('current_price')}, "
                f"val Rs {float(h.get('value') or 0):,.0f}"
            )
        return _result(
            "\n".join(lines),
            card=_broker_table_card(f"Broker {broker_id} Portfolio", _broker_portfolio_columns(), holdings,
                                    meta={"broker_id": broker_id, "total_value": total_value}),
            _tool_name="get_broker_portfolio",
        )

    return await _run()


# ─── Accumulation forecast ────────────────────────────────────────────────────


@tool(
    "get_accumulation_forecast",
    "Accumulation-intensity price projection for ONE symbol: current intensity, historical win rates by horizon, "
    "and p10-p90 price bands for 5/10/20/30 days. Cold call may take ~10s (cached 4h after).",
    {"symbol": str, "min_intensity": float},
)
async def get_accumulation_forecast(args: dict) -> dict:
    symbol = (args.get("symbol") or "").upper().strip()
    min_intensity = float(args.get("min_intensity") or 3.0)
    if not symbol:
        return _result("symbol is required.", is_error=True, _tool_name="get_accumulation_forecast")

    @sync_to_async
    def _run():
        try:
            data = broker_research.accumulation_forecast(symbol=symbol, min_intensity=min_intensity)
        except Exception as exc:
            return _result(f"Data unavailable: {exc}", is_error=True, _tool_name="get_accumulation_forecast")
        if not data:
            return _result(f"No accumulation events found for {symbol} at intensity >= {min_intensity}.",
                           is_error=True, _tool_name="get_accumulation_forecast")
        cur = data.get("current") or {}
        proj = (data.get("projection") or {}).get("bands") or {}
        lines = [
            f"{symbol} accumulation forecast — LTP {cur.get('ltp')}, current intensity {cur.get('intensity')}, "
            f"volume spike {cur.get('volume_spike')}.",
        ]
        for horizon, band in proj.items():
            lines.append(f"- {horizon}: p10 {band.get('p10')} / p50 {band.get('p50')} / p90 {band.get('p90')}")
        wr = (data.get("study") or {}).get("win_rates")
        if wr:
            lines.append(f"Historical win rates: {wr}")
        return _result("\n".join(lines), _tool_name="get_accumulation_forecast")

    return await _run()
