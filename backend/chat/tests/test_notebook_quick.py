"""Notebook cells run on a fast single-agent path instead of the Task orchestrator.

These tests pin the routing decision (which options a session gets) and the
shape of the quick options, without invoking the Claude SDK.
"""
from chat.models import ChatSession
from chat.agent import _build_session_options, _build_quick_options, _build_options
from chat.tools import QUICK_ALLOWED_TOOLS, tool_id


def test_is_notebook_detects_notebook_sessions():
    assert ChatSession(title="Notebook Session: abc-123").is_notebook is True
    assert ChatSession(title="New chat").is_notebook is False
    assert ChatSession(title="").is_notebook is False


def test_quick_options_skip_the_orchestrator():
    opts = _build_quick_options()
    assert opts.model == "sonnet"
    assert opts.effort == "medium"
    # No subagent delegation: the Task tool and agent team are absent.
    assert not opts.agents
    assert "Task" not in (opts.allowed_tools or [])
    # The single agent gets direct read-only data tools.
    assert tool_id("get_market_summary") in opts.allowed_tools


def test_quick_path_excludes_mutation_tools():
    for mutating in ("propose_trade", "add_to_watchlist", "remember_about_user"):
        assert tool_id(mutating) not in QUICK_ALLOWED_TOOLS


def test_notebook_session_routes_to_quick_options():
    notebook = ChatSession(title="Notebook Session: x")
    chat = ChatSession(title="Daily briefing")
    assert _build_session_options(notebook).model == "sonnet"
    assert not _build_session_options(notebook).agents
    # A normal chat session still uses the orchestrator (Task + agent team).
    assert _build_session_options(chat).agents
    assert "Task" in _build_session_options(chat).allowed_tools
