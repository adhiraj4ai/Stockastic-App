from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from stocks.models import Company, DailyStockPrice
import datetime
from collections import defaultdict

@api_view(['GET'])
@permission_classes([AllowAny])
def get_sector_rotation(request):
    """
    Groups and aggregates stock performance by Sector to support the Sector Rotation feature.
    Calculates average percent changes for various timeframes by fetching historical prices.
    """
    # 1. Get the latest trading date
    latest_date_obj = DailyStockPrice.objects.order_by('-date').values_list('date', flat=True).first()
    if not latest_date_obj:
        return Response({'status': 'error', 'message': 'No price data available.', 'sectors': []})

    latest_date = latest_date_obj

    # 2. Define timeframes in days and find the closest actual trading dates
    timeframes = {
        'daily': 1,
        'weekly': 7,
        'monthly': 30,
        'three_month': 90,
        'six_month': 180,
        'yearly': 365
    }
    
    anchor_dates = {}
    for name, days in timeframes.items():
        target_date = latest_date - datetime.timedelta(days=days)
        # Find the most recent trading day on or before the target date
        closest = DailyStockPrice.objects.filter(date__lte=target_date).order_by('-date').values_list('date', flat=True).first()
        anchor_dates[name] = closest

    # Fetch all relevant prices in a single query
    relevant_dates = {latest_date}
    for d in anchor_dates.values():
        if d: 
            relevant_dates.add(d)

    prices = DailyStockPrice.objects.filter(date__in=relevant_dates).values('ticker', 'date', 'close', 'prev_close')

    # Build price lookup: prices_dict[ticker][date_str] = { close, prev_close }
    price_lookup = defaultdict(dict)
    for p in prices:
        # Save as string for easy dict keys
        price_lookup[p['ticker']][str(p['date'])] = p

    # 3. Map tickers to sectors
    companies = Company.objects.exclude(sector__isnull=True).exclude(sector__exact='').values('symbol', 'sector')
    sector_mapping = {c['symbol']: c['sector'] for c in companies}

    # 4. Calculate returns group by sector
    sector_data = defaultdict(lambda: {
        'count': 0,
        'returns': defaultdict(list)
    })

    latest_date_str = str(latest_date)

    for ticker, dates_data in price_lookup.items():
        sector = sector_mapping.get(ticker)
        if not sector:
            continue

        latest_price_obj = dates_data.get(latest_date_str)
        if not latest_price_obj:
            continue
            
        latest_close = latest_price_obj['close']
        if not latest_close:
            continue
            
        sector_data[sector]['count'] += 1

        # Calculate returns for each timeframe
        for tf_name, tf_date in anchor_dates.items():
            if not tf_date:
                continue
                
            if tf_name == 'daily':
                # Daily uses prev_close from the latest day if available
                prev = latest_price_obj.get('prev_close')
                if prev and prev > 0:
                    ret = ((latest_close - prev) / prev) * 100
                    sector_data[sector]['returns']['daily'].append(float(ret))
                continue

            tf_date_str = str(tf_date)
            anchor_price_obj = dates_data.get(tf_date_str)
            
            if anchor_price_obj and anchor_price_obj.get('close') and anchor_price_obj['close'] > 0:
                anchor_close = anchor_price_obj['close']
                ret = ((latest_close - anchor_close) / anchor_close) * 100
                sector_data[sector]['returns'][tf_name].append(float(ret))

    # 5. Format the final output
    results = []
    
    for sector, data in sector_data.items():
        if data['count'] == 0:
            continue
            
        returns = data['returns']
        
        def calculate_avg(values):
            if not values:
                return 0.0
            return round(sum(values) / len(values), 2)
            
        results.append({
            'sector': sector,
            'stock_count': data['count'],
            'daily_return': calculate_avg(returns['daily']),
            'weekly_return': calculate_avg(returns['weekly']),
            'monthly_return': calculate_avg(returns['monthly']),
            'three_month_return': calculate_avg(returns['three_month']),
            'six_month_return': calculate_avg(returns['six_month']),
            'yearly_return': calculate_avg(returns['yearly'])
        })

    # Sort alphabetically by sector name
    results.sort(key=lambda x: x['sector'])

    return Response({
        'status': 'success',
        'sectors': results,
        'count': len(results)
    })
