"""
Structural tests for the recommendations package refactor.
Verifies all public symbols are importable and each file stays within size limits.
"""
import os
import pytest


# ---------------------------------------------------------------------------
# Import tests
# ---------------------------------------------------------------------------

def test_broker_accumulation_parameters_importable():
    from stocks.views.recommendations import BrokerAccumulationParameters
    assert BrokerAccumulationParameters is not None


def test_broker_accumulation_engine_importable():
    from stocks.views.recommendations import BrokerAccumulationRecommendationEngine
    assert BrokerAccumulationRecommendationEngine is not None


def test_smart_crossover_engine_importable():
    from stocks.views.recommendations import SmartAccumulatedCrossoverRecommendationEngine
    assert SmartAccumulatedCrossoverRecommendationEngine is not None


def test_ichimoku_engine_importable():
    from stocks.views.recommendations import IchimokuAccumulationRecommendationEngine
    assert IchimokuAccumulationRecommendationEngine is not None


def test_view_functions_importable():
    from stocks.views.recommendations import (
        get_broker_accumulation_recommendations,
        get_broker_accumulation_history,
        get_smart_accumulated_crossover_recommendations,
        get_smart_accumulated_crossover_history,
        get_ichimoku_accumulation_recommendations,
        get_ichimoku_accumulation_history,
    )
    assert get_broker_accumulation_recommendations is not None
    assert get_broker_accumulation_history is not None
    assert get_smart_accumulated_crossover_recommendations is not None
    assert get_smart_accumulated_crossover_history is not None
    assert get_ichimoku_accumulation_recommendations is not None
    assert get_ichimoku_accumulation_history is not None


def test_all_symbols_in_dunder_all():
    import stocks.views.recommendations as pkg
    expected = {
        "BrokerAccumulationParameters",
        "BrokerAccumulationRecommendationEngine",
        "SmartAccumulatedCrossoverRecommendationEngine",
        "IchimokuAccumulationRecommendationEngine",
        "get_broker_accumulation_recommendations",
        "get_broker_accumulation_history",
        "get_smart_accumulated_crossover_recommendations",
        "get_smart_accumulated_crossover_history",
        "get_ichimoku_accumulation_recommendations",
        "get_ichimoku_accumulation_history",
    }
    assert expected.issubset(set(pkg.__all__))


# ---------------------------------------------------------------------------
# File size tests (≤1000 lines each)
# ---------------------------------------------------------------------------

PACKAGE_DIR = os.path.join(
    os.path.dirname(__file__), '..', 'views', 'recommendations'
)
FILE_LINE_LIMIT = 1000


def _count_lines(filename: str) -> int:
    path = os.path.join(PACKAGE_DIR, filename)
    with open(path) as f:
        return sum(1 for _ in f)


@pytest.mark.parametrize("filename", [
    "__init__.py",
    "broker_accumulation_parameters.py",
    "broker_accumulation_engine.py",
    "smart_accumulated_crossover_engine.py",
    "ichimoku_accumulation_engine.py",
    "views.py",
    "shared_helpers.py",
])
def test_file_within_line_limit(filename):
    count = _count_lines(filename)
    assert count <= FILE_LINE_LIMIT, (
        f"{filename} has {count} lines (limit: {FILE_LINE_LIMIT})"
    )


# ---------------------------------------------------------------------------
# Default parameters test
# ---------------------------------------------------------------------------

def test_broker_accumulation_parameters_defaults():
    from stocks.views.recommendations import BrokerAccumulationParameters
    params = BrokerAccumulationParameters()
    assert params.min_accumulation_days == 10
    assert params.volume_breakout_threshold == 2.0
    assert params.min_net_volume == 10000
    assert 'strong_buy' in params.confidence_thresholds


def test_broker_accumulation_engine_default_params():
    from stocks.views.recommendations import (
        BrokerAccumulationRecommendationEngine,
        BrokerAccumulationParameters,
    )
    engine = BrokerAccumulationRecommendationEngine()
    assert isinstance(engine.params, BrokerAccumulationParameters)


def test_broker_accumulation_engine_custom_params():
    from stocks.views.recommendations import (
        BrokerAccumulationRecommendationEngine,
        BrokerAccumulationParameters,
    )
    custom = BrokerAccumulationParameters(min_net_volume=5000)
    engine = BrokerAccumulationRecommendationEngine(params=custom)
    assert engine.params.min_net_volume == 5000
