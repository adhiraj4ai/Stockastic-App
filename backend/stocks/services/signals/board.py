"""Merge signal episodes + accumulation candidates into one lane-tagged board."""
from collections import defaultdict

from stocks.models import AccumulationCandidate, SignalEpisode
from stocks.serializers.signal import SignalEpisodeSerializer
from stocks.services.signals.conditions import format_conditions
from stocks.services.signals.families import family_for

ACCUMULATION_STRATEGY = "ACCUMULATION_STRATEGY"


def _episode_card(ep):
    data = SignalEpisodeSerializer(ep).data
    return {
        "source": ep.source, "family": family_for(ep.source), "symbol": ep.symbol,
        "direction": ep.direction, "strength": ep.entry_strength,
        "tier": ep.signal_tier or "", "entry_price": data["entry_price"],
        "stop_loss_price": data["stop_loss_price"], "target_price": data["target_price"],
        "conditions": format_conditions(ep.source, ep.metadata or {}),
        "validation_state": None, "freshness_date": data["last_signal_date"] or data["start_date"],
        "strategy_name": data["strategy_name"], "rationale": ep.rationale or "",
    }


def _candidate_card(c):
    return {
        "source": ACCUMULATION_STRATEGY, "family": "accumulation", "symbol": c.symbol,
        "direction": "BUY", "strength": float(c.score), "tier": c.validation_state,
        "entry_price": str(c.suggested_entry), "stop_loss_price": str(c.suggested_stop),
        "target_price": str(c.suggested_target),
        "conditions": format_conditions(ACCUMULATION_STRATEGY, c.factors or {}),
        "validation_state": c.validation_state, "freshness_date": c.scan_date,
        "strategy_name": "Accumulation strategy", "rationale": "",
    }


def _collect(include_historical):
    eps = SignalEpisode.objects.all() if include_historical else SignalEpisode.objects.filter(status="ACTIVE")
    cards = [_episode_card(e) for e in eps.order_by("-start_date")]
    cands = AccumulationCandidate.objects.filter(status=AccumulationCandidate.Status.ACTIVE)
    cards += [_candidate_card(c) for c in cands.order_by("-score")]
    return cards


def _contributor_entry(c):
    return {
        "source": c["source"], "strategy_name": c["strategy_name"], "tier": c["tier"],
        "strength": c["strength"], "conditions": c["conditions"],
        "validation_state": c["validation_state"],
    }


def _merge_validation_state(contributors):
    if any(c["validation_state"] == "research" for c in contributors):
        return "research"
    if any(c["validation_state"] == "validated" for c in contributors):
        return "validated"
    return None


def _merge_group(contributors):
    lead = contributors[0]
    return {
        "family": lead["family"], "symbol": lead["symbol"], "direction": lead["direction"],
        "source": lead["source"],
        "strength": lead["strength"], "tier": lead["tier"],
        "entry_price": lead["entry_price"], "stop_loss_price": lead["stop_loss_price"],
        "target_price": lead["target_price"],
        "freshness_date": max(
            (c["freshness_date"] for c in contributors if c["freshness_date"]), default=None
        ),
        "validation_state": _merge_validation_state(contributors),
        "strategy_name": lead["strategy_name"],
        "source_labels": [c["strategy_name"] for c in contributors],
        "conditions": lead["conditions"],
        "rationale": lead.get("rationale", ""),
        "contributors": [_contributor_entry(c) for c in contributors],
    }


def _aggregate(raw_cards):
    groups = defaultdict(list)
    for card in raw_cards:
        key = (card["family"], card["symbol"], card["direction"])
        groups[key].append(card)
    result = []
    for contributors in groups.values():
        contributors.sort(key=lambda c: c["strength"] or 0, reverse=True)
        result.append(_merge_group(contributors))
    return result


def _consensus(cards):
    by_symbol = defaultdict(lambda: defaultdict(set))
    for c in cards:
        by_symbol[c["symbol"]][c["direction"]].add(c["family"])
    out = {}
    for sym, by_dir in by_symbol.items():
        out[sym] = {
            direction: {"families": sorted(fams), "count": len(fams)}
            for direction, fams in by_dir.items()
        }
    return out


def build_board(direction=None, symbol=None, min_families=1, include_historical=False):
    cards = _aggregate(_collect(include_historical))
    if direction:
        cards = [c for c in cards if c["direction"] == direction.upper()]
    if symbol:
        cards = [c for c in cards if c["symbol"] == symbol.upper()]
    consensus = _consensus(cards)
    if min_families > 1:
        cards = [c for c in cards if consensus.get(c["symbol"], {}).get(c["direction"], {}).get("count", 0) >= min_families]
    return {"cards": sorted(cards, key=lambda c: c["strength"] or 0, reverse=True),
            "consensus": consensus}
