from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from ..models import DailyStockPrice
from django.utils import timezone
from datetime import timedelta


FIBONACCI_RATIOS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1.0]
FIBONACCI_LABELS = ['0%', '23.6%', '38.2%', '50%', '61.8%', '78.6%', '100%']


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_fibonacci_levels(request, ticker):
    """
    Calculate Fibonacci retracement levels for a given ticker.
    
    Query params:
        period: 30, 90, 180 (default), 365, 1825
    """
    period = int(request.query_params.get('period', 1825))
    if period not in [30, 90, 180, 365, 1825]:
        period = 1825

    cutoff = timezone.now().date() - timedelta(days=period)

    prices = (
        DailyStockPrice.objects
        .filter(ticker=ticker, date__gte=cutoff)
        .order_by('date')
        .values('date', 'open', 'high', 'low', 'close', 'volume')
    )

    if not prices.exists():
        return Response({'error': 'No price data available for this ticker.'}, status=404)

    price_list = list(prices)

    highs = [float(p['high']) for p in price_list]
    lows = [float(p['low']) for p in price_list]
    closes = [float(p['close']) for p in price_list]

    swing_high = max(highs)
    swing_low = min(lows)
    current_price = closes[-1]
    swing_range = swing_high - swing_low

    if swing_range == 0:
        return Response({'error': 'No price range found (flat market).'}, status=400)

    # Detect trend: if current price is in the upper half of the range, it's an uptrend retracement
    mid_point = (swing_high + swing_low) / 2
    is_uptrend = current_price >= mid_point

    # Build levels
    # In an UPTREND retracement: 100% = swing_high, 0% = swing_low
    # Levels go from swing_low (0%) up to swing_high (100%)
    # Retracement levels = swing_high - ratio * range (measuring pullback from high)
    levels = []
    for ratio, label in zip(FIBONACCI_RATIOS, FIBONACCI_LABELS):
        if is_uptrend:
            # Retracement from the top: how far it pulled back from swing high
            price_at_level = swing_high - (ratio * swing_range)
        else:
            # Retracement from the bottom: how far it bounced from swing low
            price_at_level = swing_low + (ratio * swing_range)

        distance_pct = ((price_at_level - current_price) / current_price) * 100

        levels.append({
            'ratio': ratio,
            'label': label,
            'price': round(price_at_level, 2),
            'distance_pct': round(distance_pct, 2),
            'is_above': price_at_level > current_price,
        })

    # Find nearest support (below CMP) and resistance (above CMP)
    supports = [l for l in levels if l['price'] < current_price]
    resistances = [l for l in levels if l['price'] > current_price]

    nearest_support = max(supports, key=lambda x: x['price']) if supports else None
    nearest_resistance = min(resistances, key=lambda x: x['price']) if resistances else None

    # Growth potential: distance to nearest resistance
    growth_potential = None
    if nearest_resistance:
        growth_potential = round(
            ((nearest_resistance['price'] - current_price) / current_price) * 100, 2
        )

    # Fall risk: distance to nearest support
    fall_risk = None
    if nearest_support:
        fall_risk = round(
            ((current_price - nearest_support['price']) / current_price) * 100, 2
        )

    # Maximum upside (to swing high) and maximum downside (to swing low)
    max_upside = round(((swing_high - current_price) / current_price) * 100, 2)
    max_downside = round(((current_price - swing_low) / current_price) * 100, 2)

    # Find which zone the current price sits in
    current_zone = None
    sorted_levels = sorted(levels, key=lambda x: x['price'])
    for i in range(len(sorted_levels) - 1):
        if sorted_levels[i]['price'] <= current_price <= sorted_levels[i + 1]['price']:
            current_zone = {
                'lower': sorted_levels[i]['label'],
                'upper': sorted_levels[i + 1]['label'],
                'lower_price': sorted_levels[i]['price'],
                'upper_price': sorted_levels[i + 1]['price'],
            }
            break

    # Swing dates
    swing_high_date = None
    swing_low_date = None
    for p in price_list:
        if float(p['high']) == swing_high and not swing_high_date:
            swing_high_date = str(p['date'])
        if float(p['low']) == swing_low and not swing_low_date:
            swing_low_date = str(p['date'])

    return Response({
        'ticker': ticker,
        'period': period,
        'current_price': round(current_price, 2),
        'swing_high': round(swing_high, 2),
        'swing_low': round(swing_low, 2),
        'swing_high_date': swing_high_date,
        'swing_low_date': swing_low_date,
        'trend': 'UPTREND' if is_uptrend else 'DOWNTREND',
        'levels': levels,
        'nearest_support': nearest_support,
        'nearest_resistance': nearest_resistance,
        'growth_potential': growth_potential,
        'fall_risk': fall_risk,
        'max_upside': max_upside,
        'max_downside': max_downside,
        'current_zone': current_zone,
    })
