import pandas as pd
from chat.python_executor import execute_chart_code
import json

# Mock Data
df = pd.DataFrame({
    'category': ['A', 'B', 'C'],
    'value': [10, 20, 30]
})

# Mock LLM Code (standard ECharts Pie)
code = """
chart_options = {
    "title": {"text": "Test Pie Chart"},
    "tooltip": {"trigger": "item"},
    "series": [
        {
            "type": "pie",
            "data": [
                {"value": row['value'], "name": row['category']} 
                for _, row in df.iterrows()
            ]
        }
    ]
}
"""

try:
    result = execute_chart_code(df, code)
    print("Result JSON:", result)
    parsed = json.loads(result)
    if "series" in parsed and parsed["series"][0]["type"] == "pie":
        print("SUCCESS: Valid Pie Chart JSON generated.")
    else:
        print("FAILURE: Invalid JSON structure.")
except Exception as e:
    print(f"ERROR: {e}")
