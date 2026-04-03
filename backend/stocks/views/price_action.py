from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from django.utils.decorators import method_decorator
from django.views.decorators.cache import cache_page
from ..analytics.price_action import PriceActionAnalyzer

class PriceActionView(APIView):
    """
    Returns detailed candlestick patterns and volume anomalies for a specific ticker over the recent timeframe.
    """
    @method_decorator(cache_page(60 * 15)) # Cache for 15 minutes
    def get(self, request, ticker):
        try:
            grouping = int(request.GET.get('grouping', 1))
            analyzer = PriceActionAnalyzer(ticker.upper())
            data = analyzer.get_analysis(lookback=252, grouping=grouping)
            
            if "error" in data:
                return Response(data, status=status.HTTP_400_BAD_REQUEST)
                
            return Response(data, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

import concurrent.futures
from ..models import Company

class PriceActionScannerView(APIView):
    """
    Scans the market and returns a list of active PA/SMC setups for the most recent session.
    """
    @method_decorator(cache_page(60 * 15))
    def get(self, request):
        try:
            # Get list of all active tickers limit to 100 to prevent heavy timeout on cold caches
            tickers = list(Company.objects.values_list('symbol', flat=True))[:100]
            
            def scan_ticker(t):
                analyzer = PriceActionAnalyzer(t)
                # We only need `lookback=2` to get today's structural event
                return analyzer.get_analysis(lookback=2, grouping=1) 
                
            results = []
            with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
                future_to_ticker = {executor.submit(scan_ticker, t): t for t in tickers}
                for future in concurrent.futures.as_completed(future_to_ticker):
                    data = future.result()
                    if "error" not in data and len(data.get("history", [])) > 0:
                        latest = data["history"][0]
                        # Only return stocks that have something interesting today
                        has_sniper = any(e['type'] == 'SNIPER' for e in latest.get('smc_events', []))
                        has_fvg = any(e['type'] == 'FVG' for e in latest.get('smc_events', []))
                        has_bos = any(e['type'] == 'BOS' for e in latest.get('smc_events', []))
                        
                        if has_sniper or has_fvg or has_bos or len(latest.get('patterns', [])) > 0:
                            results.append({
                                "ticker": data["ticker"],
                                "volume": latest.get("volume", 0),
                                "close": latest.get("close", 0),
                                "latest_event": latest,
                                "sentiment": latest.get("sentiment", "NEUTRAL")
                            })
                            
            # Sort strategically (Volume desc)
            results.sort(key=lambda x: x['volume'], reverse=True)
            
            return Response({"top_setups": results}, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
