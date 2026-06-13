from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.db.models import Sum, Count, F, Avg, Q
from stocks.models.market import DailyFloorsheet, DailyStockPrice
from django.utils import timezone
from datetime import timedelta

_RANGE_DAYS = {'1D': 0, '2D': 1, '3D': 2, '1W': 6, '1M': 29, '3M': 89, '6M': 179}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _resolve_queryset(request):
    """Build base queryset filtered by broker, symbol, and date params."""
    broker = request.query_params.get('broker')
    symbol = request.query_params.get('symbol')
    date_str = request.query_params.get('date')

    qs = DailyFloorsheet.objects.all()
    if broker:
        qs = qs.filter(Q(buyer_id=broker) | Q(seller_id=broker))
    if symbol:
        qs = qs.filter(symbol=symbol)
    if date_str:
        return qs.filter(transaction_date=date_str)
    latest = DailyFloorsheet.objects.order_by('-transaction_date').first()
    if latest:
        qs = qs.filter(transaction_date=latest.transaction_date)
    return qs


def _summary_stats(qs):
    """Aggregate turnover, volume, transactions, and avg_rate."""
    return qs.aggregate(
        total_turnover=Sum('transaction_amount'),
        total_volume=Sum('transaction_quantity'),
        total_transactions=Count('transaction_id'),
        avg_rate=Avg('transaction_rate'),
    )


def _top_buyers(qs):
    """Return top-10 buyers ordered by total amount."""
    return list(
        qs.values('buyer_id', 'buyer_name')
        .annotate(total_qty=Sum('transaction_quantity'), total_amt=Sum('transaction_amount'))
        .order_by('-total_amt')[:10]
    )


def _top_sellers(qs):
    """Return top-10 sellers ordered by total amount."""
    return list(
        qs.values('seller_id', 'seller_name')
        .annotate(total_qty=Sum('transaction_quantity'), total_amt=Sum('transaction_amount'))
        .order_by('-total_amt')[:10]
    )


def _build_net_positions(buy_map, sell_map):
    """Compute net buy/sell positions for the union of buyer and seller IDs."""
    all_ids = set(buy_map) | set(sell_map)
    positions = []
    for bid in all_ids:
        bq = buy_map.get(bid, {}).get('buy_qty', 0) or 0
        sq = sell_map.get(bid, {}).get('sell_qty', 0) or 0
        ba = float(buy_map.get(bid, {}).get('buy_amount', 0) or 0)
        sa = float(sell_map.get(bid, {}).get('sell_amount', 0) or 0)
        positions.append({'broker_id': bid, 'buy_qty': bq, 'sell_qty': sq, 'net_qty': bq - sq, 'net_amount': ba - sa})
    return positions


def _resolve_global_smart_ids(today):
    """Return the top-10 buyer_ids market-wide over the past 30 days."""
    from stocks.models.market import Company
    allowed_symbols = Company.objects.values_list('symbol', flat=True)
    thirty_days_ago = today - timedelta(days=30)
    return set(
        DailyFloorsheet.objects
        .filter(transaction_date__gte=thirty_days_ago, symbol__in=allowed_symbols)
        .values('buyer_id')
        .annotate(vol=Sum('transaction_quantity'))
        .order_by('-vol')[:10]
        .values_list('buyer_id', flat=True)
    )


def _build_smart_activity(global_smart_ids, buy_map, sell_map):
    """Return smart-broker activity entries for the given symbol."""
    smart_activity = []
    for bid in global_smart_ids:
        bq = buy_map.get(bid, {}).get('buy_qty', 0) or 0
        sq = sell_map.get(bid, {}).get('sell_qty', 0) or 0
        if bq == 0 and sq == 0:
            continue
        smart_activity.append({
            'broker_id': bid, 'buy_qty': bq, 'sell_qty': sq, 'net_qty': bq - sq,
            'buy_amount': float(buy_map.get(bid, {}).get('buy_amount', 0) or 0),
            'sell_amount': float(sell_map.get(bid, {}).get('sell_amount', 0) or 0),
        })
    smart_activity.sort(key=lambda x: -x['net_qty'])
    return smart_activity


def _build_daily_flow(base_qs):
    """Return daily volume + avg price trend list."""
    daily_qs = (
        base_qs.values('transaction_date')
        .annotate(volume=Sum('transaction_quantity'), turnover=Sum('transaction_amount'), avg_rate=Avg('transaction_rate'))
        .order_by('transaction_date')
    )
    return [
        {'date': str(d['transaction_date']), 'volume': d['volume'] or 0, 'avg_rate': round(float(d['avg_rate'] or 0), 2)}
        for d in daily_qs
    ]


def _format_buyers(top_buyers_qs, total_vol):
    """Format top buyer entries with percentage share."""
    return [
        {'broker_id': b['buyer_id'], 'buy_qty': b['buy_qty'] or 0,
         'buy_amount': float(b['buy_amount'] or 0),
         'pct': round((b['buy_qty'] or 0) / total_vol * 100, 1) if total_vol else 0}
        for b in top_buyers_qs
    ]


def _format_sellers(top_sellers_qs, total_vol):
    """Format top seller entries with percentage share."""
    return [
        {'broker_id': s['seller_id'], 'sell_qty': s['sell_qty'] or 0,
         'sell_amount': float(s['sell_amount'] or 0),
         'pct': round((s['sell_qty'] or 0) / total_vol * 100, 1) if total_vol else 0}
        for s in top_sellers_qs
    ]


