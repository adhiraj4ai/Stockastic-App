from .text2sql import Text2SQLAgent
from ..prompts.analyst_prompts import FUNDAMENTAL_SYSTEM_PROMPT
from ..registry import AgentRegistry

@AgentRegistry.register(
    name="FUNDAMENTAL_AGENT",
    description="For financial health analysis, balance sheets, P&L, quarterly reports, and key ratios (EPS, PE, ROE)."
)
class FundamentalAgent(Text2SQLAgent):
    """Specialized agent for fundamental analysis (Ratios, Financial Statements)."""
    def __init__(self):
        super().__init__(system_prompt=FUNDAMENTAL_SYSTEM_PROMPT)
