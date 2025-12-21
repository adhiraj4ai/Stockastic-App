from .text2sql import Text2SQLAgent
from ..prompts.analyst_prompts import ACCUMULATION_SYSTEM_PROMPT
from ..registry import AgentRegistry

@AgentRegistry.register(
    name="ACCUMULATION_AGENT",
    description="For deep-dive analysis of sustained buying pressure or smart money movements."
)
class AccumulationAgent(Text2SQLAgent):
    """Specialized agent for deep-dive accumulation and smart money buying."""
    def __init__(self):
        super().__init__(system_prompt=ACCUMULATION_SYSTEM_PROMPT)
