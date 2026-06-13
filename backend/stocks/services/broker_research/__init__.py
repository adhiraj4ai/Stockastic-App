"""Broker Research analytics service layer.

Extracted behavior-identical from AccumulationMixin, FloorsheetViewSet, and
BrokerViewSet so the chat tools and the REST API share one implementation (and
one cache). All extractions complete. Functions return the exact structures the
views serialize.

Extractions:
  AccumulationMixin  → accumulation_flows, broker_trends, below_cost, broker_favorites
  FloorsheetViewSet  → smart_money, focus_ranking, share_transfers
  BrokerViewSet      → navigator_signals
  broker.py views    → broker_portfolio, accumulation_history
  price_forecast.py  → accumulation_forecast (new, cached 4h)

Split into domain submodules (Phase 5 refactor):
  _core.py        — shared utilities, constants, SQL templates
  accumulation.py — re-exports from this package for organisational grouping
  trends.py       — re-exports from this package for organisational grouping
  smart_money.py  — re-exports from this package for organisational grouping
  portfolio.py    — re-exports from this package for organisational grouping
  transfers.py    — re-exports from this package for organisational grouping
  forecast.py     — re-exports from this package for organisational grouping
"""
import hashlib
from collections import defaultdict
from datetime import timedelta

from django.db import connections
from django.core.cache import cache
from django.db.models import Sum, Count, Avg, Q, Max
from django.utils import timezone

from stocks.models.market import DailyStockPrice

from ._core import (  # noqa: F401
    RANGE_MAP,
    FORECAST_CACHE_TTL,
    RSI_CTE,
    _ACC_FLOWS_SQL_TEMPLATE,
    _BROKER_TRENDS_SQL_TEMPLATE,
    _BELOW_COST_SQL_TEMPLATE,
    _BROKER_FAVORITES_SQL_TEMPLATE,
    _BROKER_PORTFOLIO_SQL,
    _NAVIGATOR_SIGNALS_QUERY,
)


def _cache_key(*parts):
    raw = ':'.join(str(p) for p in parts)
    return 'acc:' + hashlib.md5(raw.encode()).hexdigest()


def _exec(query, params=None):
    with connections['default'].cursor() as cursor:
        cursor.execute(query, params or [])
        columns = [col[0] for col in cursor.description]
        return [dict(zip(columns, row)) for row in cursor.fetchall()]


# ─── accumulation_flows helpers ───────────────────────────────────────────────

def _build_accumulation_flows_where(sector, symbol):
    """Build WHERE parts and params for accumulation_flows."""
    where_parts = [
        "c.\"instrumentType\" NOT IN ('Mutual Funds', 'Non-Convertible Debentures')",
        "c.status = 'A'",
        "c.\"sectorName\" != 'Unknown'",
        "c.\"sectorName\" IS NOT NULL",
    ]
    params = []
    if sector.lower() != 'all':
        where_parts.append("c.\"sectorName\" = %s")
        params.append(sector)
    if symbol:
        where_parts.append("sa.symbol = %s")
        params.append(symbol)
    return where_parts, params


def _build_accumulation_flows_query(days, where_clause):
    """Build the SQL for accumulation_flows given days and a WHERE clause string."""
    return _ACC_FLOWS_SQL_TEMPLATE.format(days=days, rsi_cte=RSI_CTE).format(where_clause=where_clause)


def accumulation_flows(range_key="1D", sector="All", symbol=None):
    """
    Return accumulation flows.
    Uses Top 15 Broker Concentration (Holders) to determine Net Accumulation (Smart Money flow).
    """
    time_range = range_key
    symbol = (symbol or '').strip().upper()
    days = RANGE_MAP.get(time_range, 1) if time_range != 'ALL' else 36500
    ck = _cache_key('accumulation', time_range, sector, symbol)
    cached = cache.get(ck)
    if cached is not None:
        return cached
    where_parts, params = _build_accumulation_flows_where(sector, symbol)
    where_clause = ' AND '.join(where_parts)
    query = _build_accumulation_flows_query(days, where_clause)
    results = _exec(query, params)
    cache.set(ck, results, 300)
    return results


# ─── broker_trends helpers ────────────────────────────────────────────────────

def _build_broker_trends_sql_fragments(symbol_filter):
    """Return dict of SQL fragment strings for broker_trends based on symbol presence."""
    if symbol_filter:
        return {
            'symbol_sql_floorsheet': "AND symbol = %s",
            'symbol_sql_accum': "WHERE symbol = %s",
            'symbol_sql_where': "AND la.symbol = %s",
            'cumnet_where': "",
            'limit_clause': "",
        }
    return {
        'symbol_sql_floorsheet': "",
        'symbol_sql_accum': "",
        'symbol_sql_where': "",
        'cumnet_where': "AND la.cumulative_net > 100000",
        'limit_clause': "LIMIT 300",
    }


def _build_broker_trends_params(symbol_filter):
    """Return query params list for broker_trends. Symbol used 4 times when present."""
    if not symbol_filter:
        return []
    return [symbol_filter, symbol_filter, symbol_filter, symbol_filter]


def _build_broker_trends_query(days, frags):
    """Build the SQL string for broker_trends using day count and fragment dict."""
    return _BROKER_TRENDS_SQL_TEMPLATE.format(days=days, **frags)


