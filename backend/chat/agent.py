"""Orchestrator for the Stockastic chat agent."""

from __future__ import annotations

import logging
import os
import re
from datetime import date
from pathlib import Path
from typing import AsyncIterator

log = logging.getLogger(__name__)

import yaml
from asgiref.sync import sync_to_async
from claude_agent_sdk import ClaudeAgentOptions, ClaudeSDKClient

from . import _user_context
from .subagents import AGENTS
from .tools import STOCKASTIC_MCP_SERVER

_PROMPT_FILE = Path(__file__).parent / "prompts" / "orchestrator.yaml"
_ORCHESTRATOR_YAML = yaml.safe_load(_PROMPT_FILE.read_text(encoding="utf-8"))
_ORCHESTRATOR_SYSTEM: str = _ORCHESTRATOR_YAML["system"]
_ORCHESTRATOR_USER_TEMPLATE: str = _ORCHESTRATOR_YAML.get("user", "{message}")


def _safe_prompt_value(value, max_len: int = 64) -> str:
    """Strip prompt-control characters from user-derived prompt values.

    Removes any character that is not alphanumeric, underscore, space,
    period, hyphen, or at-sign — reducing the prompt-injection surface for
    values that flow into the system/user-turn template.  The message
    content itself must NOT be altered (it is the user's free-form input).
    """
    return re.sub(r"[^A-Za-z0-9_ .\-@]", "", str(value or ""))[:max_len]


def _format_prompt(user, message: str, memory: list[str] | None = None) -> str:
    """Render the orchestrator user-turn template with live context."""
    safe_username = _safe_prompt_value(getattr(user, "username", ""))
    memory_block = (
        "Known about this user:\n" + "\n".join(f"- {f}" for f in memory)
        if memory else "(nothing recorded about this user yet)"
    )
    return _ORCHESTRATOR_USER_TEMPLATE.format(
        date=date.today().isoformat(),
        username=safe_username,
        memory=memory_block,
        message=message,
    )


def _sdk_env() -> dict[str, str]:
    """Ensure CLAUDE_CODE_OAUTH_TOKEN reaches the SDK subprocess.

    Accepts either CLAUDE_AGENT_OAUTH_TOKEN (our name) or the SDK's own
    CLAUDE_CODE_OAUTH_TOKEN so both naming conventions work.
    """
    token = (
        os.environ.get("CLAUDE_AGENT_OAUTH_TOKEN", "").strip()
        or os.environ.get("CLAUDE_CODE_OAUTH_TOKEN", "").strip()
    )
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
        include_partial_messages=True,  # token-level streaming via StreamEvent deltas
        env=_sdk_env(),
        resume=sdk_session_id or None,
    )


_STALE_SESSION_PHRASES = (
    "no conversation found",
    "conversation not found",
    "session not found",
    "exit code 1",           # SDK subprocess crash on bad resume
    "command failed",        # generic subprocess failure
    "invalid session",
)


def _is_stale_session(exc: Exception) -> bool:
    msg = str(exc).lower()
    return any(phrase in msg for phrase in _STALE_SESSION_PHRASES)


async def run_chat_session(user, sdk_session_id: str, prompt: str) -> AsyncIterator:
    """Run one assistant turn against the orchestrator, yielding SDK messages.

    If sdk_session_id is stale (deleted on Claude's side between calls), the
    SDK raises with 'No conversation found'.  We transparently retry as a
    fresh session so the user gets a response instead of an error.
    """
    _user_context.set_user(user)

    @sync_to_async
    def _fetch_memory():
        from chat.models import UserMemory
        return list(
            UserMemory.objects.filter(user=user).values_list("content", flat=True)
        )

    memory = await _fetch_memory()
    formatted_prompt = _format_prompt(user, prompt, memory=memory)

    # Try with resumption first; fall back to a brand-new session if stale.
    session_ids = [sdk_session_id, ""] if sdk_session_id else [""]
    for attempt_id in session_ids:
        options = _build_options(sdk_session_id=attempt_id)
        try:
            async with ClaudeSDKClient(options=options) as client:
                await client.query(formatted_prompt)
                async for message in client.receive_response():
                    yield message
            return  # success — stop iterating
        except Exception as exc:  # pylint: disable=broad-except
            if attempt_id and _is_stale_session(exc):
                log.warning(
                    "SDK session %r is stale (%s) — retrying as a fresh session",
                    attempt_id,
                    exc,
                )
                continue
            raise
