import numpy as np
import pandas as pd
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from django.views.decorators.cache import cache_page
from django.utils.decorators import method_decorator
from stocks.models import Company, DailyStockPrice, DailyCumulativeAccumulation
import datetime
from datetime import date, timedelta
from collections import defaultdict

LAGS = [5, 10, 20, 30]
LAG_ANALYSIS_LAGS = [1, 3, 5, 7, 10, 15, 20, 25, 30]
MAX_SCATTER_POINTS = 300
STUDY_YEARS = 2


# ---------------------------------------------------------------------------
# Helpers for accumulation intensity computation
# ---------------------------------------------------------------------------

def _load_price_df_sector(symbols=None, start_date=None):
    # Corporate-action adjusted (close/volume) so sector momentum doesn't read
    # bonus ex-date drops as price moves — consistent with the backtest harness.
    from stocks.services.backtest_harness.adjustments import apply_adjustments_long
    from stocks.services.backtest_harness.runner import fetch_actions_map

    qs = DailyStockPrice.objects.filter(date__gte=start_date)
    if symbols:
        qs = qs.filter(ticker__in=symbols)
    values = qs.values('ticker', 'date', 'close', 'volume')
    df = pd.DataFrame.from_records(values)
    if df.empty:
        return df
    df['close'] = pd.to_numeric(df['close'], errors='coerce')
    df['volume'] = pd.to_numeric(df['volume'], errors='coerce')
    df['date'] = pd.to_datetime(df['date'])
    df = apply_adjustments_long(df, fetch_actions_map(df['ticker'].unique()),
                                price_cols=('close',))
    df.sort_values(['ticker', 'date'], inplace=True)
    df.reset_index(drop=True, inplace=True)
    return df


def _load_acc_df_sector(symbols=None, start_date=None):
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


def _aggregate_daily_acc(acc_df):
    """Sum cumulative_net across all entity_ids per (symbol, date)."""
    return (
        acc_df
        .groupby(['symbol', 'transaction_date'])['cumulative_net']
        .sum()
        .reset_index()
        .rename(columns={'transaction_date': 'date', 'cumulative_net': 'total_net'})
        .assign(date=lambda df: pd.to_datetime(df['date']))
    )


def _compute_symbol_signal(sym, price_df, daily_acc):
    """Compute net_acc_10d and clamped intensity for a single symbol. Returns None if insufficient data."""
    p = price_df[price_df['ticker'] == sym].copy().sort_values('date').reset_index(drop=True)
    a = daily_acc[daily_acc['symbol'] == sym].copy().sort_values('date').reset_index(drop=True)

    if len(p) < 20:
        return None

    merged = pd.merge(p, a[['date', 'total_net']], on='date', how='left')
    merged['total_net'] = merged['total_net'].ffill().fillna(0)
    merged['vol_avg_20d'] = merged['volume'].rolling(20, min_periods=5).mean()
    merged['net_acc_10d'] = merged['total_net'] - merged['total_net'].shift(10).fillna(merged['total_net'])

    latest = merged.dropna(subset=['vol_avg_20d']).tail(1)
    if latest.empty:
        return None

    row = latest.iloc[-1]
    avg_vol = float(row['vol_avg_20d'])
    net_10d = float(row['net_acc_10d'])

    if avg_vol <= 0:
        return None

    intensity = max(-50.0, min(50.0, (net_10d / avg_vol) * 100))
    return {'net_acc_10d': net_10d, 'intensity': intensity}


def _aggregate_sector_acc_signals(symbol_signals, sector_mapping):
    """Group per-symbol signals into per-sector aggregates."""
    sector_acc = defaultdict(lambda: {
        'intensities': [],
        'net_acc_10d_list': [],
        'positive_count': 0,
        'symbol_intensities': {},
    })

    for sym, sig in symbol_signals.items():
        sector = sector_mapping.get(sym)
        if not sector:
            continue
        sector_acc[sector]['intensities'].append(sig['intensity'])
        sector_acc[sector]['net_acc_10d_list'].append(sig['net_acc_10d'])
        if sig['net_acc_10d'] > 0:
            sector_acc[sector]['positive_count'] += 1
        sector_acc[sector]['symbol_intensities'][sym] = sig['intensity']

    return sector_acc


