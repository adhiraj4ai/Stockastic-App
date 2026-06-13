from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from django.utils.decorators import method_decorator
from django.views.decorators.cache import cache_page
from ..analytics.price_action import PriceActionAnalyzer

import concurrent.futures
from ..models import Company

_SMC_EVENT_TYPES = {'SNIPER', 'FVG', 'BOS'}
SCANNER_MAX_TICKERS = 100
SCANNER_MAX_WORKERS = 10


def _has_notable_events(latest):
    """Return True if the session has any SMC events or candlestick patterns."""
    smc_types = {e['type'] for e in latest.get('smc_events', [])}
    return bool(smc_types & _SMC_EVENT_TYPES) or len(latest.get('patterns', [])) > 0


def _scan_ticker(t):
    """Run price-action analysis for a single ticker (lookback=2)."""
    return PriceActionAnalyzer(t).get_analysis(lookback=2, grouping=1)


def _build_setup_entry(data):
    """Build a setup dict from an analysis result if it has notable events today."""
    if "error" in data or not data.get("history"):
        return None
    latest = data["history"][0]
    if not _has_notable_events(latest):
        return None
    return {
        "ticker": data["ticker"],
        "volume": latest.get("volume", 0),
        "close": latest.get("close", 0),
        "latest_event": latest,
        "sentiment": latest.get("sentiment", "NEUTRAL"),
    }


class PriceActionView(APIView):
    """Returns detailed candlestick patterns and volume anomalies for a specific ticker."""

    @method_decorator(cache_page(60 * 15))
    def get(self, request, ticker):
        try:
            grouping = int(request.GET.get('grouping', 1))
            data = PriceActionAnalyzer(ticker.upper()).get_analysis(lookback=252, grouping=grouping)
            if "error" in data:
                return Response(data, status=status.HTTP_400_BAD_REQUEST)
            return Response(data, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class PriceActionScannerView(APIView):
    """Scans the market and returns a list of active PA/SMC setups for the most recent session."""

    @method_decorator(cache_page(60 * 15))
    def get(self, request):
        try:
            tickers = list(Company.objects.values_list('symbol', flat=True))[:SCANNER_MAX_TICKERS]
            results = []
            with concurrent.futures.ThreadPoolExecutor(max_workers=SCANNER_MAX_WORKERS) as executor:
                future_to_ticker = {executor.submit(_scan_ticker, t): t for t in tickers}
                for future in concurrent.futures.as_completed(future_to_ticker):
                    entry = _build_setup_entry(future.result())
                    if entry:
                        results.append(entry)
            results.sort(key=lambda x: x['volume'], reverse=True)
            return Response({"top_setups": results}, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
