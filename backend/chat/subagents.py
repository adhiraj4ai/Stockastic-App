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
        "sector rotation, and broker floorsheet whale activity. "
        "Use for any market-wide question or daily briefing."
    ),
    prompt=_system("market_analyst"),
    initialPrompt=_initial("market_analyst"),
    tools=[
        tool_id("get_market_summary"),
        tool_id("get_top_movers"),
        tool_id("get_index_history"),
        tool_id("get_floorsheet_whales"),
    ],
    model="sonnet",
    effort="medium",
)

STOCK_ANALYST = AgentDefinition(
    description=(
        "Deep-dive per-ticker NEPSE equity research: latest quote, 60-day OHLCV, "
        "full TA-Lib technical suite (RSI/MACD/ADX/ATR/Bollinger/OBV/support-resistance), "
        "fundamentals (PE/PB/ROE/health score), dividend history, and broker accumulation. "
        "Use for any single-stock question. Runs tools in parallel for speed."
    ),
    prompt=_system("stock_analyst"),
    initialPrompt=_initial("stock_analyst"),
    tools=[
        tool_id("get_stock_quote"),
        tool_id("get_price_history"),
        tool_id("get_technicals"),
        tool_id("get_fundamentals"),
        tool_id("get_dividend_history"),
        tool_id("get_accumulation"),
    ],
    model="sonnet",
    effort="high",
)

BUY_SELL_STRATEGIST = AgentDefinition(
    description=(
        "Synthesizes analyst findings, signal aggregates, and the user's portfolio "
        "into a BUY / SELL / HOLD verdict with confluence score, conviction tier, "
        "entry/stop/target levels, R/R ratio, and position sizing. "
        "Use when the user asks for a decision, not just data."
    ),
    prompt=_system("strategist"),
    initialPrompt=_initial("strategist"),
    tools=[
        tool_id("get_signals_for_ticker"),
        tool_id("get_signal_track_record"),
        tool_id("calc_position_size"),
        tool_id("get_holdings"),
        tool_id("get_risk_profile"),
    ],
    model="opus",
    effort="high",
    maxTurns=8,
)

PORTFOLIO_ADVISOR = AgentDefinition(
    description=(
        "Reports on the user's portfolio: holdings performance, P/L attribution, "
        "sector concentration, risk alerts, watchlist setups, and realized P/L. "
        "Use for any 'my portfolio' / 'my holdings' / 'my watchlist' question."
    ),
    prompt=_system("portfolio_advisor"),
    initialPrompt=_initial("portfolio_advisor"),
    tools=[
        tool_id("get_portfolio_overview"),
        tool_id("get_holdings"),
        tool_id("get_watchlist"),
        tool_id("get_risk_profile"),
        tool_id("get_realized_pnl"),
    ],
    model="sonnet",
    effort="medium",
)


AGENTS = {
    "market-analyst": MARKET_ANALYST,
    "stock-analyst": STOCK_ANALYST,
    "buy-sell-strategist": BUY_SELL_STRATEGIST,
    "portfolio-advisor": PORTFOLIO_ADVISOR,
}
