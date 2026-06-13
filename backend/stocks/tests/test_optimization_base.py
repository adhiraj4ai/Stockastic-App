import pandas as pd
import pytest
from stocks.services.optimization.base import IPortfolioOptimizer, OptimizationResult


class MockOptimizer:
    methods = ("mock",)

    def optimize(self, returns: pd.DataFrame, df_pivoted: pd.DataFrame) -> OptimizationResult:
        return OptimizationResult(
            weight_map={"A": 1.0},
            metrics={"expected_return": 0.1, "volatility": 0.2, "sharpe_ratio": 0.5, "max_drawdown": 0.0},
            note="mock",
        )


def test_optimization_result_is_dataclass():
    result = OptimizationResult(
        weight_map={"A": 0.5, "B": 0.5},
        metrics={"expected_return": 0.1, "volatility": 0.15, "sharpe_ratio": 0.67, "max_drawdown": 0.05},
        note="test",
    )
    assert result.weight_map == {"A": 0.5, "B": 0.5}
    assert result.note == "test"


def test_mock_optimizer_satisfies_protocol():
    optimizer = MockOptimizer()
    assert isinstance(optimizer, IPortfolioOptimizer)


def test_protocol_requires_methods_attribute():
    class BadOptimizer:
        def optimize(self, returns, df_pivoted):
            return None

    assert not isinstance(BadOptimizer(), IPortfolioOptimizer)


def test_protocol_requires_optimize_method():
    class BadOptimizer:
        methods = ("x",)

    assert not isinstance(BadOptimizer(), IPortfolioOptimizer)
