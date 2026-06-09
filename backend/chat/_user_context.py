"""Per-turn context for chat tools.

The Claude Agent SDK's @tool functions don't receive the Django request, so
we stash:

  - the authenticated user (``get_user`` / ``set_user``)
  - a card buffer (``push_card`` / ``take_cards``)

in ContextVars before invoking the SDK. ContextVars are async-safe and
isolated per asyncio task lineage — concurrent chat streams don't leak.

The card buffer is the side-channel that lets tools attach structured render
payloads without polluting the model's context. The tool's text content goes
to the model; cards go straight to the SSE stream.
"""

from contextvars import ContextVar
from typing import Any, Optional

from django.contrib.auth import get_user_model

User = get_user_model()

_current_user: ContextVar[Optional["User"]] = ContextVar("_current_user", default=None)
_card_buffer: ContextVar[Optional[list[dict[str, Any]]]] = ContextVar("_card_buffer", default=None)


def set_user(user) -> None:
    _current_user.set(user)


def get_user():
    """Return the user attached to the current chat turn.

    Raises if called outside of a chat tool execution context — that means
    something is calling these tools from the wrong place.
    """
    user = _current_user.get()
    if user is None or not getattr(user, "is_authenticated", False):
        raise RuntimeError(
            "No authenticated user in context. Chat tools must be invoked "
            "through chat.agent.run_chat_session() which sets the user."
        )
    return user


def reset_cards() -> None:
    """Initialize an empty card buffer for the current turn."""
    _card_buffer.set([])


def push_card(tool_name: str, card: dict[str, Any]) -> None:
    """Append a card from a tool. Silently drops if no buffer is active."""
    buf = _card_buffer.get()
    if buf is not None:
        buf.append({"tool": tool_name, **card})


def take_cards() -> list[dict[str, Any]]:
    """Drain and return all cards collected since the last drain."""
    buf = _card_buffer.get()
    if not buf:
        return []
    _card_buffer.set([])
    return buf
