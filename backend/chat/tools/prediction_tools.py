from typing import Dict, Any, List
from .base import BaseTool, ToolParameter

class GetStockPredictionTool(BaseTool):
    """(Disabled) Get AI price prediction for a stock"""
    
    @property
    def name(self) -> str:
        return "get_stock_prediction"
    
    @property
    def description(self) -> str:
        return "Feature Disabled: AI forecasting service has been removed."
    
    @property
    def parameters(self) -> List[ToolParameter]:
        return []
    
    def execute(self, user, **kwargs) -> Dict[str, Any]:
        return {"error": "AI Forecasting feature is currently disabled."}
