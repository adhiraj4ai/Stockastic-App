from __future__ import annotations

import pandas as pd

from stocks.services.optimization.base import OptimizationResult

try:
    from skfolio import RiskMeasure
    from skfolio.optimization import (
        MaximumDiversification,
        MeanRisk,
        ObjectiveFunction,
        RiskBudgeting,
    )
    _AVAILABLE = True
except ImportError:
    _AVAILABLE = False

_NOTES = {
    "max_diversification": "Optimized via Skfolio (Max Diversification)",
    "risk_parity": "Optimized via Skfolio (Risk Parity)",
    "fallback": "Optimized via Skfolio (Max Sharpe Fallback)",
}

_MIN_MAX_WEIGHT = 0.6
_MAX_MAX_WEIGHT = 0.95
_WEIGHT_SCALE = 1.3


class SkflioOptimizer:
    def __init__(self, method: str) -> None:
        self._method = method

    @property
    def methods(self) -> tuple[str, ...]:
        return ("max_diversification", "risk_parity", "fallback") if _AVAILABLE else ()

    def optimize(
        self, returns: pd.DataFrame, df_pivoted: pd.DataFrame
    ) -> OptimizationResult:
        max_weight = _dynamic_max_weight(len(returns.columns))
        model = _build_model(self._method, max_weight)
        model.fit(returns)
        weight_map = dict(zip(returns.columns, model.weights_))
        pred = model.predict(returns)
        metrics = {
            "expected_return": float(pred.annualized_mean),
            "volatility": float(pred.annualized_standard_deviation),
            "sharpe_ratio": float(pred.annualized_sharpe_ratio),
            "max_drawdown": float(pred.max_drawdown),
        }
        return OptimizationResult(
            weight_map=weight_map,
            metrics=metrics,
            note=_NOTES.get(self._method, _NOTES["fallback"]),
        )


def _dynamic_max_weight(n_assets: int) -> float:
    return max(_MIN_MAX_WEIGHT, min(_MAX_MAX_WEIGHT, _WEIGHT_SCALE / n_assets))


def _build_model(method: str, max_weight: float):
    if method == "max_diversification":
        return MaximumDiversification(max_weights=max_weight)
    if method == "risk_parity":
        return RiskBudgeting(risk_measure=RiskMeasure.VARIANCE, max_weights=max_weight)
    if method == "fallback":
        return MeanRisk(
            risk_measure=RiskMeasure.VARIANCE,
            objective_function=ObjectiveFunction.MAXIMIZE_RATIO,
            max_weights=max_weight,
        )
    raise ValueError(f"Unknown skfolio optimization method: {method!r}")
