from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from ...models import DailyFloorsheet
from ...serializers import DailyFloorsheetSerializer


@api_view(['GET'])
@permission_classes([AllowAny])
def stock_floorsheet(request, ticker):
    data = DailyFloorsheet.objects.filter(symbol=ticker).order_by('-transaction_date')[:50]
    serializer = DailyFloorsheetSerializer(data, many=True)
    return Response(serializer.data)