def broker_trends(symbol=None, range_key="ALL"):
    """Return broker trend analysis across symbols."""
    symbol_filter = (symbol or '').strip().upper()
    days = RANGE_MAP.get(range_key, 36500)
    frags = _build_broker_trends_sql_fragments(symbol_filter)
    query = _build_broker_trends_query(days, frags)
    params = _build_broker_trends_params(symbol_filter)
    return _exec(query, params)


# ─── below_cost helpers ───────────────────────────────────────────────────────

def _build_below_cost_where(sector):
    """Build WHERE clause string and params for below_cost."""
    where_parts = [
        "c.\"instrumentType\" NOT IN ('Mutual Funds', 'Non-Convertible Debentures')",
        "c.status = 'A'",
        "c.\"sectorName\" != 'Unknown'",
        "c.\"sectorName\" IS NOT NULL",
    ]
    params = []
    if sector.lower() != 'all':
        where_parts.append("c.\"sectorName\" = %s")
        params.append(sector)
    return ' AND '.join(where_parts), params


def _build_below_cost_query(days, where_clause):
    """Build the SQL for below_cost given days and a WHERE clause string."""
    return _BELOW_COST_SQL_TEMPLATE.format(days=days, rsi_cte=RSI_CTE).format(where_clause=where_clause)


def below_cost(range_key="ALL", sector="All"):
    """Return broker positions where LTP is below their WAC (cost basis)."""
    days = RANGE_MAP.get(range_key, 36500)
    where_clause, params = _build_below_cost_where(sector)
    query = _build_below_cost_query(days, where_clause)
    return _exec(query, params)


# ─── broker_favorites helpers ─────────────────────────────────────────────────

def _fetch_broker_favorites_raw(broker, days):
    """Execute the broker_favorites SQL and return raw rows."""
    broker_params = [broker] * 10 + [str(broker)]
    query = _BROKER_FAVORITES_SQL_TEMPLATE.format(days=days)
    with connections['default'].cursor() as cursor:
        cursor.execute(query, broker_params)
        return cursor.fetchall()


def _build_broker_favorites_base(rows):
    """Map raw DB rows to list of dicts with broker_favorites column names."""
    if not rows:
        return []
    columns = ['symbol', 'name', 'current_net', 'wac', 'qty_accumulated', 'buy_qty', 'sell_qty', 'net_amount']
    return [dict(zip(columns, row)) for row in rows]


def _compute_rsi_roc(item_prices):
    """Compute 14-period RSI and 14-bar ROC from a list of price dicts. Returns (rsi, roc)."""
    if not item_prices or len(item_prices) < 2:
        return 0, 0
    ltp = item_prices[-1]['close']
    lookback = 14
    prev_idx = max(0, len(item_prices) - 1 - lookback)
    prev_close = item_prices[prev_idx]['close']
    roc = ((ltp - prev_close) / prev_close) * 100 if prev_close else 0
    changes = [
        float(item_prices[i]['close']) - float(item_prices[i - 1]['close'])
        for i in range(1, len(item_prices))
    ]
    recent = changes[-14:] if len(changes) >= 14 else changes
    n = len(recent)
    avg_up = sum(c for c in recent if c > 0) / n
    avg_down = sum(abs(c) for c in recent if c < 0) / n
    if avg_down > 0:
        rsi = round(100 - (100 / (1 + avg_up / avg_down)), 2)
    else:
        rsi = 100.0 if avg_up > 0 else 50.0
    return float(rsi), roc


def _build_price_map_for_favorites(symbols):
    """Fetch recent prices for symbols. Returns (price_map, latest_date) or (None, None)."""
    latest_price_obj = DailyStockPrice.objects.filter(ticker__in=symbols).order_by('-date').first()
    if not latest_price_obj:
        return None, None
    latest_date = latest_price_obj.date
    roc_period_date = latest_date - timedelta(days=20)
    prices = DailyStockPrice.objects.filter(
        ticker__in=symbols, date__gte=roc_period_date
    ).values('ticker', 'date', 'close').order_by('ticker', 'date')
    price_map = {}
    for p in prices:
        price_map.setdefault(p['ticker'], []).append(p)
    return price_map, latest_date


def _enrich_broker_favorites_with_prices(base_results):
    """Attach ltp, roc, rsi to each item in base_results. Returns base_results."""
    if not base_results:
        return base_results
    symbols = [r['symbol'] for r in base_results]
    price_map, _ = _build_price_map_for_favorites(symbols)
    if price_map is None:
        for r in base_results:
            r['ltp'] = 0
            r['roc'] = 0
        return base_results
    for item in base_results:
        item_prices = price_map.get(item['symbol'], [])
        if item_prices:
            item['ltp'] = item_prices[-1]['close']
            rsi, roc = _compute_rsi_roc(item_prices)
            item['rsi'] = rsi
            item['roc'] = round(roc, 2)
        else:
            item['ltp'] = 0
            item['roc'] = 0
    return base_results


def broker_favorites(broker_id, range_key="3M"):
    """Return symbols where a specific broker has been active in the given period."""
    broker = int(broker_id)
    days = RANGE_MAP.get(range_key, 90)
    rows = _fetch_broker_favorites_raw(broker, days)
    base_results = _build_broker_favorites_base(rows)
    return _enrich_broker_favorites_with_prices(base_results)


# ─── smart_money helpers ──────────────────────────────────────────────────────

