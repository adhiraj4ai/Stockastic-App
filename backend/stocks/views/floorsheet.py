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
