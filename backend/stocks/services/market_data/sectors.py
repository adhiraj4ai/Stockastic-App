"""Canonicalise NEPSE sector names so downstream filters can match exactly.

NEPSE's company master returns a handful of sector aliases that differ only in
casing or spacing (e.g. ``HYDROPOWER`` vs ``Hydro Power``). Anything written to
the ``companies`` table must use the canonical spelling, otherwise sector-keyed
consumers (such as the financials page templates) silently drop the company.
"""

from typing import Optional

CANONICAL_HYDRO = "Hydro Power"

_SECTOR_ALIASES = {
    "hydropower": CANONICAL_HYDRO,
}


def normalize_sector(raw: Optional[str]) -> Optional[str]:
    """Map a raw NEPSE sector name to its canonical spelling.

    Returns the input unchanged when it is empty/None or already canonical.
    """
    if not raw:
        return raw
    trimmed = raw.strip()
    return _SECTOR_ALIASES.get(trimmed.casefold(), trimmed)