def _build_symbol_smart_money_response(top_buyers_qs, top_sellers_qs, base_qs, today):
    """Assemble the full symbol_smart_money response payload."""
    buy_map = {b['buyer_id']: b for b in top_buyers_qs}
    sell_map = {s['seller_id']: s for s in top_sellers_qs}
    total_vol = sum(b['buy_qty'] or 0 for b in top_buyers_qs)
    net_positions = _build_net_positions(buy_map, sell_map)
    net_accumulators = sorted([p for p in net_positions if p['net_qty'] > 0], key=lambda x: -x['net_qty'])[:10]
    net_distributors = sorted([p for p in net_positions if p['net_qty'] < 0], key=lambda x: x['net_qty'])[:5]
    smart_activity = _build_smart_activity(_resolve_global_smart_ids(today), buy_map, sell_map)
    kpi = {
        'total_volume': total_vol, 'unique_buyers': len(top_buyers_qs),
        'unique_sellers': len(top_sellers_qs), 'smart_broker_count': len(smart_activity),
        'net_smart_qty': sum(a['net_qty'] for a in smart_activity),
    }
    return {
        'kpi': kpi,
        'top_buyers': _format_buyers(top_buyers_qs, total_vol),
        'top_sellers': _format_sellers(top_sellers_qs, total_vol),
        'net_accumulators': net_accumulators, 'net_distributors': net_distributors,
        'smart_broker_activity': smart_activity, 'daily_flow': _build_daily_flow(base_qs),
    }


# ---------------------------------------------------------------------------
# ViewSet
# ---------------------------------------------------------------------------

class FloorsheetViewSet(viewsets.ViewSet):
    """ViewSet for Floorsheet Analytics."""

    def list(self, request):
        return Response({"status": "Use /summary/ or /charts/ actions."})

    @action(detail=False, methods=['get'])
    def summary(self, request):
        """Aggregated summary for floorsheet data filtered by broker, symbol, and date."""
        qs = _resolve_queryset(request)
        stats = _summary_stats(qs)
        buyers = _top_buyers(qs)
        sellers = _top_sellers(qs)
        return Response({
            "summary": {
                "total_turnover": stats['total_turnover'] or 0,
                "total_volume": stats['total_volume'] or 0,
                "total_transactions": stats['total_transactions'] or 0,
                "avg_rate": round(stats['avg_rate'] or 0, 2),
            },
            "top_buyers": [
                {"broker": b['buyer_id'], "name": b['buyer_name'], "qty": b['total_qty'], "amount": b['total_amt']}
                for b in buyers
            ],
            "top_sellers": [
                {"broker": b['seller_id'], "name": b['seller_name'], "qty": b['total_qty'], "amount": b['total_amt']}
                for b in sellers
            ],
        })

    @action(detail=False, methods=['get'])
    def broker_transfer(self, request):
        """Analyse share transfers between two specific brokers. Thin wrapper around broker_research.share_transfers."""
        from stocks.services import broker_research

        symbol = request.query_params.get('symbol')
        broker1 = request.query_params.get('broker1')
        broker2 = request.query_params.get('broker2')
        start_date = request.query_params.get('start_date')
        end_date = request.query_params.get('end_date')
        time_range = request.query_params.get('range')

        if not all([symbol, broker1, broker2]):
            return Response(
                {"error": "symbol, broker1, and broker2 are required parameters."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            b1_id, b2_id = int(broker1), int(broker2)
        except (ValueError, TypeError):
            return Response({"error": "broker1 and broker2 must be valid integers."}, status=status.HTTP_400_BAD_REQUEST)

        return Response(broker_research.share_transfers(
            symbol=symbol, broker1=b1_id, broker2=b2_id,
            range_key=time_range, start_date=start_date, end_date=end_date,
        ))

    @action(detail=False, methods=['get'])
    def smart_money(self, request):
        """Identify top accumulating smart brokers. Thin wrapper around broker_research.smart_money."""
        from stocks.services import broker_research
        return Response(broker_research.smart_money(range_key=request.query_params.get('range', '1D')))

    @action(detail=False, methods=['get'])
    def broker_focus_ranking(self, request):
        """Return daily broker focus rankings. Thin wrapper around broker_research.focus_ranking."""
        import traceback
        try:
            from stocks.services import broker_research
            return Response(broker_research.focus_ranking(range_key=request.query_params.get('range', '1W')))
        except Exception as e:
            return Response({'error': str(e), 'traceback': traceback.format_exc(), 'status': 'error'}, status=500)

    @action(detail=False, methods=['get'])
    def symbol_smart_money(self, request):
        """Per-symbol smart money analysis: top buyers/sellers, net positions, daily flow."""
        symbol = request.query_params.get('symbol')
        if not symbol:
            return Response({'error': 'symbol is required'}, status=400)

        range_param = request.query_params.get('range', '1W')
        days = _RANGE_DAYS.get(range_param, 6)
        latest_price = DailyStockPrice.objects.order_by('-date').values_list('date', flat=True).first()
        today = latest_price if latest_price else timezone.now().date()
        start_date = today - timedelta(days=days)
        base_qs = DailyFloorsheet.objects.filter(transaction_date__gte=start_date, symbol=symbol)

        top_buyers_qs = list(base_qs.values('buyer_id').annotate(
            buy_qty=Sum('transaction_quantity'), buy_amount=Sum('transaction_amount')
        ).order_by('-buy_qty')[:10])
        top_sellers_qs = list(base_qs.values('seller_id').annotate(
            sell_qty=Sum('transaction_quantity'), sell_amount=Sum('transaction_amount')
        ).order_by('-sell_qty')[:10])

        return Response(_build_symbol_smart_money_response(top_buyers_qs, top_sellers_qs, base_qs, today))
