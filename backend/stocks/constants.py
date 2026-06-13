from __future__ import annotations

# Trading calendar
ANNUAL_TRADING_DAYS: int = 252

# Risk parameters
RISK_FREE_RATE_ANNUAL: float = 0.06

# Dividend / share structure
WITHHOLDING_TAX_RATE: float = 0.05
FACE_VALUE_PER_SHARE: int = 100

# Fundamental analysis
GRAHAM_NUMBER_MULTIPLIER: float = 22.5
ANNUAL_REPORTS_FETCH_COUNT: int = 5

# Portfolio optimisation
OPTIMIZATION_HISTORY_DAYS: int = 730
MIN_OPTIMIZATION_DAYS: int = 20
DYNAMIC_MAX_WEIGHT_SCALE: float = 1.3
MIN_DYNAMIC_MAX_WEIGHT: float = 0.6
MAX_DYNAMIC_MAX_WEIGHT: float = 0.95

# NEPSE benchmark
NEPSE_TICKER: str = "NEPSE"
NEPSE_PAR_VALUE: int = 100
DIVIDEND_TAX_RATE: float = 0.05

# Portfolio metrics periods (days)
PERIOD_DAYS: dict[str, int] = {
    "1M": 30,
    "3M": 90,
    "6M": 180,
    "1Y": 365,
}

# Minimum observations for risk calculations
MIN_RISK_OBSERVATIONS: int = 2
