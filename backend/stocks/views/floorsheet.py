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
        """
        symbol = request.query_params.get('symbol')
        broker1 = request.query_params.get('broker1')
        broker2 = request.query_params.get('broker2')
        start_date = request.query_params.get('start_date')
        end_date = request.query_params.get('end_date')
        time_range = request.query_params.get('range')

        # If range is provided, override start/end dates
        if time_range:
            range_map = {
                '1D': 0, '1W': 7, '2W': 14, '1M': 30, '3M': 90, '6M': 180, '1Y': 365, 'ALL': 3650
            }
            days = range_map.get(time_range, 30)
            now = timezone.now().date()
            # Try to get the latest transaction date as "today"
            latest_price = DailyStockPrice.objects.order_by('-date').first()
            today = latest_price.date if latest_price else now
            
            end_date_obj = today
            start_date_obj = today - timedelta(days=days)
            
            start_date = start_date_obj.strftime('%Y-%m-%d')
            end_date = end_date_obj.strftime('%Y-%m-%d')

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

        # Base filters
        filters = Q(symbol=symbol)
        
        # Date range filter
        if start_date and end_date:
            filters &= Q(transaction_date__range=[start_date, end_date])
        elif start_date:
            filters &= Q(transaction_date__gte=start_date)
        elif end_date:
            filters &= Q(transaction_date__lte=end_date)
        
        # Broker pair filter: (B1 buys from B2) OR (B2 buys from B1)
        transfer_filter = (Q(buyer_id=b1_id, seller_id=b2_id) | Q(buyer_id=b2_id, seller_id=b1_id))
        
        queryset = DailyFloorsheet.objects.filter(filters & transfer_filter)

        # Get Smart Money (Top 15 holders) to calculate total net accumulation
        top_15_brokers = list(DailyCumulativeAccumulation.objects.filter(
            symbol=symbol
        ).order_by('-transaction_date', '-cumulative_net').values_list('entity_id', flat=True)[:15])

        # Subquery for symbol's total net accumulation (Smart Money flow)
        symbol_daily_net = DailyFloorsheet.objects.filter(filters).values('transaction_date').annotate(
            net_acc=Sum('transaction_quantity', filter=Q(buyer_id__in=top_15_brokers)) - 
                    Sum('transaction_quantity', filter=Q(seller_id__in=top_15_brokers))
        )
        net_acc_map = {item['transaction_date']: item['net_acc'] for item in symbol_daily_net}

        # Daily aggregation helper for broker-specific metrics and symbol totals
        daily_meta = DailyFloorsheet.objects.filter(filters).values('transaction_date').annotate(
            b1_net=Sum('transaction_quantity', filter=Q(buyer_id=b1_id)) - Sum('transaction_quantity', filter=Q(seller_id=b1_id)),
            b2_net=Sum('transaction_quantity', filter=Q(buyer_id=b2_id)) - Sum('transaction_quantity', filter=Q(seller_id=b2_id)),
            b1_buy=Sum('transaction_quantity', filter=Q(buyer_id=b1_id)),
            b1_sell=Sum('transaction_quantity', filter=Q(seller_id=b1_id)),
            b2_buy=Sum('transaction_quantity', filter=Q(buyer_id=b2_id)),
            b2_sell=Sum('transaction_quantity', filter=Q(seller_id=b2_id)),
            symbol_total_vol=Sum('transaction_quantity') # Total market volume for the day
        )
        # Create lookup maps
        meta_map = {item['transaction_date']: item for item in daily_meta}

        # Overall summary aggregations for the transfer pair
        stats = queryset.aggregate(
            total_volume_1_to_2=Sum('transaction_quantity', filter=Q(buyer_id=b1_id, seller_id=b2_id)),
            total_volume_2_to_1=Sum('transaction_quantity', filter=Q(buyer_id=b2_id, seller_id=b1_id)),
            total_amount_1_to_2=Sum('transaction_amount', filter=Q(buyer_id=b1_id, seller_id=b2_id)),
            total_amount_2_to_1=Sum('transaction_amount', filter=Q(buyer_id=b2_id, seller_id=b1_id)),
            count_1_to_2=Count('transaction_id', filter=Q(buyer_id=b1_id, seller_id=b2_id)),
            count_2_to_1=Count('transaction_id', filter=Q(buyer_id=b2_id, seller_id=b1_id)),
            avg_rate_1_to_2=Avg('transaction_rate', filter=Q(buyer_id=b1_id, seller_id=b2_id)),
            avg_rate_2_to_1=Avg('transaction_rate', filter=Q(buyer_id=b2_id, seller_id=b1_id))
        )

        # Daily aggregation for the chart and table
        qs_daily = queryset.values('transaction_date').annotate(
            volume_1_to_2=Sum('transaction_quantity', filter=Q(buyer_id=b1_id, seller_id=b2_id)),
            volume_2_to_1=Sum('transaction_quantity', filter=Q(buyer_id=b2_id, seller_id=b1_id)),
            amount_1_to_2=Sum('transaction_amount', filter=Q(buyer_id=b1_id, seller_id=b2_id)),
            amount_2_to_1=Sum('transaction_amount', filter=Q(buyer_id=b2_id, seller_id=b1_id)),
            avg_rate_1_to_2=Avg('transaction_rate', filter=Q(buyer_id=b1_id, seller_id=b2_id)),
            avg_rate_2_to_1=Avg('transaction_rate', filter=Q(buyer_id=b2_id, seller_id=b1_id))
        ).order_by('transaction_date')

        # Get symbol price history for percentage change
        prices = DailyStockPrice.objects.filter(ticker=symbol).order_by('date')
        price_map = {p.date: float(p.close) for p in prices}
        sorted_dates = sorted(price_map.keys())

        daily_stats = []
        for item in qs_daily:
            dt = item['transaction_date']
            meta = meta_map.get(dt, {})
            
            # Calculate price change %
            price_change = 0
            try:
                idx = sorted_dates.index(dt)
                if idx > 0:
                    curr = price_map[dt]
                    prev = price_map[sorted_dates[idx-1]]
                    if prev > 0:
                        price_change = round(((curr - prev) / prev) * 100, 2)
            except (ValueError, IndexError):
                pass

            item.update({
                'net_accumulation': net_acc_map.get(dt, 0),
                'b1_net': meta.get('b1_net', 0),
                'b2_net': meta.get('b2_net', 0),
                'b1_buy': meta.get('b1_buy', 0),
                'b1_sell': meta.get('b1_sell', 0),
                'b2_buy': meta.get('b2_buy', 0),
                'b2_sell': meta.get('b2_sell', 0),
                'symbol_total_vol': meta.get('symbol_total_vol', 0),
                'price_change_pc': price_change,
                'close_price': price_map.get(dt, 0)
            })
            daily_stats.append(item)

        from ..serializers import DailyFloorsheetSerializer
        
        return Response({
            "summary": {
                "broker1_to_broker2": {
                    "total_volume": stats['total_volume_1_to_2'] or 0,
                    "total_amount": stats['total_amount_1_to_2'] or 0,
                    "total_transactions": stats['count_1_to_2'] or 0,
                    "avg_rate": round(stats['avg_rate_1_to_2'] or 0, 2)
                },
                "broker2_to_broker1": {
                    "total_volume": stats['total_volume_2_to_1'] or 0,
                    "total_amount": stats['total_amount_2_to_1'] or 0,
                    "total_transactions": stats['count_2_to_1'] or 0,
                    "avg_rate": round(stats['avg_rate_2_to_1'] or 0, 2)
                }
            },
            "daily_stats": list(daily_stats),
            "aggregated_transfers": list(daily_stats)[::-1]
        })

    @action(detail=False, methods=['get'])
    def smart_money(self, request):
        """
        Identify top accumulating 'smart brokers' and their active whale signals.
        """
        from datetime import timedelta
        from django.utils import timezone
        from django.db.models import Sum
        from stocks.models.market import Company

        range_param = request.query_params.get('range', '1D')
        range_days = {
            '1D': 0, '2D': 1, '3D': 2, '1W': 6,
            '1M': 29, '3M': 89, '6M': 179,
        }
        days = range_days.get(range_param, 0)

        allowed_symbols = Company.objects.values_list('symbol', flat=True)
        latest_price = DailyStockPrice.objects.order_by('-date').values_list('date', flat=True).first()
        today = latest_price if latest_price else timezone.now().date()
        start_date = today - timedelta(days=days)

        # 1. Leaderboard: Top 10 buying brokers in the selected range
        top_brokers = DailyFloorsheet.objects.filter(
            transaction_date__gte=start_date,
            symbol__in=allowed_symbols
        ).values('buyer_id').annotate(
            total_buy_vol=Sum('transaction_quantity')
        ).order_by('-total_buy_vol')[:10]

        leaderboard = []
        smart_broker_ids = []
        for idx, pb in enumerate(top_brokers):
            rank = 'S' if idx == 0 else 'A' if idx < 3 else 'B' if idx < 6 else 'C'
            score = int((pb['total_buy_vol'] or 0) / 1000)
            leaderboard.append({
                "broker_id": pb['buyer_id'],
                "score": score,
                "rank": rank
            })
            smart_broker_ids.append(pb['buyer_id'])

        # 2. Active Whale Signals: Massive accumulations by these brokers in the selected range
        # Scale minimum qty threshold with the range (shorter ranges = lower threshold)
        min_qty = max(500, int(5000 * max(days, 1) / 30))
        signals_qs = DailyFloorsheet.objects.filter(
            transaction_date__gte=start_date,
            buyer_id__in=smart_broker_ids,
            symbol__in=allowed_symbols
        ).values('buyer_id', 'symbol').annotate(
            qty=Sum('transaction_quantity'),
            amount=Sum('transaction_amount')
        ).filter(qty__gte=min_qty).order_by('-amount')[:20]

        # Fetch LTP for these symbols
        symbols = [s['symbol'] for s in signals_qs]
        prices_qs = DailyStockPrice.objects.filter(ticker__in=symbols).order_by('ticker', '-date').distinct('ticker')
        price_map = {p.ticker: float(p.close) for p in prices_qs if p.close is not None}

        signals = []
        for sq in signals_qs:
            avg_buy_price = float(sq['amount'] / sq['qty']) if sq['qty'] > 0 else 0
            signals.append({
                "broker_id": sq['buyer_id'],
                "symbol": sq['symbol'],
                "avg_buy_price": round(avg_buy_price, 2),
                "ltp": price_map.get(sq['symbol'], 0),
                "qty": sq['qty'],
                "amount": float(sq['amount']),
                "date": str(start_date)
            })

        # 3. KPI aggregates
        kpi = {
            "total_whale_volume": sum(s['qty'] for s in signals),
            "total_whale_amount": sum(s['amount'] for s in signals),
            "active_symbols": len(set(s['symbol'] for s in signals)),
            "active_brokers": len(smart_broker_ids),
        }

        # 4. Top symbols by smart money net volume (buy − sell across all smart brokers)
        buy_side = DailyFloorsheet.objects.filter(
            transaction_date__gte=start_date,
            buyer_id__in=smart_broker_ids,
            symbol__in=allowed_symbols
        ).values('symbol').annotate(
            buy_qty=Sum('transaction_quantity'),
            buy_amount=Sum('transaction_amount'),
            buy_broker_count=Count('buyer_id', distinct=True),
        )
        sell_side = DailyFloorsheet.objects.filter(
            transaction_date__gte=start_date,
            seller_id__in=smart_broker_ids,
            symbol__in=allowed_symbols
        ).values('symbol').annotate(
            sell_qty=Sum('transaction_quantity'),
            sell_amount=Sum('transaction_amount'),
        )

        buy_map  = {r['symbol']: r for r in buy_side}
        sell_map = {r['symbol']: r for r in sell_side}

        all_symbols = set(buy_map) | set(sell_map)
        symbol_flows_raw = []
        for sym in all_symbols:
            b = buy_map.get(sym, {})
            s = sell_map.get(sym, {})
            buy_qty    = b.get('buy_qty', 0) or 0
            sell_qty   = s.get('sell_qty', 0) or 0
            net_qty    = buy_qty - sell_qty
            buy_amount = float(b.get('buy_amount') or 0)
            sell_amount= float(s.get('sell_amount') or 0)
            symbol_flows_raw.append({
                'symbol':        sym,
                'smart_buy_qty': buy_qty,
                'smart_sell_qty':sell_qty,
                'net_qty':       net_qty,
                'buy_amount':    buy_amount,
                'sell_amount':   sell_amount,
                'net_amount':    buy_amount - sell_amount,
                'broker_count':  b.get('buy_broker_count', 0) or 0,
            })

        # Sort by net accumulation (descending); exclude net sellers
        symbol_flows = sorted(
            [sf for sf in symbol_flows_raw if sf['net_qty'] > 0],
            key=lambda x: x['net_qty'], reverse=True
        )[:20]

        return Response({
            "leaderboard": leaderboard,
            "signals": signals,
            "kpi": kpi,
            "symbol_flows": symbol_flows,
        })

    @action(detail=False, methods=['get'])
    def broker_focus_ranking(self, request):
        """
        For each trading day in the range, find the top-10 brokers by buy volume,
        then rank the top-5 stocks those brokers are collectively buying.
        Returns a bump-chart-ready series with per-symbol rank timelines.
        """
        from collections import defaultdict
        from stocks.models.market import Company

        range_param = request.query_params.get('range', '1W')
        range_days = {'1W': 6, '1M': 29}
        days = range_days.get(range_param, 6)

        latest_price = DailyStockPrice.objects.order_by('-date').values_list('date', flat=True).first()
        today = latest_price if latest_price else timezone.now().date()
        start_date = today - timedelta(days=days)

        allowed_symbols = set(Company.objects.values_list('symbol', flat=True))

        # Single query: buy-side grouped by (date, broker, symbol)
        raw = (
            DailyFloorsheet.objects
            .filter(transaction_date__gte=start_date, symbol__in=allowed_symbols)
            .values('transaction_date', 'buyer_id', 'symbol')
            .annotate(vol=Sum('transaction_quantity'), amount=Sum('transaction_amount'))
        )

        # Build: date → broker → { symbol → vol }
        by_date = defaultdict(lambda: defaultdict(lambda: defaultdict(int)))
        for row in raw:
            by_date[row['transaction_date']][row['buyer_id']][row['symbol']] += (row['vol'] or 0)

        dates = sorted(by_date.keys())
        daily_rankings = {}
        daily_top_brokers = {}

        for date in dates:
            # Top 10 brokers by total buy volume that day
            broker_vols = {b: sum(stocks.values()) for b, stocks in by_date[date].items()}
            top10 = sorted(broker_vols, key=lambda b: -broker_vols[b])[:10]

            # Aggregate those brokers' stock buys → top 5
            stock_agg = defaultdict(int)
            stock_brokers = defaultdict(list)
            for broker in top10:
                for sym, vol in by_date[date][broker].items():
                    stock_agg[sym] += vol
                    stock_brokers[sym].append((broker, vol))

            top10_stocks = sorted(stock_agg.items(), key=lambda x: -x[1])[:10]
            
            daily_top_brokers[str(date)] = top10
            daily_rankings[str(date)] = [
                {
                    'symbol': sym, 
                    'rank': idx + 1, 
                    'volume': vol,
                    'top_brokers': [b for b, v in sorted(stock_brokers[sym], key=lambda x: -x[1])[:10]]
                }
                for idx, (sym, vol) in enumerate(top10_stocks)
            ]

        # Build per-symbol rank timelines
        all_syms = {item['symbol'] for day in daily_rankings.values() for item in day}
        date_strs = [str(d) for d in dates]

        series = []
        for sym in all_syms:
            ranks, volumes, appearances, rank_sum = [], [], 0, 0
            for ds in date_strs:
                found = next((x for x in daily_rankings.get(ds, []) if x['symbol'] == sym), None)
                if found:
                    ranks.append(found['rank'])
                    volumes.append(found['volume'])
                    appearances += 1
                    rank_sum += found['rank']
                else:
                    ranks.append(None)
                    volumes.append(None)
            series.append({
                'symbol': sym,
                'ranks': ranks,
                'volumes': volumes,
                'appearances': appearances,
                'avg_rank': round(rank_sum / appearances, 2) if appearances else 10.0,
            })

        # Most consistently present first, then by best average rank
        series.sort(key=lambda s: (-s['appearances'], s['avg_rank']))

        return Response({
            'dates': date_strs,
            'daily_top_brokers': daily_top_brokers,
            'daily_rankings': daily_rankings,
            'series': series,
        })

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
