from typing import Dict, Any, List
from .base import BaseTool, ToolParameter


class GetStockPriceTool(BaseTool):
    """Get current or historical stock price"""
    
    @property
    def name(self) -> str:
        return "get_stock_price"
    
    @property
    def description(self) -> str:
        return "Get current price or historical price data for a stock symbol"
    
    @property
    def parameters(self) -> List[ToolParameter]:
        return [
            ToolParameter(name="symbol", type="string", description="Stock symbol (e.g., NABIL, ADBL)"),
            ToolParameter(name="start_date", type="string", description="Start date (YYYY-MM-DD)", required=False),
            ToolParameter(name="end_date", type="string", description="End date (YYYY-MM-DD)", required=False),
        ]
    
    def execute(self, user, symbol: str, start_date: str = None, end_date: str = None) -> Dict[str, Any]:
        from stocks.models import DailyStockPrice, Company
        
        # Verify symbol exists
        if not Company.objects.filter(symbol=symbol).exists():
            return {"error": f"Symbol {symbol} not found"}
        
        queryset = DailyStockPrice.objects.filter(ticker=symbol)
        
        if start_date:
            queryset = queryset.filter(date__gte=start_date)
        if end_date:
            queryset = queryset.filter(date__lte=end_date)
        
        prices = list(queryset.order_by('-date')[:30].values(
            'date', 'open', 'high', 'low', 'close', 'volume', 'turnover'
        ))
        
        if not prices:
            return {"error": f"No price data found for {symbol}"}
        
        # Convert Decimal and date to serializable formats
        for price in prices:
            price['date'] = price['date'].isoformat()
            for key in ['open', 'high', 'low', 'close', 'volume', 'turnover']:
                if price[key] is not None:
                    price[key] = float(price[key])
        
        return {
            "symbol": symbol,
            "current_price": float(prices[0]['close']) if prices else None,
            "price_data": prices
        }


class SearchStocksTool(BaseTool):
    """Search for stocks by name or symbol"""
    
    @property
    def name(self) -> str:
        return "search_stocks"
    
    @property
    def description(self) -> str:
        return "Search for stocks by name or symbol. Returns matching companies."
    
    @property
    def parameters(self) -> List[ToolParameter]:
        return [
            ToolParameter(name="query", type="string", description="Search query (symbol or company name)"),
            ToolParameter(name="sector", type="string", description="Filter by sector", required=False),
        ]
    
    def execute(self, user, query: str, sector: str = None) -> Dict[str, Any]:
        from stocks.models import Company
        from django.db.models import Q
        
        queryset = Company.objects.all()
        
        if sector:
            queryset = queryset.filter(sector=sector)
        
        # Search by symbol or name
        queryset = queryset.filter(
            Q(symbol__icontains=query) | Q(name__icontains=query)
        )[:10]
        
        results = list(queryset.values('symbol', 'name', 'sector', 'instrument_type'))
        
        return {
            "query": query,
            "results": results,
            "count": len(results)
        }
