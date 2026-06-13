from django.db.models import Q, F
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from ...models import DailyFloorsheet, Company
from ...serializers import DailyFloorsheetSerializer


def _parse_floorsheet_params(query_params):
    """Extract and return typed filter params from query_params."""
    return {
        'broker': query_params.get('broker'),
        'symbol': query_params.get('symbol'),
        'date': query_params.get('date'),
        'is_bulk': query_params.get('is_bulk', '').lower() == 'true',
        'is_matching': query_params.get('is_matching', '').lower() == 'true',
        'ordering': query_params.get('ordering'),
        'page': int(query_params.get('page', 1)),
        'page_size': int(query_params.get('page_size', 50)),
    }


def _apply_base_filters(params):
    """Return queryset filtered to valid company symbols."""
    allowed_symbols = Company.objects.values_list('symbol', flat=True)
    qs = DailyFloorsheet.objects.filter(symbol__in=allowed_symbols)
    if params['symbol']:
        qs = qs.filter(symbol=params['symbol'])
    if params['broker']:
        qs = qs.filter(Q(buyer_id=params['broker']) | Q(seller_id=params['broker']))
    if params['is_matching']:
        qs = qs.filter(buyer_id=F('seller_id'), transaction_quantity__gt=1000)
    if params['is_bulk']:
        qs = qs.filter(
            Q(transaction_quantity__gte=5000) | Q(transaction_amount__gte=5000000)
        )
    return qs


def _resolve_date_filter(qs, params):
    """Apply date filter and return (queryset, applied_date)."""
    date = params['date']
    if date:
        return qs.filter(transaction_date=date), date
    if params['is_bulk'] or params['is_matching'] or not (params['symbol'] or params['broker']):
        latest = DailyFloorsheet.objects.order_by('-transaction_date').first()
        if latest:
            return qs.filter(transaction_date=latest.transaction_date), latest.transaction_date
    return qs, None


def _apply_ordering(qs, ordering):
    """Apply ordering to queryset."""
    if ordering:
        return qs.order_by(ordering, '-transaction_date', '-transaction_id')
    return qs.order_by('-transaction_date', '-transaction_id')


def _paginate_and_serialize(qs, params):
    """Return paginated serialized response dict."""
    page, page_size = params['page'], params['page_size']
    total_count = qs.count()
    start = (page - 1) * page_size
    serializer = DailyFloorsheetSerializer(qs[start:start + page_size], many=True)
    total_pages = (total_count + page_size - 1) // page_size if page_size > 0 else 1
    return total_count, total_pages, serializer.data


@api_view(['GET'])
@permission_classes([AllowAny])
def floorsheet_list(request):
    """List floorsheet transactions with optional filtering and pagination."""
    try:
        params = _parse_floorsheet_params(request.query_params)
        qs = _apply_base_filters(params)
        qs, applied_date = _resolve_date_filter(qs, params)
        qs = _apply_ordering(qs, params['ordering'])
        total_count, total_pages, data = _paginate_and_serialize(qs, params)
        return Response({
            'results': data,
            'total_count': total_count,
            'current_page': params['page'],
            'total_pages': total_pages,
            'applied_date': applied_date,
        })
    except Exception as e:
        return Response({'error': str(e)}, status=500)
