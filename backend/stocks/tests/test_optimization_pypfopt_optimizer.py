import numpy as np
import pandas as pd
import pytest

try:
    from pypfopt import EfficientFrontier  # noqa: F401
    HAS_PYPFOPT = True
except ImportError:
    HAS_PYPFOPT = False

from stocks.services.optimization.base import IPortfolioOptimizer, OptimizationResult
from stocks.services.optimization.optimizers.pypfopt_optimizer import PyPfOptOptimizer


def _synthetic_pivoted(n_assets=3, n_days=252):
    rng = np.random.default_rng(0)
    prices = np.cumprod(1 + rng.normal(0.0005, 0.015, size=(n_days, n_assets)), axis=0) * 100
    cols = [f"ASSET{i}" for i in range(n_assets)]
    return pd.DataFrame(prices, columns=cols)


@pytest.mark.skipif(not HAS_PYPFOPT, reason="pypfopt not installed")
def test_pypfopt_optimizer_satisfies_protocol():
    assert isinstance(PyPfOptOptimizer("max_sharpe"), IPortfolioOptimizer)


@pytest.mark.skipif(not HAS_PYPFOPT, reason="pypfopt not installed")
def test_max_sharpe_weights_sum_to_one():
    df_pivoted = _synthetic_pivoted()
    returns = df_pivoted.pct_change().dropna()
    result = PyPfOptOptimizer("max_sharpe").optimize(returns, df_pivoted)
    assert isinstance(result, OptimizationResult)
    assert abs(sum(result.weight_map.values()) - 1.0) < 1e-6


@pytest.mark.skipif(not HAS_PYPFOPT, reason="pypfopt not installed")
def test_min_vol_weights_sum_to_one():
    df_pivoted = _synthetic_pivoted()
    returns = df_pivoted.pct_change().dropna()
    result = PyPfOptOptimizer("min_vol").optimize(returns, df_pivoted)
    assert abs(sum(result.weight_map.values()) - 1.0) < 1e-6


@pytest.mark.skipif(not HAS_PYPFOPT, reason="pypfopt not installed")
def test_metrics_keys_present():
    df_pivoted = _synthetic_pivoted()
    returns = df_pivoted.pct_change().dropna()
    result = PyPfOptOptimizer("max_sharpe").optimize(returns, df_pivoted)
    for key in ("expected_return", "volatility", "sharpe_ratio", "max_drawdown"):
        assert key in result.metrics


def test_methods_empty_when_not_installed():
    if HAS_PYPFOPT:
        pytest.skip("pypfopt is installed; skip unavailability test")
    opt = PyPfOptOptimizer("max_sharpe")
    assert opt.methods == ()