def _fetch_smart_money_leaderboard(start_date, allowed_symbols):
    """Fetch top-10 buying brokers, return (leaderboard list, smart_broker_ids list)."""
    from stocks.models.market import DailyFloorsheet
    top_brokers = DailyFloorsheet.objects.filter(
        transaction_date__gte=start_date, symbol__in=allowed_symbols
    ).values('buyer_id').annotate(
        total_buy_vol=Sum('transaction_quantity')
    ).order_by('-total_buy_vol')[:10]
    leaderboard = []
    smart_broker_ids = []
    for idx, pb in enumerate(top_brokers):
        rank = 'S' if idx == 0 else 'A' if idx < 3 else 'B' if idx < 6 else 'C'
        score = int((pb['total_buy_vol'] or 0) / 1000)
        leaderboard.append({"broker_id": pb['buyer_id'], "score": score, "rank": rank})
        smart_broker_ids.append(pb['buyer_id'])
    return leaderboard, smart_broker_ids


def _fetch_smart_money_signals(start_date, smart_broker_ids, allowed_symbols, days):
    """Fetch whale accumulation signals for smart brokers. Returns signals list."""
    from stocks.models.market import DailyFloorsheet
    min_qty = max(500, int(5000 * max(days, 1) / 30))
    signals_qs = DailyFloorsheet.objects.filter(
        transaction_date__gte=start_date, buyer_id__in=smart_broker_ids, symbol__in=allowed_symbols
    ).values('buyer_id', 'symbol').annotate(
        qty=Sum('transaction_quantity'), amount=Sum('transaction_amount')
    ).filter(qty__gte=min_qty).order_by('-amount')[:20]
    syms = [s['symbol'] for s in signals_qs]
    prices_qs = DailyStockPrice.objects.filter(ticker__in=syms).order_by('ticker', '-date').distinct('ticker')
    price_map = {p.ticker: float(p.close) for p in prices_qs if p.close is not None}
    return [
        {
            "broker_id": sq['buyer_id'], "symbol": sq['symbol'],
            "avg_buy_price": round(float(sq['amount'] / sq['qty']) if sq['qty'] > 0 else 0, 2),
            "ltp": price_map.get(sq['symbol'], 0),
            "qty": sq['qty'], "amount": float(sq['amount']),
            "date": str(start_date),
        }
        for sq in signals_qs
    ]


def _compute_smart_money_kpi(signals, smart_broker_ids):
    """Aggregate KPI dict from signals and broker list."""
    return {
        "total_whale_volume": sum(s['qty'] for s in signals),
        "total_whale_amount": sum(s['amount'] for s in signals),
        "active_symbols": len(set(s['symbol'] for s in signals)),
        "active_brokers": len(smart_broker_ids),
    }


def _fetch_smart_money_symbol_flows(start_date, smart_broker_ids, allowed_symbols):
    """Fetch per-symbol net flow for smart brokers. Returns sorted symbol_flows list."""
    from stocks.models.market import DailyFloorsheet
    buy_side = DailyFloorsheet.objects.filter(
        transaction_date__gte=start_date, buyer_id__in=smart_broker_ids, symbol__in=allowed_symbols
    ).values('symbol').annotate(
        buy_qty=Sum('transaction_quantity'), buy_amount=Sum('transaction_amount'),
        buy_broker_count=Count('buyer_id', distinct=True),
    )
    sell_side = DailyFloorsheet.objects.filter(
        transaction_date__gte=start_date, seller_id__in=smart_broker_ids, symbol__in=allowed_symbols
    ).values('symbol').annotate(
        sell_qty=Sum('transaction_quantity'), sell_amount=Sum('transaction_amount'),
    )
    buy_map = {r['symbol']: r for r in buy_side}
    sell_map = {r['symbol']: r for r in sell_side}
    raw = []
    for sym in set(buy_map) | set(sell_map):
        b, s = buy_map.get(sym, {}), sell_map.get(sym, {})
        buy_qty = b.get('buy_qty', 0) or 0
        sell_qty = s.get('sell_qty', 0) or 0
        buy_amount = float(b.get('buy_amount') or 0)
        sell_amount = float(s.get('sell_amount') or 0)
        raw.append({
            'symbol': sym, 'smart_buy_qty': buy_qty, 'smart_sell_qty': sell_qty,
            'net_qty': buy_qty - sell_qty, 'buy_amount': buy_amount,
            'sell_amount': sell_amount, 'net_amount': buy_amount - sell_amount,
            'broker_count': b.get('buy_broker_count', 0) or 0,
        })
    return sorted([sf for sf in raw if sf['net_qty'] > 0], key=lambda x: x['net_qty'], reverse=True)[:20]


def smart_money(range_key="1D"):
    """
    Identify top accumulating 'smart brokers' and their active whale signals.
    Extracted verbatim from FloorsheetViewSet.smart_money.
    """
    from stocks.models.market import Company
    range_days = {'1D': 0, '2D': 1, '3D': 2, '1W': 6, '1M': 29, '3M': 89, '6M': 179}
    days = range_days.get(range_key, 0)
    allowed_symbols = Company.objects.values_list('symbol', flat=True)
    latest_price = DailyStockPrice.objects.order_by('-date').values_list('date', flat=True).first()
    today = latest_price if latest_price else timezone.now().date()
    start_date = today - timedelta(days=days)
    leaderboard, smart_broker_ids = _fetch_smart_money_leaderboard(start_date, allowed_symbols)
    signals = _fetch_smart_money_signals(start_date, smart_broker_ids, allowed_symbols, days)
    kpi = _compute_smart_money_kpi(signals, smart_broker_ids)
    symbol_flows = _fetch_smart_money_symbol_flows(start_date, smart_broker_ids, allowed_symbols)
    return {"leaderboard": leaderboard, "signals": signals, "kpi": kpi, "symbol_flows": symbol_flows}


