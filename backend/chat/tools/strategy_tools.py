from typing import Dict, Any, List
from datetime import date, timedelta
from .base import BaseTool, ToolParameter
from ..db_utils import get_reference_date


class GetStrategySignalsTool(BaseTool):
    """Get trading signals from strategies"""
    
    @property
    def name(self) -> str:
        return "get_strategy_signals"
    
    @property
    def description(self) -> str:
        return "Get the latest trading signals (BUY/SELL/HOLD) from trading strategies"
    
    @property
    def parameters(self) -> List[ToolParameter]:
        return [
            ToolParameter(name="symbol", type="string", description="Stock symbol to filter signals", required=False),
            ToolParameter(name="signal_type", type="string", description="Signal type filter", enum=["BUY", "SELL", "HOLD"], required=False),
            ToolParameter(name="limit", type="number", description="Maximum number of signals to return", required=False),
        ]
    
    def execute(self, user, symbol: str = None, signal_type: str = None, limit: int = 20) -> Dict[str, Any]:
        from stocks.models import StrategySignal
        
        # Get signals from last 7 days
        week_ago = get_reference_date() - timedelta(days=7)
        queryset = StrategySignal.objects.filter(date__gte=week_ago)
        
        if symbol:
            queryset = queryset.filter(symbol=symbol)
        if signal_type:
            queryset = queryset.filter(signal=signal_type)
        
        signals = list(queryset.select_related('strategy').order_by('-date')[:limit].values(
            'symbol', 'signal', 'date', 'last_close', 'strategy__name', 'metadata'
        ))
        
        # Convert dates and decimals
        for signal in signals:
            signal['date'] = signal['date'].isoformat()
            if signal['last_close']:
                signal['last_close'] = float(signal['last_close'])
        
        return {
            "signals": signals,
            "count": len(signals),
            "filters": {
                "symbol": symbol,
                "signal_type": signal_type
            }
        }


class ListStrategiesTool(BaseTool):
    """List available trading strategies"""
    
    @property
    def name(self) -> str:
        return "list_strategies"
    
    @property
    def description(self) -> str:
        return "List all available trading strategies with their performance metrics"
    
    @property
    def parameters(self) -> List[ToolParameter]:
        return [
            ToolParameter(name="public_only", type="boolean", description="Show only public strategies", required=False),
        ]
    
    def execute(self, user, public_only: bool = False) -> Dict[str, Any]:
        from stocks.models import Strategy
        from django.db.models import Q
        
        if public_only:
            queryset = Strategy.objects.filter(is_public=True)
        else:
            queryset = Strategy.objects.filter(Q(user=user) | Q(is_public=True))
        
        strategies = list(queryset.values(
            'id', 'name', 'description', 'win_rate', 'pnl_percent', 
            'sharpe_ratio', 'max_drawdown', 'is_public'
        ))
        
        # Convert decimals
        for strategy in strategies:
            for key in ['win_rate', 'pnl_percent', 'sharpe_ratio', 'max_drawdown']:
                if strategy[key] is not None:
                    strategy[key] = float(strategy[key])
        
        return {
            "strategies": strategies,
            "count": len(strategies)
        }

class GetBrokerAccumulationSignalsTool(BaseTool):
    """Get signals from the Broker Accumulation Strategy"""
    
    @property
    def name(self) -> str:
        return "get_broker_accumulation_signals"
    
    @property
    def description(self) -> str:
        return "Generate buy/sell signals based on institutional broker accumulation patterns combined with technical indicators."
    
    @property
    def parameters(self) -> List[ToolParameter]:
        return [
            ToolParameter(name="sector", type="string", description="Optional sector filter (e.g., Commercial Banks)", required=False),
            ToolParameter(name="date", type="string", description="Analysis date (YYYY-MM-DD)", required=False),
        ]
    
    def execute(self, user, sector: str = None, date: str = None) -> Dict[str, Any]:
        from stocks.views.recommendations import BrokerAccumulationRecommendationEngine
        
        try:
            engine = BrokerAccumulationRecommendationEngine()
            recommendations = engine.execute(transaction_date=date, sector=sector)
            
            return {
                "strategy": "Broker Accumulation (Institutional)",
                "date": date or "Latest",
                "count": len(recommendations),
                "recommendations": recommendations[:15]
            }
        except Exception as e:
            return {"error": f"Failed to generate signals: {str(e)}"}

