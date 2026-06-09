from rest_framework import viewsets, filters
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend
from django.db.models import Sum, Max, Min, Q, Count, F, Avg
from ..models import DailyStockPrice, DailyFloorsheet, StockFundamental, Company, Dividend, FinancialReport
from ..serializers import (
    DailyStockPriceSerializer, DailyFloorsheetSerializer, StockFundamentalSerializer, 
    DividendSerializer, FinancialReportSerializer, CompanySerializer
)
from ..technical import get_technical_indicators
from .accumulation_mixin import AccumulationMixin
import datetime
import talib
import numpy as np
import pandas as pd
from django.db.models import Subquery, OuterRef

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
def health_check(request):
    """Simple health check endpoint for frontend and container health monitoring."""
    return Response({'status': 'online', 'timestamp': datetime.datetime.now()})

@api_view(['GET'])
@permission_classes([AllowAny])
def stock_history(request, ticker):
    data = DailyStockPrice.objects.filter(ticker=ticker).order_by('date')
    serializer = DailyStockPriceSerializer(data, many=True)
    return Response(serializer.data)


@api_view(['GET'])
@permission_classes([AllowAny])
def stock_summary(request):
    range_type = request.GET.get('range', 'daily') # daily, weekly, monthly
    
    # 1. Get Latest Date with substantial data (> 10 entries)
    latest_date_data = DailyStockPrice.objects.values('date').annotate(
        count=Count('ticker')
    ).filter(count__gt=10).order_by('-date').first()
    
    latest_date = latest_date_data['date'] if latest_date_data else None
    
    latest_date = latest_date_data['date'] if latest_date_data else None
    
    if not latest_date:
        return Response({})

    # Lightweight response for global header
    if request.GET.get('mode') == 'status':
        # Determine if market is "Active" (today is latest date)
        is_today = latest_date == datetime.date.today()
        # You could add time checks here for 11am-3pm if needed
        status = "OPEN" if is_today else "CLOSED" 
        return Response({
            'date': latest_date,
            'status': status,
            'is_active': is_today
        })

    # 2. Determine Reference Date based on Range
    ref_date = None
    if range_type == 'weekly':
        target_date = latest_date - datetime.timedelta(days=7)
        # Find nearest available date on or before target
        ref_date_data = DailyStockPrice.objects.filter(date__lte=target_date).values('date').annotate(count=Count('ticker')).filter(count__gt=10).order_by('-date').first()
        ref_date = ref_date_data['date'] if ref_date_data else None
    elif range_type == 'monthly':
        target_date = latest_date - datetime.timedelta(days=30)
        ref_date_data = DailyStockPrice.objects.filter(date__lte=target_date).values('date').annotate(count=Count('ticker')).filter(count__gt=10).order_by('-date').first()
        ref_date = ref_date_data['date'] if ref_date_data else None
    
    # 2.5 Find "Last Open Day" (Previous Trading Day) for Top 3 Comparison
    prev_date_data = DailyStockPrice.objects.filter(date__lt=latest_date).values('date').annotate(
        count=Count('ticker')
    ).filter(count__gt=10).order_by('-date').first()
    prev_date = prev_date_data['date'] if prev_date_data else None
        
    # If range is daily or ref_date not found, standard daily logic
    is_daily = (range_type == 'daily' or not ref_date)

    # 3. Fetch Data
    latest_prices = DailyStockPrice.objects.filter(date=latest_date)
    
    # Pre-fetch reference prices if aggregating
    ref_prices_map = {}
    aggregates_map = {}
    
    if not is_daily:
        ref_prices = DailyStockPrice.objects.filter(date=ref_date)
        ref_prices_map = {p.ticker: p.close for p in ref_prices}
        
        # Aggregate Volume and Turnover
        aggs = DailyStockPrice.objects.filter(date__gt=ref_date, date__lte=latest_date).values('ticker').annotate(
            total_vol=Sum('volume'),
            total_turn=Sum('turnover'),
            max_high=Max('high'),
            min_low=Min('low') # Note: Min aggregation might need import if not present, but usually Max is enough for volatility proxy
        )
        aggregates_map = {a['ticker']: a for a in aggs}

    # 4. Create Sector Map (using Company model)
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
    
    # For 52-week scanners
    near_high_list = []
    near_low_list = []

    # 4. Fetch Sparkline Data (Last 10 trading days)
    # We fetch a bit more range (e.g. 20 days) to ensure we get 10 points even with holidays
    sparkline_start = latest_date - datetime.timedelta(days=20)
    sparkline_qs = DailyStockPrice.objects.filter(
        date__gte=sparkline_start, 
        date__lte=latest_date
    ).values('ticker', 'date', 'close').order_by('date')
    
    sparkline_map = {}
    for item in sparkline_qs:
        t = item['ticker']
        if t not in sparkline_map: sparkline_map[t] = []
        sparkline_map[t].append(item['close'])
    
    # Keep only last 10 points
    for t in sparkline_map:
        sparkline_map[t] = sparkline_map[t][-10:]

    for stock in latest_prices:
        # Determine comparison price
        if not is_daily and stock.ticker in ref_prices_map:
            prev_close = ref_prices_map[stock.ticker]
        else:
            prev_close = stock.prev_close or stock.open

        # Determine volume/turnover
        if not is_daily and stock.ticker in aggregates_map:
            agg = aggregates_map[stock.ticker]
            volume = agg['total_vol'] or 0
            turnover = agg['total_turn'] or 0
            # Use aggregated high/low for diff? For now keep daily diff for "intraday volatility" or use period range
            # Let's use period volatility: (Max High - Min Low) / Prev Close
            # diff = (agg['max_high'] - agg['min_low']) if (agg['max_high'] and agg['min_low']) else (stock.high - stock.low)
            diff = stock.close - stock.open # Keep diff as candle body for now
        else:
            volume = stock.volume
            turnover = stock.turnover or (stock.close * stock.volume)
            diff = stock.close - stock.open
        
        # Calculations
        change = stock.close - prev_close if prev_close else 0
        percent_change = (change / prev_close * 100) if prev_close else 0
        
        # Global Totals (Only sum if daily, or if we want total volume over period? Usually summary header is for "Today")
        # User requested "Weekly Data", likely implies seeing weekly volume for stocks. 
        # But market header stats (Total Turnover) usually refer to the *current day's* session even in weekly view.
        # However, to be consistent with the list, let's sum based on the list data.
        total_volume += volume
        total_turnover += turnover
        
        market_points_today += stock.close
        market_points_prev += prev_close # This gives us "Weekly Market Change" if aggregated
        
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

        stock_data = {
            'ticker': stock.ticker,
            'close': stock.close,
            'open': stock.open,
            'high': stock.high,
            'low': stock.low,
            'volume': volume,
            'turnover': turnover,
            'change': change,
            'percent_change': percent_change,
            'diff': diff,
            'sector': sector,
            'weeks_52_high': stock.weeks_52_high,
            'weeks_52_low': stock.weeks_52_low,
            'sparkline': sparkline_map.get(stock.ticker, [])
        }
        summary_list.append(stock_data)
        
        # 52-Week Scanners (Daily only check is fine, or compare current close)
        from decimal import Decimal
        if stock.weeks_52_high and stock.close:
            # Within 2% of high
            if stock.close >= stock.weeks_52_high * Decimal('0.98'):
                near_high_list.append(stock_data)
                
        if stock.weeks_52_low and stock.close:
            # Within 2% of low
            if stock.close <= stock.weeks_52_low * Decimal('1.02'):
                near_low_list.append(stock_data)

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
    
    # Sort scanner lists
    near_high_list.sort(key=lambda x: x['percent_change'], reverse=True)
    near_low_list.sort(key=lambda x: x['percent_change']) # Losers first

    total_stocks = len(summary_list)
    advancers_percent = (advancers_count / total_stocks * 100) if total_stocks else 0

    # 6. Fetch Top Buyers for "Rocket List" (Existing logic)
    rocket_candidates = by_change[-10:] + by_change[:10]
    rocket_tickers = [s['ticker'] for s in rocket_candidates]
    
    floorsheet_qs = DailyFloorsheet.objects.filter(
        symbol__in=rocket_tickers,
        transaction_date=latest_date
    ).values('symbol', 'buyer_id').annotate(
        total_qty=Sum('transaction_quantity')
    ).order_by('symbol', '-total_qty')
    
    top_buyers_map = {}
    for entry in floorsheet_qs:
        sym = entry['symbol']
        if sym not in top_buyers_map: top_buyers_map[sym] = []
        if len(top_buyers_map[sym]) < 3:
            top_buyers_map[sym].append({'broker': entry['buyer_id'], 'qty': entry['total_qty']})
            
    for stock in summary_list:
        if stock['ticker'] in top_buyers_map:
            stock['top_buyers'] = top_buyers_map[stock['ticker']]

    # 7. Calculate Technicals (ROC, RSI, MACD) for Rocket List Candidates
    # Fetch history for these specific tickers to compute indicators on the fly
    curr_date = latest_date
    start_date_tech = curr_date - datetime.timedelta(days=100) # Enough for MACD/RSI
    
    tech_qs = DailyStockPrice.objects.filter(
        ticker__in=rocket_tickers,
        date__gte=start_date_tech,
        date__lte=curr_date
    ).values('ticker', 'date', 'close').order_by('date')
    
    if tech_qs.exists():
        df_tech = pd.DataFrame(list(tech_qs))
        if not df_tech.empty:
            # Group by ticker
            for t in rocket_tickers:
                # Filter for this ticker
                t_df = df_tech[df_tech['ticker'] == t].copy()
                if t_df.empty or len(t_df) < 30: continue
                
                t_df.set_index('date', inplace=True)
                close_vals = pd.to_numeric(t_df['close']).values.astype(float)
                
                # Calculate Indicators using talib
                try:
                    # ROC (14) - Rate of Change
                    roc = talib.ROC(close_vals, timeperiod=14)
                    roc_val = roc[-1] if roc is not None and not np.isnan(roc[-1]) else None
                    
                    # RSI (14)
                    rsi = talib.RSI(close_vals, timeperiod=14)
                    rsi_val = rsi[-1] if rsi is not None and not np.isnan(rsi[-1]) else None
                    
                    # MACD (12, 26, 9)
                    macd, macdsignal, macdhist = talib.MACD(close_vals, fastperiod=12, slowperiod=26, signalperiod=9)
                    
                    # Update the stock dict in summary_list
                    for s in summary_list:
                        if s['ticker'] == t:
                            s['roc'] = round(float(roc_val), 2) if roc_val is not None else None
                            s['rsi'] = round(float(rsi_val), 2) if rsi_val is not None else None
                            s['macd'] = f"{macd[-1]:.2f}" if macd is not None and not np.isnan(macd[-1]) else None
                            s['macd_signal'] = f"{macdsignal[-1]:.2f}" if macdsignal is not None and not np.isnan(macdsignal[-1]) else None
                            break
                            
                except Exception as e:
                    logger.warning(f"Error calculating tech for {t}: {e}")

    # 8. Whale Watch: Top 5 Brokers by Total Buy Volume -> Top 3 Stocks for each
    # Step A: Find top 5 brokers by total volume
    top_brokers_qs = DailyFloorsheet.objects.filter(
        transaction_date=latest_date
    ).values('buyer_id').annotate(
        total_buy_vol=Sum('transaction_quantity'),
        total_buy_turnover=Sum(F('transaction_quantity') * F('transaction_rate'))
    ).order_by('-total_buy_turnover')[:5]
    
    whale_watch = []
    for broker_entry in top_brokers_qs:
        broker_id = broker_entry['buyer_id']
        
        # Step B: For each top broker, find their top 3 stocks
        top_picks_qs = DailyFloorsheet.objects.filter(
            transaction_date=latest_date,
            buyer_id=broker_id
        ).values('symbol').annotate(
            qty=Sum('transaction_quantity'),
            turnover=Sum(F('transaction_quantity') * F('transaction_rate'))
        ).order_by('-turnover')[:3]
        
        whale_watch.append({
            'broker': broker_id,
            'total_turnover': broker_entry['total_buy_turnover'],
            'top_picks': [
                {'ticker': p['symbol'], 'turnover': p['turnover']} 
                for p in top_picks_qs
            ]
        })

    response_data = {
        'market_summary': {
            'date': latest_date,
            'ref_date': ref_date, # Useful for frontend to show range
            'range': range_type,
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
        'near_52_high': near_high_list[:10],
        'near_52_low': near_low_list[:10],
        'whale_watch': whale_watch,
    }
    
    return Response(response_data)

@api_view(['GET'])
@permission_classes([AllowAny])
def analyze_activity(request):
    """
    Deep dive into market activity. 
    Returns data for ALL timeframes (daily, weekly, monthly) grouped by category.
    Structure: { 'daily': { 'turnover': [], ... }, 'weekly': { ... }, 'monthly': { ... } }
    """
    limit = int(request.query_params.get('limit', 10))
    
    # Helper to calculate stats for a specific range
    def get_stats_for_range(range_type):
        ... # wait I can't replace from 396 to 504 easily without omitting code. I'll use multi_replace or smaller replaces.
    """
    Deep dive into market activity. 
    Returns data for ALL timeframes (daily, weekly, monthly) grouped by category.
    Structure: { 'daily': { 'turnover': [], ... }, 'weekly': { ... }, 'monthly': { ... } }
    """
    
    # Helper to calculate stats for a specific range
    def get_stats_for_range(range_type):
        # 1. Determine Dates
        latest_date_data = DailyStockPrice.objects.values('date').annotate(
            count=Count('ticker')
        ).filter(count__gt=10).order_by('-date').first()
        
        latest_date = latest_date_data['date'] if latest_date_data else None
        if not latest_date: return None

        start_date = latest_date
        if range_type == 'weekly':
            start_date = latest_date - datetime.timedelta(days=7)
        elif range_type == 'monthly':
            start_date = latest_date - datetime.timedelta(days=30)
            
        # 2. Fetch Prices 
        # For ROC(14), we need at least 14 days of history regardless of range_type
        # Let's fetch at least 45 days to be safe for weekends/holidays
        tech_start = latest_date - datetime.timedelta(days=45)
        prices = DailyStockPrice.objects.filter(date__gte=tech_start, date__lte=latest_date)
        
        ticker_stats = {}
        for p in prices:
            if p.ticker not in ticker_stats:
                ticker_stats[p.ticker] = {'vol': 0, 'turn': 0, 'prices': []}
            
            ticker_stats[p.ticker]['prices'].append({
                'date': p.date, 
                'close': p.close,
                'open': p.open,
                'prev_close': p.prev_close
            })
            # Filter for range stats
            if p.date >= start_date:
                ticker_stats[p.ticker]['vol'] += (p.volume or 0)
                ticker_stats[p.ticker]['turn'] += (p.turnover or 0)
            
        notable_metrics = []
        
        for ticker, data in ticker_stats.items():
            sorted_prices = sorted(data['prices'], key=lambda x: x['date'])
            if not sorted_prices: continue
            
            latest_entry = sorted_prices[-1]
            # filter prices for original range to avoid calculating volume/turnover for the extra history
            range_entries = [p for p in sorted_prices if p['date'] >= start_date]
            if not range_entries: continue
            first_entry = range_entries[0]
            
            end_price = float(latest_entry['close']) if latest_entry['close'] else 0
            
            # Additional logic for ROC (Rate of Change) - specifically 14 days
            # We'll calculate it using the available history in sorted_prices
            roc_val = None
            if len(sorted_prices) >= 15:
                # We can calculate ROC 14 if we have 15 points
                start_p = float(sorted_prices[-15]['close']) if sorted_prices[-15]['close'] else 0
                if start_p > 0:
                    roc_val = round(((end_price - start_p) / start_p) * 100, 2)
            
            # Change Calculation Logic
            if range_type == 'daily':
                # Daily change is close - prev_close (or open if prev_close missing)
                ref_price = float(latest_entry['prev_close']) if latest_entry['prev_close'] else float(latest_entry['open'])
            else:
                # Range change: Latest Close vs Price BEFORE the range started
                ref_price = float(first_entry['prev_close']) if first_entry['prev_close'] else float(first_entry['close'])
                
            change = end_price - ref_price
            pct_change = (change / ref_price * 100) if ref_price else 0
            
            notable_metrics.append({
                'ticker': ticker,
                'change': round(change, 2),
                'percent_change': round(pct_change, 2),
                'turnover': data['turn'],
                'volume': data['vol'],
                'close': end_price,
                'roc': roc_val
            })
            
        # Top Lists
        top_gainers_candidates = sorted(notable_metrics, key=lambda x: x['percent_change'], reverse=True)[:max(30, limit * 2)]
        
        if range_type == 'daily' and top_gainers_candidates:
            candidate_tickers = [x['ticker'] for x in top_gainers_candidates]
            cutoff_date = latest_date - datetime.timedelta(days=45)
            
            active_tickers = set(DailyStockPrice.objects.filter(
                ticker__in=candidate_tickers,
                date__gte=cutoff_date,
                date__lte=latest_date
            ).values('ticker').annotate(cnt=Count('id')).filter(cnt__gt=1).values_list('ticker', flat=True))
            
            top_gainers = [x for x in top_gainers_candidates if x['ticker'] in active_tickers][:limit]
        else:
            top_gainers = top_gainers_candidates[:limit]

        top_turnover = sorted(notable_metrics, key=lambda x: x['turnover'], reverse=True)[:limit]
        top_volume = sorted(notable_metrics, key=lambda x: x['volume'], reverse=True)[:limit]
        top_roc = sorted([x for x in notable_metrics if x['roc'] is not None], key=lambda x: x['roc'], reverse=True)[:limit]
        
        unique_tickers = set(
            [x['ticker'] for x in top_gainers] + 
            [x['ticker'] for x in top_turnover] + 
            [x['ticker'] for x in top_volume] +
            [x['ticker'] for x in top_roc]
        )
        
        # Floorsheet Aggregation
        floorsheet_data = DailyFloorsheet.objects.filter(
            symbol__in=unique_tickers, 
            transaction_date__gte=start_date,
            transaction_date__lte=latest_date
        )
        
        broker_stats = {} 
        for fs in floorsheet_data:
            ticker = fs.symbol
            if ticker not in broker_stats:
                broker_stats[ticker] = {'buyers': {}, 'sellers': {}, 'transactions': 0, 'avg_price_sum': 0, 'total_qty': 0}
                
            stats = broker_stats[ticker]
            stats['transactions'] += 1
            stats['total_qty'] += fs.quantity
            stats['avg_price_sum'] += (fs.rate * fs.quantity)
            
            if fs.buyer_id not in stats['buyers']: stats['buyers'][fs.buyer_id] = 0
            stats['buyers'][fs.buyer_id] += fs.quantity
            
            if fs.seller_id not in stats['sellers']: stats['sellers'][fs.seller_id] = 0
            stats['sellers'][fs.seller_id] += fs.quantity

        metrics_map = {m['ticker']: m for m in notable_metrics}

        def get_top_brokers(broker_dict):
            sorted_brokers = sorted(broker_dict.items(), key=lambda x: x[1], reverse=True)[:5]
            return [{'broker_id': k, 'quantity': v} for k, v in sorted_brokers]

        def build_list(tickers_list):
            results = []
            for item in tickers_list:
                ticker = item['ticker']
                stats = broker_stats.get(ticker, {})
                m = metrics_map.get(ticker, {})
                
                avg_price_w = (stats['avg_price_sum'] / stats['total_qty']) if stats.get('total_qty') else 0

                results.append({
                    'ticker': ticker,
                    'metrics': m,
                    'analysis': {
                        'total_transactions': stats.get('transactions', 0),
                        'weighted_avg_price': round(avg_price_w, 2),
                        'top_buyers': get_top_brokers(stats.get('buyers', {})),
                        'top_sellers': get_top_brokers(stats.get('sellers', {}))
                    }
                })
            return results

        return {
            'turnover': build_list(top_turnover),
            'gainers': build_list(top_gainers),
            'volume': build_list(top_volume),
            'roc': build_list(top_roc)
        }

    # Execute for all timeframes
    return Response({
        'daily': get_stats_for_range('daily'),
        'weekly': get_stats_for_range('weekly'),
        'monthly': get_stats_for_range('monthly')
    })

@api_view(['GET'])
@permission_classes([AllowAny])
def batch_indicators(request):
    """
    Calculate current technical indicators (RSI, MACD, ROC, Trends) for a list of symbols.
    Query param: ?symbols=AAPL,MSFT,GOOG
    """
    symbols_str = request.GET.get('symbols', '')
    if not symbols_str:
        return Response({})
    
    symbols = [s.strip().upper() for s in symbols_str.split(',') if s.strip()]
    if not symbols:
        return Response({})

    # 1. Determine Latest Date
    latest_date_data = DailyStockPrice.objects.values('date').annotate(
        count=Count('ticker')
    ).filter(count__gt=10).order_by('-date').first()
    
    latest_date = latest_date_data['date'] if latest_date_data else None
    if not latest_date:
        return Response({})

    # Fetch history for indicators (at least 45 days)
    start_date = latest_date - datetime.timedelta(days=60)
    prices_qs = DailyStockPrice.objects.filter(
        ticker__in=symbols,
        date__gte=start_date,
        date__lte=latest_date
    ).values('ticker', 'date', 'close', 'prev_close', 'open').order_by('date')

    import pandas as pd

    results = {}
    if not prices_qs.exists():
        return Response({})

    df_all = pd.DataFrame(list(prices_qs))
    if df_all.empty:
        return Response({})

    for ticker in symbols:
        t_df = df_all[df_all['ticker'] == ticker].copy()
        if t_df.empty or len(t_df) < 5:
            continue
        
        t_df.set_index('date', inplace=True)
        t_df['close'] = pd.to_numeric(t_df['close'])
        
        # Latest data point
        latest = t_df.iloc[-1]
        close = float(latest['close'])
        
        # 1. Trends (% Change)
        # 5D Trend
        p5d = float(t_df.iloc[-5]['close']) if len(t_df) >= 5 else float(t_df.iloc[0]['close'])
        trend5d = ((close - p5d) / p5d * 100) if p5d > 0 else 0
        
        # 10D Trend
        p10d = float(t_df.iloc[-10]['close']) if len(t_df) >= 10 else float(t_df.iloc[0]['close'])
        trend10d = ((close - p10d) / p10d * 100) if p10d > 0 else 0
        
        # 1M (20 Trading Days)
        p1m = float(t_df.iloc[-20]['close']) if len(t_df) >= 20 else float(t_df.iloc[0]['close'])
        trend1m = ((close - p1m) / p1m * 100) if p1m > 0 else 0

        # Technicals using talib
        rsi_val = None
        macd_val = None
        macd_signal = None
        macd_hist = None
        roc14_val = None

        if len(t_df) >= 30:
            try:
                close_vals = t_df['close'].values.astype(float)
                # RSI (14)
                rsi = talib.RSI(close_vals, timeperiod=14)
                if rsi is not None and len(rsi) > 0:
                    rsi_val = round(float(rsi[-1]), 2) if not np.isnan(rsi[-1]) else None
                
                # MACD (12, 26, 9)
                macd, macdsignal, macdhist = talib.MACD(close_vals, fastperiod=12, slowperiod=26, signalperiod=9)
                if macd is not None and len(macd) > 0:
                    macd_val = round(float(macd[-1]), 2) if not np.isnan(macd[-1]) else None
                    macd_hist = round(float(macdhist[-1]), 2) if not np.isnan(macdhist[-1]) else None
                    macd_signal = round(float(macdsignal[-1]), 2) if not np.isnan(macdsignal[-1]) else None
                
                # ROC (14)
                roc = talib.ROC(close_vals, timeperiod=14)
                if roc is not None and len(roc) > 0:
                    roc14_val = round(float(roc[-1]), 2) if not np.isnan(roc[-1]) else None
            except Exception as e:
                logger.warning(f"Error calculating batch indicators for {ticker}: {e}")

        results[ticker] = {
            'trends': {
                '5d': round(trend5d, 2),
                '10d': round(trend10d, 2),
                '1m': round(trend1m, 2),
            },
            'rsi': rsi_val,
            'macd': macd_val,
            'macd_signal': macd_signal,
            'macd_hist': macd_hist,
            'roc': roc14_val,
        }

    return Response(results)

@api_view(['GET'])
@permission_classes([AllowAny])
def sector_history(request, sector_name):
    queryset = DailyStockPrice.objects.all()
    
    if sector_name.upper() != 'NEPSE':
        tickers = StockFundamental.objects.filter(sector__iexact=sector_name).values_list('ticker', flat=True)
        queryset = queryset.filter(ticker__in=tickers)
    
    history = queryset.values('date').annotate(
        value=Sum('close'),
        volume=Sum('volume'),
        turnover=Sum('turnover')
    ).order_by('date')
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
    List floorsheet transactions with optional filtering and pagination.
    """
    broker = request.query_params.get('broker')
    symbol = request.query_params.get('symbol')
    date = request.query_params.get('date')
    is_bulk = request.query_params.get('is_bulk', '').lower() == 'true'
    is_matching = request.query_params.get('is_matching', '').lower() == 'true'
    ordering = request.query_params.get('ordering')
    
    page = int(request.query_params.get('page', 1))
    page_size = int(request.query_params.get('page_size', 50))
    
    # Calculate offset
    start_index = (page - 1) * page_size
    end_index = start_index + page_size

    try:
        from stocks.models.market import Company
        allowed_symbols = Company.objects.values_list('symbol', flat=True)
        queryset = DailyFloorsheet.objects.filter(symbol__in=allowed_symbols)
        
        if symbol:
            queryset = queryset.filter(symbol=symbol)
        if broker:
            queryset = queryset.filter(Q(buyer_id=broker) | Q(seller_id=broker))
        if is_matching:
            from django.db.models import F
            queryset = queryset.filter(buyer_id=F('seller_id'), transaction_quantity__gt=1000)
        if is_bulk:
            queryset = queryset.filter(Q(transaction_quantity__gte=5000) | Q(transaction_amount__gte=5000000))
            
        applied_date = date
        if date:
            queryset = queryset.filter(transaction_date=date)
        elif (is_bulk or is_matching) or not (symbol or broker):
            # Default to latest available date if no date provided, to avoid querying massive table
            # (optimisation). For bulk and matching we enforce latest date by default.
            latest = DailyFloorsheet.objects.order_by('-transaction_date').first()
            if latest:
                applied_date = latest.transaction_date
                queryset = queryset.filter(transaction_date=applied_date)
            
        # Get total count before slicing
        total_count = queryset.count()
        
        # Apply Sorting logic
        if ordering:
            queryset = queryset.order_by(ordering, '-transaction_date', '-transaction_id')
        else:
            queryset = queryset.order_by('-transaction_date', '-transaction_id')
            
        # Slice for pagination
        serializer = DailyFloorsheetSerializer(queryset[start_index:end_index], many=True)
        
        return Response({
            'results': serializer.data,
            'total_count': total_count,
            'current_page': page,
            'total_pages': (total_count + page_size - 1) // page_size if page_size > 0 else 1,
            'applied_date': applied_date
        })
    except Exception as e:
        return Response({'error': str(e)}, status=500)

def _get_broker_accumulation(ticker):
    """
    Calculate top buyers/sellers for multiple time ranges on the fly.
    """
    ranges = {
        '1D': 1, '1W': 7, '1M': 30, '3M': 90, '6M': 180, '1Y': 365, '2Y': 730, 'AT': -1
    }
    
    # Get latest date for this ticker from floorsheet
    latest_fs = DailyFloorsheet.objects.filter(symbol=ticker).order_by('-transaction_date').first()
    if not latest_fs:
        return {}
        
    latest_date = latest_fs.transaction_date
    results = {}
    
    for label, days in ranges.items():
        if label == 'AT':
            # Use Cumulative table for All-Time accuracy
            from ..models import DailyCumulativeAccumulation
            latest_cum_date = DailyCumulativeAccumulation.objects.filter(symbol=ticker).aggregate(Max('transaction_date'))['transaction_date__max'] or latest_date
            
            buyers = DailyCumulativeAccumulation.objects.filter(
                symbol=ticker, transaction_date=latest_cum_date
            ).order_by('-cumulative_buy')[:5]
            
            sellers = DailyCumulativeAccumulation.objects.filter(
                symbol=ticker, transaction_date=latest_cum_date
            ).order_by('-cumulative_sell')[:5]
            
            range_data = []
            for b in buyers:
                wac = float(b.cumulative_buy_amount / b.cumulative_buy) if b.cumulative_buy > 0 else 0
                range_data.append({"broker": str(b.entity_id), "qty": int(b.cumulative_buy), "wac": round(wac, 2), "type": "BUY"})
            for s in sellers:
                wac = float(b.cumulative_sell_amount / b.cumulative_sell) if b.cumulative_sell > 0 else 0
                range_data.append({"broker": str(s.entity_id), "qty": int(s.cumulative_sell), "wac": round(wac, 2), "type": "SELL"})
            
            results[label] = range_data
            continue

        if label == '1D':
            start_date = latest_date
        else:
            start_date = latest_date - datetime.timedelta(days=days)
            
        # Aggregate Buyers
        buyers = DailyFloorsheet.objects.filter(
            symbol=ticker, 
            transaction_date__gte=start_date,
            transaction_date__lte=latest_date
        ).values('buyer_id').annotate(
            qty=Sum('transaction_quantity'),
            amount=Sum('transaction_amount')
        ).order_by('-qty')[:5]
        
        # Aggregate Sellers
        sellers = DailyFloorsheet.objects.filter(
            symbol=ticker, 
            transaction_date__gte=start_date,
            transaction_date__lte=latest_date
        ).values('seller_id').annotate(
            qty=Sum('transaction_quantity'),
            amount=Sum('transaction_amount')
        ).order_by('-qty')[:5]
        
        range_data = []
        for b in buyers:
            wac = float(b['amount'] / b['qty']) if b['qty'] > 0 else 0
            range_data.append({"broker": str(b['buyer_id']), "qty": int(b['qty']), "wac": round(wac, 2), "type": "BUY"})
        for s in sellers:
            wac = float(s['amount'] / s['qty']) if s['qty'] > 0 else 0
            range_data.append({"broker": str(s['seller_id']), "qty": int(s['qty']), "wac": round(wac, 2), "type": "SELL"})
            
        results[label] = range_data
        
    return results

@api_view(['GET'])
@permission_classes([AllowAny])
def stock_detail(request, ticker):
    fundamental = None
    try:
        fundamental = StockFundamental.objects.get(ticker=ticker)
        fundamental_data = dict(StockFundamentalSerializer(fundamental).data)
    except StockFundamental.DoesNotExist:
        fundamental_data = {}
        
    # Inject broker accumulation data on-the-fly
    fundamental_data['broker_accumulation'] = _get_broker_accumulation(ticker)
        
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

    # Calculate technical indicators on the fly to ensure structural accuracy (S/R, MACD, etc.)
    # This bypasses stale database caches for the specific ticker being viewed.
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
            
            # === UNAUDITED METRICS (LATEST QUARTERLY) ===
            latest_quarterly = FinancialReport.objects.filter(
                ticker=ticker,
                report_type='QUARTERLY'
            ).order_by('-fiscal_year', '-quarter').first()

            if latest_quarterly:
                fundamental.eps_unaudited = latest_quarterly.eps
                fundamental.book_value_unaudited = latest_quarterly.book_value
                if current_price and latest_quarterly.eps and latest_quarterly.eps > 0:
                    fundamental.pe_ratio_unaudited = round(Decimal(current_price / float(latest_quarterly.eps)), 2)
            else:
                fundamental.eps_unaudited = fundamental.eps
                fundamental.book_value_unaudited = fundamental.book_value
                fundamental.pe_ratio_unaudited = fundamental.pe_ratio

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
