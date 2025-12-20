from abc import ABC, abstractmethod
from typing import List, Dict, Generator
import json
import pandas as pd
from .llm import LLMFactory
from .sql_of_thought import SQLOfThoughtAgent
from .prompts.agent_prompts import (
    SUPERVISOR_SYSTEM_PROMPT,
    STOCKASTIC_PERSONA,
    DATA_VIZ_SYSTEM_PROMPT,
    get_sql_interpretation_prompt
)

class Agent(ABC):
    def __init__(self):
        self.provider = LLMFactory.get_provider()

    @abstractmethod
    def process_request(self, messages: List[Dict[str, str]]) -> Generator[str, None, None]:
        pass

class ConversationalAgent(Agent):
    """Standard chat agent using the configured LLM provider."""
    def process_request(self, messages: List[Dict[str, str]]) -> Generator[str, None, None]:
        # Prepend system prompt to the conversation history
        messages_with_persona = [{"role": "system", "content": STOCKASTIC_PERSONA}] + messages
        
        for chunk in self.provider.stream_response(messages_with_persona):
            yield chunk

from .utils import json_to_markdown_table

class Text2SQLAgent(Agent):
    """Agent specialized in database queries using SQL-of-Thought framework."""
    def __init__(self):
        super().__init__()
        self.sql_pipeline = SQLOfThoughtAgent()

    def process_request(self, messages: List[Dict[str, str]]) -> Generator[str, None, None]:
        user_question = messages[-1]['content']
        
        # Trigger loader initially with status
        yield "[[STATUS:Thinking (SQL-of-Thought)...]] \n\n"
        
        try:
             # Iterate through the streaming pipeline
             for step in self.sql_pipeline.stream_pipeline(user_question):
                 
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
                     # DELAY: Give user time to read the thoughts before result appears
                     import time
                     time.sleep(5)
                     
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
                     
                     # Visualization Logic (Python Code -> ECharts)
                     viz_match = False
                     
                     # Check BOTH the current sub-question and the original user prompt for context
                     original_q = messages[-1]["content"].lower() if messages else ""
                     q_lower = (question + " " + original_q).lower()
                     
                     # Simple keyword detection for intent
                     if any(k in q_lower for k in ["pie", "distribution", "breakdown", "allocation"]):
                         viz_type = "Pie Chart"
                         viz_match = True
                     elif any(k in q_lower for k in ["bar", "column", "comparison", "histogram"]):
                         viz_type = "Bar Chart"
                         viz_match = True
                     elif any(k in q_lower for k in ["plot", "graph", "chart", "visualize", "trend", "turnover", "volume", "count", "summary"]):
                         viz_type = "Line/Area Chart"
                         viz_match = True

                     print(f"[DEBUG] Viz Intent: {viz_match}, Data Empty: {df.empty}, Context: {q_lower}")
                     
                     if viz_match and df.empty:
                         yield "_Note: The query returned no data, so I cannot generate a chart for this request._\n\n"

                     if viz_match and not df.empty:
                         try:
                            columns = list(df.columns)
                            # Prompt for Python Code
                            code_prompt = (
                                f"You are a Python Data Visualization Expert. \n"
                                f"Goal: Write Python code to visualize the pandas DataFrame `df` based on the user request: '{question}'.\n"
                                f"Context: The DataFrame `df` has columns: {columns}.\n"
                                f"Instructions:\n"
                                f"1. Create a dictionary named `chart_options` that represents a valid ECharts option (JSON structure).\n"
                                f"2. The `chart_options` must include 'xAxis', 'yAxis' (if applicable), 'series', 'tooltip', and 'legend'.\n"
                                f"3. Extract data from `df` into Python lists for the 'data' fields in 'series' and 'xAxis'. Do NOT use dataframe directly in the dict.\n"
                                f"4. For '{viz_type}', ensure the correct ECharts 'type' (e.g. 'pie', 'bar', 'line') is used.\n"
                                f"5. Set a nice 'title' if appropriate.\n"
                                f"6. Return ONLY the Python code. No markdown backticks.\n"
                                f"7. CRITICAL: Date Handling. `df` columns are already normalized to pandas Timestamps. \n"
                                f"   - For filtering (e.g., 'last 6 months'), use a Timestamp cutoff: `cutoff = pd.Timestamp.now() - pd.DateOffset(months=6)`. \n"
                                f"   - Avoid using `.date` or `.dt.date` unless specifically comparing with a `datetime.date` object. \n"
                                f"   - Always ensure lists for ECharts are clean (convert types if needed using `.tolist()`)."
                            )
                            
                            # Use the agent's provider to generate chart code
                            chart_code = self.provider.generate_response([{"role": "user", "content": code_prompt}])
                            
                            # Clean code (strip markdown)
                            chart_code = chart_code.replace("```python", "").replace("```", "").strip()

                            # Yield Collapsible Python Code
                            yield f"<<<COLLAPSIBLE_PYTHON_START>>>\n{chart_code}\n<<<COLLAPSIBLE_PYTHON_END>>>\n\n"

                            from .python_executor import execute_chart_code
                            chart_json = execute_chart_code(df, chart_code)
                            
                            # Check for errors in execution result
                            if "error" not in chart_json:
                                yield f"<<<ECHART_JSON:{chart_json}>>>\n\n"
                            else:
                                # Fallback or error logging
                                print(f"Chart Execution Error: {chart_json}")
                                error_msg = f"**Chart Generation Error**\n\n```json\n{chart_json}\n```\n\n**Generated Code:**\n```python\n{chart_code}\n```"
                                yield f"{error_msg}\n\n"
                                
                         except Exception as e:
                             print(f"Chart Generation Failed: {e}")

                     
                     
                     # Limit data for context window if necessary
                     data_for_prompt = sql_data[:20] if isinstance(sql_data, list) else sql_data
                     
                     interpretation_prompt = get_sql_interpretation_prompt(question, executed_sql, data_for_prompt)
                     
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

