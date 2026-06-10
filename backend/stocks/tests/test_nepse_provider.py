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
