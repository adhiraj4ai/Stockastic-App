from rest_framework import viewsets, status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from ...models import StockFundamental
from ...serializers import StockFundamentalSerializer

_ALLOWED_METADATA_FIELDS = [
    'listed_date', 'market_cap', 'free_float_market_cap',
    'shares_outstanding', 'public_shares',
]


class StockFundamentalViewSet(viewsets.ModelViewSet):
    """ViewSet for managing StockFundamental metadata."""

    queryset = StockFundamental.objects.all()
    serializer_class = StockFundamentalSerializer
    permission_classes = [AllowAny]
    lookup_field = 'ticker'

    def partial_update(self, request, ticker=None):
        """Update company metadata fields."""
        try:
            fundamental = self.get_object()
            self._apply_allowed_fields(fundamental, request.data)
            fundamental.save()
            return Response(self.get_serializer(fundamental).data)
        except StockFundamental.DoesNotExist:
            return Response(
                {'error': 'Fundamental data not found for this ticker'},
                status=status.HTTP_404_NOT_FOUND,
            )
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    def _apply_allowed_fields(self, fundamental, data):
        """Set allowed metadata fields on the fundamental object."""
        for field in _ALLOWED_METADATA_FIELDS:
            if field in data:
                setattr(fundamental, field, data[field])
