import numpy as np
import pandas as pd
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.decorators import permission_classes
from django.db.models import Sum
from django.utils.decorators import method_decorator
from django.views.decorators.cache import cache_page
from datetime import date, timedelta

from ..models import DailyStockPrice, DailyCumulativeAccumulation

LAGS = [5, 10, 20, 30]
LAG_ANALYSIS_LAGS = [1, 3, 5, 7, 10, 15, 20, 25, 30]
MAX_SCATTER_POINTS = 300
STUDY_YEARS = 2


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------

def _load_price_df(symbols=None, start_date=None):
    """
    Load DailyStockPrice into a DataFrame, corporate-action ADJUSTED so the
    event study sees continuous prices across bonus/rights ex-dates (matching
    the backtest harness) instead of phantom drops.
    Returns columns: ticker, date, open, high, low, close, volume, turnover, trans
    """
    from stocks.services.backtest_harness.adjustments import apply_adjustments_long
    from stocks.services.backtest_harness.runner import fetch_actions_map

    qs = DailyStockPrice.objects.filter(date__gte=start_date)
    if symbols:
        qs = qs.filter(ticker__in=symbols)
    values = qs.values('ticker', 'date', 'open', 'high', 'low', 'close', 'volume', 'turnover', 'trans')
    df = pd.DataFrame.from_records(values)
    if df.empty:
        return df
    for col in ('open', 'high', 'low', 'close', 'volume', 'turnover'):
        df[col] = pd.to_numeric(df[col], errors='coerce')
    df['trans'] = pd.to_numeric(df['trans'], errors='coerce')
    df['date'] = pd.to_datetime(df['date'])
    df = apply_adjustments_long(df, fetch_actions_map(df['ticker'].unique()))
    df.sort_values(['ticker', 'date'], inplace=True)
    df.reset_index(drop=True, inplace=True)
    return df


def _load_acc_df(symbols=None, start_date=None):
    """
    Load DailyCumulativeAccumulation into a DataFrame.
    Returns columns: symbol, transaction_date, entity_id, cumulative_net
    """
    qs = DailyCumulativeAccumulation.objects.filter(transaction_date__gte=start_date)
    if symbols:
        qs = qs.filter(symbol__in=symbols)
    values = qs.values('symbol', 'transaction_date', 'entity_id', 'cumulative_net')
    df = pd.DataFrame.from_records(values)
    if df.empty:
        return df
    df['cumulative_net'] = pd.to_numeric(df['cumulative_net'], errors='coerce').fillna(0)
    df['transaction_date'] = pd.to_datetime(df['transaction_date'])
    df.sort_values(['symbol', 'transaction_date'], inplace=True)
    df.reset_index(drop=True, inplace=True)
    return df


def _build_daily_acc(acc_df):
    """
    Aggregate cumulative_net across all brokers per (symbol, date).
    Returns a DataFrame with columns: symbol, date, total_net (sum of cumulative_net)
    """
    grouped = (
        acc_df
        .groupby(['symbol', 'transaction_date'], sort=True)['cumulative_net']
        .sum()
        .reset_index()
        .rename(columns={'transaction_date': 'date', 'cumulative_net': 'total_net'})
    )
    return grouped


