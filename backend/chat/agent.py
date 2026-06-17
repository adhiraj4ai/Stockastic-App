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
from .tools import STOCKASTIC_MCP_SERVER, QUICK_ALLOWED_TOOLS

_PROMPTS_DIR = Path(__file__).parent / "prompts"
_ORCHESTRATOR_YAML = yaml.safe_load((_PROMPTS_DIR / "orchestrator.yaml").read_text(encoding="utf-8"))
_ORCHESTRATOR_SYSTEM: str = _ORCHESTRATOR_YAML["system"]
_ORCHESTRATOR_USER_TEMPLATE: str = _ORCHESTRATOR_YAML.get("user", "{message}")
_QUICK_SYSTEM: str = yaml.safe_load((_PROMPTS_DIR / "notebook_quick.yaml").read_text(encoding="utf-8"))["system"]


def _safe_prompt_value(value, max_len: int = 64) -> str:
    """Strip prompt-control characters from user-derived prompt values.

    Removes any character that is not alphanumeric, underscore, space,
    period, hyphen, or at-sign — reducing the prompt-injection surface for
    values that flow into the system/user-turn template.  The message
    content itself must NOT be altered (it is the user's free-form input).
    """
    return re.sub(r"[^A-Za-z0-9_ .\-@]", "", str(value or ""))[:max_len]


def _build_saved_hint(user, message: str, limit: int = 3) -> str:
    """Render a short, sanitized hint listing saved analyses related to `message`.

    Reuses the same lexical matcher as the live composer hint. Empty string when
    nothing matches.
    """
    from chat.services.saved_match import match_saved_analyses

    matches = match_saved_analyses(user, message, limit=limit)
    if not matches:
        return ""
    lines = []
    for sa in matches:
        label = _safe_prompt_value(sa.title, max_len=80)
        one = _safe_prompt_value(sa.one_liner, max_len=120)
        date_str = sa.created_at.date().isoformat()
        series = f" [series: {_safe_prompt_value(sa.series_key, max_len=60)}]" if sa.series_key else ""
        lines.append(f"- {label} ({date_str}): {one}{series}")
    return "Saved analyses you may build on (use search_saved_analyses / get_saved_analysis):\n" + "\n".join(lines)


def _format_prompt(user, message: str, memory: list[str] | None = None,
                   saved_hint: str = "", summary: str = "", history: str = "") -> str:
    """Render the orchestrator user-turn template with live context."""
    safe_username = _safe_prompt_value(getattr(user, "username", ""))
    memory_block = (
        "Known about this user:\n" + "\n".join(f"- {f}" for f in memory)
        if memory else "(nothing recorded about this user yet)"
    )
    summary_block = (summary or "").strip() or "(no earlier conversation summarized yet)"
    history_block = (history or "").strip() or "(the user's message does not reference earlier turns)"
    saved_block = saved_hint or "(no related saved analyses)"
    return _ORCHESTRATOR_USER_TEMPLATE.format(
        date=date.today().isoformat(),
        username=safe_username,
        memory=memory_block,
        summary=summary_block,
        history=history_block,
        saved_hint=saved_block,
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


def _build_quick_options(sdk_session_id: str = "") -> ClaudeAgentOptions:
    """Fast single-agent path for notebook cells: direct MCP tool access, no
    Task orchestrator or subagent team, on a cheaper model at lower effort."""
    return ClaudeAgentOptions(
        system_prompt=_QUICK_SYSTEM,
        mcp_servers={"stockastic": STOCKASTIC_MCP_SERVER},
        tools=QUICK_ALLOWED_TOOLS,
        allowed_tools=QUICK_ALLOWED_TOOLS,
        permission_mode="bypassPermissions",
        setting_sources=[],
        max_turns=12,
        thinking={"type": "adaptive"},
        effort="medium",
        model="sonnet",
        include_partial_messages=True,  # token-level streaming via StreamEvent deltas
        env=_sdk_env(),
        resume=sdk_session_id or None,
    )


def _build_session_options(session, sdk_session_id: str = "") -> ClaudeAgentOptions:
    """Notebook sessions use the quick single-agent path; all others orchestrate."""
    if session.is_notebook:
        return _build_quick_options(sdk_session_id)
    return _build_options(sdk_session_id)


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


@sync_to_async
def _fetch_memory(user):
    from chat.models import UserMemory
    return list(UserMemory.objects.filter(user=user).values_list("content", flat=True))


@sync_to_async
def _fetch_saved_hint_async(user, prompt: str) -> str:
    return _build_saved_hint(user, prompt)


@sync_to_async
def _fetch_history_context(session, message: str) -> tuple[str, str]:
    """Return (summary, gated_history) for the prompt. History is empty unless the
    message references prior turns; the summary is always returned."""
    from chat.history import recent_exchanges, format_exchanges, references_prior_context

    summary = session.summary or ""
    history = ""
    if references_prior_context(message):
        history = format_exchanges(recent_exchanges(session))
    return summary, history


async def _run_sdk_turn(options, formatted_prompt: str):
    """Run a single SDK turn, yielding messages. Raises on error."""
    async with ClaudeSDKClient(options=options) as client:
        await client.query(formatted_prompt)
        async for message in client.receive_response():
            yield message


async def run_chat_session(user, session, prompt: str) -> AsyncIterator:
    """Run one assistant turn against the orchestrator, yielding SDK messages.

    If the session's sdk_session_id is stale (deleted on Claude's side between
    calls), the SDK raises with 'No conversation found'. We transparently retry
    as a fresh session so the user gets a response instead of an error.
    """
    _user_context.set_user(user)
    memory = await _fetch_memory(user)
    saved_hint = await _fetch_saved_hint_async(user, prompt)
    # The rolling summary is refreshed asynchronously AFTER each turn, so it
    # reflects up to the previous turn; the verbatim window covers the most
    # recent turns. This one-turn lag is intentional — do not make it synchronous.
    summary, history = await _fetch_history_context(session, prompt)
    formatted_prompt = _format_prompt(
        user, prompt, memory=memory, saved_hint=saved_hint, summary=summary, history=history,
    )

    sdk_session_id = session.sdk_session_id
    session_ids = [sdk_session_id, ""] if sdk_session_id else [""]
    for attempt_id in session_ids:
        options = _build_session_options(session, sdk_session_id=attempt_id)
        try:
            async for message in _run_sdk_turn(options, formatted_prompt):
                yield message
            return
        except Exception as exc:  # pylint: disable=broad-except
            if attempt_id and _is_stale_session(exc):
                log.warning("SDK session %r is stale (%s) — retrying as a fresh session", attempt_id, exc)
                continue
            raise
