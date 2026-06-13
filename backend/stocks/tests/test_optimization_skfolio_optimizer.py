import numpy as np
import pandas as pd
import pytest

try:
    from skfolio import RiskMeasure  # noqa: F401
    HAS_SKFOLIO = True
except ImportError:
    HAS_SKFOLIO = False

from stocks.services.optimization.base import IPortfolioOptimizer, OptimizationResult
from stocks.services.optimization.optimizers.skfolio_optimizer import SkflioOptimizer


def _synthetic_returns(n_assets=3, n_days=252):
    rng = np.random.default_rng(3)
    data = rng.normal(0.0005, 0.015, size=(n_days, n_assets))
    cols = [f"ASSET{i}" for i in range(n_assets)]
    return pd.DataFrame(data, columns=cols)


@pytest.mark.skipif(not HAS_SKFOLIO, reason="skfolio not installed")
def test_skfolio_optimizer_satisfies_protocol():
    # IPortfolioOptimizer is @runtime_checkable, so isinstance performs a real structural check.
    assert isinstance(SkflioOptimizer("equal"), IPortfolioOptimizer)


@pytest.mark.skipif(not HAS_SKFOLIO, reason="skfolio not installed")
@pytest.mark.parametrize("method", ["max_diversification", "risk_parity", "fallback"])
def test_weights_sum_to_one(method):
    returns = _synthetic_returns()
    df_pivoted = returns.cumsum() + 100
    result = SkflioOptimizer(method).optimize(returns, df_pivoted)
    assert isinstance(result, OptimizationResult)
    assert abs(sum(result.weight_map.values()) - 1.0) < 1e-6


@pytest.mark.skipif(not HAS_SKFOLIO, reason="skfolio not installed")
def test_metrics_include_max_drawdown():
    returns = _synthetic_returns()
    df_pivoted = returns.cumsum() + 100
    result = SkflioOptimizer("fallback").optimize(returns, df_pivoted)
    assert "max_drawdown" in result.metrics


def test_methods_empty_when_not_installed():
    if HAS_SKFOLIO:
        pytest.skip("skfolio is installed")
    assert SkflioOptimizer("fallback").methods == ()
