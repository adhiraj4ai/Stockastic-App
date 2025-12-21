import os
import re
from typing import Dict, Any, List
from .llm import LLMFactory
from langchain_community.utilities import SQLDatabase
from langchain_groq import ChatGroq
from .prompts.sql_prompts import (
    get_schema_linking_prompt,
    get_subproblem_prompt,
    get_query_plan_prompt,
    get_sql_generation_prompt,
    get_correction_plan_prompt,
    get_correction_sql_prompt,
    get_thought_rephrase_prompt,
    get_analysis_intro_prompt
)

class SQLOfThoughtAgent:
    def __init__(self):
        # 1. Setup Reliable LangChain DB Connection to 'stock_market'
        user = os.environ.get("POSTGRES_USER", "postgres")
        password = os.environ.get("POSTGRES_PASSWORD", "postgres")
        host = os.environ.get("DB_HOST", "localhost")
        port = os.environ.get("DB_PORT", "5434")
        db_name = "stock_market"
        
        self.db_uri = f"postgresql+psycopg2://{user}:{password}@{host}:{port}/{db_name}"
        
        try:
            self.db = SQLDatabase.from_uri(self.db_uri)
            # Use LangChain to get the REAL schema
            self.schema_str = self.db.get_table_info()
            
            # Fetch date range for context
            date_range = self.db.run("SELECT MIN(transaction_date), MAX(transaction_date) FROM daily_floorsheet")
            from datetime import datetime
            now = datetime.now().strftime("%Y-%m-%d")
            self.temporal_context = f"Current System Date: {now}. Database 'daily_floorsheet' contains data from {date_range}."
        except Exception as e:
            print(f"Error connecting to DB: {e}")
            self.db = None
            self.schema_str = "Error retreiving schema."
            self.temporal_context = ""

        self.provider = LLMFactory.get_provider()
        self.max_retries = 3

    def _generate_dynamic_text(self, base_text: str, context: str, formal: bool = False) -> str:
        """Uses LLM to rephrase a step description based on context."""
        try:
            if formal:
                prompt = get_analysis_intro_prompt(base_text, context)
            else:
                prompt = get_thought_rephrase_prompt(base_text, context)
            response = self.provider.generate_response([{"role": "user", "content": prompt}])
            return response.strip().replace('"', '').replace("'", "")
        except:
            return base_text

    def _format_history_context(self, messages: List[Dict[str, str]]) -> str:
        """
        Cleans and formats conversation history for the LLM.
        Strips UI-specific tags (thoughts, status, JSON) to save tokens,
        but preserves User questions and Assistant SQL/Interpretations.
        """
        if not messages:
            return "None."
        
        # Take last 6 turns (3 pairs) to keep context manageable
        history_window = messages[-6:]
        formatted_turns = []
        
        for msg in history_window:
            role = msg['role'].capitalize()
            content = msg['content']
            
            if role == "Assistant":
                # Strip out internal thoughts, status logs, and ECharts JSON
                content = re.sub(r'<<<THOUGHT_START:.*?>>>.*?<<<THOUGHT_END>>>', '', content, flags=re.DOTALL)
                content = re.sub(r'<<<COLLAPSIBLE_PYTHON_START>>>.*?<<<COLLAPSIBLE_PYTHON_END>>>', '', content, flags=re.DOTALL)
                content = re.sub(r'<<<ECHART_JSON:.*?>>>', '', content)
                content = re.sub(r'\[\[STATUS:.*?\]\]', '', content)
                content = re.sub(r'\[\[FINISH\]\]', '', content)
                
                # We want to KEEP the SQL queries but maybe label them clearly
                # Change collapsible tags to standard markdown SQL for the LLM
                content = content.replace("<<<COLLAPSIBLE_SQL_START>>>", "Executed SQL: \n```sql\n")
                content = content.replace("<<<COLLAPSIBLE_SQL_END>>>", "\n```")
                
                # Clean up whitespace
                content = re.sub(r'\n{3,}', '\n\n', content).strip()
            
            if content:
                formatted_turns.append(f"{role}: {content}")
        
        return "\n\n".join(formatted_turns)

    def stream_pipeline(self, user_question: str, messages: List[Dict[str, str]] = None) -> Dict[str, Any]:
        """
        Orchestrates the complete SQL-of-Thought pipeline yielding steps.
        """
        if not self.db:
             yield {"type": "error", "content": "Database connection invalid."}
             return

        # Format history context
        history_context = self._format_history_context(messages or [])

        # Step 0: Plan / Split Questions
        yield {"type": "status", "content": "Planning & Breaking down request..."}
        try:
            questions = self.splitter_agent(user_question, history_context)
            # Ensure it's a list
            if isinstance(questions, str):
                questions = json.loads(questions)
        except Exception:
            questions = [user_question]

        for i, sub_q in enumerate(questions):
            prefix = f"(Q{i+1}/{len(questions)})" if len(questions) > 1 else ""
            
            # Step 1: Schema Linking
            # Dynamic rephrasing
            status_text = self._generate_dynamic_text("Analyzing Database Schema", sub_q)
            yield {"type": "status", "content": f"{prefix} {status_text}..."}
            
            schema_links = self.schema_linking_agent(sub_q, history_context)
            
            header_text = self._generate_dynamic_text("Schema Identification", sub_q).title()
            yield {"type": "thought", "header": f"{header_text} {prefix}", "content": schema_links}
            
            # Step 2: Subproblem Decomposition
            status_text = self._generate_dynamic_text("Decomposing Query", sub_q)
            yield {"type": "status", "content": f"{prefix} {status_text}..."}
            
            subproblems = self.subproblem_agent(sub_q, schema_links, history_context)
            
            header_text = self._generate_dynamic_text("Subproblems", sub_q).title()
            yield {"type": "thought", "header": f"{header_text} {prefix}", "content": subproblems}
            
            # Step 3: Query Planning
            status_text = self._generate_dynamic_text("Planning Execution", sub_q)
            yield {"type": "status", "content": f"{prefix} {status_text}..."}
            
            query_plan = self.query_plan_agent(sub_q, subproblems, history_context)
            
            header_text = self._generate_dynamic_text("Execution Plan", sub_q).title()
            yield {"type": "thought", "header": f"{header_text} {prefix}", "content": query_plan}
            
            # Step 4: Initial SQL Generation
            status_text = self._generate_dynamic_text("Generating SQL", sub_q)
            yield {"type": "status", "content": f"{prefix} {status_text}..."}
            
            sql_query = self.sql_agent(sub_q, query_plan, history_context)
            
            # No dynamic header needed here as Agent.py handles "Drafting SQL" hardcoded or we can pass it
            yield {"type": "sql", "content": sql_query}
            
            # Step 5: Execution & Correction Loop
            status_text = self._generate_dynamic_text("Executing Query", sub_q)
            yield {"type": "status", "content": f"{prefix} {status_text}..."}
            
            result = self.execution_and_correction_loop(sub_q, sql_query, schema_links)
            
            result["question"] = sub_q 
            result["total"] = len(questions) # Meta info 
            
            # Yield result IMMEDIATELY
            yield {"type": "result", "payload": result}

    def splitter_agent(self, question: str, history: str = "") -> List[str]:
        prompt = get_question_splitter_prompt(question, history)
        response = self.provider.generate_response([{"role": "user", "content": prompt}])
        try:
            # Extract JSON list if embedded in markdown
            if "```json" in response:
                response = response.split("```json")[1].split("```")[0].strip()
            return json.loads(response)
        except:
            return [question]

    def schema_linking_agent(self, question: str, history: str = "") -> str:
        prompt = get_schema_linking_prompt(self.schema_str, question, self.temporal_context, history)
        return self.provider.generate_response([{"role": "user", "content": prompt}])

    def subproblem_agent(self, question: str, schema_links: str, history: str = "") -> str:
        prompt = get_subproblem_prompt(question, schema_links, history)
        return self.provider.generate_response([{"role": "user", "content": prompt}])

    def query_plan_agent(self, question: str, subproblems: str, history: str = "") -> str:
        prompt = get_query_plan_prompt(question, subproblems, history)
        return self.provider.generate_response([{"role": "user", "content": prompt}])

    def sql_agent(self, question: str, plan: str, history: str = "") -> str:
        prompt = get_sql_generation_prompt(self.schema_str, question, plan, self.temporal_context, history)
        response = self.provider.generate_response([{"role": "user", "content": prompt}])
        return self._extract_sql(response)

    def execution_and_correction_loop(self, question: str, initial_query: str, schema_links: str) -> Dict[str, Any]:
        current_query = initial_query
        
        for attempt in range(self.max_retries):
            try:
                import sqlalchemy
                with self.db._engine.connect() as connection:
                    result_proxy = connection.execute(sqlalchemy.text(current_query))
                    if result_proxy.returns_rows:
                        keys = result_proxy.keys()
                        results = [dict(zip(keys, row)) for row in result_proxy.fetchall()]
                        return {
                            "success": True, 
                            "sql": current_query, 
                            "data": results,
                            "explanation": f"Successfully executed query."
                        }
                    else:
                         return {"success": True, "sql": current_query, "data": "Query executed successfully (no rows)."}

            except Exception as e:
                error_msg = str(e)
                # Correction Plan
                correction_plan = self.correction_plan_agent(question, current_query, error_msg, schema_links)
                # Correction SQL
                current_query = self.correction_sql_agent(question, current_query, correction_plan, schema_links)
            
        return {
            "success": False, 
            "error": "Max retries reached. Could not generate valid SQL.",
            "last_query": current_query
        }

    def correction_plan_agent(self, question: str, query: str, error: str, schema_links: str) -> str:
        prompt = get_correction_plan_prompt(question, query, error, schema_links)
        return self.provider.generate_response([{"role": "user", "content": prompt}])

    def correction_sql_agent(self, question: str, query: str, plan: str, schema_links: str) -> str:
        prompt = get_correction_sql_prompt(question, query, plan, schema_links)
        response = self.provider.generate_response([{"role": "user", "content": prompt}])
        return self._extract_sql(response)

    def _extract_sql(self, text: str) -> str:
        if "```sql" in text:
            return text.split("```sql")[1].split("```")[0].strip()
        if "```" in text:
            return text.split("```")[1].strip()
        return text.strip()
