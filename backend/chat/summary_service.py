"""Fold the newest chat exchange into a rolling session summary via a one-shot
Haiku call. Reuses the Agent SDK + OAuth auth already configured for chat.
"""
from __future__ import annotations

import asyncio
import json
import logging
from dataclasses import dataclass

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


MAX_CHANGE_NOTE_CHARS = 240
COMPANY_ANALYSIS_SYSTEM = (
    "You track one user's evolving analysis of a single NEPSE-listed company across "
    "their chat. Given the company's ticker, the prior analysis, and the newest "
    "user/assistant exchange, return ONLY a JSON object (no markdown fences, no "
    "preamble) with keys: "
    '"materially_changed" (boolean: true only if the view shifted meaningfully — a '
    "verdict flip, a new thesis, or a major technical/fundamental development — not "
    'for minor elaboration), "summary" (plain prose under 200 words capturing the '
    'current view of this company), "stance" (one of "bullish", "neutral", '
    '"bearish"), "aspect" (one of "technical", "fundamental", "both" — what drove '
    'this update), "change_note" (one short sentence on what changed since the prior '
    "analysis). Ignore other companies and pleasantries."
)


@dataclass(frozen=True)
class CompanyAnalysisResult:
    materially_changed: bool
    summary: str
    stance: str
    aspect: str
    change_note: str


def _company_analysis_prompt(prior_entry, exchanges, symbol: str) -> str:
    if prior_entry is not None and (prior_entry.summary or "").strip():
        prior = f"stance={prior_entry.stance}; {prior_entry.summary.strip()}"
    else:
        prior = "(no prior analysis)"
    return (
        f"Company: {symbol}\n\n"
        "Prior analysis:\n"
        f"{prior}\n\n"
        "Newest exchange(s):\n"
        f"{format_exchanges(exchanges)}\n\n"
        "Return the JSON object."
    )


def _fallback_result(prior_entry) -> CompanyAnalysisResult:
    from chat.models import CompanyAnalysisEntry as Entry

    if prior_entry is not None:
        return CompanyAnalysisResult(
            False, prior_entry.summary or "", prior_entry.stance, prior_entry.aspect, ""
        )
    return CompanyAnalysisResult(False, "", Entry.STANCE_NEUTRAL, Entry.ASPECT_BOTH, "")


def _parse_analysis(text: str, prior_entry) -> CompanyAnalysisResult:
    from chat.models import CompanyAnalysisEntry as Entry

    stances = {c[0] for c in Entry.STANCE_CHOICES}
    aspects = {c[0] for c in Entry.ASPECT_CHOICES}
    cleaned = (text or "").strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
    try:
        data = json.loads(cleaned)
        summary = data["summary"]
        stance, aspect = data["stance"], data["aspect"]
    except (ValueError, TypeError, KeyError):
        return _fallback_result(prior_entry)
    if not isinstance(summary, str) or not summary.strip() or stance not in stances or aspect not in aspects:
        return _fallback_result(prior_entry)
    summary = summary.strip()
    return CompanyAnalysisResult(
        materially_changed=bool(data.get("materially_changed", False)),
        summary=summary[:MAX_COMPANY_SUMMARY_CHARS],
        stance=stance,
        aspect=aspect,
        change_note=str(data.get("change_note", "")).strip()[:MAX_CHANGE_NOTE_CHARS],
    )


def build_company_analysis(prior_entry, exchanges, symbol: str) -> CompanyAnalysisResult:
    """Return a structured analysis update. Safe-falls back to prior on bad output."""
    prompt = _company_analysis_prompt(prior_entry, exchanges, symbol)
    text = asyncio.run(_run_summary(prompt, COMPANY_ANALYSIS_SYSTEM))
    return _parse_analysis(text, prior_entry)
