

from rest_framework import status, viewsets
from rest_framework.decorators import api_view, permission_classes, action
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from .models import DailyStockPrice, DailyFloorsheet, PortfolioItem, PortfolioTransaction, TransactionType, StockFundamental, PortfolioAccount, Strategy, Company, WatchlistItem
from .serializers import (
    DailyStockPriceSerializer, DailyFloorsheetSerializer, PortfolioItemSerializer, 
    PortfolioTransactionSerializer, StockFundamentalSerializer, StrategySerializer, CompanySerializer, WatchlistItemSerializer
)
from . import serializers # For PortfolioAccountSerializer which was added differently in replacement
from .utils import calculate_broker_commission, calculate_sebon_fee, calculate_dp_charge, calculate_cgt
from decimal import Decimal
from django.db.models import Q
import ast
import tempfile
import os
import subprocess
import json
from .optimization import perform_portfolio_optimization
# rest_framework imports are already at the top

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
    from django.db.models import Max
    # 1. Get Latest Date
    max_date_agg = DailyStockPrice.objects.aggregate(Max('date'))
    latest_date = max_date_agg['date__max']
    
    if not latest_date:
        return Response({})

    # 2. Fetch Data (External DB)
    todays_data = DailyStockPrice.objects.filter(date=latest_date)

    # 3. Create Sector Map (using Company model)
    # Using 'Company' model mapped to 'companies' table
    companies = Company.objects.all()
    # Create dict: symbol -> sector
    sector_map = {c.symbol: c.sector for c in companies}
    
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
        # Use prev_close directly from the model (mapped to DB)
        prev_close = stock.prev_close or stock.open # Fallback if None
        
        # Calculate change
        change = stock.close - prev_close
        percent_change = (change / prev_close * 100) if prev_close else 0
        
        # Use turnover directly from model (mapped to DB)
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
            'diff': diff,
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

