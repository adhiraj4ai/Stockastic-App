import json
from typing import Dict, List, Any
from .llm import LLMFactory, LLMProvider
from .db_utils import get_database_schema_string, execute_sql_query

class SQLOfThoughtAgent:
    def __init__(self):
        self.provider = LLMFactory.get_provider()
        self.schema_str = get_database_schema_string()
        self.max_retries = 3

    def run_pipeline(self, user_question: str) -> Dict[str, Any]:
        """
        Orchestrates the complete SQL-of-Thought pipeline.
        """
        # Step 1: Schema Linking
        print("Starting Schema Linking...")
        schema_links = self.schema_linking_agent(user_question)
        
        # Step 2: Subproblem Decomposition
        print("Decomposing Subproblems...")
        subproblems = self.subproblem_agent(user_question, schema_links)
        
        # Step 3: Query Planning
        print("Generating Query Plan...")
        query_plan = self.query_plan_agent(user_question, subproblems)
        
        # Step 4: Initial SQL Generation
        print("Generating SQL...")
        sql_query = self.sql_agent(user_question, query_plan)
        
        # Step 5: Execution & Correction Loop
        return self.execution_and_correction_loop(user_question, sql_query, schema_links)

    def schema_linking_agent(self, question: str) -> str:
        prompt = (
            f"Database Schema:\n{self.schema_str}\n\n"
            f"User Question: {question}\n\n"
            "Identify the relevant tables and columns required to answer the question. "
            "List them and explain the relationships (joins) if multiple tables are involved."
        )
        return self.provider.generate_response([{"role": "user", "content": prompt}])

    def subproblem_agent(self, question: str, schema_links: str) -> str:
        prompt = (
            f"Rules: Decompose the query into clause-level subproblems (WHERE, GROUP BY, JOIN, etc.). "
            f"Return a JSON object where keys are clause types and values are the partial logic.\n\n"
            f"Question: {question}\n"
            f"Schema Context: {schema_links}\n\n"
            "Subproblems JSON:"
        )
        return self.provider.generate_response([{"role": "user", "content": prompt}])

    def query_plan_agent(self, question: str, subproblems: str) -> str:
        prompt = (
            f"User Question: {question}\n"
            f"Subproblems: {subproblems}\n\n"
            "Generate a step-by-step execution plan (Chain-of-Thought) to retrieve the answer. "
            "Do NOT write SQL code yet. Just describe the logical steps."
        )
        return self.provider.generate_response([{"role": "user", "content": prompt}])

    def sql_agent(self, question: str, plan: str) -> str:
        prompt = (
            f"Database Schema:\n{self.schema_str}\n\n"
            f"User Question: {question}\n"
            f"Query Plan: {plan}\n\n"
            "Generate the executable SQL query inside a markdown block (```sql ... ```). "
            "Ensure it is syntactically valid PostgreSQL (or applicable dialect)."
        )
        response = self.provider.generate_response([{"role": "user", "content": prompt}])
        return self._extract_sql(response)

    def execution_and_correction_loop(self, question: str, initial_query: str, schema_links: str) -> Dict[str, Any]:
        """
        Executes query, checks for errors, and runs correction loop if needed.
        """
        current_query = initial_query
        
        for attempt in range(self.max_retries):
            print(f"Executing SQL (Attempt {attempt+1}): {current_query}")
            result = execute_sql_query(current_query)
            
            if "error" not in result:
                # Success!
                return {
                    "success": True, 
                    "sql": current_query, 
                    "data": result,
                    "explanation": f"Successfully executed query after {attempt+1} attempt(s)."
                }
            
            # If error, enter correction agents
            error_msg = result["error"]
            print(f"SQL Error: {error_msg}")
            
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
        prompt = (
            f"The following SQL query failed.\n"
            f"Question: {question}\n"
            f"Invalid Query: {query}\n"
            f"Error Message: {error}\n"
            f"Relevant Schema: {schema_links}\n\n"
            "Analyze the error and provide a specific plan to fix the SQL query. "
            "Focus on the error cause (e.g., Syntax, logic, schema mismatch)."
        )
        return self.provider.generate_response([{"role": "user", "content": prompt}])

    def correction_sql_agent(self, question: str, query: str, plan: str, schema_links: str) -> str:
        prompt = (
            f"Original Question: {question}\n"
            f"Broken Query: {query}\n"
            f"Correction Plan: {plan}\n"
            f"Schema: {schema_links}\n\n"
            "Generate the corrected SQL query inside a markdown block."
        )
        response = self.provider.generate_response([{"role": "user", "content": prompt}])
        return self._extract_sql(response)

    def _extract_sql(self, text: str) -> str:
        """Helper to extract SQL from markdown."""
        if "```sql" in text:
            return text.split("```sql")[1].split("```")[0].strip()
        if "```" in text:
            return text.split("```")[1].strip()
        return text.strip()
