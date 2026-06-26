import pytest

from stocks.services.accumulation.calibration import (
    build_accumulation_code, decide_validation_state, ACCUMULATION_STRATEGY_NAME)
from stocks.services.optimization_service import OptimizationService


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
