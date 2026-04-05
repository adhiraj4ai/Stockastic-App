from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from django.core.cache import cache
from ..models import Company
from ..analytics.signal_scanner import MarketSignalScanner
import logging

logger = logging.getLogger(__name__)

class SignalAlertsView(APIView):
    """
    Exposes market-wide trading alerts for 10 institutional signal types.
    Reads from persisted GeneratedSignal records created via pipeline.
    """
    def get(self, request):
        try:
            from ..models import GeneratedSignal
            from django.db.models import Count, Max
            
            # 1. Map UI categories to Model Sources
            # Note: UI expects keys like 'pa_buy', 'mr_buy', etc.
            # But the model stores Source + Signal (BUY/SELL)
            
            # Find the latest signal generation date
            latest_date = GeneratedSignal.objects.aggregate(Max('generated_date'))['generated_date__max']
            if not latest_date:
                return Response({"summary": {}, "message": "No signals generated today."}, status=status.HTTP_200_OK)

            # Define the source mapping
            SOURCE_TYPES = ['PRICE_ACTION', 'MEAN_REVERSAL', 'RSI_DIVERGENCE', 'MACD_DIVERGENCE', 'DOW_SIGNAL']
            
            category = request.GET.get('category')
            
            # If a specific category is requested, handle the mapping back to sources
            if category:
                # Map categories like 'pa_buy' to (Source='PRICE_ACTION', Signal='BUY')
                cat_map = {
                    'pa_buy': ('PRICE_ACTION', 'BUY'), 'pa_sell': ('PRICE_ACTION', 'SELL'),
                    'mr_buy': ('MEAN_REVERSAL', 'BUY'), 'mr_sell': ('MEAN_REVERSAL', 'SELL'),
                    'rsi_bull_div': ('RSI_DIVERGENCE', 'BUY'), 'rsi_bear_div': ('RSI_DIVERGENCE', 'SELL'),
                    'macd_bull_div': ('MACD_DIVERGENCE', 'BUY'), 'macd_bear_div': ('MACD_DIVERGENCE', 'SELL'),
                    'dow_buy': ('DOW_SIGNAL', 'BUY'), 'dow_sell': ('DOW_SIGNAL', 'SELL')
                }
                
                if category in cat_map:
                    source, signal = cat_map[category]
                    symbols = list(GeneratedSignal.objects.filter(
                        source=source, 
                        signal=signal, 
                        generated_date=latest_date,
                        status='ACTIVE'
                    ).values_list('symbol', flat=True))
                    return Response({"symbols": symbols}, status=status.HTTP_200_OK)
                else:
                    return Response({"error": "Invalid category"}, status=status.HTTP_400_BAD_REQUEST)

            # Default: Return Summary Counts
            all_active = GeneratedSignal.objects.filter(
                source__in=SOURCE_TYPES,
                generated_date=latest_date,
                status='ACTIVE'
            ).values('source', 'signal').annotate(count=Count('symbol'))
            
            summary = {}
            # Map back to UI keys
            UI_MAP = {
                ('PRICE_ACTION', 'BUY'): 'pa_buy', ('PRICE_ACTION', 'SELL'): 'pa_sell',
                ('MEAN_REVERSAL', 'BUY'): 'mr_buy', ('MEAN_REVERSAL', 'SELL'): 'mr_sell',
                ('RSI_DIVERGENCE', 'BUY'): 'rsi_bull_div', ('RSI_DIVERGENCE', 'SELL'): 'rsi_bear_div',
                ('MACD_DIVERGENCE', 'BUY'): 'macd_bull_div', ('MACD_DIVERGENCE', 'SELL'): 'macd_bear_div',
                ('DOW_SIGNAL', 'BUY'): 'dow_buy', ('DOW_SIGNAL', 'SELL'): 'dow_sell'
            }
            
            # Initialize all keys to 0
            for key in UI_MAP.values(): summary[key] = 0
            
            for item in all_active:
                key = UI_MAP.get((item['source'], item['signal']))
                if key:
                    summary[key] = item['count']

            return Response({"summary": summary, "date": latest_date}, status=status.HTTP_200_OK)

        except Exception as e:
            logger.error(f"SignalAlertsView error: {e}")
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
