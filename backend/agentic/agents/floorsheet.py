from .text2sql import Text2SQLAgent
from ..prompts.floorsheet_prompts import FLOORSHEET_SYSTEM_PROMPT
from ..registry import AgentRegistry

@AgentRegistry.register(
    name="FLOORSHEET_AGENT",
    description="For broker activity, accumulation, stealth buying, distribution, and top 10 buyers/sellers."
)
class FloorsheetAgent(Text2SQLAgent):
    """Specialized agent for analyzing transactions and broker activity."""
    def __init__(self):
        super().__init__(system_prompt=FLOORSHEET_SYSTEM_PROMPT)