def _build_sector_acc_result(data):
    """Convert raw sector accumulation data dict into the public result dict."""
    intensities = data['intensities']
    if not intensities:
        return None

    acc_intensity = round(float(np.mean(intensities)), 2)
    acc_net_10d = round(float(np.sum(data['net_acc_10d_list'])), 0)
    acc_stocks_count = data['positive_count']

    if acc_intensity > 3:
        acc_signal = 'accumulating'
    elif acc_intensity < -3:
        acc_signal = 'distributing'
    else:
        acc_signal = 'neutral'

    sym_int = data['symbol_intensities']
    top_stocks = sorted(sym_int.keys(), key=lambda s: sym_int[s], reverse=True)[:3]

    return {
        'acc_intensity': acc_intensity,
        'acc_net_10d': int(acc_net_10d),
        'acc_signal': acc_signal,
        'acc_stocks_count': acc_stocks_count,
        'top_accumulated_stocks': top_stocks,
    }


def _collect_symbol_signals(price_df, daily_acc):
    """Return {symbol: signal} for all symbols common to both DataFrames."""
    common_symbols = set(daily_acc['symbol'].unique()) & set(price_df['ticker'].unique())
    symbol_signals = {}
    for sym in common_symbols:
        sig = _compute_symbol_signal(sym, price_df, daily_acc)
        if sig is not None:
            symbol_signals[sym] = sig
    return symbol_signals


def _finalize_sector_acc_results(sector_acc):
    """Convert raw sector_acc dict to public results, dropping empty sectors."""
    results = {}
    for sector, data in sector_acc.items():
        result = _build_sector_acc_result(data)
        if result is not None:
            results[sector] = result
    return results


def _compute_current_acc_signals(sector_mapping):
    # Returns: sector -> {acc_intensity, acc_net_10d, acc_signal, acc_stocks_count, top_stocks}
    start_date = date.today() - timedelta(days=45)
    all_symbols = list(sector_mapping.keys())
    if not all_symbols:
        return {}

    price_df = _load_price_df_sector(symbols=all_symbols, start_date=start_date)
    acc_df = _load_acc_df_sector(symbols=all_symbols, start_date=start_date)
    if price_df.empty or acc_df.empty:
        return {}

    daily_acc = _aggregate_daily_acc(acc_df)
    symbol_signals = _collect_symbol_signals(price_df, daily_acc)
    sector_acc = _aggregate_sector_acc_signals(symbol_signals, sector_mapping)
    return _finalize_sector_acc_results(sector_acc)


# ---------------------------------------------------------------------------
# View 1: get_sector_rotation (enhanced with accumulation signals)
# ---------------------------------------------------------------------------

def _fetch_anchor_dates(latest_date):
    """Build a dict of timeframe_name -> closest actual trading date."""
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
        closest = (
            DailyStockPrice.objects
            .filter(date__lte=target_date)
            .order_by('-date')
            .values_list('date', flat=True)
            .first()
        )
        anchor_dates[name] = closest
    return anchor_dates


def _build_price_lookup(latest_date, anchor_dates):
    """Fetch all relevant prices and return a nested dict: ticker -> date_str -> price_row."""
    relevant_dates = {latest_date} | {d for d in anchor_dates.values() if d}
    prices = DailyStockPrice.objects.filter(date__in=relevant_dates).values('ticker', 'date', 'close', 'prev_close')
    price_lookup = defaultdict(dict)
    for p in prices:
        price_lookup[p['ticker']][str(p['date'])] = p
    return price_lookup


def _calculate_avg(values):
    if not values:
        return 0.0
    return round(sum(values) / len(values), 2)


