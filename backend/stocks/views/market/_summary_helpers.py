"""Private helpers for the stock_summary view."""
import datetime
from decimal import Decimal

import numpy as np
import pandas as pd
import talib

from django.db.models import Sum, F

from ...models import DailyStockPrice, DailyFloorsheet


def _build_sparkline_map(latest_date):
    """Fetch last-10-point sparkline data for all tickers."""
    start = latest_date - datetime.timedelta(days=20)
    qs = DailyStockPrice.objects.filter(
        date__gte=start, date__lte=latest_date
    ).values('ticker', 'date', 'close').order_by('date')
    sparkline_map = {}
    for item in qs:
        t = item['ticker']
        if t not in sparkline_map:
            sparkline_map[t] = []
        sparkline_map[t].append(item['close'])
    for t in sparkline_map:
        sparkline_map[t] = sparkline_map[t][-10:]
    return sparkline_map


def _build_one_stock_entry(stock, prev_close, volume, turnover, sector, sparkline_map):
    """Build serialisable dict for a single stock row."""
    change = stock.close - prev_close if prev_close else 0
    percent_change = (change / prev_close * 100) if prev_close else 0
    diff = stock.close - stock.open
    return {
        'ticker': stock.ticker,
        'close': stock.close,
        'open': stock.open,
        'high': stock.high,
        'low': stock.low,
        'volume': volume,
        'turnover': turnover,
        'change': change,
        'percent_change': percent_change,
        'diff': diff,
        'sector': sector,
        'weeks_52_high': stock.weeks_52_high,
        'weeks_52_low': stock.weeks_52_low,
        'sparkline': sparkline_map.get(stock.ticker, []),
    }


def _resolve_vol_and_price(stock, is_daily, ref_prices_map, aggregates_map):
    """Return (prev_close, volume, turnover) for one stock based on range mode."""
    if not is_daily and stock.ticker in ref_prices_map:
        prev_close = ref_prices_map[stock.ticker]
    else:
        prev_close = stock.prev_close or stock.open
    if not is_daily and stock.ticker in aggregates_map:
        agg = aggregates_map[stock.ticker]
        return prev_close, agg['total_vol'] or 0, agg['total_turn'] or 0
    return prev_close, stock.volume, stock.turnover or (stock.close * stock.volume)


def _update_totals_and_sectors(totals, sector_stats, entry, sector, volume, turnover, prev_close, close):
    """Mutate totals and sector_stats in-place for one processed stock."""
    change = entry['change']
    totals['volume'] += volume
    totals['turnover'] += turnover
    totals['pts_today'] += close
    totals['pts_prev'] += prev_close
    if change > 0:
        totals['advancers'] += 1
    elif change < 0:
        totals['decliners'] += 1
    else:
        totals['unchanged'] += 1
    if sector not in sector_stats:
        sector_stats[sector] = {'total_pct_change': 0, 'count': 0, 'turnover': 0}
    sector_stats[sector]['total_pct_change'] += entry['percent_change']
    sector_stats[sector]['count'] += 1
    sector_stats[sector]['turnover'] += turnover


def _check_52_week_proximity(stock, entry, near_high, near_low):
    """Append entry to near_high or near_low lists based on 52-week proximity."""
    if stock.weeks_52_high and stock.close and stock.close >= stock.weeks_52_high * Decimal('0.98'):
        near_high.append(entry)
    if stock.weeks_52_low and stock.close and stock.close <= stock.weeks_52_low * Decimal('1.02'):
        near_low.append(entry)


