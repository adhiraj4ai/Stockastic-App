"""Private helpers for the analyze_activity view."""
import datetime

from django.db.models import Count, Sum, F

from ...models import DailyStockPrice, DailyFloorsheet

_TECH_LOOKBACK_DAYS = 45


def _fetch_latest_date():
    """Return the latest trading date that has more than 10 tickers."""
    result = DailyStockPrice.objects.values('date').annotate(
        count=Count('ticker')
    ).filter(count__gt=10).order_by('-date').first()
    return result['date'] if result else None


def _resolve_start_date(latest_date, range_type):
    """Return the start date for the given range_type."""
    if range_type == 'weekly':
        return latest_date - datetime.timedelta(days=7)
    if range_type == 'monthly':
        return latest_date - datetime.timedelta(days=30)
    return latest_date


def _fetch_price_rows(latest_date):
    """Fetch at least 45 days of price history for indicator computation."""
    tech_start = latest_date - datetime.timedelta(days=_TECH_LOOKBACK_DAYS)
    return DailyStockPrice.objects.filter(
        date__gte=tech_start, date__lte=latest_date
    )


def _build_ticker_stats(prices, start_date):
    """Aggregate per-ticker volume, turnover, and sorted price rows."""
    ticker_stats = {}
    for p in prices:
        if p.ticker not in ticker_stats:
            ticker_stats[p.ticker] = {'vol': 0, 'turn': 0, 'prices': []}
        ticker_stats[p.ticker]['prices'].append({
            'date': p.date, 'close': p.close,
            'open': p.open, 'prev_close': p.prev_close,
        })
        if p.date >= start_date:
            ticker_stats[p.ticker]['vol'] += (p.volume or 0)
            ticker_stats[p.ticker]['turn'] += (p.turnover or 0)
    return ticker_stats


def _calc_roc(sorted_prices):
    """Return 14-period ROC or None if insufficient data."""
    if len(sorted_prices) < 15:
        return None
    start_p = float(sorted_prices[-15]['close']) if sorted_prices[-15]['close'] else 0
    if start_p <= 0:
        return None
    end_price = float(sorted_prices[-1]['close']) if sorted_prices[-1]['close'] else 0
    return round(((end_price - start_p) / start_p) * 100, 2)


def _calc_price_change(latest_entry, first_range_entry, range_type):
    """Return (change, pct_change) based on range_type logic."""
    end_price = float(latest_entry['close']) if latest_entry['close'] else 0
    if range_type == 'daily':
        ref_price = float(latest_entry['prev_close']) if latest_entry['prev_close'] else float(latest_entry['open'])
    else:
        ref_price = float(first_range_entry['prev_close']) if first_range_entry['prev_close'] else float(first_range_entry['close'])
    change = end_price - ref_price
    pct_change = (change / ref_price * 100) if ref_price else 0
    return round(change, 2), round(pct_change, 2), end_price


def _build_notable_metrics(ticker_stats, start_date, range_type):
    """Build the list of per-ticker metrics dicts."""
    notable_metrics = []
    for ticker, data in ticker_stats.items():
        sorted_prices = sorted(data['prices'], key=lambda x: x['date'])
        if not sorted_prices:
            continue
        range_entries = [p for p in sorted_prices if p['date'] >= start_date]
        if not range_entries:
            continue
        change, pct_change, end_price = _calc_price_change(
            sorted_prices[-1], range_entries[0], range_type)
        roc_val = _calc_roc(sorted_prices)
        notable_metrics.append({
            'ticker': ticker,
            'change': change,
            'percent_change': pct_change,
            'turnover': data['turn'],
            'volume': data['vol'],
            'close': end_price,
            'roc': roc_val,
        })
    return notable_metrics


def _filter_active_gainers(top_gainers_candidates, latest_date, limit):
    """Filter daily gainers to only actively traded tickers."""
    candidate_tickers = [x['ticker'] for x in top_gainers_candidates]
    cutoff_date = latest_date - datetime.timedelta(days=_TECH_LOOKBACK_DAYS)
    active_tickers = set(
        DailyStockPrice.objects.filter(
            ticker__in=candidate_tickers,
            date__gte=cutoff_date,
            date__lte=latest_date,
        ).values('ticker').annotate(cnt=Count('id')).filter(cnt__gt=1).values_list('ticker', flat=True)
    )
    return [x for x in top_gainers_candidates if x['ticker'] in active_tickers][:limit]


