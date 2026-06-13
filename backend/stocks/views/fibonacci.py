from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from ..models import DailyStockPrice
from django.utils import timezone
from datetime import timedelta


FIBONACCI_RATIOS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1.0]
FIBONACCI_LABELS = ['0%', '23.6%', '38.2%', '50%', '61.8%', '78.6%', '100%']

# Adaptive lookback per period (days -> N-bar window)
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
        window_lows = [float(price_list[j]['low']) for j in range(i - lookback, i + lookback + 1)]
        h = float(price_list[i]['high'])
        l = float(price_list[i]['low'])
        if h >= max(window_highs):
            raw.append({'index': i, 'price': h, 'type': 'high', 'date': str(price_list[i]['date'])})
        if l <= min(window_lows):
            raw.append({'index': i, 'price': l, 'type': 'low', 'date': str(price_list[i]['date'])})
    raw.sort(key=lambda x: x['index'])
    return raw


def build_zigzag(raw_swings):
    """Collapse raw swing points into a strictly alternating high/low ZigZag."""
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
    """Return (swing_low, swing_high, trend) from the last two ZigZag points."""
    if len(zigzag) < 2:
        return None, None, None
    last, prev = zigzag[-1], zigzag[-2]
    if last['type'] == 'high':
        return prev, last, 'UPTREND'
    return last, prev, 'DOWNTREND'


def _fallback_anchors(price_list, current_price):
    """Return (high_val, low_val, high_date, low_date, trend) using period extremes."""
    highs = [float(p['high']) for p in price_list]
    lows = [float(p['low']) for p in price_list]
    high_val, low_val = max(highs), min(lows)
    high_date = next(str(p['date']) for p in price_list if float(p['high']) == high_val)
    low_date = next(str(p['date']) for p in price_list if float(p['low']) == low_val)
    trend = 'UPTREND' if current_price >= (high_val + low_val) / 2 else 'DOWNTREND'
    return high_val, low_val, high_date, low_date, trend


def _compute_fib_levels(anchor_0, anchor_100, current_price):
    """Build the Fibonacci levels list from anchor prices."""
    levels = []
    for ratio, label in zip(FIBONACCI_RATIOS, FIBONACCI_LABELS):
        price_at_level = anchor_0 + (ratio * (anchor_100 - anchor_0))
        distance_pct = ((price_at_level - current_price) / current_price) * 100
        levels.append({
            'ratio': ratio, 'label': label,
            'price': round(price_at_level, 2),
            'distance_pct': round(distance_pct, 2),
            'is_above': price_at_level > current_price,
        })
    return levels


def _compute_risk_metrics(levels, current_price, swing_high_val, swing_low_val):
    """Compute nearest support/resistance and risk/upside metrics."""
    supports = [l for l in levels if l['price'] < current_price]
    resistances = [l for l in levels if l['price'] > current_price]
    nearest_support = max(supports, key=lambda x: x['price']) if supports else None
    nearest_resistance = min(resistances, key=lambda x: x['price']) if resistances else None
    growth_potential = (
        round(((nearest_resistance['price'] - current_price) / current_price) * 100, 2)
        if nearest_resistance else None
    )
    fall_risk = (
        round(((current_price - nearest_support['price']) / current_price) * 100, 2)
        if nearest_support else None
    )
    return {
        'nearest_support': nearest_support, 'nearest_resistance': nearest_resistance,
        'growth_potential': growth_potential, 'fall_risk': fall_risk,
        'max_upside': round(((swing_high_val - current_price) / current_price) * 100, 2),
        'max_downside': round(((current_price - swing_low_val) / current_price) * 100, 2),
    }


def _find_current_zone(levels, current_price):
    """Return the Fibonacci zone the current price sits in."""
    sorted_levels = sorted(levels, key=lambda x: x['price'])
    for i in range(len(sorted_levels) - 1):
        if sorted_levels[i]['price'] <= current_price <= sorted_levels[i + 1]['price']:
            return {
                'lower': sorted_levels[i]['label'], 'upper': sorted_levels[i + 1]['label'],
                'lower_price': sorted_levels[i]['price'], 'upper_price': sorted_levels[i + 1]['price'],
            }
    return None


def _detect_swing_anchors(price_list, period):
    """Run ZigZag detection; return (swing_high_val, swing_low_val, high_date, low_date, trend, zigzag)."""
    current_price = float(price_list[-1]['close'])
    lookback = PERIOD_LOOKBACK[period]
    zigzag = build_zigzag(find_swing_points(price_list, lookback))
    swing_low_point, swing_high_point, trend = get_anchor_points(zigzag)
    if swing_low_point is None or swing_high_point is None:
        hv, lv, hd, ld, trend = _fallback_anchors(price_list, current_price)
    else:
        hv, hd = swing_high_point['price'], swing_high_point['date']
        lv, ld = swing_low_point['price'], swing_low_point['date']
    return hv, lv, hd, ld, trend, zigzag


def _build_fib_response(ticker, period, price_list, swing_high_val, swing_low_val, swing_high_date, swing_low_date, trend, zigzag):
    """Assemble the full Fibonacci response dict."""
    current_price = float(price_list[-1]['close'])
    lookback = PERIOD_LOOKBACK[period]
    anchor_0, anchor_100 = (swing_high_val, swing_low_val) if trend == 'UPTREND' else (swing_low_val, swing_high_val)
    levels = _compute_fib_levels(anchor_0, anchor_100, current_price)
    risk = _compute_risk_metrics(levels, current_price, swing_high_val, swing_low_val)
    return {
        'ticker': ticker, 'period': period, 'current_price': round(current_price, 2),
        'swing_high': round(swing_high_val, 2), 'swing_low': round(swing_low_val, 2),
        'swing_high_date': swing_high_date, 'swing_low_date': swing_low_date,
        'trend': trend, 'lookback': lookback, 'zigzag_points': len(zigzag),
        'levels': levels, 'current_zone': _find_current_zone(levels, current_price),
        **risk,
    }


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_fibonacci_levels(request, ticker):
    """
    Calculate Fibonacci retracement levels for a given ticker.
    Uses ZigZag swing-point detection to anchor levels on the most recent significant move.
    Query params: period: 30, 90, 180 (default), 365, 1825
    """
    period = int(request.query_params.get('period', 1825))
    if period not in [30, 90, 180, 365, 1825]:
        period = 1825
    cutoff = timezone.now().date() - timedelta(days=period)
    prices = DailyStockPrice.objects.filter(ticker=ticker, date__gte=cutoff).order_by('date').values('date', 'open', 'high', 'low', 'close', 'volume')
    if not prices.exists():
        return Response({'error': 'No price data available for this ticker.'}, status=404)
    price_list = list(prices)
    swing_high_val, swing_low_val, swing_high_date, swing_low_date, trend, zigzag = _detect_swing_anchors(price_list, period)
    if swing_high_val - swing_low_val == 0:
        return Response({'error': 'No price range found (flat market).'}, status=400)
    return Response(_build_fib_response(ticker, period, price_list, swing_high_val, swing_low_val, swing_high_date, swing_low_date, trend, zigzag))
