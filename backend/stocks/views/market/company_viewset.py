from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from django.db.models import Q, Count

from ...models import Company
from ...serializers import CompanySerializer, StockFundamentalSerializer
from ..accumulation_mixin import AccumulationMixin
from ...services.fundamental_calculator import recalculate_fundamentals


class CompanyViewSet(AccumulationMixin, viewsets.ReadOnlyModelViewSet):
    queryset = Company.objects.all().order_by('symbol')
    serializer_class = CompanySerializer
    permission_classes = [AllowAny]
    search_fields = ['symbol', 'name']
    lookup_field = 'symbol'

    def get_queryset(self):
        queryset = Company.objects.all().order_by('symbol')
        search = self.request.query_params.get('search', None)
        if search:
            queryset = queryset.filter(Q(symbol__icontains=search) | Q(name__icontains=search))
        return queryset

    @action(detail=True, methods=['post'], permission_classes=[AllowAny])
    def refresh_fundamentals(self, request, symbol=None):
        """Recalculate ALL fundamental metrics dynamically from latest financial reports."""
        company = self.get_object()
        try:
            fundamental = recalculate_fundamentals(company.symbol)
            if fundamental is None:
                return Response(
                    {'error': 'No financial reports found for this company'},
                    status=status.HTTP_404_NOT_FOUND,
                )
            return Response(StockFundamentalSerializer(fundamental).data)
        except Exception as e:
            import traceback
            return Response(
                {'error': str(e), 'traceback': traceback.format_exc()},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    @action(detail=False, methods=['get'], permission_classes=[AllowAny])
    def sectors(self, request):
        sectors = Company.objects.all().values('sector').annotate(
            count=Count('symbol')
        ).order_by('sector')
        return Response([{'name': s['sector'], 'count': s['count']} for s in sectors])
