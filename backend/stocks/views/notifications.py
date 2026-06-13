from django.core.cache import cache
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from ..models import Notification
from ..serializers import NotificationSerializer
from ..services.notifications import default_orchestrator

# Maps frontend category name → list of NotificationType values
CATEGORY_TYPES = {
    'portfolio': [
        Notification.NotificationType.STOP_LOSS_HIT,
        Notification.NotificationType.TARGET_REACHED,
        Notification.NotificationType.SIGNIFICANT_GAIN,
        Notification.NotificationType.SIGNIFICANT_LOSS,
        Notification.NotificationType.BELOW_WACC,
    ],
    'watchlist': [
        Notification.NotificationType.WATCHLIST_BREAKOUT,
        Notification.NotificationType.WATCHLIST_ENTRY,
    ],
    'signals': [
        Notification.NotificationType.SIGNAL_BUY,
        Notification.NotificationType.SIGNAL_SELL,
        Notification.NotificationType.SIGNAL_STRONG_BUY,
        Notification.NotificationType.SIGNAL_STRONG_SELL,
    ],
    'whale': [
        Notification.NotificationType.WHALE_BUY,
        Notification.NotificationType.WHALE_SELL,
    ],
}


class NotificationViewSet(viewsets.ModelViewSet):
    serializer_class = NotificationSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = Notification.objects.filter(user=self.request.user).order_by('-created_at')

        # ?category=portfolio|watchlist|signals|whale
        category = self.request.query_params.get('category')
        if category and category in CATEGORY_TYPES:
            qs = qs.filter(type__in=CATEGORY_TYPES[category])

        # ?unread=true
        if self.request.query_params.get('unread') == 'true':
            qs = qs.filter(read=False)

        # ?severity=critical|high|normal|low
        severity = self.request.query_params.get('severity')
        if severity in {'critical', 'high', 'normal', 'low'}:
            qs = qs.filter(severity=severity)

        return qs

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

    @action(detail=False, methods=['DELETE'])
    def delete_read(self, request):
        """Delete all read notifications for the current user."""
        deleted_count, _ = Notification.objects.filter(user=request.user, read=True).delete()
        return Response({'deleted': deleted_count})

    @action(detail=False, methods=['POST'])
    def trigger_check(self, request):
        """Manually trigger notification checks via the orchestrator (10-min cooldown)."""
        cache_key = f"notif_check_cooldown_{request.user.id}"
        if cache.get(cache_key):
            return Response({
                'status': 'skipped',
                'message': 'Notification check skipped — cooldown active.',
                'cooldown_active': True,
            })
        total = default_orchestrator.run(request.user)
        cache.set(cache_key, True, 600)
        return Response({'status': 'check complete', 'total_notifications': total})