class GetSmartCrossoverSignalsTool(BaseTool):
    """Get signals from the Smart Accumulated Crossover Strategy"""
    
    @property
    def name(self) -> str:
        return "get_smart_crossover_signals"
    
    @property
    def description(self) -> str:
        return "Generate signals for accumulated stocks using EMA/MACD/Bollinger Band crossovers. Only analyzes stocks with significant recent accumulation."
    
    @property
    def parameters(self) -> List[ToolParameter]:
        return [
            ToolParameter(name="sector", type="string", description="Optional sector filter", required=False),
            ToolParameter(name="date", type="string", description="Analysis date (YYYY-MM-DD)", required=False),
        ]
    
    def execute(self, user, sector: str = None, date: str = None) -> Dict[str, Any]:
        from stocks.views.recommendations import SmartAccumulatedCrossoverRecommendationEngine
        
        try:
            engine = SmartAccumulatedCrossoverRecommendationEngine()
            recommendations = engine.execute(transaction_date=date, sector=sector)
            
            return {
                "strategy": "Smart Accumulated Crossover",
                "date": date or "Latest",
                "count": len(recommendations),
                "recommendations": recommendations[:15]
            }
        except Exception as e:
            return {"error": f"Failed to generate signals: {str(e)}"}

class GetIchimokuSignalsTool(BaseTool):
    """Get signals from the Ichimoku Cloud + Accumulation Strategy"""
    
    @property
    def name(self) -> str:
        return "get_ichimoku_signals"
    
    @property
    def description(self) -> str:
        return "Generate buy/sell signals by combining Ichimoku Cloud trend analysis with broker accumulation data."
    
    @property
    def parameters(self) -> List[ToolParameter]:
        return [
            ToolParameter(name="sector", type="string", description="Optional sector filter", required=False),
            ToolParameter(name="date", type="string", description="Analysis date (YYYY-MM-DD)", required=False),
        ]
    
    def execute(self, user, sector: str = None, date: str = None) -> Dict[str, Any]:
        from stocks.views.recommendations import IchimokuAccumulationRecommendationEngine
        
        try:
            engine = IchimokuAccumulationRecommendationEngine()
            recommendations = engine.execute(transaction_date=date, sector=sector)
            
            return {
                "strategy": "Ichimoku Cloud + Accumulation",
                "date": date or "Latest",
                "count": len(recommendations),
                "recommendations": recommendations[:15]
            }
        except Exception as e:
            return {"error": f"Failed to generate signals: {str(e)}"}

class GetStrategyBacktestTool(BaseTool):
    """Run a backtest for a strategy on a specific ticker"""
    
    @property
    def name(self) -> str:
        return "get_strategy_backtest"
    
    @property
    def description(self) -> str:
        return "Run a historical backtest of a specific trading strategy on a stock symbol to see its hypothetical performance metrics like win rate and returns."
    
    @property
    def parameters(self) -> List[ToolParameter]:
        return [
            ToolParameter(name="strategy_id", type="number", description="ID of the strategy to backtest", required=True),
            ToolParameter(name="symbol", type="string", description="Stock symbol to backtest on", required=True),
            ToolParameter(name="start_date", type="string", description="Start date (YYYY-MM-DD)", required=False),
            ToolParameter(name="end_date", type="string", description="End date (YYYY-MM-DD)", required=False),
            ToolParameter(name="cash", type="number", description="Starting cash amount (default 1M)", required=False),
        ]
    
    def execute(self, user, strategy_id: int, symbol: str, start_date: str = None, end_date: str = None, cash: float = 1000000) -> Dict[str, Any]:
        from stocks.models import Strategy
        from stocks.views.strategy import StrategyViewSet
        
        try:
            strategy = Strategy.objects.get(id=strategy_id)
            viewset = StrategyViewSet()
            
            # Use internal method for execution
            metrics, error, extras = viewset._run_single_backtest(
                strategy.code, symbol, start_date, end_date, params=None, cash=cash
            )
            
            if error:
                return {"error": f"Backtest failed: {error}"}
                
            return {
                "strategy": strategy.name,
                "symbol": symbol,
                "period": f"{start_date or 'Start'} to {end_date or 'End'}",
                "metrics": metrics,
                "plot_url": "Available in the interactive chart" # We don't return raw HTML in tool call
            }
        except Strategy.DoesNotExist:
            return {"error": f"Strategy with ID {strategy_id} not found."}
        except Exception as e:
            return {"error": f"Backtest execution failed: {str(e)}"}

