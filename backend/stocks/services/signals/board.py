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
        "entry_price": c.suggested_entry, "stop_loss_price": c.suggested_stop,
        "target_price": c.suggested_target,
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


def _consensus(cards):
    by_symbol = defaultdict(lambda: defaultdict(set))
    for c in cards:
        by_symbol[c["symbol"]][c["direction"]].add(c["family"])
    out = {}
    for sym, by_dir in by_symbol.items():
        fams = max(by_dir.values(), key=len)
        out[sym] = {"families": sorted(fams), "count": len(fams)}
    return out


def build_board(direction=None, symbol=None, min_families=1, include_historical=False):
    cards = _collect(include_historical)
    if direction:
        cards = [c for c in cards if c["direction"] == direction.upper()]
    if symbol:
        cards = [c for c in cards if c["symbol"] == symbol.upper()]
    consensus = _consensus(cards)
    if min_families > 1:
        cards = [c for c in cards if consensus.get(c["symbol"], {}).get("count", 0) >= min_families]
    return {"cards": sorted(cards, key=lambda c: c["strength"] or 0, reverse=True),
            "consensus": consensus}
