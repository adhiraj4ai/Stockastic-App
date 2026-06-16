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


def _tracked_symbols(text: str) -> list[str]:
    """Candidate tickers in `text` that exist as active companies, first-seen order."""
    from chat.history import extract_tickers
    from stocks.models.market import Company

    candidates = extract_tickers(text)
    if not candidates:
        return []
    existing = set(
        Company.objects.filter(symbol__in=candidates).values_list("symbol", flat=True)
    )
    return [c for c in candidates if c in existing]


def _fold_company_summary(user, symbol: str, exchange, latest_message) -> None:
    """Fold the newest exchange into one company's rolling summary. Idempotent."""
    from chat.models import CompanyChatSummary
    from chat import summary_service

    existing = CompanyChatSummary.objects.filter(user=user, symbol=symbol).first()
    if existing is not None and existing.last_message_id == latest_message.id:
        return
    prior = (existing.summary if existing is not None else "") or ""
    new_summary = summary_service.build_company_summary(prior, [exchange], symbol)
    if existing is not None:
        existing.summary = new_summary
        existing.last_message = latest_message
        existing.save(update_fields=["summary", "last_message", "updated_at"])
    else:
        CompanyChatSummary.objects.create(
            user=user, symbol=symbol, summary=new_summary, last_message=latest_message,
        )


@shared_task(name="chat.compile_company_summaries")
def compile_company_summaries(session_id: str) -> None:
    """Update per-company summaries for every active ticker named in the newest turn."""
    from chat.models import ChatSession, ChatMessage
    from chat.history import recent_exchanges

    try:
        session = ChatSession.objects.get(id=session_id)
    except ChatSession.DoesNotExist:
        return None

    exchanges = recent_exchanges(session, hops=1)
    latest_message = (
        session.messages.filter(role=ChatMessage.ROLE_ASSISTANT).order_by("created_at").last()
    )
    if not exchanges or latest_message is None:
        return None

    exchange = exchanges[-1]
    for symbol in _tracked_symbols(exchange.user_text):
        try:
            _fold_company_summary(session.user, symbol, exchange, latest_message)
        except Exception:  # pylint: disable=broad-except
            log.exception("company-summary fold failed for %s / %s", session_id, symbol)
    return None
