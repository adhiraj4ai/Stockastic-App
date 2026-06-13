"""Cheap lexical matcher over a user's SavedAnalysis records.

Shared by the live composer hint (suggest endpoint) and prompt-time recall
seeding. Ranking is keyword/ticker/tag overlap — no embeddings, no LLM.
"""
from __future__ import annotations

import re

from chat.models import SavedAnalysis

_WORD_RE = re.compile(r"[a-z0-9]+")
_TICKER_RE = re.compile(r"\b[A-Z]{3,7}\b")


def _tokens(text: str) -> set[str]:
    return set(_WORD_RE.findall((text or "").lower()))


def _score(query: str, sa: SavedAnalysis) -> int:
    q_tokens = _tokens(query)
    # Uppercase the query so lowercase chat input ("gbime") still matches symbols.
    # Non-symbol words become candidates too, but they only score if they appear in
    # a record's actual `tickers`, so false candidates contribute nothing.
    q_tickers = set(_TICKER_RE.findall((query or "").upper()))
    score = 0
    # Ticker overlap is the strongest signal.
    score += 5 * len(q_tickers & {t.upper() for t in (sa.tickers or [])})
    # Tag overlap.
    score += 3 * len(q_tokens & {t.lower() for t in (sa.tags or [])})
    # Title / one-liner / category keyword overlap.
    haystack = _tokens(f"{sa.title} {sa.one_liner} {sa.category}")
    score += len(q_tokens & haystack)
    return score


def match_saved_analyses(user, query: str, limit: int = 5) -> list[SavedAnalysis]:
    """Return the user's saved analyses most relevant to `query`, best first.

    Returns [] for blank queries. Only records with a positive score are returned.
    """
    if not query or not query.strip():
        return []
    candidates = list(SavedAnalysis.objects.filter(user=user))
    scored = [(sa, _score(query, sa)) for sa in candidates]
    scored = [(sa, s) for sa, s in scored if s > 0]
    scored.sort(key=lambda pair: (pair[1], pair[0].created_at), reverse=True)
    return [sa for sa, _ in scored[:limit]]