from .models import Dividend, FinancialReport
from .serializers import DividendSerializer, FinancialReportSerializer

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
        company_sectors = {}
        volatilities = {}
        
        if tickers:
            import pandas as pd
            from datetime import timedelta
            from django.utils import timezone
            
            # 1. Fetch Price Data
            dates = DailyStockPrice.objects.order_by('-date').values_list('date', flat=True).distinct()[:2]
            if len(dates) >= 1:
                latest_date = dates[0]
                prices = DailyStockPrice.objects.filter(date=latest_date, ticker__in=tickers)
                latest_prices = {p.ticker: p.close for p in prices}
                
                if len(dates) >= 2:
                    prev_date = dates[1]
                    prev_prices = DailyStockPrice.objects.filter(date=prev_date, ticker__in=tickers)
                    prev_closes = {p.ticker: p.close for p in prev_prices}
            
            # 2. Fetch Sector Data
            companies = Company.objects.filter(symbol__in=tickers).values('symbol', 'sector')
            company_sectors = {c['symbol']: c['sector'] for c in companies}
            
            # 3. Calculate Volatility (30-day Annualized)
            # Fetch last 45 days (approx 30 trading days)
            try:
                cutoff_date = (timezone.now() if dates else timezone.now()) - timedelta(days=60)
                if dates: cutoff_date = dates[0] - timedelta(days=60)
                
                # Fetch price history for tickers
                hist_qs = DailyStockPrice.objects.filter(
                    ticker__in=tickers,
                    date__gte=cutoff_date
                ).values('ticker', 'date', 'close').order_by('date')
                
                df_hist = pd.DataFrame.from_records(hist_qs)
                if not df_hist.empty:
                    df_hist['close'] = df_hist['close'].astype(float)
                    
                    for ticker in tickers:
                        df_t = df_hist[df_hist['ticker'] == ticker]
                        if len(df_t) > 10:
                            # Daily Returns
                            df_t = df_t.sort_values('date')
                            returns = df_t['close'].pct_change().dropna()
                            # Annualized Volatility = StdDev * sqrt(252) * 100
                            # Using 30-day window primarily, but here we take whatever we fetched
                            if not returns.empty:
                                vol = returns.std() * (252 ** 0.5) * 100
                                volatilities[ticker] = vol
            except Exception as e:
                print(f"Volatility Calc Error: {e}")

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
            
            # Risk Metrics
            item.sector = company_sectors.get(item.ticker, 'Unknown')
            item.volatility = volatilities.get(item.ticker, 0.0)
            
            data.append(item)

        serializer = self.get_serializer(data, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def optimize(self, request):
        user = request.user
        account_id = request.query_params.get('account')
        
        queryset = PortfolioItem.objects.filter(user=user)
        if account_id and account_id != 'all':
            queryset = queryset.filter(account_id=account_id)
            
        tickers = list(queryset.values_list('ticker', flat=True).distinct())
        
        if not tickers:
            return Response({"error": "Portfolio is empty"}, status=status.HTTP_400_BAD_REQUEST)
            
        method = request.query_params.get('method', 'max_sharpe')
        
        # Prepare current holdings for trade suggestions
        current_holdings = {}
        for item in queryset:
            ticker = item.ticker
            if ticker not in current_holdings:
                # Get the latest price for this ticker
                latest_price_obj = DailyStockPrice.objects.filter(ticker=ticker).order_by('-date').first()
                latest_price = float(latest_price_obj.close) if latest_price_obj else 0
                current_holdings[ticker] = {'quantity': 0, 'price': latest_price}
            
            current_holdings[ticker]['quantity'] += float(item.quantity)

        result = perform_portfolio_optimization(tickers, current_holdings=current_holdings, method=method)
        
        if not result.get("success"):
            return Response(result, status=status.HTTP_400_BAD_REQUEST)
            
        return Response(result)

    @action(detail=True, methods=['get'])
    def suggest_exits(self, request, pk=None):
        """
        Suggest Exit Strategies (SL/TP) based on different logic.
        """
        import pandas as pd
        from datetime import timedelta
        import numpy as np
        
        item = self.get_object()
        ticker = item.ticker
        
        # Fetch Data
        hist = DailyStockPrice.objects.filter(ticker=ticker).order_by('-date')[:60] # Last ~3 months
        if not hist:
            return Response({"error": "No price data found"}, status=400)
            
        latest_price = float(hist[0].close)
        
        # Prepare Dataframe
        df = pd.DataFrame(list(hist.values('date', 'high', 'low', 'close'))[::-1]) # Reverse to chronological
        
        # 1. ATR Strategy
        if len(df) > 14:
            df['tr1'] = df['high'] - df['low']
            df['tr2'] = (df['high'] - df['close'].shift(1)).abs()
            df['tr3'] = (df['low'] - df['close'].shift(1)).abs()
            df['tr'] = df[['tr1', 'tr2', 'tr3']].max(axis=1)
            atr = df['tr'].rolling(window=14).mean().iloc[-1]
            atr = float(atr) if not pd.isna(atr) else (latest_price * 0.02)
        else:
            atr = latest_price * 0.02 # Fallback 2%
            
        # 2. Swing Levels (Last 20 days)
        recent = df.tail(20)
        swing_low = float(recent['low'].min())
        swing_high = float(recent['high'].max())
        
        strategies = {
            "fixed": {
                "name": "Fixed Percentage",
                "sl": latest_price * 0.95, # 5% SL
                "tp": latest_price * 1.10, # 10% TP
                "desc": "Traditional 5% Stop / 10% Target"
            },
            "atr_conservative": {
                "name": "ATR (Conservative)",
                "sl": latest_price - (2 * atr),
                "tp": latest_price + (3 * atr),
                "desc": f"Based on volatility ({atr:.2f}). 2x ATR Stop."
            },
            "atr_aggressive": {
                "name": "ATR (Aggressive)",
                "sl": latest_price - (1 * atr),
                "tp": latest_price + (2 * atr),
                "desc": "Tight stop for momentum trades."
            },
            "swing": {
                "name": "Support/Resistance",
                "sl": swing_low * 0.99, # Just below support
                "tp": swing_high * 1.01, # Just above resistance (breakout) or at resistance? Usually Target is Resistance. Let's say Target = Resistance.
                "desc": f"Recent Low: {swing_low}, Recent High: {swing_high}"
            }
        }
        
        # Adjust Swing TP
        if strategies['swing']['tp'] <= latest_price * 1.02:
             strategies['swing']['tp'] = latest_price * 1.15
        
        # 3. Fundamental Health Check
        health_warnings = []
        try:
            reports = FinancialReport.objects.filter(ticker=ticker).order_by('-fiscal_year', '-quarter')[:4]
            if len(reports) >= 2:
                latest_r = reports[0]
                prev_r = reports[1]
                
                if latest_r.net_profit and prev_r.net_profit:
                    if float(latest_r.net_profit) < float(prev_r.net_profit):
                        health_warnings.append({
                            "type": "PROFIT_DIP",
                            "message": f"Net Profit dropped from {float(prev_r.net_profit):,.0f} to {float(latest_r.net_profit):,.0f} in latest report.",
                            "severity": "MEDIUM"
                        })
                
                if latest_r.revenue and prev_r.revenue:
                    if float(latest_r.revenue) < float(prev_r.revenue):
                        health_warnings.append({
                            "type": "REVENUE_DIP",
                            "message": f"Revenue declined by {((1 - float(latest_r.revenue)/float(prev_r.revenue))*100):.1f}% in latest period.",
                            "severity": "LOW"
                        })
        except Exception as e:
            print(f"Health check error: {e}")

        return Response({
            "ticker": ticker,
            "current_price": latest_price,
            "avg_buy_price": float(item.buy_price),
            "strategies": strategies,
            "health_warnings": health_warnings
        })

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

class StrategyViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = StrategySerializer

    def get_queryset(self):
        # Return user's own strategies and public ones
        return Strategy.objects.filter(Q(user=self.request.user) | Q(is_public=True))

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    @action(detail=False, methods=['post'])
    def validate_code(self, request):
        code = request.data.get('code', '')
        
        # 1. Basic Syntax Check (AST)
        try:
            ast.parse(code)
        except SyntaxError as e:
            return Response({
                'valid': False,
                'issues': [{
                    'line': e.lineno,
                    'message': f"Syntax Error: {e.msg}",
                    'type': 'error',
                    'symbol': 'syntax-error'
                }]
            })
            
        # 2. Advanced Linting (Pylint)
        with tempfile.NamedTemporaryFile(mode='w', suffix='.py', delete=False) as temp:
            temp.write(code)
            temp_path = temp.name

        try:
            # Run pylint with JSON output
            # Use sys.executable to ensure we use the same python environment
            import sys
            result = subprocess.run(
                [sys.executable, '-m', 'pylint', '--output-format=json', '--disable=C0114,C0115,C0116,C0103', temp_path],
                capture_output=True,
                text=True
            )
            
            issues = []
            if result.stdout:
                try:
                    pylint_issues = json.loads(result.stdout)
                    for issue in pylint_issues:
                        issues.append({
                            'line': issue['line'],
                            'message': issue['message'],
                            'type': issue['type'], # convention, refactor, warning, error
                            'symbol': issue['symbol-id'] if 'symbol-id' in issue else issue['symbol']
                        })
                except json.JSONDecodeError:
                    # If stdout isn't JSON, maybe it crashed or printed something else
                    issues.append({
                        'line': 0, 
                        'message': f"Linter Parse Error: {result.stdout[:100]}", 
                        'type': 'error', 
                        'symbol': 'pylint-error'
                    })
            
            if result.stderr:
                 issues.append({
                    'line': 0, 
                    'message': f"Linter Stderr: {result.stderr[:100]}", 
                    'type': 'error', 
                    'symbol': 'pylint-stderr'
                })

            return Response({
                'valid': len(issues) == 0,
                'issues': issues,
                'message': 'Linting completed'
            })

        except Exception as e:
            return Response({
                'valid': False, 
                'message': str(e), 
                'issues': [{
                    'line': 0,
                    'message': f"Internal Error: {str(e)}",
                    'type': 'error',
                    'symbol': 'internal-error'
                }]
            })
    @action(detail=False, methods=['post'], permission_classes=[AllowAny])
    def backtest(self, request):
        code = request.data.get('code', '')
        symbol = request.data.get('symbol')
        sector = request.data.get('sector')
        start_date = request.data.get('start_date')
        end_date = request.data.get('end_date')

        if not start_date or not end_date:
            return Response({'error': 'Start and End dates are required'}, status=400)
        
        if not symbol and not sector:
            return Response({'error': 'Either symbol or sector is required'}, status=400)

        # If sector is provided, run backtest for all stocks in sector
        if sector:
            # Note: case-insensitive match for sector
            companies = Company.objects.filter(sector__iexact=sector, status='A').values_list('symbol', flat=True)
            if not companies:
                return Response({'error': f'No active companies found in sector: {sector}'}, status=404)
            
            sector_results = []
            successful_backtests = 0
            failed_stocks = []
            
            for stock_symbol in companies:
                try:
                    # Run backtest for this stock
                    result, error = self._run_single_backtest(code, stock_symbol, start_date, end_date)
                    if result:
                        sector_results.append({
                            'symbol': stock_symbol,
                            'return': result['stats']['pnl_percent'], # Consistent key
                            'total_pnl': result['stats']['total_pnl'],
                            'win_rate': result['stats']['win_rate'],
                            'total_trades': result['stats']['total_trades']
                        })
                        successful_backtests += 1
                    else:
                        failed_stocks.append({'symbol': stock_symbol, 'error': error or 'No data'})
                except Exception as e:
                    failed_stocks.append({'symbol': stock_symbol, 'error': str(e)})
                    continue
            
            # Calculate aggregated metrics if any succeeded
            avg_return = 0
            avg_win_rate = 0
            total_trades = 0
            best_stock = None
            worst_stock = None

            if sector_results:
                avg_return = sum(r.get('return', 0) or 0 for r in sector_results) / len(sector_results)
                avg_win_rate = sum(r.get('win_rate', 0) or 0 for r in sector_results) / len(sector_results)
                total_trades = sum(r.get('total_trades', 0) or 0 for r in sector_results)
                best_stock = max(sector_results, key=lambda x: x.get('return', 0) or 0)
                worst_stock = min(sector_results, key=lambda x: x.get('return', 0) or 0)
            
            return Response({
                'sector': sector,
                'total_companies': len(companies),
                'successful_backtests': successful_backtests,
                'aggregated_stats': {
                    'avg_return': avg_return,
                    'avg_win_rate': avg_win_rate,
                    'total_trades': total_trades,
                    'best_stock': best_stock,
                    'worst_stock': worst_stock
                },
                'individual_results': sorted(sector_results, key=lambda x: x.get('return', 0) or 0, reverse=True),
                'failed_stocks': failed_stocks
            })
        
        # Single stock backtest
        result, error = self._run_single_backtest(code, symbol, start_date, end_date)
        if result is None:
            return Response({'error': error or 'No data found for symbol/dates'}, status=400)
        return Response(result)
    
    def _run_single_backtest(self, code, symbol, start_date, end_date):
        """Helper method to run backtest for a single stock. Returns (result_dict, error_msg)."""
        # 1. Fetch Data
        queryset = DailyStockPrice.objects.filter(
            ticker=symbol, 
            date__range=[start_date, end_date]
        ).order_by('date')
        
        ticks_data = list(queryset.values('date', 'open', 'high', 'low', 'close', 'volume'))
        if not ticks_data:
            return None, "No historical data found for this symbol/date range."

        try:
            import pandas as pd
            from backtesting import Backtest, Strategy
            from backtesting.lib import crossover
            from backtesting.test import SMA
            import inspect
            import os
            import tempfile
            import datetime
            import numpy as np
            
            # Create DataFrame
            df = pd.DataFrame(ticks_data)
            df.rename(columns={
                'open': 'Open', 
                'high': 'High', 
                'low': 'Low', 
                'close': 'Close', 
                'volume': 'Volume'
            }, inplace=True)
            
            # Convert Decimals to Floats for backtesting.py
            numeric_cols = ['Open', 'High', 'Low', 'Close', 'Volume']
            df[numeric_cols] = df[numeric_cols].astype(float)
            
            # Filter Bad Data (Price Spikes due to bad Open)
            df = df[
                (df['High'] / df['Open'] <= 2.0) & 
                (df['Low'] / df['Open'] >= 0.5) &
                (df['Close'] > 0)
            ].copy()
            
            if len(df) < 10: # Need minimum amount of data to run signals
                return None, f"Insufficient data points ({len(df)}) after filtering."
            
            df['date'] = pd.to_datetime(df['date'])
            df.set_index('date', inplace=True)
            
            # 2. Execution Environment
            local_scope = {
                'Backtest': Backtest,
                'Strategy': Strategy,
                'crossover': crossover,
                'SMA': SMA,
                'pd': pd,
            }
            
            # Execute User Code
            try:
                exec(code, local_scope)
            except Exception as code_err:
                return None, f"Code Execution Error: {str(code_err)}"
            
            # Find the Strategy Class
            strategy_class = None
            for name, obj in local_scope.items():
                if inspect.isclass(obj) and issubclass(obj, Strategy) and obj is not Strategy:
                    strategy_class = obj
                    break
            
            if not strategy_class:
                return None, "No Strategy class found in code."

            # 3. Run Backtest
            bt = Backtest(df, strategy_class,
                          cash=1000000, commission=.002,
                          exclusive_orders=True)
            
            try:
                stats = bt.run()
            except Exception as bt_err:
                return None, f"Backtest Engine Error: {str(bt_err)}"
            
            # 4. Generate Plot (Optional for Sector)
            plot_html = None
            fd, plot_path = tempfile.mkstemp(suffix='.html')
            os.close(fd) 
            
            try:
                bt.plot(filename=plot_path, open_browser=False)
                with open(plot_path, 'r', encoding='utf-8') as f:
                    plot_html = f.read()
            except:
                pass # Non-critical if plot fails
            finally:
                if os.path.exists(plot_path):
                    os.remove(plot_path)

            # 5. Format Stats for Frontend
            stats_dict = stats.to_dict()
            clean_stats = {}
            
            # Extract Trades DataFrame for advanced calculation
            trades_df = stats.get('_trades')
            
            # Helper to safely convert numbers
            def safe_num(val, default=0.0):
                if val is None: return default
                if isinstance(val, (int, float)):
                    return float(val) if not np.isnan(val) else default
                return default

            # Standard Stats
            clean_stats['pnl_percent'] = safe_num(stats.get('Return [%]'))
            clean_stats['total_pnl'] = safe_num(stats.get('Equity Final [$]', 1000000) - 1000000)
            clean_stats['win_rate'] = safe_num(stats.get('Win Rate [%]'))
            clean_stats['total_trades'] = int(safe_num(stats.get('# Trades'), 0))
            
            # Advanced Stats
            if isinstance(trades_df, pd.DataFrame) and not trades_df.empty:
                try:
                    winning_trades = trades_df[trades_df['PnL'] > 0]
                    losing_trades = trades_df[trades_df['PnL'] <= 0]
                    
                    count_win = len(winning_trades)
                    count_loss = len(losing_trades)
                    
                    gross_profit = safe_num(winning_trades['PnL'].sum())
                    gross_loss = safe_num(losing_trades['PnL'].sum())
                    
                    clean_stats['Total Winning Trades'] = count_win
                    clean_stats['Total Losing Trades'] = count_loss
                    clean_stats['Gross Profit'] = gross_profit
                    clean_stats['Gross Loss'] = gross_loss
                    clean_stats['Average Win'] = safe_num(gross_profit / count_win) if count_win > 0 else 0
                    clean_stats['Average Loss'] = safe_num(gross_loss / count_loss) if count_loss > 0 else 0
                    
                except Exception as e:
                    print(f"Error calculating advanced stats: {e}")

            # Collect all other stats safely
            for k, v in stats_dict.items():
                if k.startswith('_'): continue
                if k in clean_stats: continue # Keep our safe ones

                if isinstance(v, (int, float, np.integer, np.floating)):
                    clean_stats[k] = safe_num(v)
                elif isinstance(v, (str, bool, type(None))):
                    clean_stats[k] = v
                elif hasattr(v, 'isoformat'):
                    clean_stats[k] = v.isoformat()
                else:
                    clean_stats[k] = str(v)
            
            formatted_stats = {
                'total_pnl': clean_stats.get('total_pnl', 0.0),
                'pnl_percent': clean_stats.get('pnl_percent', 0.0),
                'win_rate': clean_stats.get('win_rate', 0.0),
                'final_equity': clean_stats.get('Equity Final [$]', 1000000.0),
                'total_trades': clean_stats.get('total_trades', 0),
                'sharpe_ratio': clean_stats.get('Sharpe Ratio', 0.0),
                'max_drawdown': clean_stats.get('Max. Drawdown [%]', 0.0),
                'raw': clean_stats
            }

            return {
                'stats': formatted_stats,
                'plot_html': plot_html
            }, None

        except Exception as e:
            return None, str(e)

    @action(detail=False, methods=['post'], permission_classes=[AllowAny])
    def optimize(self, request):
        """
        Optimize strategy parameters using Optuna
        """
        import optuna
        
        code_template = request.data.get('code', '')
        symbol = request.data.get('symbol', 'NABIL')
        start_date = request.data.get('start_date')
        end_date = request.data.get('end_date')
        n_trials = request.data.get('n_trials', 50)
        param_ranges = request.data.get('param_ranges', {})
        
        if not start_date or not end_date:
            return Response({'error': 'Start and End dates are required'}, status=400)
        
        if not param_ranges:
            return Response({'error': 'param_ranges required (e.g., {"n1": [5, 30], "n2": [20, 100]})'}, status=400)
        
        try:
            import pandas as pd
            from backtesting import Backtest, Strategy
            from backtesting.lib import crossover
            from backtesting.test import SMA
            import inspect
            
            # Fetch data once
            queryset = DailyStockPrice.objects.filter(
                ticker=symbol,
                date__range=[start_date, end_date]
            ).order_by('date')
            
            ticks_data = list(queryset.values('date', 'open', 'high', 'low', 'close', 'volume'))
            if not ticks_data:
                return Response({'error': 'No data found for symbol/dates'}, status=404)
            
            df = pd.DataFrame(ticks_data)
            df.rename(columns={
                'open': 'Open',
                'high': 'High',
                'low': 'Low',
                'close': 'Close',
                'volume': 'Volume'
            }, inplace=True)
            
            numeric_cols = ['Open', 'High', 'Low', 'Close', 'Volume']
            df[numeric_cols] = df[numeric_cols].astype(float)
            
            # Filter bad data
            df = df[
                (df['High'] / df['Open'] <= 2.0) &
                (df['Low'] / df['Open'] >= 0.5) &
                (df['Close'] > 0)
            ].copy()
            
            if df.empty:
                return Response({'error': 'No valid data after filtering'}, status=400)
            
            df['date'] = pd.to_datetime(df['date'])
            df.set_index('date', inplace=True)
            
            # Validate that all parameters exist in the code
            for param_name in param_ranges.keys():
                if f"{param_name} = " not in code_template:
                    return Response({
                        'error': f'Parameter "{param_name}" not found in strategy code. Available parameters must be defined as class attributes like "n1 = 10".'
                    }, status=400)
            
            # Define objective function
            def objective(trial):
                # Suggest parameters
                params = {}
                for param_name, param_config in param_ranges.items():
                    # Support both old format [min, max] and new format {type: 'int/float', range: [min, max]}
                    if isinstance(param_config, dict):
                        param_type = param_config.get('type', 'int')
                        min_val, max_val = param_config['range']
                        
                        if param_type == 'float':
                            params[param_name] = trial.suggest_float(param_name, min_val, max_val)
                        else:
                            params[param_name] = trial.suggest_int(param_name, int(min_val), int(max_val))
                    else:
                        # Old format: [min, max]
                        min_val, max_val = param_config
                        params[param_name] = trial.suggest_int(param_name, min_val, max_val)
                
                # Replace parameters in code template
                code = code_template
                for param_name, param_value in params.items():
                    # Replace class attributes like "n1 = 10" with "n1 = <optimized_value>"
                    code = code.replace(f"{param_name} = ", f"{param_name} = {param_value} #")
                
                # Execute strategy code
                local_scope = {
                    'Backtest': Backtest,
                    'Strategy': Strategy,
                    'crossover': crossover,
                    'SMA': SMA,
                    'pd': pd,
                }
                
                exec(code, local_scope)
                
                # Find strategy class
                strategy_class = None
                for name, obj in local_scope.items():
                    if inspect.isclass(obj) and issubclass(obj, Strategy) and obj is not Strategy:
                        strategy_class = obj
                        break
                
                if not strategy_class:
                    raise ValueError('No Strategy class found')
                
                # Run backtest
                bt = Backtest(df, strategy_class, cash=1000000, commission=.002, exclusive_orders=True)
                stats = bt.run()
                
                # Return metric to optimize (Return %)
                return stats['Return [%]']
            
            # Run optimization
            study = optuna.create_study(direction='maximize', study_name='strategy_optimization')
            study.optimize(objective, n_trials=n_trials, show_progress_bar=False)
            
            # Get results
            best_params = study.best_params
            best_value = study.best_value
            
            # Get trial history
            trials_data = []
            for trial in study.trials:
                trials_data.append({
                    'number': trial.number,
                    'params': trial.params,
                    'value': trial.value,
                    'state': str(trial.state)
                })
            
            # Generate optimized code with best parameters
            optimized_code = code_template
            for param_name, param_value in best_params.items():
                # Replace parameter values in code
                import re
                pattern = rf'(\s{param_name}\s*=\s*)\d+'
                optimized_code = re.sub(pattern, rf'\g<1>{param_value}', optimized_code)
            
            return Response({
                'best_params': best_params,
                'best_value': best_value,
                'n_trials': len(study.trials),
                'trials': trials_data,
                'optimized_code': optimized_code
            })
            
        except Exception as e:
            import traceback
            tb = traceback.format_exc()
            return Response({'error': f"Optimization Error: {str(e)}", 'traceback': tb}, status=400)


class CompanyViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Company.objects.filter(status='A').order_by('symbol')
    serializer_class = CompanySerializer
    permission_classes = [AllowAny]
    search_fields = ['symbol', 'name']
    
    def get_queryset(self):
        queryset = Company.objects.filter(status='A').order_by('symbol')
        search = self.request.query_params.get('search', None)
        if search:
            queryset = queryset.filter(Q(symbol__icontains=search) | Q(name__icontains=search))
        return queryset
    
    @action(detail=False, methods=['get'], permission_classes=[AllowAny])
    def sectors(self, request):
        """Return all unique sectors with company counts (status='A' only)"""
        from django.db.models import Count
        sectors = Company.objects.filter(status='A').values('sector').annotate(
            count=Count('symbol')
        ).order_by('sector')
        return Response([
            {'name': s['sector'], 'count': s['count']} 
            for s in sectors
        ])
    
    @action(detail=False, methods=['get'], permission_classes=[AllowAny])
    def accumulation(self, request):
        """
        Return accumulation data using accurate row-based offsets (LAG).
        """
        time_range = request.query_params.get('range', '1D')
        sector = request.query_params.get('sector', 'All')
        
        # Map frontend range to row offset
        range_map = {
            '1D': 1, '1W': 5, '2W': 10, '1M': 20, '3M': 60, '6M': 120, '1Y': 250, '2Y': 500
        }
        offset = range_map.get(time_range, 1) if time_range != 'ALL' else 1000000

        from django.db import connections
        
        # Using LAG for accurate N-row lookback regardless of calendar dates
        query = f"""
        WITH ranked_data AS (
            SELECT 
                ca.symbol, ca.entity_id, ca.transaction_date, ca.cumulative_net as pos_now,
                LAG(ca.cumulative_net, {offset}) OVER (
                    PARTITION BY ca.symbol, ca.entity_id ORDER BY ca.transaction_date
                ) as pos_past,
                MAX(ca.transaction_date) OVER () as latest_date
            FROM daily_cumulative_accumulation ca
            INNER JOIN companies c ON ca.symbol = c.symbol
            WHERE c."instrumentType" NOT IN ('Mutual Funds', 'Non-Convertible Debentures')
            {"" if sector.lower() == 'all' else f"AND c.\\\"sectorName\\\" = '{sector}'"}
        ),
        institutional_flows AS (
            SELECT 
                symbol, entity_id, pos_now,
                COALESCE(pos_past, 0) as pos_past,
                (pos_now - COALESCE(pos_past, 0)) as net_volume
            FROM ranked_data
            WHERE transaction_date = latest_date
            -- Define "Institutional" as having at least 100k shares at some point
            AND (pos_now > 100000 OR pos_past > 100000)
        ),
        aggregated_accumulation AS (
            SELECT 
                symbol,
                SUM(CASE WHEN net_volume > 0 THEN net_volume ELSE 0 END) AS buy_qty,
                SUM(CASE WHEN net_volume < 0 THEN ABS(net_volume) ELSE 0 END) AS sell_qty,
                ARRAY_AGG(entity_id ORDER BY net_volume DESC) FILTER (WHERE net_volume > 0) AS buyers,
                ARRAY_AGG(entity_id ORDER BY net_volume ASC) FILTER (WHERE net_volume < 0) AS sellers
            FROM institutional_flows
            GROUP BY symbol
        )
        SELECT 
            aa.symbol, c."companyName" as name, c."sectorName" as sector,
            aa.buy_qty, aa.sell_qty, (aa.buy_qty - aa.sell_qty) as net_qty,
            CASE WHEN (aa.buy_qty + aa.sell_qty) > 0 
                THEN (CAST(aa.buy_qty AS NUMERIC) / (aa.buy_qty + aa.sell_qty)) * 100 
                ELSE 0 END as accumulation_ratio,
            COALESCE(aa.buyers[1:3], ARRAY[]::text[]) as top_buyers,
            COALESCE(aa.sellers[1:3], ARRAY[]::text[]) as top_sellers,
            dsp.close
        FROM aggregated_accumulation aa
        INNER JOIN companies c ON aa.symbol = c.symbol
        LEFT JOIN (
            SELECT DISTINCT ON (symbol) symbol, close 
            FROM daily_stock_price ORDER BY symbol, transaction_date DESC
        ) dsp ON aa.symbol = dsp.symbol
        ORDER BY net_qty DESC;
        """
        
        with connections['stock_market'].cursor() as cursor:
            cursor.execute(query)
            columns = [col[0] for col in cursor.description]
            results = [dict(zip(columns, row)) for row in cursor.fetchall()]
            
        return Response(results)

    @action(detail=False, methods=['get'], permission_classes=[AllowAny])
    def aggressive(self, request):
        """
        Identify aggressive institutional activity relative to 20D average volume.
        Uses accurate LAG-based row offsets for deltas.
        """
        time_range = request.query_params.get('range', '1W')
        sector = request.query_params.get('sector', 'All')
        
        range_map = {
            '1D': 1, '1W': 5, '2W': 10, '1M': 20, '3M': 60, '6M': 120, '1Y': 250, '2Y': 500
        }
        offset_val = range_map.get(time_range, 5)
        
        from django.db import connections
        
        query = f"""
        WITH ranked_data AS (
            SELECT 
                ca.symbol, ca.entity_id, ca.transaction_date, ca.cumulative_net as pos_now,
                LAG(ca.cumulative_net, {offset_val}) OVER (
                    PARTITION BY ca.symbol, ca.entity_id ORDER BY ca.transaction_date
                ) as pos_past,
                MAX(ca.transaction_date) OVER () as latest_date
            FROM daily_cumulative_accumulation ca
            INNER JOIN companies c ON ca.symbol = c.symbol
            WHERE c."instrumentType" NOT IN ('Mutual Funds', 'Non-Convertible Debentures')
            {"" if sector.lower() == 'all' else f"AND c.\\\"sectorName\\\" = '{sector}'"}
        ),
        avg_volume_cte AS (
            SELECT 
                symbol,
                AVG(volume) OVER (PARTITION BY symbol ORDER BY transaction_date DESC ROWS BETWEEN CURRENT ROW AND 19 FOLLOWING) as avg_vol_20d,
                close,
                transaction_date,
                ROW_NUMBER() OVER (PARTITION BY symbol ORDER BY transaction_date DESC) as rn
            FROM daily_stock_price
            WHERE transaction_date <= (SELECT MAX(transaction_date) FROM daily_cumulative_accumulation)
        ),
        latest_avg_vol AS (
            SELECT symbol, avg_vol_20d, close FROM avg_volume_cte WHERE rn = 1
        ),
        pos_change AS (
            SELECT 
                symbol, entity_id, pos_now,
                (pos_now - COALESCE(pos_past, 0)) as net_volume
            FROM ranked_data
            WHERE transaction_date = latest_date
            AND (pos_now > 100000 OR pos_past > 100000)
        ),
        symbol_summary AS (
            SELECT 
                symbol,
                SUM(CASE WHEN net_volume > 0 THEN net_volume ELSE 0 END) as institutional_buy,
                SUM(CASE WHEN net_volume < 0 THEN ABS(net_volume) ELSE 0 END) as institutional_sell,
                ARRAY_AGG(entity_id ORDER BY net_volume DESC) FILTER (WHERE net_volume > 0) as top_buyers,
                ARRAY_AGG(entity_id ORDER BY net_volume ASC) FILTER (WHERE net_volume < 0) as top_sellers
            FROM pos_change
            GROUP BY symbol
        ),
        intensity_cte AS (
            SELECT 
                ss.symbol, c."companyName" as name, c."sectorName" as sector,
                ss.institutional_buy, ss.institutional_sell,
                (ss.institutional_buy - ss.institutional_sell) as net_qty,
                lav.avg_vol_20d,
                lav.close,
                CASE 
                    WHEN lav.avg_vol_20d > 0 
                    THEN ROUND(((CAST(ss.institutional_buy AS NUMERIC) - ss.institutional_sell) / lav.avg_vol_20d) * 100, 2)
                    ELSE 0 
                END as intensity,
                COALESCE(ss.top_buyers[1:3], ARRAY[]::text[]) as producers,
                COALESCE(ss.top_sellers[1:3], ARRAY[]::text[]) as offloaders
            FROM symbol_summary ss
            INNER JOIN companies c ON ss.symbol = c.symbol
            INNER JOIN latest_avg_vol lav ON ss.symbol = lav.symbol
        )
        SELECT * FROM intensity_cte
        WHERE ABS(intensity) > 5 -- At least 5% of daily volume
        ORDER BY ABS(intensity) DESC;
        """
        
        with connections['stock_market'].cursor() as cursor:
            cursor.execute(query)
            columns = [col[0] for col in cursor.description]
            results = [dict(zip(columns, row)) for row in cursor.fetchall()]
            
        return Response({
            'accumulators': [r for r in results if r['intensity'] > 0][:10],
            'distributors': [r for r in results if r['intensity'] < 0][:10]
        })
            
    @action(detail=False, methods=['get'], permission_classes=[AllowAny])
    def broker_trends(self, request):
        """
        Execute raw SQL for broker-level accumulation trends.
        """
        from django.db import connections
        
        query = """
        WITH trend_data AS (
            SELECT 
                ca.*,
                ca.cumulative_net - LAG(ca.cumulative_net, 5) OVER (
                    PARTITION BY ca.symbol, ca.entity_id ORDER BY ca.transaction_date
                ) AS net_5d,
                ca.cumulative_net - LAG(ca.cumulative_net, 10) OVER (
                    PARTITION BY ca.symbol, ca.entity_id ORDER BY ca.transaction_date
                ) AS net_10d,
                ca.cumulative_net - LAG(ca.cumulative_net, 20) OVER (
                    PARTITION BY ca.symbol, ca.entity_id ORDER BY ca.transaction_date
                ) AS net_20d,
                ca.cumulative_net - LAG(ca.cumulative_net, 50) OVER (
                    PARTITION BY ca.symbol, ca.entity_id ORDER BY ca.transaction_date
                ) AS net_50d,
                MAX(ca.transaction_date) OVER () AS latest_date
            FROM daily_cumulative_accumulation ca
            INNER JOIN companies c ON ca.symbol = c.symbol
            WHERE c."instrumentType" NOT IN ('Mutual Funds', 'Non-Convertible Debentures')
        )
        SELECT 
            symbol,
            entity_id as broker,
            cumulative_net,
            ROUND(cumulative_buy_amount / NULLIF(cumulative_buy, 0), 2) as wac,
            CASE WHEN net_5d > 0 THEN 'Increasing' WHEN net_5d < 0 THEN 'Decreasing' ELSE 'Stable' END AS trend_5d,
            ABS(COALESCE(net_5d, 0)) AS change_5d,
            CASE WHEN net_10d > 0 THEN 'Increasing' WHEN net_10d < 0 THEN 'Decreasing' ELSE 'Stable' END AS trend_10d,
            ABS(COALESCE(net_10d, 0)) AS change_10d,
            CASE WHEN net_20d > 0 THEN 'Increasing' WHEN net_20d < 0 THEN 'Decreasing' ELSE 'Stable' END AS trend_20d,
            ABS(COALESCE(net_20d, 0)) AS change_20d,
            CASE WHEN net_50d > 0 THEN 'Increasing' WHEN net_50d < 0 THEN 'Decreasing' ELSE 'Stable' END AS trend_50d,
            ABS(COALESCE(net_50d, 0)) AS change_50d
        FROM trend_data
        WHERE transaction_date = latest_date
        AND cumulative_net > 250000
        ORDER BY cumulative_net DESC;
        """
        
        with connections['stock_market'].cursor() as cursor:
            cursor.execute(query)
            # Fetch all rows and convert to list of dicts
            columns = [col[0] for col in cursor.description]
            results = [
                dict(zip(columns, row))
                for row in cursor.fetchall()
            ]
            
        return Response(results)

    @action(detail=False, methods=['get'], permission_classes=[AllowAny])
    def accumulation_brokers(self, request):
        """Return unique broker IDs from accumulation data."""
        from django.db import connections
        query = "SELECT DISTINCT entity_id FROM daily_cumulative_accumulation"
        with connections['stock_market'].cursor() as cursor:
            cursor.execute(query)
            results = [row[0] for row in cursor.fetchall() if row[0]]
        # Sort as integers for numeric ordering
        return Response(sorted(results, key=lambda x: int(x) if x.isdigit() else 999))

    @action(detail=False, methods=['get'], permission_classes=[AllowAny])
    def accumulation_symbols(self, request):
        """Return unique symbols from accumulation data."""
        from django.db import connections
        query = "SELECT DISTINCT symbol FROM daily_cumulative_accumulation"
        with connections['stock_market'].cursor() as cursor:
            cursor.execute(query)
            results = [row[0] for row in cursor.fetchall() if row[0]]
        return Response(sorted(results))
    @action(detail=False, methods=['get'], permission_classes=[AllowAny])
    def broker_favorites(self, request):
        """
        Calculate net accumulation for a specific broker across multiple time periods.
        Allows identifying a broker's preferred stocks over 1D, 1W, 1M, etc.
        """
        from django.db import connections
        broker = request.query_params.get('broker')
        
        if not broker:
            return Response({'error': 'broker ID is required'}, status=400)

        query = """
        WITH latest_date AS (
            SELECT MAX(transaction_date) as mdate FROM daily_cumulative_accumulation
        ),
        base_data AS (
            SELECT 
                symbol,
                cumulative_net,
                cumulative_buy,
                cumulative_buy_amount,
                transaction_date,
                LAG(cumulative_net, 1) OVER (PARTITION BY symbol ORDER BY transaction_date) as prev_1d,
                LAG(cumulative_net, 2) OVER (PARTITION BY symbol ORDER BY transaction_date) as prev_2d,
                LAG(cumulative_net, 3) OVER (PARTITION BY symbol ORDER BY transaction_date) as prev_3d,
                LAG(cumulative_net, 7) OVER (PARTITION BY symbol ORDER BY transaction_date) as prev_1w,
                LAG(cumulative_net, 30) OVER (PARTITION BY symbol ORDER BY transaction_date) as prev_1m,
                LAG(cumulative_net, 90) OVER (PARTITION BY symbol ORDER BY transaction_date) as prev_3m,
                LAG(cumulative_net, 180) OVER (PARTITION BY symbol ORDER BY transaction_date) as prev_6m,
                LAG(cumulative_net, 365) OVER (PARTITION BY symbol ORDER BY transaction_date) as prev_1y,
                FIRST_VALUE(cumulative_net) OVER (PARTITION BY symbol ORDER BY transaction_date) as initial_val
            FROM daily_cumulative_accumulation
            WHERE entity_id = %s
        )
        SELECT 
            b.symbol,
            c."companyName" as name,
            b.cumulative_net as current_net,
            ROUND(b.cumulative_buy_amount / NULLIF(b.cumulative_buy, 0), 2) as wac,
            (b.cumulative_net - COALESCE(b.prev_1d, b.cumulative_net)) as change_1d,
            (b.cumulative_net - COALESCE(b.prev_2d, b.prev_1d, b.cumulative_net)) as change_2d,
            (b.cumulative_net - COALESCE(b.prev_3d, b.prev_1d, b.cumulative_net)) as change_3d,
            (b.cumulative_net - COALESCE(b.prev_1w, b.prev_1d, b.cumulative_net)) as change_1w,
            (b.cumulative_net - COALESCE(b.prev_1m, b.prev_1d, b.cumulative_net)) as change_1m,
            (b.cumulative_net - COALESCE(b.prev_3m, b.prev_1d, b.cumulative_net)) as change_3m,
            (b.cumulative_net - COALESCE(b.prev_6m, b.prev_1d, b.cumulative_net)) as change_6m,
            (b.cumulative_net - COALESCE(b.prev_1y, b.prev_1d, b.cumulative_net)) as change_1y,
            (b.cumulative_net - b.initial_val) as change_all
        FROM base_data b
        JOIN companies c ON b.symbol = c.symbol
        WHERE b.transaction_date = (SELECT mdate FROM latest_date)
        ORDER BY b.cumulative_net DESC;
        """
        
        with connections['stock_market'].cursor() as cursor:
            cursor.execute(query, [broker])
            columns = [col[0] for col in cursor.description]
            results = [dict(zip(columns, row)) for row in cursor.fetchall()]
            
        return Response(results)

    @action(detail=False, methods=['get'], permission_classes=[AllowAny])
    def broker_portfolio(self, request):
        """
        Get current portfolio/holdings of a specific broker.
        """
        broker_id = request.query_params.get('broker_id')
        if not broker_id:
            return Response({'error': 'broker_id is required'}, status=400)
            
        from django.db import connections
        
        query = """
        WITH latest_positions AS (
            SELECT 
                ca.symbol, 
                ca.entity_id, 
                ca.cumulative_net,
                ROW_NUMBER() OVER (PARTITION BY ca.symbol, ca.entity_id ORDER BY ca.transaction_date DESC) as rn
            FROM daily_cumulative_accumulation ca
            WHERE ca.entity_id = %s
        )
        SELECT 
            pos.symbol,
            c."companyName" as name,
            c."sectorName" as sector,
            pos.cumulative_net as quantity,
            dsp.close as current_price,
            (pos.cumulative_net * dsp.close) as value,
            dsp.transaction_date as latest_price_date
        FROM latest_positions pos
        INNER JOIN companies c ON pos.symbol = c.symbol
        LEFT JOIN (
            SELECT DISTINCT ON (symbol) symbol, close, transaction_date
            FROM daily_stock_price
            ORDER BY symbol, transaction_date DESC
        ) dsp ON pos.symbol = dsp.symbol
        WHERE pos.rn = 1 
        AND pos.cumulative_net > 0
        ORDER BY value DESC;
        """
        
        with connections['stock_market'].cursor() as cursor:
            cursor.execute(query, [broker_id])
            columns = [col[0] for col in cursor.description]
            results = [dict(zip(columns, row)) for row in cursor.fetchall()]
            
        return Response({
            'broker_id': broker_id,
            'total_value': sum(r['value'] for r in results if r['value']),
            'holdings': results
        })

    @action(detail=False, methods=['get'], permission_classes=[AllowAny])
    def brokers_graph(self, request):
        """
        Return time-series data for the Top 5 accumulators of a specific symbol.
        Format: [{ "date": "2023-01-01", "broker_1": 100, "broker_2": 150, ... }]
        """
        symbol = request.query_params.get('symbol')
        time_range = request.query_params.get('range', '1Y')
        
        if not symbol:
            return Response({'error': 'Symbol is required'}, status=400)
            
        from django.db import connections
        from datetime import timedelta
        from django.utils import timezone
        
        from django.db.models import Max
        
        # Calculate start date based on range
        # Use latest market date instead of system date
        max_date_agg = DailyStockPrice.objects.aggregate(Max('date'))
        today = max_date_agg['date__max'] or timezone.now().date()
        
        range_map = {
            '1W': 7, '2W': 14, '1M': 30, '3M': 90, '6M': 180, '1Y': 365, '2Y': 730, '5Y': 1825, 'ALL': 3650
        }
        days = range_map.get(time_range, 365)
        start_date = today - timedelta(days=days)
        
        with connections['stock_market'].cursor() as cursor:
            # 1. Identify Top 5 Brokers by current holding
            cursor.execute("""
                SELECT entity_id 
                FROM daily_cumulative_accumulation 
                WHERE symbol = %s 
                AND transaction_date = (SELECT MAX(transaction_date) FROM daily_cumulative_accumulation)
                ORDER BY cumulative_net DESC 
                LIMIT 5
            """, [symbol])
            top_brokers = [row[0] for row in cursor.fetchall()]
            
            if not top_brokers:
                return Response({'data': [], 'brokers': []})
            
            # 2. Fetch history for these brokers
            # We use dynamic columns for the pivot-like result in Python
            placeholders = ', '.join(['%s'] * len(top_brokers))
            query = f"""
                SELECT 
                    transaction_date, 
                    entity_id, 
                    cumulative_net 
                FROM daily_cumulative_accumulation
                WHERE symbol = %s 
                AND entity_id IN ({placeholders})
                AND transaction_date >= %s
            """
            cursor.execute(query, [symbol] + top_brokers + [start_date])
            rows = cursor.fetchall()
            
            # 3. Fetch Volume Leaders (Active Investors) - MUST BE INSIDE CURSOR BLOCK
            volume_leaders = self._get_volume_leaders(cursor, symbol, start_date)
            
            # Fetch Aggressive Traders (Net Buyers/Sellers)
            aggressive_traders = self._get_aggressive_traders(cursor, symbol, start_date)
            
            # Calculate Total Volume for the period to determine percentage
            total_vol_query = """
                SELECT SUM(volume) 
                FROM daily_stock_price 
                WHERE symbol = %s AND transaction_date >= %s
            """
            cursor.execute(total_vol_query, [symbol, start_date])
            total_market_vol = cursor.fetchone()[0] or 1 # Avoid div by 0
            
        # 4. Process into Recharts/ECharts format with Forward Fill
        # Create a complete date range
        date_list = [start_date + timedelta(days=x) for x in range((today - start_date).days + 1)]
        
        # Organize raw data: { broker_id: { date_str: qty } }
        raw_data_map = {}
        for row in rows:
            t_date = row[0].isoformat() if hasattr(row[0], 'isoformat') else str(row[0])
            broker = str(row[1])
            qty = row[2]
            
            if broker not in raw_data_map:
                raw_data_map[broker] = {}
            raw_data_map[broker][t_date] = qty

        # Forward fill for each broker
        final_data = []
        
        # Dictionary to hold the running cumulative count for each broker
        running_holdings = {broker: 0 for broker in top_brokers}

        for d in date_list:
            d_str = d.isoformat()
            day_entry = {'date': d_str}
            
            for broker in top_brokers:
                if broker in raw_data_map and d_str in raw_data_map[broker]:
                    running_holdings[broker] = raw_data_map[broker][d_str]
                day_entry[broker] = running_holdings[broker]
                
            final_data.append(day_entry)
        
        # Annotate with percentage (Calculate outside DB block)
        for v in volume_leaders:
             v['percentage'] = round((v['volume'] / (total_market_vol * 2)) * 100, 2)

        return Response({
            'data': final_data,
            'brokers': top_brokers,
            'volume_leaders': volume_leaders,
            'buy_leaders': aggressive_traders['buy_leaders'],
            'sell_leaders': aggressive_traders['sell_leaders']
        })
        



    def _get_volume_leaders(self, cursor, symbol, start_date):
        """Helper to fetch top brokers by volume (buy + sell) in the period using Floorsheet."""
        # Calculate volume directly from floorsheet transactions for accuracy
        query = """
            WITH broker_volume AS (
                SELECT buyer_id as broker, transaction_quantity as vol FROM daily_floorsheet 
                WHERE symbol = %s AND transaction_date >= %s
                UNION ALL
                SELECT seller_id as broker, transaction_quantity as vol FROM daily_floorsheet 
                WHERE symbol = %s AND transaction_date >= %s
            )
            SELECT broker, SUM(vol) as total_vol
            FROM broker_volume
            GROUP BY broker
            ORDER BY total_vol DESC
            LIMIT 10
        """
        cursor.execute(query, [symbol, start_date, symbol, start_date])
        return [
            {'broker': str(row[0]), 'volume': row[1]} 
            for row in cursor.fetchall()
        ]

    def _get_aggressive_traders(self, cursor, symbol, start_date):
        """Helper to fetch top Net Buyers and Net Sellers."""
        # 1. Aggregate Buys
        cursor.execute("""
            SELECT buyer_id, SUM(transaction_quantity), SUM(transaction_quantity * transaction_rate)
            FROM daily_floorsheet
            WHERE symbol = %s AND transaction_date >= %s
            GROUP BY buyer_id
        """, [symbol, start_date])
        buys = {row[0]: {'qty': row[1], 'amt': row[2]} for row in cursor.fetchall()}

        # 2. Aggregate Sells
        cursor.execute("""
            SELECT seller_id, SUM(transaction_quantity), SUM(transaction_quantity * transaction_rate)
            FROM daily_floorsheet
            WHERE symbol = %s AND transaction_date >= %s
            GROUP BY seller_id
        """, [symbol, start_date])
        sells = {row[0]: {'qty': row[1], 'amt': row[2]} for row in cursor.fetchall()}

        # 3. Calculate Net
        brokers = set(buys.keys()) | set(sells.keys())
        net_stats = []
        
        for b in brokers:
            b_buy = buys.get(b, {'qty': 0, 'amt': 0})
            b_sell = sells.get(b, {'qty': 0, 'amt': 0})
            
            net_qty = b_buy['qty'] - b_sell['qty']
            
            # WAC (Weighted Average Cost)
            # For Buyer: Buy Avg Rate
            # For Seller: Sell Avg Rate
            buy_rate = (b_buy['amt'] / b_buy['qty']) if b_buy['qty'] else 0
            sell_rate = (b_sell['amt'] / b_sell['qty']) if b_sell['qty'] else 0
            
            net_stats.append({
                'broker': str(b),
                'net_qty': net_qty,
                'buy_qty': b_buy['qty'],
                'sell_qty': b_sell['qty'],
                'buy_rate': round(buy_rate, 2),
                'sell_rate': round(sell_rate, 2)
            })

        # 4. Sort Leaders
        buy_leaders = sorted([x for x in net_stats if x['net_qty'] > 0], key=lambda x: x['net_qty'], reverse=True)[:10]
        sell_leaders = sorted([x for x in net_stats if x['net_qty'] < 0], key=lambda x: x['net_qty'])[:10] # Most negative first

        return {'buy_leaders': buy_leaders, 'sell_leaders': sell_leaders}

    @action(detail=False, methods=['get'], permission_classes=[AllowAny])
    def recommendations(self, request):
        """
        Scan market for trading signals.
        Strategy: 'smart_cross', 'ema_cross', 'ichimoku'
        """
        strategy_type = request.query_params.get('strategy', 'smart_cross')
        sector = request.query_params.get('sector', 'All')
        
        import pandas as pd
        from datetime import timedelta
        from django.utils import timezone
        
        # 1. Fetch relevant stocks
        companies = Company.objects.all()
        if sector != 'All':
            companies = companies.filter(sectorName=sector)
        
        # Exclude funds
        companies = companies.exclude(instrumentType__in=['Mutual Funds', 'Non-Convertible Debentures'])
        
        active_tickers = list(companies.values_list('symbol', flat=True))
        
        # Optimization: Limit to top 100 active stocks if sector is 'All' to prevent timeout
        # Or scan mostly active ones. For now, scan all but optimize the loop
        
        # 2. Fetch price data (Optimize: Last 300 days for safety)
        lookback_days = 300
        start_date = timezone.now().date() - timedelta(days=lookback_days)
        
        # Fetching efficiently
        queryset = DailyStockPrice.objects.filter(
            ticker__in=active_tickers,
            date__gte=start_date
        ).values('ticker', 'date', 'close', 'high', 'low', 'volume').order_by('ticker', 'date')
        
        if not queryset.exists():
             return Response([])

        df_all = pd.DataFrame.from_records(queryset)
        if df_all.empty:
            return Response([])
            
        df_all['date'] = pd.to_datetime(df_all['date'])
        
        results = []
        
        # Vectorized GroupBy + Apply is faster than looping if tailored, but looping distinct tickers is safer for complex logic
        grouped = df_all.groupby('ticker')
        
        for ticker, group in grouped:
            if len(group) < 50: continue # Skip if not enough data
            
            # Simple technical indicators
            df = group.set_index('date').sort_index()
            close = df['close']
            high = df['high']
            low = df['low']
            
            signal = None
            strength = 0 # 0-100
            reason = ""
            
            try:
                if strategy_type == 'ema_cross':
                    # Golden Cross: 50 EMA crosses above 200 EMA
                    ema_50 = close.ewm(span=50, adjust=False).mean()
                    ema_200 = close.ewm(span=200, adjust=False).mean()
                    
                    if len(close) < 200: continue
                    
                    # Check latest and prev
                    curr_50 = ema_50.iloc[-1]
                    curr_200 = ema_200.iloc[-1]
                    prev_50 = ema_50.iloc[-2]
                    prev_200 = ema_200.iloc[-2]
                    
                    if prev_50 <= prev_200 and curr_50 > curr_200:
                        signal = 'BUY'
                        strength = 85
                        reason = f"Golden Cross (EMA 50 > EMA 200). Close: {close.iloc[-1]}"
                    elif prev_50 >= prev_200 and curr_50 < curr_200:
                        signal = 'SELL'
                        strength = 85
                        reason = f"Death Cross (EMA 50 < EMA 200). Close: {close.iloc[-1]}"
                    elif curr_50 > curr_200 and (curr_50 - curr_200) / curr_200 < 0.02:
                         # Near cross support
                         signal = 'BUY'
                         strength = 60
                         reason = "Trend Support (EMA 50 near EMA 200)"

                elif strategy_type == 'smart_cross':
                    # RSI + MACD
                    # RSI
                    delta = close.diff()
                    gain = (delta.where(delta > 0, 0)).rolling(window=14).mean()
                    loss = (-delta.where(delta < 0, 0)).rolling(window=14).mean()
                    rs = gain / loss
                    rsi = 100 - (100 / (1 + rs))
                    
                    # MACD (12, 26, 9)
                    exp1 = close.ewm(span=12, adjust=False).mean()
                    exp2 = close.ewm(span=26, adjust=False).mean()
                    macd_line = exp1 - exp2
                    signal_line = macd_line.ewm(span=9, adjust=False).mean()
                    
                    curr_rsi = rsi.iloc[-1]
                    curr_macd = macd_line.iloc[-1]
                    curr_sig = signal_line.iloc[-1]
                    prev_macd = macd_line.iloc[-2]
                    prev_sig = signal_line.iloc[-2]
                    
                    # Buy Logic: RSI < 50 AND MACD Bullish Cross
                    if curr_rsi < 55 and (prev_macd <= prev_sig and curr_macd > curr_sig):
                        signal = 'BUY'
                        strength = 90
                        reason = f"Smart Buy: RSI {curr_rsi:.0f} (Oversold/Neutral) + MACD Cross"
                    # Sell Logic: RSI > 65 AND MACD Bearish Cross
                    elif curr_rsi > 60 and (prev_macd >= prev_sig and curr_macd < curr_sig):
                        signal = 'SELL'
                        strength = 80
                        reason = f"Smart Sell: RSI {curr_rsi:.0f} (Overbought) + MACD Cross"
                        
                elif strategy_type == 'ichimoku':
                    # Tenkan (9), Kijun (26)
                    # Note: We simulate standard Ichimoku logic without full cloud shift checks for simplicity
                    high_9 = high.rolling(window=9).max()
                    low_9 = low.rolling(window=9).min()
                    tenkan = (high_9 + low_9) / 2
                    
                    high_26 = high.rolling(window=26).max()
                    low_26 = low.rolling(window=26).min()
                    kijun = (high_26 + low_26) / 2
                    
                    curr_tenkan = tenkan.iloc[-1]
                    curr_kijun = kijun.iloc[-1]
                    prev_tenkan = tenkan.iloc[-2]
                    prev_kijun = kijun.iloc[-2]
                    
                    # TK Cross
                    if prev_tenkan <= prev_kijun and curr_tenkan > curr_kijun:
                        signal = 'BUY'
                        strength = 75
                        reason = f"Ichimoku: Bullish Tenkan-Kijun Cross"
                    elif prev_tenkan >= prev_kijun and curr_tenkan < curr_kijun:
                        signal = 'SELL'
                        strength = 75
                        reason = f"Ichimoku: Bearish Tenkan-Kijun Cross"

                elif strategy_type == 'mean_reversion':
                    # Bollinger Bands (20, 2)
                    sma_20 = close.rolling(window=20).mean()
                    std_20 = close.rolling(window=20).std()
                    upper_band = sma_20 + (std_20 * 2)
                    lower_band = sma_20 - (std_20 * 2)
                    
                    curr_close = close.iloc[-1]
                    curr_lower = lower_band.iloc[-1]
                    curr_upper = upper_band.iloc[-1]
                    
                    # Mean Reversion Buy: Price dips below lower band
                    if curr_close < curr_lower:
                        signal = 'BUY'
                        # Strength based on depth
                        diff_pct = (curr_lower - curr_close) / curr_close * 100
                        strength = min(100, 70 + (diff_pct * 10)) # Base 70, +10 per 1% drop
                        reason = f"Mean Reversion: Price below Lower BB. Oversold."
                    
                    # Mean Reversion Sell: Price exceeds upper band
                    elif curr_close > curr_upper:
                        signal = 'SELL'
                        diff_pct = (curr_close - curr_upper) / curr_upper * 100
                        strength = min(100, 70 + (diff_pct * 10))
                        reason = f"Mean Reversion: Price above Upper BB. Overbought."

                elif strategy_type == 'stochastic':
                    # Stochastic Oscillator (14, 3, 3)
                    # %K = (Current Close - Lowest Low)/(Highest High - Lowest Low) * 100
                    low_14 = low.rolling(window=14).min()
                    high_14 = high.rolling(window=14).max()
                    
                    k_percent = 100 * ((close - low_14) / (high_14 - low_14))
                    d_percent = k_percent.rolling(window=3).mean()
                    
                    curr_k = k_percent.iloc[-1]
                    curr_d = d_percent.iloc[-1]
                    prev_k = k_percent.iloc[-2]
                    prev_d = d_percent.iloc[-2]
                    
                    # Buy: %K < 20 and crosses above %D
                    if curr_k < 20 and prev_k <= prev_d and curr_k > curr_d:
                         signal = 'BUY'
                         strength = 80
                         reason = f"Stochastic: Bullish Cross in Oversold Zone (K={curr_k:.1f})"
                    
                    # Sell: %K > 80 and crosses below %D
                    elif curr_k > 80 and prev_k >= prev_d and curr_k < curr_d:
                         signal = 'SELL'
                         strength = 80
                         reason = f"Stochastic: Bearish Cross in Overbought Zone (K={curr_k:.1f})"

                elif strategy_type == 'volume_breakout':
                    # Volume > 200% of 20-day Average AND Price Up
                    adv_vol = df['volume']
                    avg_vol = adv_vol.rolling(window=20).mean()
                    
                    curr_vol = adv_vol.iloc[-1]
                    curr_avg = avg_vol.iloc[-1]
                    
                    if curr_vol > (curr_avg * 2.0) and close.iloc[-1] > close.iloc[-2]:
                        signal = 'BUY'
                        # Strength based on volume multiple
                        multiple = curr_vol / curr_avg
                        strength = min(100, 60 + (multiple * 10))
                        reason = f"Volume Breakout: {multiple:.1f}x Average Volume + Price Up"

                elif strategy_type == 'supertrend':
                    # Supertrend (10, 3)
                    # ATR 10
                    tr1 = high - low
                    tr2 = abs(high - close.shift(1))
                    tr3 = abs(low - close.shift(1))
                    tr = pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)
                    atr = tr.rolling(window=10).mean()
                    
                    hl2 = (high + low) / 2
                    basic_upper = hl2 + (3 * atr)
                    basic_lower = hl2 - (3 * atr)
                    
                    # Supertrend calculation requires iteration or recursive shift, optimizing for last few rows
                    # Simplified Trend Check for last row:
                    # If Close > Prev SuperTrend Upper -> Bullish
                    # We will implement a simplified scan looking for trend *change*
                    
                    # Full calculation is complex in vectorized form without Numba or loop.
                    # We will simulate the last 2 periods of logic to detect a FLIP.
                    # Prerequisite: We need a reasonable approximation of the trend state.
                    
                    # Let's use a simpler "ATR Trailing Stop" logic for scan
                    curr_close = close.iloc[-1]
                    curr_atr = atr.iloc[-1]
                    prev_close = close.iloc[-2]
                    
                    # Trend Change Buy: Price crosses above (Close[t-1] + 3*ATR) - simplified breakout
                    # Actually, standard Supertrend uses recursive bands.
                    # Alternative: Keltner Channel Breakout (EMA 20 +/- 2 ATR)
                    # Let's stick to Keltner Channel for vectorization speed, often used similarly to Supertrend
                    
                    ema_20 = close.ewm(span=20, adjust=False).mean()
                    k_upper = ema_20 + (2 * atr)
                    k_lower = ema_20 - (2 * atr)
                    
                    curr_ku = k_upper.iloc[-1]
                    prev_ku = k_upper.iloc[-2]
                    
                    # Breakout Buy
                    if prev_close <= prev_ku and curr_close > curr_ku:
                         signal = 'BUY'
                         strength = 80
                         reason = "Keltner Channel Breakout (Volatility Expansion)"
                    
                    # Breakdown Sell
                    curr_kl = k_lower.iloc[-1]
                    prev_kl = k_lower.iloc[-2]
                    if prev_close >= prev_kl and curr_close < curr_kl:
                         signal = 'SELL'
                         strength = 80
                         reason = "Keltner Channel Breakdown"

                elif strategy_type == 'candlestick_engulfing':
                    # Bullish Engulfing:
                    # Day 1: Red Candle
                    # Day 2: Green Candle, Open < Day 1 Close, Close > Day 1 Open
                    
                    o1 = df['open'].iloc[-2]
                    c1 = close.iloc[-2]
                    o2 = df['open'].iloc[-1]
                    c2 = close.iloc[-1]
                    
                    # Prev Day Red
                    is_red_1 = c1 < o1
                    # Curr Day Green
                    is_green_2 = c2 > o2
                    
                    # Bullish Engulfing
                    if is_red_1 and is_green_2 and o2 < c1 and c2 > o1:
                        signal = 'BUY'
                        strength = 75
                        reason = "Bullish Engulfing Pattern (Price Action)"
                    
                    # Bearish Engulfing
                    # Prev Day Green
                    is_green_1 = c1 > o1
                    # Curr Day Red
                    is_red_2 = c2 < o2
                    
                    if is_green_1 and is_red_2 and o2 > c1 and c2 < o1:
                        signal = 'SELL'
                        strength = 75
                        reason = "Bearish Engulfing Pattern (Price Action)"
                        
            except Exception as e:
                continue
            except Exception as e:
                continue
                
            if signal:
                results.append({
                    'symbol': ticker,
                    'signal': signal,
                    'strength': strength,
                    'reason': reason,
                    'close': float(close.iloc[-1]),
                    'date': df.index[-1].strftime('%Y-%m-%d')
                })
        
        # Sort by strength
        results.sort(key=lambda x: x['strength'], reverse=True)
        return Response(results)



class WatchlistViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = WatchlistItemSerializer

    def get_queryset(self):
        return WatchlistItem.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    def list(self, request, *args, **kwargs):
        queryset = self.get_queryset()
        tickers = [item.ticker for item in queryset]
        
        rsi_data = {}
        roc_data = {}
        
        if tickers:
            import pandas as pd
            from datetime import timedelta
            from django.utils import timezone
            
            # Fetch last 60 days to ensure enough data for 14-period indicators
            cutoff_date = timezone.now().date() - timedelta(days=60)
            
            hist_qs = DailyStockPrice.objects.filter(
                ticker__in=tickers,
                date__gte=cutoff_date
            ).values('ticker', 'date', 'close').order_by('date')
            
            df_hist = pd.DataFrame.from_records(hist_qs)
            if not df_hist.empty:
                df_hist['close'] = df_hist['close'].astype(float)
                
                for ticker in tickers:
                    df_t = df_hist[df_hist['ticker'] == ticker].sort_values('date')
                    if len(df_t) > 15:
                        # RSI (14)
                        delta = df_t['close'].diff()
                        gain = (delta.where(delta > 0, 0)).rolling(window=14).mean()
                        loss = (-delta.where(delta < 0, 0)).rolling(window=14).mean()
                        
                        rs = gain / loss
                        rsi = 100 - (100 / (1 + rs))
                        if not pd.isna(rsi.iloc[-1]):
                            rsi_data[ticker] = float(rsi.iloc[-1])
                        
                        # ROC (14)
                        past_close = df_t['close'].iloc[-15]
                        curr_close = df_t['close'].iloc[-1]
                        if past_close != 0:
                            roc = ((curr_close - past_close) / past_close) * 100
                            roc_data[ticker] = float(roc)

        data = []
        for item in queryset:
            # Attach calculated fields for the serializer
            item.rsi = rsi_data.get(item.ticker)
            item.roc = roc_data.get(item.ticker)
            data.append(item)
            
        serializer = self.get_serializer(data, many=True)
        return Response(serializer.data)
