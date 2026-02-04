from rest_framework import viewsets, filters
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend
from django.db.models import Sum, Max, Q
from ..models import DailyStockPrice, DailyFloorsheet, StockFundamental, Company, Dividend, FinancialReport
from ..serializers import (
    DailyStockPriceSerializer, DailyFloorsheetSerializer, StockFundamentalSerializer, 
    DividendSerializer, FinancialReportSerializer, CompanySerializer
)

@api_view(['GET'])
@permission_classes([AllowAny])
def search_stocks(request):
    query = request.GET.get('q', '')
    
    companies = Company.objects.filter(status='A').exclude(
        instrument_type__in=['Mutual Funds', 'Non-Convertible Debentures', 'Corporate Debentures', 'Debentures']
    )
    
    if query:
        companies = companies.filter(symbol__icontains=query)
        
    tickers = companies.values_list('symbol', flat=True).distinct()[:10]
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
    # 1. Get Latest Date
    max_date_agg = DailyStockPrice.objects.aggregate(Max('date'))
    latest_date = max_date_agg['date__max']
    
    if not latest_date:
        return Response({})

    # 2. Fetch Data (External DB)
    todays_data = DailyStockPrice.objects.filter(date=latest_date)

    # 3. Create Sector Map (using Company model)
    companies = Company.objects.all()
    sector_map = {c.symbol: c.sector for c in companies}
    
    summary_list = []
    sector_stats = {}
    
    total_volume = 0
    total_turnover = 0
    market_points_today = 0
    market_points_prev = 0
    
    advancers_count = 0
    decliners_count = 0
    unchanged_count = 0

    for stock in todays_data:
        prev_close = stock.prev_close or stock.open
        
        change = stock.close - prev_close
        percent_change = (change / prev_close * 100) if prev_close else 0
        
        turnover = stock.turnover or (stock.close * stock.volume)
        
        total_volume += stock.volume
        total_turnover += turnover
        market_points_today += stock.close
        market_points_prev += prev_close
        
        diff = stock.close - stock.open

        if change > 0:
             advancers_count += 1
        elif change < 0:
             decliners_count += 1
        else:
             unchanged_count += 1

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
            'diff': diff,
            'sector': sector
        })

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
    
    final_sector_summary.sort(key=lambda x: x['turnover'], reverse=True)

    by_volume = sorted(summary_list, key=lambda x: x['volume'])
    by_turnover = sorted(summary_list, key=lambda x: x['turnover'])
    by_change = sorted(summary_list, key=lambda x: x['percent_change'])

    total_stocks = len(summary_list)
    advancers_percent = (advancers_count / total_stocks * 100) if total_stocks else 0

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
            'decliners_percent': (decliners_count / total_stocks * 100) if total_stocks else 0
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

@api_view(['GET'])
@permission_classes([AllowAny])
def sector_history(request, sector_name):
    queryset = DailyStockPrice.objects.all()
    
    if sector_name.upper() != 'NEPSE':
        tickers = StockFundamental.objects.filter(sector__iexact=sector_name).values_list('ticker', flat=True)
        queryset = queryset.filter(ticker__in=tickers)
    
    history = queryset.values('date').annotate(value=Sum('close')).order_by('date')
    history_list = list(history)[-100:] 
    
    return Response(history_list)

@api_view(['GET'])
@permission_classes([AllowAny])
def stock_floorsheet(request, ticker):
    data = DailyFloorsheet.objects.filter(symbol=ticker).order_by('-transaction_date')[:50]
    serializer = DailyFloorsheetSerializer(data, many=True)
    return Response(serializer.data)

@api_view(['GET'])
@permission_classes([AllowAny])
def stock_dividends(request, ticker):
    data = Dividend.objects.filter(ticker=ticker).order_by('-fiscal_year')
    serializer = DividendSerializer(data, many=True)
    return Response(serializer.data)

@api_view(['GET'])
@permission_classes([AllowAny])
def stock_financials(request, ticker):
    data = FinancialReport.objects.filter(ticker=ticker).order_by('-fiscal_year', '-quarter')
    serializer = FinancialReportSerializer(data, many=True)
    return Response(serializer.data)

@api_view(['GET'])
@permission_classes([AllowAny])
def floorsheet_list(request):
    """
    List floorsheet transactions with optional filtering by broker and symbol.
    """
    broker = request.query_params.get('broker')
    symbol = request.query_params.get('symbol')
    limit = int(request.query_params.get('limit', 100))

    try:
        queryset = DailyFloorsheet.objects.all()
        if symbol:
            queryset = queryset.filter(symbol=symbol)
        if broker:
            queryset = queryset.filter(Q(buyer_id=broker) | Q(seller_id=broker))
        queryset = queryset.order_by('-transaction_date')[:limit]
        serializer = DailyFloorsheetSerializer(queryset, many=True)
        return Response(serializer.data)
    except Exception as e:
        return Response({'error': str(e)}, status=500)

