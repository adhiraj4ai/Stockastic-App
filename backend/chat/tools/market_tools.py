from typing import Dict, Any, List
from datetime import date, timedelta
from collections import defaultdict
from .base import BaseTool, ToolParameter
from ..db_utils import get_reference_date


class GetMarketSummaryTool(BaseTool):
    """Get market summary and statistics"""
    
    @property
    def name(self) -> str:
        return "get_market_summary"
    
    @property
    def description(self) -> str:
        return "Get overall market summary including top gainers, losers, and turnover"
    
    @property
    def parameters(self) -> List[ToolParameter]:
        return [
            ToolParameter(name="date", type="string", description="Date for summary (YYYY-MM-DD)", required=False),
        ]
    
    def execute(self, user, date: str = None) -> Dict[str, Any]:
        from stocks.models import DailyMarketSummary, DailyStockPrice
        from django.db.models import Sum, F
        
        summary = None
        if date:
            summary = DailyMarketSummary.objects.filter(date=date).first()
        else:
            summary = DailyMarketSummary.objects.order_by('-date').first()
        
        if summary:
            return {
                "date": summary.date.isoformat(),
                "total_turnover": float(summary.total_turnover),
                "total_volume": summary.total_volume,
                "total_transactions": summary.total_transactions,
                "top_gainers": summary.top_gainers[:5],
                "top_losers": summary.top_losers[:5],
                "top_turnovers": summary.top_turnovers[:5],
                "sector_turnover": summary.sector_turnover
            }
            
        # Fallback: Calculate from DailyStockPrice if summary table is empty
        ref_date = date if date else get_reference_date()
        prices = DailyStockPrice.objects.filter(date=ref_date)
        
        if not prices.exists():
             return {"error": f"No market data found for {ref_date}"}
             
        stats = prices.aggregate(
            turnover=Sum('turnover'),
            volume=Sum('volume'),
            transactions=Sum('transactions')
        )
        
        # Get movers
        all_prices = list(prices.values('ticker', 'percent_change', 'turnover'))
        all_prices.sort(key=lambda x: x['percent_change'] or 0, reverse=True)
        top_gainers = [{"symbol": x['ticker'], "price_change": float(x['percent_change'] or 0)} for x in all_prices[:5]]
        
        all_prices.sort(key=lambda x: x['percent_change'] or 0)
        top_losers = [{"symbol": x['ticker'], "price_change": float(x['percent_change'] or 0)} for x in all_prices[:5]]
        
        all_prices.sort(key=lambda x: x['turnover'] or 0, reverse=True)
        top_turnovers = [{"symbol": x['ticker'], "turnover": float(x['turnover'] or 0)} for x in all_prices[:5]]
        
        return {
            "date": ref_date.isoformat() if hasattr(ref_date, 'isoformat') else str(ref_date),
            "total_turnover": float(stats['turnover'] or 0),
            "total_volume": stats['volume'] or 0,
            "total_transactions": stats['transactions'] or 0,
            "top_gainers": top_gainers,
            "top_losers": top_losers,
            "top_turnovers": top_turnovers,
            "sector_turnover": {}, # Aggregate sector if needed, but summary is enough
            "note": "Stats calculated from individual stocks (fallback mode)"
        }


class GetSectorPerformanceTool(BaseTool):
    """Get sector-wise performance"""
    
    @property
    def name(self) -> str:
        return "get_sector_performance"
    
    @property
    def description(self) -> str:
        return "Get performance metrics for different market sectors"
    
    @property
    def parameters(self) -> List[ToolParameter]:
        return [
            ToolParameter(name="period_days", type="number", description="Number of days to analyze", required=False),
        ]
    
    def execute(self, user, period_days: int = 7) -> Dict[str, Any]:
        from stocks.models import Company, DailyStockPrice
        
        end_date = get_reference_date()
        start_date = end_date - timedelta(days=period_days)
        
        sectors = Company.objects.values_list('sector', flat=True).distinct()
        sector_performance = []
        
        for sector in sectors:
            if not sector:
                continue
            
            companies = Company.objects.filter(sector=sector)
            sector_data = defaultdict(lambda: {"gains": 0, "losses": 0, "neutral": 0, "total_change": 0})
            
            for company in companies[:20]:  # Limit to top 20 per sector
                prices = DailyStockPrice.objects.filter(
                    ticker=company.symbol,
                    date__gte=start_date,
                    date__lte=end_date
                ).order_by('date')
                
                if len(prices) >= 2:
                    first_price = prices.first().close
                    last_price = prices.last().close
                    change_pct = ((last_price - first_price) / first_price * 100) if first_price > 0 else 0
                    
                    sector_data[sector]["total_change"] += float(change_pct)
                    if change_pct > 0:
                        sector_data[sector]["gains"] += 1
                    elif change_pct < 0:
                        sector_data[sector]["losses"] += 1
                    else:
                        sector_data[sector]["neutral"] += 1
            
            total_stocks = sector_data[sector]["gains"] + sector_data[sector]["losses"] + sector_data[sector]["neutral"]
            avg_change = sector_data[sector]["total_change"] / total_stocks if total_stocks > 0 else 0
            
            sector_performance.append({
                "sector": sector,
                "avg_change_percent": round(avg_change, 2),
                "gainers": sector_data[sector]["gains"],
                "losers": sector_data[sector]["losses"],
                "total_stocks": total_stocks
            })
        
        # Sort by performance
        sector_performance.sort(key=lambda x: x["avg_change_percent"], reverse=True)
        
        return {
            "period_days": period_days,
            "sectors": sector_performance
        }

