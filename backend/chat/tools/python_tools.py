import sys
import io
import pandas as pd
import numpy as np
from typing import Dict, Any, List
from .base import BaseTool, ToolParameter
from ..db_utils import get_reference_date

class PythonDataAnalysisTool(BaseTool):
    """Execute Python code for advanced data analysis"""
    
    @property
    def name(self) -> str:
        return "python_analysis"
    
    @property
    def description(self) -> str:
        return (
            "Execute Python code for complex data analysis, statistical modeling, "
            "and technical calculations. You have access to pandas (pd), numpy (np), "
            "and a helper function get_data(symbol, days) which returns a DataFrame "
            "of historical prices. Standard output is captured and returned."
        )
    
    @property
    def parameters(self) -> List[ToolParameter]:
        return [
            ToolParameter(
                name="code",
                type="string",
                description="The Python code to execute for analysis.",
                required=True
            ),
        ]
    
    def execute(self, user, code: str) -> Dict[str, Any]:
        from stocks.models import DailyStockPrice, Company, StrategySignal, DailyMarketSummary
        from datetime import timedelta
        
        # Helper function to get historical price data
        def get_data(symbol: str, days: int = 252) -> pd.DataFrame:
            end_date = get_reference_date()
            start_date = end_date - timedelta(days=days + 60) # Buffer for non-trading days
            
            qs = DailyStockPrice.objects.filter(
                ticker=symbol.upper(),
                date__gte=start_date,
                date__lte=end_date
            ).order_by('date').values('date', 'open', 'high', 'low', 'close', 'volume')
            
            if not qs:
                return pd.DataFrame()
            
            df = pd.DataFrame(list(qs))
            df['date'] = pd.to_datetime(df['date'])
            for col in ['open', 'high', 'low', 'close', 'volume']:
                df[col] = pd.to_numeric(df[col], errors='coerce')
            
            return df.tail(days)

        # Helper to get fundamental data
        def get_fundamentals(symbol: str) -> Dict[str, Any]:
            company = Company.all_objects.filter(symbol=symbol.upper()).first()
            if not company: return {}
            return {
                "symbol": company.symbol,
                "sector": company.sector,
                "market_cap": float(company.market_cap) if company.market_cap else 0,
                "listing_date": company.listing_date.isoformat() if company.listing_date else None
            }

        # Helper to get recent signals
        def get_signals(symbol: str = None, days: int = 30) -> pd.DataFrame:
            start_date = get_reference_date() - timedelta(days=days)
            qs = StrategySignal.objects.filter(date__gte=start_date)
            if symbol:
                qs = qs.filter(symbol=symbol.upper())
            
            data = list(qs.order_by('-date').values('symbol', 'signal', 'date', 'last_close', 'strategy__name'))
            if not data: return pd.DataFrame()
            
            df = pd.DataFrame(data)
            df['date'] = pd.to_datetime(df['date'])
            return df

        # Helper to get market summary
        def get_market_summary() -> Dict[str, Any]:
            summary = DailyMarketSummary.objects.order_by('-date').first()
            if not summary: return {}
            return {
                "date": summary.date.isoformat(),
                "turnover": float(summary.total_turnover),
                "volume": summary.total_volume,
                "sectors": summary.sector_turnover
            }
        
        # Capture stdout
        stdout_capture = io.StringIO()
        original_stdout = sys.stdout
        sys.stdout = stdout_capture
        
        # Environment for execution - strictly limited
        safe_globals = {
            "__builtins__": {
                "print": print,
                "range": range,
                "len": len,
                "list": list,
                "dict": dict,
                "set": set,
                "int": int,
                "float": float,
                "str": str,
                "bool": bool,
                "abs": abs,
                "min": min,
                "max": max,
                "sum": sum,
                "round": round,
                "enumerate": enumerate,
                "zip": zip,
                "any": any,
                "all": all,
                "sorted": sorted,
                "ValueError": ValueError,
                "TypeError": TypeError,
                "Exception": Exception,
            },
            "pd": pd,
            "np": np,
            "get_data": get_data,
            "get_fundamentals": get_fundamentals,
            "get_signals": get_signals,
            "get_market_summary": get_market_summary,
        }
        
        try:
            # We use a restricted builtins to prevent import, eval, etc.
            exec(code, safe_globals, {})
            output = stdout_capture.getvalue()
        except Exception as e:
            output = f"Execution Error: {str(e)}"
        finally:
            sys.stdout = original_stdout
            
        return {
            "output": output,
            "status": "success" if "Execution Error" not in output else "error"
        }
