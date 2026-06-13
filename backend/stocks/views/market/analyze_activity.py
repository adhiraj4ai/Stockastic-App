from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from ._activity_helpers import get_stats_for_range


@api_view(['GET'])
@permission_classes([AllowAny])
def analyze_activity(request):
    """
    Deep dive into market activity.
    Returns data for ALL timeframes (daily, weekly, monthly) grouped by category.
    Structure: { 'daily': { 'turnover': [], ... }, 'weekly': { ... }, 'monthly': { ... } }
    """
    limit = int(request.query_params.get('limit', 10))
    return Response({
        'daily': get_stats_for_range('daily', limit),
        'weekly': get_stats_for_range('weekly', limit),
        'monthly': get_stats_for_range('monthly', limit),
    })
