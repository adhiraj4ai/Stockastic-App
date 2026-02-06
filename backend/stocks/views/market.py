from rest_framework import viewsets, filters
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend
from django.db.models import Sum, Max, Q, Count
from ..models import DailyStockPrice, DailyFloorsheet, StockFundamental, Company, Dividend, FinancialReport
from ..serializers import (
    DailyStockPriceSerializer, DailyFloorsheetSerializer, StockFundamentalSerializer, 
    DividendSerializer, FinancialReportSerializer, CompanySerializer
)
from ..technical import get_technical_indicators
from .accumulation_mixin import AccumulationMixin

@api_view(['GET'])
@permission_classes([AllowAny])
def search_stocks(request):
    query = request.GET.get('q', '')
    
    # EquityManager automatically filters out non-equity instruments
    companies = Company.objects.all()
    
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
    # 1. Get Latest Date with substantial data (> 10 entries)
    latest_date_data = DailyStockPrice.objects.values('date').annotate(
        count=Count('ticker')
    ).filter(count__gt=10).order_by('-date').first()
    
    latest_date = latest_date_data['date'] if latest_date_data else None
    
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
    from django.db.models import Q
    
    # Fetch from FinancialReport
    financial_dividends = FinancialReport.objects.filter(
        ticker=ticker
    ).filter(
        Q(bonus_share__gt=0) | Q(cash_dividend__gt=0) | Q(dividend_announced_date__isnull=False) | Q(dividend_book_close_date__isnull=False)
    ).order_by('-fiscal_year', '-quarter')
    
    results = []
    seen_fy = set()
    
    for report in financial_dividends:
        # Prefer annual reports if available, but keep the first one we find for a fiscal year
        if report.fiscal_year in seen_fy:
            continue
            
        bonus = float(report.bonus_share or 0)
        cash = float(report.cash_dividend or 0)
        
        results.append({
            'fiscal_year': report.fiscal_year,
            'bonus_percent': bonus,
            'cash_percent': cash,
            'total_percent': bonus + cash,
            'date': report.dividend_announced_date, # Primary date for display
            'announced_date': report.dividend_announced_date,
            'book_close_date': report.dividend_book_close_date,
        })
        seen_fy.add(report.fiscal_year)
        
    # Also fetch from Dividend model for legacy data
    dividend_objs = Dividend.objects.filter(ticker=ticker).order_by('-fiscal_year')
    for d in dividend_objs:
        if d.fiscal_year not in seen_fy:
            results.append({
                'fiscal_year': d.fiscal_year,
                'bonus_percent': float(d.bonus_percent),
                'cash_percent': float(d.cash_percent),
                'total_percent': float(d.total_percent),
                'date': d.date,
                'announced_date': d.date,
                'book_close_date': None,
            })
            seen_fy.add(d.fiscal_year)
            
    # Sort results by fiscal year descending
    results.sort(key=lambda x: x['fiscal_year'], reverse=True)
    
    return Response(results)

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
    date = request.query_params.get('date')
    limit = int(request.query_params.get('limit', 100))

    try:
        queryset = DailyFloorsheet.objects.all()
        if symbol:
            queryset = queryset.filter(symbol=symbol)
        if broker:
            queryset = queryset.filter(Q(buyer_id=broker) | Q(seller_id=broker))
        if date:
            queryset = queryset.filter(transaction_date=date)
            
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

    technical_indicators = fundamental.technical_indicators if fundamental and fundamental.technical_indicators else []
    if not technical_indicators:
        # Calculate on the fly if missing from database
        technical_indicators = get_technical_indicators(ticker)

    return Response({
        'company': company_data,
        'fundamental': _enrich_fundamental_data(fundamental_data, fundamental),
        'technical_indicators': technical_indicators,
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

class CompanyViewSet(AccumulationMixin, viewsets.ReadOnlyModelViewSet):
    queryset = Company.objects.all().order_by('symbol')
    serializer_class = CompanySerializer
    permission_classes = [AllowAny]
    search_fields = ['symbol', 'name']
    
    @action(detail=True, methods=['post'], permission_classes=[AllowAny])
    def refresh_fundamentals(self, request, pk=None):
        """Recalculate ALL fundamental metrics dynamically from latest financial reports"""
        from rest_framework import status
        from decimal import Decimal
        
        company = self.get_object()
        ticker = company.symbol
        
        try:
            # Get latest ANNUAL financial report
            latest_report = FinancialReport.objects.filter(
                ticker=ticker,
                report_type='ANNUAL'
            ).order_by('-fiscal_year').first()
            
            if not latest_report:
                return Response(
                    {'error': 'No financial reports found for this company'},
                    status=status.HTTP_404_NOT_FOUND
                )
            
            # Get latest market price
            latest_price = DailyStockPrice.objects.filter(ticker=ticker).order_by('-date').first()
            current_price = float(latest_price.close) if latest_price and latest_price.close else None
            
            # Extract data from JSON fields
            balance_sheet = latest_report.balance_sheet or {}
            profit_loss = latest_report.profit_loss or {}
            
            # Get or create fundamental record
            fundamental, _ = StockFundamental.objects.get_or_create(
                ticker=ticker,
                defaults={
                    'company_name': company.name,
                    'sector': company.sector
                }
            )
            
            # === CALCULATE ALL METRICS FROM JSON DATA ===
            
            # Extract key values from balance sheet
            equity_data = balance_sheet.get('EQUITY', {})
            assets_data = balance_sheet.get('ASSETS', {})
            liabilities_data = balance_sheet.get('LIABILITIES', {})
            
            share_capital = equity_data.get('share_capital')
            total_equity = equity_data.get('total_equity')
            total_assets = assets_data.get('total_assets')
            total_liabilities = liabilities_data.get('total_liabilities')
            
            # Extract from profit & loss
            income_data = profit_loss.get('INCOME', {})
            expenses_data = profit_loss.get('EXPENSES', {})
            
            total_revenue = income_data.get('total_operating_income') or income_data.get('net_interest_income')
            net_profit = expenses_data.get('net_profit')
            
            # Calculate number of shares (face value = 100)
            num_shares = share_capital / 100 if share_capital else None
            
            # 1. EPS = Net Profit / Number of Shares
            if net_profit and num_shares:
                fundamental.eps = round(Decimal(net_profit / num_shares), 2)
            
            # 2. Book Value = Total Equity / Number of Shares
            if total_equity and num_shares:
                fundamental.book_value = round(Decimal(total_equity / num_shares), 2)
            
            # 3. ROE = (Net Profit / Total Equity) * 100
            if net_profit and total_equity and total_equity > 0:
                fundamental.ro_equity = round(Decimal((net_profit / total_equity) * 100), 2)
            
            # 4. ROA = (Net Profit / Total Assets) * 100
            if net_profit and total_assets and total_assets > 0:
                fundamental.ro_assets = round(Decimal((net_profit / total_assets) * 100), 2)
            
            # 5. P/E Ratio = Market Price / EPS
            if current_price and fundamental.eps and fundamental.eps > 0:
                fundamental.pe_ratio = round(Decimal(current_price / float(fundamental.eps)), 2)
            
            # 6. P/B Ratio = Market Price / Book Value
            if current_price and fundamental.book_value and fundamental.book_value > 0:
                fundamental.price_to_book = round(Decimal(current_price / float(fundamental.book_value)), 2)
            
            # 7. Price to Sales = Market Cap / Revenue
            if current_price and num_shares and total_revenue and total_revenue > 0:
                market_cap = current_price * num_shares
                fundamental.market_cap = round(Decimal(market_cap), 2)
                fundamental.price_to_sales = round(Decimal(market_cap / total_revenue), 2)
            
            # 8. Debt to Equity = Total Liabilities / Total Equity
            if total_liabilities and total_equity and total_equity > 0:
                fundamental.debt_to_equity = round(Decimal(total_liabilities / total_equity), 2)
            
            # 9. Shares Outstanding
            if num_shares:
                fundamental.shares_outstanding = round(Decimal(num_shares), 2)
            
            # 10. Paid Up Capital
            if share_capital:
                fundamental.paid_up_capital = round(Decimal(share_capital), 2)
            
            # 11. Dividend Yield = (Latest Cash Dividend per Share / Market Price) * 100
            # Search for the latest report WITH a cash dividend, not necessarily the latest report overall
            latest_div_report = FinancialReport.objects.filter(
                ticker=ticker,
                cash_dividend__gt=0
            ).order_by('-fiscal_year', '-quarter').first()
            
            if latest_div_report and current_price and current_price > 0:
                # cash_dividend is a percentage of face value (100)
                cash_amount = float(latest_div_report.cash_dividend)
                fundamental.dividend_yield = round(Decimal((cash_amount / current_price) * 100), 2)
            else:
                fundamental.dividend_yield = 0
            
            fundamental.save()
            
            # Return updated data
            serializer = StockFundamentalSerializer(fundamental)
            return Response(serializer.data)
            
        except Exception as e:
            import traceback
            return Response(
                {'error': str(e), 'traceback': traceback.format_exc()},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    def get_queryset(self):
        queryset = Company.objects.all().order_by('symbol')
        search = self.request.query_params.get('search', None)
        if search:
            queryset = queryset.filter(Q(symbol__icontains=search) | Q(name__icontains=search))
        return queryset
    
    @action(detail=False, methods=['get'], permission_classes=[AllowAny])
    def sectors(self, request):
        from django.db.models import Count
        sectors = Company.objects.all().values('sector').annotate(
            count=Count('symbol')
        ).order_by('sector')
        return Response([{'name': s['sector'], 'count': s['count']} for s in sectors])

class FinancialReportViewSet(viewsets.ModelViewSet):
    queryset = FinancialReport.objects.all().order_by('-fiscal_year', '-quarter')
    serializer_class = FinancialReportSerializer
    permission_classes = [AllowAny]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields = ['ticker', 'report_type', 'fiscal_year']

class StockFundamentalViewSet(viewsets.ModelViewSet):
    """ViewSet for managing StockFundamental metadata"""
    queryset = StockFundamental.objects.all()
    serializer_class = StockFundamentalSerializer
    permission_classes = [AllowAny]
    lookup_field = 'ticker'
    
    def partial_update(self, request, ticker=None):
        """Update company metadata fields"""
        from rest_framework import status
        
        try:
            fundamental = self.get_object()
            
            # Update allowed fields
            allowed_fields = ['listed_date', 'market_cap', 'free_float_market_cap', 'shares_outstanding', 'public_shares']
            for field in allowed_fields:
                if field in request.data:
                    setattr(fundamental, field, request.data[field])
            
            fundamental.save()
            
            serializer = self.get_serializer(fundamental)
            return Response(serializer.data)
        except StockFundamental.DoesNotExist:
            return Response(
                {'error': 'Fundamental data not found for this ticker'},
                status=status.HTTP_404_NOT_FOUND
            )
        except Exception as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
