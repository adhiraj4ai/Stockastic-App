# backend/stocks/tests/test_universe.py
"""research_universe as-of delisting logic."""
import datetime as dt
from unittest import mock

from stocks.services import universe


def test_delisted_after_asof_is_included():
    # Symbol delisted 2025-06-01 is still researchable as of 2025-01-01.
    with mock.patch("stocks.models.Company") as Co, \
         mock.patch("stocks.models.DelistingRecord") as Del:
        Co.all_objects.exclude.return_value.values_list.return_value = ["AAA", "BBB"]
        Del.objects.filter.return_value.values_list.return_value = []
        result = universe.research_universe(as_of=dt.date(2025, 1, 1))
    assert result == {"AAA", "BBB"}


def test_delisted_before_asof_is_excluded():
    with mock.patch("stocks.models.Company") as Co, \
         mock.patch("stocks.models.DelistingRecord") as Del:
        Co.all_objects.exclude.return_value.values_list.return_value = ["AAA", "BBB"]
        Del.objects.filter.return_value.values_list.return_value = ["BBB"]
        result = universe.research_universe(as_of=dt.date(2025, 12, 31))
    assert result == {"AAA"}