def _compute_features(price_df, daily_acc_df):
    """
    For each symbol, merge price + accumulation daily totals, then compute:
      - net_acc_10d: change in total_net over 10-day window
      - vol_avg_20d: rolling 20-day mean volume
      - intensity: (net_acc_10d / vol_avg_20d) * 100
      - volume_spike: volume / vol_avg_20d
      - turnover_spike: turnover / rolling 20-day mean turnover

    Returns a merged DataFrame with all feature columns.
    """
    results = []

    price_symbols = set(price_df['ticker'].unique())
    acc_symbols = set(daily_acc_df['symbol'].unique()) if not daily_acc_df.empty else set()
    common_symbols = price_symbols & acc_symbols

    for sym in common_symbols:
        p = price_df[price_df['ticker'] == sym].copy().sort_values('date').reset_index(drop=True)
        a = daily_acc_df[daily_acc_df['symbol'] == sym].copy().sort_values('date').reset_index(drop=True)

        if len(p) < 30:
            continue

        # Merge on date
        merged = pd.merge(p, a[['date', 'total_net']], on='date', how='left')
        merged['total_net'] = merged['total_net'].ffill().fillna(0)

        # Rolling calculations
        merged['vol_avg_20d'] = merged['volume'].rolling(20, min_periods=5).mean()
        merged['turn_avg_20d'] = merged['turnover'].rolling(20, min_periods=5).mean()

        # 10-day change in cumulative net (shift(10) gives value 10 rows ago)
        merged['net_acc_10d'] = merged['total_net'] - merged['total_net'].shift(10).fillna(merged['total_net'])

        # Guard against zero division
        vol_safe = merged['vol_avg_20d'].replace(0, np.nan)
        turn_safe = merged['turn_avg_20d'].replace(0, np.nan)

        merged['intensity'] = (merged['net_acc_10d'] / vol_safe) * 100
        merged['volume_spike'] = merged['volume'] / vol_safe
        merged['turnover_spike'] = merged['turnover'] / turn_safe

        merged['avg_daily_volume_20d'] = merged['vol_avg_20d']
        merged['ticker'] = sym

        results.append(merged)

    if not results:
        return pd.DataFrame()

    out = pd.concat(results, ignore_index=True)
    return out


def _identify_events(features_df, min_intensity):
    """Return rows that qualify as accumulation events."""
    mask = (
        features_df['intensity'].notna() &
        (features_df['intensity'] > min_intensity) &
        features_df['volume_spike'].notna() &
        (features_df['volume_spike'] > 1.2)
    )
    return features_df[mask].copy()


def _compute_forward_returns(events_df, features_df):
    """
    For each event at date T and symbol, look up close prices at T+5, T+10, T+20, T+30.
    Adds columns: price_Nd, return_Nd for each lag in LAGS.
    Returns only rows where at least one future price is available.
    """
    # Build a fast lookup: (ticker, date) -> close
    price_lookup = (
        features_df[['ticker', 'date', 'close']]
        .drop_duplicates(subset=['ticker', 'date'])
        .set_index(['ticker', 'date'])['close']
    )

    rows = []
    for _, row in events_df.iterrows():
        sym = row['ticker']
        t = row['date']
        entry_price = row['close']
        if pd.isna(entry_price) or entry_price == 0:
            continue

        result = row.to_dict()
        has_future = False

        for lag in LAGS:
            future_date = t + timedelta(days=lag)
            # Try exact date first, then next available trading day (within +5 calendar days)
            future_close = None
            for offset in range(6):
                try_date = future_date + timedelta(days=offset)
                key = (sym, pd.Timestamp(try_date))
                if key in price_lookup.index:
                    future_close = float(price_lookup[key])
                    break

            if future_close is not None and future_close > 0:
                ret = (future_close / float(entry_price) - 1) * 100
                result[f'price_{lag}d'] = future_close
                result[f'return_{lag}d'] = ret
                has_future = True
            else:
                result[f'price_{lag}d'] = None
                result[f'return_{lag}d'] = None

        if has_future:
            rows.append(result)

    if not rows:
        return pd.DataFrame()
    return pd.DataFrame(rows)


