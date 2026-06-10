"""Cross-engine confluence scoring for the daily trading plan.

Pure functions over already-fetched data so they are trivially testable.
Weights per spec: engines 35%, opportunity 35%, accumulation 20%, sector 10%.
"""

WEIGHTS = {"engines": 0.35, "opportunity": 0.35, "accumulation": 0.20, "sector": 0.10}

# Sector intensity boundaries mirror sector_rotation's accumulating/distributing bands.
SECTOR_ACCUMULATING = 3.0
SECTOR_DISTRIBUTING = -3.0


def engine_component(buy_sources, sell_sources):
    """Distinct ACTIVE BUY sources minus conflicting SELL-side sources, capped at 4 → 0-100."""
    raw = len(set(buy_sources)) - len(set(sell_sources))
    return max(0.0, min(float(raw), 4.0)) / 4.0 * 100.0


def opportunity_component(opp_row):
    """Map the opportunity engine's trust/significance onto 0-100.

    DIVERGENT rows must be filtered out by the caller before symbol selection;
    if one reaches here it scores 0 (defense in depth).
    """
    if not opp_row:
        return 0.0
    trust = opp_row.get("trust")
    significant = (opp_row.get("pvalue") or 1.0) <= 0.05
    if trust == "CONFIRMED":
        return 100.0 if significant else 80.0
    if trust == "UNCONFIRMED":
        return 60.0 if significant else 40.0
    return 0.0


def accumulation_component(episode_metadatas):
    """Best accumulation context across the symbol's active episodes.

    Uses keys the SMART_MONEY engine already writes: inst_net_5d, markup_percent
    (price premium over top-broker WAC). Episodes without these keys contribute 0.
    """
    best = 0.0
    for md in episode_metadatas:
        md = md or {}
        net = md.get("inst_net_5d")
        markup = md.get("markup_percent")
        if net is None or net <= 0:
            continue
        if markup is not None and markup <= 0:
            best = max(best, 100.0)
        elif markup is not None and markup <= 5:
            best = max(best, 70.0)
        else:
            best = max(best, 40.0)
    return best


def sector_component(intensity):
    """Sector accumulation intensity → 0/50/100. None (unknown sector) is neutral."""
    if intensity is None:
        return 50.0
    if intensity > SECTOR_ACCUMULATING:
        return 100.0
    if intensity < SECTOR_DISTRIBUTING:
        return 0.0
    return 50.0


def confluence_score(buy_sources, sell_sources, opportunity_row, episode_metadatas, sector_intensity):
    """Weighted 0-100 score plus a per-component breakdown for the UI."""
    eng = engine_component(buy_sources, sell_sources)
    opp = opportunity_component(opportunity_row)
    acc = accumulation_component(episode_metadatas)
    sec = sector_component(sector_intensity)
    score = (
        WEIGHTS["engines"] * eng
        + WEIGHTS["opportunity"] * opp
        + WEIGHTS["accumulation"] * acc
        + WEIGHTS["sector"] * sec
    )
    components = {
        "engine_agreement": {
            "score": eng,
            "active_buy_sources": sorted(set(buy_sources)),
            "conflicting_sources": sorted(set(sell_sources)),
        },
        "opportunity": {
            "score": opp,
            "trust": (opportunity_row or {}).get("trust"),
            "edge": (opportunity_row or {}).get("edge"),
            "pvalue": (opportunity_row or {}).get("pvalue"),
        },
        "accumulation": {"score": acc},
        "sector": {"score": sec, "acc_intensity": sector_intensity},
    }
    return round(score), components
