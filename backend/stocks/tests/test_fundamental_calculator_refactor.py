"""Tests for extracted helpers in fundamental_calculator.py (Phase 4 Task 5).

Each test covers exactly one extracted helper: correct return type and graceful
handling of the empty / edge-case input. All ORM calls are mocked.
"""
from decimal import Decimal
from unittest.mock import MagicMock, patch

import pytest

from stocks.services.fundamental_calculator import (
    _fetch_annual_reports,
    _fetch_price_series,
    _compute_aligned_returns,
    _beta_for_window,
    _compute_betas,
    _apply_quarterly_net_margin,
    _resolve_latest_dividend,
    _apply_trends_and_betas,
)


# ---------------------------------------------------------------------------
# _fetch_annual_reports
# ---------------------------------------------------------------------------

@patch('stocks.services.fundamental_calculator.FinancialReport')
def test_fetch_annual_reports_empty(mock_fr):
    mock_fr.objects.filter.return_value.order_by.return_value.__getitem__.return_value = []
    mock_fr.objects.filter.return_value.order_by.return_value.__len__ = lambda s: 0
    # Simulate empty queryset via list()
    mock_fr.objects.filter.return_value.order_by.return_value.__iter__ = lambda s: iter([])
    annuals, latest, previous = _fetch_annual_reports('NONEXIST')
    assert annuals == []
    assert latest is None
    assert previous is None


@patch('stocks.services.fundamental_calculator.FinancialReport')
def test_fetch_annual_reports_single(mock_fr):
    report = MagicMock()
    mock_fr.ReportType.ANNUAL = 'ANNUAL'
    qs = MagicMock()
    qs.__iter__ = lambda s: iter([report])
    mock_fr.objects.filter.return_value.order_by.return_value.__getitem__ = lambda s, k: [report]
    with patch('stocks.services.fundamental_calculator.FinancialReport.objects') as mock_objs:
        mock_objs.filter.return_value.order_by.return_value.__getitem__ = lambda s, k: [report]
        mock_objs.filter.return_value.order_by.return_value.__iter__ = lambda s: iter([report])
        import stocks.services.fundamental_calculator as fc
        fc.FinancialReport = mock_fr
        mock_fr.objects.filter.return_value.order_by.return_value.__getitem__ = MagicMock(return_value=[report])
        # Direct: list() call on sliced queryset
        with patch('builtins.list', side_effect=lambda x: [report]):
            annuals, latest, prev = _fetch_annual_reports('MERO')
        assert latest is report
        assert prev is None


# ---------------------------------------------------------------------------
# _fetch_price_series
# ---------------------------------------------------------------------------

@patch('stocks.services.fundamental_calculator.DailyStockPrice')
@patch('stocks.services.fundamental_calculator.DailyIndexValue')
def test_fetch_price_series_returns_two_lists(mock_idx, mock_stock):
    mock_idx.objects.filter.return_value.order_by.return_value.values_list.return_value.__getitem__ = MagicMock(return_value=[])
    mock_stock.objects.filter.return_value.order_by.return_value.values_list.return_value.__getitem__ = MagicMock(return_value=[])
    with patch('builtins.list', side_effect=lambda x: []):
        index_rows, stock_rows = _fetch_price_series('NABIL', 756)
    assert isinstance(index_rows, list)
    assert isinstance(stock_rows, list)


# ---------------------------------------------------------------------------
# _compute_aligned_returns
# ---------------------------------------------------------------------------

def test_compute_aligned_returns_empty_input():
    stock_returns, index_returns = _compute_aligned_returns([], [])
    assert stock_returns == []
    assert index_returns == []


def test_compute_aligned_returns_single_common_date():
    """Two rows share one date — can't compute a return (need at least 2 dates)."""
    from datetime import date
    d = date(2024, 1, 2)
    index_rows = [(d, 100.0)]
    stock_rows = [(d, 50.0)]
    s_ret, i_ret = _compute_aligned_returns(index_rows, stock_rows)
    assert s_ret == []
    assert i_ret == []


def test_compute_aligned_returns_two_dates():
    from datetime import date
    d1, d2 = date(2024, 1, 2), date(2024, 1, 3)
    index_rows = [(d1, 1000.0), (d2, 1010.0)]
    stock_rows = [(d1, 200.0), (d2, 202.0)]
    s_ret, i_ret = _compute_aligned_returns(index_rows, stock_rows)
    assert len(s_ret) == 1
    assert len(i_ret) == 1
    assert abs(s_ret[0] - 0.01) < 1e-9
    assert abs(i_ret[0] - 0.01) < 1e-9


