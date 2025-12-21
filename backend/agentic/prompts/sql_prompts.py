def get_schema_linking_prompt(schema_str: str, question: str, temporal_context: str = "", history_context: str = "") -> str:
    return (
        f"Database Schema:\n{schema_str}\n\n"
        f"Temporal Context: {temporal_context}\n\n"
        f"Conversation History:\n{history_context}\n\n"
        f"User Question: {question}\n\n"
        "Identify the relevant tables and columns required to answer the question. "
        "If this is a follow-up, refer to the history above to understand the scope. "
        "List them and reason precisely why they are relevant."
    )

def get_subproblem_prompt(question: str, schema_links: str, history_context: str = "") -> str:
    return (
        f"Rules: Decompose the query into clause-level subproblems (WHERE, GROUP BY, JOIN, etc.). "
        f"Return a JSON object where keys are clause types and values are the partial logic.\n\n"
        f"Conversation History:\n{history_context}\n\n"
        f"Question: {question}\n"
        f"Schema Context: {schema_links}\n\n"
        "Subproblems JSON:"
    )

def get_query_plan_prompt(question: str, subproblems: str, history_context: str = "") -> str:
    return (
        f"Conversation History:\n{history_context}\n\n"
        f"User Question: {question}\n"
        f"Subproblems: {subproblems}\n\n"
        "Generate a concise, logical analytical plan to answer the user's question. "
        "Focus on: 1. Identifying the correct data sources (tables). "
        "2. Defining the filters (time range, symbol). "
        "3. Specifying the required columns and any aggregations. "
        "CRITICAL: Do NOT describe internal database engine steps like 'Query Parsing', 'Index Scan', 'Physical Scan', or 'Predicate Push-down'. "
        "Keep the plan focused on the *data* logic, not the *execution* mechanics."
    )

def get_sql_generation_prompt(schema_str: str, question: str, plan: str, temporal_context: str = "", history_context: str = "") -> str:
    return (
        f"Database Schema:\n{schema_str}\n\n"
        f"Temporal Context: {temporal_context}\n\n"
        f"Conversation History:\n{history_context}\n\n"
        f"User Question: {question}\n"
        f"Query Plan: {plan}\n\n"
        "Generate the executable SQL query inside a markdown block (```sql ... ```). "
        "Ensure it is syntactically valid PostgreSQL standards.\n"
        "If the plan depends on previous query results mentioned in history, incorporate that logic.\n"
        "CRITICAL: Always return results in DESCENDING order of date (latest first) unless explicitly asked otherwise.\n"
        "CRITICAL: If table or column names contain MixedCase or Uppercase letters (e.g., 'companyName'), "
        "you MUST double-quote them (e.g., \"companyName\"). PostgreSQL lowercases unquoted identifiers, causing errors.\n"
        "CRITICAL: Be extremely precise with dates. Use the temporal context provided to decide the correct year."
    )

def get_correction_plan_prompt(question: str, query: str, error: str, schema_links: str) -> str:
    return (
        f"The following SQL query failed.\n"
        f"Question: {question}\n"
        f"Invalid Query: {query}\n"
        f"Error Message: {error}\n"
        f"Relevant Schema: {schema_links}\n\n"
        "Analyze the error and provide a specific plan to fix the SQL query. "
        "Focus on the error cause (e.g., Syntax, logic, schema mismatch)."
    )

def get_question_splitter_prompt(question: str, history_context: str = "") -> str:
    return (
        f"Conversation History:\n{history_context}\n\n"
        f"Analyze the User Request: \"{question}\"\n\n"
        "Determine if this request contains multiple *independent* questions that should be executed as separate SQL queries. "
        "If history reveals this is a follow-up refinement, keep it as a single focused question. "
        "Output ONLY a JSON list of strings (e.g. [\"question 1\", \"question 2\"]). "
        "If it is a single question or the parts are best answered by one query (e.g. comparisons), return a list with one item."
    )

def get_correction_sql_prompt(question: str, query: str, plan: str, schema_links: str) -> str:
    return f"""
You are a PostgreSQL expert.
Original Question: {question}
Failed Query: {query}
Correction Plan: {plan}
Schema Context: {schema_links}

Please write the CORRECTED SQL query based on the plan.
Ensure you handle the error specifically (e.g. if column missing, use alternative).
Output ONLY the SQL.
"""

def get_thought_rephrase_prompt(base_text: str, context: str) -> str:
    """Rephrases intermediate thought steps into an internal monologue style."""
    return f"""
Rephrase the following analytical step to be specific to: "{context}".
Base Text: "{base_text}"

Requirements:
- Use FIRST-PERSON professional active voice (e.g., "I am identifying...", "I am calculating...").
- Tone: Professional, concise, and sentence-case.
- **NO ALL CAPS**: Do not use all caps. Use standard sentence case.
- Length: 6-10 words maximum.
- Do NOT use markdown or punctuation like quotes.
- Return ONLY the rephrased monologue.
"""

def get_analysis_intro_prompt(base_text: str, context: str) -> str:
    """Rephrases the main result introduction into a formal analyst style."""
    return f"""
Rephrase this introduction to be a formal analytical thesis for: "{context}".
Base Text: "{base_text}"

Requirements:
- Use FIRST-PERSON expert persona (e.g., "I have executed a comprehensive scan...", "I have formulated an analysis...").
- Style: Professional, precise, and executive.
- **NO ALL CAPS**: Do not use all caps. Use standard sentence case.
- No markdown, no quotes.
- Return ONLY the text.
"""