@api_view(['GET'])
@permission_classes([AllowAny])
def get_broker_portfolio(request):
    """
    Get current portfolio/holdings of a specific broker.
    Standalone view to avoid ViewSet routing caching issues.
    """
    broker_id = request.query_params.get('broker_id')
    if not broker_id:
        return Response({'error': 'broker_id is required'}, status=400)
        
    from django.db import connections
    
    query = """
    WITH latest_positions AS (
        SELECT 
            ca.symbol, 
            ca.entity_id, 
            ca.cumulative_net,
            ROW_NUMBER() OVER (PARTITION BY ca.symbol, ca.entity_id ORDER BY ca.transaction_date DESC) as rn
        FROM daily_cumulative_accumulation ca
        WHERE ca.entity_id = %s
    )
    SELECT 
        pos.symbol,
        c."companyName" as name,
        c."sectorName" as sector,
        pos.cumulative_net as quantity,
        dsp.close as current_price,
        (pos.cumulative_net * dsp.close) as value,
        dsp.transaction_date as latest_price_date
    FROM latest_positions pos
    INNER JOIN companies c ON pos.symbol = c.symbol
    LEFT JOIN (
        SELECT DISTINCT ON (symbol) symbol, close, transaction_date
        FROM daily_stock_price
        ORDER BY symbol, transaction_date DESC
    ) dsp ON pos.symbol = dsp.symbol
    WHERE pos.rn = 1 
    AND pos.cumulative_net > 0
    ORDER BY value DESC;
    """
    
    with connections['stock_market'].cursor() as cursor:
        cursor.execute(query, [broker_id])
        columns = [col[0] for col in cursor.description]
        results = [dict(zip(columns, row)) for row in cursor.fetchall()]
        
    return Response({
        'broker_id': broker_id,
        'total_value': sum(r['value'] for r in results if r['value']),
        'holdings': results
    })

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
            queryset = queryset.filter(ticker=symbol)
        
        if broker:
            # Filter where broker is either buyer or seller
            from django.db.models import Q
            queryset = queryset.filter(Q(buyer_broker=broker) | Q(seller_broker=broker))

        # Order by date descending
        queryset = queryset.order_by('-date')[:limit]
        
        serializer = DailyFloorsheetSerializer(queryset, many=True)
        return Response(serializer.data)
    except Exception as e:
        return Response({'error': str(e)}, status=500)