def _compute_study_stats(events_with_returns):
    """
    Given a DataFrame of events with return_Nd columns, compute summary statistics.
    Returns a dict matching the study schema.
    """
    win_rates = {}
    avg_returns = {}
    median_returns = {}
    p25_returns = {}
    p75_returns = {}
    lag_analysis = []

    for lag in LAGS:
        col = f'return_{lag}d'
        series = events_with_returns[col].dropna()
        if series.empty:
            win_rates[f'{lag}d'] = None
            avg_returns[f'{lag}d'] = None
            median_returns[f'{lag}d'] = None
            p25_returns[f'{lag}d'] = None
            p75_returns[f'{lag}d'] = None
        else:
            win_rates[f'{lag}d'] = round(float((series > 0).mean()), 4)
            avg_returns[f'{lag}d'] = round(float(series.mean()), 4)
            median_returns[f'{lag}d'] = round(float(series.median()), 4)
            p25_returns[f'{lag}d'] = round(float(series.quantile(0.25)), 4)
            p75_returns[f'{lag}d'] = round(float(series.quantile(0.75)), 4)

    for lag in LAG_ANALYSIS_LAGS:
        col = f'return_{lag}d'
        if col in events_with_returns.columns:
            series = events_with_returns[col].dropna()
        else:
            series = pd.Series(dtype=float)
        if series.empty:
            lag_analysis.append({'lag': lag, 'win_rate': None, 'avg_return': None})
        else:
            lag_analysis.append({
                'lag': lag,
                'win_rate': round(float((series > 0).mean()), 4),
                'avg_return': round(float(series.mean()), 4),
            })

    # Correlations
    correlation = {}
    if 'volume_spike' in events_with_returns.columns and 'return_5d' in events_with_returns.columns:
        vs = events_with_returns[['volume_spike', 'return_5d']].dropna()
        if len(vs) > 2:
            correlation['volume_vs_5d'] = round(float(vs['volume_spike'].corr(vs['return_5d'])), 4)
    if 'intensity' in events_with_returns.columns and 'return_20d' in events_with_returns.columns:
        vi = events_with_returns[['intensity', 'return_20d']].dropna()
        if len(vi) > 2:
            correlation['intensity_vs_20d'] = round(float(vi['intensity'].corr(vi['return_20d'])), 4)

    # Scatter data (max 300 points)
    scatter_cols = ['intensity', 'return_10d', 'ticker', 'date']
    scatter_available = [c for c in scatter_cols if c in events_with_returns.columns]
    scatter_df = events_with_returns[scatter_available].dropna()
    if len(scatter_df) > MAX_SCATTER_POINTS:
        scatter_df = scatter_df.sample(MAX_SCATTER_POINTS, random_state=42)
    scatter_data = []
    for _, row in scatter_df.iterrows():
        scatter_data.append({
            'intensity': round(float(row['intensity']), 4),
            'return_10d': round(float(row['return_10d']), 4),
            'symbol': row['ticker'],
            'date': row['date'].strftime('%Y-%m-%d') if hasattr(row['date'], 'strftime') else str(row['date']),
        })

    return {
        'win_rates': win_rates,
        'avg_returns': avg_returns,
        'median_returns': median_returns,
        'p25_returns': p25_returns,
        'p75_returns': p75_returns,
        'correlation': correlation,
        'scatter_data': scatter_data,
        'lag_analysis': lag_analysis,
    }


def _add_extra_lags_for_analysis(events_df, features_df, extra_lags):
    """
    Compute forward returns for extra lags not already in events_df
    (used for lag_analysis which includes 1, 3, 7, 15, 25 in addition to main LAGS).
    """
    price_lookup = (
        features_df[['ticker', 'date', 'close']]
        .drop_duplicates(subset=['ticker', 'date'])
        .set_index(['ticker', 'date'])['close']
    )

    all_lags = set(LAGS + extra_lags)
    missing_lags = [lag for lag in all_lags if f'return_{lag}d' not in events_df.columns]
    if not missing_lags:
        return events_df

    for lag in missing_lags:
        col = f'return_{lag}d'
        col_price = f'price_{lag}d'
        returns = []
        prices = []
        for _, row in events_df.iterrows():
            sym = row['ticker']
            t = row['date']
            entry_price = row['close']
            future_close = None
            future_date = t + timedelta(days=lag)
            for offset in range(6):
                try_date = future_date + timedelta(days=offset)
                key = (sym, pd.Timestamp(try_date))
                if key in price_lookup.index:
                    future_close = float(price_lookup[key])
                    break
            if future_close is not None and not pd.isna(entry_price) and float(entry_price) > 0:
                ret = (future_close / float(entry_price) - 1) * 100
                prices.append(future_close)
                returns.append(ret)
            else:
                prices.append(None)
                returns.append(None)
        events_df = events_df.copy()
        events_df[col_price] = prices
        events_df[col] = returns

    return events_df