# ─── focus_ranking helpers ────────────────────────────────────────────────────

def _fetch_focus_ranking_raw(start_date):
    """Fetch aggregated buyer/seller floorsheet rows. Returns (broker_data, raw_buys, raw_sells)."""
    from stocks.models.market import DailyBuyerFloorsheet, DailySellerFloorsheet
    raw_buys = DailyBuyerFloorsheet.objects.filter(transaction_date__gte=start_date).values(
        'transaction_date', 'buyer_id', 'symbol', 'buy_volume', 'average_weighted_price'
    )
    raw_sells = DailySellerFloorsheet.objects.filter(transaction_date__gte=start_date).values(
        'transaction_date', 'seller_id', 'symbol', 'sell_volume'
    )
    broker_data = defaultdict(lambda: defaultdict(lambda: defaultdict(
        lambda: {'buy_vol': 0, 'sell_vol': 0, 'buy_amount': 0}
    )))
    for row in raw_buys:
        d, b, s = row['transaction_date'], row['buyer_id'], row['symbol']
        vol = float(row['buy_volume'] or 0)
        broker_data[d][b][s]['buy_vol'] += vol
        broker_data[d][b][s]['buy_amount'] += vol * float(row['average_weighted_price'] or 0)
    for row in raw_sells:
        d, b, s = row['transaction_date'], row['seller_id'], row['symbol']
        broker_data[d][b][s]['sell_vol'] += float(row['sell_volume'] or 0)
    return broker_data, raw_buys, raw_sells


def _rank_stocks_for_date(date, broker_data):
    """Compute top brokers and stock rankings for a single date. Returns (top10, rankings, top_sellers_map)."""
    broker_buys = {b: sum(s['buy_vol'] for s in stocks.values()) for b, stocks in broker_data[date].items()}
    top10_brokers = sorted(broker_buys, key=lambda b: -broker_buys[b])[:10]
    stock_net_agg = defaultdict(int)
    stock_buy_agg = defaultdict(int)
    stock_amount_agg = defaultdict(float)
    for broker in top10_brokers:
        for sym, stats in broker_data[date][broker].items():
            stock_net_agg[sym] += (stats['buy_vol'] - stats['sell_vol'])
            stock_buy_agg[sym] += stats['buy_vol']
            stock_amount_agg[sym] += stats['buy_amount']
    top10_net_stocks = sorted(stock_net_agg.items(), key=lambda x: -x[1])[:10]
    stock_top_sellers = {}
    for sym, _ in top10_net_stocks:
        sym_sellers = [
            (b, stocks[sym]['sell_vol'])
            for b, stocks in broker_data[date].items()
            if sym in stocks and stocks[sym]['sell_vol'] > 0
        ]
        stock_top_sellers[sym] = [b for b, v in sorted(sym_sellers, key=lambda x: -x[1])[:5]]
    rankings = [
        {
            'symbol': sym, 'rank': idx + 1, 'volume': net_vol,
            'buy_price': round(stock_amount_agg[sym] / stock_buy_agg[sym], 2) if stock_buy_agg[sym] > 0 else 0,
            'top_sellers': stock_top_sellers.get(sym, []),
        }
        for idx, (sym, net_vol) in enumerate(top10_net_stocks)
    ]
    return top10_brokers, rankings


def _compute_focus_daily_rankings(broker_data):
    """Build daily rankings and top broker lists from broker_data. Returns (dates, daily_rankings, daily_top_brokers)."""
    dates = sorted(broker_data.keys())
    daily_rankings = {}
    daily_top_brokers = {}
    for date in dates:
        top10_brokers, rankings = _rank_stocks_for_date(date, broker_data)
        daily_top_brokers[str(date)] = top10_brokers
        daily_rankings[str(date)] = rankings
    return dates, daily_rankings, daily_top_brokers


def _build_ltp_map(all_syms, latest_date):
    """Fetch LTP for all symbols, falling back to latest available price. Returns ltp_map dict."""
    if not all_syms:
        return {}
    ltp_qs = DailyStockPrice.objects.filter(ticker__in=all_syms, date=latest_date).values('ticker', 'close')
    ltp_map = {p['ticker']: float(p['close']) for p in ltp_qs}
    for sym in all_syms - set(ltp_map.keys()):
        last_p = DailyStockPrice.objects.filter(ticker=sym).order_by('-date').first()
        if last_p:
            ltp_map[sym] = float(last_p.close)
    return ltp_map


def _build_symbol_series(sym, daily_rankings, date_strs, ltp_map):
    """Build series entry dict for a single symbol across all dates."""
    ranks, net_volumes, appearances, rank_sum = [], [], 0, 0
    for ds in date_strs:
        found = next((x for x in daily_rankings.get(ds, []) if x['symbol'] == sym), None)
        if found:
            found['ltp'] = ltp_map.get(sym)
            ranks.append(found['rank'])
            net_volumes.append(found['volume'])
            appearances += 1
            rank_sum += found['rank']
        else:
            ranks.append(None)
            net_volumes.append(None)
    return {
        'symbol': sym, 'ltp': ltp_map.get(sym), 'ranks': ranks, 'volumes': net_volumes,
        'appearances': appearances, 'avg_rank': round(rank_sum / appearances, 2) if appearances else 10.0,
    }