def _compute_ticker_returns(dates_data, latest_date_str, anchor_dates):
    """Return a dict of timeframe_name -> [returns] for a single ticker."""
    returns = defaultdict(list)
    latest_price_obj = dates_data.get(latest_date_str)
    if not latest_price_obj:
        return None, returns

    latest_close = latest_price_obj['close']
    if not latest_close:
        return None, returns

    for tf_name, tf_date in anchor_dates.items():
        if not tf_date:
            continue
        if tf_name == 'daily':
            prev = latest_price_obj.get('prev_close')
            if prev and prev > 0:
                returns['daily'].append(float(((latest_close - prev) / prev) * 100))
            continue
        anchor_price_obj = dates_data.get(str(tf_date))
        if anchor_price_obj and anchor_price_obj.get('close') and anchor_price_obj['close'] > 0:
            ret = ((latest_close - anchor_price_obj['close']) / anchor_price_obj['close']) * 100
            returns[tf_name].append(float(ret))

    return latest_close, returns


def _build_sector_data(price_lookup, sector_mapping, latest_date_str, anchor_dates):
    """Aggregate per-sector return lists from price_lookup."""
    sector_data = defaultdict(lambda: {'count': 0, 'returns': defaultdict(list)})

    for ticker, dates_data in price_lookup.items():
        sector = sector_mapping.get(ticker)
        if not sector:
            continue
        latest_close, returns = _compute_ticker_returns(dates_data, latest_date_str, anchor_dates)
        if latest_close is None:
            continue
        sector_data[sector]['count'] += 1
        for tf_name, values in returns.items():
            sector_data[sector]['returns'][tf_name].extend(values)

    return sector_data


def _format_sector_result(sector, data, acc_signals):
    """Build the dict for a single sector in the rotation response."""
    returns = data['returns']
    acc = acc_signals.get(sector, {})
    return {
        'sector': sector,
        'stock_count': data['count'],
        'daily_return': _calculate_avg(returns['daily']),
        'weekly_return': _calculate_avg(returns['weekly']),
        'monthly_return': _calculate_avg(returns['monthly']),
        'three_month_return': _calculate_avg(returns['three_month']),
        'six_month_return': _calculate_avg(returns['six_month']),
        'yearly_return': _calculate_avg(returns['yearly']),
        'acc_intensity': acc.get('acc_intensity', 0.0),
        'acc_net_10d': acc.get('acc_net_10d', 0),
        'acc_signal': acc.get('acc_signal', 'neutral'),
        'acc_stocks_count': acc.get('acc_stocks_count', 0),
    }


@api_view(['GET'])
@permission_classes([AllowAny])
def get_sector_rotation(request):
    """
    Groups and aggregates stock performance by Sector to support the Sector Rotation feature.
    Calculates average percent changes for various timeframes by fetching historical prices.
    Also includes per-sector accumulation signals.
    """
    latest_date = DailyStockPrice.objects.order_by('-date').values_list('date', flat=True).first()
    if not latest_date:
        return Response({'status': 'error', 'message': 'No price data available.', 'sectors': []})

    anchor_dates = _fetch_anchor_dates(latest_date)
    price_lookup = _build_price_lookup(latest_date, anchor_dates)

    companies = Company.objects.exclude(sector__isnull=True).exclude(sector__exact='').values('symbol', 'sector')
    sector_mapping = {c['symbol']: c['sector'] for c in companies}

    sector_data = _build_sector_data(price_lookup, sector_mapping, str(latest_date), anchor_dates)
    acc_signals = _compute_current_acc_signals(sector_mapping)

    results = [
        _format_sector_result(sector, data, acc_signals)
        for sector, data in sector_data.items()
        if data['count'] > 0
    ]
    results.sort(key=lambda x: x['acc_intensity'], reverse=True)

    return Response({'status': 'success', 'sectors': results, 'count': len(results)})


# ---------------------------------------------------------------------------
# View 2: get_sector_rotation_study (sector accumulation → excess return proof)
# ---------------------------------------------------------------------------

def _load_study_price_df(start_date):
    """Load and clean price DataFrame for the study period."""
    price_qs = DailyStockPrice.objects.filter(date__gte=start_date).values('ticker', 'date', 'close', 'volume')
    price_df = pd.DataFrame.from_records(price_qs)
    if price_df.empty:
        return price_df
    price_df['close'] = pd.to_numeric(price_df['close'], errors='coerce')
    price_df['volume'] = pd.to_numeric(price_df['volume'], errors='coerce')
    price_df['date'] = pd.to_datetime(price_df['date'])
    price_df.sort_values(['ticker', 'date'], inplace=True)
    price_df.reset_index(drop=True, inplace=True)
    return price_df


