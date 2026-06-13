import datetime
import pytest
from unittest.mock import patch, MagicMock


def test_fetch_latest_date_returns_none_when_no_data():
    from stocks.services.market_summary_service import fetch_latest_date

    with patch('stocks.services.market_summary_service.DailyStockPrice') as MockPrice:
        MockPrice.objects.values.return_value.annotate.return_value \
            .filter.return_value.order_by.return_value.first.return_value = None
        result = fetch_latest_date()

    assert result is None


def test_fetch_latest_date_returns_date_when_data_present():
    from stocks.services.market_summary_service import fetch_latest_date

    expected = datetime.date(2026, 6, 13)

    with patch('stocks.services.market_summary_service.DailyStockPrice') as MockPrice:
        MockPrice.objects.values.return_value.annotate.return_value \
            .filter.return_value.order_by.return_value.first.return_value = {'date': expected}
        result = fetch_latest_date()

    assert result == expected


def test_resolve_ref_date_returns_none_for_daily():
    from stocks.services.market_summary_service import resolve_ref_date
    result = resolve_ref_date('daily', datetime.date(2026, 6, 13))
    assert result is None


def test_aggregate_sectors_groups_by_sector():
    from stocks.services.market_summary_service import aggregate_sectors

    p1 = MagicMock()
    p1.ticker = 'ADBL'
    p1.volume = 10000
    p1.turnover = 2500000

    p2 = MagicMock()
    p2.ticker = 'NABIL'
    p2.volume = 5000
    p2.turnover = 5000000

    sector_map = {'ADBL': 'Commercial Banks', 'NABIL': 'Commercial Banks'}
    result = aggregate_sectors([p1, p2], sector_map)

    assert 'Commercial Banks' in result
    assert result['Commercial Banks']['count'] == 2
    assert result['Commercial Banks']['volume'] == 15000
