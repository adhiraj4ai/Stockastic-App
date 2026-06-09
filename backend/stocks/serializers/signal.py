# backend/stocks/serializers/signal.py
from rest_framework import serializers
from ..models import SignalEpisode


class SignalEpisodeSerializer(serializers.ModelSerializer):
    # Backward-compatible aliases so existing frontend keys keep working.
    signal = serializers.CharField(source="direction", read_only=True)
    generated_date = serializers.DateField(source="start_date", read_only=True)
    ltp = serializers.DecimalField(source="entry_price", max_digits=10, decimal_places=2, read_only=True)
    strength = serializers.FloatField(source="entry_strength", read_only=True)
    days_held = serializers.SerializerMethodField()

    class Meta:
        model = SignalEpisode
        fields = [
            "id", "source", "strategy", "symbol", "signal", "direction", "signal_tier",
            "status", "ltp", "entry_price", "target_price", "stop_loss_price",
            "exit_price", "exit_reason", "pnl_percent", "strength", "peak_strength",
            "start_date", "end_date", "last_signal_date", "generated_date",
            "days_held", "rationale", "metadata", "created_at",
        ]

    def get_days_held(self, obj):
        return obj.days_held()