def _build_top_lists(notable_metrics, latest_date, range_type, limit):
    """Return (top_gainers, top_turnover, top_volume, top_roc) lists."""
    candidates = sorted(notable_metrics, key=lambda x: x['percent_change'], reverse=True)[:max(30, limit * 2)]
    if range_type == 'daily' and candidates:
        top_gainers = _filter_active_gainers(candidates, latest_date, limit)
    else:
        top_gainers = candidates[:limit]
    top_turnover = sorted(notable_metrics, key=lambda x: x['turnover'], reverse=True)[:limit]
    top_volume = sorted(notable_metrics, key=lambda x: x['volume'], reverse=True)[:limit]
    top_roc = sorted(
        [x for x in notable_metrics if x['roc'] is not None],
        key=lambda x: x['roc'], reverse=True
    )[:limit]
    return top_gainers, top_turnover, top_volume, top_roc


def _aggregate_floorsheet(unique_tickers, start_date, latest_date):
    """Return per-ticker broker stats dict from floorsheet."""
    floorsheet_data = DailyFloorsheet.objects.filter(
        symbol__in=unique_tickers,
        transaction_date__gte=start_date,
        transaction_date__lte=latest_date,
    )
    broker_stats = {}
    for fs in floorsheet_data:
        _accumulate_floorsheet_row(broker_stats, fs)
    return broker_stats


def _accumulate_floorsheet_row(broker_stats, fs):
    """Accumulate one floorsheet row into broker_stats."""
    ticker = fs.symbol
    if ticker not in broker_stats:
        broker_stats[ticker] = {
            'buyers': {}, 'sellers': {}, 'transactions': 0,
            'avg_price_sum': 0, 'total_qty': 0,
        }
    stats = broker_stats[ticker]
    stats['transactions'] += 1
    stats['total_qty'] += fs.quantity
    stats['avg_price_sum'] += (fs.rate * fs.quantity)
    stats['buyers'][fs.buyer_id] = stats['buyers'].get(fs.buyer_id, 0) + fs.quantity
    stats['sellers'][fs.seller_id] = stats['sellers'].get(fs.seller_id, 0) + fs.quantity


def _get_top_brokers(broker_dict):
    """Return top-5 brokers sorted by quantity."""
    sorted_brokers = sorted(broker_dict.items(), key=lambda x: x[1], reverse=True)[:5]
    return [{'broker_id': k, 'quantity': v} for k, v in sorted_brokers]


def _build_enriched_entry(item, broker_stats, metrics_map):
    """Build one enriched result dict combining metrics with broker analysis."""
    ticker = item['ticker']
    stats = broker_stats.get(ticker, {})
    m = metrics_map.get(ticker, {})
    avg_price_w = (stats['avg_price_sum'] / stats['total_qty']) if stats.get('total_qty') else 0
    return {
        'ticker': ticker,
        'metrics': m,
        'analysis': {
            'total_transactions': stats.get('transactions', 0),
            'weighted_avg_price': round(avg_price_w, 2),
            'top_buyers': _get_top_brokers(stats.get('buyers', {})),
            'top_sellers': _get_top_brokers(stats.get('sellers', {})),
        },
    }


def _build_enriched_list(tickers_list, broker_stats, metrics_map):
    """Build the enriched results list for a given top-N list."""
    return [_build_enriched_entry(item, broker_stats, metrics_map) for item in tickers_list]


def get_stats_for_range(range_type, limit):
    """Compute activity stats for a single range_type. Returns dict or None."""
    latest_date = _fetch_latest_date()
    if not latest_date:
        return None

    start_date = _resolve_start_date(latest_date, range_type)
    prices = _fetch_price_rows(latest_date)
    ticker_stats = _build_ticker_stats(prices, start_date)
    notable_metrics = _build_notable_metrics(ticker_stats, start_date, range_type)

    top_gainers, top_turnover, top_volume, top_roc = _build_top_lists(
        notable_metrics, latest_date, range_type, limit)

    unique_tickers = set(
        [x['ticker'] for x in top_gainers]
        + [x['ticker'] for x in top_turnover]
        + [x['ticker'] for x in top_volume]
        + [x['ticker'] for x in top_roc]
    )
    broker_stats = _aggregate_floorsheet(unique_tickers, start_date, latest_date)
    metrics_map = {m['ticker']: m for m in notable_metrics}

    return {
        'turnover': _build_enriched_list(top_turnover, broker_stats, metrics_map),
        'gainers': _build_enriched_list(top_gainers, broker_stats, metrics_map),
        'volume': _build_enriched_list(top_volume, broker_stats, metrics_map),
        'roc': _build_enriched_list(top_roc, broker_stats, metrics_map),
    }
