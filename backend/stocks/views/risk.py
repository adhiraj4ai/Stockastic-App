from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from ..services.risk_service import RiskAnalysisService

class RiskRadarView(viewsets.ViewSet):
    permission_classes = [IsAuthenticated]

    @action(detail=False, methods=['get'])
    def analysis(self, request):
        """
        Main endpoint for Risk Radar analytics.
        """
        account_id = request.query_params.get('account')
        try:
            data = RiskAnalysisService.get_risk_analysis(request.user, account_id)
            return Response(data)
        except Exception as e:
            import traceback
            traceback.print_exc()
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
