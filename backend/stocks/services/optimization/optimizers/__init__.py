from stocks.services.optimization.optimizers.equal_optimizer import EqualWeightOptimizer
from stocks.services.optimization.optimizers.pypfopt_optimizer import PyPfOptOptimizer
from stocks.services.optimization.optimizers.riskfolio_optimizer import (
    CDaROptimizer,
    CVaROptimizer,
    HRPOptimizer,
)
from stocks.services.optimization.optimizers.skfolio_optimizer import SkflioOptimizer

OPTIMIZER_REGISTRY: dict[str, object] = {
    "max_sharpe": PyPfOptOptimizer("max_sharpe"),
    "min_vol": PyPfOptOptimizer("min_vol"),
    "hrp": HRPOptimizer(),
    "cvar": CVaROptimizer(),
    "cdar": CDaROptimizer(),
    "equal": EqualWeightOptimizer(),
    "max_diversification": SkflioOptimizer("max_diversification"),
    "risk_parity": SkflioOptimizer("risk_parity"),
}

_DEFAULT_OPTIMIZER = SkflioOptimizer("fallback")