def _process_stocks(latest_prices, is_daily, ref_prices_map, aggregates_map, sector_map, sparkline_map):
    """Iterate latest prices; return summary_list, sector_stats, near-high/low lists, and market totals."""
    summary_list, near_high, near_low = [], [], []
    sector_stats = {}
    totals = {'volume': 0, 'turnover': 0, 'pts_today': 0, 'pts_prev': 0,
              'advancers': 0, 'decliners': 0, 'unchanged': 0}
    for stock in latest_prices:
        prev_close, volume, turnover = _resolve_vol_and_price(
            stock, is_daily, ref_prices_map, aggregates_map)
        sector = sector_map.get(stock.ticker, 'Others')
        entry = _build_one_stock_entry(stock, prev_close, volume, turnover, sector, sparkline_map)
        summary_list.append(entry)
        _update_totals_and_sectors(totals, sector_stats, entry, sector, volume, turnover, prev_close, stock.close)
        _check_52_week_proximity(stock, entry, near_high, near_low)
    return summary_list, sector_stats, near_high, near_low, totals


def _build_sector_summary(sector_stats):
    """Convert raw sector_stats into sorted list of sector dicts."""
    result = []
    for sec, stats in sector_stats.items():
        if stats['count'] > 0:
            result.append({
                'name': sec,
                'change': stats['total_pct_change'] / stats['count'],
                'turnover': stats['turnover'],
                'count': stats['count'],
            })
    result.sort(key=lambda x: x['turnover'], reverse=True)
    return result


def _attach_top_buyers(summary_list, rocket_tickers, latest_date):
    """Fetch top-3 buyers per rocket ticker from floorsheet and attach to entries."""
    qs = DailyFloorsheet.objects.filter(
        symbol__in=rocket_tickers, transaction_date=latest_date
    ).values('symbol', 'buyer_id').annotate(
        total_qty=Sum('transaction_quantity')
    ).order_by('symbol', '-total_qty')
    top_buyers_map = {}
    for entry in qs:
        sym = entry['symbol']
        if sym not in top_buyers_map:
            top_buyers_map[sym] = []
        if len(top_buyers_map[sym]) < 3:
            top_buyers_map[sym].append({'broker': entry['buyer_id'], 'qty': entry['total_qty']})
    for stock in summary_list:
        if stock['ticker'] in top_buyers_map:
            stock['top_buyers'] = top_buyers_map[stock['ticker']]


def _attach_talib_indicators(t, close_vals, summary_list):
    """Compute ROC/RSI/MACD from close_vals and attach results to the matching summary entry."""
    roc = talib.ROC(close_vals, timeperiod=14)
    rsi = talib.RSI(close_vals, timeperiod=14)
    macd, macdsignal, _ = talib.MACD(close_vals, fastperiod=12, slowperiod=26, signalperiod=9)
    roc_v = roc[-1] if roc is not None and not np.isnan(roc[-1]) else None
    rsi_v = rsi[-1] if rsi is not None and not np.isnan(rsi[-1]) else None
    for s in summary_list:
        if s['ticker'] == t:
            s['roc'] = round(float(roc_v), 2) if roc_v is not None else None
            s['rsi'] = round(float(rsi_v), 2) if rsi_v is not None else None
            s['macd'] = f"{macd[-1]:.2f}" if macd is not None and not np.isnan(macd[-1]) else None
            s['macd_signal'] = f"{macdsignal[-1]:.2f}" if macdsignal is not None and not np.isnan(macdsignal[-1]) else None
            break


def _compute_technicals(rocket_tickers, latest_date, summary_list):
    """Fetch price history for rocket tickers and attach ROC/RSI/MACD to summary_list."""
    import pandas as pd
    start = latest_date - datetime.timedelta(days=100)
    tech_qs = DailyStockPrice.objects.filter(
        ticker__in=rocket_tickers, date__gte=start, date__lte=latest_date
    ).values('ticker', 'date', 'close').order_by('date')
    if not tech_qs.exists():
        return
    df_tech = pd.DataFrame(list(tech_qs))
    if df_tech.empty:
        return
    for t in rocket_tickers:
        _compute_technicals_for_ticker(t, df_tech, summary_list)


