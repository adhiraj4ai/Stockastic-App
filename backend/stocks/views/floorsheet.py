from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.db.models import Sum, Count, F, Avg, Q
from django.db.models.functions import TruncDate
from stocks.models.market import DailyFloorsheet, DailyBuyerFloorsheet, DailySellerFloorsheet
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
