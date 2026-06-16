"""Pure transform used by the 0012 data migration to seed analysis-timeline
entries from the legacy CompanyChatSummary rows. Kept importable and DB-free so
the seeding rule is unit-tested."""
from __future__ import annotations

SEED_CHANGE_NOTE = "Imported from earlier notes"


def seed_entry_fields(summary: str | None) -> dict | None:
    """Return scalar fields for a seed CompanyAnalysisEntry, or None to skip a
    blank summary. The caller supplies user, symbol, source_message, created_at."""
    if not (summary or "").strip():
        return None
    return {
        "summary": summary,
        "stance": "neutral",
        "aspect": "both",
        "change_note": SEED_CHANGE_NOTE,
    }