@api_view(['GET'])
@permission_classes([AllowAny])
def accumulation_history(request):
    """
    Get daily accumulation history (derived from cumulative data) for a specific broker and symbol.
    Calculates daily buy/sell/net/rate values using window functions.
    """
    broker = request.query_params.get('broker')
    symbol = request.query_params.get('symbol')

    if not broker or not symbol:
        return Response({'error': 'Both broker and symbol are required filters for accumulation history.'}, status=400)

    try:
        page = int(request.query_params.get('page', 1))
        page_size = int(request.query_params.get('page_size', 250))
    except ValueError:
        page = 1
        page_size = 250

    offset = (page - 1) * page_size

    from django.db import connections
    
    query = """
    WITH base_data AS (
        SELECT
            transaction_date,
            cumulative_buy,
            cumulative_buy_amount,
            cumulative_sell,
            cumulative_sell_amount,
            cumulative_net
        FROM daily_cumulative_accumulation
        WHERE entity_id = %s AND symbol = %s
    ),
    diff_data AS (
        SELECT
            transaction_date,
            cumulative_net,
            cumulative_buy,
            cumulative_buy_amount,
            cumulative_sell_amount,
            cumulative_buy - LAG(cumulative_buy, 1, 0) OVER (ORDER BY transaction_date) as buy_qty,
            cumulative_buy_amount - LAG(cumulative_buy_amount, 1, 0) OVER (ORDER BY transaction_date) as buy_amount,
            cumulative_sell - LAG(cumulative_sell, 1, 0) OVER (ORDER BY transaction_date) as sell_qty,
            cumulative_sell_amount - LAG(cumulative_sell_amount, 1, 0) OVER (ORDER BY transaction_date) as sell_amount
        FROM base_data
    )
    SELECT
        transaction_date as date,
        buy_qty,
        CASE WHEN buy_qty > 0 THEN ROUND(buy_amount / buy_qty, 2) ELSE 0 END as buy_rate,
        buy_amount,
        sell_qty,
        CASE WHEN sell_qty > 0 THEN ROUND(sell_amount / sell_qty, 2) ELSE 0 END as sell_rate,
        sell_amount,
        (buy_qty - sell_qty) as net_quantity,
        cumulative_net as cumulative_qty,
        ROUND(cumulative_buy_amount / NULLIF(cumulative_buy, 0), 2) as wac
    FROM diff_data
    ORDER BY transaction_date DESC
    LIMIT %s OFFSET %s;
    """
    
    with connections['stock_market'].cursor() as cursor:
        cursor.execute(query, [broker, symbol, page_size, offset])
        columns = [col[0] for col in cursor.description]
        results = [dict(zip(columns, row)) for row in cursor.fetchall()]
        
    return Response(results)

