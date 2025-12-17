
from rest_framework import status, viewsets
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from .models import DailyStockPrice, DailyFloorsheet, PortfolioItem, PortfolioTransaction, TransactionType, StockFundamental, PortfolioAccount
from .serializers import (
    DailyStockPriceSerializer, DailyFloorsheetSerializer, PortfolioItemSerializer, 
    PortfolioTransactionSerializer, StockFundamentalSerializer
)
from . import serializers # For PortfolioAccountSerializer which was added differently in replacement
from .utils import calculate_broker_commission, calculate_sebon_fee, calculate_dp_charge, calculate_cgt
from decimal import Decimal
from django.db.models import Q

@api_view(['GET'])
@permission_classes([AllowAny])
def search_stocks(request):
    query = request.GET.get('q', '')
    if query:
        tickers = DailyStockPrice.objects.filter(ticker__icontains=query).values_list('ticker', flat=True).distinct()[:10]
    else:
        tickers = DailyStockPrice.objects.values_list('ticker', flat=True).distinct()[:10]
    return Response(tickers)

@api_view(['GET'])
@permission_classes([AllowAny])
def stock_history(request, ticker):
    data = DailyStockPrice.objects.filter(ticker=ticker).order_by('date')
    serializer = DailyStockPriceSerializer(data, many=True)
    return Response(serializer.data)

@api_view(['GET'])
@permission_classes([AllowAny])
def stock_summary(request):
    # Get the latest two dates
    dates = DailyStockPrice.objects.order_by('-date').values_list('date', flat=True).distinct()[:2]
    if not dates:
        return Response({})
    
    latest_date = dates[0]
    prev_date = dates[1] if len(dates) > 1 else None
    
    # Fetch data
    todays_data = DailyStockPrice.objects.filter(date=latest_date)
    prev_data = DailyStockPrice.objects.filter(date=prev_date) if prev_date else []
    
    # Create a map of previous closes
    # Create Sector Map
    fundamentals = StockFundamental.objects.values('ticker', 'sector')
    sector_map = {f['ticker']: f['sector'] for f in fundamentals}
    
    # Create a map of previous closes
    prev_close_map = {d.ticker: d.close for d in prev_data}
    
    summary_list = []
    sector_stats = {} # { 'Banking': { 'total_change': 0, 'count': 0, 'positive': 0, ... } }
    
    total_volume = 0
    total_turnover = 0
    market_points_today = 0
    market_points_prev = 0
    
    advancers_count = 0
    decliners_count = 0
    unchanged_count = 0

    for stock in todays_data:
        prev_close = prev_close_map.get(stock.ticker, stock.open)
        change = stock.close - prev_close
        percent_change = (change / prev_close * 100) if prev_close else 0
        turnover = stock.close * stock.volume
        
        total_volume += stock.volume
        total_turnover += turnover
        market_points_today += stock.close
        market_points_prev += prev_close
        
        if stock.close > stock.open:
             advancers_count += 1
        elif stock.close < stock.open:
             decliners_count += 1
        else:
             unchanged_count += 1

        # Sector Aggregation
        sector = sector_map.get(stock.ticker, 'Others')
        if sector not in sector_stats:
            sector_stats[sector] = {'total_pct_change': 0, 'count': 0, 'turnover': 0}
        
        sector_stats[sector]['total_pct_change'] += percent_change
        sector_stats[sector]['count'] += 1
        sector_stats[sector]['turnover'] += turnover

        summary_list.append({
            'ticker': stock.ticker,
            'close': stock.close,
            'open': stock.open,
            'high': stock.high,
            'low': stock.low,
            'volume': stock.volume,
            'turnover': turnover,
            'change': change,
            'percent_change': percent_change,
            'diff': stock.close - stock.open,
            'sector': sector
        })

    # Finalize Sector Summary
    final_sector_summary = []
    for sec, stats in sector_stats.items():
        if stats['count'] > 0:
            avg_change = stats['total_pct_change'] / stats['count']
            final_sector_summary.append({
                'name': sec,
                'change': avg_change,
                'turnover': stats['turnover'],
                'count': stats['count']
            })
    
    # Sort Sectors by Turnover (desc)
    final_sector_summary.sort(key=lambda x: x['turnover'], reverse=True)

    # Sort lists
    by_volume = sorted(summary_list, key=lambda x: x['volume'])
    by_turnover = sorted(summary_list, key=lambda x: x['turnover'])
    by_change = sorted(summary_list, key=lambda x: x['percent_change'])

    total_stocks = len(summary_list)
    advancers_percent = (advancers_count / total_stocks * 100) if total_stocks else 0
    decliners_percent = (decliners_count / total_stocks * 100) if total_stocks else 0

    response_data = {
        'market_summary': {
            'date': latest_date,
            'total_turnover': total_turnover,
            'total_volume': total_volume,
            'total_points': market_points_today,
            'points_change': market_points_today - market_points_prev,
            'percent_change': ((market_points_today - market_points_prev) / market_points_prev * 100) if market_points_prev else 0,
            'advancers': advancers_count,
            'decliners': decliners_count,
            'advancers_percent': advancers_percent,
            'decliners_percent': decliners_percent
        },
        'sector_summary': final_sector_summary,
        'top_volume': by_volume[-10:][::-1],
        'top_turnover': by_turnover[-10:][::-1],
        'top_gainers': by_change[-10:][::-1],
        'bottom_volume': by_volume[:10],
        'bottom_turnover': by_turnover[:10],
        'top_losers': by_change[:10],
    }
    
    return Response(response_data)

