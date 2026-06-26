import numpy as np
import pytest
from stocks.services.risk import returns_metrics as rm


def test_beta_of_index_against_itself_is_one():
    idx = np.array([0.01, -0.02, 0.03, -0.01, 0.02])
    assert rm.beta(idx, idx) == pytest.approx(1.0)


def test_beta_doubles_when_stock_moves_twice_the_index():
    idx = np.array([0.01, -0.02, 0.03, -0.01, 0.02])
    stock = idx * 2
    assert rm.beta(stock, idx) == pytest.approx(2.0)


def test_beta_returns_none_when_index_has_no_variance():
    idx = np.array([0.0, 0.0, 0.0])
    stock = np.array([0.01, -0.01, 0.02])
    assert rm.beta(stock, idx) is None


def test_beta_returns_none_for_near_zero_index_variance():
    idx = np.array([1e-9, 1e-9, 1e-9])
    stock = np.array([0.01, -0.01, 0.02])
    assert rm.beta(stock, idx) is None


def test_beta_returns_none_for_too_few_points():
    assert rm.beta(np.array([0.01]), np.array([0.01])) is None


def test_correlation_matrix_identical_series_average_is_one():
    r = np.array([0.01, -0.02, 0.03, -0.01, 0.02])
    out = rm.correlation_matrix({"A": r, "B": r})
    assert out["tickers"] == ["A", "B"]
    assert out["average_correlation"] == pytest.approx(1.0)


def test_correlation_matrix_single_ticker_has_no_average():
    out = rm.correlation_matrix({"A": np.array([0.01, 0.02, 0.03])})
    assert out["average_correlation"] is None


def test_max_drawdown_captures_peak_to_trough():
    # +10%, then three -10% steps: peak at index 0 of curve, deep trough after
    returns = np.array([0.10, -0.10, -0.10, -0.10])
    dd = rm.max_drawdown(returns)
    assert dd < 0
    assert dd == pytest.approx(-0.271, abs=1e-3)


def test_max_drawdown_is_zero_for_monotonic_gains():
    returns = np.array([0.01, 0.02, 0.03])
    assert rm.max_drawdown(returns) == pytest.approx(0.0, abs=1e-9)


def test_max_drawdown_none_for_too_few_points():
    assert rm.max_drawdown(np.array([0.01])) is None


def test_historical_var_returns_positive_loss_at_95():
    returns = np.array([-0.10, -0.05, -0.02, 0.0, 0.01, 0.02, 0.03, 0.04, 0.05, 0.06])
    var = rm.historical_var(returns, confidence=0.95)
    assert var > 0
    assert var == pytest.approx(0.0775, abs=1e-3)


def test_historical_var_zero_when_no_losses_in_tail():
    returns = np.array([0.01, 0.02, 0.03, 0.04, 0.05])
    assert rm.historical_var(returns, confidence=0.95) == pytest.approx(0.0)


def test_parametric_var_positive_for_volatile_series():
    returns = np.array([-0.05, 0.04, -0.06, 0.05, -0.04, 0.03])
    assert rm.parametric_var(returns, confidence=0.95) > 0
