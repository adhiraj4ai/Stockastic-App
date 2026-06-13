from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from ...models import DailyStockPrice
from ...serializers import DailyStockPriceSerializer


@api_view(['GET'])
@permission_classes([AllowAny])
def stock_history(request, ticker):
    data = DailyStockPrice.objects.filter(ticker=ticker).order_by('date')
    serializer = DailyStockPriceSerializer(data, many=True)
    return Response(serializer.data)
