"""Equivalence tests: broker_research service functions == the view endpoints they were extracted from.

NOTE: These tests require live raw SQL tables (daily_cumulative_accumulation, daily_floorsheet,
companies, daily_stock_price) which are NOT created in the test database (they are unmanaged tables
seeded only in production/staging). Tests are skipped automatically when those tables are absent.
Run against a live DB with data to fully validate equivalence.
"""
import pytest
from django.db import connection

from stocks.services import broker_research

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
        if not raw_tables_exist:
            pytest.skip("Raw SQL tables not present in test DB")
        resp = auth_client.get("/api/stocks/companies/broker_favorites/?broker=1&range=3M")
        assert resp.status_code == 200
        direct = broker_research.broker_favorites(broker_id=1, range_key="3M")
        assert resp.json() == direct
