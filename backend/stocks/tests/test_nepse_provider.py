from unittest.mock import MagicMock, patch

import pytest
import requests

from stocks.services.market_data.contracts import ProviderUnavailableError
from stocks.services.market_data.providers.http_client import NepseHttpClient


def _resp(json_payload, status=200):
    m = MagicMock()
    m.status_code = status
    m.json.return_value = json_payload
    m.raise_for_status.side_effect = (
        None if status < 400 else requests.HTTPError(f"{status}")
    )
    return m


def test_get_json_returns_payload():
    client = NepseHttpClient(base_url="https://example.test", timeout=5)
    with patch("requests.Session.get", return_value=_resp({"ok": 1})) as g:
        assert client.get_json("/Summary") == {"ok": 1}
        called_url = g.call_args[0][0]
        assert called_url == "https://example.test/Summary"


def test_get_json_raises_unavailable_on_timeout():
    client = NepseHttpClient(base_url="https://example.test", timeout=5, retries=0)
    with patch("requests.Session.get", side_effect=requests.Timeout("slow")):
        with pytest.raises(ProviderUnavailableError):
            client.get_json("/Summary")


def test_get_json_raises_unavailable_on_5xx():
    client = NepseHttpClient(base_url="https://example.test", timeout=5, retries=0)
    with patch("requests.Session.get", return_value=_resp({}, status=503)):
        with pytest.raises(ProviderUnavailableError):
            client.get_json("/Summary")


# ── Task 4: NepseApiProvider price-mapping tests ───────────────────────────

import json
import os
from datetime import date

from django.conf import settings

from stocks.services.market_data.contracts import PriceRecord, ProviderSchemaError
from stocks.services.market_data.providers.nepse_api import NepseApiProvider

FIX = os.path.join(settings.BASE_DIR, "stocks", "tests", "fixtures", "nepse")


def _load(name):
    with open(os.path.join(FIX, name)) as fh:
        return json.load(fh)


def _provider_returning(payload):
    """NepseApiProvider whose HTTP client returns a canned payload."""
    prov = NepseApiProvider(base_url="https://example.test")
    prov.client.get_json = lambda path, params=None: payload  # type: ignore
    return prov


def test_map_prices_from_fixture():
    prov = _provider_returning(_load("price_volume.json"))
    recs = prov.fetch_daily_prices(date(2026, 6, 10))
    assert len(recs) == 1
    r = recs[0]
    assert isinstance(r, PriceRecord)
    assert r.symbol == "NABIL"
    assert r.close == 510.0
    assert r.open == 500.0
    assert r.high == 512.0
    assert r.volume == 12345
    assert r.prev_close == 505.0
    assert r.weeks_52_high == 640.0


def test_map_prices_raises_schema_error_on_missing_key():
    # Drift: 'closePrice'/'lastTradedPrice' both absent -> cannot resolve close
    prov = _provider_returning([{"symbol": "NABIL", "openPrice": 1.0}])
    with pytest.raises(ProviderSchemaError):
        prov.fetch_daily_prices(date(2026, 6, 10))
