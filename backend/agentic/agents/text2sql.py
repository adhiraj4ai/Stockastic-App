from typing import List, Dict, Generator
import pandas as pd
from .base import Agent
from ..sql_of_thought import SQLOfThoughtAgent
from ..utils import json_to_markdown_table
from ..prompts.agent_prompts import get_sql_interpretation_prompt

class Text2SQLAgent(Agent):
    """Base class for agents using SQL-of-Thought framework."""
    def __init__(self, system_prompt: str = None):
        super().__init__()
        self.sql_pipeline = SQLOfThoughtAgent()
        self.system_prompt = system_prompt
        self.latest_df = pd.DataFrame()

    def process_request(self, messages: List[Dict[str, str]]) -> Generator[str, None, None]:
        user_question = messages[-1]['content']
        
        # Trigger loader initially with status
        yield "[[STATUS:Thinking (SQL-of-Thought)...]] \n\n"
        
        try:
             # Pass recent messages array to support history context (limit to last 5)
             recent_messages = messages[-5:]
             
             # Extract Complexity early for narration
             complexity = "detailed"
             if "[COMPLEXITY: simple]" in user_question:
                 complexity = "simple"
             
             yield f"<<<THOUGHT_START:Context Analysis>>>\nMode: {complexity.title()}\nRole: Data Fetcher (Strictly NO SQL Calculation)\nObjective: Fetch raw data to pass to Python analysis.\n<<<THOUGHT_END>>>\n\n"
             
             for step in self.sql_pipeline.stream_pipeline(user_question, recent_messages):
                 
                 if step['type'] == 'status':
                     # Yield status tag for the frontend loader
                     yield f"[[STATUS:{step['content']}]]\n\n"
                     
                 elif step['type'] == 'thought':
                     # Narrate the internal thought process
                     header = step.get('header', 'Thinking')
                     content = step.get('content', '')
                     yield f"<<<THOUGHT_START:{header}>>>\n{content}\n<<<THOUGHT_END>>>\n\n"
                     
                 elif step['type'] == 'sql':
                     # Show generated SQL draft
                     yield f"<<<THOUGHT_START:Drafting SQL>>>\n```sql\n{step['content']}\n```\n<<<THOUGHT_END>>>\n\n"
                     
                 elif step['type'] == 'result':
                     result = step['payload']
                     question = result.get("question")
                     total = result.get("total", 1)
                     
                     if not result.get("success"):
                         yield f"### Question: {question}\n**Error**: {result.get('error')}\n\nLast attempted query:\n```sql\n{result.get('last_query')}\n```\n\n---\n\n"
                         continue

                     sql_data = result.get("data")
                     executed_sql = result.get("sql")
                     
                     header = f"### Question: {question}\n" if total > 1 else ""
                     
                     # Dynamic rephrasing
                     sql_intro = self.sql_pipeline._generate_dynamic_text("I have analyzed the database to address your request", question, formal=True)
                     yield f"{header}{sql_intro}:\n<<<COLLAPSIBLE_SQL_START>>>\n{executed_sql}\n<<<COLLAPSIBLE_SQL_END>>>\n\n"
                     
                     # Prepare DataFrame for visualization and context
                     df = pd.DataFrame(sql_data) if sql_data else pd.DataFrame()
                     self.latest_df = df
                     
                     # Normalize date columns to Timestamps to prevent comparison errors in exec()
                     if not df.empty:
                         for col in df.columns:
                             if df[col].dtype == 'object':
                                 try:
                                     df[col] = pd.to_datetime(df[col])
                                 except (ValueError, TypeError):
                                     pass

                     # Yield Data Table (immediately after SQL)
                     yield f"{json_to_markdown_table(sql_data)}\n\n"
                     
                     
                     # Limit data for context window if necessary
                     data_for_prompt = sql_data[:20] if isinstance(sql_data, list) else sql_data
                     
                     # Extract Complexity from message instructions
                     complexity = "detailed" # Default
                     if "[COMPLEXITY: simple]" in user_question:
                         complexity = "simple"
                     elif "complexity='simple'" in str(messages): # Fallback check 
                         complexity = "simple"
                         
                     interpretation_prompt = get_sql_interpretation_prompt(
                         question, 
                         executed_sql, 
                         data_for_prompt, 
                         complexity=complexity
                     )
                     
                     for chunk in self.provider.stream_response([{"role": "user", "content": interpretation_prompt}]):
                         yield chunk
                     
                     yield "\n\n---\n\n"
                     
                 elif step['type'] == 'error':
                     yield f"**Critical Error**: {step['content']}\n"
        
        except Exception as e:
            yield f"[[FINISH]]An unexpected error occurred: {str(e)}"
            return

        # End of stream - Signal finish to remove loader
        yield "[[FINISH]]"
