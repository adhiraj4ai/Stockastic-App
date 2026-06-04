"""AgentDefinitions for the four Stockastic subagents."""

from __future__ import annotations

from pathlib import Path

from claude_agent_sdk import AgentDefinition

from .tools import tool_id

_PROMPTS = Path(__file__).parent / "prompts"


def _load(name: str) -> str:
    return (_PROMPTS / f"{name}.md").read_text(encoding="utf-8")


# Tool allowlists per subagent. The orchestrator never invokes these MCP tools
# itself — it only delegates via Task, so only the subagents declare them.

MARKET_ANALYST = AgentDefinition(
    description=(
        "Reports on the NEPSE market: index turnover, top movers, sector rotation, "
        "and broker floorsheet activity (whales). Use for any market-wide question."
    ),
    prompt=_load("market_analyst"),
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
        "Per-ticker NEPSE equity research: quote, OHLCV history, TA-Lib technicals, "
        "fundamentals + health score, dividend history, and broker accumulation. "
        "Use for any question about a single stock."
    ),
    prompt=_load("stock_analyst"),
    tools=[
        tool_id("get_stock_quote"),
        tool_id("get_price_history"),
        tool_id("get_technicals"),
        tool_id("get_fundamentals"),
        tool_id("get_dividend_history"),
        tool_id("get_accumulation"),
    ],
    model="sonnet",
    effort="medium",
)

BUY_SELL_STRATEGIST = AgentDefinition(
    description=(
        "Synthesizes analyst findings, signal aggregates, and the user's portfolio "
        "into a BUY / SELL / HOLD verdict with conviction and an optional position "
        "size. Use when the user asks for a decision."
    ),
    prompt=_load("strategist"),
    tools=[
        tool_id("get_signals_for_ticker"),
        tool_id("get_signal_track_record"),
        tool_id("calc_position_size"),
        # Also allow it to peek at holdings / risk to ground its recommendation.
        tool_id("get_holdings"),
        tool_id("get_risk_profile"),
    ],
    model="opus",
    effort="high",
)

PORTFOLIO_ADVISOR = AgentDefinition(
    description=(
        "Reports on the user's portfolio: holdings, watchlist, P/L, risk profile, "
        "realized P/L. Use for any 'my portfolio' / 'my holdings' question."
    ),
    prompt=_load("portfolio_advisor"),
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
