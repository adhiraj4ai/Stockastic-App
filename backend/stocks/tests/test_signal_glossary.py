# backend/stocks/tests/test_signal_glossary.py
import pytest
from rest_framework.test import APIClient

from stocks.services.signals.glossary import GLOSSARY, describe


def test_every_source_has_label_and_description():
    for src in ["SMART_MONEY", "DISTRIBUTION_ALERT", "BELOW_COST_REVERSAL",
                "CONCENTRATION_SHIFT", "ACC_MOMENTUM", "BROKER_ACCUMULATION",
                "VOLUME_BREAKOUT", "INSTITUTIONAL_ALERTS", "ICHIMOKU",
                "SMART_CROSSOVER", "USER_STRATEGY", "ACCUMULATION_STRATEGY"]:
        entry = describe("sources", src)
        assert entry and entry["label"] and entry["description"]


def test_known_tiers_and_factor_terms_present():
    assert describe("tiers", "Platinum Buy")["description"]
    assert describe("tiers", "validated")["description"]
    assert describe("terms", "concentration")["description"]
    assert describe("sources", "NOPE") is None


@pytest.mark.django_db
def test_glossary_endpoint_returns_map():
    resp = APIClient().get("/api/stocks/signal-glossary/")
    assert resp.status_code == 200
    assert "sources" in resp.data and "tiers" in resp.data
