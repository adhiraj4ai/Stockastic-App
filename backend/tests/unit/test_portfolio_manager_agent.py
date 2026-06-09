"""The portfolio-manager subagent is registered and wired to its tools."""
from chat.subagents import AGENTS
from chat.tools import tool_id, ALL_TOOLS


def test_portfolio_manager_registered():
    assert "portfolio-manager" in AGENTS


def test_portfolio_manager_has_propose_trade():
    agent = AGENTS["portfolio-manager"]
    assert tool_id("propose_trade") in agent.tools


def test_propose_trade_is_in_mcp_server():
    names = {getattr(t, "name", None) for t in ALL_TOOLS}
    assert "propose_trade" in names
