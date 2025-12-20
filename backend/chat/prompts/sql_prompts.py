def get_schema_linking_prompt(schema_str: str, question: str, temporal_context: str = "") -> str:
    return (
        f"Database Schema:\n{schema_str}\n\n"
        f"Temporal Context: {temporal_context}\n\n"
        f"User Question: {question}\n\n"
        "Identify the relevant tables and columns required to answer the question. "
        "List them and explain the relationships (joins) if multiple tables are involved."
    )

def get_subproblem_prompt(question: str, schema_links: str) -> str:
    return (
        f"Rules: Decompose the query into clause-level subproblems (WHERE, GROUP BY, JOIN, etc.). "
        f"Return a JSON object where keys are clause types and values are the partial logic.\n\n"
        f"Question: {question}\n"
        f"Schema Context: {schema_links}\n\n"
        "Subproblems JSON:"
    )

def get_query_plan_prompt(question: str, subproblems: str) -> str:
    return (
        f"User Question: {question}\n"
        f"Subproblems: {subproblems}\n\n"
        "Generate a step-by-step execution plan (Chain-of-Thought) to retrieve the answer. "
        "Do NOT write SQL code yet. Just describe the logical steps."
    )

def get_sql_generation_prompt(schema_str: str, question: str, plan: str, temporal_context: str = "") -> str:
    return (
        f"Database Schema:\n{schema_str}\n\n"
        f"Temporal Context: {temporal_context}\n\n"
        f"User Question: {question}\n"
        f"Query Plan: {plan}\n\n"
        "Generate the executable SQL query inside a markdown block (```sql ... ```). "
        "Ensure it is syntactically valid PostgreSQL standards.\n"
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

def get_question_splitter_prompt(question: str) -> str:
    return (
        f"Analyze the User Request: \"{question}\"\n\n"
        "Determine if this request contains multiple *independent* questions that should be executed as separate SQL queries. "
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
Rephrase the following process step description to be specific to the context of the user's question: "{context}".
Base Text: "{base_text}"

Requirements:
- Use FIRST-PERSON active voice (e.g., "I need to check...", "I have found...", "Now I will...").
- Make it sound like an internal monologue of a data analyst.
- Keep it short (max 6-10 words).
- Do NOT use markdown or quotes.
- Just return the new text.
"""

def get_analysis_intro_prompt(base_text: str, context: str) -> str:
    """Rephrases the main result introduction into a formal analyst style."""
    return f"""
Rephrase the following introductory text to be formal, professional, and directly related to the analysis of the user's question: "{context}".

Base Text: "{base_text}"

Requirements:
- Use FIRST-PERSON professional voice (e.g., "Based on my analysis of your request regarding...", "I have formulated the following query to examine...").
- Ensure the text acknowledges the specific goal of the user's analytical request.
- Maintain a highly professional and data-analyst tone.
- Keep it concise but descriptive (one complete sentence).
- Do NOT use markdown or quotes.
- Just return the new text.
"""
