from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from ...models import FinancialReport
from ...serializers import FinancialReportSerializer


@api_view(['GET'])
@permission_classes([AllowAny])
def stock_financials(request, ticker):
    data = FinancialReport.objects.filter(ticker=ticker).order_by('-fiscal_year', '-quarter')
    serializer = FinancialReportSerializer(data, many=True)
    return Response(serializer.data)
