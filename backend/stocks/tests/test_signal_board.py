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
    assert resp.data["consensus"]["NABIL"]["count"] == 2
    acc = next(c for c in resp.data["cards"] if c["source"] == "ACCUMULATION_STRATEGY")
    assert acc["tier"] == "research" and float(acc["strength"]) == 82.0
    assert any("oncentration" in line for line in acc["conditions"])


@pytest.mark.django_db
def test_board_min_families_filter():
    SignalEpisode.objects.create(
        source="VOLUME_BREAKOUT", producer_key="VOLUME_BREAKOUT", symbol="API",
        direction="BUY", start_date=date(2026, 6, 17), last_signal_date=date(2026, 6, 17),
        entry_price=Decimal("248"), entry_strength=64, status="ACTIVE", metadata={})
    resp = _client().get("/api/stocks/signals/board/?min_families=2")
    assert all(c["symbol"] != "API" for c in resp.data["cards"])
