from unittest.mock import patch, MagicMock
from datetime import date

import numpy as np
import pandas as pd
import pytest

from stocks.services.optimization import perform_portfolio_optimization
from stocks.services.optimization.optimizers import OPTIMIZER_REGISTRY, _DEFAULT_OPTIMIZER


class _BrokenOptimizer:
    methods = ("equal",)

    def optimize(self, returns, df_pivoted):
        raise RuntimeError("deliberate test failure")


def _make_qs_data(tickers=("NABIL", "HBL"), n_days=60):
    rows = []
    for i in range(n_days):
        d = date(2024, 1, 1 + (i % 27))
        for j, t in enumerate(tickers):
            rows.append({"ticker": t, "date": d, "close": 1000.0 + i * 0.5 + j * 10})
    return rows


@patch("stocks.services.optimization.data_fetcher.DailyStockPrice")
def test_equal_weight_returns_success(MockModel):
    MockModel.objects.filter.return_value.values.return_value = _make_qs_data()
    result = perform_portfolio_optimization(["NABIL", "HBL"], method="equal")
    assert result.get("success") is True
    assert "weights" in result
    assert "trades" in result


def test_empty_tickers_returns_error():
    result = perform_portfolio_optimization([])
    assert "error" in result


@patch("stocks.services.optimization.single_stock.DailyStockPrice")
def test_single_ticker_returns_success(MockModel):
    m = MagicMock()
    m.close = 1200.0
    MockModel.objects.filter.return_value.order_by.return_value.first.return_value = m
    result = perform_portfolio_optimization(["NABIL"])
    assert result.get("success") is True
    assert result["weights"] == {"NABIL": 1.0}


@patch("stocks.services.optimization.data_fetcher.DailyStockPrice")
def test_no_data_returns_error(MockModel):
    MockModel.objects.filter.return_value.values.return_value = []
    result = perform_portfolio_optimization(["NABIL", "HBL"])
    assert "error" in result


def test_registry_contains_all_expected_methods():
    expected = {"max_sharpe", "min_vol", "hrp", "cvar", "cdar", "equal", "max_diversification", "risk_parity"}
    assert expected == set(OPTIMIZER_REGISTRY.keys())


def test_default_optimizer_is_skfolio_fallback():
    from stocks.services.optimization.optimizers.skfolio_optimizer import SkflioOptimizer
    assert isinstance(_DEFAULT_OPTIMIZER, SkflioOptimizer)


@patch("stocks.services.optimization.data_fetcher.DailyStockPrice")
def test_optimizer_exception_returns_error(MockModel):
    MockModel.objects.filter.return_value.values.return_value = _make_qs_data()
    with patch("stocks.services.optimization.OPTIMIZER_REGISTRY", {"equal": _BrokenOptimizer()}):
        result = perform_portfolio_optimization(["NABIL", "HBL"], method="equal")
    assert "error" in result
    assert "Optimization failed" in result["error"]