class DataVisualizationAgent(Agent):
    """Agent specialized in generating charts."""
    def process_request(self, messages: List[Dict[str, str]]) -> Generator[str, None, None]:
        agent_messages = [{"role": "system", "content": DATA_VIZ_SYSTEM_PROMPT}] + messages[-3:]
        
        yield "Configuring visualization...\n\n"
        
        for chunk in self.provider.stream_response(agent_messages):
            yield chunk

class SupervisorAgent(Agent):
    """
    Orchestrates specialized agents based on user intent.
    """
    def __init__(self):
        super().__init__()
        self.conversational_agent = ConversationalAgent()
        self.sql_agent = Text2SQLAgent()
        self.viz_agent = DataVisualizationAgent()

    def _classify_intent(self, messages: List[Dict[str, str]]) -> str:
        """
        Uses the LLM to classify the latest message intent.
        """
        classification_messages = [
            {"role": "system", "content": SUPERVISOR_SYSTEM_PROMPT},
            {"role": "user", "content": messages[-1]['content']} 
        ]
        
        try:
            # We use generate_response for a quick single classification
            response = self.provider.generate_response(classification_messages).strip().upper()
            if "SQL" in response: return "SQL_AGENT"
            if "VIZ" in response: return "VIZ_AGENT"
            return "CHAT_AGENT"
        except Exception:
            return "CHAT_AGENT"

    def process_request(self, messages: List[Dict[str, str]]) -> Generator[str, None, None]:
        intent = self._classify_intent(messages)
        
        if intent == "SQL_AGENT":
            yield from self.sql_agent.process_request(messages)
        elif intent == "VIZ_AGENT":
             yield from self.viz_agent.process_request(messages)
        else:
             yield from self.conversational_agent.process_request(messages)
