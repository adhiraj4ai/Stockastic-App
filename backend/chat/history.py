"""Pure helpers for chat conversation history.

Reads completed user→assistant exchanges from persisted ChatMessage rows and
renders a compact, token-bounded window for prompt injection. No model calls,
no I/O beyond the ORM read — kept pure so it is trivially testable.
"""
from __future__ import annotations

import re
from typing import NamedTuple

from chat.models import ChatMessage, ChatSession

HISTORY_HOPS = 3
MAX_REPLY_CHARS_IN_HISTORY = 600


class Exchange(NamedTuple):
    """One completed turn: a user message and the assistant reply that followed it."""

    user_text: str
    assistant_text: str


def recent_exchanges(session: ChatSession, hops: int = HISTORY_HOPS) -> list[Exchange]:
    """Return the last `hops` completed user→assistant exchanges, oldest first.

    A trailing user message with no assistant reply yet (the current turn) is
    naturally excluded because it never closes a pair.
    """
    if hops <= 0:
        return []
    pairs: list[Exchange] = []
    pending_user: str | None = None
    for message in session.messages.order_by("created_at"):
        if message.role == ChatMessage.ROLE_USER:
            pending_user = message.text or ""
        elif message.role == ChatMessage.ROLE_ASSISTANT and pending_user is not None:
            pairs.append(Exchange(user_text=pending_user, assistant_text=message.text or ""))
            pending_user = None
    return pairs[-hops:]


def _truncate_reply(reply: str) -> str:
    if len(reply) <= MAX_REPLY_CHARS_IN_HISTORY:
        return reply
    return reply[:MAX_REPLY_CHARS_IN_HISTORY].rstrip() + "…"


def format_exchanges(exchanges: list[Exchange]) -> str:
    """Render exchanges as compact `User:`/`Assistant:` text, replies truncated."""
    if not exchanges:
        return ""
    blocks = [
        f"User: {ex.user_text}\nAssistant: {_truncate_reply(ex.assistant_text)}"
        for ex in exchanges
    ]
    return "\n\n".join(blocks)


# Pronouns / deixis / explicit call-backs that point at earlier turns.
_BACK_REFERENCE = re.compile(
    r"\b(it|its|that|those|them|they|this|these|above|earlier|before|"
    r"previous|previously|same)\b"
    r"|you (?:said|mentioned)|as you|last one",
    re.IGNORECASE,
)
# Elaboration cues that only count as follow-ups when no fresh ticker is named.
_ELABORATION = re.compile(
    r"\b(why|explain|elaborate|more|instead|also|compare)\b|what about",
    re.IGNORECASE,
)
# A 3–7 letter uppercase token, i.e. a likely NEPSE ticker → a fresh subject.
_TICKER = re.compile(r"\b[A-Z]{3,7}\b")

# Common 3–7 letter uppercase tokens that are NOT tickers — keeps the elaboration
# gate from misreading a metric/acronym as a fresh subject.
_TICKER_STOPWORDS = frozenset({
    "RSI", "MACD", "ROE", "ROA", "EPS", "NPL", "ATR", "NAV", "IPO", "CEO",
    "CFO", "GDP", "NEPSE", "USD", "NPR", "YOY", "QOQ", "EBITDA", "PEG", "ROIC",
})


def _names_fresh_ticker(text: str) -> bool:
    """True if `text` contains an uppercase token that looks like a real ticker
    (not a common metric/acronym)."""
    return any(tok not in _TICKER_STOPWORDS for tok in _TICKER.findall(text))


def references_prior_context(message: str) -> bool:
    """True when the message reaches back to earlier turns rather than standing alone.

    Back-reference pronouns/deixis always count. Bare elaboration cues count only
    when the message does not name a fresh ticker (otherwise it is a new subject).
    Misclassification is low-cost: the rolling summary is always present anyway.
    """
    text = message or ""
    if _BACK_REFERENCE.search(text):
        return True
    if _ELABORATION.search(text) and not _names_fresh_ticker(text):
        return True
    return False
