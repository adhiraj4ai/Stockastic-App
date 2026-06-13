from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from ...models import DailyStockPrice
from ._summary_helpers import (
    _build_sparkline_map,
    _process_stocks,
    _attach_top_buyers,
    _compute_technicals,
    _fetch_whale_watch,
    _build_response,
    _fetch_ref_data,
)


@api_view(['GET'])
@permission_classes([AllowAny])
def stock_summary(request):
    from ...services.market_summary_service import (
        fetch_latest_date, resolve_ref_date,
        build_sector_map, fetch_ref_aggregates, build_market_status,
    )
    latest = fetch_latest_date()
    if not latest:
        return Response({})
    if request.GET.get('mode') == 'status':
        return Response(build_market_status(latest))

    range_type = request.GET.get('range', 'daily')
    ref_date = resolve_ref_date(range_type, latest)
    ref_prices_map, aggregates_map = _fetch_ref_data(ref_date, latest, fetch_ref_aggregates)
    is_daily = ref_date is None

    latest_prices = DailyStockPrice.objects.filter(date=latest)
    sector_map = build_sector_map()
    sparkline_map = _build_sparkline_map(latest)
    summary_list, sector_stats, near_high, near_low, totals = _process_stocks(
        latest_prices, is_daily, ref_prices_map, aggregates_map, sector_map, sparkline_map
    )
    by_change = sorted(summary_list, key=lambda x: x['percent_change'])
    rocket_tickers = [s['ticker'] for s in by_change[-10:] + by_change[:10]]
    _attach_top_buyers(summary_list, rocket_tickers, latest)
    _compute_technicals(rocket_tickers, latest, summary_list)
    return Response(_build_response(latest, ref_date, range_type, summary_list,
                                    sector_stats, near_high, near_low, _fetch_whale_watch(latest), totals))
