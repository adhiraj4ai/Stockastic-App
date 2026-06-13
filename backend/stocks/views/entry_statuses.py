from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from ..models import DailyTradingPlan


class EntryStatusesView(APIView):
    """Canonical per-symbol entry statuses (IN_ZONE/EXTENDED/STALE) from the
    latest precomputed plan. Empty map when no plan exists yet."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        plan = DailyTradingPlan.objects.order_by("-date").first()
        if plan is None:
            return Response({"statuses": {}, "as_of": None})
        return Response({
            "statuses": plan.payload.get("entry_statuses", {}),
            "as_of": plan.payload.get("as_of"),
        })
