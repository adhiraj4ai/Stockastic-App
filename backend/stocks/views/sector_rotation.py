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


def _compute_current_acc_signals(sector_mapping):
    """
    Compute current accumulation intensity for each stock, then aggregate by sector.
    Returns a dict: sector -> {acc_intensity, acc_net_10d, acc_signal, acc_stocks_count, top_stocks}
    """
    start_date = date.today() - timedelta(days=45)

    all_symbols = list(sector_mapping.keys())
    if not all_symbols:
        return {}

    price_df = _load_price_df_sector(symbols=all_symbols, start_date=start_date)
    acc_df = _load_acc_df_sector(symbols=all_symbols, start_date=start_date)

    if price_df.empty or acc_df.empty:
        return {}

    # Aggregate cumulative_net across all entity_ids per (symbol, date)
    daily_acc = (
        acc_df
        .groupby(['symbol', 'transaction_date'])['cumulative_net']
        .sum()
        .reset_index()
        .rename(columns={'transaction_date': 'date', 'cumulative_net': 'total_net'})
    )
    daily_acc['date'] = pd.to_datetime(daily_acc['date'])

    symbol_signals = {}  # symbol -> {net_acc_10d, intensity}

    acc_symbols = set(daily_acc['symbol'].unique())
    price_symbols = set(price_df['ticker'].unique())
    common_symbols = acc_symbols & price_symbols

    for sym in common_symbols:
        p = price_df[price_df['ticker'] == sym].copy().sort_values('date').reset_index(drop=True)
        a = daily_acc[daily_acc['symbol'] == sym].copy().sort_values('date').reset_index(drop=True)

        if len(p) < 20:
            continue

        merged = pd.merge(p, a[['date', 'total_net']], on='date', how='left')
        merged['total_net'] = merged['total_net'].ffill().fillna(0)

        # 20-day average volume
        merged['vol_avg_20d'] = merged['volume'].rolling(20, min_periods=5).mean()

        # 10-day net accumulation change
        merged['net_acc_10d'] = merged['total_net'] - merged['total_net'].shift(10).fillna(merged['total_net'])

        # Get latest values
        latest = merged.dropna(subset=['vol_avg_20d']).tail(1)
        if latest.empty:
            continue

        row = latest.iloc[-1]
        avg_vol = float(row['vol_avg_20d'])
        net_10d = float(row['net_acc_10d'])

        if avg_vol <= 0:
            continue

        intensity = (net_10d / avg_vol) * 100
        intensity = max(-50.0, min(50.0, intensity))  # clamp

        symbol_signals[sym] = {
            'net_acc_10d': net_10d,
            'intensity': intensity,
        }

    # Group by sector
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

    results = {}
    for sector, data in sector_acc.items():
        intensities = data['intensities']
        if not intensities:
            continue

        acc_intensity = round(float(np.mean(intensities)), 2)
        acc_net_10d = round(float(np.sum(data['net_acc_10d_list'])), 0)
        acc_stocks_count = data['positive_count']

        if acc_intensity > 3:
            acc_signal = 'accumulating'
        elif acc_intensity < -3:
            acc_signal = 'distributing'
        else:
            acc_signal = 'neutral'

        # Top accumulated stocks (by intensity, descending)
        sym_int = data['symbol_intensities']
        top_stocks = sorted(sym_int.keys(), key=lambda s: sym_int[s], reverse=True)[:3]

        results[sector] = {
            'acc_intensity': acc_intensity,
            'acc_net_10d': int(acc_net_10d),
            'acc_signal': acc_signal,
            'acc_stocks_count': acc_stocks_count,
            'top_accumulated_stocks': top_stocks,
        }

    return results


# ---------------------------------------------------------------------------
# View 1: get_sector_rotation (enhanced with accumulation signals)
# ---------------------------------------------------------------------------

