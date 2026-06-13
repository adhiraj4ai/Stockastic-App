from rest_framework import viewsets
from rest_framework.response import Response
from django.db import connections
from django.utils import timezone
from datetime import timedelta
import pandas as pd
import numpy as np

_RANGE_DAYS = {'1W': 7, '2W': 14, '1M': 30, '3M': 90, '6M': 180, '1Y': 365, 'ALL': 3650}
VALUE_AREA_PCT = 0.70
MAX_BINS = 50


def _fetch_date_range(symbol, days):
    """Return (max_date, start_date) for the symbol or raise if no data."""
    with connections['default'].cursor() as cursor:
        cursor.execute("SELECT MAX(transaction_date) FROM daily_floorsheet WHERE symbol = %s", [symbol])
        max_date = cursor.fetchone()[0]
    if not max_date:
        return None, None
    return max_date, max_date - timedelta(days=days)


def _fetch_trades(symbol, start_date, max_date):
    """Fetch (price, volume) rows from the floorsheet for the given date range."""
    sql = """
        SELECT transaction_rate, transaction_quantity
        FROM daily_floorsheet
        WHERE symbol = %s AND transaction_date >= %s AND transaction_date <= %s
    """
    with connections['default'].cursor() as cursor:
        cursor.execute(sql, [symbol, start_date, max_date])
        return cursor.fetchall()


def _bin_profile(df):
    """Aggregate volume by price bin; return profile_data DataFrame."""
    unique_prices = df['price'].nunique()
    num_bins = min(MAX_BINS, unique_prices)
    if unique_prices > num_bins:
        bins = np.linspace(df['price'].min(), df['price'].max(), num_bins + 1)
        df['price_bin'] = pd.cut(df['price'], bins=bins, labels=bins[:-1], include_lowest=True)
        return df.groupby('price_bin', observed=True)['volume'].sum().reset_index().rename(columns={'price_bin': 'price'})
    return df.groupby('price')['volume'].sum().reset_index()


def _compute_value_area(profile_data, poc_price, total_volume):
    """Return (val, vah) from the profile DataFrame."""
    va_target = total_volume * VALUE_AREA_PCT
    profile_data = profile_data.copy()
    profile_data['dist_to_poc'] = abs(profile_data['price'].astype(float) - poc_price)
    sorted_df = profile_data.sort_values('dist_to_poc')
    sorted_df['cum_vol'] = sorted_df['volume'].cumsum()
    prev_cum = sorted_df['cum_vol'].shift(1, fill_value=0)
    value_area_rows = sorted_df[prev_cum < va_target]
    if value_area_rows.empty:
        return float(profile_data['price'].min()), float(profile_data['price'].max())
    return float(value_area_rows['price'].min()), float(value_area_rows['price'].max())


def _build_bars(profile_data, poc_price, val, vah):
    """Construct the list of bar dicts for the response."""
    return [
        {
            'price': float(row['price']),
            'volume': float(row['volume']),
            'is_poc': float(row['price']) == poc_price,
            'is_val': val <= float(row['price']) <= vah,
        }
        for _, row in profile_data.sort_values('price').iterrows()
    ]


def _compute_profile(symbol, days):
    """Fetch trades and compute the volume profile. Returns (profile_dict, error_response)."""
    max_date, start_date = _fetch_date_range(symbol, days)
    if max_date is None:
        return None, Response({'error': 'No data found for this symbol'}, status=404)
    rows = _fetch_trades(symbol, start_date, max_date)
    if not rows:
        return None, Response({'error': 'No trades found in this range'}, status=404)
    df = pd.DataFrame(rows, columns=['price', 'volume'])
    df['price'] = df['price'].astype(float)
    df['volume'] = df['volume'].astype(float)
    total_volume = df['volume'].sum()
    profile_data = _bin_profile(df)
    poc_price = float(profile_data.loc[profile_data['volume'].idxmax(), 'price'])
    val, vah = _compute_value_area(profile_data, poc_price, total_volume)
    result = {
        'total_volume': float(total_volume), 'poc': poc_price, 'val': val, 'vah': vah,
        'bars': _build_bars(profile_data, poc_price, val, vah),
        'stats': {
            'min_price': float(df['price'].min()), 'max_price': float(df['price'].max()),
            'avg_price': float(df['price'].mean()), 'trade_count': len(df),
        },
    }
    return result, None


class VolumeProfileView(viewsets.ViewSet):
    """View for calculating and returning the Volume Profile (Volume at Price) for a symbol."""

    def list(self, request):
        symbol = request.query_params.get('symbol', '').upper()
        time_range = request.query_params.get('range', '1M')
        if not symbol:
            return Response({'error': 'Symbol is required'}, status=400)
        days = _RANGE_DAYS.get(time_range, 30)
        profile, err = _compute_profile(symbol, days)
        if err:
            return err
        return Response({'symbol': symbol, **profile})
