from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from ...models import Company


@api_view(['GET'])
@permission_classes([AllowAny])
def search_stocks(request):
    query = request.GET.get('q', '')
    companies = Company.objects.all()
    if query:
        companies = companies.filter(symbol__icontains=query)
    tickers = companies.values_list('symbol', flat=True).distinct()[:10]
    return Response(tickers)