class WhaleWatchTool(BaseTool):
    """Get institutional trading activity ('Whale Watch')"""
    
    @property
    def name(self) -> str:
        return "get_whale_watch"
    
    @property
    def description(self) -> str:
        return "Identify the most active brokers (whales) today and the top stocks they are accumulating or trading in high volume."
    
    @property
    def parameters(self) -> List[ToolParameter]:
        return []
    
    def execute(self, user) -> Dict[str, Any]:
        from stocks.models import DailyStockPrice, DailyFloorsheet
        from django.db.models import Sum, F, Count
        import datetime
        
        # Get latest trading date
        latest_date_data = DailyStockPrice.objects.values('date').annotate(
            count=Count('ticker')
        ).filter(count__gt=10).order_by('-date').first()
        
        if not latest_date_data:
            return {"error": "No market data found"}
            
        latest_date = latest_date_data['date']
        
        # Find top 5 brokers by total buy turnover
        top_brokers_qs = DailyFloorsheet.objects.filter(
            transaction_date=latest_date
        ).values('buyer_id').annotate(
            total_buy_turnover=Sum(F('transaction_quantity') * F('transaction_rate'))
        ).order_by('-total_buy_turnover')[:5]
        
        whale_results = []
        for broker_entry in top_brokers_qs:
            broker_id = broker_entry['buyer_id']
            
            # For each top broker, find their top 3 stocks by turnover
            top_picks_qs = DailyFloorsheet.objects.filter(
                transaction_date=latest_date,
                buyer_id=broker_id
            ).values('symbol').annotate(
                turnover=Sum(F('transaction_quantity') * F('transaction_rate')),
                quantity=Sum('transaction_quantity')
            ).order_by('-turnover')[:3]
            
            whale_results.append({
                'broker_id': broker_id,
                'total_turnover': float(broker_entry['total_buy_turnover']),
                'top_picks': [
                    {'symbol': p['symbol'], 'turnover': float(p['turnover']), 'quantity': p['quantity']} 
                    for p in top_picks_qs
                ]
            })
            
        return {
            "date": latest_date.isoformat(),
            "whales": whale_results
        }

class Near52WeekHighTool(BaseTool):
    """Find stocks trading near their 52-week high"""
    
    @property
    def name(self) -> str:
        return "get_near_52_week_high"
    
    @property
    def description(self) -> str:
        return "Get a list of stocks trading within 2% of their 52-week high, indicating potential breakouts or strong momentum."
    
    @property
    def parameters(self) -> List[ToolParameter]:
        return []
    
    def execute(self, user) -> Dict[str, Any]:
        from stocks.models import DailyStockPrice, Company
        from django.db.models import Count, F
        from decimal import Decimal
        
        latest_date_data = DailyStockPrice.objects.values('date').annotate(
            count=Count('ticker')
        ).filter(count__gt=10).order_by('-date').first()
        
        if not latest_date_data:
            return {"error": "No market data found"}
            
        latest_date = latest_date_data['date']
        
        # Stocks where close >= 98% of 52w high
        near_high_qs = DailyStockPrice.objects.filter(
            date=latest_date,
            weeks_52_high__isnull=False,
            close__gte=F('weeks_52_high') * Decimal('0.98')
        ).order_by('-turnover')[:15]
        
        results = []
        for p in near_high_qs:
            results.append({
                'symbol': p.ticker,
                'close': float(p.close),
                'high_52w': float(p.weeks_52_high),
                'distance_percent': round(float((p.weeks_52_high - p.close) / p.weeks_52_high * 100), 2),
                'turnover': float(p.turnover or 0)
            })
            
        return {
            "date": latest_date.isoformat(),
            "stocks": results
        }

