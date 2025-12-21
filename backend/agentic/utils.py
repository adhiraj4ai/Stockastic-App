import json
from typing import List, Dict, Any, Union

def json_to_markdown_table(data: Union[List[Dict[str, Any]], str]) -> str:
    """
    Converts a list of dictionaries to a special tag for the frontend DataTable.
    Format: <<<DATA_TABLE:{json_string}>>>
    """
    if isinstance(data, str):
        return data
        
    if not isinstance(data, list) or not data:
        return "No data found."
    
    # Return special tag for frontend rendering
    # Using default=str to handle dates/decimals if any
    return f"<<<DATA_TABLE:{json.dumps(data, default=str)}>>>"
