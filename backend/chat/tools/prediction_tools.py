from typing import Dict, Any, List
import requests
import os
from .base import BaseTool, ToolParameter

class GetStockPredictionTool(BaseTool):
    """Get AI price prediction for a stock"""
    
    @property
    def name(self) -> str:
        return "get_stock_prediction"
    
    @property
    def description(self) -> str:
        return "Get AI-generated price forecasts for a stock using ML models."
    
    @property
    def parameters(self) -> List[ToolParameter]:
        return [
            ToolParameter(name="symbol", type="string", description="Stock symbol", required=True),
            ToolParameter(name="days", type="number", description="Forecast horizon in days (default 30)", required=False),
        ]
    
    def execute(self, user, symbol: str, days: int = 30) -> Dict[str, Any]:
        # Internal Docker URL for ML service
        # If in docker, use container name. If local, use localhost:8001
        is_docker = os.path.exists('/.dockerenv')
        base_url = "http://stockastic-ml-service:8001" if is_docker else "http://localhost:8001"
        
        url = f"{base_url}/api/ml/forecasts/by_symbol/"
        
        try:
            response = requests.get(url, params={"symbol": symbol.upper(), "limit": days}, timeout=5)
            
            if response.status_code == 200:
                data = response.json()
                if not data:
                    return {"result": f"No active forecasts found for {symbol}. Training might be required."}
                
                # Format for LLM
                # Summarize the forecast trend
                latest = data[0] if data else {}
                start = data[-1] if data else {}
                
                trend = "Unknown"
                if latest and start:
                    p_start = float(start.get('predicted_price', 0))
                    p_end = float(latest.get('predicted_price', 0))
                    change = ((p_end - p_start) / p_start) * 100 if p_start > 0 else 0
                    trend = f"{change:+.2f}% over {len(data)} days"
                
                return {
                    "symbol": symbol.upper(),
                    "forecast_count": len(data),
                    "trend_summary": trend,
                    "latest_prediction": {
                        "date": latest.get('forecast_date'),
                        "price": float(latest.get('predicted_price', 0)),
                        "lower_bound": float(latest.get('confidence_lower', 0)) if latest.get('confidence_lower') else None,
                        "upper_bound": float(latest.get('confidence_upper', 0)) if latest.get('confidence_upper') else None,
                    }
                }
            else:
                return {"error": f"ML Service returned status {response.status_code}"}
                
        except requests.exceptions.ConnectionError:
            return {"error": "ML Service is currently unavailable."}
        except Exception as e:
            return {"error": f"Failed to fetch prediction: {str(e)}"}