@api_view(['GET'])
@permission_classes([AllowAny])
def get_sector_rotation(request):
    """
    Groups and aggregates stock performance by Sector to support the Sector Rotation feature.
    Calculates average percent changes for various timeframes by fetching historical prices.
    Also includes per-sector accumulation signals.
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
        price_lookup[p['ticker']][str(p['date'])] = p

    # 3. Map tickers to sectors
    companies = Company.objects.exclude(sector__isnull=True).exclude(sector__exact='').values('symbol', 'sector')
    sector_mapping = {c['symbol']: c['sector'] for c in companies}

    # 4. Calculate returns grouped by sector
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

    # 5. Compute accumulation signals per sector
    acc_signals = _compute_current_acc_signals(sector_mapping)

    # 6. Format the final output
    results = []

    for sector, data in sector_data.items():
        if data['count'] == 0:
            continue

        returns = data['returns']

        def calculate_avg(values):
            if not values:
                return 0.0
            return round(sum(values) / len(values), 2)

        acc = acc_signals.get(sector, {})

        results.append({
            'sector': sector,
            'stock_count': data['count'],
            'daily_return': calculate_avg(returns['daily']),
            'weekly_return': calculate_avg(returns['weekly']),
            'monthly_return': calculate_avg(returns['monthly']),
            'three_month_return': calculate_avg(returns['three_month']),
            'six_month_return': calculate_avg(returns['six_month']),
            'yearly_return': calculate_avg(returns['yearly']),
            'acc_intensity': acc.get('acc_intensity', 0.0),
            'acc_net_10d': acc.get('acc_net_10d', 0),
            'acc_signal': acc.get('acc_signal', 'neutral'),
            'acc_stocks_count': acc.get('acc_stocks_count', 0),
        })

    # Sort by acc_intensity descending by default
    results.sort(key=lambda x: x['acc_intensity'], reverse=True)

    return Response({
        'status': 'success',
        'sectors': results,
        'count': len(results)
    })


# ---------------------------------------------------------------------------
# View 2: get_sector_rotation_study (sector accumulation → excess return proof)
# ---------------------------------------------------------------------------

@api_view(['GET'])
@permission_classes([AllowAny])
@cache_page(6 * 60 * 60)
def get_sector_rotation_study(request):
    """
    Proves that sector-level accumulation intensity predicts sector outperformance
    vs. the broad market across multiple forward horizons.
    """
    start_date = date.today() - timedelta(days=STUDY_YEARS * 365)

    # --- Load all price data ---
    price_qs = DailyStockPrice.objects.filter(date__gte=start_date).values('ticker', 'date', 'close', 'volume')
    price_df = pd.DataFrame.from_records(price_qs)
    if price_df.empty:
        return Response({'error': 'No price data available.'}, status=404)

    price_df['close'] = pd.to_numeric(price_df['close'], errors='coerce')
    price_df['volume'] = pd.to_numeric(price_df['volume'], errors='coerce')
    price_df['date'] = pd.to_datetime(price_df['date'])
    price_df.sort_values(['ticker', 'date'], inplace=True)
    price_df.reset_index(drop=True, inplace=True)

    # --- Load all accumulation data ---
    acc_qs = DailyCumulativeAccumulation.objects.filter(
        transaction_date__gte=start_date
    ).values('symbol', 'transaction_date', 'cumulative_net')
    acc_df = pd.DataFrame.from_records(acc_qs)

    if acc_df.empty:
        return Response({'error': 'No accumulation data available.'}, status=404)

    acc_df['cumulative_net'] = pd.to_numeric(acc_df['cumulative_net'], errors='coerce').fillna(0)
    acc_df['transaction_date'] = pd.to_datetime(acc_df['transaction_date'])

    # Aggregate per (symbol, date) across all entity_ids
    daily_acc = (
        acc_df
        .groupby(['symbol', 'transaction_date'])['cumulative_net']
        .sum()
        .reset_index()
        .rename(columns={'transaction_date': 'date', 'cumulative_net': 'total_net'})
    )

    # --- Sector mapping ---
    companies = Company.objects.exclude(sector__isnull=True).exclude(sector__exact='').values('symbol', 'sector')
    sector_mapping = {c['symbol']: c['sector'] for c in companies}

    # --- Compute rolling intensity per symbol (time series) ---
    # intensity[t] = (total_net[t] - total_net[t-10]) / vol_avg_20d[t] * 100
    all_intensity_rows = []  # list of (ticker, date, intensity)

    price_symbols = set(price_df['ticker'].unique())
    acc_symbols = set(daily_acc['symbol'].unique())
    common_symbols = price_symbols & acc_symbols & set(sector_mapping.keys())

    for sym in common_symbols:
        p = price_df[price_df['ticker'] == sym].copy().sort_values('date').reset_index(drop=True)
        a = daily_acc[daily_acc['symbol'] == sym].copy().sort_values('date').reset_index(drop=True)

        if len(p) < 30:
            continue

        merged = pd.merge(p, a[['date', 'total_net']], on='date', how='left')
        merged['total_net'] = merged['total_net'].ffill().fillna(0)
        merged['vol_avg_20d'] = merged['volume'].rolling(20, min_periods=5).mean()
        merged['net_acc_10d'] = merged['total_net'] - merged['total_net'].shift(10).fillna(merged['total_net'])

        vol_safe = merged['vol_avg_20d'].replace(0, np.nan)
        merged['intensity'] = (merged['net_acc_10d'] / vol_safe) * 100
        merged['intensity'] = merged['intensity'].clip(-50, 50)

        for _, row in merged[merged['intensity'].notna()].iterrows():
            all_intensity_rows.append({
                'ticker': sym,
                'date': row['date'],
                'intensity': float(row['intensity']),
                'sector': sector_mapping[sym],
            })

    if not all_intensity_rows:
        return Response({'error': 'Could not compute intensity time series — insufficient data.'}, status=422)

    intensity_df = pd.DataFrame(all_intensity_rows)
    intensity_df['date'] = pd.to_datetime(intensity_df['date'])

    # --- Build sector intensity per date ---
    # sector_intensity_df: date, sector, sector_intensity (mean of stock intensities)
    sector_intensity_df = (
        intensity_df
        .groupby(['date', 'sector'])
        .agg(sector_intensity=('intensity', 'mean'), stock_count=('ticker', 'count'))
        .reset_index()
    )
    # Require at least 2 stocks with data
    sector_intensity_df = sector_intensity_df[sector_intensity_df['stock_count'] >= 2]

    # --- Build price lookup for forward return computation ---
    # price_lookup[ticker][date] = close
    all_dates = sorted(price_df['date'].unique())
    date_to_idx = {d: i for i, d in enumerate(all_dates)}

    # Wide pivot: date x ticker close prices
    close_pivot = price_df.pivot_table(index='date', columns='ticker', values='close', aggfunc='last')
    close_pivot = close_pivot.sort_index()
    close_dates = list(close_pivot.index)  # sorted

    def _get_closest_close(ticker, target_date, tolerance=5):
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

    # Sector average return at date T + N days
    # For efficiency, compute sector close means per date first
    sector_tickers = defaultdict(list)
    for sym, sec in sector_mapping.items():
        if sym in close_pivot.columns:
            sector_tickers[sec].append(sym)

    # Market return = mean of all tickers' returns
    # Sector return = mean of sector tickers' returns

    def _sector_return_at(sector, date_t, lag_days):
        """Return sector average percent return from date_t to date_t + lag_days."""
        tickers = sector_tickers.get(sector, [])
        if not tickers:
            return None

        target_date = date_t + pd.Timedelta(days=lag_days)
        returns = []
        for t in tickers:
            p0 = _get_closest_close(t, date_t, tolerance=0)  # exact date
            p1 = _get_closest_close(t, target_date, tolerance=5)
            if p0 and p1 and p0 > 0:
                returns.append((p1 / p0 - 1) * 100)

        if not returns:
            return None
        return float(np.mean(returns))

    def _market_return_at(date_t, lag_days):
        """Return market-wide average percent return from date_t to date_t + lag_days."""
        target_date = date_t + pd.Timedelta(days=lag_days)
        # Vectorized: for each ticker, get close at date_t and target_date
        if date_t not in close_pivot.index:
            return None
        p0_series = close_pivot.loc[date_t]

        # Find closest target date
        target_ts = pd.Timestamp(target_date)
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
        rets = (p1_series[valid] / p0_series[valid] - 1) * 100
        return float(rets.mean())

    # --- Identify accumulation events: sector_intensity > 3 on a given date ---
    events_df = sector_intensity_df[sector_intensity_df['sector_intensity'] > 3.0].copy()

    # Sample dates for computation efficiency (use at most every-other-day to avoid redundancy)
    # Group by (date, sector) is already done; just iterate

    event_records = []

    for _, row in events_df.iterrows():
        date_t = row['date']
        sector = row['sector']
        intensity_t = row['sector_intensity']

        if date_t not in close_pivot.index:
            continue

        excess_returns = {}
        has_future = False

        for lag in LAGS:
            sec_ret = _sector_return_at(sector, date_t, lag)
            mkt_ret = _market_return_at(date_t, lag)

            if sec_ret is not None and mkt_ret is not None:
                excess = sec_ret - mkt_ret
                excess_returns[lag] = excess
                has_future = True
            else:
                excess_returns[lag] = None

        if has_future:
            event_records.append({
                'sector': sector,
                'date': date_t,
                'intensity': intensity_t,
                **{f'excess_{lag}d': excess_returns[lag] for lag in LAGS},
            })

    if not event_records:
        return _empty_study_response(start_date)

    ev_df = pd.DataFrame(event_records)
    ev_df['date'] = pd.to_datetime(ev_df['date'])

    # --- Also compute lag analysis for extra lags ---
    # For extra lags, compute excess returns similarly
    extra_lags = [l for l in LAG_ANALYSIS_LAGS if l not in LAGS]
    for lag in extra_lags:
        col = f'excess_{lag}d'
        excess_vals = []
        for _, row in ev_df.iterrows():
            date_t = row['date']
            sector = row['sector']
            sec_ret = _sector_return_at(sector, date_t, lag)
            mkt_ret = _market_return_at(date_t, lag)
            if sec_ret is not None and mkt_ret is not None:
                excess_vals.append(sec_ret - mkt_ret)
            else:
                excess_vals.append(None)
        ev_df[col] = excess_vals

    # --- Compute overall stats ---
    def _safe_stats(series):
        s = series.dropna()
        if s.empty:
            return None, None, None
        return round(float((s > 0).mean()), 4), round(float(s.mean()), 4), round(float(s.median()), 4)

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
        if col in ev_df.columns:
            wr, avg, _ = _safe_stats(ev_df[col])
        else:
            wr, avg = None, None
        lag_analysis.append({'lag': lag, 'win_rate': wr, 'avg_excess_return': avg})

    # --- By-sector stats ---
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

    # --- Scatter data (intensity vs excess_return_20d) ---
    scatter_cols = ['sector', 'date', 'intensity', 'excess_20d']
    scatter_available = [c for c in scatter_cols if c in ev_df.columns]
    scatter_df = ev_df[scatter_available].dropna()
    if len(scatter_df) > MAX_SCATTER_POINTS:
        scatter_df = scatter_df.sample(MAX_SCATTER_POINTS, random_state=42)

    scatter_data = []
    for _, row in scatter_df.iterrows():
        scatter_data.append({
            'sector': row['sector'],
            'date': row['date'].strftime('%Y-%m-%d') if hasattr(row['date'], 'strftime') else str(row['date']),
            'intensity': round(float(row['intensity']), 4),
            'excess_return_20d': round(float(row['excess_20d']), 4),
        })

    # --- Date range ---
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

    # --- Current signals ---
    acc_signals = _compute_current_acc_signals(sector_mapping)

    # Build current 1-month return per sector
    latest_date_val = price_df['date'].max()
    anchor_1m_date = latest_date_val - pd.Timedelta(days=30)
    current_signals = []

    for sector in sorted(acc_signals.keys(), key=lambda s: acc_signals[s]['acc_intensity'], reverse=True):
        acc = acc_signals[sector]
        if acc['acc_signal'] != 'accumulating':
            continue

        # Current 1-month return for this sector
        tickers = sector_tickers.get(sector, [])
        current_returns = []
        for t in tickers:
            p_now = _get_closest_close(t, latest_date_val, tolerance=0)
            p_1m = _get_closest_close(t, anchor_1m_date, tolerance=5)
            if p_now and p_1m and p_1m > 0:
                current_returns.append((p_now / p_1m - 1) * 100)

        current_return_1m = round(float(np.mean(current_returns)), 2) if current_returns else None

        # Historical stats for this sector from study
        sec_study = by_sector.get(sector, {})
        historical_win_rate_20d = sec_study.get('win_rates', {}).get('20d')
        projected_excess_20d = sec_study.get('avg_excess_returns', {}).get('20d')

        # Stock count from price_df (how many stocks in sector have recent price data)
        sector_stock_count = len([s for s in sector_tickers.get(sector, []) if s in price_symbols])

        current_signals.append({
            'sector': sector,
            'acc_intensity': acc['acc_intensity'],
            'acc_net_10d': acc['acc_net_10d'],
            'acc_signal': acc['acc_signal'],
            'acc_stocks_count': acc['acc_stocks_count'],
            'stock_count': sector_stock_count,
            'current_return_1m': current_return_1m,
            'projected_excess_20d': projected_excess_20d,
            'historical_win_rate_20d': historical_win_rate_20d,
            'top_accumulated_stocks': acc.get('top_accumulated_stocks', []),
        })

    return Response({
        'study': study,
        'current_signals': current_signals,
    })


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
