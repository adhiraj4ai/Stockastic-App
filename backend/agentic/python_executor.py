from typing import Dict
import pandas as pd
import json
import traceback
import datetime
import numpy as np

def execute_chart_code(df: pd.DataFrame, code: str) -> str:
    """
    Executes Python code to generate an ECharts option dictionary.
    
    Args:
        df: The pandas DataFrame containing the data.
        code: The Python code string to execute. It must define a variable 'chart_options' (dict).
        
    Returns:
        A JSON string of the chart_options dictionary, or an error message.
    """
    # Create the execution environment
    local_scope = {
        "df": df,
        "pd": pd,
        "json": json,
        "datetime": datetime,
        "np": np
    }
    
    try:
        # Execute the code - pass local_scope as globals so functions see 'df'
        exec(code, local_scope)
        
        # specific variable we expect the code to create
        if "chart_options" not in local_scope:
            return json.dumps({
                "error": "The code did not define a 'chart_options' dictionary."
            })
            
        chart_options = local_scope["chart_options"]
        
        if not isinstance(chart_options, dict):
             return json.dumps({
                "error": "'chart_options' must be a dictionary."
            })

        # Serialize to JSON to ensure it's valid for frontend
        return json.dumps(chart_options, default=str)
        
    except Exception as e:
        return json.dumps({
            "error": f"Error executing chart code: {str(e)}",
            "traceback": traceback.format_exc()
        })

def execute_calculation_code(df: pd.DataFrame, code: str) -> Dict:
    """
    Executes Python code to calculate technical indicators.
    Expected output variable: 'computed_results' (dict).
    """
    local_scope = {
        "df": df,
        "pd": pd,
        "json": json,
        "datetime": datetime,
        "np": np
    }
    
    try:
        # Execute the code
        exec(code, local_scope)
        
        if "computed_results" not in local_scope:
            return {"error": "The code did not define a 'computed_results' dictionary."}
            
        results = local_scope["computed_results"]
        
        if not isinstance(results, dict):
             return {"error": "'computed_results' must be a dictionary."}

        return results
        
    except Exception as e:
        return {
            "error": f"Error executing calculation code: {str(e)}",
            "traceback": traceback.format_exc()
        }
