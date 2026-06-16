"""Domain logic for writing CompanyAnalysisEntry timeline points, shared by the
chat-driven fold and the ad-hoc market run."""
from __future__ import annotations

import logging

log = logging.getLogger(__name__)


def apply_analysis_result(user, symbol: str, prior, result, source_message=None):
    """Create a new timeline entry on first analysis or material change; otherwise
    refine the latest entry in place. Returns the written entry.

    On in-place refine, `source_message` is only written when provided, so a manual
    run (source_message=None) never clobbers the chat idempotency high-water mark."""
    from chat.models import CompanyAnalysisEntry

    if prior is None or result.materially_changed:
        return CompanyAnalysisEntry.objects.create(
            user=user, symbol=symbol, summary=result.summary, stance=result.stance,
            aspect=result.aspect, change_note=result.change_note, source_message=source_message,
        )
    prior.summary = result.summary
    prior.stance = result.stance
    prior.aspect = result.aspect
    prior.change_note = result.change_note
    fields = ["summary", "stance", "aspect", "change_note", "updated_at"]
    if source_message is not None:
        prior.source_message = source_message
        fields.append("source_message")
    prior.save(update_fields=fields)
    return prior


def run_market_analysis(user, symbol: str):
    """Ad-hoc, data-driven analysis: fold the company's current market verdict into
    the user's timeline. Returns the written/updated latest entry, or the existing
    latest (or None) if nothing could be produced. Never raises."""
    from chat.models import CompanyAnalysisEntry
    from chat import summary_service

    symbol = symbol.upper()
    try:
        from stocks.services.ticker_verdict import build_verdict
        verdict = build_verdict(symbol)
    except Exception:  # pylint: disable=broad-except
        log.exception("build_verdict failed for %s", symbol)
        verdict = {}
    prior = (
        CompanyAnalysisEntry.objects.filter(user=user, symbol=symbol)
        .order_by("-created_at")
        .first()
    )
    try:
        result = summary_service.build_company_analysis_from_market(prior, symbol, verdict)
    except Exception:  # pylint: disable=broad-except
        log.exception("market analysis build failed for %s", symbol)
        return prior
    return apply_analysis_result(user, symbol, prior, result, source_message=None)