def _enrich_focus_ranking_series(daily_rankings, dates, latest_date):
    """Build enriched series list from daily_rankings. Returns (sorted series, date_strs)."""
    all_syms = {item['symbol'] for day in daily_rankings.values() for item in day}
    ltp_map = _build_ltp_map(all_syms, latest_date)
    date_strs = [str(d) for d in dates]
    series = [_build_symbol_series(sym, daily_rankings, date_strs, ltp_map) for sym in all_syms]
    series.sort(key=lambda s: (-s['appearances'], s['avg_rank']))
    return series, date_strs


def focus_ranking(range_key="1W"):
    """
    For each trading day in the range, find the top-10 brokers by buy volume,
    then rank the top-5 stocks those brokers are collectively buying (Net Volume).
    """
    from stocks.models.market import DailyBuyerFloorsheet
    range_days = {'1W': 6, '2W': 13, '1M': 29}
    days = range_days.get(range_key, 6)
    latest_date_data = DailyBuyerFloorsheet.objects.aggregate(Max('transaction_date'))
    latest_date = latest_date_data['transaction_date__max']
    if not latest_date:
        latest_price_obj = DailyStockPrice.objects.order_by('-date').first()
        latest_date = latest_price_obj.date if latest_price_obj else timezone.now().date()
    start_date = latest_date - timedelta(days=days)
    broker_data, raw_buys, raw_sells = _fetch_focus_ranking_raw(start_date)
    dates, daily_rankings, daily_top_brokers = _compute_focus_daily_rankings(broker_data)
    series, date_strs = _enrich_focus_ranking_series(daily_rankings, dates, latest_date)
    return {
        'dates': date_strs, 'daily_top_brokers': daily_top_brokers,
        'daily_rankings': daily_rankings, 'series': series,
        'debug_info': {
            'latest_date': str(latest_date),
            'raw_buys_count': len(raw_buys),
            'raw_sells_count': len(raw_sells),
        },
    }


# ─── share_transfers helpers ──────────────────────────────────────────────────

def _resolve_share_transfer_dates(range_key, start_date, end_date):
    """Resolve start/end date strings. If range_key given, derives from latest price date."""
    if not range_key:
        return start_date, end_date
    range_map = {'1D': 0, '1W': 7, '2W': 14, '1M': 30, '3M': 90, '6M': 180, '1Y': 365, 'ALL': 3650}
    days = range_map.get(range_key, 30)
    latest_price = DailyStockPrice.objects.order_by('-date').first()
    today = latest_price.date if latest_price else timezone.now().date()
    return (today - timedelta(days=days)).strftime('%Y-%m-%d'), today.strftime('%Y-%m-%d')


def _build_share_transfers_filters(symbol, start_date, end_date, b1_id, b2_id):
    """Build base Q filters and broker-pair transfer filter. Returns (filters, transfer_filter)."""
    filters = Q(symbol=symbol)
    if start_date and end_date:
        filters &= Q(transaction_date__range=[start_date, end_date])
    elif start_date:
        filters &= Q(transaction_date__gte=start_date)
    elif end_date:
        filters &= Q(transaction_date__lte=end_date)
    transfer_filter = Q(buyer_id=b1_id, seller_id=b2_id) | Q(buyer_id=b2_id, seller_id=b1_id)
    return filters, transfer_filter


def _fetch_transfer_net_acc_map(filters, symbol):
    """Fetch smart money net accumulation per date for transfer analysis."""
    from stocks.models.market import DailyFloorsheet, DailyCumulativeAccumulation
    top_15 = list(DailyCumulativeAccumulation.objects.filter(
        symbol=symbol
    ).order_by('-transaction_date', '-cumulative_net').values_list('entity_id', flat=True)[:15])
    symbol_daily_net = DailyFloorsheet.objects.filter(filters).values('transaction_date').annotate(
        net_acc=Sum('transaction_quantity', filter=Q(buyer_id__in=top_15)) -
                Sum('transaction_quantity', filter=Q(seller_id__in=top_15))
    )
    return {item['transaction_date']: item['net_acc'] for item in symbol_daily_net}


def _fetch_transfer_meta_map(filters, b1_id, b2_id):
    """Fetch per-date broker net positions for share_transfers."""
    from stocks.models.market import DailyFloorsheet
    daily_meta = DailyFloorsheet.objects.filter(filters).values('transaction_date').annotate(
        b1_net=Sum('transaction_quantity', filter=Q(buyer_id=b1_id)) - Sum('transaction_quantity', filter=Q(seller_id=b1_id)),
        b2_net=Sum('transaction_quantity', filter=Q(buyer_id=b2_id)) - Sum('transaction_quantity', filter=Q(seller_id=b2_id)),
        b1_buy=Sum('transaction_quantity', filter=Q(buyer_id=b1_id)),
        b1_sell=Sum('transaction_quantity', filter=Q(seller_id=b1_id)),
        b2_buy=Sum('transaction_quantity', filter=Q(buyer_id=b2_id)),
        b2_sell=Sum('transaction_quantity', filter=Q(seller_id=b2_id)),
        symbol_total_vol=Sum('transaction_quantity'),
    )
    return {item['transaction_date']: item for item in daily_meta}