# ---------------------------------------------------------------------------
# View 1: Market-wide accumulation study
# ---------------------------------------------------------------------------

class AccumulationPriceStudyView(APIView):
    permission_classes = [IsAuthenticated]

    @method_decorator(cache_page(4 * 60 * 60))
    def get(self, request):
        symbol_param = request.query_params.get('symbol', None)
        try:
            min_intensity = float(request.query_params.get('min_intensity', 3.0))
        except (ValueError, TypeError):
            min_intensity = 3.0

        start_date = date.today() - timedelta(days=STUDY_YEARS * 365)

        # Load data
        symbols = [symbol_param] if symbol_param else None
        price_df = _load_price_df(symbols=symbols, start_date=start_date)
        if price_df.empty:
            return Response({'error': 'No price data available for the requested period.'}, status=404)

        acc_df = _load_acc_df(symbols=symbols, start_date=start_date)
        if acc_df.empty:
            return Response({'error': 'No accumulation data available for the requested period.'}, status=404)

        daily_acc = _build_daily_acc(acc_df)
        features = _compute_features(price_df, daily_acc)
        if features.empty:
            return Response({'error': 'Could not compute features — insufficient data.'}, status=422)

        events = _identify_events(features, min_intensity)
        if events.empty:
            return Response({
                'study': {
                    'total_events': 0,
                    'symbols_covered': 0,
                    'date_range': {'from': str(start_date), 'to': str(date.today())},
                    'lags': LAGS,
                    'win_rates': {}, 'avg_returns': {}, 'median_returns': {},
                    'p25_returns': {}, 'p75_returns': {}, 'correlation': {},
                    'scatter_data': [], 'lag_analysis': [],
                }
            })

        events_with_returns = _compute_forward_returns(events, features)
        if events_with_returns.empty:
            return Response({'error': 'No forward return data available (events too recent).'}, status=422)

        # Add extra lags for lag_analysis
        events_with_returns = _add_extra_lags_for_analysis(events_with_returns, features, LAG_ANALYSIS_LAGS)

        stats = _compute_study_stats(events_with_returns)

        # Date range
        all_dates = features['date'].dropna()
        date_from = all_dates.min().strftime('%Y-%m-%d') if not all_dates.empty else str(start_date)
        date_to = all_dates.max().strftime('%Y-%m-%d') if not all_dates.empty else str(date.today())

        study = {
            'total_events': len(events_with_returns),
            'symbols_covered': int(events_with_returns['ticker'].nunique()),
            'date_range': {'from': date_from, 'to': date_to},
            'lags': LAGS,
            **stats,
        }

        return Response({'study': study})


# ---------------------------------------------------------------------------
# View 2: Per-symbol accumulation forecast
# ---------------------------------------------------------------------------

