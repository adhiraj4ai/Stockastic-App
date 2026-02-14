from typing import Dict, Any, List
from .base import BaseTool, ToolParameter

class GetSystemStatusTool(BaseTool):
    """Check system data freshness and status"""
    
    @property
    def name(self) -> str:
        return "get_system_status"
    
    @property
    def description(self) -> str:
        return "Check the freshness of market data, including the last update times for stock prices, floorsheets, and market summaries."
    
    @property
    def parameters(self) -> List[ToolParameter]:
        return []
    
    def execute(self, user) -> Dict[str, Any]:
        from stocks.models import DailyStockPrice, DailyFloorsheet, DailyMarketSummary
        from django.utils import timezone
        
        try:
            latest_price = DailyStockPrice.objects.order_by('-date').first()
            latest_floorsheet = DailyFloorsheet.objects.order_by('-transaction_date').first()
            latest_summary = DailyMarketSummary.objects.order_by('-date').first()
            
            return {
                "current_time": timezone.now().isoformat(),
                "last_price_update": latest_price.date.isoformat() if latest_price else None,
                "last_floorsheet_update": latest_floorsheet.transaction_date.isoformat() if latest_floorsheet else None,
                "last_market_summary": latest_summary.date.isoformat() if latest_summary else None,
                "status": "Operational"
            }
        except Exception as e:
            return {"error": f"Failed to fetch system status: {str(e)}"}
