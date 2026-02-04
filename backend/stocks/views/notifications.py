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
        # This would call the alert checking logic
        # count = check_market_alerts(request.user)
        return Response({'status': 'check complete', 'notifications_created': 0})

def check_market_alerts(user):
    """
    Business logic for checking market alerts (RSI, Price triggers, etc.)
    """
    return 0
