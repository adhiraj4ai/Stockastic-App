from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def company_analysis_timeline(request, ticker):
    """Return the signed-in user's AI analysis timeline for one ticker, newest first."""
    from chat.models import CompanyAnalysisEntry

    symbol = ticker.upper()
    rows = CompanyAnalysisEntry.objects.filter(user=request.user, symbol=symbol).order_by("-created_at")
    return Response([
        {
            "summary": row.summary,
            "stance": row.stance,
            "aspect": row.aspect,
            "change_note": row.change_note,
            "created_at": row.created_at,
        }
        for row in rows
    ])