def _fetch_transfer_stats_and_daily(filters, b1_id, b2_id):
    """Fetch aggregate stats and daily queryset for the broker-pair transfer."""
    from stocks.models.market import DailyFloorsheet
    transfer_filter = Q(buyer_id=b1_id, seller_id=b2_id) | Q(buyer_id=b2_id, seller_id=b1_id)
    queryset = DailyFloorsheet.objects.filter(filters & transfer_filter)
    stats = queryset.aggregate(
        total_volume_1_to_2=Sum('transaction_quantity', filter=Q(buyer_id=b1_id, seller_id=b2_id)),
        total_volume_2_to_1=Sum('transaction_quantity', filter=Q(buyer_id=b2_id, seller_id=b1_id)),
        total_amount_1_to_2=Sum('transaction_amount', filter=Q(buyer_id=b1_id, seller_id=b2_id)),
        total_amount_2_to_1=Sum('transaction_amount', filter=Q(buyer_id=b2_id, seller_id=b1_id)),
        count_1_to_2=Count('transaction_id', filter=Q(buyer_id=b1_id, seller_id=b2_id)),
        count_2_to_1=Count('transaction_id', filter=Q(buyer_id=b2_id, seller_id=b1_id)),
        avg_rate_1_to_2=Avg('transaction_rate', filter=Q(buyer_id=b1_id, seller_id=b2_id)),
        avg_rate_2_to_1=Avg('transaction_rate', filter=Q(buyer_id=b2_id, seller_id=b1_id)),
    )
    qs_daily = queryset.values('transaction_date').annotate(
        volume_1_to_2=Sum('transaction_quantity', filter=Q(buyer_id=b1_id, seller_id=b2_id)),
        volume_2_to_1=Sum('transaction_quantity', filter=Q(buyer_id=b2_id, seller_id=b1_id)),
        amount_1_to_2=Sum('transaction_amount', filter=Q(buyer_id=b1_id, seller_id=b2_id)),
        amount_2_to_1=Sum('transaction_amount', filter=Q(buyer_id=b2_id, seller_id=b1_id)),
        avg_rate_1_to_2=Avg('transaction_rate', filter=Q(buyer_id=b1_id, seller_id=b2_id)),
        avg_rate_2_to_1=Avg('transaction_rate', filter=Q(buyer_id=b2_id, seller_id=b1_id)),
    ).order_by('transaction_date')
    return stats, qs_daily


def _build_daily_stats(qs_daily, meta_map, net_acc_map, price_map):
    """Enrich daily queryset rows with meta and price data. Returns daily_stats list."""
    sorted_dates = sorted(price_map.keys())
    daily_stats = []
    for item in qs_daily:
        dt = item['transaction_date']
        meta = meta_map.get(dt, {})
        price_change = 0
        try:
            idx = sorted_dates.index(dt)
            if idx > 0:
                curr, prev = price_map[dt], price_map[sorted_dates[idx - 1]]
                if prev > 0:
                    price_change = round(((curr - prev) / prev) * 100, 2)
        except (ValueError, IndexError):
            pass
        item.update({
            'net_accumulation': net_acc_map.get(dt, 0),
            'b1_net': meta.get('b1_net', 0), 'b2_net': meta.get('b2_net', 0),
            'b1_buy': meta.get('b1_buy', 0), 'b1_sell': meta.get('b1_sell', 0),
            'b2_buy': meta.get('b2_buy', 0), 'b2_sell': meta.get('b2_sell', 0),
            'symbol_total_vol': meta.get('symbol_total_vol', 0),
            'price_change_pc': price_change, 'close_price': price_map.get(dt, 0),
        })
        daily_stats.append(item)
    return daily_stats


def _build_transfer_summary(stats, b1_id, b2_id):
    """Build the summary dict for share_transfers from aggregate stats."""
    return {
        "broker1_to_broker2": {
            "total_volume": stats['total_volume_1_to_2'] or 0,
            "total_amount": stats['total_amount_1_to_2'] or 0,
            "total_transactions": stats['count_1_to_2'] or 0,
            "avg_rate": round(stats['avg_rate_1_to_2'] or 0, 2),
        },
        "broker2_to_broker1": {
            "total_volume": stats['total_volume_2_to_1'] or 0,
            "total_amount": stats['total_amount_2_to_1'] or 0,
            "total_transactions": stats['count_2_to_1'] or 0,
            "avg_rate": round(stats['avg_rate_2_to_1'] or 0, 2),
        },
    }


def share_transfers(symbol, broker1, broker2, range_key="1M", start_date=None, end_date=None):
    """Analyze share transfers between two specific brokers for a symbol."""
    b1_id, b2_id = int(broker1), int(broker2)
    start_date, end_date = _resolve_share_transfer_dates(range_key, start_date, end_date)
    filters, _ = _build_share_transfers_filters(symbol, start_date, end_date, b1_id, b2_id)
    net_acc_map = _fetch_transfer_net_acc_map(filters, symbol)
    meta_map = _fetch_transfer_meta_map(filters, b1_id, b2_id)
    stats, qs_daily = _fetch_transfer_stats_and_daily(filters, b1_id, b2_id)
    prices = DailyStockPrice.objects.filter(ticker=symbol).order_by('date')
    price_map = {p.date: float(p.close) for p in prices}
    daily_stats = _build_daily_stats(qs_daily, meta_map, net_acc_map, price_map)
    return {
        "summary": _build_transfer_summary(stats, b1_id, b2_id),
        "daily_stats": list(daily_stats),
        "aggregated_transfers": list(daily_stats)[::-1],
    }


# ─── navigator_signals helpers ────────────────────────────────────────────────

def _fetch_navigator_raw():
    """Execute the navigator_signals SQL and return list of row dicts."""
    with connections['default'].cursor() as cursor:
        cursor.execute(_NAVIGATOR_SIGNALS_QUERY)
        columns = [col[0] for col in cursor.description]
        return [dict(zip(columns, row)) for row in cursor.fetchall()]


