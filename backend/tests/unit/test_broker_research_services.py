"""Equivalence tests: broker_research service functions == the view endpoints they were extracted from.

NOTE: These tests require live raw SQL tables (daily_cumulative_accumulation, daily_floorsheet,
companies, daily_stock_price) which are NOT created in the test database (they are unmanaged tables
seeded only in production/staging). Tests are skipped automatically when those tables are absent.
Run against a live DB with data to fully validate equivalence.
"""
import json

import pytest
from django.db import connection
from rest_framework.utils.encoders import JSONEncoder

from stocks.services import broker_research


def _drf_roundtrip(obj):
    """Coerce Decimals/dates the way DRF's JSON rendering does, so service output compares equal to resp.json()."""
    return json.loads(json.dumps(obj, cls=JSONEncoder))

pytestmark = pytest.mark.django_db


@pytest.fixture(scope="session")
def raw_tables_exist(django_db_setup, django_db_blocker):
    """Session-level fixture: returns True if the production raw tables are present."""
    with django_db_blocker.unblock():
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT EXISTS(SELECT 1 FROM information_schema.tables "
                "WHERE table_name='daily_cumulative_accumulation')"
            )
            return cursor.fetchone()[0]


class TestAccumulationMixinExtraction:
    def test_accumulation_flows_matches_endpoint(self, auth_client, raw_tables_exist):
        if not raw_tables_exist:
            pytest.skip("Raw SQL tables not present in test DB")
        resp = auth_client.get("/api/stocks/companies/accumulation/?range=1D&sector=All")
        assert resp.status_code == 200
        direct = broker_research.accumulation_flows(range_key="1D", sector="All", symbol=None)
        assert resp.json() == direct

    def test_broker_trends_matches_endpoint(self, auth_client, raw_tables_exist):
        if not raw_tables_exist:
            pytest.skip("Raw SQL tables not present in test DB")
        resp = auth_client.get("/api/stocks/companies/broker_trends/?range=ALL")
        assert resp.status_code == 200
        direct = broker_research.broker_trends(symbol=None, range_key="ALL")
        assert resp.json() == direct

    def test_below_cost_matches_endpoint(self, auth_client, raw_tables_exist):
        if not raw_tables_exist:
            pytest.skip("Raw SQL tables not present in test DB")
        resp = auth_client.get("/api/stocks/companies/below_cost/?range=ALL&sector=All")
        assert resp.status_code == 200
        direct = broker_research.below_cost(range_key="ALL", sector="All")
        assert resp.json() == direct

    def test_broker_favorites_matches_endpoint(self, auth_client, raw_tables_exist):
        # Note: broker_params was previously [int] * 11; the 11th placeholder binds against
        # varchar entity_id in the LATERAL join, causing ProgrammingError on real data.
        # Fixed in this commit to [int] * 10 + [str] so the type matches the column.
        if not raw_tables_exist:
            pytest.skip("Raw SQL tables not present in test DB")
        resp = auth_client.get("/api/stocks/companies/broker_favorites/?broker=1&range=3M")
        assert resp.status_code == 200
        direct = broker_research.broker_favorites(broker_id=1, range_key="3M")
        assert resp.json() == direct


class TestFloorsheetExtraction:
    def test_smart_money_matches_endpoint(self, auth_client, raw_tables_exist):
        if not raw_tables_exist:
            pytest.skip("Raw SQL tables not present in test DB")
        resp = auth_client.get("/api/stocks/floorsheet/smart_money/?range=1D")
        assert resp.status_code == 200
        assert resp.json() == broker_research.smart_money(range_key="1D")

    def test_focus_ranking_matches_endpoint(self, auth_client, raw_tables_exist):
        if not raw_tables_exist:
            pytest.skip("Raw SQL tables not present in test DB")
        resp = auth_client.get("/api/stocks/floorsheet/broker_focus_ranking/?range=1W")
        assert resp.status_code == 200
        assert resp.json() == broker_research.focus_ranking(range_key="1W")

    def test_share_transfers_matches_endpoint(self, auth_client, raw_tables_exist):
        if not raw_tables_exist:
            pytest.skip("Raw SQL tables not present in test DB")
        resp = auth_client.get("/api/stocks/floorsheet/broker_transfer/?symbol=NABIL&broker1=1&broker2=2&range=1M")
        assert resp.status_code == 200
        assert resp.json() == broker_research.share_transfers(symbol="NABIL", broker1=1, broker2=2, range_key="1M")


class TestBrokerViewExtraction:
    def test_navigator_signals_matches_endpoint(self, auth_client, raw_tables_exist):
        if not raw_tables_exist:
            pytest.skip("Raw SQL tables not present in test DB")
        resp = auth_client.get("/api/stocks/broker-analysis/signals/")
        assert resp.status_code == 200
        # navigator_signals() returns Decimal columns; _drf_roundtrip coerces them to float as DRF does
        assert resp.json() == _drf_roundtrip(broker_research.navigator_signals())

    def test_broker_portfolio_matches_endpoint(self, auth_client, raw_tables_exist):
        if not raw_tables_exist:
            pytest.skip("Raw SQL tables not present in test DB")
        resp = auth_client.get("/api/stocks/broker_portfolio/?broker_id=1")
        assert resp.status_code == 200
        # broker_portfolio() returns Decimal columns; _drf_roundtrip coerces them to float as DRF does
        assert resp.json() == _drf_roundtrip(broker_research.broker_portfolio(broker_id=1))

    def test_accumulation_history_matches_endpoint(self, auth_client, raw_tables_exist):
        if not raw_tables_exist:
            pytest.skip("Raw SQL tables not present in test DB")
        resp = auth_client.get("/api/stocks/accumulation_history/?broker=1&symbol=NABIL&page=1&page_size=50")
        assert resp.status_code == 200
        assert resp.json() == broker_research.accumulation_history(broker_id=1, symbol="NABIL", page=1, page_size=50)


class TestForecastService:
    def test_forecast_returns_projection_shape_or_none(self, raw_tables_exist):
        if not raw_tables_exist:
            pytest.skip("Raw SQL tables not present in test DB")
        result = broker_research.accumulation_forecast(symbol="NABIL", min_intensity=3.0)
        assert result is None or {"symbol", "current"} <= set(result.keys())

    def test_forecast_is_cached(self, raw_tables_exist):
        if not raw_tables_exist:
            pytest.skip("Raw SQL tables not present in test DB")
        from django.core.cache import cache
        cache.delete("broker_research:forecast:NABIL:3.0")
        first = broker_research.accumulation_forecast(symbol="NABIL", min_intensity=3.0)
        if first is not None:
            assert cache.get("broker_research:forecast:NABIL:3.0") is not None
