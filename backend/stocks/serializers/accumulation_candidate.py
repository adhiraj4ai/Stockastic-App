from rest_framework import serializers

from ..models import AccumulationCandidate


class AccumulationCandidateSerializer(serializers.ModelSerializer):
    suggested_qty = serializers.SerializerMethodField()

    class Meta:
        model = AccumulationCandidate
        fields = [
            "id", "symbol", "scan_date", "score", "factors",
            "suggested_entry", "suggested_stop", "suggested_target",
            "validation_state", "status", "suggested_qty",
        ]

    def get_suggested_qty(self, obj):
        return self.context.get("qty_by_symbol", {}).get(obj.symbol)