def _compute_technicals_for_ticker(t, df_tech, summary_list):
    """Compute and attach indicators for a single ticker from df_tech."""
    t_df = df_tech[df_tech['ticker'] == t].copy()
    if t_df.empty or len(t_df) < 30:
        return
    t_df.set_index('date', inplace=True)
    close_vals = pd.to_numeric(t_df['close']).values.astype(float)
    try:
        _attach_talib_indicators(t, close_vals, summary_list)
    except Exception:
        pass


def _fetch_whale_watch(latest_date):
    """Return top-5 brokers by turnover with their top-3 stock picks."""
    top_brokers_qs = DailyFloorsheet.objects.filter(
        transaction_date=latest_date
    ).values('buyer_id').annotate(
        total_buy_vol=Sum('transaction_quantity'),
        total_buy_turnover=Sum(F('transaction_quantity') * F('transaction_rate'))
    ).order_by('-total_buy_turnover')[:5]
    whale_watch = []
    for broker_entry in top_brokers_qs:
        whale_watch.append(_build_whale_entry(broker_entry, latest_date))
    return whale_watch


def _build_whale_entry(broker_entry, latest_date):
    """Build a single whale-watch broker entry with top-3 picks."""
    broker_id = broker_entry['buyer_id']
    top_picks_qs = DailyFloorsheet.objects.filter(
        transaction_date=latest_date, buyer_id=broker_id
    ).values('symbol').annotate(
        qty=Sum('transaction_quantity'),
        turnover=Sum(F('transaction_quantity') * F('transaction_rate'))
    ).order_by('-turnover')[:3]
    return {
        'broker': broker_id,
        'total_turnover': broker_entry['total_buy_turnover'],
        'top_picks': [{'ticker': p['symbol'], 'turnover': p['turnover']} for p in top_picks_qs],
    }


def _build_market_summary_section(latest_date, ref_date, range_type, summary_list, totals):
    """Build the market_summary dict for the response."""
    n = len(summary_list)
    pts_today, pts_prev = totals['pts_today'], totals['pts_prev']
    adv = totals['advancers']
    dec = totals['decliners']
    return {
        'date': latest_date, 'ref_date': ref_date, 'range': range_type,
        'total_turnover': totals['turnover'], 'total_volume': totals['volume'],
        'total_points': pts_today,
        'points_change': pts_today - pts_prev,
        'percent_change': ((pts_today - pts_prev) / pts_prev * 100) if pts_prev else 0,
        'advancers': adv, 'decliners': dec,
        'advancers_percent': (adv / n * 100) if n else 0,
        'decliners_percent': (dec / n * 100) if n else 0,
    }


def _build_response(latest_date, ref_date, range_type, summary_list, sector_stats,
                    near_high, near_low, whale_watch, totals):
    """Assemble and return the final response dict."""
    by_volume = sorted(summary_list, key=lambda x: x['volume'])
    by_turnover = sorted(summary_list, key=lambda x: x['turnover'])
    by_change = sorted(summary_list, key=lambda x: x['percent_change'])
    near_high.sort(key=lambda x: x['percent_change'], reverse=True)
    near_low.sort(key=lambda x: x['percent_change'])
    return {
        'market_summary': _build_market_summary_section(
            latest_date, ref_date, range_type, summary_list, totals),
        'sector_summary': _build_sector_summary(sector_stats),
        'top_volume': by_volume[-10:][::-1], 'top_turnover': by_turnover[-10:][::-1],
        'top_gainers': by_change[-10:][::-1], 'bottom_volume': by_volume[:10],
        'bottom_turnover': by_turnover[:10], 'top_losers': by_change[:10],
        'near_52_high': near_high[:10], 'near_52_low': near_low[:10],
        'whale_watch': whale_watch,
    }


def _fetch_ref_data(ref_date, latest, fetch_ref_aggregates):
    """Return (ref_prices_map, aggregates_map) for non-daily ranges."""
    if ref_date is None:
        return {}, {}
    ref_prices_map = {p.ticker: p.close for p in DailyStockPrice.objects.filter(date=ref_date)}
    aggregates_map = fetch_ref_aggregates(ref_date, latest)
    return ref_prices_map, aggregates_map
