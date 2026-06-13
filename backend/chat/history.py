"""Pure helpers for chat conversation history.

Reads completed user→assistant exchanges from persisted ChatMessage rows and
renders a compact, token-bounded window for prompt injection. No model calls,
no I/O beyond the ORM read — kept pure so it is trivially testable.
"""
from __future__ import annotations

from typing import NamedTuple

from chat.models import ChatMessage

HISTORY_HOPS = 3
MAX_REPLY_CHARS_IN_HISTORY = 600


class Exchange(NamedTuple):
    """One completed turn: a user message and the assistant reply that followed it."""

    user_text: str
    assistant_text: str


def recent_exchanges(session, hops: int = HISTORY_HOPS) -> list[Exchange]:
    """Return the last `hops` completed user→assistant exchanges, oldest first.

    A trailing user message with no assistant reply yet (the current turn) is
    naturally excluded because it never closes a pair.
    """
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
