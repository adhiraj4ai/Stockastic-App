from typing import Dict, Any, List
from .base import BaseTool, ToolParameter

class GetTechnicalIndicatorsTool(BaseTool):
    """Get technical indicators for a stock"""
    
    @property
    def name(self) -> str:
        return "get_technical_indicators"
    
    @property
    def description(self) -> str:
        return "Calculate technical indicators (RSI, MACD, Bollinger Bands, Moving Averages) for a stock."
    
    @property
    def parameters(self) -> List[ToolParameter]:
        return [
            ToolParameter(name="symbol", type="string", description="Stock symbol", required=True),
            ToolParameter(name="period", type="number", description="Days of history to analyze (default 365)", required=False),
        ]
    
    def execute(self, user, symbol: str, period: int = 365) -> Dict[str, Any]:
        from stocks.technical import get_technical_indicators
        
        indicators = get_technical_indicators(symbol.upper(), days=period)
        
        if not indicators:
            return {"error": f"Could not calculate indicators for {symbol}. Insufficient data."}
            
        # Group by category for cleaner LLM consumption
        grouped = {}
        for ind in indicators:
            cat = ind['category']
            if cat not in grouped:
                grouped[cat] = {}
            grouped[cat][ind['name']] = ind['value']
            
        return {
            "symbol": symbol.upper(),
            "indicators": grouped
        }

class GetFibonacciLevelsTool(BaseTool):
    """Calculate Fibonacci retracement levels for a stock"""
    
    @property
    def name(self) -> str:
        return "get_fibonacci_levels"
    
    @property
    def description(self) -> str:
        return "Calculate Fibonacci retracement levels, support/resistance, and growth potential for a stock based on its high/low over a period."
    
    @property
    def parameters(self) -> List[ToolParameter]:
        return [
            ToolParameter(name="symbol", type="string", description="Stock symbol", required=True),
            ToolParameter(name="period", type="number", description="Days of history for swing analysis (30, 90, 180, 365, 1825). Default 180.", required=False),
        ]
    
    def execute(self, user, symbol: str, period: int = 180) -> Dict[str, Any]:
        from stocks.models import DailyStockPrice
        from django.utils import timezone
        from datetime import timedelta
        
        # Valid periods
        if period not in [30, 90, 180, 365, 1825]:
            period = 180

        cutoff = timezone.now().date() - timedelta(days=period)
        prices = DailyStockPrice.objects.filter(ticker=symbol.upper(), date__gte=cutoff).order_by('date')
        
        if not prices.exists():
            return {"error": f"No price data available for {symbol} in the last {period} days."}

        price_list = list(prices.values('date', 'high', 'low', 'close'))
        highs = [float(p['high']) for p in price_list]
        lows = [float(p['low']) for p in price_list]
        closes = [float(p['close']) for p in price_list]

        swing_high = max(highs)
        swing_low = min(lows)
        current_price = closes[-1]
        swing_range = swing_high - swing_low

        if swing_range == 0:
            return {"error": "No price range found (flat market)."}

        # Detect trend: if current price is in the upper half of the range, it's an uptrend retracement
        mid_point = (swing_high + swing_low) / 2
        is_uptrend = current_price >= mid_point

        ratios = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1.0]
        labels = ['0%', '23.6%', '38.2%', '50%', '61.8%', '78.6%', '100%']
        levels = []

        for ratio, label in zip(ratios, labels):
            if is_uptrend:
                # Retracement from the top: how far it pulled back from swing high
                price_at_level = swing_high - (ratio * swing_range)
            else:
                # Retracement from the bottom: how far it bounced from swing low
                price_at_level = swing_low + (ratio * swing_range)

            distance_pct = ((price_at_level - current_price) / current_price) * 100
            levels.append({
                'ratio': ratio,
                'label': label,
                'price': round(price_at_level, 2),
                'distance_pct': round(distance_pct, 2),
                'is_above': price_at_level > current_price,
            })

        # Find nearest support (below CMP) and resistance (above CMP)
        supports = [l for l in levels if l['price'] < current_price]
        resistances = [l for l in levels if l['price'] > current_price]

        nearest_support = max(supports, key=lambda x: x['price']) if supports else None
        nearest_resistance = min(resistances, key=lambda x: x['price']) if resistances else None

        # Max upside/downside
        max_upside = round(((swing_high - current_price) / current_price) * 100, 2)
        max_downside = round(((current_price - swing_low) / current_price) * 100, 2)

        return {
            'symbol': symbol.upper(),
            'period_days': period,
            'current_price': round(current_price, 2),
            'swing_high': round(swing_high, 2),
            'swing_low': round(swing_low, 2),
            'trend': 'UPTREND' if is_uptrend else 'DOWNTREND',
            'levels': levels,
            'nearest_support': nearest_support,
            'nearest_resistance': nearest_resistance,
            'max_upside_percent': max_upside,
            'max_downside_percent': max_downside
        }
