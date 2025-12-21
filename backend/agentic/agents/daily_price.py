from .text2sql import Text2SQLAgent
from ..prompts.daily_price_prompts import DAILY_PRICE_SYSTEM_PROMPT
from ..registry import AgentRegistry

@AgentRegistry.register(
    name="DAILY_PRICE_AGENT",
    description="For stock prices, OHLC, volume trends, price history, and simple trend checks."
)
class DailyStockPriceAgent(Text2SQLAgent):
    """Specialized agent for OHLC volume and price trend analysis."""
    def __init__(self):
        super().__init__(system_prompt=DAILY_PRICE_SYSTEM_PROMPT)
