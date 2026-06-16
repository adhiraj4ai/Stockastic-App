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


async def _run_summary(prompt: str, system: str) -> str:
    from claude_agent_sdk import (
        AssistantMessage, ClaudeAgentOptions, ClaudeSDKClient, TextBlock,
    )
    from chat.agent import _sdk_env

    options = ClaudeAgentOptions(
        system_prompt=system,
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
    text = asyncio.run(_run_summary(prompt, SUMMARY_SYSTEM))
    updated = text.strip() or (prior_summary or "").strip()
    return updated[:MAX_SUMMARY_CHARS]


MAX_COMPANY_SUMMARY_CHARS = 1200
COMPANY_SUMMARY_SYSTEM = (
    "You maintain a running, company-specific set of notes capturing everything "
    "one user has discussed about a single NEPSE-listed company in chat. Given the "
    "company's ticker, the current notes, and the newest user/assistant exchange, "
    "return updated notes as plain prose (no markdown headers, no preamble). Keep it "
    "under 200 words. Preserve durable facts about this company: the user's theses, "
    "verdicts given, key numbers, risks, and open questions. Ignore content about "
    "other companies and drop pleasantries."
)


def _company_summary_prompt(prior_summary: str, exchanges, symbol: str) -> str:
    prior = prior_summary.strip() or "(no prior notes)"
    return (
        f"Company: {symbol}\n\n"
        "Current notes:\n"
        f"{prior}\n\n"
        "Newest exchange(s):\n"
        f"{format_exchanges(exchanges)}\n\n"
        f"Return the updated notes about {symbol}."
    )


def build_company_summary(prior_summary: str, exchanges, symbol: str) -> str:
    """Return updated per-company notes. Falls back to prior notes on empty output."""
    prompt = _company_summary_prompt(prior_summary, exchanges, symbol)
    text = asyncio.run(_run_summary(prompt, COMPANY_SUMMARY_SYSTEM))
    updated = text.strip() or (prior_summary or "").strip()
    return updated[:MAX_COMPANY_SUMMARY_CHARS]
