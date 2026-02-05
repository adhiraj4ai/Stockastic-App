from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from ..models import DailyStockPrice
from ..serializers import DailyStockPriceSerializer

@api_view(['GET'])
@permission_classes([AllowAny])
def get_stock_chart_data(request, ticker):
    """
    Returns historical OHLC data for a given ticker.
    Formatted for TradingView Lightweight Charts.
    """
    # Filter by ticker and order by date (asc)
    prices = DailyStockPrice.objects.filter(ticker=ticker).order_by('date')
    
    # Lightweight Charts expects: { time: 'YYYY-MM-DD', open: 10, high: 15, low: 8, close: 12, value: 1000 }
    # 'value' is often used for volume or just the close price depending on series type.
    
    chart_data = []
    for p in prices:
        chart_data.append({
            'time': p.date.strftime('%Y-%m-%d'),
            'open': float(p.open or 0),
            'high': float(p.high or 0),
            'low': float(p.low or 0),
            'close': float(p.close or 0),
            'volume': float(p.volume or 0)
        })
        
    return Response(chart_data)
