import numpy as np
import pandas as pd
import pytest

from stocks.models import DailyCumulativeAccumulation
from stocks.models.market import DailyStockPrice
from stocks.services.accumulation.calibration import (
    LOW_SENTINEL, build_accumulation_code, calibrate, decide_validation_state,
    in_sample_median_sortino, ACCUMULATION_STRATEGY_NAME)
from stocks.services.optimization_service import OptimizationService

CAL_BARS = 120
CAL_SYMBOL = "CAL"
DISTRIBUTION_START = 90
NUM_BROKERS = 6


def test_build_code_emits_optimizable_ranges():
    code = build_accumulation_code({"top_n": 5, "entry_threshold": 70})
    ranges = OptimizationService.extract_param_ranges(code)
    assert "entry_threshold" in ranges
    assert "w_concentration" in ranges
    assert ranges["entry_threshold"] == [40, 90]


def test_build_code_references_symbol_and_alpha():
    code = build_accumulation_code({})
    assert "AccumulationStrength" in code
    assert "symbol=symbol" in code  # symbol injected by strategy exec scope


class _Card:
    def __init__(self, passed):
        self.passed = passed


def test_validation_state_maps_scorecard():
    assert decide_validation_state(_Card(True)) == "validated"
    assert decide_validation_state(_Card(False)) == "research"


def _seed_prices(symbol):
    """120 bars: long coiling base then a gentle uptrend so the alpha can breakout."""
    idx = pd.date_range("2021-01-01", periods=CAL_BARS, freq="D")
    base = np.full(CAL_BARS - 20, 100.0)
    trend = np.linspace(101, 160, 20)
    closes = np.concatenate([base, trend])
    for d, c in zip(idx, closes):
        DailyStockPrice.objects.create(
            ticker=symbol, date=d.date(), open=c, high=c * 1.01,
            low=c * 0.99, close=c, volume=100_000)


def _seed_brokers(symbol):
    """Rising broker net across all bars and brokers, dipping after distribution start."""
    idx = pd.date_range("2021-01-01", periods=CAL_BARS, freq="D")
    for eid in range(NUM_BROKERS):
        for i, d in enumerate(idx):
            net = i + 1 if i < DISTRIBUTION_START else DISTRIBUTION_START - (i - DISTRIBUTION_START)
            DailyCumulativeAccumulation.objects.create(
                symbol=symbol, transaction_date=d.date(), entity_id=str(eid),
                cumulative_buy=max(net, 0), cumulative_sell=0, cumulative_buy_amount=0,
                cumulative_sell_amount=0, cumulative_net=max(net, 0))


@pytest.mark.django_db
def test_in_sample_sortino_resolves_symbol_through_backtest():
    """Regression guard for Critical #1: run_backtest injects `symbol`, so the
    symbol-bound alpha runs cleanly and a real (non-sentinel) sortino is returned."""
    _seed_prices(CAL_SYMBOL)
    _seed_brokers(CAL_SYMBOL)
    value = in_sample_median_sortino(build_accumulation_code({}), [CAL_SYMBOL], 0.3)
    assert isinstance(value, float)
    assert value != LOW_SENTINEL


@pytest.mark.django_db
def test_calibrate_returns_params_and_oos_card():
    _seed_prices(CAL_SYMBOL)
    _seed_brokers(CAL_SYMBOL)
    best_params, card = calibrate([CAL_SYMBOL], oos_fraction=0.3, n_trials=2)
    assert isinstance(best_params, dict)
    assert isinstance(card.passed, bool)
