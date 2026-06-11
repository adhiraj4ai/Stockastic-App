from rest_framework import serializers
from ..models.system import Notification

class NotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notification
        fields = ['id', 'title', 'message', 'type', 'ticker', 'read', 'created_at',
                  'redirect_url', 'metadata', 'severity']
        read_only_fields = ['id', 'created_at']