def _load_study_acc_df(start_date):
    """Load and clean accumulation DataFrame for the study period."""
    acc_qs = DailyCumulativeAccumulation.objects.filter(
        transaction_date__gte=start_date
    ).values('symbol', 'transaction_date', 'cumulative_net')
    acc_df = pd.DataFrame.from_records(acc_qs)
    if acc_df.empty:
        return acc_df
    acc_df['cumulative_net'] = pd.to_numeric(acc_df['cumulative_net'], errors='coerce').fillna(0)
    acc_df['transaction_date'] = pd.to_datetime(acc_df['transaction_date'])
    return acc_df


def _compute_symbol_intensity_series(sym, price_df, daily_acc, sector_mapping):
    """Compute rolling intensity time series rows for a single symbol."""
    p = price_df[price_df['ticker'] == sym].copy().sort_values('date').reset_index(drop=True)
    a = daily_acc[daily_acc['symbol'] == sym].copy().sort_values('date').reset_index(drop=True)

    if len(p) < 30:
        return []

    merged = pd.merge(p, a[['date', 'total_net']], on='date', how='left')
    merged['total_net'] = merged['total_net'].ffill().fillna(0)
    merged['vol_avg_20d'] = merged['volume'].rolling(20, min_periods=5).mean()
    merged['net_acc_10d'] = merged['total_net'] - merged['total_net'].shift(10).fillna(merged['total_net'])
    vol_safe = merged['vol_avg_20d'].replace(0, np.nan)
    merged['intensity'] = (merged['net_acc_10d'] / vol_safe * 100).clip(-50, 50)

    rows = []
    for _, row in merged[merged['intensity'].notna()].iterrows():
        rows.append({
            'ticker': sym,
            'date': row['date'],
            'intensity': float(row['intensity']),
            'sector': sector_mapping[sym],
        })
    return rows


def _build_intensity_df(price_df, daily_acc, sector_mapping):
    """Build intensity DataFrame across all common symbols."""
    price_symbols = set(price_df['ticker'].unique())
    acc_symbols = set(daily_acc['symbol'].unique())
    common_symbols = price_symbols & acc_symbols & set(sector_mapping.keys())

    all_rows = []
    for sym in common_symbols:
        all_rows.extend(_compute_symbol_intensity_series(sym, price_df, daily_acc, sector_mapping))

    if not all_rows:
        return pd.DataFrame()

    intensity_df = pd.DataFrame(all_rows)
    intensity_df['date'] = pd.to_datetime(intensity_df['date'])
    return intensity_df


def _build_sector_intensity_df(intensity_df):
    """Aggregate per-symbol intensities into per-sector intensities by date."""
    sector_intensity_df = (
        intensity_df
        .groupby(['date', 'sector'])
        .agg(sector_intensity=('intensity', 'mean'), stock_count=('ticker', 'count'))
        .reset_index()
    )
    return sector_intensity_df[sector_intensity_df['stock_count'] >= 2]


def _build_close_pivot(price_df):
    """Return wide pivot table of close prices: index=date, columns=ticker."""
    pivot = price_df.pivot_table(index='date', columns='ticker', values='close', aggfunc='last')
    return pivot.sort_index()


def _get_closest_close(close_pivot, ticker, target_date, tolerance=5):
    """Find close price for ticker at or after target_date within tolerance calendar days."""
    if ticker not in close_pivot.columns:
        return None
    for offset in range(tolerance + 1):
        try_date = pd.Timestamp(target_date) + pd.Timedelta(days=offset)
        if try_date in close_pivot.index:
            val = close_pivot.loc[try_date, ticker]
            if not pd.isna(val) and val > 0:
                return float(val)
    return None


