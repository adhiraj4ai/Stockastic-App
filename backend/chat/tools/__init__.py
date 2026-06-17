"""chat.tools package — all tool modules re-exported so callers work unchanged."""
from __future__ import annotations

# Base utilities (used by tests and other modules)
from chat.tools.base import _jsonable, _result, _resolve_account, _rank_strategy_signals, score_candidate

# Market Analyst
from chat.tools.market import (
    get_market_summary,
    get_top_movers,
    get_index_history,
    get_floorsheet_whales,
    get_sector_breakdown,
    get_broker_trades_for_stock,
    search_stocks,
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
    screen_stocks,
)

# Signals / Strategist
from chat.tools.signals import (
    get_signals_for_ticker,
    get_signal_track_record,
    get_active_signals,
    get_strategy_performance,
    get_closed_signals,
    get_strategy_experiments,
)

# Portfolio Advisor
from chat.tools.portfolio import (
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
)

# Trading / Portfolio Manager
from chat.tools.trading import (
    calc_position_size,
    propose_trade,
    propose_exits,
    propose_rebalance,
    propose_trade_plan,
)

# Strategy builder
from chat.tools.strategies import (
    list_strategy_components,
    describe_strategy,
    backtest_strategy,
    strategy_signal_today,
    draft_strategy,
    scan_strategies_for_symbol,
)

# Next-day plan & verdict
from chat.tools.plan import (
    get_tomorrows_plan,
    get_my_actions,
    get_ticker_verdict,
    get_upcoming_catalysts,
)

# Broker Intelligence
from chat.tools.broker import (
    get_accumulation_flows,
    get_smart_money_flows,
    get_broker_trends,
    get_broker_focus_ranking,
    get_broker_favorites,
    get_navigator_signals,
    get_below_cost_positions,
    get_accumulation_history,
    get_share_transfers,
    get_broker_portfolio,
    get_accumulation_forecast,
)

# Analysis, opportunities, watchlist actions, memory, accountability
from chat.tools.analysis import (
    get_top_opportunities,
    explain_opportunity,
    add_to_watchlist,
    remove_from_watchlist,
    remember_about_user,
    forget_about_user,
    get_chat_action_record,
    search_saved_analyses,
    get_saved_analysis,
)

# MCP server registration
from claude_agent_sdk import create_sdk_mcp_server

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
    # Opportunity Engine
    get_top_opportunities,
    explain_opportunity,
    # Next-day plan & verdict
    get_tomorrows_plan,
    get_my_actions,
    get_ticker_verdict,
    get_upcoming_catalysts,
    # Strategy builder / inference
    list_strategy_components,
    describe_strategy,
    backtest_strategy,
    strategy_signal_today,
    draft_strategy,
    scan_strategies_for_symbol,
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
    # Portfolio Manager (propose-then-confirm)
    propose_trade,
    propose_exits,
    propose_rebalance,
    propose_trade_plan,
    # Watchlist actions
    add_to_watchlist,
    remove_from_watchlist,
    # User memory
    remember_about_user,
    forget_about_user,
    # Accountability
    get_chat_action_record,
    # Saved analyses (chat bookmarks)
    search_saved_analyses,
    get_saved_analysis,
    # Broker Intelligence
    get_accumulation_flows,
    get_smart_money_flows,
    get_broker_trends,
    get_broker_focus_ranking,
    get_broker_favorites,
    get_navigator_signals,
    get_below_cost_positions,
    get_accumulation_history,
    get_share_transfers,
    get_broker_portfolio,
    get_accumulation_forecast,
]

STOCKASTIC_MCP_SERVER = create_sdk_mcp_server(
    name="stockastic",
    version="1.0.0",
    tools=ALL_TOOLS,
)


def tool_id(name: str) -> str:
    """Helper for subagent tool allowlists. ``tool_id('get_holdings')`` → ``'mcp__stockastic__get_holdings'``."""
    return f"mcp__stockastic__{name}"


