"""Orchestrator for the Stockastic chat agent."""

from __future__ import annotations

from pathlib import Path
from typing import AsyncIterator

from claude_agent_sdk import ClaudeAgentOptions, ClaudeSDKClient

from . import _user_context
from .subagents import AGENTS
from .tools import STOCKASTIC_MCP_SERVER

_ORCHESTRATOR_PROMPT = (Path(__file__).parent / "prompts" / "orchestrator.md").read_text(encoding="utf-8")


def _build_options(sdk_session_id: str = "") -> ClaudeAgentOptions:
    return ClaudeAgentOptions(
        system_prompt=_ORCHESTRATOR_PROMPT,
        mcp_servers={"stockastic": STOCKASTIC_MCP_SERVER},
        agents=AGENTS,
        # The orchestrator only delegates — Task is the only built-in it needs.
        # MCP tools are reached through subagents (see subagents.py).
        tools=["Task"],
        allowed_tools=[
            "Task",
            "mcp__stockastic__get_market_summary",
            "mcp__stockastic__get_top_movers",
            "mcp__stockastic__get_index_history",
            "mcp__stockastic__get_floorsheet_whales",
            "mcp__stockastic__get_stock_quote",
            "mcp__stockastic__get_price_history",
            "mcp__stockastic__get_technicals",
            "mcp__stockastic__get_fundamentals",
            "mcp__stockastic__get_dividend_history",
            "mcp__stockastic__get_accumulation",
            "mcp__stockastic__get_signals_for_ticker",
            "mcp__stockastic__get_signal_track_record",
            "mcp__stockastic__calc_position_size",
            "mcp__stockastic__get_portfolio_overview",
            "mcp__stockastic__get_holdings",
            "mcp__stockastic__get_watchlist",
            "mcp__stockastic__get_risk_profile",
            "mcp__stockastic__get_realized_pnl",
        ],
        permission_mode="bypassPermissions",
        # Don't load ~/.claude settings into the Django process.
        setting_sources=[],
        max_turns=12,
        # Resume the SDK session across turns if we have one stored.
        resume=sdk_session_id or None,
    )


async def run_chat_session(user, sdk_session_id: str, prompt: str) -> AsyncIterator:
    """Run one assistant turn against the orchestrator, yielding SDK messages.

    Sets the user in the ContextVar so MCP tools can resolve ``request.user``
    via :func:`chat._user_context.get_user`.
    """
    _user_context.set_user(user)
    options = _build_options(sdk_session_id=sdk_session_id)
    async with ClaudeSDKClient(options=options) as client:
        await client.query(prompt)
        async for message in client.receive_response():
            yield message