def _sector_return_at(close_pivot, sector_tickers, sector, date_t, lag_days):
    """Return sector average percent return from date_t to date_t + lag_days."""
    tickers = sector_tickers.get(sector, [])
    if not tickers:
        return None
    target_date = date_t + pd.Timedelta(days=lag_days)
    returns = []
    for t in tickers:
        p0 = _get_closest_close(close_pivot, t, date_t, tolerance=0)
        p1 = _get_closest_close(close_pivot, t, target_date, tolerance=5)
        if p0 and p1 and p0 > 0:
            returns.append((p1 / p0 - 1) * 100)
    return float(np.mean(returns)) if returns else None


def _market_return_at(close_pivot, date_t, lag_days):
    """Return market-wide average percent return from date_t to date_t + lag_days."""
    if date_t not in close_pivot.index:
        return None
    p0_series = close_pivot.loc[date_t]
    target_ts = pd.Timestamp(date_t + pd.Timedelta(days=lag_days))
    p1_series = None
    for offset in range(6):
        try_date = target_ts + pd.Timedelta(days=offset)
        if try_date in close_pivot.index:
            p1_series = close_pivot.loc[try_date]
            break
    if p1_series is None:
        return None
    valid = (p0_series > 0) & p1_series.notna() & p0_series.notna() & (p1_series > 0)
    if valid.sum() == 0:
        return None
    return float(((p1_series[valid] / p0_series[valid]) - 1) * 100).mean() if False else float(((p1_series[valid] / p0_series[valid] - 1) * 100).mean())


def _build_event_records(events_df, close_pivot, sector_tickers):
    """Compute excess returns at each LAGS horizon for each accumulation event row."""
    event_records = []
    for _, row in events_df.iterrows():
        date_t = row['date']
        sector = row['sector']
        if date_t not in close_pivot.index:
            continue
        excess_returns = {}
        has_future = False
        for lag in LAGS:
            sec_ret = _sector_return_at(close_pivot, sector_tickers, sector, date_t, lag)
            mkt_ret = _market_return_at(close_pivot, date_t, lag)
            if sec_ret is not None and mkt_ret is not None:
                excess_returns[lag] = sec_ret - mkt_ret
                has_future = True
            else:
                excess_returns[lag] = None
        if has_future:
            event_records.append({
                'sector': sector,
                'date': date_t,
                'intensity': row['sector_intensity'],
                **{f'excess_{lag}d': excess_returns[lag] for lag in LAGS},
            })
    return event_records


def _append_extra_lag_columns(ev_df, close_pivot, sector_tickers):
    """Add excess return columns for LAG_ANALYSIS_LAGS not already in ev_df."""
    extra_lags = [l for l in LAG_ANALYSIS_LAGS if l not in LAGS]
    for lag in extra_lags:
        col = f'excess_{lag}d'
        excess_vals = []
        for _, row in ev_df.iterrows():
            sec_ret = _sector_return_at(close_pivot, sector_tickers, row['sector'], row['date'], lag)
            mkt_ret = _market_return_at(close_pivot, row['date'], lag)
            val = (sec_ret - mkt_ret) if (sec_ret is not None and mkt_ret is not None) else None
            excess_vals.append(val)
        ev_df[col] = excess_vals
    return ev_df


def _safe_stats(series):
    """Return (win_rate, mean, median) from a numeric series, dropping NaN."""
    s = series.dropna()
    if s.empty:
        return None, None, None
    return round(float((s > 0).mean()), 4), round(float(s.mean()), 4), round(float(s.median()), 4)


def _compute_overall_stats(ev_df):
    """Compute win_rates, avg_excess, median_excess, and lag_analysis dicts."""
    overall_win_rates = {}
    overall_avg_excess = {}
    overall_median_excess = {}

    for lag in LAGS:
        col = f'excess_{lag}d'
        wr, avg, med = _safe_stats(ev_df[col])
        overall_win_rates[f'{lag}d'] = wr
        overall_avg_excess[f'{lag}d'] = avg
        overall_median_excess[f'{lag}d'] = med

    lag_analysis = []
    for lag in LAG_ANALYSIS_LAGS:
        col = f'excess_{lag}d'
        wr, avg, _ = _safe_stats(ev_df[col]) if col in ev_df.columns else (None, None, None)
        lag_analysis.append({'lag': lag, 'win_rate': wr, 'avg_excess_return': avg})

    return overall_win_rates, overall_avg_excess, overall_median_excess, lag_analysis


