from typing import List, Dict, Generator
import pandas as pd
from .base import Agent
from ..prompts.plotting_prompts import PYTHON_CHART_GENERATION_PROMPT
from ..registry import AgentRegistry

@AgentRegistry.register(
    name="PLOTTING_AGENT",
    description="For generating charts (only use if user asks to 'plot', 'chart', 'graph', or 'visualize')."
)
class PlottingAgent(Agent):
    """
    Agent specialized in generating charts. 
    Decoupled from SQL: It visualizes data provided via set_data_context.
    """
    def __init__(self):
        super().__init__()
        self.context_df = pd.DataFrame()

    def set_data_context(self, df: pd.DataFrame):
        """Receives data from the Supervisor (fetched by another agent)."""
        self.context_df = df

    def process_request(self, messages: List[Dict[str, str]]) -> Generator[str, None, None]:
        user_question = messages[-1]['content']
        
        yield "[[STATUS:Visualizing Data...]] \n\n"
        
        if self.context_df.empty:
            yield "_No data available to visualize. Please fetch data first._\n\n"
            return

        try:
            df = self.context_df
            columns = list(df.columns)
            
            # Populate the centralized prompt
            code_prompt = PYTHON_CHART_GENERATION_PROMPT.format(
                columns=columns,
                user_request=user_question
            )
            
            chart_code = self.provider.generate_response([{"role": "user", "content": code_prompt}])
            chart_code = chart_code.replace("```python", "").replace("```", "").strip()

            yield f"<<<COLLAPSIBLE_PYTHON_START>>>\n{chart_code}\n<<<COLLAPSIBLE_PYTHON_END>>>\n\n"

            from ..python_executor import execute_chart_code
            chart_json = execute_chart_code(df, chart_code)
            
            if "error" not in chart_json:
                yield f"<<<ECHART_JSON:{chart_json}>>>\n\n"
            else:
                print(f"Chart Execution Error: {chart_json}")
                error_msg = f"**Chart Generation Error**\n\n```json\n{chart_json}\n```\n\n**Generated Code:**\n```python\n{chart_code}\n```"
                yield f"{error_msg}\n\n"
                
        except Exception as e:
            yield f"[[FINISH]]An unexpected error occurred: {str(e)}"
            return

        yield "[[FINISH]]"
