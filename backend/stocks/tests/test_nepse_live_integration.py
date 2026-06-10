"""End-to-end test against the REAL configured NepseAPI. Skipped by default.

Run explicitly with:  RUN_NEPSE_LIVE=1 python -m pytest stocks/tests/test_nepse_live_integration.py -v
This is the canary that catches upstream API drift against live data.
"""
import os
from datetime import date

import pytest

from stocks.services.market_data.factory import get_provider
from stocks.services.market_data.contracts import PriceRecord

pytestmark = pytest.mark.skipif(
    os.getenv("RUN_NEPSE_LIVE") != "1",
    reason="live API test; set RUN_NEPSE_LIVE=1 to run",
)


def test_live_company_list_maps_cleanly():
    prov = get_provider()
    companies = prov.fetch_company_list()
    assert len(companies) > 100  # NEPSE has hundreds of listings
    assert all(c.symbol for c in companies)


def test_live_prices_map_cleanly():
    prov = get_provider()
    prices = prov.fetch_daily_prices(date.today())
    assert prices and isinstance(prices[0], PriceRecord)
    assert all(p.close and p.close > 0 for p in prices)