def _compute_by_sector_stats(ev_df):
    """Compute per-sector win_rates and avg_excess_returns."""
    by_sector = {}
    for sector in ev_df['sector'].unique():
        sec_ev = ev_df[ev_df['sector'] == sector]
        sec_win_rates = {}
        sec_avg_excess = {}
        for lag in LAGS:
            col = f'excess_{lag}d'
            wr, avg, _ = _safe_stats(sec_ev[col])
            sec_win_rates[f'{lag}d'] = wr
            sec_avg_excess[f'{lag}d'] = avg
        by_sector[sector] = {
            'total_events': len(sec_ev),
            'win_rates': sec_win_rates,
            'avg_excess_returns': sec_avg_excess,
        }
    return by_sector


def _build_scatter_data(ev_df):
    """Sample and format scatter data for intensity vs excess_return_20d."""
    scatter_cols = ['sector', 'date', 'intensity', 'excess_20d']
    available = [c for c in scatter_cols if c in ev_df.columns]
    scatter_df = ev_df[available].dropna()
    if len(scatter_df) > MAX_SCATTER_POINTS:
        scatter_df = scatter_df.sample(MAX_SCATTER_POINTS, random_state=42)
    scatter_data = []
    for _, row in scatter_df.iterrows():
        date_val = row['date'].strftime('%Y-%m-%d') if hasattr(row['date'], 'strftime') else str(row['date'])
        scatter_data.append({
            'sector': row['sector'],
            'date': date_val,
            'intensity': round(float(row['intensity']), 4),
            'excess_return_20d': round(float(row['excess_20d']), 4),
        })
    return scatter_data


def _build_current_signal_entry(sector, acc, by_sector, sector_tickers, close_pivot, price_symbols):
    """Build a single current_signals entry for a sector with accumulating signal."""
    latest_date_val = close_pivot.index.max()
    anchor_1m_date = latest_date_val - pd.Timedelta(days=30)
    tickers = sector_tickers.get(sector, [])

    current_returns = []
    for t in tickers:
        p_now = _get_closest_close(close_pivot, t, latest_date_val, tolerance=0)
        p_1m = _get_closest_close(close_pivot, t, anchor_1m_date, tolerance=5)
        if p_now and p_1m and p_1m > 0:
            current_returns.append((p_now / p_1m - 1) * 100)

    current_return_1m = round(float(np.mean(current_returns)), 2) if current_returns else None
    sec_study = by_sector.get(sector, {})
    sector_stock_count = len([s for s in tickers if s in price_symbols])

    return {
        'sector': sector,
        'acc_intensity': acc['acc_intensity'],
        'acc_net_10d': acc['acc_net_10d'],
        'acc_signal': acc['acc_signal'],
        'acc_stocks_count': acc['acc_stocks_count'],
        'stock_count': sector_stock_count,
        'current_return_1m': current_return_1m,
        'projected_excess_20d': sec_study.get('avg_excess_returns', {}).get('20d'),
        'historical_win_rate_20d': sec_study.get('win_rates', {}).get('20d'),
        'top_accumulated_stocks': acc.get('top_accumulated_stocks', []),
    }


def _build_current_signals(acc_signals, by_sector, sector_tickers, close_pivot, price_symbols):
    """Build list of current_signals entries for all accumulating sectors."""
    current_signals = []
    sorted_sectors = sorted(acc_signals.keys(), key=lambda s: acc_signals[s]['acc_intensity'], reverse=True)
    for sector in sorted_sectors:
        acc = acc_signals[sector]
        if acc['acc_signal'] != 'accumulating':
            continue
        entry = _build_current_signal_entry(sector, acc, by_sector, sector_tickers, close_pivot, price_symbols)
        current_signals.append(entry)
    return current_signals


def _build_sector_tickers_map(sector_mapping, close_pivot):
    """Return {sector: [tickers]} for tickers present in close_pivot."""
    sector_tickers = defaultdict(list)
    for sym, sec in sector_mapping.items():
        if sym in close_pivot.columns:
            sector_tickers[sec].append(sym)
    return sector_tickers


