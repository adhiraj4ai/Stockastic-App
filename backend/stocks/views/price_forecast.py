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


def _compute_symbol_features(p, a):
    """Compute rolling features for a single symbol's price and accumulation DataFrames."""
    merged = pd.merge(p, a[['date', 'total_net']], on='date', how='left')
    merged['total_net'] = merged['total_net'].ffill().fillna(0)
    merged['vol_avg_20d'] = merged['volume'].rolling(20, min_periods=5).mean()
    merged['turn_avg_20d'] = merged['turnover'].rolling(20, min_periods=5).mean()
    merged['net_acc_10d'] = merged['total_net'] - merged['total_net'].shift(10).fillna(merged['total_net'])
    vol_safe = merged['vol_avg_20d'].replace(0, np.nan)
    turn_safe = merged['turn_avg_20d'].replace(0, np.nan)
    merged['intensity'] = (merged['net_acc_10d'] / vol_safe) * 100
    merged['volume_spike'] = merged['volume'] / vol_safe
    merged['turnover_spike'] = merged['turnover'] / turn_safe
    merged['avg_daily_volume_20d'] = merged['vol_avg_20d']
    return merged


def _compute_features(price_df, daily_acc_df):
    """
    For each symbol, merge price + accumulation daily totals and compute
    intensity, volume_spike, turnover_spike, net_acc_10d, and rolling averages.
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
        merged = _compute_symbol_features(p, a)
        merged['ticker'] = sym
        results.append(merged)

    if not results:
        return pd.DataFrame()
    return pd.concat(results, ignore_index=True)


def _identify_events(features_df, min_intensity):
    """Return rows that qualify as accumulation events."""
    mask = (
        features_df['intensity'].notna() &
        (features_df['intensity'] > min_intensity) &
        features_df['volume_spike'].notna() &
        (features_df['volume_spike'] > 1.2)
    )
    return features_df[mask].copy()


def _lookup_future_close(price_lookup, sym, t, lag):
    """Look up the next available close price for sym at t+lag (within +5 calendar days)."""
    future_date = t + timedelta(days=lag)
    for offset in range(6):
        key = (sym, pd.Timestamp(future_date + timedelta(days=offset)))
        if key in price_lookup.index:
            return float(price_lookup[key])
    return None


def _build_price_lookup(features_df):
    """Build a (ticker, date) -> close fast lookup from features DataFrame."""
    return (
        features_df[['ticker', 'date', 'close']]
        .drop_duplicates(subset=['ticker', 'date'])
        .set_index(['ticker', 'date'])['close']
    )


def _compute_forward_returns(events_df, features_df):
    """
    For each event at date T and symbol, look up close prices at T+5, T+10, T+20, T+30.
    Adds columns: price_Nd, return_Nd for each lag in LAGS.
    Returns only rows where at least one future price is available.
    """
    price_lookup = _build_price_lookup(features_df)
    rows = []
    for _, row in events_df.iterrows():
        sym, t, entry_price = row['ticker'], row['date'], row['close']
        if pd.isna(entry_price) or entry_price == 0:
            continue
        result = row.to_dict()
        has_future = False
        for lag in LAGS:
            future_close = _lookup_future_close(price_lookup, sym, t, lag)
            if future_close is not None and future_close > 0:
                result[f'price_{lag}d'] = future_close
                result[f'return_{lag}d'] = (future_close / float(entry_price) - 1) * 100
                has_future = True
            else:
                result[f'price_{lag}d'] = None
                result[f'return_{lag}d'] = None
        if has_future:
            rows.append(result)
    return pd.DataFrame(rows) if rows else pd.DataFrame()


def _compute_lag_stats(events_with_returns, lag):
    """Compute win rate and quantile stats for a single lag column."""
    col = f'return_{lag}d'
    series = events_with_returns[col].dropna()
    key = f'{lag}d'
    if series.empty:
        return key, None, None, None, None, None
    return (
        key,
        round(float((series > 0).mean()), 4),
        round(float(series.mean()), 4),
        round(float(series.median()), 4),
        round(float(series.quantile(0.25)), 4),
        round(float(series.quantile(0.75)), 4),
    )


def _compute_lag_analysis(events_with_returns):
    """Compute lag_analysis list for LAG_ANALYSIS_LAGS."""
    lag_analysis = []
    for lag in LAG_ANALYSIS_LAGS:
        col = f'return_{lag}d'
        series = events_with_returns[col].dropna() if col in events_with_returns.columns else pd.Series(dtype=float)
        if series.empty:
            lag_analysis.append({'lag': lag, 'win_rate': None, 'avg_return': None})
        else:
            lag_analysis.append({
                'lag': lag,
                'win_rate': round(float((series > 0).mean()), 4),
                'avg_return': round(float(series.mean()), 4),
            })
    return lag_analysis


def _compute_correlations(events_with_returns):
    """Compute volume_vs_5d and intensity_vs_20d correlations."""
    correlation = {}
    cols = events_with_returns.columns
    if 'volume_spike' in cols and 'return_5d' in cols:
        vs = events_with_returns[['volume_spike', 'return_5d']].dropna()
        if len(vs) > 2:
            correlation['volume_vs_5d'] = round(float(vs['volume_spike'].corr(vs['return_5d'])), 4)
    if 'intensity' in cols and 'return_20d' in cols:
        vi = events_with_returns[['intensity', 'return_20d']].dropna()
        if len(vi) > 2:
            correlation['intensity_vs_20d'] = round(float(vi['intensity'].corr(vi['return_20d'])), 4)
    return correlation


def _compute_scatter_data(events_with_returns):
    """Build scatter data list (max MAX_SCATTER_POINTS points)."""
    scatter_cols = ['intensity', 'return_10d', 'ticker', 'date']
    available = [c for c in scatter_cols if c in events_with_returns.columns]
    scatter_df = events_with_returns[available].dropna()
    if len(scatter_df) > MAX_SCATTER_POINTS:
        scatter_df = scatter_df.sample(MAX_SCATTER_POINTS, random_state=42)
    return [
        {
            'intensity': round(float(row['intensity']), 4),
            'return_10d': round(float(row['return_10d']), 4),
            'symbol': row['ticker'],
            'date': row['date'].strftime('%Y-%m-%d') if hasattr(row['date'], 'strftime') else str(row['date']),
        }
        for _, row in scatter_df.iterrows()
    ]


def _compute_study_stats(events_with_returns):
    """
    Given a DataFrame of events with return_Nd columns, compute summary statistics.
    Returns a dict matching the study schema.
    """
    win_rates, avg_returns, median_returns, p25_returns, p75_returns = {}, {}, {}, {}, {}
    for lag in LAGS:
        key, wr, avg, med, p25, p75 = _compute_lag_stats(events_with_returns, lag)
        win_rates[key] = wr
        avg_returns[key] = avg
        median_returns[key] = med
        p25_returns[key] = p25
        p75_returns[key] = p75

    return {
        'win_rates': win_rates,
        'avg_returns': avg_returns,
        'median_returns': median_returns,
        'p25_returns': p25_returns,
        'p75_returns': p75_returns,
        'correlation': _compute_correlations(events_with_returns),
        'scatter_data': _compute_scatter_data(events_with_returns),
        'lag_analysis': _compute_lag_analysis(events_with_returns),
    }


def _compute_single_lag_returns(events_df, price_lookup, lag):
    """Compute price and return columns for a single lag across all events."""
    prices, returns = [], []
    for _, row in events_df.iterrows():
        sym, t, entry_price = row['ticker'], row['date'], row['close']
        future_close = _lookup_future_close(price_lookup, sym, t, lag)
        if future_close is not None and not pd.isna(entry_price) and float(entry_price) > 0:
            prices.append(future_close)
            returns.append((future_close / float(entry_price) - 1) * 100)
        else:
            prices.append(None)
            returns.append(None)
    return prices, returns


def _add_extra_lags_for_analysis(events_df, features_df, extra_lags):
    """
    Compute forward returns for extra lags not already in events_df
    (used for lag_analysis which includes 1, 3, 7, 15, 25 in addition to main LAGS).
    """
    price_lookup = _build_price_lookup(features_df)
    all_lags = set(LAGS + extra_lags)
    missing_lags = [lag for lag in all_lags if f'return_{lag}d' not in events_df.columns]
    if not missing_lags:
        return events_df

    events_df = events_df.copy()
    for lag in missing_lags:
        prices, returns = _compute_single_lag_returns(events_df, price_lookup, lag)
        events_df[f'price_{lag}d'] = prices
        events_df[f'return_{lag}d'] = returns
    return events_df


# ---------------------------------------------------------------------------
# View 1: Market-wide accumulation study
# ---------------------------------------------------------------------------

def _empty_study_response(start_date):
    """Return a zero-events study payload."""
    return {
        'study': {
            'total_events': 0,
            'symbols_covered': 0,
            'date_range': {'from': str(start_date), 'to': str(date.today())},
            'lags': LAGS,
            'win_rates': {}, 'avg_returns': {}, 'median_returns': {},
            'p25_returns': {}, 'p75_returns': {}, 'correlation': {},
            'scatter_data': [], 'lag_analysis': [],
        }
    }


def _resolve_date_range(features, start_date):
    """Return (date_from, date_to) strings from the features DataFrame."""
    all_dates = features['date'].dropna()
    date_from = all_dates.min().strftime('%Y-%m-%d') if not all_dates.empty else str(start_date)
    date_to = all_dates.max().strftime('%Y-%m-%d') if not all_dates.empty else str(date.today())
    return date_from, date_to


def _build_study_payload(events_with_returns, features, start_date):
    """Assemble the final study response dict."""
    stats = _compute_study_stats(events_with_returns)
    date_from, date_to = _resolve_date_range(features, start_date)
    return {
        'total_events': len(events_with_returns),
        'symbols_covered': int(events_with_returns['ticker'].nunique()),
        'date_range': {'from': date_from, 'to': date_to},
        'lags': LAGS,
        **stats,
    }


def _load_features(symbols, start_date):
    """Load price + accumulation data and compute features. Returns (features, error_response)."""
    price_df = _load_price_df(symbols=symbols, start_date=start_date)
    if price_df.empty:
        return None, Response({'error': 'No price data available for the requested period.'}, status=404)
    acc_df = _load_acc_df(symbols=symbols, start_date=start_date)
    if acc_df.empty:
        return None, Response({'error': 'No accumulation data available for the requested period.'}, status=404)
    features = _compute_features(price_df, _build_daily_acc(acc_df))
    if features.empty:
        return None, Response({'error': 'Could not compute features — insufficient data.'}, status=422)
    return features, None


def _events_with_all_returns(features, min_intensity, start_date):
    """Identify events and compute all forward return lags. Returns (events_df, error_response)."""
    events = _identify_events(features, min_intensity)
    if events.empty:
        return None, Response(_empty_study_response(start_date))
    events_with_returns = _compute_forward_returns(events, features)
    if events_with_returns.empty:
        return None, Response({'error': 'No forward return data available (events too recent).'}, status=422)
    return _add_extra_lags_for_analysis(events_with_returns, features, LAG_ANALYSIS_LAGS), None


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
        symbols = [symbol_param] if symbol_param else None
        features, err = _load_features(symbols, start_date)
        if err:
            return err
        events_with_returns, err = _events_with_all_returns(features, min_intensity, start_date)
        if err:
            return err
        return Response({'study': _build_study_payload(events_with_returns, features, start_date)})


# ---------------------------------------------------------------------------
# View 2: Per-symbol accumulation forecast
# ---------------------------------------------------------------------------

class AccumulationForecastView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, symbol):
        """
        Per-symbol accumulation forecast. Thin wrapper around
        broker_research.accumulation_forecast() which already caches the heavy
        computation for 4h. No @cache_page here — it would cache 404 responses.
        """
        from stocks.services import broker_research

        symbol = symbol.upper().strip()
        try:
            min_intensity = float(request.query_params.get('min_intensity', 3.0))
        except (ValueError, TypeError):
            min_intensity = 3.0

        result = broker_research.accumulation_forecast(symbol=symbol, min_intensity=min_intensity)
        if result is None:
            return Response({'error': f'No data found for symbol {symbol}.'}, status=404)
        return Response(result)


def _select_matched_events(events_with_returns, current_intensity):
    """Return the best-matched subset of historical events by intensity proximity."""
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
    return matched, match_range


def _build_lag_band(matched, lag, current_price, current_date):
    """Compute a single price-band dict for a given lag."""
    col = f'return_{lag}d'
    if col not in matched.columns:
        return None
    series = matched[col].dropna()
    if series.empty:
        return None
    future_date = (current_date + timedelta(days=lag)).strftime('%Y-%m-%d')
    return {
        'p10': round(current_price * (1 + float(series.quantile(0.10)) / 100), 2),
        'p25': round(current_price * (1 + float(series.quantile(0.25)) / 100), 2),
        'p50': round(current_price * (1 + float(series.quantile(0.50)) / 100), 2),
        'p75': round(current_price * (1 + float(series.quantile(0.75)) / 100), 2),
        'p90': round(current_price * (1 + float(series.quantile(0.90)) / 100), 2),
        'date': future_date,
    }


def _build_projection(events_with_returns, current_intensity, current_price, current_date_str):
    """Find historically similar events (by intensity) and compute projected price bands."""
    if events_with_returns.empty or current_price is None or current_intensity == 0:
        return {'matched_events': 0, 'match_range': 'N/A', 'bands': {}}

    matched, match_range = _select_matched_events(events_with_returns, current_intensity)
    current_date = pd.Timestamp(current_date_str)
    bands = {}
    for lag in LAGS:
        band = _build_lag_band(matched, lag, current_price, current_date)
        if band is not None:
            bands[f'{lag}d'] = band

    return {'matched_events': len(matched), 'match_range': match_range, 'bands': bands}


def _event_outcome(row):
    """Derive outcome label from best available lag return."""
    best_ret = next(
        (r for r in [row.get('return_30d'), row.get('return_20d'), row.get('return_10d'), row.get('return_5d')]
         if r is not None and not pd.isna(r)),
        None,
    )
    return ('WON' if best_ret > 0 else 'LOST') if best_ret is not None else 'PENDING'


def _format_history_record(row):
    """Convert a single event row into a history dict."""
    entry_price = row.get('close')
    record = {
        'date': row['date'].strftime('%Y-%m-%d') if hasattr(row['date'], 'strftime') else str(row['date']),
        'intensity': round(float(row['intensity']), 4) if not pd.isna(row.get('intensity', float('nan'))) else None,
        'volume_spike': round(float(row['volume_spike']), 4) if not pd.isna(row.get('volume_spike', float('nan'))) else None,
        'entry_price': round(float(entry_price), 2),
        'outcome': _event_outcome(row),
    }
    for lag in LAGS:
        price_val = row.get(f'price_{lag}d')
        ret_val = row.get(f'return_{lag}d')
        record[f'price_{lag}d'] = round(float(price_val), 2) if price_val is not None and not pd.isna(price_val) else None
        record[f'return_{lag}d'] = round(float(ret_val), 4) if ret_val is not None and not pd.isna(ret_val) else None
    return record


def _build_history(events_with_returns):
    """Build the list of historical event records for the response."""
    if events_with_returns.empty:
        return []
    records = []
    for _, row in events_with_returns.sort_values('date', ascending=False).iterrows():
        if pd.isna(row.get('close')):
            continue
        records.append(_format_history_record(row))
    return records


def _format_price_series_row(row, event_dates):
    """Format a single row from features into a price-series dict."""
    close_val = row.get('close')
    vol_val = row.get('volume')
    turn_val = row.get('turnover')
    intensity_val = row.get('intensity')
    row_date = row['date']
    return {
        'date': row_date.strftime('%Y-%m-%d'),
        'close': round(float(close_val), 2) if close_val is not None and not pd.isna(close_val) else None,
        'intensity': round(float(intensity_val), 4) if intensity_val is not None and not pd.isna(intensity_val) else None,
        'volume': int(vol_val) if vol_val is not None and not pd.isna(vol_val) else None,
        'turnover': round(float(turn_val), 2) if turn_val is not None and not pd.isna(turn_val) else None,
        'is_event': row_date.date() in event_dates,
    }


def _build_price_series(features, events, symbol):
    """Build OHLCV + intensity series for charting, sorted ascending by date."""
    sym_features = features[features['ticker'] == symbol].sort_values('date')
    if sym_features.empty:
        return []
    event_dates = set(events[events['ticker'] == symbol]['date'].dt.date) if not events.empty else set()
    return [_format_price_series_row(row, event_dates) for _, row in sym_features.iterrows()]
