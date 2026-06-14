"""Regression: broker_trends must not divide by zero on flat brokers.

A broker whose cumulative_net is exactly 0 (very common — 41 such rows existed
for CFCL) must not blow up the trend query. The change_Nd columns divide the
recent net by ABS(cumulative_net); the divisor has to be NULL-guarded against 0,
otherwise Postgres raises "division by zero" and the whole endpoint fails.

These tests execute the real SQL (not a mocked _exec) so the guard is verified
end to end. The existing broker_research tests mock _exec and cannot catch this.
"""
import datetime

import pytest

from stocks.models.market import Company, DailyCumulativeAccumulation
from stocks.services.broker_research import broker_trends

SYMBOL = "ZERODIV"


@pytest.fixture
def flat_broker(db):
    """An active company with a single broker sitting flat (cumulative_net = 0)."""
    Company.objects.create(
        symbol=SYMBOL,
        name="Zero Division Test Co",
        status="A",
        sector="Commercial Banks",
        instrument_type="Equity Shares",
    )
    DailyCumulativeAccumulation.objects.create(
        symbol=SYMBOL,
        transaction_date=datetime.date(2024, 1, 10),
        entity_id="99",
        cumulative_buy=100,
        cumulative_buy_amount=5000,
        cumulative_net=0,
    )


def test_broker_trends_survives_zero_cumulative_net(flat_broker):
    rows = broker_trends(symbol=SYMBOL, range_key="2W")

    assert isinstance(rows, list)
    flat = next(r for r in rows if r["broker"] == "99")
    # With no recent activity the accumulation share is undefined, not an error.
    assert flat["change_5d"] is None
