"""Orchestrator for the Stockastic chat agent."""

from __future__ import annotations

import os
from datetime import date
from pathlib import Path
from typing import AsyncIterator

import yaml
from claude_agent_sdk import ClaudeAgentOptions, ClaudeSDKClient

from . import _user_context
from .subagents import AGENTS
from .tools import STOCKASTIC_MCP_SERVER

_PROMPT_FILE = Path(__file__).parent / "prompts" / "orchestrator.yaml"
_ORCHESTRATOR_YAML = yaml.safe_load(_PROMPT_FILE.read_text(encoding="utf-8"))
_ORCHESTRATOR_SYSTEM: str = _ORCHESTRATOR_YAML["system"]
_ORCHESTRATOR_USER_TEMPLATE: str = _ORCHESTRATOR_YAML.get("user", "{message}")


def _format_prompt(user, message: str) -> str:
    """Render the orchestrator user-turn template with live context."""
    return _ORCHESTRATOR_USER_TEMPLATE.format(
        date=date.today().isoformat(),
        username=getattr(user, "username", ""),
        message=message,
    )


def _sdk_env() -> dict[str, str]:
    """Bridge CLAUDE_AGENT_OAUTH_TOKEN → CLAUDE_CODE_OAUTH_TOKEN for the SDK subprocess."""
    token = os.environ.get("CLAUDE_AGENT_OAUTH_TOKEN", "").strip()
    if token:
        return {"CLAUDE_CODE_OAUTH_TOKEN": token}
    return {}


def _build_options(sdk_session_id: str = "") -> ClaudeAgentOptions:
    return ClaudeAgentOptions(
        system_prompt=_ORCHESTRATOR_SYSTEM,
        mcp_servers={"stockastic": STOCKASTIC_MCP_SERVER},
        agents=AGENTS,
        tools=["Task"],
        allowed_tools=["Task"],
        permission_mode="bypassPermissions",
        setting_sources=[],
        max_turns=16,
        thinking={"type": "adaptive"},
        effort="high",
        env=_sdk_env(),
        resume=sdk_session_id or None,
    )


async def run_chat_session(user, sdk_session_id: str, prompt: str) -> AsyncIterator:
    """Run one assistant turn against the orchestrator, yielding SDK messages."""
    _user_context.set_user(user)
    options = _build_options(sdk_session_id=sdk_session_id)
    formatted_prompt = _format_prompt(user, prompt)
    async with ClaudeSDKClient(options=options) as client:
        await client.query(formatted_prompt)
        async for message in client.receive_response():
            yield message