# Read-only research tools given directly to the notebook "quick" agent. It runs
# a single agent (no Task orchestrator), so it gets the common analysis tools
# across domains — but NOT mutation/action tools (proposals, watchlist edits,
# user-memory writes), which belong to the deliberate chat flow.
QUICK_TOOL_NAMES = [
    # Market
    "get_market_summary", "get_top_movers", "get_index_history", "get_floorsheet_whales",
    "get_sector_breakdown", "get_broker_trades_for_stock", "search_stocks",
    # Stock
    "get_stock_quote", "get_price_history", "get_technicals", "get_fundamentals",
    "get_dividend_history", "get_accumulation", "get_financial_reports", "compare_stocks",
    "get_price_levels", "get_financial_statements", "get_ticker_verdict",
    # Signals / strategy (read-only)
    "get_signals_for_ticker", "get_signal_track_record", "get_active_signals",
    "get_strategy_performance", "get_closed_signals", "scan_strategies_for_symbol", "screen_stocks",
    # Opportunities & plan
    "get_top_opportunities", "explain_opportunity", "get_tomorrows_plan", "get_upcoming_catalysts",
    # Portfolio (read-only)
    "get_portfolio_overview", "get_holdings", "get_watchlist", "get_risk_profile",
    "get_realized_pnl", "get_sector_allocation", "get_portfolio_history", "calc_position_size",
    # Broker intelligence
    "get_accumulation_flows", "get_smart_money_flows", "get_broker_trends",
    "get_navigator_signals", "get_accumulation_forecast", "get_accumulation_history",
    # Saved analyses
    "search_saved_analyses", "get_saved_analysis",
]

QUICK_ALLOWED_TOOLS = [tool_id(name) for name in QUICK_TOOL_NAMES]


__all__ = [
    # Base
    "_jsonable", "_result", "_resolve_account", "_rank_strategy_signals", "score_candidate",
    # Market
    "get_market_summary", "get_top_movers", "get_index_history", "get_floorsheet_whales",
    "get_sector_breakdown", "get_broker_trades_for_stock", "search_stocks",
    "get_stock_quote", "get_price_history", "get_technicals", "get_fundamentals",
    "get_dividend_history", "get_accumulation", "get_financial_reports",
    "compare_stocks", "get_price_levels", "get_financial_statements", "screen_stocks",
    # Signals
    "get_signals_for_ticker", "get_signal_track_record", "get_active_signals",
    "get_strategy_performance", "get_closed_signals", "get_strategy_experiments",
    # Portfolio
    "get_portfolio_overview", "get_holdings", "get_watchlist", "get_risk_profile",
    "get_realized_pnl", "get_portfolio_accounts", "get_transaction_history",
    "get_portfolio_history", "get_sector_allocation", "get_recent_alerts",
    "get_watchlist_item", "get_rebalance_targets",
    # Trading
    "calc_position_size", "propose_trade", "propose_exits", "propose_rebalance", "propose_trade_plan",
    # Strategies
    "list_strategy_components", "describe_strategy", "backtest_strategy",
    "strategy_signal_today", "draft_strategy", "scan_strategies_for_symbol",
    # Plan
    "get_tomorrows_plan", "get_my_actions", "get_ticker_verdict", "get_upcoming_catalysts",
    # Broker
    "get_accumulation_flows", "get_smart_money_flows", "get_broker_trends",
    "get_broker_focus_ranking", "get_broker_favorites", "get_navigator_signals",
    "get_below_cost_positions", "get_accumulation_history", "get_share_transfers",
    "get_broker_portfolio", "get_accumulation_forecast",
    # Analysis
    "get_top_opportunities", "explain_opportunity",
    "add_to_watchlist", "remove_from_watchlist",
    "remember_about_user", "forget_about_user",
    "get_chat_action_record",
    "search_saved_analyses", "get_saved_analysis",
    # Server
    "ALL_TOOLS", "STOCKASTIC_MCP_SERVER", "tool_id",
    "QUICK_TOOL_NAMES", "QUICK_ALLOWED_TOOLS",
]
