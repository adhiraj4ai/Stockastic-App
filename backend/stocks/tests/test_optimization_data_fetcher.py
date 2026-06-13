from datetime import date
from unittest.mock import patch

import pandas as pd
import pytest

from stocks.services.optimization.data_fetcher import fetch_price_data


def _make_qs_data(n_days: int, tickers=("NABIL", "HBL")) -> list[dict]:
    rows = []
    for i in range(n_days):
        for j, t in enumerate(tickers):
            rows.append({"ticker": t, "date": date(2025, 1, 1 + (i % 27)), "close": 100.0 + i + j})
    return rows


@patch("stocks.services.optimization.data_fetcher.DailyStockPrice")
def test_returns_pivoted_dataframe(MockModel):
    data = _make_qs_data(30)
    MockModel.objects.filter.return_value.values.return_value = data
    result = fetch_price_data(["NABIL", "HBL"])
    assert result is not None
    assert isinstance(result, pd.DataFrame)
    assert set(result.columns).issuperset({"NABIL", "HBL"})


@patch("stocks.services.optimization.data_fetcher.DailyStockPrice")
def test_returns_none_when_empty(MockModel):
    MockModel.objects.filter.return_value.values.return_value = []
    result = fetch_price_data(["NABIL"])
    assert result is None


@patch("stocks.services.optimization.data_fetcher.DailyStockPrice")
def test_returns_none_when_fewer_than_min_days(MockModel):
    data = _make_qs_data(5)
    MockModel.objects.filter.return_value.values.return_value = data
    result = fetch_price_data(["NABIL", "HBL"])
    assert result is None


@patch("stocks.services.optimization.data_fetcher.DailyStockPrice")
def test_close_column_is_float(MockModel):
    data = _make_qs_data(30)
    MockModel.objects.filter.return_value.values.return_value = data
    result = fetch_price_data(["NABIL", "HBL"])
    assert result is not None
    assert result.dtypes.iloc[0] == float