class OptimizeStrategyParamsTool(BaseTool):
    """Find optimal parameters for a strategy on a specific ticker"""
    
    @property
    def name(self) -> str:
        return "optimize_strategy_params"
    
    @property
    def description(self) -> str:
        return "Use machine learning (Optuna) to find the best performing parameters for a strategy on a specific symbol over a historical period."
    
    @property
    def parameters(self) -> List[ToolParameter]:
        return [
            ToolParameter(name="strategy_id", type="number", description="ID of the strategy", required=True),
            ToolParameter(name="symbol", type="string", description="Stock symbol to optimize for", required=True),
            ToolParameter(name="trials", type="number", description="Number of optimization trials (default 50)", required=False),
        ]
    
    def execute(self, user, strategy_id: int, symbol: str, trials: int = 50) -> Dict[str, Any]:
        from stocks.models import Strategy
        from stocks.views.strategy import StrategyViewSet
        from datetime import date, timedelta
        
        try:
            strategy = Strategy.objects.get(id=strategy_id)
            viewset = StrategyViewSet()
            
            # Simple 3 Year window for optimization
            end_date = date.today().isoformat()
            start_date = (date.today() - timedelta(days=3*365)).isoformat()
            
            # Extract params to optimize
            p_ranges = viewset._extract_params_simple(strategy.code)
            if not p_ranges:
                return {"error": "No parameters found in strategy code to optimize."}
            
            # Run optimization
            best_params, best_value = viewset._optimize_single_period(
                strategy.code, symbol, start_date, end_date, p_ranges, trials
            )
            
            return {
                "strategy": strategy.name,
                "symbol": symbol,
                "best_parameters": best_params,
                "expected_return": best_value,
                "trials_run": trials
            }
        except Strategy.DoesNotExist:
            return {"error": f"Strategy with ID {strategy_id} not found."}
        except Exception as e:
            return {"error": f"Optimization failed: {str(e)}"}

class CompareStrategiesTool(BaseTool):
    """Compare multiple strategies on a single symbol"""
    
    @property
    def name(self) -> str:
        return "compare_strategies"
    
    @property
    def description(self) -> str:
        return "Compare the performance of multiple trading strategies on a single stock symbol over the same historical period to identify the most effective one."
    
    @property
    def parameters(self) -> List[ToolParameter]:
        return [
            ToolParameter(name="strategy_ids", type="array", description="List of strategy IDs to compare", required=True),
            ToolParameter(name="symbol", type="string", description="Stock symbol to compare on", required=True),
            ToolParameter(name="days", type="number", description="Number of past days for comparison (default 365)", required=False),
        ]
    
    def execute(self, user, strategy_ids: List[int], symbol: str, days: int = 365) -> Dict[str, Any]:
        from stocks.models import Strategy
        from stocks.views.strategy import StrategyViewSet
        from datetime import date, timedelta
        
        try:
            end_date = date.today().isoformat()
            start_date = (date.today() - timedelta(days=days)).isoformat()
            viewset = StrategyViewSet()
            
            comparison_results = []
            for s_id in strategy_ids:
                try:
                    strategy = Strategy.objects.get(id=s_id)
                    metrics, error, _ = viewset._run_single_backtest(
                        strategy.code, symbol, start_date, end_date
                    )
                    
                    if not error:
                        comparison_results.append({
                            "id": s_id,
                            "name": strategy.name,
                            "return": metrics.get('Return [%]'),
                            "win_rate": metrics.get('Win Rate [%]'),
                            "sharpe": metrics.get('Sharpe Ratio'),
                            "drawdown": metrics.get('Max. Drawdown [%]')
                        })
                except Strategy.DoesNotExist:
                    continue
            
            # Sort by return descending
            comparison_results.sort(key=lambda x: x.get('return', -999) or -999, reverse=True)
            
            return {
                "symbol": symbol,
                "period_days": days,
                "results": comparison_results
            }
        except Exception as e:
            return {"error": f"Comparison failed: {str(e)}"}
