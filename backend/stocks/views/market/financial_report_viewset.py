from rest_framework import viewsets, filters
from rest_framework.permissions import AllowAny
from django_filters.rest_framework import DjangoFilterBackend

from ...models import FinancialReport
from ...serializers import FinancialReportSerializer


class FinancialReportViewSet(viewsets.ModelViewSet):
    queryset = FinancialReport.objects.all().order_by('-fiscal_year', '-quarter')
    serializer_class = FinancialReportSerializer
    permission_classes = [AllowAny]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields = ['ticker', 'report_type', 'fiscal_year']