# ---------------------------------------------------------------------------
# _beta_for_window
# ---------------------------------------------------------------------------

def test_beta_for_window_insufficient_data_returns_none():
    result = _beta_for_window([0.01, 0.02], [0.01, 0.02], window=10)
    assert result is None


def test_beta_for_window_zero_variance_returns_none():
    returns = [0.01] * 70
    result = _beta_for_window(returns, returns, window=63)
    # var_i == 0 when stock == index (constant return), but actually var_i will be
    # non-zero in that degenerate case; the real zero-var case is all identical index returns
    index_flat = [0.0] * 70
    result2 = _beta_for_window(returns, index_flat, window=63)
    assert result2 is None


def test_beta_for_window_beta_one_when_perfectly_correlated():
    """When stock return == index return, beta should be ~1.0."""
    n = 70
    returns = [0.005 * (i % 3 - 1) for i in range(n)]  # varied but identical
    result = _beta_for_window(returns, returns, window=63)
    assert result is not None
    assert abs(float(result) - 1.0) < 0.01


# ---------------------------------------------------------------------------
# _compute_betas
# ---------------------------------------------------------------------------

@patch('stocks.services.fundamental_calculator._fetch_price_series')
def test_compute_betas_no_index_rows_returns_nulls(mock_fetch):
    mock_fetch.return_value = ([], [])
    result = _compute_betas('NIMB')
    assert result == {'beta_3m': None, 'beta_1y': None, 'beta_3y': None}


@patch('stocks.services.fundamental_calculator._fetch_price_series')
def test_compute_betas_returns_dict_keys(mock_fetch):
    mock_fetch.return_value = ([], [('2024-01-01', 100)])
    result = _compute_betas('NIMB')
    assert set(result.keys()) == {'beta_3m', 'beta_1y', 'beta_3y'}


# ---------------------------------------------------------------------------
# _apply_quarterly_net_margin
# ---------------------------------------------------------------------------

def test_apply_quarterly_net_margin_no_quarterlies():
    fundamental = MagicMock()
    _apply_quarterly_net_margin(fundamental, [])
    assert fundamental.net_margin_quarterly is None


def test_apply_quarterly_net_margin_missing_revenue():
    """If q_revenue is 0/None, net_margin_quarterly stays None."""
    q = MagicMock()
    q.profit_loss = {}
    q.net_profit = None
    q.revenue = None
    fundamental = MagicMock()
    with patch('stocks.services.fundamental_calculator._flatten', return_value={}):
        with patch('stocks.services.fundamental_calculator._num', return_value=None):
            _apply_quarterly_net_margin(fundamental, [q])
    assert fundamental.net_margin_quarterly is None


# ---------------------------------------------------------------------------
# _resolve_latest_dividend
# ---------------------------------------------------------------------------

@patch('stocks.services.fundamental_calculator.Dividend')
@patch('stocks.services.fundamental_calculator.FinancialReport')
def test_resolve_latest_dividend_no_data_returns_none_tuple(mock_fr, mock_div):
    mock_fr.objects.filter.return_value.order_by.return_value.first.return_value = None
    mock_div.objects.filter.return_value = []
    with patch('builtins.list', return_value=[]):
        cash, bonus = _resolve_latest_dividend('NABIL')
    assert cash is None
    assert bonus is None


# ---------------------------------------------------------------------------
# _apply_trends_and_betas
# ---------------------------------------------------------------------------

@patch('stocks.services.fundamental_calculator._compute_betas')
@patch('stocks.services.fundamental_calculator._trend')
def test_apply_trends_and_betas_sets_all_fields(mock_trend, mock_betas):
    mock_trend.side_effect = ['Positive', 'Negative']
    mock_betas.return_value = {'beta_3m': Decimal('0.90'), 'beta_1y': Decimal('1.10'), 'beta_3y': Decimal('1.05')}
    fundamental = MagicMock()
    fundamental.ro_equity = Decimal('15.00')
    _apply_trends_and_betas(fundamental, 'NABIL', 12.0, 10.0, 14.0)
    assert fundamental.beta_3m == Decimal('0.90')
    assert fundamental.beta_1y == Decimal('1.10')
    assert fundamental.beta_3y == Decimal('1.05')
    assert fundamental.eps_trend == 'Positive'
    assert fundamental.roe_trend == 'Negative'
