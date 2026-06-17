import json
import os

import pytest

from stocks.models import Company, Dividend, FinancialReport
from stocks.services.tearsheet.pipeline import fetch_datasets, load_datasets

FIX = os.path.join(os.path.dirname(__file__), "fixtures", "tearsheet")


class FakeFetcher:
    """Stands in for TearsheetBrowser; returns fixtures by endpoint fragment."""

    def __init__(self):
        self._fin = json.load(open(os.path.join(FIX, "api_financials.json")))
        self._div = json.load(open(os.path.join(FIX, "api_dividend.json")))
        self._info = json.load(open(os.path.join(FIX, "api_stockinfo.json")))

    def fetch(self, fragment, params):
        if "financials" in fragment:
            return self._fin
        if "dividend" in fragment:
            return self._div
        if "corporate_action" in fragment:
            return self._info
        raise AssertionError(f"unexpected fragment {fragment}")


@pytest.mark.django_db
def test_fetch_then_load_persists_everything():
    raw = fetch_datasets("API", FakeFetcher(), use_cache=False)
    counts = load_datasets("API", raw)
    assert counts == {"reports": 10, "dividends": 9, "company": "API Power Company Limited"}
    assert Company.all_objects.get(symbol="API").name == "API Power Company Limited"
    assert FinancialReport.objects.filter(ticker="API", report_type="ANNUAL").count() == 10
    assert Dividend.objects.filter(ticker="API").count() == 9
