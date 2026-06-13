"""
Recommendations package — re-exports all public classes and view functions
so that existing `import stocks.views.recommendations` call-sites continue to work.
"""
from .broker_accumulation_parameters import BrokerAccumulationParameters
from .broker_accumulation_engine import BrokerAccumulationRecommendationEngine
from .smart_accumulated_crossover_engine import SmartAccumulatedCrossoverRecommendationEngine
from .ichimoku_accumulation_engine import IchimokuAccumulationRecommendationEngine
from .views import (
    get_broker_accumulation_recommendations,
    get_broker_accumulation_history,
    get_smart_accumulated_crossover_recommendations,
    get_smart_accumulated_crossover_history,
    get_ichimoku_accumulation_recommendations,
    get_ichimoku_accumulation_history,
)

__all__ = [
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
]
