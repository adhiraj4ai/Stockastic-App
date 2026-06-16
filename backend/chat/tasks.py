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


def _fold_company_analysis(user, symbol: str, exchange, latest_message) -> None:
    """Fold the newest exchange into the user's analysis timeline for one company.

    Creates a new entry on first mention or AI-judged material change; otherwise
    refines the latest entry in place. Idempotent via the latest entry's source."""
    from chat.models import CompanyAnalysisEntry
    from chat import summary_service

    prior = (
        CompanyAnalysisEntry.objects.filter(user=user, symbol=symbol)
        .order_by("-created_at")
        .first()
    )
    if prior is not None and prior.source_message_id == latest_message.id:
        return
    result = summary_service.build_company_analysis(prior, [exchange], symbol)
    if prior is None or result.materially_changed:
        CompanyAnalysisEntry.objects.create(
            user=user, symbol=symbol, summary=result.summary, stance=result.stance,
            aspect=result.aspect, change_note=result.change_note, source_message=latest_message,
        )
        return
    prior.summary = result.summary
    prior.stance = result.stance
    prior.aspect = result.aspect
    prior.change_note = result.change_note
    prior.source_message = latest_message
    prior.save(update_fields=[
        "summary", "stance", "aspect", "change_note", "source_message", "updated_at",
    ])


@shared_task(name="chat.compile_company_analysis")
def compile_company_analysis(session_id: str) -> None:
    """Update each active ticker's analysis timeline from the newest chat turn."""
    from chat.models import ChatSession, ChatMessage
    from chat.history import recent_exchanges

    try:
        session = ChatSession.objects.get(id=session_id)
    except ChatSession.DoesNotExist:
        return None

    exchanges = recent_exchanges(session, hops=1)
    # The latest assistant message is the close of exchanges[-1]; it is the
    # idempotency key (source_message) guarding the fold below.
    latest_message = (
        session.messages.filter(role=ChatMessage.ROLE_ASSISTANT).order_by("created_at").last()
    )
    if not exchanges or latest_message is None:
        return None

    exchange = exchanges[-1]
    for symbol in _tracked_symbols(exchange.user_text):
        try:
            _fold_company_analysis(session.user, symbol, exchange, latest_message)
        except Exception:  # pylint: disable=broad-except
            log.exception("company-analysis fold failed for %s / %s", session_id, symbol)
    return None
