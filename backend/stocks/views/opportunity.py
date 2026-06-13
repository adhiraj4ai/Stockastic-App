"""Read-only opportunity ranking endpoint (research surface; never trades)."""
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from stocks.services.opportunity_engine import rank_opportunities


@api_view(["GET"])
@permission_classes([AllowAny])
def opportunities(request):
    """GET /api/stocks/opportunities/?symbols=NABIL,API&limit=30

    Today's ranked BUY entries by validated, regime-aware, fee-net edge, plus
    the current market regime and the day's exit signals.
    """
    symbols_param = request.GET.get("symbols")
    symbols = [s.strip() for s in symbols_param.split(",")] if symbols_param else None
    try:
        limit = int(request.GET.get("limit", 30))
    except (TypeError, ValueError):
        limit = 30
    limit = max(1, min(limit, 100))
    result = rank_opportunities(symbols=symbols, limit=limit)
    return Response(result)
