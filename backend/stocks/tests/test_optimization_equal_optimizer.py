import numpy as np
import pandas as pd
import pytest

from stocks.services.optimization.base import IPortfolioOptimizer, OptimizationResult
from stocks.services.optimization.optimizers.equal_optimizer import EqualWeightOptimizer


def _synthetic_returns(n_assets=3, n_days=60):
    rng = np.random.default_rng(42)
    data = rng.normal(0.001, 0.02, size=(n_days, n_assets))
    cols = [f"ASSET{i}" for i in range(n_assets)]
    return pd.DataFrame(data, columns=cols)


def test_equal_optimizer_satisfies_protocol():
    assert isinstance(EqualWeightOptimizer(), IPortfolioOptimizer)


def test_equal_optimizer_methods_tuple():
    assert EqualWeightOptimizer().methods == ("equal",)


def test_equal_weights_sum_to_one():
    returns = _synthetic_returns()
    df_pivoted = returns.cumsum() + 100
    result = EqualWeightOptimizer().optimize(returns, df_pivoted)
    assert isinstance(result, OptimizationResult)
    total = sum(result.weight_map.values())
    assert abs(total - 1.0) < 1e-9


def test_equal_weights_are_uniform():
    returns = _synthetic_returns(n_assets=4)
    df_pivoted = returns.cumsum() + 100
    result = EqualWeightOptimizer().optimize(returns, df_pivoted)
    weights = list(result.weight_map.values())
    assert all(abs(w - weights[0]) < 1e-9 for w in weights)


def test_metrics_keys_present():
    returns = _synthetic_returns()
    df_pivoted = returns.cumsum() + 100
    result = EqualWeightOptimizer().optimize(returns, df_pivoted)
    for key in ("expected_return", "volatility", "sharpe_ratio", "max_drawdown"):
        assert key in result.metrics
