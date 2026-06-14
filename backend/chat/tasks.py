"""Background tasks for the chat app."""
from __future__ import annotations

import logging

from celery import shared_task

log = logging.getLogger(__name__)

# Below this many completed exchanges the rolling summary is skipped — the
# verbatim 3-hop window already covers the whole conversation.
SUMMARIZE_AFTER_EXCHANGES = 3


@shared_task(name="chat.update_session_summary")
def update_session_summary(session_id: str) -> str | None:
    """Refresh ChatSession.summary from the newest exchange. No-op while short."""
    from chat.models import ChatSession, ChatMessage
    from chat.history import recent_exchanges
    from chat import summary_service

    try:
        session = ChatSession.objects.get(id=session_id)
    except ChatSession.DoesNotExist:
        return None

    completed = session.messages.filter(role=ChatMessage.ROLE_ASSISTANT).count()
    if completed <= SUMMARIZE_AFTER_EXCHANGES:
        return None

    seeding = not (session.summary or "").strip()
    hops = completed if seeding else 1
    exchanges = recent_exchanges(session, hops=hops)
    if not exchanges:
        return None

    try:
        new_summary = summary_service.build_summary(session.summary or "", exchanges)
    except Exception:  # pylint: disable=broad-except
        log.exception("rolling-summary build failed for session %s", session_id)
        return None

    session.summary = new_summary
    session.save(update_fields=["summary", "updated_at"])
    return new_summary