def _classify_navigator_signal(row):
    """Return (signal_type, rationale, strength) for a row, or (None, None, None) if no signal."""
    ltp = float(row['ltp'] or 0)
    wac = float(row['top_broker_wac'] or 0)
    net_5d = float(row['inst_net_5d'] or 0)
    clusters = row['cluster_count']
    price_5d = float(row['close_5d'] or ltp)
    price_change = ((ltp - price_5d) / price_5d) * 100 if price_5d > 0 else 0
    markup = ((ltp - wac) / wac) * 100 if wac > 0 else 0
    if clusters >= 2 and -5 <= markup <= 5:
        return "Platinum Buy", f"Institutional Clustering ({clusters} brokers) near average cost (WAC).", "Exceptional"
    if clusters >= 4 or (net_5d > 200000 and price_change > 2):
        rationale = (f"High Institutional Clustering ({clusters} brokers) identified."
                     if clusters >= 4 else "Aggressive institutional accumulation with price momentum.")
        return "Gold Signal", rationale, "High"
    if clusters >= 2:
        return "Silver Signal", f"Early institutional interest detected from {clusters} smart-money brokers.", "Medium"
    if price_change < -3 and net_5d > 100000:
        return "Bullish Divergence", "Institutional accumulation increasing despite price correction.", "High"
    return None, None, None


def _build_navigator_signal_row(row):
    """Return enriched row dict if a signal exists, else None."""
    ltp = float(row['ltp'] or 0)
    wac = float(row['top_broker_wac'] or 0)
    price_5d = float(row['close_5d'] or ltp)
    price_change = ((ltp - price_5d) / price_5d) * 100 if price_5d > 0 else 0
    markup = ((ltp - wac) / wac) * 100 if wac > 0 else 0
    signal_type, rationale, strength = _classify_navigator_signal(row)
    if signal_type is None:
        return None
    row.update({
        'signal_type': signal_type, 'rationale': rationale, 'strength': strength,
        'markup_percent': round(markup, 2), 'price_change_5d': round(price_change, 2),
    })
    return row


def navigator_signals():
    """
    Identify high-potential signals using Institutional Clustering and Divergence.
    Extracted verbatim from BrokerViewSet.signals.
    """
    ck = _cache_key('navigator_signals')
    cached = cache.get(ck)
    if cached is not None:
        return cached
    raw_results = _fetch_navigator_raw()
    signals = [row for row in (_build_navigator_signal_row(r) for r in raw_results) if row is not None]
    cache.set(ck, signals, 300)
    return signals


# ─── broker_portfolio helpers ─────────────────────────────────────────────────

def _build_broker_portfolio_query():
    """Return the static SQL string for broker_portfolio (no params embedded)."""
    return _BROKER_PORTFOLIO_SQL


def _exec_broker_portfolio(broker_id, query):
    """Run broker_portfolio SQL for a single broker_id. Returns list of dicts."""
    with connections['default'].cursor() as cursor:
        cursor.execute(query, [broker_id, broker_id])
        columns = [col[0] for col in cursor.description]
        return [dict(zip(columns, row)) for row in cursor.fetchall()]


def broker_portfolio(broker_id):
    """
    Return a broker's full portfolio: holdings with multi-period trend deltas.
    Extracted verbatim from get_broker_portfolio function view.
    """
    broker_id = str(broker_id)
    query = _build_broker_portfolio_query()
    results = _exec_broker_portfolio(broker_id, query)
    total_value = sum(h['value'] for h in results if h['value'])
    return {'broker_id': broker_id, 'total_value': total_value, 'holdings': results}


# ─── accumulation_history helpers ─────────────────────────────────────────────

def _compute_history_delta(h, prev_h):
    """Compute daily delta dict from a cumulative accumulation record and its predecessor."""
    if prev_h:
        buy_qty = float(h.cumulative_buy - prev_h.cumulative_buy)
        buy_amt = float(h.cumulative_buy_amount - prev_h.cumulative_buy_amount)
        sell_qty = float(h.cumulative_sell - prev_h.cumulative_sell)
        sell_amt = float(h.cumulative_sell_amount - prev_h.cumulative_sell_amount)
        net_qty = float(h.cumulative_net - prev_h.cumulative_net)
    else:
        buy_qty = float(h.cumulative_buy)
        buy_amt = float(h.cumulative_buy_amount)
        sell_qty = float(h.cumulative_sell)
        sell_amt = float(h.cumulative_sell_amount)
        net_qty = float(h.cumulative_net)
    return {
        'date': h.transaction_date.strftime('%Y-%m-%d'),
        'buy_qty': buy_qty, 'buy_rate': buy_amt / buy_qty if buy_qty > 0 else 0,
        'buy_amount': buy_amt, 'sell_qty': sell_qty,
        'sell_rate': sell_amt / sell_qty if sell_qty > 0 else 0,
        'sell_amount': sell_amt, 'net_quantity': net_qty,
        'cumulative_qty': float(h.cumulative_net),
        'wac': float(h.cumulative_buy_amount / h.cumulative_buy) if h.cumulative_buy > 0 else 0,
    }


def accumulation_history(broker_id, symbol, page=1, page_size=250):
    """
    Return paginated daily accumulation delta history for a broker/symbol pair.
    Extracted verbatim from accumulation_history function view.
    """
    from stocks.models import DailyCumulativeAccumulation
    history = DailyCumulativeAccumulation.objects.filter(
        entity_id=str(broker_id), symbol=symbol
    ).order_by('transaction_date')
    results = []
    prev_h = None
    for h in history:
        results.append(_compute_history_delta(h, prev_h))
        prev_h = h
    results.reverse()
    start = (page - 1) * page_size
    return results[start:start + page_size]


