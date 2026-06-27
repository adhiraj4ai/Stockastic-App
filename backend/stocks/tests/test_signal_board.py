from datetime import date
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from stocks.models import SignalEpisode, AccumulationCandidate

User = get_user_model()


def _client():
    user = User.objects.create_user(username="boardtest", password="p")
    client = APIClient()
    client.force_authenticate(user)
    return client


@pytest.mark.django_db
def test_board_merges_candidate_into_accumulation_and_computes_consensus():
    SignalEpisode.objects.create(
        source="ICHIMOKU", producer_key="ICHIMOKU", symbol="NABIL", direction="BUY",
        start_date=date(2026, 6, 17), last_signal_date=date(2026, 6, 17),
        entry_price=Decimal("520"), entry_strength=74,
        signal_tier="cloud breakout", status="ACTIVE", metadata={})
    AccumulationCandidate.objects.create(
        symbol="NABIL", scan_date=date(2026, 6, 17), score=Decimal("82"),
        factors={"concentration": 0.9, "coiling": 0.7, "breakout": 1.0, "score": 82.0},
        suggested_entry=Decimal("520"), suggested_stop=Decimal("500"),
        suggested_target=Decimal("560"), validation_state="research",
        status=AccumulationCandidate.Status.ACTIVE)
    resp = _client().get("/api/stocks/signals/board/")
    assert resp.status_code == 200
    fams = {c["family"] for c in resp.data["cards"] if c["symbol"] == "NABIL"}
    assert fams == {"accumulation", "technical"}
    assert resp.data["consensus"]["NABIL"]["BUY"]["count"] == 2
    acc = next(c for c in resp.data["cards"] if c["family"] == "accumulation")
    assert acc["tier"] == "research" and float(acc["strength"]) == 82.0
    assert any("oncentration" in line for line in acc["conditions"])
    assert "contributors" in acc
    assert len(acc["contributors"]) == 1
    assert acc["contributors"][0]["source"] == "ACCUMULATION_STRATEGY"
    assert float(acc["contributors"][0]["strength"]) == 82.0


@pytest.mark.django_db
def test_board_min_families_filter():
    SignalEpisode.objects.create(
        source="VOLUME_BREAKOUT", producer_key="VOLUME_BREAKOUT", symbol="API",
        direction="BUY", start_date=date(2026, 6, 17), last_signal_date=date(2026, 6, 17),
        entry_price=Decimal("248"), entry_strength=64, status="ACTIVE", metadata={})
    resp = _client().get("/api/stocks/signals/board/?min_families=2")
    assert all(c["symbol"] != "API" for c in resp.data["cards"])


@pytest.mark.django_db
def test_consensus_is_per_direction():
    """BUY agreement on a symbol must not bleed onto its SELL side."""
    SignalEpisode.objects.create(
        source="ICHIMOKU", producer_key="ICHIMOKU", symbol="MIXED", direction="BUY",
        start_date=date(2026, 6, 17), last_signal_date=date(2026, 6, 17),
        entry_price=Decimal("300"), entry_strength=70, status="ACTIVE", metadata={})
    AccumulationCandidate.objects.create(
        symbol="MIXED", scan_date=date(2026, 6, 17), score=Decimal("75"),
        factors={"concentration": 0.8, "coiling": 0.6, "breakout": 0.9, "score": 75.0},
        suggested_entry=Decimal("300"), suggested_stop=Decimal("280"),
        suggested_target=Decimal("330"), validation_state="research",
        status=AccumulationCandidate.Status.ACTIVE)
    SignalEpisode.objects.create(
        source="DISTRIBUTION_ALERT", producer_key="DISTRIBUTION_ALERT", symbol="MIXED",
        direction="SELL", start_date=date(2026, 6, 17), last_signal_date=date(2026, 6, 17),
        entry_price=Decimal("300"), entry_strength=60, status="ACTIVE", metadata={})
    resp = _client().get("/api/stocks/signals/board/")
    assert resp.status_code == 200
    mixed_consensus = resp.data["consensus"]["MIXED"]
    assert mixed_consensus["BUY"]["count"] == 2
    assert mixed_consensus["SELL"]["count"] == 1


@pytest.mark.django_db
def test_board_aggregates_same_symbol_direction_in_a_lane():
    # Two BUY accumulation episodes on NABIL from different engines
    for src in ("SMART_MONEY", "BELOW_COST_REVERSAL"):
        SignalEpisode.objects.create(
            source=src, producer_key=src, symbol="NABIL", direction="BUY",
            start_date=date(2026, 6, 17), last_signal_date=date(2026, 6, 17),
            entry_price=Decimal("520"), entry_strength=80 if src == "SMART_MONEY" else 70,
            status="ACTIVE", metadata={})
    resp = _client().get("/api/stocks/signals/board/")
    assert resp.status_code == 200
    accum_cards = [c for c in resp.data["cards"] if c["family"] == "accumulation" and c["symbol"] == "NABIL"]
    assert len(accum_cards) == 1
    contributors = accum_cards[0]["contributors"]
    assert len(contributors) == 2
    sources = {c["source"] for c in contributors}
    assert sources == {"SMART_MONEY", "BELOW_COST_REVERSAL"}
