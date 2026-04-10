from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from ..models import DailyStockPrice
from django.utils import timezone
from datetime import timedelta


FIBONACCI_RATIOS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1.0]
FIBONACCI_LABELS = ['0%', '23.6%', '38.2%', '50%', '61.8%', '78.6%', '100%']

# Adaptive lookback per period (days → N-bar window)
PERIOD_LOOKBACK = {
    30: 3,
    90: 5,
    180: 7,
    365: 10,
    1825: 15,
}


def find_swing_points(price_list, lookback):
    """
    Detect swing highs and lows using an N-bar lookback window.
    A swing high at index i: high[i] >= all highs in [i-N, i+N].
    A swing low  at index i: low[i]  <= all lows  in [i-N, i+N].
    """
    n = len(price_list)
    raw = []

    for i in range(lookback, n - lookback):
        window_highs = [float(price_list[j]['high']) for j in range(i - lookback, i + lookback + 1)]
        window_lows  = [float(price_list[j]['low'])  for j in range(i - lookback, i + lookback + 1)]
        h = float(price_list[i]['high'])
        l = float(price_list[i]['low'])

        if h >= max(window_highs):
            raw.append({'index': i, 'price': h, 'type': 'high', 'date': str(price_list[i]['date'])})
        if l <= min(window_lows):
            raw.append({'index': i, 'price': l, 'type': 'low',  'date': str(price_list[i]['date'])})

    raw.sort(key=lambda x: x['index'])
    return raw


def build_zigzag(raw_swings):
    """
    Collapse raw swing points into a strictly alternating high/low ZigZag.
    When two consecutive points share the same type, keep the more extreme one.
    """
    zigzag = []
    for swing in raw_swings:
        if not zigzag:
            zigzag.append(swing)
        elif swing['type'] == zigzag[-1]['type']:
            if swing['type'] == 'high' and swing['price'] >= zigzag[-1]['price']:
                zigzag[-1] = swing
            elif swing['type'] == 'low' and swing['price'] <= zigzag[-1]['price']:
                zigzag[-1] = swing
        else:
            zigzag.append(swing)
    return zigzag


def get_anchor_points(zigzag):
    """
    Return (swing_low, swing_high, trend) from the last two ZigZag points.
    Last point = HIGH → last move was UP → anchor: prior low → last high.
    Last point = LOW  → last move was DOWN → anchor: prior high → last low.
    """
    if len(zigzag) < 2:
        return None, None, None

    last = zigzag[-1]
    prev = zigzag[-2]

    if last['type'] == 'high':
        return prev, last, 'UPTREND'   # prev is low, last is high
    else:
        return last, prev, 'DOWNTREND'  # last is low, prev is high


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_fibonacci_levels(request, ticker):
    """
    Calculate Fibonacci retracement levels for a given ticker.

    Uses ZigZag swing-point detection to anchor levels on the most recent
    significant move (higher-high / higher-low structure for uptrends, etc.)

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
    current_price = float(price_list[-1]['close'])

    # --- Swing detection ---
    lookback = PERIOD_LOOKBACK[period]
    raw_swings = find_swing_points(price_list, lookback)
    zigzag = build_zigzag(raw_swings)
    swing_low_point, swing_high_point, trend = get_anchor_points(zigzag)

    # Fallback: not enough candles for swing detection → use period extremes
    if swing_low_point is None or swing_high_point is None:
        highs = [float(p['high']) for p in price_list]
        lows  = [float(p['low'])  for p in price_list]
        swing_high_val  = max(highs)
        swing_low_val   = min(lows)
        swing_high_date = next(str(p['date']) for p in price_list if float(p['high']) == swing_high_val)
        swing_low_date  = next(str(p['date']) for p in price_list if float(p['low'])  == swing_low_val)
        mid_point = (swing_high_val + swing_low_val) / 2
        trend = 'UPTREND' if current_price >= mid_point else 'DOWNTREND'
    else:
        swing_high_val  = swing_high_point['price']
        swing_low_val   = swing_low_point['price']
        swing_high_date = swing_high_point['date']
        swing_low_date  = swing_low_point['date']

    swing_range = swing_high_val - swing_low_val

    if swing_range == 0:
        return Response({'error': 'No price range found (flat market).'}, status=400)

    # --- Fibonacci levels (always: 0% = swing_low, 100% = swing_high) ---
    levels = []
    for ratio, label in zip(FIBONACCI_RATIOS, FIBONACCI_LABELS):
        price_at_level = swing_low_val + (ratio * swing_range)
        distance_pct   = ((price_at_level - current_price) / current_price) * 100
        levels.append({
            'ratio': ratio,
            'label': label,
            'price': round(price_at_level, 2),
            'distance_pct': round(distance_pct, 2),
            'is_above': price_at_level > current_price,
        })

    # Nearest support / resistance
    supports    = [l for l in levels if l['price'] < current_price]
    resistances = [l for l in levels if l['price'] > current_price]
    nearest_support    = max(supports,    key=lambda x: x['price']) if supports    else None
    nearest_resistance = min(resistances, key=lambda x: x['price']) if resistances else None

    growth_potential = None
    if nearest_resistance:
        growth_potential = round(((nearest_resistance['price'] - current_price) / current_price) * 100, 2)

    fall_risk = None
    if nearest_support:
        fall_risk = round(((current_price - nearest_support['price']) / current_price) * 100, 2)

    max_upside   = round(((swing_high_val - current_price) / current_price) * 100, 2)
    max_downside = round(((current_price - swing_low_val)  / current_price) * 100, 2)

    # Zone the current price sits in
    current_zone = None
    sorted_levels = sorted(levels, key=lambda x: x['price'])
    for i in range(len(sorted_levels) - 1):
        if sorted_levels[i]['price'] <= current_price <= sorted_levels[i + 1]['price']:
            current_zone = {
                'lower':       sorted_levels[i]['label'],
                'upper':       sorted_levels[i + 1]['label'],
                'lower_price': sorted_levels[i]['price'],
                'upper_price': sorted_levels[i + 1]['price'],
            }
            break

    return Response({
        'ticker': ticker,
        'period': period,
        'current_price': round(current_price, 2),
        'swing_high': round(swing_high_val, 2),
        'swing_low':  round(swing_low_val,  2),
        'swing_high_date': swing_high_date,
        'swing_low_date':  swing_low_date,
        'trend': trend,
        'lookback': lookback,
        'zigzag_points': len(zigzag),
        'levels': levels,
        'nearest_support': nearest_support,
        'nearest_resistance': nearest_resistance,
        'growth_potential': growth_potential,
        'fall_risk': fall_risk,
        'max_upside': max_upside,
        'max_downside': max_downside,
        'current_zone': current_zone,
    })