class Near52WeekLowTool(BaseTool):
    """Find stocks trading near their 52-week low"""
    
    @property
    def name(self) -> str:
        return "get_near_52_week_low"
    
    @property
    def description(self) -> str:
        return "Get a list of stocks trading within 2% of their 52-week low, indicating potential oversold conditions or strong downtrends."
    
    @property
    def parameters(self) -> List[ToolParameter]:
        return []
    
    def execute(self, user) -> Dict[str, Any]:
        from stocks.models import DailyStockPrice, Company
        from django.db.models import Count, F
        from decimal import Decimal
        
        latest_date_data = DailyStockPrice.objects.values('date').annotate(
            count=Count('ticker')
        ).filter(count__gt=10).order_by('-date').first()
        
        if not latest_date_data:
            return {"error": "No market data found"}
            
        latest_date = latest_date_data['date']
        
        # Stocks where close <= 102% of 52w low
        near_low_qs = DailyStockPrice.objects.filter(
            date=latest_date,
            weeks_52_low__isnull=False,
            close__lte=F('weeks_52_low') * Decimal('1.02')
        ).order_by('-turnover')[:15]
        
        results = []
        for p in near_low_qs:
            results.append({
                'symbol': p.ticker,
                'close': float(p.close),
                'low_52w': float(p.weeks_52_low),
                'distance_percent': round(float((p.close - p.weeks_52_low) / p.weeks_52_low * 100), 2),
                'turnover': float(p.turnover or 0)
            })
            
        return {
            "date": latest_date.isoformat(),
            "stocks": results
        }

class GetMarketActivityReportTool(BaseTool):
    """Get multi-timeframe market activity report"""
    
    @property
    def name(self) -> str:
        return "get_market_activity_report"
    
    @property
    def description(self) -> str:
        return "Provides a detailed multi-timeframe report (Daily, Weekly, Monthly) on market gainers, turnover leaders, and volume breakouts."
    
    @property
    def parameters(self) -> List[ToolParameter]:
        return [
            ToolParameter(name="timeframe", type="string", description="Specific timeframe to focus on", enum=["daily", "weekly", "monthly"], required=False),
        ]
    
    def execute(self, user, timeframe: str = None) -> Dict[str, Any]:
        from stocks.views.market import analyze_activity
        from rest_framework.request import Request
        from rest_framework.test import APIRequestFactory
        
        try:
            # We can't call a view directly easily without a request object
            # But we can try to use a mock request or call internal helper if it existed.
            # Looking at market.py, analyze_activity is an api_view.
            # Let's see if we can just mock the request.
            factory = APIRequestFactory()
            request = factory.get('/analyze_activity/')
            
            response = analyze_activity(request)
            data = response.data
            
            # Truncate to avoid context window issues
            processed_data = {}
            timeframes = [timeframe] if timeframe and timeframe in data else data.keys()
            
            for tf in timeframes:
                if tf not in data: continue
                tf_data = data[tf]
                processed_tf = {}
                for category in ['turnover', 'gainers', 'volume', 'roc']:
                    if category in tf_data:
                        # Limit to top 3 and remove broker IDs to save tokens
                        items = tf_data[category][:3]
                        simplified_items = []
                        for item in items:
                            metrics = item.get('metrics', {})
                            simplified_item = {
                                "ticker": item.get('ticker'),
                                "change%": metrics.get('percent_change'),
                                "close": metrics.get('close'),
                                "avg_price": item.get('analysis', {}).get('weighted_avg_price')
                            }
                            simplified_items.append(simplified_item)
                        processed_tf[category] = simplified_items
                processed_data[tf] = processed_tf
            
            return processed_data
        except Exception as e:
            return {"error": f"Failed to fetch market activity: {str(e)}"}

class GetBrokerDetailedAccumulationTool(BaseTool):
    """Get detailed broker accumulation stats for a specific stock across timeframes"""
    
    @property
    def name(self) -> str:
        return "get_broker_detailed_accumulation"
    
    @property
    def description(self) -> str:
        return "Get detailed institutional buyer/seller statistics for a specific stock across multiple timeframes (1D to 2Y)."
    
    @property
    def parameters(self) -> List[ToolParameter]:
        return [
            ToolParameter(name="symbol", type="string", description="Stock symbol", required=True),
        ]
    
    def execute(self, user, symbol: str) -> Dict[str, Any]:
        from stocks.views.market import _get_broker_accumulation
        
        try:
            accumulation_data = _get_broker_accumulation(symbol)
            
            if not accumulation_data:
                return {"error": f"No accumulation data found for {symbol}"}
                
            return {
                "symbol": symbol,
                "timeframes": accumulation_data
            }
        except Exception as e:
            return {"error": f"Failed to fetch broker accumulation: {str(e)}"}

