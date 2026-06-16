from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def run_company_analysis(request, ticker):
    """Run an ad-hoc, data-driven AI analysis for the signed-in user and return the
    new/updated latest entry."""
    from chat.analysis_runner import run_market_analysis

    symbol = ticker.upper()
    row = run_market_analysis(request.user, symbol)
    if row is None:
        return Response(status=status.HTTP_204_NO_CONTENT)
    return Response({
        "symbol": symbol,
        "summary": row.summary,
        "stance": row.stance,
        "aspect": row.aspect,
        "updated_at": row.updated_at,
    })
