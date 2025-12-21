from typing import List, Dict, Generator
import pandas as pd
from .text2sql import Text2SQLAgent
from ..prompts.analyst_prompts import (
    INDICATOR_SYSTEM_PROMPT,
    CANDLE_SYSTEM_PROMPT
)
from ..prompts.technical_prompts import INDICATOR_CALCULATION_PROMPT
from ..registry import AgentRegistry
from ..python_executor import execute_calculation_code
from ..utils import json_to_markdown_table

@AgentRegistry.register(
    name="INDICATOR_AGENT",
    description="For calculation of specific technical indicators (RSI, MA, MACD, Bollinger Bands)."
)
class IndicatorAgent(Text2SQLAgent):
    """Specialized agent for technical indicators (RSI, MA, MACD) using Python execution."""
    def __init__(self):
        super().__init__(system_prompt=INDICATOR_SYSTEM_PROMPT)

    def process_request(self, messages: List[Dict[str, str]]) -> Generator[str, None, None]:
        user_question = messages[-1]['content']
        # Reuse SQL pipeline to fetch OHLC data
        yield "[[STATUS:Fetching Market Data...]] \n\n"
        
        fetched_df = pd.DataFrame()
        
        try:
             # Pass recent messages array to support history context
             recent_messages = messages[-5:]
             for step in self.sql_pipeline.stream_pipeline(user_question, recent_messages):
                 
                 if step['type'] == 'status':
                     yield f"[[STATUS:{step['content']}]]\n\n"
                 elif step['type'] == 'thought':
                     header = step.get('header', 'Thinking')
                     content = step.get('content', '')
                     yield f"<<<THOUGHT_START:{header}>>>\n{content}\n<<<THOUGHT_END>>>\n\n"
                 elif step['type'] == 'sql':
                     yield f"<<<THOUGHT_START:Drafting SQL>>>\n```sql\n{step['content']}\n```\n<<<THOUGHT_END>>>\n\n"
                 elif step['type'] == 'result':
                     result = step['payload']
                     sql_data = result.get("data")
                     if sql_data:
                         yield f"{json_to_markdown_table(sql_data[:10])}\n\n"
                         fetched_df = pd.DataFrame(sql_data)
                         # Date normalization
                         for col in fetched_df.columns:
                             if fetched_df[col].dtype == 'object':
                                 try: fetched_df[col] = pd.to_datetime(fetched_df[col])
                                 except: pass
                 elif step['type'] == 'error':
                     yield f"**Error**: {step['content']}\n"

                     
             # Step 2: Calculate Indicator using Python
             if not fetched_df.empty:
                 # Narrate the handoff
                 rows = len(fetched_df)
                 yield f"<<<THOUGHT_START:Data Validation>>>\nSuccessfully fetched {rows} rows of raw data from SQL.\nProceeding to Python execution for indicator calculation.\n<<<THOUGHT_END>>>\n\n"
                  
                 yield "[[STATUS:Computing Indicators (pandas-ta)...]] \n\n"
                 columns = list(fetched_df.columns)
                 code_prompt = INDICATOR_CALCULATION_PROMPT.format(
                     user_request=user_question,
                     columns=columns
                 )
                 
                 calc_code = self.provider.generate_response([{"role": "user", "content": code_prompt}])
                 calc_code = calc_code.replace("```python", "").replace("```", "").strip()
                 
                 yield f"<<<COLLAPSIBLE_PYTHON_START>>>\n{calc_code}\n<<<COLLAPSIBLE_PYTHON_END>>>\n\n"
                 
                 results = execute_calculation_code(fetched_df, calc_code)
                 
                 if "error" not in results:
                     yield f"### Indicator Analysis\n"
                     yield f"**Value**: {results.get('last_value', 'N/A')}\n"
                     yield f"**Signal**: {results.get('signal', 'N/A')}\n"
                     yield f"**Insight**: {results.get('description', '')}\n\n"
                 else:
                     yield f"**Calculation Error**: {results.get('error')}\n"
                     
        except Exception as e:
            yield f"[[FINISH]]An unexpected error occurred: {str(e)}"
            return
            
        yield "[[FINISH]]"

@AgentRegistry.register(
    name="CANDLE_AGENT",
    description="For identifying specific candlestick patterns (Doji, Hammer, Engulfing)."
)
class CandleAgent(Text2SQLAgent):
    """Specialized agent for candlestick pattern recognition."""
    def __init__(self):
        super().__init__(system_prompt=CANDLE_SYSTEM_PROMPT)
