"""AgentDefinitions for the four Stockastic subagents, loaded from YAML prompts."""

from __future__ import annotations

from pathlib import Path

import yaml
from claude_agent_sdk import AgentDefinition

from .tools import tool_id

_PROMPTS = Path(__file__).parent / "prompts"


def _load(name: str) -> dict:
    """Parse a prompt YAML and return its keys."""
    return yaml.safe_load((_PROMPTS / f"{name}.yaml").read_text(encoding="utf-8"))


def _system(name: str) -> str:
    return _load(name)["system"]


def _initial(name: str) -> str | None:
    return _load(name).get("user")


MARKET_ANALYST = AgentDefinition(
    description=(
        "Reports on the NEPSE market: index turnover trend, breadth (advancers/decliners), "
        "sector rotation, broker floorsheet whale activity, and stock search. "
        "Use for any market-wide question, sector analysis, daily briefing, or 'find me stocks in X sector'."
    ),
    prompt=_system("market_analyst"),
    initialPrompt=_initial("market_analyst"),
    tools=[
        tool_id("get_market_summary"),
        tool_id("get_top_movers"),
        tool_id("get_index_history"),
        tool_id("get_floorsheet_whales"),
        tool_id("get_sector_breakdown"),
        tool_id("get_broker_trades_for_stock"),
        tool_id("search_stocks"),
    ],
    model="sonnet",
    effort="medium",
)

STOCK_ANALYST = AgentDefinition(
    description=(
        "Deep-dive per-ticker NEPSE equity research: latest quote, 60-day OHLCV, "
        "full TA-Lib technical suite (RSI/MACD/ADX/ATR/Bollinger/OBV/support-resistance), "
        "fundamentals (PE/PB/ROE/health score), quarterly/annual financial reports, "
        "full balance sheet / income statement / cash flow / key ratios, "
        "VWAP and moving average price levels, dividend history, broker accumulation, "
        "and multi-stock comparison. "
        "Use for any single-stock question or 'compare X vs Y'. Runs tools in parallel for speed."
    ),
    prompt=_system("stock_analyst"),
    initialPrompt=_initial("stock_analyst"),
    tools=[
        tool_id("get_stock_quote"),
        tool_id("get_price_history"),
        tool_id("get_technicals"),
        tool_id("get_fundamentals"),
        tool_id("get_financial_reports"),
        tool_id("get_financial_statements"),
        tool_id("get_price_levels"),
        tool_id("get_dividend_history"),
        tool_id("get_accumulation"),
        tool_id("compare_stocks"),
        tool_id("search_stocks"),
        tool_id("scan_strategies_for_symbol"),
    ],
    model="sonnet",
    effort="high",
)

BUY_SELL_STRATEGIST = AgentDefinition(
    description=(
        "Synthesizes analyst findings, signal aggregates, and the user's portfolio "
        "into a BUY / SELL / HOLD verdict with confluence score, conviction tier, "
        "entry/stop/target levels, R/R ratio, and position sizing. "
        "Can also screen stocks by criteria, surface all active signals, "
        "assess closed-signal P/L track record, and review strategy backtest results. "
        "Use when the user asks for a decision, screening, 'what should I buy today?', "
        "or 'how did my past signals perform?'."
    ),
    prompt=_system("strategist"),
    initialPrompt=_initial("strategist"),
    tools=[
        tool_id("get_signals_for_ticker"),
        tool_id("get_signal_track_record"),
        tool_id("calc_position_size"),
        tool_id("get_holdings"),
        tool_id("get_risk_profile"),
        tool_id("get_active_signals"),
        tool_id("get_strategy_performance"),
        tool_id("get_strategy_experiments"),
        tool_id("get_closed_signals"),
        tool_id("list_strategy_components"),
        tool_id("describe_strategy"),
        tool_id("backtest_strategy"),
        tool_id("strategy_signal_today"),
        tool_id("draft_strategy"),
        tool_id("scan_strategies_for_symbol"),
        tool_id("screen_stocks"),
        tool_id("search_stocks"),
    ],
    model="opus",
    effort="high",
    maxTurns=8,
)

PORTFOLIO_ADVISOR = AgentDefinition(
    description=(
        "Reports on the user's portfolio: holdings performance, P/L attribution, "
        "sector concentration, risk alerts, watchlist setups (including deep single-item detail), "
        "target vs actual allocation for rebalancing, realized P/L, "
        "transaction history, portfolio NAV over time, accounts, and notification alerts. "
        "Use for any 'my portfolio' / 'my holdings' / 'my watchlist' / 'my trades' / "
        "'my alerts' / 'rebalance' question."
    ),
    prompt=_system("portfolio_advisor"),
    initialPrompt=_initial("portfolio_advisor"),
    tools=[
        tool_id("get_portfolio_overview"),
        tool_id("get_holdings"),
        tool_id("get_watchlist"),
        tool_id("get_watchlist_item"),
        tool_id("get_risk_profile"),
        tool_id("get_realized_pnl"),
        tool_id("get_portfolio_accounts"),
        tool_id("get_transaction_history"),
        tool_id("get_portfolio_history"),
        tool_id("get_sector_allocation"),
        tool_id("get_rebalance_targets"),
        tool_id("get_recent_alerts"),
    ],
    model="sonnet",
    effort="medium",
)


PORTFOLIO_MANAGER = AgentDefinition(
    description=(
        "Actively MANAGES the user's portfolio: proposes confirmable actions — "
        "record buy/sell trades, set stops/targets, optimize allocation + rebalance, "
        "and build staged multi-leg trade plans — optimizing for win rate and returns "
        "with risk discipline. Every action is a proposal the user confirms; nothing "
        "executes automatically. Use when the user wants to ACT on their portfolio: "
        "'rebalance me', 'trim my losers', 'set stops', 'buy/sell N of X', "
        "'optimize my portfolio', 'build me a plan'. For pure analysis with no action, "
        "use portfolio-advisor instead."
    ),
    prompt=_system("portfolio_manager"),
    initialPrompt=_initial("portfolio_manager"),
    tools=[
        tool_id("propose_trade"),
        tool_id("propose_exits"),
        tool_id("get_portfolio_overview"),
        tool_id("get_holdings"),
        tool_id("get_watchlist"),
        tool_id("get_risk_profile"),
        tool_id("get_sector_allocation"),
        tool_id("get_rebalance_targets"),
        tool_id("get_realized_pnl"),
        tool_id("get_portfolio_accounts"),
        tool_id("get_signals_for_ticker"),
        tool_id("get_signal_track_record"),
        tool_id("get_strategy_performance"),
        tool_id("calc_position_size"),
        tool_id("get_stock_quote"),
    ],
    model="opus",
    effort="high",
    maxTurns=8,
)


AGENTS = {
    "market-analyst": MARKET_ANALYST,
    "stock-analyst": STOCK_ANALYST,
    "buy-sell-strategist": BUY_SELL_STRATEGIST,
    "portfolio-advisor": PORTFOLIO_ADVISOR,
    "portfolio-manager": PORTFOLIO_MANAGER,
}
