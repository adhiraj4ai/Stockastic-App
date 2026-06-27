"""Classify a signal source into one of the three board lanes."""
import logging

logger = logging.getLogger(__name__)

FAMILIES = ("accumulation", "technical", "your_strategies")

ACCUMULATION_SOURCES = {
    "SMART_MONEY", "DISTRIBUTION_ALERT", "BELOW_COST_REVERSAL",
    "CONCENTRATION_SHIFT", "ACC_MOMENTUM", "BROKER_ACCUMULATION",
    "ACCUMULATION_STRATEGY",
}
TECHNICAL_SOURCES = {
    "VOLUME_BREAKOUT", "INSTITUTIONAL_ALERTS", "ICHIMOKU", "SMART_CROSSOVER",
    "PRICE_ACTION", "MEAN_REVERSAL", "RSI_DIVERGENCE", "MACD_DIVERGENCE", "DOW_SIGNAL",
}


def family_for(source):
    """Map a source key to a lane. Unknown sources fall back to technical."""
    if source == "USER_STRATEGY":
        return "your_strategies"
    if source in ACCUMULATION_SOURCES:
        return "accumulation"
    if source not in TECHNICAL_SOURCES:
        logger.warning("Unknown signal source %r → technical lane", source)
    return "technical"
