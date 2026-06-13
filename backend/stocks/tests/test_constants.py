# backend/stocks/tests/test_constants.py
import pytest


def test_constant_values():
    from stocks.constants import (
        ANNUAL_TRADING_DAYS,
        RISK_FREE_RATE_ANNUAL,
        WITHHOLDING_TAX_RATE,
        FACE_VALUE_PER_SHARE,
        GRAHAM_NUMBER_MULTIPLIER,
        OPTIMIZATION_HISTORY_DAYS,
        MIN_OPTIMIZATION_DAYS,
        DYNAMIC_MAX_WEIGHT_SCALE,
        MIN_DYNAMIC_MAX_WEIGHT,
        MAX_DYNAMIC_MAX_WEIGHT,
        ANNUAL_REPORTS_FETCH_COUNT,
    )
    assert ANNUAL_TRADING_DAYS == 252
    assert RISK_FREE_RATE_ANNUAL == 0.06
    assert WITHHOLDING_TAX_RATE == 0.05
    assert FACE_VALUE_PER_SHARE == 100
    assert GRAHAM_NUMBER_MULTIPLIER == 22.5
    assert OPTIMIZATION_HISTORY_DAYS == 730
    assert MIN_OPTIMIZATION_DAYS == 20
    assert DYNAMIC_MAX_WEIGHT_SCALE == 1.3
    assert MIN_DYNAMIC_MAX_WEIGHT == 0.6
    assert MAX_DYNAMIC_MAX_WEIGHT == 0.95
    assert ANNUAL_REPORTS_FETCH_COUNT == 5


def test_constant_types():
    from stocks.constants import (
        ANNUAL_TRADING_DAYS,
        FACE_VALUE_PER_SHARE,
        ANNUAL_REPORTS_FETCH_COUNT,
        MIN_OPTIMIZATION_DAYS,
        OPTIMIZATION_HISTORY_DAYS,
        RISK_FREE_RATE_ANNUAL,
        WITHHOLDING_TAX_RATE,
        GRAHAM_NUMBER_MULTIPLIER,
        DYNAMIC_MAX_WEIGHT_SCALE,
        MIN_DYNAMIC_MAX_WEIGHT,
        MAX_DYNAMIC_MAX_WEIGHT,
    )
    assert isinstance(ANNUAL_TRADING_DAYS, int)
    assert isinstance(FACE_VALUE_PER_SHARE, int)
    assert isinstance(ANNUAL_REPORTS_FETCH_COUNT, int)
    assert isinstance(MIN_OPTIMIZATION_DAYS, int)
    assert isinstance(OPTIMIZATION_HISTORY_DAYS, int)
    assert isinstance(RISK_FREE_RATE_ANNUAL, float)
    assert isinstance(WITHHOLDING_TAX_RATE, float)
    assert isinstance(GRAHAM_NUMBER_MULTIPLIER, float)
    assert isinstance(DYNAMIC_MAX_WEIGHT_SCALE, float)
    assert isinstance(MIN_DYNAMIC_MAX_WEIGHT, float)
    assert isinstance(MAX_DYNAMIC_MAX_WEIGHT, float)


def test_profit_factor_default_value():
    from stocks.constants import PROFIT_FACTOR_DEFAULT
    assert PROFIT_FACTOR_DEFAULT == 999.0
    assert isinstance(PROFIT_FACTOR_DEFAULT, float)
