from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def company_chat_summary(request, ticker):
    """Return the signed-in user's latest AI analysis entry for one ticker.

    204 when the user has no (non-blank) analysis for that company.
    """
    from chat.models import CompanyAnalysisEntry

    symbol = ticker.upper()
    row = (
        CompanyAnalysisEntry.objects.filter(user=request.user, symbol=symbol)
        .order_by("-created_at")
        .first()
    )
    if row is None or not (row.summary or "").strip():
        return Response(status=status.HTTP_204_NO_CONTENT)
    return Response({
        "symbol": symbol,
        "summary": row.summary,
        "stance": row.stance,
        "aspect": row.aspect,
        "updated_at": row.updated_at,
    })
