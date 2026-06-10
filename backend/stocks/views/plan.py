from datetime import datetime

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework import status

from ..models import DailyTradingPlan
from ..services.daily_plan import user_overlay
from ..services.position_sizing import sizing_map_for_user


def _serialize(plan):
    return {
        "date": plan.date.isoformat(),
        "generated_at": plan.generated_at.isoformat(),
        "regime": plan.regime,
        "breadth": plan.breadth,
        "payload": plan.payload,
    }


class PlanTodayView(APIView):
    """Latest plan + the requesting user's overlay."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        plan = DailyTradingPlan.objects.order_by("-date").first()
        if plan is None:
            return Response({"detail": "No plan generated yet."},
                            status=status.HTTP_404_NOT_FOUND)
        data = _serialize(plan)
        data["overlay"] = user_overlay(request.user)
        data["overlay"]["sizing"] = sizing_map_for_user(
            request.user, plan.payload.get("picks", []))
        return Response(data)


class PlanHistoryView(APIView):
    """Historical plan by ?date=YYYY-MM-DD (global payload only, no overlay)."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        date_str = request.GET.get("date")
        if not date_str:
            return Response({"detail": "date query param required"},
                            status=status.HTTP_400_BAD_REQUEST)
        try:
            plan_date = datetime.strptime(date_str, "%Y-%m-%d").date()
        except ValueError:
            return Response({"detail": "invalid date"}, status=status.HTTP_400_BAD_REQUEST)
        plan = DailyTradingPlan.objects.filter(date=plan_date).first()
        if plan is None:
            return Response({"detail": "No plan for that date."},
                            status=status.HTTP_404_NOT_FOUND)
        return Response(_serialize(plan))
