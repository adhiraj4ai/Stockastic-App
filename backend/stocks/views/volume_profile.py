from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from django.db import connections
from django.utils import timezone
from datetime import timedelta
import pandas as pd
import numpy as np

class VolumeProfileView(viewsets.ViewSet):
    """
    View for calculating and returning the Volume Profile (Volume at Price) for a symbol.
    """

    @action(detail=False, methods=['get'])
    def profile(self, request):
        symbol = request.query_params.get('symbol', '').upper()
        time_range = request.query_params.get('range', '1M')
        
        if not symbol:
            return Response({'error': 'Symbol is required'}, status=400)

        # 1. Determine Date Range
        range_map = {
            '1W': 7, '2W': 14, '1M': 30, '3M': 90, '6M': 180, '1Y': 365, 'ALL': 3650
        }
        days = range_map.get(time_range, 30)
        
        # Get the latest transaction date available in floorsheet to anchor the range
        with connections['default'].cursor() as cursor:
            cursor.execute("SELECT MAX(transaction_date) FROM daily_floorsheet WHERE symbol = %s", [symbol])
            max_date = cursor.fetchone()[0]
            if not max_date:
                return Response({'error': 'No data found for this symbol'}, status=404)
            start_date = max_date - timedelta(days=days)

        # 2. Fetch Floorsheet Data
        query = """
            SELECT transaction_rate, transaction_quantity
            FROM daily_floorsheet
            WHERE symbol = %s AND transaction_date >= %s AND transaction_date <= %s
        """
        
        with connections['default'].cursor() as cursor:
            cursor.execute(query, [symbol, start_date, max_date])
            rows = cursor.fetchall()

        if not rows:
            return Response({'error': 'No trades found in this range'}, status=404)

        # 3. Process Data with Pandas for efficiency
        df = pd.DataFrame(rows, columns=['price', 'volume'])
        
        # Convert to float for numeric operations
        df['price'] = df['price'].astype(float)
        df['volume'] = df['volume'].astype(float)

        total_volume = df['volume'].sum()
        min_price = df['price'].min()
        max_price = df['price'].max()

        # 4. Adaptive Binning
        # If we have too many unique prices, we group them into bins to make the chart readable
        unique_prices = df['price'].nunique()
        num_bins = min(50, unique_prices) # cap at 50 bars for UI clarity
        
        if unique_prices > num_bins:
            # Create price bins
            bins = np.linspace(min_price, max_price, num_bins + 1)
            df['price_bin'] = pd.cut(df['price'], bins=bins, labels=bins[:-1], include_lowest=True)
            profile_data = df.groupby('price_bin', observed=True)['volume'].sum().reset_index()
            profile_data.columns = ['price', 'volume']
        else:
            profile_data = df.groupby('price')['volume'].sum().reset_index()

        # 5. Calculate POC, VAH, VAL
        # POC (Point of Control) is the price with maximum volume
        poc_idx = profile_data['volume'].idxmax()
        poc_price = float(profile_data.loc[poc_idx, 'price'])

        # Value Area (70% of total volume)
        # We start from POC and expand outwards to include price levels until we reach 70% of total volume
        va_target = total_volume * 0.70
        
        # Sort by distance from POC price
        profile_data['dist_to_poc'] = abs(profile_data['price'].astype(float) - poc_price)
        profile_data_sorted = profile_data.sort_values('dist_to_poc')
        
        profile_data_sorted['cum_vol'] = profile_data_sorted['volume'].cumsum()
        value_area_rows = profile_data_sorted[profile_data_sorted['cum_vol'] <= va_target]
        
        if value_area_rows.empty:
             val = min_price
             vah = max_price
        else:
            val = float(value_area_rows['price'].min())
            vah = float(value_area_rows['price'].max())

        # 6. Prepare Final Output
        # Re-sort by price for the chart
        profile_data = profile_data.sort_values('price')
        
        bars = []
        for _, row in profile_data.iterrows():
            price_val = float(row['price'])
            bars.append({
                'price': price_val,
                'volume': float(row['volume']),
                'is_poc': price_val == poc_price,
                'is_val': price_val >= val and price_val <= vah
            })

        return Response({
            'symbol': symbol,
            'total_volume': float(total_volume),
            'poc': poc_price,
            'val': val,
            'vah': vah,
            'bars': bars,
            'stats': {
                'min_price': float(min_price),
                'max_price': float(max_price),
                'avg_price': float(df['price'].mean()),
                'trade_count': len(df)
            }
        })
