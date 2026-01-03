import warnings
warnings.filterwarnings('ignore', category=FutureWarning)

from rest_framework import status, viewsets
from rest_framework.decorators import api_view, permission_classes, action
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from django.http import StreamingHttpResponse as StreamingResponse
from rest_framework.pagination import PageNumberPagination
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters
from .models import DailyStockPrice, DailyFloorsheet, PortfolioItem, PortfolioTransaction, TransactionType, StockFundamental, PortfolioAccount, Strategy, Company, WatchlistItem, Notification, StrategyExperiment, ScopeType, StrategySignal
from .serializers import (
    DailyStockPriceSerializer, DailyFloorsheetSerializer, PortfolioItemSerializer, 
    PortfolioTransactionSerializer, StockFundamentalSerializer, StrategySerializer, CompanySerializer, WatchlistItemSerializer, NotificationSerializer, StrategyExperimentSerializer,
    StrategyExperimentDetailSerializer, StrategySignalSerializer
)
from . import serializers # For PortfolioAccountSerializer which was added differently in replacement
from .utils import calculate_broker_commission, calculate_sebon_fee, calculate_dp_charge, calculate_cgt
from decimal import Decimal
from django.db.models import Q
import os
import tempfile
import subprocess
import json
import ast
import inspect
import uuid
from datetime import date, timedelta

# rest_framework imports are already at the top

class ExperimentLogger:
    def __init__(self):
        self.params = {}
        self.metrics = {}
    
    def log_param(self, key, value):
        self.params[key] = value

    def log_metric(self, key, value):
        self.metrics[key] = value

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
    data = DailyFloorsheet.objects.filter(symbol=ticker).order_by('-transaction_date')[:50] # Last 50 txns
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
    fundamental = None
    try:
        fundamental = StockFundamental.objects.get(ticker=ticker)
        fundamental_data = dict(StockFundamentalSerializer(fundamental).data)
    except StockFundamental.DoesNotExist:
        fundamental_data = None
        
    # 2. Latest Price Summary (reuse stock_summary logic partially or fetch fresh)
    latest_price = DailyStockPrice.objects.filter(ticker=ticker).order_by('-date').first()
    prev_price_obj = DailyStockPrice.objects.filter(ticker=ticker).order_by('-date')[1:2] # Get 2nd latest
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
        
    # 3. Company Details
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
        
    # Define metrics to display
    metrics = [
        {'key': 'eps', 'name': 'EPS (TTM)'},
        {'key': 'pe_ratio', 'name': 'P/E Ratio'},
        {'key': 'price_to_book', 'name': 'P/B Ratio'}, # Frontend expects PBV as value name potentially? Check frontend map. Frontend uses name 'PBV' in card, but 'indicator' table just lists name.
        {'key': 'book_value', 'name': 'Book Value'},
        {'key': 'ro_equity', 'name': 'ROE'},
        {'key': 'dividend_yield', 'name': 'Dividend Yield'},
    ]
    
    # Fetch Sector Peers
    from django.db.models import Max, Min
    peers = StockFundamental.objects.filter(sector=fundamental_obj.sector)
    
    indicators = []
    
    for m in metrics:
        key = m['key']
        val = getattr(fundamental_obj, key, None)
        
        # Calculate Sector Stats
        # Optimization: We could do one aggregate query, but this is cleaner for readability and N is small (5-6 metrics)
        # For a high traffic site, optimize to single aggregate.
        
        # Find Max
        max_obj = peers.order_by(f'-{key}').first()
        min_obj = peers.order_by(f'{key}').first()
        
        # Safely get values
        max_val = getattr(max_obj, key, None) if max_obj else None
        min_val = getattr(min_obj, key, None) if min_obj else None
        
        # Format values
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

class PortfolioAccountViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = serializers.PortfolioAccountSerializer

    def get_queryset(self):
        if self.request.user.username == 'admin':
            return PortfolioAccount.objects.all()
        return PortfolioAccount.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

class PortfolioViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = PortfolioItemSerializer

    def get_queryset(self):
        user = self.request.user
        if user.username == 'admin':
            queryset = PortfolioItem.objects.all()
        else:
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

        # 4. Fetch Latest Signals (New)
        signals_map = {}
        if tickers:
            from .models import StrategySignal
            from django.db.models import Max
            
            # Find the latest signal date for each ticker
            latest_dates = StrategySignal.objects.filter(
                symbol__in=tickers
            ).values('symbol').annotate(max_date=Max('date'))
            
            latest_date_map = {item['symbol']: item['max_date'] for item in latest_dates}
            
            for ticker, latest_date in latest_date_map.items():
                if not latest_date:
                    continue
                    
                signals = StrategySignal.objects.filter(
                    symbol=ticker,
                    date=latest_date
                ).select_related('strategy')
                
                signal_list = []
                for s in signals:
                    signal_list.append({
                        'signal': s.signal,
                        'strategy_name': s.strategy.name,
                        'strategy_description': s.strategy.description
                    })
                
                buy_count = sum(1 for s in signal_list if 'BUY' in s['signal'])
                sell_count = sum(1 for s in signal_list if 'SELL' in s['signal'])
                
                summary = 'NEUTRAL'
                if buy_count > sell_count:
                    summary = 'BUY'
                elif sell_count > buy_count:
                    summary = 'SELL'
                elif buy_count > 0 and buy_count == sell_count:
                    summary = 'MIXED'
                elif any('HOLD' in s['signal'] for s in signal_list):
                    summary = 'HOLD'
                    
                signals_map[ticker] = {
                    'latest_date': latest_date,
                    'summary': summary,
                    'details': signal_list
                }

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
            item.signals = signals_map.get(item.ticker) # Add signals here
            
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
        
        wacc = float(item.wacc) if item.wacc else float(item.buy_price)
        is_underwater = latest_price < wacc

        strategies = {
            "fixed": {
                "name": "Fixed Percentage",
                "sl": latest_price * 0.95, 
                "tp": wacc * 1.10, 
                "tp2": wacc * 1.20,
                "tp3": wacc * 1.30,
                "desc": f"3-tier targets: 10%, 20%, 30% profit from cost (Rs. {wacc:.2f})."
            },
            "atr_conservative": {
                "name": "ATR (Conservative)",
                "sl": latest_price - (2 * atr),
                "tp": max(latest_price + (3 * atr), wacc * 1.05),
                "tp2": max(latest_price + (5 * atr), wacc * 1.15),
                "tp3": max(latest_price + (7 * atr), wacc * 1.25),
                "desc": f"Scaling out at 3x, 5x, 7x ATR volatility (ATR: {atr:.2f})."
            },
            "atr_aggressive": {
                "name": "ATR (Aggressive)",
                "sl": latest_price - (1 * atr),
                "tp": max(latest_price + (2 * atr), wacc * 1.02),
                "tp2": max(latest_price + (4 * atr), wacc * 1.05),
                "tp3": max(latest_price + (6 * atr), wacc * 1.10),
                "desc": "Momentum scaling at 2x, 4x, 6x ATR."
            },
            "swing": {
                "name": "Support/Resistance",
                "sl": min(swing_low * 0.99, latest_price * 0.95),
                "tp": max(swing_high * 1.01, wacc * 1.05),
                "tp2": max(swing_high * 1.15, wacc * 1.20),
                "tp3": max(swing_high * 1.30, wacc * 1.40),
                "desc": f"Recent High: {swing_high}. Targets secondary breakout levels."
            }
        }

        # Add Balance/Break-even strategy if underwater
        if is_underwater:
            strategies["break_even"] = {
                "name": "Break Even Recovery",
                "sl": latest_price * 0.96,
                "tp": wacc * 1.02,
                "tp2": wacc * 1.07,
                "tp3": wacc * 1.15,
                "desc": f"Recovery scaling: Break-even, +7%, and +15% from cost."
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

        # 4. Fetch Transaction History
        txns = PortfolioTransaction.objects.filter(
            user=request.user, 
            ticker=ticker,
            account=item.account
        ).order_by('-transaction_date')
        txn_serializer = PortfolioTransactionSerializer(txns, many=True)

        return Response({
            "ticker": ticker,
            "current_price": latest_price,
            "wacc": wacc,
            "is_underwater": is_underwater,
            "strategies": strategies,
            "health_warnings": health_warnings,
            "transactions": txn_serializer.data
        })

class PortfolioTransactionViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = PortfolioTransactionSerializer

    def get_queryset(self):
        # Optional: Filter transactions by account too if needed
        if self.request.user.username == 'admin':
            return PortfolioTransaction.objects.all().order_by('-transaction_date')
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

    def perform_destroy(self, instance):
        """
        Reverse the effect of the transaction on the portfolio item before deleting.
        """
        user = instance.user
        ticker = instance.ticker
        qty = instance.quantity
        txn_type = instance.transaction_type
        
        try:
            portfolio_item = PortfolioItem.objects.get(user=user, ticker=ticker, account=instance.account)
            
            if txn_type == TransactionType.BUY or txn_type == TransactionType.BONUS:
                portfolio_item.quantity -= qty
            elif txn_type == TransactionType.SELL:
                portfolio_item.quantity += qty
                
            if portfolio_item.quantity <= 0:
                portfolio_item.delete()
            else:
                # Ideally we should recalculate WACC properly by removing this specific transaction, 
                # but that requires replaying history. For now, we just adjust quantity.
                # A full re-calc might be expensive but accurate.
                # Given the complexity, let's keep WACC as is (Average Cost doesn't change if we remove a chunk, 
                # unless that chunk had a different cost basis which we averaged in).
                # Actually, for BUY removal, WACC *should* revert. 
                # Because removing a transaction is rare, let's trigger a full recalculation for this item?
                # Or just simple subtraction if we assume LIFO/Average?
                # Simple is better for now. Users can run "reoptimize" if needed.
                portfolio_item.save()
                
        except PortfolioItem.DoesNotExist:
            pass
            
        instance.delete()

class FinancialReportViewSet(viewsets.ModelViewSet):
    queryset = FinancialReport.objects.all().order_by('-fiscal_year', '-quarter')
    serializer_class = FinancialReportSerializer
    permission_classes = [AllowAny]

    def get_queryset(self):
        queryset = FinancialReport.objects.all().order_by('-fiscal_year', '-quarter')
        ticker = self.request.query_params.get('ticker')
        fiscal_year = self.request.query_params.get('fiscal_year')
        report_type = self.request.query_params.get('report_type')
        quarter = self.request.query_params.get('quarter')

        if ticker:
            queryset = queryset.filter(ticker=ticker)
        if fiscal_year:
            queryset = queryset.filter(fiscal_year=fiscal_year)
        if report_type:
            queryset = queryset.filter(report_type=report_type)
        if quarter:
            queryset = queryset.filter(quarter=quarter)
        return queryset

class StandardResultsSetPagination(PageNumberPagination):
    page_size = 20
    page_size_query_param = 'page_size'
    max_page_size = 100

class StrategyViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = StrategySerializer
    pagination_class = StandardResultsSetPagination
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['name', 'description', 'ticker']
    ordering_fields = ['created_at', 'pnl_percent', 'sharpe_ratio']

    @staticmethod
    def _get_bt_local_scope(symbol, params=None):
        from backtesting import Backtest, Strategy as BTStrategy
        from backtesting.lib import crossover
        from backtesting.test import SMA
        import pandas as pd
        import numpy as np
        return {
            'Backtest': Backtest,
            'Strategy': BTStrategy,
            'crossover': crossover,
            'SMA': SMA,
            'pd': pd,
            'np': np,
            'symbol': symbol,
            'params': params or {},
        }

    @staticmethod
    def _clean_for_json(obj):
        """
        Recursively clean an object to be JSON serializable (no NaN or Inf).
        """
        import numpy as np
        if isinstance(obj, dict):
            return {k: StrategyViewSet._clean_for_json(v) for k, v in obj.items()}
        elif isinstance(obj, (list, tuple)):
            return [StrategyViewSet._clean_for_json(x) for x in obj]
        elif isinstance(obj, (float, np.floating)):
            if np.isnan(obj) or np.isinf(obj):
                return 0.0
            return float(obj)
        elif isinstance(obj, (int, np.integer)):
            return int(obj)
        elif hasattr(obj, 'isoformat'):
            return obj.isoformat()
        return obj

    @staticmethod
    def _extract_bt_stats(stats, initial_cash=1000000):
        import numpy as np
        import pandas as pd
        
        def safe_num(val, default=0.0):
            if val is None: return default
            if isinstance(val, (int, float, np.integer, np.floating)):
                # Handle NaN and Infinity which are not JSON serializable
                if np.isnan(val) or np.isinf(val):
                    return default
                return float(val)
            return default

        stats_dict = stats.to_dict()
        clean_stats = {}
        
        # Core Normalized metrics
        clean_stats['win_rate'] = safe_num(stats.get('Win Rate [%]'))
        clean_stats['pnl_percent'] = safe_num(stats.get('Return [%]'))
        clean_stats['return_pct'] = clean_stats['pnl_percent']
        clean_stats['total_pnl'] = safe_num(stats.get('Equity Final [$]', initial_cash) - initial_cash)
        clean_stats['total_trades'] = int(safe_num(stats.get('# Trades'), 0))
        clean_stats['sharpe_ratio'] = safe_num(stats.get('Sharpe Ratio'))
        clean_stats['max_drawdown'] = safe_num(stats.get('Max. Drawdown [%]'))
        clean_stats['profit_factor'] = safe_num(stats.get('Profit Factor', 0))
        
        # Advanced trade-level stats
        trades_df = stats.get('_trades')
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
            except: pass

        # Include raw stats (stringified where necessary)
        for k, v in stats_dict.items():
            if k.startswith('_'): continue
            if k in clean_stats: continue

            if isinstance(v, (int, float, np.integer, np.floating)):
                clean_stats[k] = safe_num(v)
            elif isinstance(v, (str, bool, type(None))):
                clean_stats[k] = v
            elif hasattr(v, 'isoformat'):
                clean_stats[k] = v.isoformat()
            else:
                clean_stats[k] = str(v)

        # Categorized metrics for Detail View UI - Comprehensive version
        categorized = {
            'Performance Metrics': {
                'PNL': f"{clean_stats['total_pnl']:.2f} ({clean_stats['pnl_percent']:.2f}%)",
                'Win rate': f"{clean_stats['win_rate']:.2f}%",
                'Sharpe ratio': f"{clean_stats.get('Sharpe Ratio', 0):.2f}",
                'Smart Sharpe': f"{clean_stats.get('Smart Sharpe', 0):.2f}",
                'Sortino ratio': f"{clean_stats.get('Sortino Ratio', 0):.2f}",
                'Smart Sortino': f"{clean_stats.get('Smart Sortino', 0):.2f}",
                'Calmar ratio': f"{clean_stats.get('Calmar Ratio', 0):.2f}",
                'Omega ratio': f"{clean_stats.get('Omega Ratio', 0):.2f}",
                'Serenity index': f"{clean_stats.get('Serenity Index', 0):.2f}",
                'Average win/loss': f"{clean_stats.get('Avg. Win/Loss', 0):.2f}",
                'Average win': f"{clean_stats.get('Average Win', clean_stats.get('Avg. Win [$]', 0)):.2f}",
                'Average loss': f"{clean_stats.get('Average Loss', clean_stats.get('Avg. Loss [$]', 0)):.2f}",
            },
            'Risk Metrics': {
                'Total losing streak': str(clean_stats.get('Max. Losing Streak', 0)),
                'Largest losing trade': f"{clean_stats.get('Worst Trade [%]', 0):.2f}",
                'Largest winning trade': f"{clean_stats.get('Best Trade [%]', 0):.2f}",
                'Total winning streak': str(clean_stats.get('Max. Winning Streak', 0)),
                'Current streak': str(clean_stats.get('Current Streak', 0)),
                'Expectancy': f"{clean_stats.get('Expectancy [%]', 0):.2f} ({clean_stats.get('Expectancy [%]', 0):.2f}%)",
                'Expected net profit': f"{clean_stats.get('Expected Net Profit', 0):.2f}",
                'Average holding period': str(clean_stats.get('Avg. Trade Duration', 'N/A')),
                'Gross profit': f"{clean_stats.get('Gross Profit', 0):.2f}",
                'Gross loss': f"{clean_stats.get('Gross Loss', 0):.2f}",
                'Max drawdown': f"{clean_stats.get('Max. Drawdown [%]', 0):.2f}",
                'Profit factor': f"{clean_stats.get('Profit Factor', 0):.2f}",
            },
            'Trade Metrics': {
                'Total trades': str(clean_stats.get('total_trades', clean_stats.get('# Trades', 0))),
                'Total winning trades': str(clean_stats.get('Total Winning Trades', 0)),
                'Total losing trades': str(clean_stats.get('Total Losing Trades', 0)),
                'Starting balance': f"{clean_stats.get('Equity Initial [$]', 10000):.2f}",
                'Finishing balance': f"{clean_stats.get('Equity Final [$]', 10000):.2f}",
                'Longs count': str(clean_stats.get('Longs Count', 0)),
                'Shorts count': str(clean_stats.get('Shorts Count', 0)),
                'Fee': f"{clean_stats.get('Fee', 0):.2f}",
                'Total open trades': str(clean_stats.get('Total Open Trades', 0)),
                'Open PL': f"{clean_stats.get('Open PL', 0):.2f}",
            }
        }
        
        # Final safety pass for JSON serialization
        clean_stats = StrategyViewSet._clean_for_json(clean_stats)
        categorized = StrategyViewSet._clean_for_json(categorized)
        
        return clean_stats, categorized

    def get_queryset(self):

        # Return user's own strategies and public ones
        return Strategy.objects.filter(Q(user=self.request.user) | Q(is_public=True))

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    def perform_update(self, serializer):
        strategy = self.get_object()
        
        # Ownership check
        if strategy.user_id != self.request.user.id and not self.request.user.is_staff:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("You do not have permission to edit this strategy.")
            
        # Check if ANY experiment is published for this strategy
        has_published = strategy.experiments.filter(is_published=True).exists()
        if has_published:
            if 'code' in serializer.validated_data:
                new_code = serializer.validated_data['code']
                # Normalize line endings for comparison
                normalized_new_code = new_code.replace('\r\n', '\n').strip()
                normalized_old_code = strategy.code.replace('\r\n', '\n').strip()
                
                if normalized_new_code != normalized_old_code:
                    from rest_framework.exceptions import PermissionDenied
                    raise PermissionDenied("This strategy has published configurations and its code cannot be edited. Unpublish all configurations first.")
        
        serializer.save()
    def perform_destroy(self, instance):
        if instance.user_id != self.request.user.id and not self.request.user.is_staff:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("You do not have permission to delete this strategy.")
        instance.delete()

    @action(detail=True, methods=['post'])
    def publish(self, request, pk=None):
        """
        Publish strategy experiment for recommendations. Requires 'experiment_id'.
        """
        strategy = self.get_object()
        
        # Ownership check
        if strategy.user != self.request.user:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("You do not have permission to publish this strategy.")
            
        experiment_id = request.data.get('experiment_id')
        
        if not experiment_id:
             return Response({"error": "Experiment ID is required to publish."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            exp = StrategyExperiment.objects.get(id=experiment_id, strategy=strategy)
            
            # Unpublish any existing experiment with same scope type and value for this strategy
            # strictly enforced to avoid duplicate signals for same scope
            StrategyExperiment.objects.filter(
                strategy=strategy,
                scope_type=exp.scope_type,
                scope_value=exp.scope_value,
                is_published=True
            ).exclude(id=exp.id).update(is_published=False)
            
            exp.is_published = True
            exp.save()
            
            return Response({"status": "published", "id": exp.id, "scope": f"{exp.scope_type}:{exp.scope_value}"})
        except StrategyExperiment.DoesNotExist:
             return Response({"error": "Experiment not found."}, status=status.HTTP_404_NOT_FOUND)

    @action(detail=True, methods=['post'])
    def unpublish(self, request, pk=None):
        strategy = self.get_object()
        
        # Ownership check
        if strategy.user != self.request.user:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("You do not have permission to unpublish this strategy.")
            
        experiment_id = request.data.get('experiment_id')
        
        if experiment_id:
            try:
                exp = StrategyExperiment.objects.get(id=experiment_id, strategy=strategy)
                exp.is_published = False
                exp.save()
            except StrategyExperiment.DoesNotExist:
                return Response({"error": "Experiment not found."}, status=status.HTTP_404_NOT_FOUND)
        else:
            # Unpublish ALL for this strategy (cleanup)
            StrategyExperiment.objects.filter(strategy=strategy, is_published=True).update(is_published=False)

        return Response({"status": "unpublished"})

    @action(detail=False, methods=['get'])
    def all_experiments(self, request):
        """
        Get all experiments across all strategies.
        """
        # Global history should show everything ordered by latest
        # Exclude batch children (Symbol scope with a batch_id) to avoid clutter
        experiments = StrategyExperiment.objects.select_related('strategy').all().order_by('-created_at') \
            .exclude(batch_id__isnull=False, scope_type=ScopeType.SYMBOL)
            
        page = self.paginate_queryset(experiments)
        if page is not None:
             serializer = StrategyExperimentSerializer(page, many=True)
             return self.get_paginated_response(serializer.data)

        serializer = StrategyExperimentSerializer(experiments, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['get'])
    def experiments(self, request, pk=None):
        strategy = self.get_object()
        experiments = StrategyExperiment.objects.filter(strategy=strategy).order_by('-created_at') \
            .exclude(batch_id__isnull=False, scope_type=ScopeType.SYMBOL)
        
        page = self.paginate_queryset(experiments)
        if page is not None:
             serializer = StrategyExperimentSerializer(page, many=True)
             return self.get_paginated_response(serializer.data)

        serializer = StrategyExperimentSerializer(experiments, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['get'])
    def best_parameters(self, request, pk=None):
        """
        Get best parameters for each scope (Symbol, Sector, All) based on historical experiments.
        """
        strategy = self.get_object()
        
        # We want to find the best experiment for each unique scope selection
        # For now, let's just return the single best run for:
        # 1. The specific symbol requested (if any)
        # 2. Each sector
        # 3. All Market
        
        # Simple implementation: Return top 5 runs by return %
        experiments = StrategyExperiment.objects.filter(
            strategy=strategy, 
            status=StrategyExperiment.Status.SUCCESS,
            run_type__in=['BACKTEST', 'OPTIMIZATION']
        )
        
        best_runs = []
        # This acts as a cache of "what works best"
        # We can group by scope_value
        from django.db.models import Max
        
        # It's hard to group by JSON field metrics['return'], so we might have to do it in python
        # or store the primary metric in a separate column. for now, python.
        
        all_exps = []
        for exp in experiments:
            # Extract primary metric (Return %)
            ret = 0.0
            if exp.metrics:
                if 'aggregated' in exp.metrics:
                     ret = exp.metrics['aggregated'].get('avg_return', 0)
                elif 'best_return' in exp.metrics:
                    ret = exp.metrics.get('best_return', 0)
                elif 'pnl_percent' in exp.metrics:
                    ret = exp.metrics.get('pnl_percent', 0)
                elif 'return' in exp.metrics: # some old format maybe
                     ret = exp.metrics.get('return', 0)
            
            
            all_exps.append({
                'experiment': exp,
                'return': float(ret or 0)
            })
            
        all_exps.sort(key=lambda x: x['return'], reverse=True)
        # Just return the top 5 for now as per original intent
        result = []
        for item in all_exps[:5]:
             result.append(StrategyExperimentSerializer(item['experiment']).data)
             
        return Response(result)

    @action(detail=True, methods=['get'])
    def get_published_config(self, request, pk=None):
        """
        Get the best published configuration for a specific scope (Symbol, Sector, or All).
        Follows hierarchy: Requested Symbol > Sector > Market (ALL)
        """
        strategy = self.get_object()
        symbol = request.query_params.get('symbol')
        sector = request.query_params.get('sector')
        
        # 1. Direct hierarchy lookup
        exp = None
        
        # Try Symbol
        if symbol:
            exp = StrategyExperiment.objects.filter(
                strategy=strategy,
                scope_type=ScopeType.SYMBOL,
                scope_value=symbol,
                is_published=True
            ).order_by('-created_at').first()
            
            if not exp:
                # Get sector for this symbol
                company = Company.objects.filter(symbol=symbol).first()
                if company and company.sector:
                    exp = StrategyExperiment.objects.filter(
                        strategy=strategy,
                        scope_type=ScopeType.SECTOR,
                        scope_value=company.sector,
                        is_published=True
                    ).order_by('-created_at').first()
                    
        # Try Sector
        if not exp and sector:
            exp = StrategyExperiment.objects.filter(
                strategy=strategy,
                scope_type=ScopeType.SECTOR,
                scope_value=sector,
                is_published=True
            ).order_by('-created_at').first()
            
        # Try Market (ALL)
        if not exp:
            exp = StrategyExperiment.objects.filter(
                strategy=strategy,
                scope_type=ScopeType.ALL,
                is_published=True
            ).order_by('-created_at').first()
            
        if exp:
            params = exp.parameters
            # Robustness: if optimization experiment has ranges in parameters, pick from metrics
            if exp.run_type == StrategyExperiment.RunType.OPTIMIZATION and params:
                # Check if any value looks like a range (list)
                if any(isinstance(v, list) for v in params.values()):
                    if exp.metrics and 'best_params' in exp.metrics:
                        params = exp.metrics['best_params']
            
            return Response({
                'id': exp.id,
                'scope_type': exp.scope_type,
                'scope_value': exp.scope_value,
                'parameters': params,
                'metrics': exp.metrics,
                'created_at': exp.created_at
            })
        
        # Fallback: Strategy default_parameters if they exist
        # Fix: Parse from code since 'default_parameters' is not a DB field
        default_parameters = {}
        if strategy.code:
             try:
                 tree = ast.parse(strategy.code)
                 for node in tree.body:
                     if isinstance(node, ast.ClassDef):
                         # Assume the first Strategy subclass is the one
                         # Simple check for base class 'Strategy'
                         is_strategy = False
                         for b in node.bases:
                             if isinstance(b, ast.Name) and b.id == 'Strategy':
                                 is_strategy = True
                                 break
                         
                         if is_strategy:
                             for item in node.body:
                                 if isinstance(item, ast.Assign):
                                     for target in item.targets:
                                         if isinstance(target, ast.Name):
                                             if not target.id.startswith('_'):
                                                 val = None
                                                 if isinstance(item.value, ast.Constant):
                                                     val = item.value.value
                                                 elif isinstance(item.value, ast.Num):
                                                     val = item.value.n
                                                 elif isinstance(item.value, ast.Str):
                                                     val = item.value.s
                                                 
                                                 if val is not None:
                                                     default_parameters[target.id] = val
                             break # Stop after finding the strategy class
             except Exception as e:
                 print(f"Error parsing params: {e}")

        if default_parameters:
            return Response({
                'parameters': default_parameters,
                'source': 'strategy_default'
            })
        
        return Response({'message': 'No published configuration found for this scope.'}, status=status.HTTP_404_NOT_FOUND)

    @action(detail=False, methods=['get'])
    def recommendations(self, request):
        """
        Get buy/sell recommendations based on published strategies.
        Runs strategies on the latest data for active companies.
        """
        published_experiments = StrategyExperiment.objects.filter(is_published=True).select_related('strategy')
        if not published_experiments.exists():
             return Response([])

        # Limit company scope for performance (e.g. top 20 by turnover or just 20 random)
        # Ideally this should be an async task or cached.
        # For now, let's scan a small subset of stocks to show functionality.
        # Check if 'symbol' or 'sector' is passed to filter scan
        symbol_query = request.query_params.get('symbol')
        sector_query = request.query_params.get('sector')
        
        companies = Company.objects.filter(status='A')
        if symbol_query:
            companies = companies.filter(symbol=symbol_query)
        elif sector_query:
             companies = companies.filter(sector=sector_query)
        else:
             # If no user filter, we start with ALL active companies
             # We will limit per-strategy to avoid timeouts
             pass

        recommendations = []
        
        import datetime
        end_date = datetime.date.today()
        start_date = end_date - datetime.timedelta(days=400) # Ensure enough data for indicators

        for exp in published_experiments:
            strategy = exp.strategy
            # Determine applicable companies based on Strategy scope AND user query
            strategy_companies = companies # Start with the Base Filtered list (Active companies or Query Filter)

            # Apply Strategy Scope Constraints
            if exp.scope_type == ScopeType.SYMBOL:
                symbols = [s.strip() for s in (exp.scope_value or "").split(',')]
                strategy_companies = strategy_companies.filter(symbol__in=symbols)
            elif exp.scope_type == ScopeType.SECTOR:
                strategy_companies = strategy_companies.filter(sector=exp.scope_value)
            
            # Limit the number of companies processed per strategy to avoid 50s timeout
            # If User queried specific symbol/sector, usually it's small enough.
            # If Global scan (No user query), limit 'ALL' or 'SECTOR' scopes.
            if not symbol_query and not sector_query:
                 strategy_companies = strategy_companies[:5]

            # If after filtering we have candidates, run signal check
            # If after filtering we have candidates, run signal check
            for company in strategy_companies:
                try:
                    # Use experiment parameters, NOT strategy.published_parameters (removed)
                    signal = self._get_signal(strategy.code, company.symbol, start_date, end_date, exp.parameters)
                    if signal:
                        recommendations.append({
                            'strategy_id': strategy.id,
                            'strategy_name': strategy.name,
                            'symbol': company.symbol,
                            'company_name': company.name,
                            'signal': signal['type'], # BUY/SELL
                            'date': signal['date'],
                            'price': signal['price'],
                            'published_parameters': exp.parameters,
                            'scope_type': exp.scope_type,
                            'scope_value': exp.scope_value
                        })
                except Exception as e:
                    print(f"Error generating recommendation for {strategy.name} on {company.symbol}: {e}")
                    continue
        
        return Response(recommendations)

    def _get_signal(self, code, symbol, start_date, end_date, params=None):
        """
        Run a quick backtest to check for signals on the last day.
        """
        queryset = DailyStockPrice.objects.filter(
            ticker=symbol, 
            date__range=[start_date, end_date]
        ).order_by('date')
        
        ticks_data = list(queryset.values('date', 'open', 'high', 'low', 'close', 'volume'))
        if len(ticks_data) < 50:
            return None

        try:
            import pandas as pd
            from backtesting import Backtest, Strategy
            from backtesting.lib import crossover
            from backtesting.test import SMA
            import inspect
            
            df = pd.DataFrame(ticks_data)
            df.rename(columns={
                'open': 'Open', 'high': 'High', 'low': 'Low', 'close': 'Close', 'volume': 'Volume'
            }, inplace=True)
            numeric_cols = ['Open', 'High', 'Low', 'Close', 'Volume']
            df[numeric_cols] = df[numeric_cols].astype(float)
            df['date'] = pd.to_datetime(df['date'])
            df.set_index('date', inplace=True)

            from backtesting import Backtest, Strategy as BTStrategy, crossover
            from backtesting.test import SMA
            # Execution Environment
            local_scope = {
                'Backtest': Backtest, 'Strategy': BTStrategy, 'crossover': crossover, 
                'SMA': SMA, 'pd': pd, 'params': params or {}
            }
            exec(code, local_scope)
            
            strategy_class = None
            for name, obj in local_scope.items():
                if inspect.isclass(obj) and issubclass(obj, BTStrategy) and obj is not BTStrategy:
                    strategy_class = obj
                    break
            
            if not strategy_class:
                return None

            # Run Backtest
            bt = Backtest(df, strategy_class, cash=100000, commission=.004, finalize_trades=True)
            stats = bt.run()
            
            # Check for trades
            trades = stats['_trades']
            if trades.empty:
                return None
                
            last_date = df.index[-1]
            last_trade = trades.iloc[-1]
            
            # entry_time and exit_time are usually timestamps or indices depending on backtesting ver
            # In backtesting.py, EntryTime is the index value.
            
            # Signal logic:
            # If EntryTime == last_date -> BUY Signal
            # If ExitTime == last_date -> SELL Signal
            
            if last_trade['EntryTime'] == last_date:
                return {'type': 'BUY', 'date': last_date, 'price': last_trade['EntryPrice']}
            elif last_trade['ExitTime'] == last_date:
                return {'type': 'SELL', 'date': last_date, 'price': last_trade['ExitPrice']}
                
            return None

        except Exception as e:
            return None
        all_exps.sort(key=lambda x: x['return'], reverse=True)
        
        # Deduplicate by scope to show "Best for Nabil", "Best for Banking", "Best for All"
        seen_scopes = set()
        unique_best = []
        for item in all_exps:
            scope_key = f"{item['experiment'].scope_type}:{item['experiment'].scope_value}"
            if scope_key not in seen_scopes:
                seen_scopes.add(scope_key)
                exp = item['experiment']
                unique_best.append({
                    'scope_type': exp.scope_type,
                    'scope_value': exp.scope_value,
                    'return': item['return'],
                    'parameters': exp.metrics.get('best_params') if exp.run_type == 'OPTIMIZATION' else exp.parameters,
                    'run_type': exp.run_type,
                    'date': exp.created_at
                })
        
        return Response(unique_best[:10]) # Return top 10 unique scopes
    @action(detail=True, methods=['post'], permission_classes=[AllowAny])
    def backtest(self, request, pk=None):
        print("DEBUG: Backtest Request Data:", request.data)
        strategy = self.get_object()
        code = request.data.get('code', '')
        symbol = request.data.get('symbol')
        sector = request.data.get('sector')
        start_date = request.data.get('start_date')
        end_date = request.data.get('end_date')

        if not symbol and not sector:
            return Response({'error': 'Either symbol or sector is required'}, status=400)

        # Extract Strategy Parameters
        strategy_params = request.data.get('parameters', {})
        if not isinstance(strategy_params, dict):
             # Fallback: extract from top level excluding reserved
             reserved_keys = ['code', 'symbol', 'sector', 'start_date', 'end_date', 'parameters']
             strategy_params = {k: v for k, v in request.data.items() if k not in reserved_keys}

        # If sector is provided, run backtest for all stocks in sector
        if sector:
            import uuid
            batch_id = uuid.uuid4()
            
            excluded_types = ['Mutual Funds', 'Non-Convertible Debentures']
            
            # Note: case-insensitive match for sector
            if sector.upper() == 'ALL':
                companies = Company.objects.filter(status='A').exclude(instrument_type__in=excluded_types).values_list('symbol', flat=True)
            else:
                companies = Company.objects.filter(sector__iexact=sector, status='A').exclude(instrument_type__in=excluded_types).values_list('symbol', flat=True)
                
            if not companies:
                return Response({'error': f'No active companies found in sector: {sector}'}, status=404)
            
            sector_results = []
            successful_backtests = 0
            failed_stocks = []
            
            for stock_symbol in companies:
                try:
                    # Run backtest for this stock
                    result, error, exp_data = self._run_single_backtest(code, stock_symbol, start_date, end_date, params=strategy_params)
                    if result:
                        # Log Individual Experiment
                        final_params = strategy_params.copy()
                        if exp_data.get('params'): final_params.update(exp_data['params'])
                        
                        final_metrics = {**result['stats']}
                        if exp_data.get('metrics'): final_metrics.update(exp_data['metrics'])
                        
                        try:
                            exp = StrategyExperiment.objects.create(
                                strategy=strategy,
                                user=request.user,
                                run_type=StrategyExperiment.RunType.BACKTEST,
                                scope_type=ScopeType.SYMBOL,
                                scope_value=stock_symbol,
                                start_date=start_date,
                                end_date=end_date,
                                parameters=final_params,
                                metrics=final_metrics,
                                batch_id=batch_id,
                                plot_html=result.get('plot_html'),
                                status=StrategyExperiment.Status.SUCCESS
                            )
                            experiment_id = exp.id
                        except Exception as e:
                            print(f"Failed to log individual experiment for {stock_symbol}: {e}")
                            experiment_id = None

                        sector_results.append({
                            'id': experiment_id,
                            'symbol': stock_symbol,
                            'return': result['stats']['pnl_percent'], # Consistent key
                            'total_pnl': result['stats']['total_pnl'],
                            'win_rate': result['stats']['win_rate'],
                            'total_trades': result['stats']['total_trades'],
                            'stats': result['stats'] # Include full stats for detailed view
                        })
                        successful_backtests += 1
                    else:
                        failed_stocks.append({'symbol': stock_symbol, 'error': error or 'No data'})
                        # Log Failed Individual Experiment
                        try:
                            StrategyExperiment.objects.create(
                                strategy=strategy,
                                user=request.user,
                                run_type=StrategyExperiment.RunType.BACKTEST,
                                scope_type=ScopeType.SYMBOL,
                                scope_value=stock_symbol,
                                start_date=start_date,
                                end_date=end_date,
                                parameters=strategy_params,
                                metrics={},
                                batch_id=batch_id,
                                status=StrategyExperiment.Status.FAILED,
                                error_log=error or 'No data'
                            )
                        except: pass
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

            # Log Parent Experiment for Aggregation
            try:
                StrategyExperiment.objects.create(
                    strategy=strategy,
                    user=request.user,
                    run_type=StrategyExperiment.RunType.BACKTEST,

                    scope_type=ScopeType.ALL if sector.upper() == 'ALL' else ScopeType.SECTOR,
                    scope_value=sector,
                    start_date=start_date,
                    end_date=end_date,
                    parameters=strategy_params,
                    metrics={
                        'aggregated': {
                            'avg_return': avg_return,
                            'avg_win_rate': avg_win_rate,
                            'total_trades': total_trades,
                            'best_stock': best_stock,
                            'worst_stock': worst_stock
                        },
                        'successful_backtests': successful_backtests,
                        'total_companies': len(companies)
                    },
                    batch_id=batch_id,
                    status=StrategyExperiment.Status.SUCCESS
                )
            except Exception as e:
                print(f"Failed to log parent experiment: {e}")
            
            return Response({
                'sector': sector,
                'batch_id': batch_id,
                'total_companies': len(companies),
                'successful_backtests': successful_backtests,
                'aggregated': {
                    'avg_return': avg_return,
                    'avg_win_rate': avg_win_rate,
                    'total_trades': total_trades,
                    'best_stock': best_stock,
                    'worst_stock': worst_stock
                },
                'individual_results': sorted(sector_results, key=lambda x: x.get('return', 0) or 0, reverse=True),
                'failed_stocks': failed_stocks,
                'metadata': {
                    'scope_type': 'ALL' if sector.upper() == 'ALL' else 'SECTOR',
                    'scope_value': sector,
                    'start_date': start_date,
                    'end_date': end_date,
                    'parameters': strategy_params,
                    'metrics': {
                        'aggregated': {
                            'avg_return': avg_return,
                            'avg_win_rate': avg_win_rate,
                            'total_trades': total_trades,
                            'best_stock': best_stock,
                            'worst_stock': worst_stock
                        },
                        'successful_backtests': successful_backtests,
                        'total_companies': len(companies)
                    }
                }
            })
        

        # Single stock backtest
        result, error, exp_data = self._run_single_backtest(code, symbol, start_date, end_date, params=strategy_params)
        
        # Merge returned params/metrics
        final_params = strategy_params.copy()
        final_metrics = {}
        if exp_data:
            if exp_data.get('params'): final_params.update(exp_data['params'])
            if exp_data.get('metrics'): final_metrics.update(exp_data['metrics'])

        if result is None:
            return Response({'error': error or 'No data found for symbol/dates'}, status=400)
            
        # Meta data for frontend (manual saving)
        result['metadata'] = {
            'scope_type': 'SYMBOL',
            'scope_value': symbol,
            'start_date': start_date,
            'end_date': end_date,
            'parameters': final_params,
            'metrics': {**final_metrics, **result.get('stats', {})}
        }

        return Response(result)

    @action(detail=True, methods=['post'], permission_classes=[IsAuthenticated])
    def save_experiment(self, request, pk=None):
        """Manually save a backtest experiment to history."""
        strategy = self.get_object()
        data = request.data
        
        try:
            # Basic validation
            if not data.get('scope_value') or not data.get('metrics'):
                return Response({'error': 'Missing required experiment data'}, status=400)

            exp = StrategyExperiment.objects.create(
                strategy=strategy,
                user=request.user,
                run_type=data.get('run_type', StrategyExperiment.RunType.BACKTEST),
                scope_type=data.get('scope_type', ScopeType.SYMBOL),
                scope_value=data.get('scope_value'),
                start_date=data.get('start_date'),
                end_date=data.get('end_date'),
                parameters=data.get('parameters', {}),
                metrics=data.get('metrics', {}),
                plot_html=data.get('plot_html'),
                status=StrategyExperiment.Status.SUCCESS
            )
            return Response({'id': exp.id, 'status': 'success'})
        except Exception as e:
            return Response({'error': str(e)}, status=400)
    
    def _run_single_backtest(self, code, symbol, start_date, end_date, params=None):
        """Helper method to run backtest for a single stock. Returns (result_dict, error_msg, experiment_data)."""
        experiment = ExperimentLogger()
        # 1. Fetch Data
        queryset = DailyStockPrice.objects.filter(ticker=symbol)
        if start_date and end_date:
            queryset = queryset.filter(date__range=[start_date, end_date])
        queryset = queryset.order_by('date')
        
        ticks_data = list(queryset.values('date', 'open', 'high', 'low', 'close', 'volume'))
        if not ticks_data:
            return None, "No historical data found for this symbol/date range.", {}

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
                return None, f"Insufficient data points ({len(df)}) after filtering.", {}
            
            df['date'] = pd.to_datetime(df['date'])
            df.set_index('date', inplace=True)
            
            # 2. Execution Environment
            local_scope = self._get_bt_local_scope(symbol, params=params)
             
            # Add experiment logger (backwards compatibility for some strategies)
            local_scope['experiment'] = experiment
            
            # Inject parameters into code - override default values
            import re
            modified_code = code
            if params:
                for param_name, param_value in params.items():
                    # Replace class attributes like "n1 = 10" with "n1 = <param_value>"
                    if isinstance(param_value, (int, float)):
                        if isinstance(param_value, float):
                            pattern = rf'(\s{param_name}\s*=\s*)[\d\.]+'
                            modified_code = re.sub(pattern, rf'\g<1>{param_value:.4f}', modified_code)
                        else:
                            pattern = rf'(\s{param_name}\s*=\s*)\d+'
                            modified_code = re.sub(pattern, rf'\g<1>{int(param_value)}', modified_code)
            
            # Execute User Code with overridden params
            try:
                exec(modified_code, local_scope)
            except Exception as code_err:
                return None, f"Code Execution Error: {str(code_err)}", {}
            
            # Find the Strategy Class
            from backtesting import Strategy as BTStrategy
            strategy_class = None
            for name, obj in local_scope.items():
                if inspect.isclass(obj) and issubclass(obj, BTStrategy) and obj is not BTStrategy:
                    strategy_class = obj
                    break
            
            if not strategy_class:
                return None, "No Strategy class found in code.", {}

            # 3. Run Backtest

            bt = Backtest(df, strategy_class,
                          cash=1000000, commission=.002,
                          exclusive_orders=True, finalize_trades=True)
            
            try:
                stats = bt.run()
            except Exception as bt_err:
                return None, f"Backtest Engine Error: {str(bt_err)}", {'params': experiment.params, 'metrics': experiment.metrics}
            
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
            clean_stats, categorized = self._extract_bt_stats(stats)

            formatted_stats = {
                'total_pnl': clean_stats.get('total_pnl', 0.0),
                'pnl_percent': clean_stats.get('pnl_percent', 0.0),
                'win_rate': clean_stats.get('win_rate', 0.0),
                'final_equity': clean_stats.get('Equity Final [$]', 1000000.0),
                'total_trades': clean_stats.get('total_trades', 0),
                'sharpe_ratio': clean_stats.get('Sharpe Ratio', 0.0),
                'max_drawdown': clean_stats.get('Max. Drawdown [%]', 0.0),
                'categorized': categorized,
                'raw': clean_stats
            }

            return {
                'stats': formatted_stats,
                'plot_html': plot_html
            }, None, {
                'params': self._clean_for_json(experiment.params),
                'metrics': self._clean_for_json(experiment.metrics)
            }

        except Exception as e:
            return None, str(e), {}

    @action(detail=True, methods=['post'], permission_classes=[AllowAny])
    @action(detail=True, methods=['post'])
    def optimize(self, request, pk=None):
        """DEPRECATED - Use optimize_multi_period instead"""
        return Response({'error': 'Use /optimize_multi_period/ endpoint'}, status=410)

    @action(detail=True, methods=['post'])
    def optimize_multi_period(self, request, pk=None):
        """
        Multi-period optimization: Run Grid search across 1Y, 3Y, 5Y, 10Y
        for all 3 objectives (win_rate, profit, balanced).
        Auto-publish 1Y, 3Y, 5Y experiments.
        """
        from .optimize_multi_period import calculate_periods, fetch_period_data, run_single_objective_optimization, run_final_backtest
        
        strategy = self.get_object()
        
        code_template = request.data.get('code', '')
        symbol = request.data.get('symbol', 'NABIL')
        sector = request.data.get('sector')
        param_ranges = request.data.get('param_ranges', {})
        n_trials = request.data.get('n_trials', 50)
        
        if not param_ranges:
            return Response({'error': 'param_ranges required'}, status=400)
        
        # Calculate periods
        all_periods = calculate_periods()
        
        # Filter requested periods
        requested_periods = request.data.get('periods')
        if requested_periods:
            periods = [p for p in all_periods if p[0] in requested_periods]
        else:
            periods = all_periods
        
        # Store results for all periods
        # Store results for all periods
        results_by_period = {}
        
        try:
            # Loop over each period
            for period_name, period_start, period_end in periods:
                print(f"\n{'='*60}")
                print(f"PERIOD: {period_name} ({period_start} to {period_end})")
                print(f"{'='*60}\n")
                
                results_by_period[period_name] = {}
                
                try:
                    # Fetch data for this period
                    data_map, error = fetch_period_data(
                        symbol, sector, period_start, period_end,
                        DailyStockPrice, Company
                    )
                    
                    if error:
                        results_by_period[period_name]['error'] = error
                        continue
                    
                    # Run optimization for all 3 objectives
                    for obj_type in ['win_rate', 'profit', 'balanced']:
                        print(f"  Optimizing for {obj_type}...")
                        
                        result = run_single_objective_optimization(
                            data_map, code_template, param_ranges, obj_type, n_trials
                        )
                        
                        # Log raw result from optimization
                        print(f"    Raw Result for {obj_type}: {result}")
                        
                        # Run full backtest for ALL objectives to get displayable stats
                        # This allows side-by-side comparison of metrics
                        full_stats, bt_instance, plot_html = run_final_backtest(data_map, code_template, result['best_params'])
                        
                        if full_stats:
                            print(f"    ✅ Backtest stats generated for {obj_type}")
                            result['stats'] = full_stats
                            
                            # Create Experiment Record for this objective's result
                            try:
                                # Determine scope
                                scope_type = ScopeType.SYMBOL
                                scope_val = symbol
                                if symbol == 'ALL':
                                    scope_type = ScopeType.ALL 
                                    scope_val = 'ALL'
                                elif sector:
                                    scope_type = ScopeType.SECTOR
                                    scope_val = sector

                                # Only auto-publish 'balanced' or 'profit' to avoid clutter/conflicts?
                                # Let's publish 'balanced' as the primary one. 
                                # 'win_rate' and 'profit' will be saved but not marked published,
                                # so they don't override the default view but are accessible via link.
                                is_published = (obj_type == 'balanced')
                                
                                exp = StrategyExperiment.objects.create(
                                    strategy=strategy,
                                    user=request.user,
                                    run_type=StrategyExperiment.RunType.OPTIMIZATION,
                                    scope_type=scope_type,
                                    scope_value=scope_val,
                                    start_date=period_start,
                                    end_date=period_end,
                                    parameters=result['best_params'],
                                    metrics={
                                        'stats': full_stats,
                                        'period': period_name,
                                        'objective': obj_type
                                    },
                                    plot_html=plot_html,
                                    status=StrategyExperiment.Status.SUCCESS,
                                    is_published=is_published 
                                )
                                print(f"  ✅ Created Experiment {exp.id} ({obj_type})")
                                result['experiment_id'] = exp.id
                                
                                # If this is the published one, unpublish others
                                if is_published:
                                    StrategyExperiment.objects.filter(
                                        strategy=strategy,
                                        scope_type=scope_type,
                                        scope_value=scope_val,
                                        is_published=True
                                    ).exclude(id=exp.id).update(is_published=False)
                                
                            except Exception as exp_err:
                                print(f"  ❌ Failed to create experiment: {exp_err}")
                        else:
                            print(f"    ⚠️ Full backtest returned None for {obj_type}")
                        
                        results_by_period[period_name][obj_type] = result

                except Exception as period_err:
                    import traceback
                    print(f"❌ Period {period_name} failed: {period_err}")
                    traceback.print_exc()
                    results_by_period[period_name]['error'] = str(period_err)
        
        except Exception as e:
            import traceback
            error_msg = f"Multi-period optimization failed: {str(e)}"
            print(f"❌ {error_msg}")
            traceback.print_exc()
            return Response({
                'success': False,
                'error': error_msg,
                'traceback': traceback.format_exc()
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        clean_results = StrategyViewSet._clean_for_json(results_by_period)

        return Response({
            'success': True,
            'message': 'Multi-period optimization complete',
            'results_by_period': clean_results
        })


    @action(detail=True, methods=['post'])
    def publish_optimized(self, request, pk=None):
        """
        Publish optimized parameters for a strategy. Creates a published experiment record.
        """
        import re
        
        strategy = self.get_object()
        best_params = request.data.get('params', {}) or request.data.get('best_params', {})
        symbol = request.data.get('symbol', '')
        period = request.data.get('period', '')
        
        if not best_params:
            return Response({'error': 'No parameters to publish'}, status=400)
        
        if not symbol:
            return Response({'error': 'Symbol is required'}, status=400)
        
        # Update strategy code with new parameter values
        new_code = strategy.code
        for param_name, param_value in best_params.items():
            # Replace parameter assignments in the code using word boundaries and matching floats
            pattern = rf"(\b{param_name}\s*=\s*)[-+]?[\d\.]+"
            new_code = re.sub(pattern, rf"\g<1>{param_value}", new_code)
        
        # Save the updated code 
        strategy.code = new_code
        strategy.ticker = symbol  # Update the default ticker
        strategy.save()
        
        # Unpublish existing experiments for the same strategy and symbol
        StrategyExperiment.objects.filter(
            strategy=strategy,
            scope_type=ScopeType.SYMBOL,
            scope_value=symbol,
            is_published=True
        ).update(is_published=False)

        # Perform a fresh backtest with the optimized parameters to capture full state (plot, etc.)
        try:
            from datetime import date, datetime
            from dateutil.relativedelta import relativedelta
            import pandas as pd
            from backtesting import Backtest
            import inspect

            tags = request.data.get('tags', [])

            # Determine date range
            today = date.today()
            period_map = {
                '1Y': relativedelta(years=1),
                '3Y': relativedelta(years=3),
                '5Y': relativedelta(years=5),
                '10Y': relativedelta(years=10),
                'ALL': None
            }
            p_delta = period_map.get(period)
            p_start = (today - p_delta) if p_delta else None
            p_end = today
            
            # Fetch Data
            queryset = DailyStockPrice.objects.filter(ticker=symbol)
            if p_start:
                queryset = queryset.filter(date__gte=p_start)
            queryset = queryset.filter(date__lte=p_end).order_by('date')
            
            ticks_data = list(queryset.values('date', 'open', 'high', 'low', 'close', 'volume'))
            
            if not ticks_data or len(ticks_data) < 20:
                 raise Exception("Insufficient data for backtest")

            df = pd.DataFrame(ticks_data)
            df.rename(columns={'open': 'Open', 'high': 'High', 'low': 'Low', 'close': 'Close', 'volume': 'Volume'}, inplace=True)
            numeric_cols = ['Open', 'High', 'Low', 'Close', 'Volume']
            df[numeric_cols] = df[numeric_cols].astype(float)
            df['date'] = pd.to_datetime(df['date'])
            df.set_index('date', inplace=True)

            # Execute Code
            local_scope = self._get_bt_local_scope(symbol)
            exec(strategy.code, local_scope)
            
            # Find Strategy Class
            from backtesting import Strategy as BTStrategy
            strategy_class = None
            for name, obj in local_scope.items():
                if inspect.isclass(obj) and issubclass(obj, BTStrategy) and obj is not BTStrategy:
                    strategy_class = obj
                    break
            
            if not strategy_class:
                raise Exception("No Strategy class found in code")
                
            # Run Backtest with Best Params
            # Note: backtesting.py params are class attributes. We need to set them.
            # However, Backtest(..., strategy_class) instantiates internally.
            # To pass params, we might need to subclass or setattr on the class temporarily/dynamically.
            # Standard way in backtesting.py is creating a subclass with updated params.
            class OptimizedStrategy(strategy_class):
                pass
                
            for k, v in best_params.items():
                setattr(OptimizedStrategy, k, v)
            
            bt = Backtest(df, OptimizedStrategy, cash=1000000, commission=.002, exclusive_orders=True)
            stats = bt.run()
            
            # Generate Plot
            plot_html = bt.plot(open_browser=False, filename=None)
            
            # Clean Stats
            metrics, _ = self._extract_bt_stats(stats)
            # Add extra metadata
            metrics.update({'optimized': True, 'symbol': symbol, 'params': best_params, 'period': period, 'tags': tags})
            
            experiment = StrategyExperiment.objects.create(
                strategy=strategy,
                user=request.user,
                run_type=StrategyExperiment.RunType.OPTIMIZATION,
                scope_type=ScopeType.SYMBOL,
                scope_value=symbol,
                start_date=p_start if p_start else df.index[0].date(),
                end_date=p_end,
                parameters=self._clean_for_json(best_params),
                metrics=self._clean_for_json(metrics),
                plot_html=plot_html,
                status=StrategyExperiment.Status.SUCCESS,
                is_published=True
            )
            
        except Exception as e:
            # Fallback to simple creation if backtest fails (though it shouldn't)
            # Or return error. User wants "experiment to run", so error is better.
            return Response({'error': f"Failed to run published backtest: {str(e)}"}, status=500)
        
        return Response({
            'success': True,
            'message': f'Published optimized config for {strategy.name}',
            'experiment_id': experiment.id,
            'updated_params': best_params,
            'symbol': symbol
        })

    @action(detail=True, methods=['get'])
    def symbol_config(self, request, pk=None):
        """Get symbol configuration with all 3 published parameter sets"""
        from .models import StrategySymbolConfig
        from .serializers import StrategySymbolConfigSerializer
        
        strategy = self.get_object()
        symbol = request.query_params.get('symbol')
        
        if not symbol:
            return Response({'error': 'Symbol parameter required'}, status=400)
        
        # Get or create config with default 3Y timeframe
        config, created = StrategySymbolConfig.objects.get_or_create(
            user=request.user,
            strategy=strategy,
            symbol=symbol,
            defaults={'preferred_timeframe': '3Y'}
        )
        
        serializer = StrategySymbolConfigSerializer(config)
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'])
    def set_symbol_config(self, request, pk=None):
        """Update symbol configuration timeframe preference"""
        from .models import StrategySymbolConfig
        
        strategy = self.get_object()
        symbol = request.data.get('symbol')
        preferred_timeframe = request.data.get('preferred_timeframe')
        
        if not symbol:
            return Response({'error': 'Symbol parameter required'}, status=400)
        
        if preferred_timeframe not in ['1Y', '3Y', '5Y']:
            return Response({'error': 'Invalid timeframe. Must be 1Y, 3Y, or 5Y'}, status=400)
        
        config, created = StrategySymbolConfig.objects.update_or_create(
            user=request.user,
            strategy=strategy,
            symbol=symbol,
            defaults={'preferred_timeframe': preferred_timeframe}
        )
        
        return Response({
            'status': 'updated',
            'preferred_timeframe': config.preferred_timeframe
        })

    @action(detail=True, methods=['post'])
    def unpublish_optimized(self, request, pk=None):
        """
        Unpublish optimized parameters for a strategy and symbol.
        """
        strategy = self.get_object()
        symbol = request.data.get('symbol', '')
        
        if not symbol:
            return Response({'error': 'Symbol is required'}, status=400)
        
        # Unpublish existing experiments for the same strategy and symbol
        updated_count = StrategyExperiment.objects.filter(
            strategy=strategy,
            scope_type=ScopeType.SYMBOL,
            scope_value=symbol,
            is_published=True
        ).update(is_published=False)
        
        return Response({
            'success': True,
            'message': f'Unpublished optimized config for {strategy.name} on {symbol}',
            'updated_count': updated_count
        })

    @action(detail=False, methods=['post'])
    def compare(self, request):
        """
        Compare multiple strategies on a single symbol across different time periods.
        Returns a matrix of performance metrics.
        """
        import pandas as pd
        from backtesting import Backtest, Strategy as BTStrategy
        from backtesting.lib import crossover
        from backtesting.test import SMA
        import inspect
        import numpy as np
        from dateutil.relativedelta import relativedelta
        from datetime import datetime
        import uuid
        
        # Import Django Strategy model explicitly
        from .models import Strategy as StrategyModel
        
        symbol = request.data.get('symbol')
        strategy_ids = request.data.get('strategy_ids', [])
        periods = request.data.get('periods', ['1Y', '3Y', '5Y', '10Y'])
        
        if not symbol:
            return Response({'error': 'Symbol is required'}, status=400)
        
        # Get strategies to compare using Django model
        if strategy_ids:
            strategies = StrategyModel.objects.filter(id__in=strategy_ids)
        else:
            # Get all user's strategies
            strategies = StrategyModel.objects.filter(Q(user=request.user) | Q(is_public=True))
        
        if not strategies.exists():
            return Response({'error': 'No strategies found'}, status=404)

        # Generate batch_id for this comparison session
        batch_id = uuid.uuid4()
        
        # Define period mappings
        period_map = {
            '1Y': relativedelta(years=1),
            '3Y': relativedelta(years=3),
            '5Y': relativedelta(years=5),
            '10Y': relativedelta(years=10),
            'ALL': None
        }
        
        today = datetime.now().date()
        
        # Helper to run a single backtest
        def run_backtest_for_period(strategy_obj, start_date, end_date, period_name):
            try:
                # Fetch data
                queryset = DailyStockPrice.objects.filter(ticker=symbol)
                if start_date:
                    queryset = queryset.filter(date__gte=start_date)
                if end_date:
                    queryset = queryset.filter(date__lte=end_date)
                queryset = queryset.order_by('date')
                
                ticks_data = list(queryset.values('date', 'open', 'high', 'low', 'close', 'volume'))
                if not ticks_data or len(ticks_data) < 20:
                    error_msg = 'Insufficient data'
                    # Log failed experiment
                    try:
                        StrategyExperiment.objects.create(
                            strategy=strategy_obj,
                            user=request.user,
                            run_type=StrategyExperiment.RunType.BACKTEST,
                            scope_type=ScopeType.SYMBOL,
                            scope_value=symbol,
                            start_date=start_date,
                            end_date=end_date,
                            parameters={'comparison_period': period_name},
                            metrics={},
                            batch_id=batch_id,
                            status=StrategyExperiment.Status.FAILED,
                            error_log=error_msg
                        )
                    except Exception as log_err:
                        print(f"Failed to log comparison experiment: {log_err}")
                    return {'error': error_msg}
                
                df = pd.DataFrame(ticks_data)
                df.rename(columns={
                    'open': 'Open', 'high': 'High', 'low': 'Low', 'close': 'Close', 'volume': 'Volume'
                }, inplace=True)
                
                numeric_cols = ['Open', 'High', 'Low', 'Close', 'Volume']
                df[numeric_cols] = df[numeric_cols].astype(float)
                
                # Filter bad data
                df = df[
                    (df['High'] / df['Open'] <= 2.0) & 
                    (df['Low'] / df['Open'] >= 0.5) & 
                    (df['Close'] > 0)
                ].copy()
                
                if len(df) < 10:
                    error_msg = 'Insufficient valid data'
                    # Log failed experiment
                    try:
                        StrategyExperiment.objects.create(
                            strategy=strategy_obj,
                            user=request.user,
                            run_type=StrategyExperiment.RunType.BACKTEST,
                            scope_type=ScopeType.SYMBOL,
                            scope_value=symbol,
                            start_date=start_date,
                            end_date=end_date,
                            parameters={'comparison_period': period_name},
                            metrics={},
                            batch_id=batch_id,
                            status=StrategyExperiment.Status.FAILED,
                            error_log=error_msg
                        )
                    except Exception as log_err:
                        print(f"Failed to log comparison experiment: {log_err}")
                    return {'error': error_msg}
                
                df['date'] = pd.to_datetime(df['date'])
                df.set_index('date', inplace=True)
                
                # Execute strategy code
                local_scope = self._get_bt_local_scope(symbol)
                exec(strategy_obj.code, local_scope)
                
                # Find strategy class
                from backtesting import Strategy as BTStrategy
                strategy_class = None
                for name, obj in local_scope.items():
                    if inspect.isclass(obj) and issubclass(obj, BTStrategy) and obj is not BTStrategy:
                        strategy_class = obj
                        break

                if not strategy_class:
                    error_msg = 'No Strategy class found'
                    # Log failed experiment
                    try:
                        StrategyExperiment.objects.create(
                            strategy=strategy_obj,
                            user=request.user,
                            run_type=StrategyExperiment.RunType.BACKTEST,
                            scope_type=ScopeType.SYMBOL,
                            scope_value=symbol,
                            start_date=start_date,
                            end_date=end_date,
                            parameters={'comparison_period': period_name},
                            metrics={},
                            batch_id=batch_id,
                            status=StrategyExperiment.Status.FAILED,
                            error_log=error_msg
                        )
                    except Exception as log_err:
                        print(f"Failed to log comparison experiment: {log_err}")
                    return {'error': error_msg}
                
                # Run backtest
                bt = Backtest(df, strategy_class, cash=1000000, commission=.002, exclusive_orders=True, finalize_trades=True)
                stats = bt.run()
                
                metrics, _ = self._extract_bt_stats(stats)
                
                # Log successful experiment
                experiment_id = None
                try:
                    exp = StrategyExperiment.objects.create(
                        strategy=strategy_obj,
                        user=request.user,
                        run_type=StrategyExperiment.RunType.BACKTEST,
                        scope_type=ScopeType.SYMBOL,
                        scope_value=symbol,
                        start_date=start_date,
                        end_date=end_date,
                        parameters={'comparison_period': period_name},
                        metrics=metrics,
                        batch_id=batch_id,
                        status=StrategyExperiment.Status.SUCCESS
                    )
                    experiment_id = exp.id
                except Exception as log_err:
                    print(f"Failed to log comparison experiment: {log_err}")
                
                # Return metrics with experiment_id
                return {**metrics, 'experiment_id': experiment_id}
            except Exception as e:
                error_msg = str(e)
                # Log failed experiment
                try:
                    StrategyExperiment.objects.create(
                        strategy=strategy_obj,
                        user=request.user,
                        run_type=StrategyExperiment.RunType.BACKTEST,
                        scope_type=ScopeType.SYMBOL,
                        scope_value=symbol,
                        start_date=start_date,
                        end_date=end_date,
                        parameters={'comparison_period': period_name},
                        metrics={},
                        batch_id=batch_id,
                        status=StrategyExperiment.Status.FAILED,
                        error_log=error_msg
                    )
                except Exception as log_err:
                    print(f"Failed to log comparison experiment: {log_err}")
                return {'error': error_msg}
        
        # Build results matrix
        results = []
        
        for strategy_obj in strategies:
            strategy_result = {
                'strategy_id': strategy_obj.id,
                'strategy_name': strategy_obj.name,
                'is_published': StrategyExperiment.objects.filter(
                    strategy=strategy_obj,
                    scope_type=ScopeType.SYMBOL,
                    scope_value=symbol,
                    is_published=True
                ).exists(),
                'periods': {}
            }
            
            for period in periods:
                if period == 'ALL':
                    start_date = None
                    end_date = today
                else:
                    delta = period_map.get(period)
                    if delta:
                        start_date = today - delta
                        end_date = today
                    else:
                        continue
                
                metrics = run_backtest_for_period(strategy_obj, start_date, end_date, period)
                strategy_result['periods'][period] = metrics
            
            results.append(strategy_result)
        
        return Response({
            'symbol': symbol,
            'periods': periods,
            'results': results,
            'batch_id': str(batch_id)  # Return batch_id for reference
        })

    @action(detail=False, methods=['post'])
    def optimize_compare(self, request):
        """
        Optimize and compare multiple strategies on a single symbol across different time periods.
        Runs optimization for each strategy x period combination and returns best results.
        """
        import pandas as pd
        from backtesting import Backtest, Strategy as BTStrategy
        from backtesting.lib import crossover
        from backtesting.test import SMA
        import inspect
        import numpy as np
        import optuna
        from dateutil.relativedelta import relativedelta
        from datetime import datetime
        import re
        
        # Import Django Strategy model explicitly
        from .models import Strategy as StrategyModel
        
        optuna.logging.set_verbosity(optuna.logging.WARNING)
        
        symbol = request.data.get('symbol')
        strategy_ids = request.data.get('strategy_ids', [])
        periods = request.data.get('periods', ['1Y', '3Y', '5Y', '10Y'])
        n_trials = request.data.get('n_trials', 20)  # Fewer trials for speed
        force_refresh = request.data.get('force_refresh', False)
        batch_id = uuid.uuid4()
        
        if not symbol:
            return Response({'error': 'Symbol is required'}, status=400)
        
        # Get strategies to compare using Django model
        if strategy_ids:
            strategies = StrategyModel.objects.filter(id__in=strategy_ids)
        else:
            strategies = StrategyModel.objects.filter(Q(user=request.user) | Q(is_public=True))
        
        if not strategies.exists():
            return Response({'error': 'No strategies found'}, status=404)
        
        # Define period mappings
        period_map = {
            '1Y': relativedelta(years=1),
            '3Y': relativedelta(years=3),
            '5Y': relativedelta(years=5),
            '10Y': relativedelta(years=10),
            'ALL': None
        }
        
        today = datetime.now().date()
        
        # Helper to extract parameters from strategy code
        def extract_params(code):
            params = {}
            search_space = {}
            regex = r'^\s*(\w+)\s*=\s*([\d.]+)'
            for match in re.finditer(regex, code, re.MULTILINE):
                param_name = match.group(1)
                value_str = match.group(2)
                if param_name in ['self', 'data', 'position', 'equity']:
                    continue
                if '.' in value_str:
                    continue  # Skip floats for now
                try:
                    value = int(value_str)
                    min_val = max(1, int(value * 0.5))
                    max_val = int(value * 2)
                    params[param_name] = [min_val, max_val]
                    search_space[param_name] = list(range(min_val, max_val + 1))
                except:
                    pass
            return params, search_space
        
        # Helper to run optimization for a period
        def run_optimization_for_period(strategy_obj, start_date, end_date, n_trials):
            try:
                # Fetch data
                queryset = DailyStockPrice.objects.filter(ticker=symbol)
                if start_date:
                    queryset = queryset.filter(date__gte=start_date)
                if end_date:
                    queryset = queryset.filter(date__lte=end_date)
                queryset = queryset.order_by('date')
                
                ticks_data = list(queryset.values('date', 'open', 'high', 'low', 'close', 'volume'))
                if not ticks_data or len(ticks_data) < 50:
                    return {'error': 'Insufficient data'}
                
                df = pd.DataFrame(ticks_data)
                df.rename(columns={
                    'open': 'Open', 'high': 'High', 'low': 'Low', 'close': 'Close', 'volume': 'Volume'
                }, inplace=True)
                
                numeric_cols = ['Open', 'High', 'Low', 'Close', 'Volume']
                df[numeric_cols] = df[numeric_cols].astype(float)
                
                df = df[
                    (df['High'] / df['Open'] <= 2.0) & 
                    (df['Low'] / df['Open'] >= 0.5) & 
                    (df['Close'] > 0)
                ].copy()
                
                if len(df) < 30:
                    return {'error': 'Insufficient valid data'}
                
                df['date'] = pd.to_datetime(df['date'])
                df.set_index('date', inplace=True)
                
                code_template = strategy_obj.code
                param_ranges, search_space = extract_params(code_template)
                
                if not param_ranges:
                    local_scope = self._get_bt_local_scope(symbol)
                    exec(code_template, local_scope)
                    
                    from backtesting import Strategy as BTStrategy
                    strategy_class = None
                    for name, obj in local_scope.items():
                        if inspect.isclass(obj) and issubclass(obj, BTStrategy) and obj is not BTStrategy:
                            strategy_class = obj
                            break
                    
                    if not strategy_class:
                        return {'error': 'No Strategy class found'}
                    
                    bt = Backtest(df, strategy_class, cash=1000000, commission=.002, exclusive_orders=True, finalize_trades=True)
                    stats = bt.run()
                    
                    metrics, _ = self._extract_bt_stats(stats)
                    metrics['optimized'] = False
                    metrics['best_params'] = {}
                    return metrics
                
                # Calculate total combinations
                total_combinations = 1
                for param_name, values in search_space.items():
                    total_combinations *= len(values)
                
                # GRID_THRESHOLD - Prefer Grid optimization for comprehensive search
                GRID_THRESHOLD = 5000  # Increased from 500 to prefer Grid
                
                if total_combinations <= GRID_THRESHOLD:
                    sampler = optuna.samplers.GridSampler(search_space)
                    actual_trials = total_combinations
                else:
                    sampler = optuna.samplers.TPESampler()
                    actual_trials = max(n_trials, 50) # Bump up default for larger spaces
                
                # Define objective function
                def objective(trial):
                    from backtesting import Strategy as BTStrategy
                    params = {}
                    for param_name, (min_val, max_val) in param_ranges.items():
                        params[param_name] = trial.suggest_int(param_name, min_val, max_val)
                    
                    code = code_template
                    for param_name, param_value in params.items():
                        code = code.replace(f"{param_name} = ", f"{param_name} = {param_value} #")
                    
                    local_scope = self._get_bt_local_scope(symbol, params=params)
                    
                    try:
                        exec(code, local_scope)
                        
                        strategy_class = None
                        for name, obj in local_scope.items():
                            if inspect.isclass(obj) and issubclass(obj, BTStrategy) and obj is not BTStrategy:
                                strategy_class = obj
                                break
                        
                        if not strategy_class:
                            return -9999
                        
                        bt = Backtest(df, strategy_class, cash=1000000, commission=.002, exclusive_orders=True, finalize_trades=True)
                        stats = bt.run()
                        
                        # Prioritize win rate (60%) then return (40%)
                        win_rate = stats.get('Win Rate [%]', 0)
                        return_pct = stats.get('Return [%]', 0)
                        
                        if win_rate is None or (isinstance(win_rate, float) and win_rate != win_rate):
                            win_rate = 0
                        if return_pct is None or (isinstance(return_pct, float) and return_pct != return_pct):
                            return_pct = 0
                        
                        # Composite score: win_rate (60%) and return (40%)
                        # Normalize win rate (0-100 -> 0-1)
                        norm_win = win_rate / 100.0
                        # Normalize return (-50% to +100% scale -> 0-1)
                        norm_ret = max(0, min(1, (return_pct + 50) / 150.0))
                        
                        score = (norm_win * 0.6) + (norm_ret * 0.4)
                        return score
                    except:
                        return -9999
                
                # Run optimization
                study = optuna.create_study(direction='maximize', sampler=sampler)
                study.optimize(objective, n_trials=actual_trials, show_progress_bar=False)
                
                best_params = study.best_params
                best_value = study.best_value
                
                # Run final backtest with best params
                from backtesting import Strategy as BTStrategy
                code = code_template
                for param_name, param_value in best_params.items():
                    code = code.replace(f"{param_name} = ", f"{param_name} = {param_value} #")
                
                local_scope = self._get_bt_local_scope(symbol, params=best_params)
                exec(code, local_scope)
                
                strategy_class = None
                for name, obj in local_scope.items():
                    if inspect.isclass(obj) and issubclass(obj, BTStrategy) and obj is not BTStrategy:
                        strategy_class = obj
                        break
                
                bt = Backtest(df, strategy_class, cash=1000000, commission=.002, exclusive_orders=True, finalize_trades=True)
                stats = bt.run()
                
                # Generate plot HTML
                try:
                    plot_obj = bt.plot(open_browser=False, filename=None)
                    # Convert Bokeh plot to HTML string
                    if plot_obj is not None:
                        from bokeh.embed import file_html
                        from bokeh.resources import CDN
                        plot_html = file_html(plot_obj, CDN, "Backtest Results")
                    else:
                        plot_html = None
                except Exception as plot_err:
                    print(f"Failed to generate plot: {plot_err}")
                    plot_html = None
                
                # Extract metrics with categorization
                metrics, categorized = self._extract_bt_stats(stats)
                metrics.update({
                    'best_params': best_params,
                    'optimized': True,
                    'n_trials': actual_trials,
                    'categorized': categorized  # Add categorized metrics
                })
                # Final safety pass before returning and potentially saving to DB
                return self._clean_for_json(metrics), plot_html
            except Exception as e:
                return {'error': str(e)}
        
        # Build results matrix
        results = []
        
        for strategy_obj in strategies:
            # Find all currently published experiments for this symbol
            published_periods = list(StrategyExperiment.objects.filter(
                strategy=strategy_obj,
                scope_type=ScopeType.SYMBOL,
                scope_value=symbol,
                is_published=True
            ).values_list('metrics__period', flat=True))
            
            # Filter out None/empty periods just in case
            published_periods = [p for p in published_periods if p]

            strategy_result = {
                'strategy_id': strategy_obj.id,
                'strategy_name': strategy_obj.name,
                'is_published': len(published_periods) > 0,
                'published_periods': published_periods,
                'periods': {},
                'best_params': {}
            }
            
            # Step 1: Run optimization/backtest for EACH period independently
            for period in periods:
                if period == 'ALL':
                    p_start = None
                    p_end = today
                else:
                    p_delta = period_map.get(period)
                    if p_delta:
                        p_start = today - p_delta
                        p_end = today
                    else:
                        continue
                
                # Check cache for this specific strategy-symbol-period combo
                cached = None
                if not force_refresh:
                    # Look for ANY recent successful optimization for this period
                    # tailored to the user's request for persistence
                    cached = StrategyExperiment.objects.filter(
                        strategy=strategy_obj,
                        scope_type=ScopeType.SYMBOL,
                        scope_value=symbol,
                        metrics__period=period,  # Check the stored period tag
                        run_type=StrategyExperiment.RunType.OPTIMIZATION,
                        status=StrategyExperiment.Status.SUCCESS
                    ).order_by('-created_at').first()
                
                # Define start date for potential DB entry
                db_p_start = p_start or date(2000, 1, 1)
                
                if cached:
                    period_metrics = cached.metrics
                    period_metrics['cached'] = True
                    period_metrics['best_params'] = cached.parameters
                    period_metrics['experiment_id'] = cached.id  # Add experiment ID from cache
                    plot_html = cached.plot_html  # Get cached plot HTML
                else:
                    period_result = run_optimization_for_period(strategy_obj, p_start, p_end, n_trials)
                    # Handle the tuple return (metrics, plot_html)
                    if isinstance(period_result, tuple):
                        period_metrics, plot_html = period_result
                    else:
                        # Backward compatibility if optimization returns error dict
                        period_metrics = period_result
                        plot_html = None
                    
                    if 'error' not in period_metrics:
                        # Add period tag to metrics for future cache lookup
                        period_metrics['period'] = period
                        
                        # Save optimization result to cache and get experiment ID
                        exp = StrategyExperiment.objects.create(
                            strategy=strategy_obj,
                            user=request.user,
                            run_type=StrategyExperiment.RunType.OPTIMIZATION,
                            scope_type=ScopeType.SYMBOL,
                            scope_value=symbol,
                            start_date=db_p_start,
                            end_date=p_end,
                            parameters=period_metrics.get('best_params', {}),
                            metrics=period_metrics,
                            batch_id=batch_id,
                            status=StrategyExperiment.Status.SUCCESS,
                            plot_html=plot_html  # Save plot HTML
                        )
                        # Add experiment_id to the metrics
                        period_metrics['experiment_id'] = exp.id
                        
                        # Auto-publish: Mark this experiment as published for this symbol
                        # Unpublish any existing published experiments for same strategy+symbol+period
                        StrategyExperiment.objects.filter(
                            strategy=strategy_obj,
                            scope_type=ScopeType.SYMBOL,
                            scope_value=symbol,
                            is_published=True,
                            metrics__period=period  # Only unpublish same period
                        ).update(is_published=False)
                        
                        # Publish the new experiment
                        exp.is_published = True
                        exp.save()
                
                strategy_result['periods'][period] = self._clean_for_json(period_metrics)
            
            # Step 2: Use 3Y as the default best_params for the whole strategy if available
            strategy_result['best_params'] = strategy_result['periods'].get('3Y', {}).get('best_params', {})
            
            results.append(strategy_result)
        
        return Response({
            'symbol': symbol,
            'periods': periods,
            'results': results,
            'optimized': True
        })

    @action(detail=False, methods=['get'])
    def experiment_detail(self, request):
        experiment_id = request.query_params.get('id')
        batch_id = request.query_params.get('batch_id')
        symbol = request.query_params.get('symbol')
        
        if experiment_id:
            try:
                experiment = StrategyExperiment.objects.get(id=experiment_id)
                return Response(StrategyExperimentDetailSerializer(experiment).data)
            except StrategyExperiment.DoesNotExist:
                return Response({'error': 'Experiment not found'}, status=404)
        
        if batch_id:
            experiments = StrategyExperiment.objects.filter(batch_id=batch_id)
            if symbol:
                try:
                    experiment = experiments.get(scope_value=symbol, scope_type=ScopeType.SYMBOL)
                    return Response(StrategyExperimentDetailSerializer(experiment).data)
                except StrategyExperiment.DoesNotExist:
                    return Response({'error': 'Experiment for this symbol in batch not found'}, status=404)
            else:
                # Return all experiments in batch
                return Response(StrategyExperimentSerializer(experiments, many=True).data)
                
        return Response({'error': 'id or batch_id required'}, status=400)


class CompanyViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Company.objects.filter(status='A').order_by('symbol')
    serializer_class = CompanySerializer
    permission_classes = [AllowAny]
    search_fields = ['symbol', 'name']
    
    
    @action(detail=True, methods=['post'], permission_classes=[AllowAny])
    def refresh_fundamentals(self, request, pk=None):
        """
        Recalculates fundamental metrics based on the latest financial reports and market price.
        Comprehensive: PE, PBV, PS, ROE, ROA, Debt/Equity, PEG, Market Cap.
        """
        ticker = pk
        try:
            # 1. Fetch Latest Price
            latest_price_obj = DailyStockPrice.objects.filter(ticker=ticker).order_by('-date').first()
            if not latest_price_obj:
                return Response({'error': 'No market price data found'}, status=404)
            
            # Safe Float Helper
            def safe_float(val, default=0.0):
                try:
                    if val is None: return default
                    return float(val)
                except:
                    return default

            market_price = safe_float(latest_price_obj.close)
            
            # 2. Fetch Latest Reports
            latest_annual = FinancialReport.objects.filter(ticker=ticker, report_type='ANNUAL').order_by('-fiscal_year').first()
            latest_quarterly = FinancialReport.objects.filter(ticker=ticker, report_type='QUARTERLY').order_by('-fiscal_year', '-quarter').first()
            
            # Decide which report to use for "Current Status"
            report = latest_quarterly if latest_quarterly else latest_annual
            if not report:
                return Response({'error': 'No financial reports found'}, status=404)

            # Fetch Company Metadata
            company = Company.objects.get(symbol=ticker)
            
            # --- HELPER: Extract values safely from JSON ---
            def get_val(data, keys):
                if not data: return 0.0
                for k in keys:
                    if k in data and data[k] is not None:
                        try:
                            return float(data[k])
                        except:
                            continue
                return 0.0

            bs = report.balance_sheet or {}
            pl = report.profit_loss or {}
            
            # --- EXTRACT RAW METRICS ---
            
            # 1. Net Profit
            net_profit = get_val(pl, ['net_profit', 'net_profit_after_tax', 'profit_for_period'])
            
            # 2. Revenue / Sales
            revenue = get_val(pl, ['revenue', 'total_operating_income', 'total_income', 'sales', 'gross_income', 'net_premium'])
            
            # 3. Total Assets
            total_assets = get_val(bs, ['total_assets', 'assets_total'])
            if total_assets == 0:
                # Try summing components if total not found (basic fallback)
                cur = get_val(bs, ['current_assets', 'total_current_assets'])
                non_cur = get_val(bs, ['non_current_assets', 'total_non_current_assets', 'fixed_assets'])
                total_assets = cur + non_cur

            # 4. Total Equity
            total_equity = get_val(bs, ['total_equity', 'equity_total'])
            paid_up_capital = get_val(bs, ['paid_up_capital', 'share_capital'])
            reserves = get_val(bs, ['reserves', 'reserves_and_surplus', 'retained_earnings'])
            
            if total_equity == 0 and paid_up_capital > 0:
                total_equity = paid_up_capital + reserves

            # 5. Total Debt
            long_term_debt = get_val(bs, ['long_term_loans', 'non_current_borrowings', 'borrowings', 'debt_securities'])
            short_term_debt = get_val(bs, ['short_term_loans', 'current_borrowings', 'overdraft'])
            total_debt = long_term_debt + short_term_debt

            # --- ANNUALIZATION ---
            is_quarterly = report.report_type == 'QUARTERLY'
            quarter_val = report.quarter if (is_quarterly and report.quarter) else 4
            if not quarter_val: quarter_val = 4 # Fallback safety
            
            factor = (12 / (quarter_val * 3)) if (is_quarterly and quarter_val) else 1.0 
            
            # EPS logic
            eps = 0.0
            if report.eps:
                eps = safe_float(report.eps)
            else:
                shares_est = paid_up_capital / 100 if paid_up_capital else 0
                if shares_est > 0:
                    eps = (net_profit * factor) / shares_est

            annualized_net_profit = net_profit * factor
            annualized_revenue = revenue * factor

            # --- DERIVED RATIOS ---

            shares_outstanding = paid_up_capital / 100 if paid_up_capital else 0
            market_cap = shares_outstanding * market_price

            pe_ratio = 0.0
            if eps > 0:
                pe_ratio = market_price / eps

            bvps = 0.0
            if shares_outstanding > 0:
                bvps = total_equity / shares_outstanding
            
            pbv = 0.0
            if bvps > 0:
                pbv = market_price / bvps

            ps_ratio = 0.0
            if annualized_revenue > 0:
                ps_ratio = market_cap / annualized_revenue

            roa = 0.0
            if total_assets > 0:
                roa = (annualized_net_profit / total_assets) * 100 

            roe = 0.0
            if total_equity > 0:
                roe = (annualized_net_profit / total_equity) * 100 
                
            debt_to_equity = 0.0
            if total_equity > 0:
                debt_to_equity = total_debt / total_equity

            peg_ratio = 0.0
            
            # Get Previous Year EPS for Growth
            try:
                prev_report = None
                if is_quarterly:
                     prev_report = FinancialReport.objects.filter(
                         ticker=ticker, 
                         fiscal_year__lt=report.fiscal_year, 
                         quarter=quarter_val
                     ).order_by('-fiscal_year').first()
                else:
                    prev_report = FinancialReport.objects.filter(ticker=ticker, report_type='ANNUAL', fiscal_year__lt=report.fiscal_year).first()
                
                yoy_growth = 0.0
                if prev_report and prev_report.eps:
                    prev_eps = safe_float(prev_report.eps)
                    if prev_eps > 0:
                        yoy_growth = ((eps - prev_eps) / prev_eps) * 100
                        
                if yoy_growth > 0 and pe_ratio > 0:
                    peg_ratio = pe_ratio / yoy_growth
            except Exception as e:
                # Ignore previous year lookup failures
                yoy_growth = 0.0

            # 9. Dividend Metrics
            dividend_yield = 0.0
            payout_ratio = 0.0
            
            latest_dividend = Dividend.objects.filter(ticker=ticker).order_by('-fiscal_year').first()
            if latest_dividend and latest_dividend.cash_percent:
                dps = safe_float(latest_dividend.cash_percent)
                
                if market_price > 0:
                    dividend_yield = (dps / market_price) * 100
                
                if eps > 0:
                    payout_ratio = (dps / eps) * 100

            # --- UPDATE DATABASE ---
            fund_obj, created = StockFundamental.objects.update_or_create(
                ticker=ticker,
                defaults={
                    'company_name': company.name,
                    'sector': company.sector,
                    
                    'market_cap': market_cap,
                    'paid_up_capital': paid_up_capital,
                    'shares_outstanding': shares_outstanding,
                    'public_shares': shares_outstanding * 0.49, 
                    
                    'eps': eps,
                    'pe_ratio': pe_ratio,
                    'book_value': bvps,
                    'price_to_book': pbv, 
                    'price_to_sales': ps_ratio,
                    'peg_ratio': peg_ratio,
                    'peg_ratio': peg_ratio,
                    
                    'ro_equity': roe,
                    'ro_assets': roa,
                    'debt_to_equity': debt_to_equity,
                    
                    'yoy_earnings_growth': yoy_growth,
                    'dividend_yield': dividend_yield,
                    'dividend_payout_ratio': payout_ratio,
                }
            )
            
            serializer = StockFundamentalSerializer(fund_obj)
            return Response(serializer.data)
            
        except Exception as e:
            import traceback
            traceback.print_exc()
            return Response({'error': str(e)}, status=500)

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
        Return accumulation flows.
        Uses Top 15 Broker Concentration (Holders) to determine Net Accumulation (Smart Money flow).
        """
        time_range = request.query_params.get('range', '1D')
        sector = request.query_params.get('sector', 'All')

        range_map = {
            '1D': 1, '1W': 7, '2W': 14, '1M': 30, '3M': 90, '6M': 180, '1Y': 365, '2Y': 730
        }
        days = range_map.get(time_range, 1) if time_range != 'ALL' else 36500

        from django.db import connections

        # Query Logic:
        # 1. Identify "Smart Money" = Top 15 Holders by Cumulative Net Quantity as of latest date.
        # 2. Iterate Floorsheet for Selected Time Range.
        # 3. Sum Net Flow of ONLY the "Smart Money" brokers.
        #    If Smart Money Buys -> Accumulation.
        #    If Smart Money Sells -> Distribution.
        
        query = f"""
        WITH ref_date AS (
            SELECT MAX(transaction_date) as max_date FROM daily_cumulative_accumulation
        ),
        ranked_holders AS (
            SELECT 
                symbol, entity_id, cumulative_net,
                ROW_NUMBER() OVER (PARTITION BY symbol ORDER BY cumulative_net DESC) as rank
            FROM daily_cumulative_accumulation, ref_date
            WHERE transaction_date = ref_date.max_date
            AND cumulative_net > 0 
        ),
        smart_money AS (
            SELECT symbol, entity_id as broker 
            FROM ranked_holders 
            WHERE rank <= 15 -- Top 15 Holders
        ),
        
        -- Floorsheet Aggregation for Period
        fs_target AS (
             SELECT (MAX(transaction_date) - INTERVAL '{days} days') as start_date FROM daily_floorsheet
        ),
        floorsheet_activity AS (
            SELECT 
                buyer_id as broker, symbol, transaction_quantity as buy_qty, 0 as sell_qty
            FROM daily_floorsheet, fs_target
            WHERE transaction_date > fs_target.start_date
            UNION ALL
            SELECT 
                seller_id as broker, symbol, 0 as buy_qty, transaction_quantity as sell_qty
            FROM daily_floorsheet, fs_target
            WHERE transaction_date > fs_target.start_date
        ),
        broker_net AS (
            SELECT 
                broker, symbol, (SUM(buy_qty) - SUM(sell_qty)) as net_flow,
                SUM(buy_qty) as total_buy,
                SUM(sell_qty) as total_sell
            FROM floorsheet_activity
            GROUP BY broker, symbol
            HAVING (SUM(buy_qty) - SUM(sell_qty)) != 0
        ),
        
        symbol_agg AS (
             SELECT 
                 bn.symbol,
                 -- Smart Money Net = Net Flow of Brokers defined in 'smart_money' CTE
                 SUM(CASE WHEN sm.broker IS NOT NULL THEN bn.net_flow ELSE 0 END) as smart_net_qty,
                 
                 -- Total Volume for Context (buy or sell side total)
                 SUM(bn.total_buy) as total_vol,
                 
                 -- Top Buyers/Sellers (Regardless of Smart Money status, for UI links)
                 ARRAY_AGG(bn.broker ORDER BY bn.net_flow DESC) FILTER (WHERE bn.net_flow > 0) as top_buyers,
                 ARRAY_AGG(bn.broker ORDER BY bn.net_flow ASC) FILTER (WHERE bn.net_flow < 0) as top_sellers
                 
             FROM broker_net bn
             -- Cast bn.broker to varchar to match sm.broker (entity_id is varchar)
             LEFT JOIN smart_money sm ON bn.symbol = sm.symbol AND CAST(bn.broker AS VARCHAR) = sm.broker
             GROUP BY bn.symbol
        )
        SELECT 
            sa.symbol, c."companyName" as name, c."sectorName" as sector,
            
            -- We just return smart_net_qty as net_qty. 
            -- Note: buy_qty and sell_qty in UI are just for visual magnitude?
            -- Lets derive them from smart_net_qty to be consistent with bar charts.
            
            CASE WHEN sa.smart_net_qty > 0 THEN sa.smart_net_qty ELSE 0 END as buy_qty,
            CASE WHEN sa.smart_net_qty < 0 THEN ABS(sa.smart_net_qty) ELSE 0 END as sell_qty,
            sa.smart_net_qty as net_qty,
            
            -- Accumulation Ratio: Smart Money Net / Total Volume of Trade
            -- Use ABS(Smart Net) just to show magnitude of Smart Money participation
            CASE WHEN sa.total_vol > 0 
               THEN (ABS(sa.smart_net_qty) / sa.total_vol) * 100 
               ELSE 0 END as accumulation_ratio,
            
            COALESCE(sa.top_buyers[1:3], ARRAY[]::integer[]) as top_buyers,
            COALESCE(sa.top_sellers[1:3], ARRAY[]::integer[]) as top_sellers,
            COALESCE(dsp.close, 0) as close
        FROM symbol_agg sa
        INNER JOIN companies c ON sa.symbol = c.symbol
        LEFT JOIN (
            SELECT DISTINCT ON (symbol) symbol, close 
            FROM daily_stock_price 
            ORDER BY symbol, transaction_date DESC
        ) dsp ON sa.symbol = dsp.symbol
        WHERE c."instrumentType" NOT IN ('Mutual Funds', 'Non-Convertible Debentures')
        {"" if sector.lower() == 'all' else f"AND c.\"sectorName\" = '{sector}'"}
        ORDER BY net_qty DESC;
        """

        with connections['default'].cursor() as cursor:
            cursor.execute(query)
            columns = [col[0] for col in cursor.description]
            results = [dict(zip(columns, row)) for row in cursor.fetchall()]

        return Response(results)

    @action(detail=False, methods=['get'], permission_classes=[AllowAny])
    def aggressive(self, request):
        """
        Identify aggressive institutional activity relative to 20-Day average volume.
        Uses accurate daily_floorsheet aggregation for flows.
        """
        time_range = request.query_params.get('range', '1W')
        sector = request.query_params.get('sector', 'All')
        
        range_map = {
            '1D': 1, '1W': 7, '2W': 14, '1M': 30, '3M': 90, '6M': 180, '1Y': 365, '2Y': 730
        }
        days = range_map.get(time_range, 7)
        
        from django.db import connections
        
        query = f"""
        WITH ref_date AS (
            SELECT MAX(transaction_date) as current_date FROM daily_floorsheet
        ),
        target_range AS (
            SELECT 
                current_date - INTERVAL '{days} days' as start_date
            FROM ref_date
        ),
        floorsheet_activity AS (
            SELECT 
                buyer_id as broker, symbol, transaction_quantity as buy_qty, 0 as sell_qty
            FROM daily_floorsheet, target_range
            WHERE transaction_date > target_range.start_date
            UNION ALL
            SELECT 
                seller_id as broker, symbol, 0 as buy_qty, transaction_quantity as sell_qty
            FROM daily_floorsheet, target_range
            WHERE transaction_date > target_range.start_date
        ),
        broker_symbol_summary AS (
            SELECT 
                broker, symbol,
                (SUM(buy_qty) - SUM(sell_qty)) as net_flow
            FROM floorsheet_activity
            GROUP BY broker, symbol
        ),
        symbol_accumulation AS (
            SELECT 
                symbol,
                SUM(CASE WHEN net_flow > 0 THEN net_flow ELSE 0 END) as institutional_buy,
                SUM(CASE WHEN net_flow < 0 THEN ABS(net_flow) ELSE 0 END) as institutional_sell,
                ARRAY_AGG(broker ORDER BY net_flow DESC) FILTER (WHERE net_flow > 0) as top_buyers,
                ARRAY_AGG(broker ORDER BY net_flow ASC) FILTER (WHERE net_flow < 0) as top_sellers
            FROM broker_symbol_summary
            GROUP BY symbol
        ),
        avg_volume_cte AS (
            SELECT 
                symbol,
                AVG(volume) OVER (PARTITION BY symbol ORDER BY transaction_date DESC ROWS BETWEEN CURRENT ROW AND 19 FOLLOWING) as avg_vol_20d,
                close,
                transaction_date,
                ROW_NUMBER() OVER (PARTITION BY symbol ORDER BY transaction_date DESC) as rn
            FROM daily_stock_price
            WHERE transaction_date <= (SELECT current_date FROM ref_date)
        ),
        latest_avg_vol AS (
            SELECT symbol, avg_vol_20d, close FROM avg_volume_cte WHERE rn = 1
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
                COALESCE(ss.top_buyers[1:3]::text[], ARRAY[]::text[]) as producers,
                COALESCE(ss.top_sellers[1:3]::text[], ARRAY[]::text[]) as offloaders
            FROM symbol_accumulation ss
            INNER JOIN companies c ON ss.symbol = c.symbol
            INNER JOIN latest_avg_vol lav ON ss.symbol = lav.symbol
            WHERE c."instrumentType" NOT IN ('Mutual Funds', 'Non-Convertible Debentures')
            {"" if sector.lower() == 'all' else f"AND c.\\\"sectorName\\\" = '{sector}'"}
        )
        SELECT * FROM intensity_cte
        WHERE ABS(intensity) > 5 -- At least 5% of daily volume
        ORDER BY ABS(intensity) DESC;
        """
        
        with connections['default'].cursor() as cursor:
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
            td.symbol,
            td.entity_id as broker,
            td.cumulative_net,
            ROUND(td.cumulative_buy_amount / NULLIF(td.cumulative_buy, 0), 2) as wac,
            
            CASE WHEN td.net_5d > 0 THEN 'Increasing' WHEN td.net_5d < 0 THEN 'Decreasing' ELSE 'Stable' END AS trend_5d,
            ROUND(ABS(COALESCE(td.net_5d, 0)) / NULLIF(ABS(td.cumulative_net), 1) * 100, 2) AS change_5d,
            
            CASE WHEN td.net_10d > 0 THEN 'Increasing' WHEN td.net_10d < 0 THEN 'Decreasing' ELSE 'Stable' END AS trend_10d,
            ROUND(ABS(COALESCE(td.net_10d, 0)) / NULLIF(ABS(td.cumulative_net), 1) * 100, 2) AS change_10d,
            
            CASE WHEN td.net_20d > 0 THEN 'Increasing' WHEN td.net_20d < 0 THEN 'Decreasing' ELSE 'Stable' END AS trend_20d,
            ROUND(ABS(COALESCE(td.net_20d, 0)) / NULLIF(ABS(td.cumulative_net), 1) * 100, 2) AS change_20d,
            
            CASE WHEN td.net_50d > 0 THEN 'Increasing' WHEN td.net_50d < 0 THEN 'Decreasing' ELSE 'Stable' END AS trend_50d,
            ROUND(ABS(COALESCE(td.net_50d, 0)) / NULLIF(ABS(td.cumulative_net), 1) * 100, 2) AS change_50d,
            
            dsp.close as ltp
        FROM trend_data td
        LEFT JOIN (
            SELECT DISTINCT ON (symbol) symbol, close 
            FROM daily_stock_price ORDER BY symbol, transaction_date DESC
        ) dsp ON td.symbol = dsp.symbol
        WHERE td.transaction_date = td.latest_date
        AND td.cumulative_net > 250000
        ORDER BY td.cumulative_net DESC;
        """
        
        with connections['default'].cursor() as cursor:
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
        with connections['default'].cursor() as cursor:
            cursor.execute(query)
            results = [row[0] for row in cursor.fetchall() if row[0]]
        # Sort as integers for numeric ordering
        return Response(sorted(results, key=lambda x: int(x) if x.isdigit() else 999))

    @action(detail=False, methods=['get'], permission_classes=[AllowAny])
    def accumulation_symbols(self, request):
        """Return unique symbols from accumulation data."""
        from django.db import connections
        query = "SELECT DISTINCT symbol FROM daily_cumulative_accumulation"
        with connections['default'].cursor() as cursor:
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

    @action(detail=False, methods=['get'], permission_classes=[AllowAny])
    def broker_favorites(self, request):
        """
        Calculate net accumulation for a specific broker across multiple time periods.
        Uses daily_floorsheet aggregation for accuracy.
        """
        from django.db import connections
        broker = request.query_params.get('broker')
        
        if not broker:
            return Response({'error': 'broker ID is required'}, status=400)

        # 1D, 2D, 3D, 1W, 1M, 3M, 6M, 1Y
        # We need conditional sums based on Date > (Now - Interval)
        
        query = """
        WITH ref_date AS (
            SELECT MAX(transaction_date) as current_date FROM daily_floorsheet
        ),
        broker_activity AS (
            SELECT 
                symbol, transaction_date, 
                transaction_quantity as net_qty, -- Positive for Buy
                (transaction_quantity * transaction_rate) as net_amt
            FROM daily_floorsheet
            WHERE buyer_id = %s
            
            UNION ALL
            
            SELECT 
                symbol, transaction_date, 
                -transaction_quantity as net_qty, -- Negative for Sell
                -(transaction_quantity * transaction_rate) as net_amt
            FROM daily_floorsheet
            WHERE seller_id = %s
        ),
        aggregated_stats AS (
            SELECT 
                ba.symbol,
                SUM(ba.net_qty) as total_net,
                -- WAC only makes sense for current holding, which we can't easily get from just flows history without initial state.
                -- Converting WAC to "Avg Price of Net Flow" or just omitting if complex.
                -- Old query used cumulative_buy_amount / cumulative_buy.
                -- We can calc "Avg Buy Price" from activity?
                -- Let's stick to flows.
                
                SUM(CASE WHEN ba.transaction_date > (rd.current_date - INTERVAL '1 day') THEN ba.net_qty ELSE 0 END) as flow_1d,
                SUM(CASE WHEN ba.transaction_date > (rd.current_date - INTERVAL '2 days') THEN ba.net_qty ELSE 0 END) as flow_2d,
                SUM(CASE WHEN ba.transaction_date > (rd.current_date - INTERVAL '3 days') THEN ba.net_qty ELSE 0 END) as flow_3d,
                SUM(CASE WHEN ba.transaction_date > (rd.current_date - INTERVAL '7 days') THEN ba.net_qty ELSE 0 END) as flow_1w,
                SUM(CASE WHEN ba.transaction_date > (rd.current_date - INTERVAL '30 days') THEN ba.net_qty ELSE 0 END) as flow_1m,
                SUM(CASE WHEN ba.transaction_date > (rd.current_date - INTERVAL '90 days') THEN ba.net_qty ELSE 0 END) as flow_3m,
                SUM(CASE WHEN ba.transaction_date > (rd.current_date - INTERVAL '180 days') THEN ba.net_qty ELSE 0 END) as flow_6m,
                SUM(CASE WHEN ba.transaction_date > (rd.current_date - INTERVAL '365 days') THEN ba.net_qty ELSE 0 END) as flow_1y,
                
                -- Calculate "Current Net" (Proxied by Total History from Floorsheet? Or use Cumulative table for that?)
                -- Cumulative Accumulation table IS the "Current Net".
                -- So we can join with `daily_cumulative_accumulation` for "Current Net" & "WAC".
                -- But Flows come from floorsheet.
                MAX(ba.transaction_date) as last_trade_date
            FROM broker_activity ba, ref_date rd
            GROUP BY ba.symbol
        )
        SELECT 
            ast.symbol,
            c."companyName" as name,
            COALESCE(ca.cumulative_net, 0) as current_net,
            CASE WHEN ca.cumulative_buy > 0 THEN ROUND(ca.cumulative_buy_amount / ca.cumulative_buy, 2) ELSE 0 END as wac,
            
            ast.flow_1d as change_1d,
            ast.flow_2d as change_2d,
            ast.flow_3d as change_3d,
            ast.flow_1w as change_1w,
            ast.flow_1m as change_1m,
            ast.flow_3m as change_3m,
            ast.flow_6m as change_6m,
            ast.flow_1y as change_1y,
            ast.total_net as change_all
        FROM aggregated_stats ast
        INNER JOIN companies c ON ast.symbol = c.symbol
        -- Join latest cumulative for current position
        LEFT JOIN LATERAL (
            SELECT cumulative_net, cumulative_buy, cumulative_buy_amount 
            FROM daily_cumulative_accumulation 
            WHERE symbol = ast.symbol AND entity_id = %s
            ORDER BY transaction_date DESC LIMIT 1
        ) ca ON true
        WHERE c."instrumentType" NOT IN ('Mutual Funds', 'Non-Convertible Debentures')
        ORDER BY ast.flow_1m DESC; 
        -- Ordering by 1M flow as default or what? Old was by cumulative_net.
        -- Let's order by current_net like before.
        """
        
        # Modify ORDER BY to match old behavior if needed, or stick to accumulation focus.
        # User goal is "Broker Favorites" -> usually means what they hold most.
        # So ORDER BY current_net DESC is better.
        
        query = query.replace("ORDER BY ast.flow_1m DESC;", "ORDER BY current_net DESC;")

        with connections['default'].cursor() as cursor:
            cursor.execute(query, [broker, broker, broker])
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
        
        with connections['default'].cursor() as cursor:
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
        
        with connections['default'].cursor() as cursor:
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
            # Fix: use 'sector' field name not 'sectorName' (which is db_column)
            companies = companies.filter(sector=sector)
        
        # Exclude funds (Commented out as instrumentType missing in model)
        # companies = companies.exclude(instrumentType__in=['Mutual Funds', 'Non-Convertible Debentures'])
        
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

        # Fetch latest signals for these tickers
        signals_map = {}
        if tickers:
            from .models import StrategySignal
            from django.db.models import Max
            
            # Find the latest signal date for each ticker
            latest_dates = StrategySignal.objects.filter(
                symbol__in=tickers
            ).values('symbol').annotate(max_date=Max('date'))
            
            latest_date_map = {item['symbol']: item['max_date'] for item in latest_dates}
            
            # Now fetch all signals for that latest date per ticker
            # This is a bit tricky to do in one query efficiently for many tickers with different dates
            # But we can filter by symbol + date
            
            # Optimization: If most signals are from "today" or "yesterday", we could just fetch all signals for tickers in the last X days and filter in python.
            # But strict "latest available" per ticker is requested.
            
            for ticker, latest_date in latest_date_map.items():
                if not latest_date:
                    continue
                    
                signals = StrategySignal.objects.filter(
                    symbol=ticker,
                    date=latest_date
                ).select_related('strategy')
                
                signal_list = []
                for s in signals:
                    signal_list.append({
                        'signal': s.signal,
                        'strategy_name': s.strategy.name,
                        'strategy_description': s.strategy.description
                    })
                
                # Determine aggregate signal (simplified logic: if any BUY -> BUY, else if any SELL -> SELL, else HOLD)
                # Or just pass the list and let frontend decide/show summary.
                # Let's provide a summary based on counts.
                buy_count = sum(1 for s in signal_list if 'BUY' in s['signal'])
                sell_count = sum(1 for s in signal_list if 'SELL' in s['signal'])
                
                summary = 'NEUTRAL'
                if buy_count > sell_count:
                    summary = 'BUY'
                elif sell_count > buy_count:
                    summary = 'SELL'
                elif buy_count > 0 and buy_count == sell_count:
                    summary = 'MIXED'
                elif any('HOLD' in s['signal'] for s in signal_list):
                    summary = 'HOLD'
                    
                signals_map[ticker] = {
                    'latest_date': latest_date,
                    'summary': summary,
                    'details': signal_list
                }

        data = []
        for item in queryset:
            # Attach calculated fields for the serializer
            # Note: Serializer expects model instance or dict. But since we are using 'list' we can return dicts.
            # It's better to serialize first then add extra data.
            serializer = self.get_serializer(item)
            item_data = serializer.data
            
            if item.ticker in rsi_data:
                item_data['rsi'] = rsi_data[item.ticker]
            if item.ticker in roc_data:
                item_data['roc'] = roc_data[item.ticker]
                
            # Add signals data
            if item.ticker in signals_map:
                item_data['signals'] = signals_map[item.ticker]
            else:
                item_data['signals'] = None
                
            data.append(item_data)
            
        return Response(data)

class NotificationViewSet(viewsets.ModelViewSet):
    serializer_class = NotificationSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Notification.objects.filter(user=self.request.user)

    @action(detail=False, methods=['POST'])
    def mark_all_as_read(self, request):
        Notification.objects.filter(user=request.user, read=False).update(read=True)
        return Response({'status': 'messages marked as read'})

    @action(detail=True, methods=['POST'])
    def mark_as_read(self, request, pk=None):
        notification = self.get_object()
        notification.read = True
        notification.save()
        return Response({'status': 'notification marked as read'})

    @action(detail=False, methods=['POST'])
    def trigger_check(self, request):
        count = check_market_alerts(request.user)
        return Response({'status': 'check complete', 'notifications_created': count})

def check_market_alerts(user):
    """
    Check portfolio and watchlist items against current prices to generate notifications.
    """
    from django.db.models import Max
    notifications_created = 0
    
    # 1. Get latest prices for all active tickers
    portfolio_tickers = PortfolioItem.objects.filter(user=user).values_list('ticker', flat=True)
    watchlist_tickers = WatchlistItem.objects.filter(user=user).values_list('ticker', flat=True)
    all_tickers = set(list(portfolio_tickers) + list(watchlist_tickers))
    
    if not all_tickers:
        return 0

    # Fetch latest prices for these tickers
    latest_date_agg = DailyStockPrice.objects.aggregate(Max('date'))
    latest_date = latest_date_agg['date__max']
    if not latest_date:
        return 0
        
    prices = DailyStockPrice.objects.filter(date=latest_date, ticker__in=all_tickers)
    price_map = {p.ticker: float(p.close) for p in prices}

    # 2. Check Portfolio Items
    portfolio_items = PortfolioItem.objects.filter(user=user)
    for item in portfolio_items:
        current_price = price_map.get(item.ticker)
        if current_price is None: continue
        
        # Stop Loss Check
        if item.stop_loss_price and current_price <= float(item.stop_loss_price):
            title = f"❗ Stop Loss Hit: {item.ticker}"
            message = f"{item.ticker} has dropped to Rs. {current_price}, hitting your stop loss of Rs. {item.stop_loss_price}. Consider exiting to protect capital."
            
            # Simple daily deduplication
            recent = Notification.objects.filter(
                user=user, ticker=item.ticker, title=title, 
                created_at__date=latest_date
            ).exists()
            
            if not recent:
                Notification.objects.create(
                    user=user, ticker=item.ticker, title=title, 
                    message=message, type=Notification.NotificationType.STOP_LOSS
                )
                notifications_created += 1

        # Target Price Check
        for i, target in enumerate([item.target_price, item.target_price_2, item.target_price_3], 1):
            if target and current_price >= float(target):
                title = f"🎯 Target {i} Reached: {item.ticker}"
                message = f"{item.ticker} has reached Rs. {current_price}, hitting your target price of Rs. {target}. Time to lock in profits!"
                
                recent = Notification.objects.filter(
                    user=user, ticker=item.ticker, title=title,
                    created_at__date=latest_date
                ).exists()
                
                if not recent:
                    Notification.objects.create(
                        user=user, ticker=item.ticker, title=title,
                        message=message, type=Notification.NotificationType.PRICE_ALERT
                    )
                    notifications_created += 1

    # 3. Check Watchlist Items
    watchlist_items = WatchlistItem.objects.filter(user=user)
    for item in watchlist_items:
        current_price = price_map.get(item.ticker)
        if current_price is None: continue
        
        if item.target_price and current_price <= float(item.target_price):
            title = f"🚀 Entry Signal: {item.ticker}"
            message = f"{item.ticker} is now at Rs. {current_price}, hitting your strategic entry target of Rs. {item.target_price}. Ready for promotion to portfolio?"
            
            recent = Notification.objects.filter(
                user=user, ticker=item.ticker, title=title,
                created_at__date=latest_date
            ).exists()
            
            if not recent:
                Notification.objects.create(
                    user=user, ticker=item.ticker, title=title,
                    message=message, type=Notification.NotificationType.PRICE_ALERT
                )
                notifications_created += 1
                
    return notifications_created

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
    
    with connections['default'].cursor() as cursor:
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
            queryset = queryset.filter(symbol=symbol)
        
        if broker:
            # Filter where broker is either buyer or seller
            from django.db.models import Q
            queryset = queryset.filter(Q(buyer_id=broker) | Q(seller_id=broker))

        # Order by date descending
        queryset = queryset.order_by('-transaction_date')[:limit]
        
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
    
    with connections['default'].cursor() as cursor:
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
        'broker_analysis': 'Update Broker Data & Accumulation',
        'sync_floorsheet': 'Sync Floorsheet Data',
        'update_indexes': 'Update DB Indexes',
        'generate_signals': 'Generate Strategy Signals',
        'update_indicators': 'Update Technical Indicators',
        'optimize_strategies': 'Global Strategy Optimization',
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


    @action(detail=False, methods=['post'])
    def abort_log(self, request):
        """
        Mark a log entry as aborted.
        """
        from .models import DataUploadLog
        
        log_id = request.data.get('log_id')
        if not log_id:
            return Response({'error': 'log_id is required'}, status=400)
        
        try:
            log_entry = DataUploadLog.objects.get(id=log_id)
            log_entry.status = 'ABORTED'
            log_entry.error_message = 'Process was manually stopped by user'
            log_entry.save()
            return Response({'message': 'Log marked as aborted'})
        except DataUploadLog.DoesNotExist:
            return Response({'error': 'Log not found'}, status=404)

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
    
    @action(detail=False, methods=['post'])
    def trigger_signals(self, request):
        """
        Triggers the signal generation management command in a background thread.
        """
        from django.core.management import call_command
        import threading

        def run_signals():
            try:
                # We can pass specific symbol if requested, but default to all
                symbol = request.data.get('symbol')
                if symbol:
                    call_command('generate_signals', symbol=symbol)
                else:
                    call_command('generate_signals')
            except Exception as e:
                print(f"ERROR: Signal generation failed: {e}")

        # Run in thread to prevent blocking the HTTP response
        thread = threading.Thread(target=run_signals)
        thread.daemon = True
        thread.start()

        return Response({
            'status': 'success',
            'message': 'Signal generation process started in the background.'
        })

    @action(detail=False, methods=['get'])
    def trigger_indicators_stream(self, request):
        """
        Streams logs from technical indicator update process.
        """
        import sys
        from django.conf import settings
        from .models import DataUploadLog

        # Create log entry
        log_entry = DataUploadLog.objects.create(
            file_name='Technical Indicators Update',
            upload_type='INDICATORS',
            status='PENDING'
        )

        def event_stream():
            # Get the base directory where manage.py is located
            base_dir = settings.BASE_DIR
            manage_py = os.path.join(base_dir, 'manage.py')
            
            cmd = [sys.executable, manage_py, 'update_technical_indicators']

            process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                bufsize=1,
                universal_newlines=True,
                cwd=base_dir
            )

            yield f"data: {{\"type\": \"init\", \"log_id\": {log_entry.id}}}\n\n"
            yield "data: {\"type\": \"status\", \"message\": \"Initializing indicator update...\"}\n\n"
            
            for line in process.stdout:
                if line.strip():
                    # Escape quotes in the message
                    escaped_message = line.strip().replace('"', '\\"')
                    yield f"data: {{\"type\": \"log\", \"message\": \"{escaped_message}\"}}\n\n"

            process.wait()
            if process.returncode == 0:
                log_entry.status = 'SUCCESS'
                log_entry.save()
                yield "data: {\"type\": \"status\", \"message\": \"Technical indicators updated successfully.\"}\n\n"
                yield "data: {\"type\": \"done\"}\n\n"
            else:
                log_entry.status = 'FAILED'
                log_entry.error_message = f"Process exited with code {process.returncode}"
                log_entry.save()
                yield f"data: {{\"type\": \"error\", \"message\": \"Process exited with code {process.returncode}\"}}\n\n"

        response = StreamingResponse(event_stream(), content_type='text/event-stream')
        response['Cache-Control'] = 'no-cache'
        response['X-Accel-Buffering'] = 'no'  # Disable buffering for nginx
        return response

    @action(detail=False, methods=['get'])
    def generate_signals_stream(self, request):
        """
        Streams logs from signal generation process.
        """
        import sys
        from django.conf import settings
        from .models import DataUploadLog

        # Create log entry
        log_entry = DataUploadLog.objects.create(
            file_name='Signal Generation',
            upload_type='SIGNALS',
            status='PENDING'
        )

        def event_stream():
            symbol = request.query_params.get('symbol')
            
            # Get the base directory where manage.py is located
            base_dir = settings.BASE_DIR
            manage_py = os.path.join(base_dir, 'manage.py')
            
            cmd = [sys.executable, manage_py, 'generate_signals']
            if symbol:
                cmd.extend(['--symbol', symbol])

            process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                bufsize=1,
                universal_newlines=True,
                cwd=base_dir
            )

            yield f"data: {{\"type\": \"init\", \"log_id\": {log_entry.id}}}\n\n"
            yield "data: {\"type\": \"status\", \"message\": \"Initializing boot process...\"}\n\n"
            
            for line in process.stdout:
                if line.strip():
                    # Escape quotes in the message
                    escaped_message = line.strip().replace('"', '\\"')
                    yield f"data: {{\"type\": \"log\", \"message\": \"{escaped_message}\"}}\n\n"

            process.wait()
            if process.returncode == 0:
                log_entry.status = 'SUCCESS'
                log_entry.save()
                yield "data: {\"type\": \"status\", \"message\": \"Signal generation completed successfully.\"}\n\n"
                yield "data: {\"type\": \"done\"}\n\n"
            else:
                log_entry.status = 'FAILED'
                log_entry.error_message = f"Process exited with code {process.returncode}"
                log_entry.save()
                yield f"data: {{\"type\": \"error\", \"message\": \"Process exited with code {process.returncode}\"}}\n\n"

        response = StreamingResponse(event_stream(), content_type='text/event-stream')
        response['Cache-Control'] = 'no-cache'
        response['X-Accel-Buffering'] = 'no'  # Disable buffering for nginx
        return response

    @action(detail=False, methods=['get'])
    def optimize_strategies_stream(self, request):
        """
        Streams logs from strategy optimization process.
        """
        import sys
        import subprocess
        from django.conf import settings
        from .models import DataUploadLog

        # Create log entry
        log_entry = DataUploadLog.objects.create(
            file_name='Strategy Training',
            upload_type='OPTIMIZATION',
            status='PENDING'
        )

        def event_stream():
            all_symbols = request.query_params.get('all_symbols') == 'true'
            trials = request.query_params.get('trials', '30')
            
            # Get the base directory where manage.py is located
            base_dir = settings.BASE_DIR
            manage_py = os.path.join(base_dir, 'manage.py')
            
            cmd = [sys.executable, manage_py, 'optimize_strategies', '--trials', trials]
            if all_symbols:
                cmd.append('--all-symbols')

            process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                bufsize=1,
                universal_newlines=True,
                cwd=base_dir
            )

            yield f"data: {{\"type\": \"init\", \"log_id\": {log_entry.id}}}\n\n"
            yield "data: {\"type\": \"status\", \"message\": \"Initializing optimization engine...\"}\n\n"
            
            for line in process.stdout:
                if line.strip():
                    # Escape quotes in the message
                    escaped_message = line.strip().replace('"', '\\"')
                    yield f"data: {{\"type\": \"log\", \"message\": \"{escaped_message}\"}}\n\n"

            process.wait()
            if process.returncode == 0:
                log_entry.status = 'SUCCESS'
                log_entry.save()
                yield "data: {\"type\": \"status\", \"message\": \"Strategy optimization completed successfully.\"}\n\n"
                yield "data: {\"type\": \"done\"}\n\n"
            else:
                log_entry.status = 'FAILED'
                log_entry.error_message = f"Process exited with code {process.returncode}"
                log_entry.save()
                yield f"data: {{\"type\": \"error\", \"message\": \"Process exited with code {process.returncode}\"}}\n\n"

        response = StreamingResponse(event_stream(), content_type='text/event-stream')
        response['Cache-Control'] = 'no-cache'
        response['X-Accel-Buffering'] = 'no'  # Disable buffering for nginx
        return response

    @action(detail=False, methods=['get'])
    def update_broker_analysis_stream(self, request):
        """
        Streams logs from broker analysis update process.
        """
        import sys
        import subprocess
        import os
        from django.conf import settings
        from .models import DataUploadLog

        # Create log entry
        log_entry = DataUploadLog.objects.create(
            file_name='Broker Data & Accumulation Update',
            upload_type='BROKER_ANALYSIS',
            status='PENDING'
        )

        def event_stream():
            # Get the base directory where manage.py is located
            base_dir = settings.BASE_DIR
            manage_py = os.path.join(base_dir, 'manage.py')
            
            cmd = [sys.executable, manage_py, 'update_broker_analysis']

            process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                bufsize=1,
                universal_newlines=True,
                cwd=base_dir
            )

            yield f"data: {{\"type\": \"init\", \"log_id\": {log_entry.id}}}\n\n"
            yield "data: {\"type\": \"status\", \"message\": \"Initializing broker analysis...\"}\n\n"
            
            for line in process.stdout:
                if line.strip():
                    # Escape quotes in the message
                    escaped_message = line.strip().replace('"', '\\"')
                    yield f"data: {{\"type\": \"log\", \"message\": \"{escaped_message}\"}}\n\n"

            process.wait()
            if process.returncode == 0:
                log_entry.status = 'SUCCESS'
                log_entry.save()
                yield "data: {\"type\": \"status\", \"message\": \"Broker analysis updated successfully.\"}\n\n"
                yield "data: {\"type\": \"done\"}\n\n"
            else:
                log_entry.status = 'FAILED'
                log_entry.error_message = f"Process exited with code {process.returncode}"
                log_entry.save()
                yield f"data: {{\"type\": \"error\", \"message\": \"Process exited with code {process.returncode}\"}}\n\n"

        response = StreamingResponse(event_stream(), content_type='text/event-stream')
        response['Cache-Control'] = 'no-cache'
        response['X-Accel-Buffering'] = 'no'  # Disable buffering for nginx
        return response



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


class SignalPagination(PageNumberPagination):
    page_size = 100
    page_size_query_param = 'page_size'
    max_page_size = 1000

class StrategySignalViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = StrategySignal.objects.all().order_by('-date', 'strategy__name')
    serializer_class = StrategySignalSerializer
    pagination_class = SignalPagination
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields = ['symbol', 'date', 'strategy', 'signal']
    search_fields = ['symbol', 'strategy__name']

    @action(detail=False, methods=['get'])
    def tracking(self, request):
        """
        Returns signal tracking data showing BUY-SELL pairs.
        Active positions: BUY signals without corresponding SELL signals
        Closed positions: Matched BUY-SELL pairs with return calculations
        
        Excludes sector indices and non-tradeable symbols as per NEPSE rules.
        """
        from datetime import datetime, timedelta
        from collections import defaultdict
        
        # List of sector indices and non-tradeable symbols to exclude
        EXCLUDED_SYMBOLS = [
            'NEPSE', 'SENSITIVE', 'FLOAT'
        ]
        
        # Get all unique sector names from the companies table
        # These are sector aggregates, not individual tradeable stocks
        from stocks.models import Company
        sector_names = Company.objects.values_list('sector', flat=True).distinct()
        
        # Combine excluded symbols with sector names
        all_excluded = list(EXCLUDED_SYMBOLS) + list(sector_names)
        
        # Fetch all signals ordered by date, excluding sector indices and sector aggregates
        signals = StrategySignal.objects.exclude(
            symbol__in=all_excluded
        ).exclude(
            symbol__icontains='INDEX'
        ).order_by('symbol', 'date')
        
        # Group signals by symbol AND strategy
        symbol_strategy_signals = defaultdict(list)
        for signal in signals:
            key = (signal.symbol, signal.strategy.id)
            symbol_strategy_signals[key].append(signal)
        
        active_positions = []
        closed_positions = []
        
        # Process each symbol-strategy combination's signals
        for (symbol, strategy_id), sig_list in symbol_strategy_signals.items():
            # Track unmatched BUY signals for this specific strategy
            open_buys = []
            
            for signal in sig_list:
                if signal.signal == 'BUY':
                    # Add to open buys
                    open_buys.append(signal)
                elif signal.signal == 'SELL' and open_buys:
                    # Match with the oldest BUY signal from SAME strategy (FIFO)
                    # But only if at least 3 days have passed (NEPSE rule)
                    buy_signal = open_buys[0]
                    days_between = (signal.date - buy_signal.date).days
                    
                    if days_between >= 3:
                        # Valid match - remove from open buys
                        buy_signal = open_buys.pop(0)
                        
                        # Calculate metrics
                        buy_price = float(buy_signal.last_close) if buy_signal.last_close else 0
                        sell_price = float(signal.last_close) if signal.last_close else 0
                        
                        return_pct = 0
                        if buy_price > 0:
                            return_pct = ((sell_price - buy_price) / buy_price) * 100
                        
                        closed_positions.append({
                            'symbol': symbol,
                            'buy_signal': StrategySignalSerializer(buy_signal).data,
                            'sell_signal': StrategySignalSerializer(signal).data,
                            'buy_date': buy_signal.date.isoformat(),
                            'sell_date': signal.date.isoformat(),
                            'buy_price': str(buy_price),
                            'sell_price': str(sell_price),
                            'return_pct': round(return_pct, 2),
                            'days_held': days_between,
                            'buy_strategy': buy_signal.strategy.name,
                            'sell_strategy': signal.strategy.name  # Will always match buy_strategy now
                        })
                    # If less than 3 days, keep the BUY signal as open and ignore this SELL
            
            # Remaining open buys are active positions
            for buy_signal in open_buys:
                buy_price = float(buy_signal.last_close) if buy_signal.last_close else 0
                days_held = (datetime.now().date() - buy_signal.date).days
                
                active_positions.append({
                    'symbol': symbol,
                    'buy_signal': StrategySignalSerializer(buy_signal).data,
                    'buy_date': buy_signal.date.isoformat(),
                    'buy_price': str(buy_price),
                    'days_held': days_held,
                    'strategies': [buy_signal.strategy.name]  # Single strategy now
                })
        
        # Group active positions by symbol, date, and price
        # This consolidates multiple strategies that triggered the same BUY signal
        grouped_active = {}
        for pos in active_positions:
            key = (pos['symbol'], pos['buy_date'], pos['buy_price'])
            if key in grouped_active:
                # Add strategy to existing group
                grouped_active[key]['strategies'].extend(pos['strategies'])
            else:
                # Create new group
                grouped_active[key] = pos
        
        # Convert back to list
        active_positions = list(grouped_active.values())
        
        # Sort by date (most recent first)
        active_positions.sort(key=lambda x: x['buy_date'], reverse=True)
        closed_positions.sort(key=lambda x: x['sell_date'], reverse=True)
        
        return Response({
            'active_positions': active_positions,
            'closed_positions': closed_positions,
            'summary': {
                'total_active': len(active_positions),
                'total_closed': len(closed_positions),
                'avg_return': round(sum(p['return_pct'] for p in closed_positions) / len(closed_positions), 2) if closed_positions else 0,
                'avg_holding_period': round(sum(p['days_held'] for p in closed_positions) / len(closed_positions), 1) if closed_positions else 0
            }
        })

