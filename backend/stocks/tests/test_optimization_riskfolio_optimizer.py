import numpy as np
import pandas as pd
import pytest

try:
    import riskfolio as rp  # noqa: F401
    HAS_RISKFOLIO = True
except ImportError:
    HAS_RISKFOLIO = False

from stocks.services.optimization.base import IPortfolioOptimizer, OptimizationResult
from stocks.services.optimization.optimizers.riskfolio_optimizer import (
    CDaROptimizer,
    CVaROptimizer,
    HRPOptimizer,
)


def _synthetic_returns(n_assets=4, n_days=252):
    rng = np.random.default_rng(7)
    data = rng.normal(0.0005, 0.015, size=(n_days, n_assets))
    cols = [f"ASSET{i}" for i in range(n_assets)]
    return pd.DataFrame(data, columns=cols)


@pytest.mark.skipif(not HAS_RISKFOLIO, reason="riskfolio not installed")
def test_hrp_optimizer_satisfies_protocol():
    assert isinstance(HRPOptimizer(), IPortfolioOptimizer)


@pytest.mark.skipif(not HAS_RISKFOLIO, reason="riskfolio not installed")
def test_hrp_weights_sum_to_one():
    returns = _synthetic_returns()
    df_pivoted = returns.cumsum() + 100
    result = HRPOptimizer().optimize(returns, df_pivoted)
    assert isinstance(result, OptimizationResult)
    assert abs(sum(result.weight_map.values()) - 1.0) < 1e-6


@pytest.mark.skipif(not HAS_RISKFOLIO, reason="riskfolio not installed")
def test_cvar_optimizer_satisfies_protocol():
    assert isinstance(CVaROptimizer(), IPortfolioOptimizer)


@pytest.mark.skipif(not HAS_RISKFOLIO, reason="riskfolio not installed")
def test_cvar_weights_sum_to_one():
    returns = _synthetic_returns()
    df_pivoted = returns.cumsum() + 100
    result = CVaROptimizer().optimize(returns, df_pivoted)
    assert abs(sum(result.weight_map.values()) - 1.0) < 1e-6


@pytest.mark.skipif(not HAS_RISKFOLIO, reason="riskfolio not installed")
def test_cdar_weights_sum_to_one():
    returns = _synthetic_returns()
    df_pivoted = returns.cumsum() + 100
    result = CDaROptimizer().optimize(returns, df_pivoted)
    assert abs(sum(result.weight_map.values()) - 1.0) < 1e-6


def test_hrp_methods_empty_when_not_installed():
    if HAS_RISKFOLIO:
        pytest.skip("riskfolio is installed")
    assert HRPOptimizer().methods == ()
