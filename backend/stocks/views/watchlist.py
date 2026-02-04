from rest_framework import status, viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from django.db.models import Q
from ..models import WatchlistItem, Company, DailyStockPrice, StrategySignal
from ..serializers import WatchlistItemSerializer
import pandas as pd
import pandas_ta as ta

class WatchlistViewSet(viewsets.ModelViewSet):
    queryset = WatchlistItem.objects.all()
    serializer_class = WatchlistItemSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return WatchlistItem.objects.filter(user=self.request.user)

    def list(self, request, *args, **kwargs):
        queryset = self.get_queryset()
        data = []
        for item in queryset:
            # 1. Fetch Basic Info
            try:
                company = Company.objects.get(symbol=item.ticker)
                item_data = {
                    'id': item.id,
                    'ticker': item.ticker,
                    'name': company.name,
                    'sector': company.sector,
                    'added_at': item.added_at,
                    'price': 0,
                    'change_pct': 0,
                    'rsi': 0,
                    'roc': 0,
                    'signal': None
                }
            except Company.DoesNotExist:
                continue

            # 2. Fetch Price and Indicators (Simplified)
            prices = DailyStockPrice.objects.filter(ticker=item.ticker).order_by('-date')[:50]
            if prices.exists():
                latest = prices[0]
                item_data['price'] = latest.close
                item_data['change_pct'] = latest.diff_percent if hasattr(latest, 'diff_percent') else 0
                
                # RSI/ROC Calculation
                df = pd.DataFrame(list(prices.values('close'))[::-1])
                if len(df) >= 20:
                    item_data['rsi'] = float(ta.rsi(df['close'], length=14).iloc[-1])
                    item_data['roc'] = float(ta.roc(df['close'], length=20).iloc[-1])

            # 3. Fetch Signal
            sig = StrategySignal.objects.filter(symbol=item.ticker).order_by('-date').first()
            if sig:
                item_data['signal'] = sig.signal

            data.append(item_data)
        return Response(data)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def check_watchlist_alerts(request):
    """
    Check for RSI/ROC alerts for user's watchlist.
    """
    return Response({'alerts': []}) # Placeholder
