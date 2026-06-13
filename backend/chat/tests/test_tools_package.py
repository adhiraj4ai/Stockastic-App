"""Import and smoke tests for the chat.tools domain-grouped package.

Verifies:
- Every public symbol from the original chat.tools module is importable.
- ALL_TOOLS contains all expected tool functions.
- tool_id() returns the correct MCP-prefixed string.
- Private base utilities (_result, _jsonable, _resolve_account) are reachable.
- Each domain submodule is individually importable.
"""
from __future__ import annotations

import importlib


# ─── Public API import test ───────────────────────────────────────────────────


def test_all_tools_list_importable():
    from chat.tools import ALL_TOOLS
    assert isinstance(ALL_TOOLS, list)
    assert len(ALL_TOOLS) > 40, "Expected at least 41 tools registered"


def test_tool_id_helper():
    from chat.tools import tool_id
    assert tool_id("get_holdings") == "mcp__stockastic__get_holdings"


def test_mcp_server_importable():
    from chat.tools import STOCKASTIC_MCP_SERVER
    assert STOCKASTIC_MCP_SERVER is not None


def test_base_utilities_importable():
    from chat.tools import _result, _jsonable, _resolve_account, _rank_strategy_signals, score_candidate
    # Smoke-test _result and _jsonable without hitting the DB
    r = _result("hello")
    assert r["prose"] == "hello"
    assert _jsonable({"a": 1}) == {"a": 1}


# ─── Domain submodule import tests ───────────────────────────────────────────


SUBMODULES = [
    "chat.tools.base",
    "chat.tools.market",
    "chat.tools.signals",
    "chat.tools.portfolio",
    "chat.tools.trading",
    "chat.tools.strategies",
    "chat.tools.plan",
    "chat.tools.broker",
    "chat.tools.analysis",
]


def test_each_submodule_importable():
    for module_path in SUBMODULES:
        mod = importlib.import_module(module_path)
        assert mod is not None, f"{module_path} failed to import"


# ─── Per-domain key symbol tests ─────────────────────────────────────────────


def test_market_tools_importable():
    from chat.tools.market import (
        get_market_summary, get_stock_quote, get_top_movers,
        get_price_history, get_technicals, get_fundamentals,
        screen_stocks, search_stocks,
    )
    assert all(callable(f) for f in [
        get_market_summary, get_stock_quote, get_top_movers,
        get_price_history, get_technicals, get_fundamentals,
        screen_stocks, search_stocks,
    ])


def test_signals_tools_importable():
    from chat.tools.signals import (
        get_signals_for_ticker, get_active_signals,
        get_signal_track_record, get_strategy_performance,
        get_closed_signals, get_strategy_experiments,
    )
    assert all(callable(f) for f in [
        get_signals_for_ticker, get_active_signals,
        get_signal_track_record, get_strategy_performance,
        get_closed_signals, get_strategy_experiments,
    ])


def test_portfolio_tools_importable():
    from chat.tools.portfolio import (
        get_portfolio_overview, get_holdings, get_watchlist,
        get_risk_profile, get_realized_pnl, get_rebalance_targets,
    )
    assert all(callable(f) for f in [
        get_portfolio_overview, get_holdings, get_watchlist,
        get_risk_profile, get_realized_pnl, get_rebalance_targets,
    ])


def test_trading_tools_importable():
    from chat.tools.trading import (
        calc_position_size, propose_trade, propose_exits,
        propose_rebalance, propose_trade_plan,
    )
    assert all(callable(f) for f in [
        calc_position_size, propose_trade, propose_exits,
        propose_rebalance, propose_trade_plan,
    ])


def test_plan_tools_importable():
    from chat.tools.plan import (
        get_tomorrows_plan, get_my_actions,
        get_ticker_verdict, get_upcoming_catalysts,
    )
    assert all(callable(f) for f in [
        get_tomorrows_plan, get_my_actions,
        get_ticker_verdict, get_upcoming_catalysts,
    ])