class PipelineViewSet(viewsets.ViewSet):
    """
    ViewSet to manage data pipeline tasks.
    """
    permission_classes = [AllowAny] # Change to IsAuthenticated in production

    TASKS = {
        'sync_stocks': 'Sync Stock List',
        'sync_prices': 'Sync Daily Prices',
        'sync_floorsheet': 'Sync Floorsheet Data',
        'update_indexes': 'Update DB Indexes',
    }

    @action(detail=False, methods=['get'])
    def history(self, request):
        """
        Returns recent upload history.
        """
        from .models import DataUploadLog
        from django.core.paginator import Paginator
        
        page = request.query_params.get('page', 1)
        page_size = request.query_params.get('page_size', 10)
        
        logs = DataUploadLog.objects.all().order_by('-created_at')
        paginator = Paginator(logs, page_size)
        
        try:
            current_page = paginator.page(page)
        except:
            current_page = paginator.page(1)
            
        data = [{
            'id': l.id,
            'file_name': l.file_name,
            'upload_type': l.get_upload_type_display(),
            'status': l.status,
            'records_count': l.records_count,
            'error_message': l.error_message,
            'created_at': l.created_at
        } for l in current_page]
        
        return Response({
            'results': data,
            'total': paginator.count,
            'page': current_page.number,
            'pages': paginator.num_pages
        })

    @action(detail=False, methods=['get'])
    def status(self, request):
        """
        Returns list of tasks and their simulated status.
        In a real app, this would query a Task model or Celery backend.
        """
        from datetime import datetime
        import random
        
        # Mock status data
        statuses = []
        for key, name in self.TASKS.items():
            # Simulate random states for demo
            state = 'idle'
            last_run = datetime.now()
            
            statuses.append({
                'id': key,
                'name': name,
                'status': state, 
                'last_run': last_run.isoformat(),
                'message': 'Waiting for trigger'
            })
            
        return Response(statuses)

    @action(detail=True, methods=['post'])
    def run(self, request, pk=None):
        """
        Triggers a specific task.
        pk is the task_id (e.g., 'sync_stocks')
        """
        task_id = pk
        if task_id not in self.TASKS:
            return Response({'error': f'Invalid task ID: {task_id}'}, status=400)

        # Here you would actually trigger the task (e.g., subprocess or Celery)
        # For now, we just simulate a success response
        
        # Example of how to call the existing management command:
        # if task_id == 'seed_data':
        #     from django.core.management import call_command
        #     call_command('seed_stocks')
            
        import time
        # Simulate processing time or trigger
        
        return Response({
            'id': task_id,
            'status': 'running',
            'message': f'Task {self.TASKS[task_id]} started successfully.'
        })

    @action(detail=False, methods=['post'])
    def upload_floorsheet(self, request):
        """
        Action to upload and process floorsheet JSON data.
        """
        from .models import DataUploadLog, DailyFloorsheet
        import json
        
        file = request.FILES.get('file')
        if not file:
            return Response({'error': 'No file uploaded'}, status=400)
            
        try:
            data = json.load(file)
            if not isinstance(data, list):
                # Handle single object case if necessary, but usually it's a list
                data = [data]
                
            log = DataUploadLog.objects.create(
                file_name=file.name,
                upload_type='FLOORSHEET',
                status='PENDING'
            )
            
            floorsheet_items = []
            for item in data:
                try:
                    floorsheet_items.append(DailyFloorsheet(
                        transaction_id=int(item.get('contractId')),
                        symbol=item.get('stockSymbol'),
                        buyer_id=int(item.get('buyerMemberId')),
                        seller_id=int(item.get('sellerMemberId')),
                        transaction_quantity=int(item.get('contractQuantity')),
                        transaction_rate=item.get('contractRate'),
                        transaction_amount=item.get('contractAmount'),
                        transaction_date=item.get('businessDate'),
                        transaction_book_id=int(item.get('tradeBookId')),
                        stock_id=int(item.get('stockId')) if item.get('stockId') else None,
                        buyer_name=item.get('buyerBrokerName'),
                        seller_name=item.get('sellerBrokerName'),
                        transaction_datetime=item.get('tradeTime'),
                        security_name=item.get('securityName')
                    ))
                except (ValueError, TypeError) as e:
                    # Skip rows with malformed data but log it?
                    # For now just continue to avoid failing the whole batch
                    continue
            
            # Use bulk_create with ignore_conflicts=True to handle duplicates gracefully
            DailyFloorsheet.objects.bulk_create(floorsheet_items, ignore_conflicts=True)
            
            log.status = 'SUCCESS'
            log.records_count = len(floorsheet_items)
            log.save()
            
            return Response({'message': f'Successfully uploaded {len(floorsheet_items)} floorsheet records.'})
            
        except Exception as e:
            if 'log' in locals():
                log.status = 'FAILED'
                log.error_message = str(e)
                log.save()
            return Response({'error': str(e)}, status=500)

    @action(detail=False, methods=['post'])
    def upload_daily_prices(self, request):
        """
        Action to upload and process daily price CSV data.
        """
        from .models import DataUploadLog, DailyStockPrice
        import csv
        import io
        
        file = request.FILES.get('file')
        date_str = request.data.get('date')
        
        if not file or not date_str:
            return Response({'error': 'File and date are required'}, status=400)
            
        try:
            log = DataUploadLog.objects.create(
                file_name=file.name,
                upload_type='PRICE',
                status='PENDING'
            )
            
            decoded_file = file.read().decode('utf-8')
            io_string = io.StringIO(decoded_file)
            reader = csv.DictReader(io_string)
            
            price_items = []
            for row in reader:
                # Basic mapping based on standard ShareSansar export format
                # You might need to adjust column names based on actual CSV headers
                symbol = row.get('Symbol') or row.get('Ticker') or row.get('symbol')
                if not symbol: continue
                
                price_items.append(DailyStockPrice(
                    ticker=symbol,
                    date=date_str,
                    open=row.get('Open', 0),
                    high=row.get('High', 0),
                    low=row.get('Low', 0),
                    close=row.get('Close', row.get('LTP', 0)),
                    volume=row.get('Volume', row.get('Qty', 0)),
                    prev_close=row.get('Prev Close', 0),
                    turnover=row.get('Turnover', 0)
                ))
                
            DailyStockPrice.objects.bulk_create(price_items, ignore_conflicts=True)
            
            log.status = 'SUCCESS'
            log.records_count = len(price_items)
            log.save()
            
            return Response({'message': f'Successfully uploaded {len(price_items)} price records for {date_str}.'})
            
        except Exception as e:
            if 'log' in locals():
                log.status = 'FAILED'
                log.error_message = str(e)
                log.save()
            return Response({'error': str(e)}, status=500)

    @action(detail=False, methods=['post'])
    def fetch_daily_prices_from_github(self, request):
        """
        Action to fetch daily prices from GitHub repository.
        """
        from .models import DataUploadLog, DailyStockPrice
        import requests
        import csv
        import io
        
        date_str = request.data.get('date')
        if not date_str:
            return Response({'error': 'Date is required'}, status=400)
            
        try:
            log = DataUploadLog.objects.create(
                file_name=f"github_sync_{date_str}.csv",
                upload_type='GITHUB_SYNC',
                status='PENDING'
            )
            
            # Format date as YYYY_MM_DD for the filename
            formatted_date = date_str.replace('-', '_')
            url = f"https://raw.githubusercontent.com/fuunshi/ShareSansarDataScrape/master/Data/{formatted_date}.csv"
            
            print(f"DEBUG: Fetching from GitHub: {url}")
            response = requests.get(url)
            print(f"DEBUG: GitHub response status: {response.status_code}")
            
            if response.status_code != 200:
                log.status = 'FAILED'
                log.error_message = f"Failed to fetch from GitHub. Status code: {response.status_code}. URL: {url}"
                log.save()
                return Response({
                    'error': f'Data for {date_str} not found on GitHub. Please check if the file exists in the repository.'
                }, status=400)
                
            decoded_file = response.content.decode('utf-8')
            io_string = io.StringIO(decoded_file)
            reader = csv.DictReader(io_string)
            
            def parse_decimal(val):
                if not val or val == '-': return 0
                return float(val.replace(',', ''))

            price_items = []
            for row in reader:
                symbol = row.get('Symbol')
                if not symbol: continue
                
                price_items.append(DailyStockPrice(
                    ticker=symbol,
                    date=date_str,
                    open=parse_decimal(row.get('Open')),
                    high=parse_decimal(row.get('High')),
                    low=parse_decimal(row.get('Low')),
                    close=parse_decimal(row.get('Close')),
                    volume=parse_decimal(row.get('Vol')),
                    prev_close=parse_decimal(row.get('Prev. Close')),
                    turnover=parse_decimal(row.get('Turnover')),
                    conf=parse_decimal(row.get('Conf.')),
                    vwap=parse_decimal(row.get('VWAP')),
                    trans=int(parse_decimal(row.get('Trans.'))),
                    diff=parse_decimal(row.get('Diff')),
                    range=parse_decimal(row.get('Range')),
                    diff_percent=parse_decimal(row.get('Diff %')),
                    range_percent=parse_decimal(row.get('Range %')),
                    vwap_percent=parse_decimal(row.get('VWAP %')),
                    days_120=parse_decimal(row.get('120 Days')),
                    days_180=parse_decimal(row.get('180 Days')),
                    weeks_52_high=parse_decimal(row.get('52 Weeks High')),
                    weeks_52_low=parse_decimal(row.get('52 Weeks Low'))
                ))
                
            DailyStockPrice.objects.bulk_create(price_items, ignore_conflicts=True)
            
            log.status = 'SUCCESS'
            log.records_count = len(price_items)
            log.save()
            
            return Response({'message': f'Successfully synced {len(price_items)} price records from GitHub for {date_str}.'})
            
        except Exception as e:
            if 'log' in locals():
                log.status = 'FAILED'
                log.error_message = str(e)
                log.save()
            return Response({'error': str(e)}, status=500)

