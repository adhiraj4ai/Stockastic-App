from __future__ import annotations

import pandas as pd

from stocks.services.optimization.base import OptimizationResult

try:
    from pypfopt import EfficientFrontier, expected_returns, objective_functions, risk_models
    _AVAILABLE = True
except ImportError:
    _AVAILABLE = False

_METHOD_NOTES = {
    "max_sharpe": "Optimized via PyPortfolioOpt (Max Sharpe)",
    "min_vol": "Optimized via PyPortfolioOpt (Min Volatility)",
}


class PyPfOptOptimizer:
    def __init__(self, method: str) -> None:
        self._method = method

    @property
    def methods(self) -> tuple[str, ...]:
        return ("max_sharpe", "min_vol") if _AVAILABLE else ()

    def optimize(
        self, returns: pd.DataFrame, df_pivoted: pd.DataFrame
    ) -> OptimizationResult:
        mu = expected_returns.mean_historical_return(df_pivoted)
        S = risk_models.sample_cov(df_pivoted)
        ef = EfficientFrontier(mu, S)
        ef.add_constraint(objective_functions.L2_reg, gamma=0.1)
        _apply_objective(ef, self._method)
        weight_map = dict(ef.clean_weights())
        perf = ef.portfolio_performance(verbose=False)
        metrics = {
            "expected_return": perf[0],
            "volatility": perf[1],
            "sharpe_ratio": perf[2],
            "max_drawdown": 0.0,
        }
        return OptimizationResult(
            weight_map=weight_map,
            metrics=metrics,
            note=_METHOD_NOTES[self._method],
        )


def _apply_objective(ef: "EfficientFrontier", method: str) -> None:
    if method == "max_sharpe":
        ef.max_sharpe()
    else:
        ef.min_volatility()
