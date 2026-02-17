
from rest_framework.viewsets import ViewSet
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from ..services.dividend_service import DividendService

class DividendView(ViewSet):
    """
    API endpoint for Dividend & Bonus Tracking.
    """
    permission_classes = [IsAuthenticated]

    @action(detail=False, methods=['get'])
    def summary(self, request):
        """
        Get dividend summary, history, and upcoming projections.
        """
        user = request.user
        data = DividendService.calculate_dividends(user)
        return Response(data)
