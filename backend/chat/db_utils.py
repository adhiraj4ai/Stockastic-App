from django.db import connection, ensure_atomic_transaction
from collections import defaultdict

def get_database_schema_string():
    """
    Introspects the database to return a string representation of the schema.
    Returns tables and their columns with types.
    """
    schema_str = []
    
    # We can use Django's connection.introspection, but explicit whitelist 
    # based on key models seen in external_schema.py is safer and cleaner for the LLM.
    # We'll stick to the core financial tables to avoid clutter.
    
    target_tables = [
        'companies', 
        'daily_stock_price', 
        'daily_floorsheet', 
        'daily_buyer_floorsheet', 
        'daily_seller_floorsheet',
        'portfolios',
        'transactions',
        'strategies',
        'financial_reports', # inferred from code likely existing or relevant
        'dividend'
    ]
    
    with connection.cursor() as cursor:
        # Get all tables first
        cursor.execute("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'")
        all_tables = [row[0] for row in cursor.fetchall()]
        
        for table in target_tables:
            if table in all_tables:
                cursor.execute(f"SELECT column_name, data_type FROM information_schema.columns WHERE table_name = '{table}'")
                columns = cursor.fetchall()
                
                col_strs = [f"{col[0]} ({col[1]})" for col in columns]
                schema_str.append(f"Table: {table}\nColumns: {', '.join(col_strs)}\n")
                
    return "\n".join(schema_str)

def execute_sql_query(query: str):
    """
    Executes a read-only SQL query and returns the results.
    """
    # Safety check: prevent modification
    if not query.strip().lower().startswith("select"):
        return {"error": "Only SELECT queries are allowed for safety."}
        
    try:
        with connection.cursor() as cursor:
            cursor.execute(query)
            columns = [col[0] for col in cursor.description]
            results = cursor.fetchall()
            
            # Format as list of dicts
            data = [dict(zip(columns, row)) for row in results]
            return {"columns": columns, "data": data}
            
    except Exception as e:
        return {"error": str(e)}