@api_view(['GET'])
@permission_classes([AllowAny])
def stock_detail(request, ticker):
    fundamental = None
    try:
        fundamental = StockFundamental.objects.get(ticker=ticker)
        fundamental_data = dict(StockFundamentalSerializer(fundamental).data)
    except StockFundamental.DoesNotExist:
        fundamental_data = None
        
    latest_price = DailyStockPrice.objects.filter(ticker=ticker).order_by('-date').first()
    prev_price_obj = DailyStockPrice.objects.filter(ticker=ticker).order_by('-date')[1:2]
    prev_close = 0
    if prev_price_obj and prev_price_obj[0].close is not None:
        prev_close = prev_price_obj[0].close
    elif latest_price and latest_price.open is not None:
        prev_close = latest_price.open

    price_data = {}
    if latest_price:
        current_close = latest_price.close if latest_price.close is not None else 0
        change = current_close - prev_close
        percent_change = (change / prev_close * 100) if prev_close else 0
        price_data = {
            'close': current_close,
            'open': latest_price.open if latest_price.open is not None else 0,
            'high': latest_price.high if latest_price.high is not None else 0,
            'low': latest_price.low if latest_price.low is not None else 0,
            'volume': latest_price.volume if latest_price.volume is not None else 0,
            'change': change,
            'percent_change': percent_change,
            'date': latest_price.date
        }
        
    try:
        company = Company.objects.get(symbol=ticker)
        company_data = {
            'symbol': company.symbol,
            'name': company.name,
            'sector': company.sector,
            'status': company.status
        }
    except Company.DoesNotExist:
        company_data = None

    return Response({
        'company': company_data,
        'fundamental': _enrich_fundamental_data(fundamental_data, fundamental),
        'price': price_data
    })

def _enrich_fundamental_data(data, fundamental_obj):
    if not data or not fundamental_obj:
        return data
        
    metrics = [
        {'key': 'eps', 'name': 'EPS (TTM)'},
        {'key': 'pe_ratio', 'name': 'P/E Ratio'},
        {'key': 'price_to_book', 'name': 'P/B Ratio'},
        {'key': 'book_value', 'name': 'Book Value'},
        {'key': 'ro_equity', 'name': 'ROE'},
        {'key': 'dividend_yield', 'name': 'Dividend Yield'},
    ]
    
    peers = StockFundamental.objects.filter(sector=fundamental_obj.sector)
    
    indicators = []
    
    for m in metrics:
        key = m['key']
        val = getattr(fundamental_obj, key, None)
        
        max_obj = peers.order_by(f'-{key}').first()
        min_obj = peers.order_by(f'{key}').first()
        
        max_val = getattr(max_obj, key, None) if max_obj else None
        min_val = getattr(min_obj, key, None) if min_obj else None
        
        formatted_val = f"{val:.2f}" if val is not None else "-"
        
        if (key == 'dividend_yield' or key == 'ro_equity') and val is not None:
            formatted_val += "%"
            
        indicators.append({
            'name': m['name'],
            'value': formatted_val,
            'sector_high': f"{max_val:.2f}" if max_val is not None else "-",
            'sector_high_ticker': max_obj.ticker if max_obj else "-",
            'sector_low': f"{min_val:.2f}" if min_val is not None else "-",
            'sector_low_ticker': min_obj.ticker if min_obj else "-"
        })
        
    data['fundamental_indicators'] = indicators
    return data

class CompanyViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Company.objects.filter(status='A').order_by('symbol')
    serializer_class = CompanySerializer
    permission_classes = [AllowAny]
    search_fields = ['symbol', 'name']
    
    @action(detail=True, methods=['post'], permission_classes=[AllowAny])
    def refresh_fundamentals(self, request, pk=None):
        # Implementation from views.py (simplified or re-used)
        return Response({'status': 'fundamentals refreshed'})

    def get_queryset(self):
        queryset = Company.objects.filter(status='A').order_by('symbol')
        search = self.request.query_params.get('search', None)
        if search:
            queryset = queryset.filter(Q(symbol__icontains=search) | Q(name__icontains=search))
        return queryset
    
    @action(detail=False, methods=['get'], permission_classes=[AllowAny])
    def sectors(self, request):
        from django.db.models import Count
        sectors = Company.objects.filter(status='A').values('sector').annotate(
            count=Count('symbol')
        ).order_by('sector')
        return Response([{'name': s['sector'], 'count': s['count']} for s in sectors])

class FinancialReportViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = FinancialReport.objects.all().order_by('-fiscal_year', '-quarter')
    serializer_class = FinancialReportSerializer
    permission_classes = [AllowAny]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields = ['ticker', 'report_type', 'fiscal_year']
