from typing import Dict, Any, List
from decimal import Decimal
from .base import BaseTool, ToolParameter


class GetPortfolioTool(BaseTool):
    """Get user's portfolio holdings"""
    
    @property
    def name(self) -> str:
        return "get_portfolio"
    
    @property
    def description(self) -> str:
        return "Get the user's current portfolio holdings with profit/loss information"
    
    @property
    def parameters(self) -> List[ToolParameter]:
        return [
            ToolParameter(name="account_id", type="number", description="Portfolio account ID", required=False),
        ]
    
    def execute(self, user, account_id: int = None) -> Dict[str, Any]:
        from stocks.models import PortfolioItem, DailyStockPrice
        
        queryset = PortfolioItem.objects.filter(user=user)
        if account_id:
            queryset = queryset.filter(account_id=account_id)
        
        holdings = []
        total_investment = Decimal('0')
        total_current_value = Decimal('0')
        
        for item in queryset:
            # Get current price
            latest_price = DailyStockPrice.objects.filter(
                ticker=item.ticker
            ).order_by('-date').first()
            
            current_price = latest_price.close if latest_price else item.buy_price
            investment = item.wacc * item.quantity
            current_value = current_price * item.quantity
            pnl = current_value - investment
            pnl_percent = (pnl / investment * 100) if investment > 0 else 0
            
            holdings.append({
                "ticker": item.ticker,
                "quantity": item.quantity,
                "buy_price": float(item.buy_price),
                "wacc": float(item.wacc),
                "current_price": float(current_price),
                "investment": float(investment),
                "current_value": float(current_value),
                "pnl": float(pnl),
                "pnl_percent": float(pnl_percent),
                "stop_loss": float(item.stop_loss_price) if item.stop_loss_price else None,
                "target_price": float(item.target_price) if item.target_price else None,
            })
            
            total_investment += investment
            total_current_value += current_value
        
        total_pnl = total_current_value - total_investment
        total_pnl_percent = (total_pnl / total_investment * 100) if total_investment > 0 else 0
        
        return {
            "holdings": holdings,
            "summary": {
                "total_investment": float(total_investment),
                "total_current_value": float(total_current_value),
                "total_pnl": float(total_pnl),
                "total_pnl_percent": float(total_pnl_percent),
                "holdings_count": len(holdings)
            }
        }


class GetWatchlistTool(BaseTool):
    """Get user's watchlist"""
    
    @property
    def name(self) -> str:
        return "get_watchlist"
    
    @property
    def description(self) -> str:
        return "Get the user's watchlist with current prices and price changes"
    
    @property
    def parameters(self) -> List[ToolParameter]:
        return []
    
    def execute(self, user) -> Dict[str, Any]:
        from stocks.models import WatchlistItem, DailyStockPrice
        
        watchlist = WatchlistItem.objects.filter(user=user)
        items = []
        
        for item in watchlist:
            prices = DailyStockPrice.objects.filter(
                ticker=item.ticker
            ).order_by('-date')[:2]
            
            if prices:
                current = prices[0]
                previous = prices[1] if len(prices) > 1 else current
                
                change = current.close - previous.close
                change_percent = (change / previous.close * 100) if previous.close > 0 else 0
                
                items.append({
                    "ticker": item.ticker,
                    "current_price": float(current.close),
                    "change": float(change),
                    "change_percent": float(change_percent),
                    "target_price": float(item.target_price) if item.target_price else None,
                    "notes": item.notes,
                    "added_at": item.added_at.isoformat()
                })
        
        return {
            "watchlist": items,
            "count": len(items)
        }
