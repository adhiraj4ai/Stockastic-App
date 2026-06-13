from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from django.core.cache import cache
from ..models import Company, SignalEpisode
import logging

logger = logging.getLogger(__name__)

SOURCE_TYPES = ['PRICE_ACTION', 'MEAN_REVERSAL', 'RSI_DIVERGENCE', 'MACD_DIVERGENCE', 'DOW_SIGNAL']

_CAT_MAP = {
    'pa_buy': ('PRICE_ACTION', 'BUY'), 'pa_sell': ('PRICE_ACTION', 'SELL'),
    'mr_buy': ('MEAN_REVERSAL', 'BUY'), 'mr_sell': ('MEAN_REVERSAL', 'SELL'),
    'rsi_bull_div': ('RSI_DIVERGENCE', 'BUY'), 'rsi_bear_div': ('RSI_DIVERGENCE', 'SELL'),
    'macd_bull_div': ('MACD_DIVERGENCE', 'BUY'), 'macd_bear_div': ('MACD_DIVERGENCE', 'SELL'),
    'dow_buy': ('DOW_SIGNAL', 'BUY'), 'dow_sell': ('DOW_SIGNAL', 'SELL'),
}

_UI_MAP = {v: k for k, v in _CAT_MAP.items()}


def _latest_signal_date():
    """Return the most recent signal start_date or None."""
    from django.db.models import Max
    return SignalEpisode.objects.aggregate(Max('start_date'))['start_date__max']


def _symbols_for_category(category, latest_date):
    """Return symbol list for a specific UI category key."""
    if category not in _CAT_MAP:
        return None
    source, direction = _CAT_MAP[category]
    return list(
        SignalEpisode.objects.filter(
            source=source, direction=direction, start_date=latest_date, status='ACTIVE'
        ).values_list('symbol', flat=True)
    )


def _build_summary(latest_date):
    """Return counts for all signal categories on the latest date."""
    from django.db.models import Count
    all_active = (
        SignalEpisode.objects
        .filter(source__in=SOURCE_TYPES, start_date=latest_date, status='ACTIVE')
        .values('source', 'direction')
        .annotate(count=Count('symbol'))
    )
    summary = {key: 0 for key in _UI_MAP.values()}
    for item in all_active:
        key = _UI_MAP.get((item['source'], item['direction']))
        if key:
            summary[key] = item['count']
    return summary


class SignalAlertsView(APIView):
    """
    Exposes market-wide trading alerts for 10 institutional signal types.
    Reads from persisted SignalEpisode records created via pipeline.
    """

    def get(self, request):
        try:
            latest_date = _latest_signal_date()
            if not latest_date:
                return Response({"summary": {}, "message": "No signals generated today."}, status=status.HTTP_200_OK)

            category = request.GET.get('category')
            if category:
                symbols = _symbols_for_category(category, latest_date)
                if symbols is None:
                    return Response({"error": "Invalid category"}, status=status.HTTP_400_BAD_REQUEST)
                return Response({"symbols": symbols}, status=status.HTTP_200_OK)

            return Response({"summary": _build_summary(latest_date), "date": latest_date}, status=status.HTTP_200_OK)
        except Exception as e:
            logger.error(f"SignalAlertsView error: {e}")
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
