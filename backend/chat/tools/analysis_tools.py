from typing import Dict, Any, List
from django.db import connections
from .base import BaseTool, ToolParameter

class AnalyzePortfolioRiskTool(BaseTool):
    """Analyze portfolio for risks like stocks near stop-loss"""
    
    @property
    def name(self) -> str:
        return "analyze_portfolio_risk"
    
    @property
    def description(self) -> str:
        return "Analyze your portfolio for potential risks, focusing on stocks trading near their stop-loss levels."
    
    @property
    def parameters(self) -> List[ToolParameter]:
        return []
    
    def execute(self, user) -> Dict[str, Any]:
        from stocks.models import PortfolioItem, DailyStockPrice
        
        items = PortfolioItem.objects.filter(user=user)
        at_risk = []
        
        for item in items:
            if not item.stop_loss_price:
                continue
                
            latest = DailyStockPrice.objects.filter(ticker=item.ticker).order_by('-date').first()
            if not latest:
                continue
                
            ltp = float(latest.close)
            sl = float(item.stop_loss_price)
            
            # If LTP is within 3% of SL, it's at risk
            distance = ((ltp - sl) / sl) * 100
            
            if 0 <= distance <= 3:
                at_risk.append({
                    "symbol": item.ticker,
                    "ltp": ltp,
                    "stop_loss": sl,
                    "distance_percent": round(distance, 2),
                    "status": "CRITICAL" if distance < 1 else "WARNING"
                })
            elif ltp < sl:
                 at_risk.append({
                    "symbol": item.ticker,
                    "ltp": ltp,
                    "stop_loss": sl,
                    "distance_percent": round(distance, 2),
                    "status": "STOPPED_OUT"
                })
        
        return {
            "at_risk_count": len(at_risk),
            "alerts": at_risk
        }

class GetPortfolioDiversificationTool(BaseTool):
    """Analyze portfolio sector diversification"""
    
    @property
    def name(self) -> str:
        return "get_portfolio_diversification"
    
    @property
    def description(self) -> str:
        return "Analyze your portfolio's diversification across different sectors."
    
    @property
    def parameters(self) -> List[ToolParameter]:
        return []
    
    def execute(self, user) -> Dict[str, Any]:
        from stocks.models import PortfolioItem, Company, DailyStockPrice
        from collections import defaultdict
        
        items = PortfolioItem.objects.filter(user=user)
        sector_weights = defaultdict(float)
        total_value = 0
        
        for item in items:
            company = Company.all_objects.filter(symbol=item.ticker).first()
            sector = company.sector if company else "Unknown"
            
            latest = DailyStockPrice.objects.filter(ticker=item.ticker).order_by('-date').first()
            current_value = float(latest.close if latest else item.buy_price) * item.quantity
            
            sector_weights[sector] += current_value
            total_value += current_value
            
        if total_value == 0:
            return {"message": "Portfolio is empty"}
            
        diversification = [
            {
                "sector": sector,
                "value": round(val, 2),
                "weight_percent": round((val / total_value) * 100, 2)
            }
            for sector, val in sector_weights.items()
        ]
        
        diversification.sort(key=lambda x: x['weight_percent'], reverse=True)
        
        return {
            "total_value": round(total_value, 2),
            "sectors": diversification,
            "is_diversified": len(diversification) > 3,
            "concentration_risk": diversification[0]['sector'] if diversification[0]['weight_percent'] > 40 else None
        }

class GetPortfolioOptimizationTool(BaseTool):
    """Optimize portfolio using various mathematical models"""
    
    @property
    def name(self) -> str:
        return "get_portfolio_optimization"
    
    @property
    def description(self) -> str:
        return "Optimize a list of stocks to find optimal weights using models like Mean-Variance (Max Sharpe, Min Vol), HRP, or CVaR."
    
    @property
    def parameters(self) -> List[ToolParameter]:
        return [
            ToolParameter(name="tickers", type="array", description="List of stock symbols to optimize", required=True),
            ToolParameter(name="method", type="string", description="Optimization method", enum=["max_sharpe", "min_vol", "hrp", "cvar", "max_diversification"], required=False),
        ]
    
    def execute(self, user, tickers: List[str], method: str = "max_sharpe") -> Dict[str, Any]:
        from stocks.optimization import perform_portfolio_optimization
        
        try:
            # We don't pass current_holdings here to allow generic optimization
            result = perform_portfolio_optimization(tickers, method=method)
            
            # Convert any non-serializable objects (like Decimal or Timestamp) in weights
            if 'weights' in result:
                result['weights'] = {k: float(v) for k, v in result['weights'].items()}
            
            if 'performance' in result:
                for k, v in result['performance'].items():
                    if v is not None:
                        result['performance'][k] = float(v)
            
            return {
                "tickers": tickers,
                "method": method,
                "optimized_weights": result.get('weights', {}),
                "performance_metrics": result.get('performance', {}),
                "potential_trades": result.get('trades', [])
            }
        except Exception as e:
            return {"error": f"Portfolio optimization failed: {str(e)}"}

class GetStockCorrelationTool(BaseTool):
    """Calculate correlation matrix for a list of stocks"""
    
    @property
    def name(self) -> str:
        return "get_stock_correlation"
    
    @property
    def description(self) -> str:
        return "Calculate the correlation matrix for a list of stocks to evaluate diversification benefits."
    
    @property
    def parameters(self) -> List[ToolParameter]:
        return [
            ToolParameter(name="tickers", type="array", description="List of stock symbols", required=True),
            ToolParameter(name="days", type="number", description="Number of days for historical data", required=False),
        ]
    
    def execute(self, user, tickers: List[str], days: int = 252) -> Dict[str, Any]:
        import pandas as pd
        from datetime import date, timedelta
        from stocks.models import DailyStockPrice
        
        try:
            start_date = date.today() - timedelta(days=days + 30) # extra for weekends
            
            # Fetch data efficiently
            qs = DailyStockPrice.objects.filter(
                ticker__in=tickers,
                date__gte=start_date
            ).values('ticker', 'date', 'close').order_by('date')
            
            if not qs.exists():
                return {"error": "No historical data found for these tickers."}
            
            df = pd.DataFrame(list(qs))
            df['close'] = pd.to_numeric(df['close'])
            
            # Pivot to wide format
            pivot_df = df.pivot(index='date', columns='ticker', values='close')
            
            # Calculate daily returns
            returns = pivot_df.pct_change().dropna()
            
            if returns.empty:
                return {"error": "Insufficient data to calculate correlations."}
            
            # Calculate correlation matrix
            corr_matrix = returns.corr().round(4)
            
            return {
                "tickers": tickers,
                "days": days,
                "correlation_matrix": corr_matrix.to_dict()
            }
        except Exception as e:
            return {"error": f"Correlation calculation failed: {str(e)}"}
