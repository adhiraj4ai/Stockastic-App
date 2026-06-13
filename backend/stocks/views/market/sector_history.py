from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from django.db.models import Sum

from ...models import DailyStockPrice, StockFundamental


@api_view(['GET'])
@permission_classes([AllowAny])
def sector_history(request, sector_name):
    queryset = DailyStockPrice.objects.all()
    if sector_name.upper() != 'NEPSE':
        tickers = StockFundamental.objects.filter(
            sector__iexact=sector_name
        ).values_list('ticker', flat=True)
        queryset = queryset.filter(ticker__in=tickers)
    history = queryset.values('date').annotate(
        value=Sum('close'),
        volume=Sum('volume'),
        turnover=Sum('turnover'),
    ).order_by('date')
    return Response(list(history)[-100:])