class AccumulationForecastView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, symbol):
        symbol = symbol.upper().strip()
        try:
            min_intensity = float(request.query_params.get('min_intensity', 3.0))
        except (ValueError, TypeError):
            min_intensity = 3.0

        start_date = date.today() - timedelta(days=STUDY_YEARS * 365)

        # Load price data for this symbol
        price_df = _load_price_df(symbols=[symbol], start_date=start_date)
        if price_df.empty:
            return Response({'error': f'No price data found for symbol {symbol}.'}, status=404)

        acc_df = _load_acc_df(symbols=[symbol], start_date=start_date)
        if acc_df.empty:
            return Response({'error': f'No accumulation data found for symbol {symbol}.'}, status=404)

        daily_acc = _build_daily_acc(acc_df)
        features = _compute_features(price_df, daily_acc)
        if features.empty:
            return Response({'error': f'Insufficient data to compute features for {symbol}.'}, status=422)

        # ---------------------------------------------------------------
        # Current state (most recent row with valid intensity)
        # ---------------------------------------------------------------
        latest = features[features['ticker'] == symbol].sort_values('date')
        latest_valid = latest[latest['intensity'].notna()]
        if latest_valid.empty:
            return Response({'error': f'Cannot compute current accumulation intensity for {symbol}.'}, status=422)

        current_row = latest_valid.iloc[-1]
        current_price = float(current_row['close']) if not pd.isna(current_row['close']) else None
        current_date = current_row['date'].strftime('%Y-%m-%d')
        current_intensity = float(current_row['intensity']) if not pd.isna(current_row['intensity']) else 0.0
        current_vol_spike = float(current_row['volume_spike']) if not pd.isna(current_row['volume_spike']) else None
        current_turn_spike = float(current_row['turnover_spike']) if not pd.isna(current_row['turnover_spike']) else None
        current_net_acc_10d = float(current_row['net_acc_10d']) if not pd.isna(current_row['net_acc_10d']) else 0.0
        current_avg_vol = float(current_row['avg_daily_volume_20d']) if not pd.isna(current_row['avg_daily_volume_20d']) else None

        current_state = {
            'ltp': round(current_price, 2) if current_price else None,
            'date': current_date,
            'intensity': round(current_intensity, 4),
            'volume_spike': round(current_vol_spike, 4) if current_vol_spike else None,
            'turnover_spike': round(current_turn_spike, 4) if current_turn_spike else None,
            'net_acc_10d': round(current_net_acc_10d, 2),
            'avg_daily_volume_20d': round(current_avg_vol, 2) if current_avg_vol else None,
        }

        # ---------------------------------------------------------------
        # Study — all historical events for this symbol
        # ---------------------------------------------------------------
        events = _identify_events(features, min_intensity)
        events_with_returns = _compute_forward_returns(events, features) if not events.empty else pd.DataFrame()
        if not events_with_returns.empty:
            events_with_returns = _add_extra_lags_for_analysis(events_with_returns, features, LAG_ANALYSIS_LAGS)
            stats = _compute_study_stats(events_with_returns)
            study = {
                'total_events': len(events_with_returns),
                **stats,
            }
        else:
            study = {
                'total_events': 0,
                'win_rates': {}, 'avg_returns': {}, 'median_returns': {},
                'p25_returns': {}, 'p75_returns': {}, 'correlation': {},
                'scatter_data': [], 'lag_analysis': [],
            }

        # ---------------------------------------------------------------
        # Projection model
        # ---------------------------------------------------------------
        projection = _build_projection(events_with_returns, current_intensity, current_price, current_date)

        # ---------------------------------------------------------------
        # History table (individual past events)
        # ---------------------------------------------------------------
        history = _build_history(events_with_returns)

        # ---------------------------------------------------------------
        # Price series (full OHLCV + intensity for charting)
        # ---------------------------------------------------------------
        price_series = _build_price_series(features, events, symbol)

        return Response({
            'symbol': symbol,
            'current': current_state,
            'study': study,
            'projection': projection,
            'history': history,
            'price_series': price_series,
        })


