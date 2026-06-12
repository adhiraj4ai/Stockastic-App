"""Build an editable SavedAnalysis draft from a chat session.

Captures any structured verdict/signal card from the persisted message blocks,
then summarizes the transcript with a one-shot Claude Haiku call. Falls back to
a naive draft if summarization fails, so saving never hard-fails.
"""
from __future__ import annotations

import asyncio
import json
import logging
import re

log = logging.getLogger(__name__)

_TICKER_RE = re.compile(r"\b[A-Z]{3,7}\b")
_VERDICT_CARD_TYPES = {"ticker_verdict", "signal"}
_MAX_TRANSCRIPT_CHARS = 12000
_VERDICT_MAX_LEN = 16  # matches SavedAnalysis.verdict max_length

# Common 3–7 letter uppercase tokens that are NOT tickers — keeps them out of the
# auto-extracted ticker list (which feeds series_key and persistence).
_TICKER_STOPWORDS = {
    "BUY", "SELL", "HOLD", "THE", "FOR", "AND", "NOT", "ARE", "WAS", "YOU",
    "EPS", "NPL", "ROE", "ROA", "RSI", "MACD", "ATR", "NAV", "USD", "NPR",
    "NEPSE", "GDP", "YOY", "QOQ",
}

_SUMMARY_SYSTEM = (
    "You compress a financial-analysis chat thread into a compact, reusable record "
    "for a Nepal (NEPSE) stock investor. Return ONLY a JSON object — no prose, no code "
    "fences — with these keys:\n"
    '  "title": <=80 char headline,\n'
    '  "summary": markdown, <=350 words, with sections Key findings / Metrics / Verdict / Context,\n'
    '  "one_liner": <=160 char single sentence preview,\n'
    '  "category": short label, e.g. "Quarterly Fundamentals", "Technical Setup", "Portfolio Review",\n'
    '  "tags": 2-6 short lowercase tags,\n'
    '  "tickers": uppercase NEPSE symbols referenced (array).\n'
    "If the thread is not an analysis, still produce best-effort values."
)


def _transcript(session) -> str:
    parts: list[str] = []
    for msg in session.messages.all().order_by("created_at"):
        role = "User" if msg.role == "user" else "Assistant"
        if msg.text:
            parts.append(f"{role}: {msg.text}")
    text = "\n\n".join(parts)
    return text[:_MAX_TRANSCRIPT_CHARS]


def _capture_verdict(session) -> tuple[str, dict]:
    """Return (verdict_label, structured_data) from the latest verdict/signal card.

    Prefer the latest card that actually carries a verdict — a later card without
    a verdict key must not erase an earlier verdict. If no card has a verdict, fall
    back to the latest matching card's data.
    """
    verdict, structured, last_structured = "", {}, {}
    for msg in session.messages.all().order_by("created_at"):
        for block in (msg.blocks or []):
            if block.get("kind") == "card" and block.get("type") in _VERDICT_CARD_TYPES:
                data = block.get("data") or {}
                last_structured = data
                v = str(data.get("verdict") or "")
                if v:
                    verdict, structured = v, data
    if not verdict:
        structured = last_structured
    return verdict, structured


def _extract_tickers(text: str) -> list[str]:
    seen, out = set(), []
    for t in _TICKER_RE.findall(text or ""):
        if t in _TICKER_STOPWORDS or t in seen:
            continue
        seen.add(t)
        out.append(t)
    return out


def _parse_json(text: str) -> dict | None:
    if not text:
        return None
    candidate = text.strip()
    # Strip code fences if the model wrapped the JSON despite instructions.
    if candidate.startswith("```"):
        candidate = re.sub(r"^```[a-zA-Z]*\n?", "", candidate)
        candidate = re.sub(r"\n?```$", "", candidate).strip()
    # Try a whole-string parse first (clean JSON); fall back to the widest brace span.
    attempts = [candidate]
    span = re.search(r"\{.*\}", candidate, re.DOTALL)
    if span:
        attempts.append(span.group(0))
    for attempt in attempts:
        try:
            data = json.loads(attempt)
            if isinstance(data, dict):
                return data
        except (ValueError, TypeError):
            continue
    return None


def _summarize_llm(transcript: str) -> dict | None:
    """One-shot Haiku summarization via the Agent SDK (reuses OAuth auth). None on failure."""
    if not transcript.strip():
        return None
    try:
        return asyncio.run(_summarize_async(transcript))
    except Exception:  # pylint: disable=broad-except
        log.exception("saved-analysis summarization failed")
        return None


async def _summarize_async(transcript: str) -> dict | None:
    from claude_agent_sdk import (
        AssistantMessage, ClaudeAgentOptions, ClaudeSDKClient, TextBlock,
    )
    from chat.agent import _sdk_env

    options = ClaudeAgentOptions(
        system_prompt=_SUMMARY_SYSTEM,
        model="claude-haiku-4-5",
        tools=[],
        allowed_tools=[],
        permission_mode="bypassPermissions",
        setting_sources=[],
        max_turns=1,
        env=_sdk_env(),
    )
    chunks: list[str] = []
    async with ClaudeSDKClient(options=options) as client:
        await client.query(transcript)
        async for message in client.receive_response():
            if isinstance(message, AssistantMessage):
                for block in message.content:
                    if isinstance(block, TextBlock):
                        chunks.append(block.text)
    return _parse_json("".join(chunks))


def _naive_draft(session) -> dict:
    first_user = session.messages.filter(role="user").order_by("created_at").first()
    last_assistant = session.messages.filter(role="assistant").order_by("-created_at").first()
    question = (first_user.text if first_user else "") or session.title
    answer = last_assistant.text if last_assistant else ""
    summary = f"**Question**\n\n{question}\n\n**Latest answer**\n\n{answer}".strip()
    return {
        "title": (session.title or question)[:80] or "Saved analysis",
        "summary": summary or "(no content)",
        "one_liner": (question or session.title)[:280],
        "category": "",
        "tags": [],
        "tickers": _extract_tickers(f"{question} {answer}"),
        "degraded": True,
    }


def build_draft(session) -> dict:
    """Build an editable draft dict for a SavedAnalysis from `session`.

    Keys: title, summary, one_liner, category, tags, tickers, series_key,
    verdict, structured, degraded.
    """
    verdict, structured = _capture_verdict(session)
    transcript = _transcript(session)
    llm = _summarize_llm(transcript)

    if llm:
        draft = {
            "title": str(llm.get("title") or session.title or "Saved analysis")[:255],
            "summary": str(llm.get("summary") or ""),
            "one_liner": str(llm.get("one_liner") or "")[:280],
            "category": str(llm.get("category") or "")[:64],
            "tags": [str(t)[:40] for t in (llm.get("tags") or []) if t][:8],
            "tickers": [str(t).upper()[:10] for t in (llm.get("tickers") or []) if t],
            "degraded": False,
        }
    else:
        draft = _naive_draft(session)

    # Merge tickers captured from the structured verdict (authoritative symbol).
    symbol = structured.get("symbol") if isinstance(structured, dict) else None
    if symbol and symbol not in draft["tickers"]:
        draft["tickers"].insert(0, str(symbol).upper())

    draft["verdict"] = verdict[:_VERDICT_MAX_LEN]
    draft["structured"] = structured if isinstance(structured, dict) else {}

    # Derive a series key from the primary ticker + category (user-editable later).
    primary = draft["tickers"][0] if draft["tickers"] else ""
    cat = draft["category"]
    draft["series_key"] = f"{primary} · {cat}" if primary and cat else ""
    return draft
