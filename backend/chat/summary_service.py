"""Fold the newest chat exchange into a rolling session summary via a one-shot
Haiku call. Reuses the Agent SDK + OAuth auth already configured for chat.
"""
from __future__ import annotations

import asyncio
import logging

from chat.history import format_exchanges

log = logging.getLogger(__name__)

SUMMARY_MODEL = "claude-haiku-4-5"
MAX_SUMMARY_CHARS = 1200
SUMMARY_SYSTEM = (
    "You maintain a running summary of a NEPSE stock-analysis conversation so an "
    "assistant can resume with full context. Given the current running summary and "
    "the newest user/assistant exchange, return an updated summary as plain prose "
    "(no markdown headers, no preamble). Keep it under 200 words. Preserve durable "
    "facts: tickers discussed, the user's intent, verdicts given, and open threads. "
    "Drop pleasantries and redundant detail."
)


def _summary_prompt(prior_summary: str, exchanges) -> str:
    prior = prior_summary.strip() or "(no prior summary)"
    return (
        "Current running summary:\n"
        f"{prior}\n\n"
        "Newest exchange(s):\n"
        f"{format_exchanges(exchanges)}\n\n"
        "Return the updated running summary."
    )


async def _run_summary(prompt: str) -> str:
    from claude_agent_sdk import (
        AssistantMessage, ClaudeAgentOptions, ClaudeSDKClient, TextBlock,
    )
    from chat.agent import _sdk_env

    options = ClaudeAgentOptions(
        system_prompt=SUMMARY_SYSTEM,
        model=SUMMARY_MODEL,
        tools=[],
        allowed_tools=[],
        permission_mode="bypassPermissions",
        setting_sources=[],
        max_turns=1,
        env=_sdk_env(),
    )
    chunks: list[str] = []
    async with ClaudeSDKClient(options=options) as client:
        await client.query(prompt)
        async for message in client.receive_response():
            if isinstance(message, AssistantMessage):
                for block in message.content:
                    if isinstance(block, TextBlock):
                        chunks.append(block.text)
    return "".join(chunks)


def build_summary(prior_summary: str, exchanges) -> str:
    """Return an updated rolling summary. Falls back to the prior summary on empty output."""
    prompt = _summary_prompt(prior_summary, exchanges)
    text = asyncio.run(_run_summary(prompt))
    updated = text.strip() or (prior_summary or "").strip()
    return updated[:MAX_SUMMARY_CHARS]