class GetMarketBreadthTool(BaseTool):
    """Get market-wide breadth indicators"""
    
    @property
    def name(self) -> str:
        return "get_market_breadth"
    
    @property
    def description(self) -> str:
        return "Get market-wide breadth indicators including Advance/Decline ratio, New Highs/Lows, and overall momentum across all stocks."
    
    @property
    def parameters(self) -> List[ToolParameter]:
        return []
    
    def execute(self, user) -> Dict[str, Any]:
        from stocks.models import DailyStockPrice
        from django.db.models import Count, Q
        
        try:
            latest_date_data = DailyStockPrice.objects.values('date').annotate(count=Count('ticker')).filter(count__gt=20).order_by('-date').first()
            if not latest_date_data:
                return {"error": "No market data found"}
            
            latest_date = latest_date_data['date']
            prices = DailyStockPrice.objects.filter(date=latest_date)
            
            advances = prices.filter(change__gt=0).count()
            declines = prices.filter(change__lt=0).count()
            unchanged = prices.filter(change=0).count()
            
            # 52w highs/lows reached today
            new_highs = prices.filter(close__gte=F('weeks_52_high')).count()
            new_lows = prices.filter(close__lte=F('weeks_52_low')).count()
            
            return {
                "date": latest_date.isoformat(),
                "advances": advances,
                "declines": declines,
                "unchanged": unchanged,
                "ad_ratio": round(advances / declines, 2) if declines > 0 else advances,
                "new_52w_highs": new_highs,
                "new_52w_lows": new_lows,
                "total_active_stocks": advances + declines + unchanged
            }
        except Exception as e:
            return {"error": f"Failed to get market breadth: {str(e)}"}

class GetSectorRotationTool(BaseTool):
    """Analyze sector rotation and relative strength over time"""
    
    @property
    def name(self) -> str:
        return "get_sector_rotation"
    
    @property
    def description(self) -> str:
        return "Analyze where money is moving in the market by comparing sector performance across multiple timeframes (Weekly, Monthly, Quarterly)."
    
    @property
    def parameters(self) -> List[ToolParameter]:
        return [
            ToolParameter(name="days", type="number", description="Number of days to analyze for rotation (default 30)", required=False),
        ]
    
    def execute(self, user, days: int = 30) -> Dict[str, Any]:
        from stocks.models import Company, DailyStockPrice
        from django.db.models import Avg
        
        try:
            end_date = date.today()
            start_date = end_date - timedelta(days=days)
            
            rotation = []
            sectors = Company.objects.values_list('sector', flat=True).distinct()
            
            for sector in sectors:
                if not sector: continue
                
                # Get avg change for tickers in this sector
                avg_change = DailyStockPrice.objects.filter(
                    ticker__in=Company.objects.filter(sector=sector).values_list('symbol', flat=True),
                    date__gte=start_date
                ).aggregate(avg_perf=Avg('percent_change'))['avg_perf']
                
                if avg_change is not None:
                    rotation.append({
                        "sector": sector,
                        "relative_strength": round(float(avg_change), 2)
                    })
            
            # Sort by strength
            rotation.sort(key=lambda x: x['relative_strength'], reverse=True)
            
            return {
                "period_days": days,
                "sector_rotation": rotation
            }
        except Exception as e:
            return {"error": f"Rotation analysis failed: {str(e)}"}

class GetRecentLargeTradesTool(BaseTool):
    """List significant large transactions (Floorsheet)"""
    
    @property
    def name(self) -> str:
        return "get_recent_large_trades"
    
    @property
    def description(self) -> str:
        return "List significant large transactions (> 5M NPR) from the latest floorsheet to identify specific stock interest by large players."
    
    @property
    def parameters(self) -> List[ToolParameter]:
        return [
            ToolParameter(name="min_amount", type="number", description="Minimum transaction amount in NPR (default 5M)", required=False),
        ]
    
    def execute(self, user, min_amount: float = 5000000) -> Dict[str, Any]:
        from stocks.models import DailyFloorsheet
        from django.db.models import F
        
        try:
            # Get latest floorsheet transactions using transaction_amount if it exists or quantity * rate
            # Checking DailyFloorsheet schema again - it has amount() method, but we need to filter in DB.
            latest_date = DailyFloorsheet.objects.values_list('transaction_date', flat=True).order_by('-transaction_date').first()
            if not latest_date:
                return {"error": "No floorsheet data found"}
                
            large_trades = DailyFloorsheet.objects.filter(
                transaction_date=latest_date
            ).annotate(
                trade_amount=F('transaction_quantity') * F('transaction_rate')
            ).filter(
                trade_amount__gte=min_amount
            ).order_by('-trade_amount')[:20]
            
            results = []
            for t in large_trades:
                results.append({
                    "symbol": t.symbol,
                    "amount": float(t.trade_amount),
                    "quantity": t.transaction_quantity,
                    "rate": float(t.transaction_rate),
                    "buyer": t.buyer_id,
                    "seller": t.seller_id,
                    "id": t.transaction_id
                })
                
            return {
                "date": latest_date.isoformat(),
                "min_amount": min_amount,
                "trades": results,
                "count": len(results)
            }
        except Exception as e:
            return {"error": f"Failed to fetch large trades: {str(e)}"}
