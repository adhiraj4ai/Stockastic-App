from rest_framework import status, viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from django.db.models import Q
from ..models import WatchlistItem, Company, DailyStockPrice, StrategySignal
from ..serializers import WatchlistItemSerializer
import pandas as pd

from ..services.watchlist_service import WatchlistService

class WatchlistViewSet(viewsets.ModelViewSet):
    queryset = WatchlistItem.objects.all()
    serializer_class = WatchlistItemSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return WatchlistItem.objects.filter(user=self.request.user)

    def list(self, request, *args, **kwargs):
        queryset = self.get_queryset()
        data = WatchlistService.get_watchlist_metrics(queryset)
        serializer = self.get_serializer(data, many=True)
        return Response(serializer.data)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def check_watchlist_alerts(request):
    """
    Check for RSI/ROC alerts for user's watchlist.
    """
    return Response({'alerts': []}) # Placeholder