def _build_projection(events_with_returns, current_intensity, current_price, current_date_str):
    """
    Find historically similar events (by intensity) and compute projected price bands.
    """
    if events_with_returns.empty or current_price is None or current_intensity == 0:
        return {
            'matched_events': 0,
            'match_range': 'N/A',
            'bands': {},
        }

    def _get_matched(df, pct):
        lo = current_intensity * (1 - pct)
        hi = current_intensity * (1 + pct)
        return df[(df['intensity'] >= lo) & (df['intensity'] <= hi)]

    matched = _get_matched(events_with_returns, 0.5)
    match_range = '±50%'
    if len(matched) < 5:
        matched = _get_matched(events_with_returns, 1.0)
        match_range = '±100%'
    if len(matched) < 3:
        matched = events_with_returns.copy()
        match_range = 'all events'

    current_date = pd.Timestamp(current_date_str)
    bands = {}
    for lag in LAGS:
        col = f'return_{lag}d'
        if col not in matched.columns:
            continue
        series = matched[col].dropna()
        if series.empty:
            continue
        future_date = (current_date + timedelta(days=lag)).strftime('%Y-%m-%d')
        bands[f'{lag}d'] = {
            'p10': round(current_price * (1 + float(series.quantile(0.10)) / 100), 2),
            'p25': round(current_price * (1 + float(series.quantile(0.25)) / 100), 2),
            'p50': round(current_price * (1 + float(series.quantile(0.50)) / 100), 2),
            'p75': round(current_price * (1 + float(series.quantile(0.75)) / 100), 2),
            'p90': round(current_price * (1 + float(series.quantile(0.90)) / 100), 2),
            'date': future_date,
        }

    return {
        'matched_events': len(matched),
        'match_range': match_range,
        'bands': bands,
    }


def _build_history(events_with_returns):
    """Build the list of historical event records for the response."""
    if events_with_returns.empty:
        return []

    records = []
    for _, row in events_with_returns.sort_values('date', ascending=False).iterrows():
        entry_price = row.get('close')
        if pd.isna(entry_price):
            continue

        ret_30d = row.get('return_30d')
        ret_20d = row.get('return_20d')
        ret_10d = row.get('return_10d')
        ret_5d = row.get('return_5d')

        # Outcome based on best available lag
        best_ret = next((r for r in [ret_30d, ret_20d, ret_10d, ret_5d] if r is not None and not pd.isna(r)), None)
        outcome = ('WON' if best_ret > 0 else 'LOST') if best_ret is not None else 'PENDING'

        record = {
            'date': row['date'].strftime('%Y-%m-%d') if hasattr(row['date'], 'strftime') else str(row['date']),
            'intensity': round(float(row['intensity']), 4) if not pd.isna(row.get('intensity', float('nan'))) else None,
            'volume_spike': round(float(row['volume_spike']), 4) if not pd.isna(row.get('volume_spike', float('nan'))) else None,
            'entry_price': round(float(entry_price), 2),
            'outcome': outcome,
        }
        for lag in LAGS:
            price_val = row.get(f'price_{lag}d')
            ret_val = row.get(f'return_{lag}d')
            record[f'price_{lag}d'] = round(float(price_val), 2) if price_val is not None and not pd.isna(price_val) else None
            record[f'return_{lag}d'] = round(float(ret_val), 4) if ret_val is not None and not pd.isna(ret_val) else None

        records.append(record)

    return records


def _build_price_series(features, events, symbol):
    """Build OHLCV + intensity series for charting, sorted ascending by date."""
    sym_features = features[features['ticker'] == symbol].sort_values('date')
    if sym_features.empty:
        return []

    # Build a set of event dates for quick lookup
    if not events.empty:
        sym_events = events[events['ticker'] == symbol]
        event_dates = set(sym_events['date'].dt.date)
    else:
        event_dates = set()

    series = []
    for _, row in sym_features.iterrows():
        close_val = row.get('close')
        vol_val = row.get('volume')
        turn_val = row.get('turnover')
        intensity_val = row.get('intensity')
        row_date = row['date']
        is_event = row_date.date() in event_dates

        series.append({
            'date': row_date.strftime('%Y-%m-%d'),
            'close': round(float(close_val), 2) if close_val is not None and not pd.isna(close_val) else None,
            'intensity': round(float(intensity_val), 4) if intensity_val is not None and not pd.isna(intensity_val) else None,
            'volume': int(vol_val) if vol_val is not None and not pd.isna(vol_val) else None,
            'turnover': round(float(turn_val), 2) if turn_val is not None and not pd.isna(turn_val) else None,
            'is_event': is_event,
        })

    return series