def test_broker_tools_importable():
    from chat.tools.broker import (
        get_accumulation_flows, get_smart_money_flows, get_broker_trends,
        get_below_cost_positions, get_accumulation_history, get_share_transfers,
        get_broker_portfolio, get_accumulation_forecast,
    )
    assert all(callable(f) for f in [
        get_accumulation_flows, get_smart_money_flows, get_broker_trends,
        get_below_cost_positions, get_accumulation_history, get_share_transfers,
        get_broker_portfolio, get_accumulation_forecast,
    ])


def test_analysis_tools_importable():
    from chat.tools.analysis import (
        get_top_opportunities, explain_opportunity,
        add_to_watchlist, remove_from_watchlist,
        remember_about_user, forget_about_user,
        get_chat_action_record, search_saved_analyses, get_saved_analysis,
    )
    assert all(callable(f) for f in [
        get_top_opportunities, explain_opportunity,
        add_to_watchlist, remove_from_watchlist,
        remember_about_user, forget_about_user,
        get_chat_action_record, search_saved_analyses, get_saved_analysis,
    ])


def test_strategies_tools_importable():
    from chat.tools.strategies import (
        list_strategy_components, describe_strategy, backtest_strategy,
        strategy_signal_today, draft_strategy, scan_strategies_for_symbol,
    )
    assert all(callable(f) for f in [
        list_strategy_components, describe_strategy, backtest_strategy,
        strategy_signal_today, draft_strategy, scan_strategies_for_symbol,
    ])


# ─── ALL_TOOLS completeness check ─────────────────────────────────────────────


EXPECTED_TOOL_NAMES = {
    # Market
    "get_market_summary", "get_top_movers", "get_index_history",
    "get_floorsheet_whales", "get_sector_breakdown", "get_broker_trades_for_stock",
    "search_stocks", "get_stock_quote", "get_price_history", "get_technicals",
    "get_fundamentals", "get_dividend_history", "get_accumulation",
    "get_financial_reports", "compare_stocks", "get_price_levels",
    "get_financial_statements", "screen_stocks",
    # Signals
    "get_signals_for_ticker", "get_signal_track_record", "calc_position_size",
    "get_active_signals", "get_strategy_performance", "get_closed_signals",
    "get_strategy_experiments",
    # Opportunities
    "get_top_opportunities", "explain_opportunity",
    # Plan
    "get_tomorrows_plan", "get_my_actions", "get_ticker_verdict", "get_upcoming_catalysts",
    # Strategies
    "list_strategy_components", "describe_strategy", "backtest_strategy",
    "strategy_signal_today", "draft_strategy", "scan_strategies_for_symbol",
    # Portfolio
    "get_portfolio_overview", "get_holdings", "get_watchlist", "get_risk_profile",
    "get_realized_pnl", "get_portfolio_accounts", "get_transaction_history",
    "get_portfolio_history", "get_sector_allocation", "get_recent_alerts",
    "get_watchlist_item", "get_rebalance_targets",
    # Trading
    "propose_trade", "propose_exits", "propose_rebalance", "propose_trade_plan",
    # Watchlist / memory
    "add_to_watchlist", "remove_from_watchlist",
    "remember_about_user", "forget_about_user",
    # Accountability / saved analyses
    "get_chat_action_record", "search_saved_analyses", "get_saved_analysis",
    # Broker
    "get_accumulation_flows", "get_smart_money_flows", "get_broker_trends",
    "get_broker_focus_ranking", "get_broker_favorites", "get_navigator_signals",
    "get_below_cost_positions", "get_accumulation_history", "get_share_transfers",
    "get_broker_portfolio", "get_accumulation_forecast",
}


def test_all_tools_contains_expected_names():
    from chat.tools import ALL_TOOLS
    registered = {fn.__name__ for fn in ALL_TOOLS}
    missing = EXPECTED_TOOL_NAMES - registered
    extra = registered - EXPECTED_TOOL_NAMES
    assert not missing, f"Missing from ALL_TOOLS: {missing}"
    assert not extra, f"Unexpected tools in ALL_TOOLS: {extra}"
