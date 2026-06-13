from datetime import date
from io import StringIO

import pytest
from django.core.management import call_command

from stocks.models import DailyIndexValue
from stocks.services.market_data import factory
from stocks.services.market_data.contracts import (
    IndexRecord, ProviderSchemaError,
)

pytestmark = pytest.mark.django_db


class FakeProvider:
    name = "fake"

    def __init__(self, **kw):
        pass

    def fetch_indices(self, on):
        return [IndexRecord(index_name="NEPSE", date=on, value=2650.5)]

    def fetch_company_list(self):
        raise ProviderSchemaError("simulated drift in CompanyList")

    def fetch_daily_prices(self, on):
        return []

    def fetch_floorsheet(self, on):
        return iter(())

    def fetch_market_summary(self, on):
        from stocks.services.market_data.contracts import MarketSummaryRecord
        return MarketSummaryRecord(date=on, total_turnover=1.0, total_volume=1, total_transactions=1)


def test_command_isolates_failing_dataset(monkeypatch):
    factory.register_provider("fake", FakeProvider)
    out = StringIO()
    # indices succeeds, companies fails — command must still finish and ingest indices
    call_command(
        "ingest_market_data",
        "--provider", "fake",
        "--datasets", "indices,companies",
        "--date", "2026-06-10",
        stdout=out,
    )
    text = out.getvalue()
    assert DailyIndexValue.objects.filter(index_name="NEPSE").exists()
    assert "indices: OK" in text
    assert "companies: FAILED" in text
    assert "Total records saved:" in text
