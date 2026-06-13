"""Private helper: enrich StockFundamental data with peer comparison indicators."""
import statistics

from ...models import StockFundamental

_METRICS = [
    {'key': 'eps', 'name': 'EPS (TTM)'},
    {'key': 'pe_ratio', 'name': 'P/E Ratio'},
    {'key': 'price_to_book', 'name': 'P/B Ratio'},
    {'key': 'book_value', 'name': 'Book Value'},
    {'key': 'ro_equity', 'name': 'ROE'},
    {'key': 'dividend_yield', 'name': 'Dividend Yield'},
    {'key': 'peg_ratio', 'name': 'PEG Ratio'},
    {'key': 'price_to_sales', 'name': 'Price to Sales'},
    {'key': 'earning_yield', 'name': 'Earning Yield (E/P)'},
    {'key': 'pe_ratio_5yr', 'name': 'P/E Ratio (5 Yrs)'},
    {'key': 'debt_to_equity', 'name': 'Debt to Equity'},
    {'key': 'ro_assets', 'name': 'ROA'},
    {'key': 'dividend_payout_ratio', 'name': 'Payout Ratio'},
    {'key': 'operating_margin', 'name': 'Operating Margin'},
    {'key': 'net_margin', 'name': 'Net Margin'},
    {'key': 'net_margin_quarterly', 'name': 'Net Margin (Quarterly)'},
    {'key': 'asset_turnover', 'name': 'Asset Turnover'},
    {'key': 'beta_1y', 'name': '1 Year Beta'},
]

_PERCENT_KEYS = {
    'dividend_yield', 'ro_equity', 'ro_assets', 'earning_yield',
    'dividend_payout_ratio', 'operating_margin', 'net_margin',
    'net_margin_quarterly', 'asset_turnover',
}


def _format_value(val, key):
    """Format a fundamental metric value with optional % suffix."""
    if val is None:
        return '-'
    formatted = f"{val:.2f}"
    return formatted + '%' if key in _PERCENT_KEYS else formatted


def _build_peer_stats(peers, key):
    """Return (max_obj, min_obj, median_val) for a metric across peers."""
    ranked = peers.exclude(**{f'{key}__isnull': True})
    max_obj = ranked.order_by(f'-{key}').first()
    min_obj = ranked.order_by(f'{key}').first()
    peer_values = [float(v) for v in ranked.values_list(key, flat=True)]
    median_val = statistics.median(peer_values) if peer_values else None
    return max_obj, min_obj, median_val


def _build_indicator_entry(m, fundamental_obj, peers):
    """Build a single indicator dict for the fundamental_indicators list."""
    key = m['key']
    val = getattr(fundamental_obj, key, None)
    max_obj, min_obj, median_val = _build_peer_stats(peers, key)
    max_val = getattr(max_obj, key, None) if max_obj else None
    min_val = getattr(min_obj, key, None) if min_obj else None
    return {
        'name': m['name'],
        'value': _format_value(val, key),
        'sector_median': f"{median_val:.2f}" if median_val is not None else '-',
        'sector_high': f"{max_val:.2f}" if max_val is not None else '-',
        'sector_high_ticker': max_obj.ticker if max_obj else '-',
        'sector_low': f"{min_val:.2f}" if min_val is not None else '-',
        'sector_low_ticker': min_obj.ticker if min_obj else '-',
    }


def _enrich_fundamental_data(data, fundamental_obj):
    """Attach peer-comparison indicators to the fundamental data dict."""
    if data is None or not fundamental_obj:
        return data
    peers = StockFundamental.objects.filter(sector=fundamental_obj.sector)
    indicators = [_build_indicator_entry(m, fundamental_obj, peers) for m in _METRICS]
    data['fundamental_indicators'] = indicators
    return data