# ─── accumulation_forecast helpers ────────────────────────────────────────────

def _load_forecast_data(symbol, start_date):
    """Load price_df and acc_df for symbol. Returns (price_df, acc_df) or None if either empty."""
    from stocks.views.price_forecast import _load_price_df, _load_acc_df
    price_df = _load_price_df(symbols=[symbol], start_date=start_date)
    if price_df.empty:
        return None
    acc_df = _load_acc_df(symbols=[symbol], start_date=start_date)
    if acc_df.empty:
        return None
    return price_df, acc_df


def _extract_current_state(features, symbol):
    """Extract current state dict from features DataFrame for symbol. Returns dict or None."""
    import pandas as pd
    latest = features[features['ticker'] == symbol].sort_values('date')
    latest_valid = latest[latest['intensity'].notna()]
    if latest_valid.empty:
        return None
    row = latest_valid.iloc[-1]
    current_price = float(row['close']) if not pd.isna(row['close']) else None
    vol_spike = float(row['volume_spike']) if not pd.isna(row['volume_spike']) else None
    turn_spike = float(row['turnover_spike']) if not pd.isna(row['turnover_spike']) else None
    net_acc_10d = float(row['net_acc_10d']) if not pd.isna(row['net_acc_10d']) else 0.0
    avg_vol = float(row['avg_daily_volume_20d']) if not pd.isna(row['avg_daily_volume_20d']) else None
    intensity = float(row['intensity']) if not pd.isna(row['intensity']) else 0.0
    return {
        'ltp': round(current_price, 2) if current_price else None,
        'date': row['date'].strftime('%Y-%m-%d'),
        'intensity': round(intensity, 4),
        'volume_spike': round(vol_spike, 4) if vol_spike else None,
        'turnover_spike': round(turn_spike, 4) if turn_spike else None,
        'net_acc_10d': round(net_acc_10d, 2),
        'avg_daily_volume_20d': round(avg_vol, 2) if avg_vol else None,
    }


def _compute_study(events, features):
    """Build study dict from historical events. Returns (study dict, events_with_returns df)."""
    import pandas as pd
    from stocks.views.price_forecast import (
        LAG_ANALYSIS_LAGS, _compute_forward_returns,
        _add_extra_lags_for_analysis, _compute_study_stats,
    )
    events_with_returns = _compute_forward_returns(events, features) if not events.empty else pd.DataFrame()
    if not events_with_returns.empty:
        events_with_returns = _add_extra_lags_for_analysis(events_with_returns, features, LAG_ANALYSIS_LAGS)
        stats = _compute_study_stats(events_with_returns)
        return {'total_events': len(events_with_returns), **stats}, events_with_returns
    empty_study = {
        'total_events': 0, 'win_rates': {}, 'avg_returns': {}, 'median_returns': {},
        'p25_returns': {}, 'p75_returns': {}, 'correlation': {},
        'scatter_data': [], 'lag_analysis': [],
    }
    return empty_study, events_with_returns


def _import_price_forecast_helpers():
    """Lazily import price_forecast helpers to avoid circular imports. Returns dict of callables."""
    from stocks.views.price_forecast import (
        STUDY_YEARS, _build_daily_acc, _compute_features,
        _identify_events, _build_projection, _build_history, _build_price_series,
    )
    return {
        'STUDY_YEARS': STUDY_YEARS,
        'build_daily_acc': _build_daily_acc,
        'compute_features': _compute_features,
        'identify_events': _identify_events,
        'build_projection': _build_projection,
        'build_history': _build_history,
        'build_price_series': _build_price_series,
    }


def _compute_forecast(symbol: str, min_intensity: float) -> dict | None:
    """
    Core per-symbol forecast computation extracted from AccumulationForecastView.get.
    Returns the response dict on success, or None when data is absent/insufficient.
    HTTP handling and param parsing remain in the view.
    """
    from datetime import date, timedelta as td
    pf = _import_price_forecast_helpers()
    start_date = date.today() - td(days=pf['STUDY_YEARS'] * 365)
    loaded = _load_forecast_data(symbol, start_date)
    if loaded is None:
        return None
    price_df, acc_df = loaded
    features = pf['compute_features'](price_df, pf['build_daily_acc'](acc_df))
    if features.empty:
        return None
    current_state = _extract_current_state(features, symbol)
    if current_state is None:
        return None
    events = pf['identify_events'](features, min_intensity)
    study, events_with_returns = _compute_study(events, features)
    projection = pf['build_projection'](events_with_returns, current_state['intensity'], current_state['ltp'], current_state['date'])
    return {
        'symbol': symbol, 'current': current_state, 'study': study,
        'projection': projection,
        'history': pf['build_history'](events_with_returns),
        'price_series': pf['build_price_series'](features, events, symbol),
    }


def accumulation_forecast(symbol: str, min_intensity: float = 3.0) -> dict | None:
    """Per-symbol accumulation price-study projection. Cached 4h. NEVER market-wide."""
    key = f"broker_research:forecast:{symbol.upper()}:{min_intensity}"
    cached = cache.get(key)
    if cached is not None:
        return cached
    result = _compute_forecast(symbol.upper(), min_intensity)
    if result is not None:
        cache.set(key, result, FORECAST_CACHE_TTL)
    return result
