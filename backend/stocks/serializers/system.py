from rest_framework import serializers
from ..models.system import Notification, GeneratedSignal

class NotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notification
        fields = ['id', 'title', 'message', 'type', 'ticker', 'read', 'created_at',
                  'redirect_url', 'metadata']
        read_only_fields = ['id', 'created_at']


class GeneratedSignalSerializer(serializers.ModelSerializer):
    class Meta:
        model = GeneratedSignal
        fields = ['id', 'source', 'symbol', 'signal', 'signal_tier', 'strength',
                  'ltp', 'target_price', 'stop_loss_price', 'status', 'pnl_percent', 
                  'closed_date', 'rationale', 'metadata', 'generated_date', 'created_at']
        read_only_fields = ['id', 'created_at']

