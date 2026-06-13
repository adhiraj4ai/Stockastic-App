from __future__ import annotations

import numpy as np
import pandas as pd

from stocks.services.optimization.base import OptimizationResult

try:
    import riskfolio as rp
    _AVAILABLE = True
except ImportError:
    _AVAILABLE = False


def _compute_metrics(returns: pd.DataFrame, weight_map: dict[str, float]) -> dict[str, float]:
    mu = returns.mean() * 252
    cov = returns.cov() * 252
    w = np.array([weight_map[t] for t in returns.columns])
    exp_ret = float(np.dot(w, mu))
    vol = float(np.sqrt(w @ cov.to_numpy() @ w))
    sharpe = exp_ret / vol if vol > 0 else 0.0
    return {"expected_return": exp_ret, "volatility": vol, "sharpe_ratio": sharpe, "max_drawdown": 0.0}


class HRPOptimizer:
    methods: tuple[str, ...] = ("hrp",) if _AVAILABLE else ()

    def optimize(self, returns: pd.DataFrame, df_pivoted: pd.DataFrame) -> OptimizationResult:
        port = rp.HCPortfolio(returns=returns)
        w = port.optimization(model="HRP", codependence="pearson", rm="MV", rf=0, link="single", leaf_order=True)
        weight_map = w.to_dict()["weights"]
        return OptimizationResult(
            weight_map=weight_map,
            metrics=_compute_metrics(returns, weight_map),
            note="Optimized via Riskfolio-Lib (HRP)",
        )


class CVaROptimizer:
    methods: tuple[str, ...] = ("cvar",) if _AVAILABLE else ()

    def optimize(self, returns: pd.DataFrame, df_pivoted: pd.DataFrame) -> OptimizationResult:
        port = rp.Portfolio(returns=returns)
        port.assets_stats(method_mu="hist", method_cov="hist")
        w = port.optimization(model="Classic", rm="CVaR", obj="MinRisk", rf=0, l=0, hist=True)
        weight_map = w.to_dict()["weights"]
        return OptimizationResult(
            weight_map=weight_map,
            metrics=_compute_metrics(returns, weight_map),
            note="Optimized via Riskfolio-Lib (Min CVaR)",
        )


class CDaROptimizer:
    methods: tuple[str, ...] = ("cdar",) if _AVAILABLE else ()

    def optimize(self, returns: pd.DataFrame, df_pivoted: pd.DataFrame) -> OptimizationResult:
        port = rp.Portfolio(returns=returns)
        port.assets_stats(method_mu="hist", method_cov="hist")
        w = port.optimization(model="Classic", rm="CDaR", obj="MinRisk", rf=0, l=0, hist=True)
        weight_map = w.to_dict()["weights"]
        return OptimizationResult(
            weight_map=weight_map,
            metrics=_compute_metrics(returns, weight_map),
            note="Optimized via Riskfolio-Lib (Min CDaR)",
        )