from django.db.models import Sum
@api_view(['GET'])
@permission_classes([AllowAny])
def sector_history(request, sector_name):
    # If sector_name is 'NEPSE', aggregate all. Else filter by sector.
    
    queryset = DailyStockPrice.objects.all()
    
    if sector_name.upper() != 'NEPSE':
        # Get tickers for this sector
        tickers = StockFundamental.objects.filter(sector__iexact=sector_name).values_list('ticker', flat=True)
        queryset = queryset.filter(ticker__in=tickers)
    
    # Aggregate by Date
    history = queryset.values('date').annotate(value=Sum('close')).order_by('date')
    # Limit to last 100 days to avoid huge payload
    history_list = list(history)[-100:] 
    
    return Response(history_list)


@api_view(['GET'])
@permission_classes([AllowAny])
def stock_floorsheet(request, ticker):
    data = DailyFloorsheet.objects.filter(ticker=ticker).order_by('-date')[:50] # Last 50 txns
    serializer = DailyFloorsheetSerializer(data, many=True)
    return Response(serializer.data)

@api_view(['GET'])
@permission_classes([AllowAny])
def stock_detail(request, ticker):
    # 1. Fundamentals
    try:
        fundamental = StockFundamental.objects.get(ticker=ticker)
        fundamental_data = StockFundamentalSerializer(fundamental).data
    except StockFundamental.DoesNotExist:
        fundamental_data = None
        
    # 2. Latest Price Summary (reuse stock_summary logic partially or fetch fresh)
    latest_price = DailyStockPrice.objects.filter(ticker=ticker).order_by('-date').first()
    prev_price_obj = DailyStockPrice.objects.filter(ticker=ticker).order_by('-date')[1:2] # Get 2nd latest
    prev_close = prev_price_obj[0].close if prev_price_obj else (latest_price.open if latest_price else 0)
    
    price_data = {}
    if latest_price:
        change = latest_price.close - prev_close
        percent_change = (change / prev_close * 100) if prev_close else 0
        price_data = {
            'close': latest_price.close,
            'open': latest_price.open,
            'high': latest_price.high,
            'low': latest_price.low,
            'volume': latest_price.volume,
            'change': change,
            'percent_change': percent_change,
            'date': latest_price.date
        }
        
    return Response({
        'fundamental': fundamental_data,
        'price': price_data
    })

class PortfolioAccountViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = serializers.PortfolioAccountSerializer

    def get_queryset(self):
        return PortfolioAccount.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

class PortfolioViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = PortfolioItemSerializer

    def get_queryset(self):
        user = self.request.user
        queryset = PortfolioItem.objects.filter(user=user)
        
        # Filter by Account
        account_id = self.request.query_params.get('account')
        if account_id:
            queryset = queryset.filter(account_id=account_id)
            
        return queryset

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    def list(self, request, *args, **kwargs):
        queryset = self.get_queryset()
        
        # Optimize: Batch fetch latest prices AND previous close
        tickers = [item.ticker for item in queryset]
        latest_prices = {}
        prev_closes = {}
        
        if tickers:
            dates = DailyStockPrice.objects.order_by('-date').values_list('date', flat=True).distinct()[:2]
            if len(dates) >= 1:
                latest_date = dates[0]
                prices = DailyStockPrice.objects.filter(date=latest_date, ticker__in=tickers)
                latest_prices = {p.ticker: p.close for p in prices}
                
                if len(dates) >= 2:
                    prev_date = dates[1]
                    prev_prices = DailyStockPrice.objects.filter(date=prev_date, ticker__in=tickers)
                    prev_closes = {p.ticker: p.close for p in prev_prices}

        # Enrich data
        data = []
        for item in queryset:
            current_price = latest_prices.get(item.ticker, item.buy_price) # Fallback
            prev_close = prev_closes.get(item.ticker, current_price) # Fallback to current (no change)
            
            investment_value = item.quantity * item.buy_price
            current_value = item.quantity * current_price
            gain_loss = current_value - investment_value
            gain_loss_percent = (gain_loss / investment_value * 100) if investment_value else 0
            
            # Today's P/L
            day_change = current_price - prev_close
            day_gain_loss = day_change * item.quantity

            # Attach calculated fields to the object for serialization
            item.current_price = current_price
            item.current_value = current_value
            item.investment_value = investment_value
            item.gain_loss = gain_loss
            item.gain_loss_percent = gain_loss_percent
            item.day_gain_loss = day_gain_loss
            data.append(item)

        serializer = self.get_serializer(data, many=True)
        return Response(serializer.data)

class PortfolioTransactionViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = PortfolioTransactionSerializer

    def get_queryset(self):
        # Optional: Filter transactions by account too if needed
        return PortfolioTransaction.objects.filter(user=self.request.user).order_by('-transaction_date')

    def perform_create(self, serializer):
        user = self.request.user
        data = serializer.validated_data
        
        ticker = data['ticker']
        txn_type = data['transaction_type']
        quantity = data['quantity']
        rate = data['rate']
        account = data.get('account') # Get account from request data
        
        # 1. Calculate Fees (if not provided / overridden by frontend)
        amount = quantity * rate
        commission = data.get('commission', 0) or calculate_broker_commission(amount)
        sebon_fee = data.get('sebon_fee', 0) or calculate_sebon_fee(amount)
        dp_charge = data.get('dp_charge', 0) or calculate_dp_charge()
        
        cgt = Decimal('0.00')
        receivable_amount = amount 
        
        # 2. Update Portfolio Logic
        portfolio_item, created = PortfolioItem.objects.get_or_create(
            user=user, 
            ticker=ticker,
            account=account, # Filter by account
            defaults={'quantity': 0, 'buy_price': 0, 'wacc': 0}
        )
        
        if txn_type == TransactionType.BUY:
            # WACC Calculation: ((Old Qty * Old WACC) + (New Qty * Purchase Rate + Commission + Fees)) / Total Qty
            # Note: Fees are added to cost for WACC
            total_cost_addition = amount + commission + sebon_fee + dp_charge
            old_total_cost = portfolio_item.quantity * portfolio_item.wacc
            
            new_quantity = portfolio_item.quantity + quantity
            new_wacc = (old_total_cost + total_cost_addition) / new_quantity
            
            portfolio_item.quantity = new_quantity
            portfolio_item.wacc = new_wacc
            portfolio_item.buy_price = new_wacc # Update buy_price for display consistency
            portfolio_item.save()
            
            receivable_amount = total_cost_addition # Outflow

        elif txn_type == TransactionType.SELL:
            if portfolio_item.quantity < quantity:
                raise serializers.ValidationError("Insufficient quantity to sell.")
            
            # CGT Calculation: (Sell Rate - WACC) * Qty
            profit_per_share = rate - portfolio_item.wacc
            total_profit = profit_per_share * quantity
            
            if total_profit > 0:
                cgt = calculate_cgt(total_profit, is_long_term=False) # Default to Short Term for now
                
            receivable_amount = amount - commission - sebon_fee - dp_charge - cgt # Inflow
            
            portfolio_item.quantity -= quantity
            if portfolio_item.quantity == 0:
                portfolio_item.delete()
            else:
                portfolio_item.save()

        elif txn_type == TransactionType.BONUS:
            # Bonus has 0 cost. WACC decreases.
            old_total_cost = portfolio_item.quantity * portfolio_item.wacc
            new_quantity = portfolio_item.quantity + quantity
            new_wacc = old_total_cost / new_quantity
            
            portfolio_item.quantity = new_quantity
            portfolio_item.wacc = new_wacc
            portfolio_item.buy_price = new_wacc
            portfolio_item.save()
            
            receivable_amount = 0

        # Save Transaction
        serializer.save(
            user=user,
            amount=amount,
            commission=commission,
            sebon_fee=sebon_fee,
            dp_charge=dp_charge,
            cgt=cgt,
            receivable_amount=receivable_amount
        )
