import pandas as pd
from chat.python_executor import execute_chart_code
import json

# Mock Data
df = pd.DataFrame({
    'category': ['A', 'B', 'C'],
    'value': [10, 20, 30]
})

# Mock LLM Code using a function (this creates a nested scope)
# If globals aren't set correctly, 'df' won't be visible inside get_data()
code = """
def get_data():
    return [
        {"value": row['value'], "name": row['category']} 
        for _, row in df.iterrows()
    ]

chart_options = {
    "title": {"text": "Test Pie Chart"},
    "series": [
        {
            "type": "pie",
            "data": get_data()
        }
    ]
}
"""

print(f"Testing code execution with df shape: {df.shape}")
try:
    result = execute_chart_code(df, code)
    print("Execution Result:", result)
    
    parsed = json.loads(result)
    if "error" in parsed:
        print("TEST FAILED: Error returned ->", parsed["error"])
    else:
        print("TEST SUCCESS: Valid JSON generated.")

except Exception as e:
    print(f"TEST CRASHED: {e}")
