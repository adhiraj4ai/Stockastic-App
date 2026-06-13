from __future__ import annotations

import numpy as np
import pandas as pd

from stocks.services.optimization.base import OptimizationResult

_NOTE = "Equal Weighted (1/N) Baseline Strategy"


class EqualWeightOptimizer:
    methods: tuple[str, ...] = ("equal",)

    def optimize(
        self, returns: pd.DataFrame, df_pivoted: pd.DataFrame
    ) -> OptimizationResult:
        n = len(returns.columns)
        weight_map = {t: 1.0 / n for t in returns.columns}
        metrics = _compute_metrics(returns, np.full(n, 1.0 / n))
        return OptimizationResult(weight_map=weight_map, metrics=metrics, note=_NOTE)


def _compute_metrics(returns: pd.DataFrame, weights: np.ndarray) -> dict[str, float]:
    mu = (returns.mean() * 252).to_numpy()
    cov = (returns.cov() * 252).to_numpy()
    exp_ret = float(np.dot(weights, mu))
    vol = float(np.sqrt(weights @ cov @ weights))
    sharpe = exp_ret / vol if vol > 0 else 0.0
    return {
        "expected_return": exp_ret,
        "volatility": vol,
        "sharpe_ratio": sharpe,
        "max_drawdown": 0.0,
    }
