from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from ..models import Notification
from ..serializers import NotificationSerializer

class NotificationViewSet(viewsets.ModelViewSet):
    serializer_class = NotificationSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Notification.objects.filter(user=self.request.user).order_by('-created_at')

    @action(detail=False, methods=['POST'])
    def mark_all_as_read(self, request):
        Notification.objects.filter(user=request.user, read=False).update(read=True)
        return Response({'status': 'messages marked as read'})

    @action(detail=True, methods=['POST'])
    def mark_as_read(self, request, pk=None):
        notification = self.get_object()
        notification.read = True
        notification.save()
        return Response({'status': 'notification marked as read'})

    @action(detail=False, methods=['POST'])
    def trigger_check(self, request):
        """Manually trigger notification checks for portfolio, watchlist, and signals"""
        from ..services.notification_service import check_portfolio_alerts, check_watchlist_alerts, check_signal_alerts
        
        portfolio_count = check_portfolio_alerts(request.user)
        watchlist_count = check_watchlist_alerts(request.user)
        signal_count = check_signal_alerts(request.user)
        
        return Response({
            'status': 'check complete',
            'portfolio_notifications': portfolio_count,
            'watchlist_notifications': watchlist_count,
            'signal_notifications': signal_count,
            'total_notifications': portfolio_count + watchlist_count + signal_count
        })