def _build_ev_df(sector_intensity_df, close_pivot, sector_tickers, start_date):
    """Build event DataFrame with excess return columns, or return None if no events."""
    events_df = sector_intensity_df[sector_intensity_df['sector_intensity'] > 3.0].copy()
    event_records = _build_event_records(events_df, close_pivot, sector_tickers)
    if not event_records:
        return None
    ev_df = pd.DataFrame(event_records)
    ev_df['date'] = pd.to_datetime(ev_df['date'])
    return _append_extra_lag_columns(ev_df, close_pivot, sector_tickers)


def _assemble_study_dict(ev_df, start_date):
    """Build the top-level study statistics dict from the events DataFrame."""
    overall_win_rates, overall_avg_excess, overall_median_excess, lag_analysis = _compute_overall_stats(ev_df)
    by_sector = _compute_by_sector_stats(ev_df)
    scatter_data = _build_scatter_data(ev_df)
    all_ev_dates = ev_df['date'].dropna()
    date_from = all_ev_dates.min().strftime('%Y-%m-%d') if not all_ev_dates.empty else str(start_date)
    date_to = all_ev_dates.max().strftime('%Y-%m-%d') if not all_ev_dates.empty else str(date.today())
    study = {
        'total_events': len(ev_df),
        'sectors_covered': int(ev_df['sector'].nunique()),
        'date_range': {'from': date_from, 'to': date_to},
        'overall': {
            'win_rates': overall_win_rates,
            'avg_excess_returns': overall_avg_excess,
            'median_excess_returns': overall_median_excess,
            'lag_analysis': lag_analysis,
        },
        'by_sector': by_sector,
        'scatter_data': scatter_data,
    }
    return study, by_sector


def _load_study_data(start_date):
    """Load price_df, acc_df and sector_mapping for the study period. Returns None on missing data."""
    price_df = _load_study_price_df(start_date)
    if price_df.empty:
        return None, None, None, 'No price data available.'
    acc_df = _load_study_acc_df(start_date)
    if acc_df.empty:
        return None, None, None, 'No accumulation data available.'
    companies = Company.objects.exclude(sector__isnull=True).exclude(sector__exact='').values('symbol', 'sector')
    sector_mapping = {c['symbol']: c['sector'] for c in companies}
    return price_df, acc_df, sector_mapping, None


@api_view(['GET'])
@permission_classes([AllowAny])
@cache_page(6 * 60 * 60)
def get_sector_rotation_study(request):
    """Proves sector-level accumulation intensity predicts outperformance vs. broad market."""
    start_date = date.today() - timedelta(days=STUDY_YEARS * 365)

    price_df, acc_df, sector_mapping, err = _load_study_data(start_date)
    if err:
        return Response({'error': err}, status=404)

    intensity_df = _build_intensity_df(price_df, _aggregate_daily_acc(acc_df), sector_mapping)
    if intensity_df.empty:
        return Response({'error': 'Could not compute intensity time series — insufficient data.'}, status=422)

    close_pivot = _build_close_pivot(price_df)
    sector_tickers = _build_sector_tickers_map(sector_mapping, close_pivot)
    ev_df = _build_ev_df(_build_sector_intensity_df(intensity_df), close_pivot, sector_tickers, start_date)
    if ev_df is None:
        return _empty_study_response(start_date)

    study, by_sector = _assemble_study_dict(ev_df, start_date)
    acc_signals = _compute_current_acc_signals(sector_mapping)
    price_symbols = set(price_df['ticker'].unique())
    current_signals = _build_current_signals(acc_signals, by_sector, sector_tickers, close_pivot, price_symbols)
    return Response({'study': study, 'current_signals': current_signals})


def _empty_study_response(start_date):
    return Response({
        'study': {
            'total_events': 0,
            'sectors_covered': 0,
            'date_range': {'from': str(start_date), 'to': str(date.today())},
            'overall': {
                'win_rates': {},
                'avg_excess_returns': {},
                'median_excess_returns': {},
                'lag_analysis': [],
            },
            'by_sector': {},
            'scatter_data': [],
        },
        'current_signals': [],
    })
