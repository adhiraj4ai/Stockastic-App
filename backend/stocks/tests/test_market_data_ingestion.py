from datetime import date

import pytest

from stocks.models import Company, DailyIndexValue, DailyMarketSummary
from stocks.services.market_data.contracts import (
    CompanyRecord, IndexRecord, MarketSummaryRecord, PriceRecord,
)
from stocks.services.market_data.ingestion import IngestionService

pytestmark = pytest.mark.django_db


def test_ingest_indices_upserts_idempotently():
    svc = IngestionService()
    recs = [IndexRecord(index_name="NEPSE", date=date(2026, 6, 10), value=2650.5, change=12.3)]
    r1 = svc.ingest_indices(recs)
    assert r1.inserted == 1
    # Re-run with a changed value -> update, not duplicate
    recs2 = [IndexRecord(index_name="NEPSE", date=date(2026, 6, 10), value=2660.0)]
    r2 = svc.ingest_indices(recs2)
    assert r2.updated == 1
    row = DailyIndexValue.objects.get(index_name="NEPSE", date=date(2026, 6, 10))
    assert float(row.value) == 2660.0
    assert DailyIndexValue.objects.count() == 1


def test_ingest_companies_upserts():
    svc = IngestionService()
    svc.ingest_companies([CompanyRecord(symbol="NABIL", name="Nabil Bank", sector="Banks")])
    assert Company.objects.filter(symbol="NABIL").exists()


def test_ingest_market_summary_upserts():
    svc = IngestionService()
    rec = MarketSummaryRecord(
        date=date(2026, 6, 10), total_turnover=4_489_236_458.2,
        total_volume=12_540_423, total_transactions=85_879,
        top_gainers=[{"symbol": "ABC"}],
    )
    svc.ingest_market_summary(rec)
    row = DailyMarketSummary.objects.get(date=date(2026, 6, 10))
    assert row.total_transactions == 85_879
    assert row.top_gainers == [{"symbol": "ABC"}]


def test_ingest_prices_rejects_nonpositive_close():
    svc = IngestionService()
    recs = [
        PriceRecord(symbol="GOOD", date=date(2026, 6, 10), close=100.0),
        PriceRecord(symbol="BAD", date=date(2026, 6, 10), close=0.0),
    ]
    result = svc.ingest_prices(recs)
    assert result.rejected == 1
    assert any(t == "BAD" for t, _ in result.rejections)
