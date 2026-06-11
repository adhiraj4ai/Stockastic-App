from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.db.models import Sum, Count, F, Avg, Q
from django.db.models.functions import TruncDate
from stocks.models.market import DailyFloorsheet, DailyBuyerFloorsheet, DailySellerFloorsheet, DailyCumulativeAccumulation, DailyStockPrice
from django.utils import timezone
from datetime import datetime, timedelta

class FloorsheetViewSet(viewsets.ViewSet):
    """
    ViewSet for Floorsheet Analytics provided by Floorsheet Analytics Dashboard.
    """

    def list(self, request):
        """
        Standard list of transactions (migrated helper if needed, or just specific endpoints).
        Since we have a specific 'summary' endpoint, this might just be the list view
        similar to market.floorsheet_list but with better structure if needed.
        For now, we can keep using market.floorsheet_list for the raw table
        or reimplement here. Let's strictly add the analytics endpoints here.
        """
        return Response({"status": "Use /summary/ or /charts/ actions."})

    @action(detail=False, methods=['get'])
    def summary(self, request):
        """
        Aggregated summary for floorsheet data.
        """
        broker = request.query_params.get('broker')
        symbol = request.query_params.get('symbol')
        date_str = request.query_params.get('date')
        
        # Base Query
        queryset = DailyFloorsheet.objects.all()

        if broker:
            # Transactions where broker is buyer OR seller
            queryset = queryset.filter(Q(buyer_id=broker) | Q(seller_id=broker))
        
        if symbol:
            queryset = queryset.filter(symbol=symbol)
            
        if date_str:
            queryset = queryset.filter(transaction_date=date_str)
        else:
            # Default to today or latest available?
            # Ideally frontend sends a date range or specific date.
            # If no date, maybe limit to last 200 items logic or just aggregate all?
            # Aggregating ALL history is too heavy. Default to latest date if not provided?
            latest = DailyFloorsheet.objects.order_by('-transaction_date').first()
            if latest:
                queryset = queryset.filter(transaction_date=latest.transaction_date)

        # Aggregations
        stats = queryset.aggregate(
            total_turnover=Sum('transaction_amount'),
            total_volume=Sum('transaction_quantity'),
            total_transactions=Count('transaction_id'),
            avg_rate=Avg('transaction_rate')
        )

        # Top Buyers (Aggregated by Buyer ID)
        # Note: If filtering by broker=X, Top Buyers will show X (as buyer) and others (unknown?)
        # If I am Broker X, I want to know who I bought FROM (Sellers) or what I bought (Symbols).
        # But per the plan: Top Buyers/Sellers.
        
        # If filtering by specific broker, "Top Buyers" might be redundant (it's just them),
        # UNLESS we are looking at specific symbol.
        
        # Generic Logic:
        # Who bought the most in this filtered dataset?
        top_buyers = queryset.values('buyer_id', 'buyer_name').annotate(
            total_qty=Sum('transaction_quantity'),
            total_amt=Sum('transaction_amount')
        ).order_by('-total_amt')[:10]

        # Who sold the most?
        top_sellers = queryset.values('seller_id', 'seller_name').annotate(
            total_qty=Sum('transaction_quantity'),
            total_amt=Sum('transaction_amount')
        ).order_by('-total_amt')[:10]

        return Response({
            "summary": {
                "total_turnover": stats['total_turnover'] or 0,
                "total_volume": stats['total_volume'] or 0,
                "total_transactions": stats['total_transactions'] or 0,
                "avg_rate": round(stats['avg_rate'] or 0, 2)
            },
            "top_buyers": [
                {
                    "broker": b['buyer_id'], 
                    "name": b['buyer_name'], 
                    "qty": b['total_qty'], 
                    "amount": b['total_amt']
                } for b in top_buyers
            ],
            "top_sellers": [
                {
                    "broker": b['seller_id'], 
                    "name": b['seller_name'], 
                    "qty": b['total_qty'], 
                    "amount": b['total_amt']
                } for b in top_sellers
            ]
        })

    @action(detail=False, methods=['get'])
    def broker_transfer(self, request):
        """
        Analyze share transfers between two specific brokers.
        Thin wrapper — param validation here; logic in broker_research.share_transfers.
        """
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
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            b1_id = int(broker1)
            b2_id = int(broker2)
        except (ValueError, TypeError):
            return Response(
                {"error": "broker1 and broker2 must be valid integers."},
                status=status.HTTP_400_BAD_REQUEST
            )

        return Response(broker_research.share_transfers(
            symbol=symbol,
            broker1=b1_id,
            broker2=b2_id,
            range_key=time_range,
            start_date=start_date,
            end_date=end_date,
        ))

    @action(detail=False, methods=['get'])
    def smart_money(self, request):
        """
        Identify top accumulating 'smart brokers' and their active whale signals.
        Thin wrapper — logic in broker_research.smart_money.
        """
        from stocks.services import broker_research

        range_param = request.query_params.get('range', '1D')
        return Response(broker_research.smart_money(range_key=range_param))

    @action(detail=False, methods=['get'])
    def broker_focus_ranking(self, request):
        """
        For each trading day in the range, find the top-10 brokers by buy volume,
        then rank the top-5 stocks those brokers are collectively buying (Net Volume).
        Thin wrapper — logic in broker_research.focus_ranking.
        """
        import traceback
        try:
            from stocks.services import broker_research

            range_param = request.query_params.get('range', '1W')
            return Response(broker_research.focus_ranking(range_key=range_param))
        except Exception as e:
            return Response({
                'error': str(e),
                'traceback': traceback.format_exc(),
                'status': 'error'
            }, status=500)

    @action(detail=False, methods=['get'])
    def symbol_smart_money(self, request):
        """
        Per-symbol smart money analysis: top buyers/sellers, net positions, daily flow,
        and whether globally-ranked smart brokers are active in this symbol.
        """
        from stocks.models.market import Company

        symbol = request.query_params.get('symbol')
        if not symbol:
            return Response({'error': 'symbol is required'}, status=400)

        range_param = request.query_params.get('range', '1W')
        range_days = {'1D': 0, '2D': 1, '3D': 2, '1W': 6, '1M': 29, '3M': 89, '6M': 179}
        days = range_days.get(range_param, 6)

        latest_price = DailyStockPrice.objects.order_by('-date').values_list('date', flat=True).first()
        today = latest_price if latest_price else timezone.now().date()
        start_date = today - timedelta(days=days)
        base_qs = DailyFloorsheet.objects.filter(transaction_date__gte=start_date, symbol=symbol)

        # 1. Top buyers & sellers
        top_buyers_qs  = list(base_qs.values('buyer_id').annotate(
            buy_qty=Sum('transaction_quantity'), buy_amount=Sum('transaction_amount')
        ).order_by('-buy_qty')[:10])
        top_sellers_qs = list(base_qs.values('seller_id').annotate(
            sell_qty=Sum('transaction_quantity'), sell_amount=Sum('transaction_amount')
        ).order_by('-sell_qty')[:10])

        total_vol = sum(b['buy_qty'] or 0 for b in top_buyers_qs)

        top_buyers = [
            {'broker_id': b['buyer_id'], 'buy_qty': b['buy_qty'] or 0,
             'buy_amount': float(b['buy_amount'] or 0),
             'pct': round((b['buy_qty'] or 0) / total_vol * 100, 1) if total_vol else 0}
            for b in top_buyers_qs
        ]
        top_sellers = [
            {'broker_id': s['seller_id'], 'sell_qty': s['sell_qty'] or 0,
             'sell_amount': float(s['sell_amount'] or 0),
             'pct': round((s['sell_qty'] or 0) / total_vol * 100, 1) if total_vol else 0}
            for s in top_sellers_qs
        ]

        # 2. Net positions per broker (union of top buyers + sellers)
        buy_map  = {b['buyer_id']:  b for b in top_buyers_qs}
        sell_map = {s['seller_id']: s for s in top_sellers_qs}
        all_ids  = set(buy_map) | set(sell_map)

        net_positions = []
        for bid in all_ids:
            bq = buy_map.get(bid,  {}).get('buy_qty',   0) or 0
            sq = sell_map.get(bid, {}).get('sell_qty',  0) or 0
            ba = float(buy_map.get(bid,  {}).get('buy_amount',  0) or 0)
            sa = float(sell_map.get(bid, {}).get('sell_amount', 0) or 0)
            net_positions.append({'broker_id': bid, 'buy_qty': bq, 'sell_qty': sq,
                                  'net_qty': bq - sq, 'net_amount': ba - sa})

        net_accumulators = sorted([p for p in net_positions if p['net_qty'] > 0],  key=lambda x: -x['net_qty'])[:10]
        net_distributors  = sorted([p for p in net_positions if p['net_qty'] < 0], key=lambda x:  x['net_qty'])[:5]

        # 3. Global smart broker context (top 10 buyers market-wide in last 30 days)
        allowed_symbols = Company.objects.values_list('symbol', flat=True)
        thirty_days_ago = today - timedelta(days=30)
        global_smart_ids = set(
            DailyFloorsheet.objects.filter(
                transaction_date__gte=thirty_days_ago, symbol__in=allowed_symbols
            ).values('buyer_id').annotate(vol=Sum('transaction_quantity'))
            .order_by('-vol')[:10].values_list('buyer_id', flat=True)
        )

        smart_activity = []
        for bid in global_smart_ids:
            bq = buy_map.get(bid,  {}).get('buy_qty',  0) or 0
            sq = sell_map.get(bid, {}).get('sell_qty', 0) or 0
            if bq == 0 and sq == 0:
                continue
            smart_activity.append({
                'broker_id':   bid,
                'buy_qty':     bq,
                'sell_qty':    sq,
                'net_qty':     bq - sq,
                'buy_amount':  float(buy_map.get(bid,  {}).get('buy_amount',  0) or 0),
                'sell_amount': float(sell_map.get(bid, {}).get('sell_amount', 0) or 0),
            })
        smart_activity.sort(key=lambda x: -x['net_qty'])

        # 4. Daily volume + avg price trend
        daily_qs = base_qs.values('transaction_date').annotate(
            volume=Sum('transaction_quantity'),
            turnover=Sum('transaction_amount'),
            avg_rate=Avg('transaction_rate'),
        ).order_by('transaction_date')
        daily_flow = [
            {'date': str(d['transaction_date']), 'volume': d['volume'] or 0,
             'avg_rate': round(float(d['avg_rate'] or 0), 2)}
            for d in daily_qs
        ]

        # 5. KPI
        kpi = {
            'total_volume':       total_vol,
            'unique_buyers':      len(top_buyers_qs),
            'unique_sellers':     len(top_sellers_qs),
            'smart_broker_count': len(smart_activity),
            'net_smart_qty':      sum(a['net_qty'] for a in smart_activity),
        }

        return Response({
            'kpi':                kpi,
            'top_buyers':         top_buyers,
            'top_sellers':        top_sellers,
            'net_accumulators':   net_accumulators,
            'net_distributors':   net_distributors,
            'smart_broker_activity': smart_activity,
            'daily_flow':         daily_flow,
        })
        return Response({
            'kpi':                kpi,
            'top_buyers':         top_buyers,
            'top_sellers':        top_sellers,
            'net_accumulators':   net_accumulators,
            'net_distributors':   net_distributors,
            'smart_broker_activity': smart_activity,
            'daily_flow':         daily_flow,
        })
