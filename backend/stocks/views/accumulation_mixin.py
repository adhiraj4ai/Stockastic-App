from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from django.db import connections
from datetime import timedelta
from django.utils import timezone
from django.core.cache import cache
# RANGE_MAP, _cache_key, _exec are private helpers intentionally shared with the non-extracted actions (aggressive, brokers_graph).
from ..services.broker_research import (
    RANGE_MAP,
    _cache_key,
    _exec,
    accumulation_flows,
    broker_trends as _broker_trends_svc,
    below_cost as _below_cost_svc,
    broker_favorites as _broker_favorites_svc,
)

_AGGRESSIVE_QUERY_TEMPLATE = """
WITH floorsheet_ref AS (
    SELECT transaction_date as current_date
    FROM daily_floorsheet
    GROUP BY transaction_date
    HAVING COUNT(*) > 100
    ORDER BY transaction_date DESC
    LIMIT 1
),
accumulation_ref AS (
    SELECT transaction_date as latest_acc_date
    FROM daily_cumulative_accumulation
    GROUP BY transaction_date
    HAVING COUNT(*) > 100
    ORDER BY transaction_date DESC
    LIMIT 1
),
target_range AS (
    SELECT current_date - INTERVAL '{days} days' as start_date FROM floorsheet_ref
),
latest_positions AS (
    SELECT
        symbol, entity_id, cumulative_net,
        ROW_NUMBER() OVER (PARTITION BY symbol ORDER BY cumulative_net DESC) as rank
    FROM daily_cumulative_accumulation, accumulation_ref
    WHERE transaction_date = accumulation_ref.latest_acc_date
    AND cumulative_net > 0
),
smart_money AS (
    SELECT symbol, entity_id as broker
    FROM latest_positions
    WHERE rank <= 15
),
floorsheet_activity AS (
    SELECT buyer_id as broker, symbol, transaction_quantity as buy_qty, 0 as sell_qty
    FROM daily_floorsheet, target_range
    WHERE transaction_date > target_range.start_date
    UNION ALL
    SELECT seller_id as broker, symbol, 0 as buy_qty, transaction_quantity as sell_qty
    FROM daily_floorsheet, target_range
    WHERE transaction_date > target_range.start_date
),
broker_symbol_summary AS (
    SELECT broker, symbol, SUM(buy_qty) - SUM(sell_qty) as net_flow
    FROM floorsheet_activity
    GROUP BY broker, symbol
),
symbol_accumulation AS (
    SELECT
        bn.symbol,
        SUM(CASE WHEN sm.broker IS NOT NULL AND bn.net_flow > 0 THEN bn.net_flow ELSE 0 END) as institutional_buy,
        SUM(CASE WHEN sm.broker IS NOT NULL AND bn.net_flow < 0 THEN ABS(bn.net_flow) ELSE 0 END) as institutional_sell,
        ARRAY_AGG(bn.broker ORDER BY bn.net_flow DESC) FILTER (WHERE bn.net_flow > 0) as top_buyers,
        ARRAY_AGG(bn.broker ORDER BY bn.net_flow ASC) FILTER (WHERE bn.net_flow < 0) as top_sellers
    FROM broker_symbol_summary bn
    LEFT JOIN smart_money sm ON bn.symbol = sm.symbol AND CAST(bn.broker AS VARCHAR) = sm.broker
    GROUP BY bn.symbol
),
price_ref AS (
    SELECT transaction_date as latest_price_date
    FROM daily_stock_price
    GROUP BY transaction_date
    HAVING COUNT(*) > 100
    ORDER BY transaction_date DESC
    LIMIT 1
),
avg_volume_cte AS (
    SELECT
        symbol,
        AVG(volume) OVER (PARTITION BY symbol ORDER BY transaction_date DESC ROWS BETWEEN CURRENT ROW AND 19 FOLLOWING) as avg_vol_20d,
        close,
        transaction_date,
        ROW_NUMBER() OVER (PARTITION BY symbol ORDER BY transaction_date DESC) as rn
    FROM daily_stock_price, price_ref
    WHERE transaction_date <= price_ref.latest_price_date
),
latest_avg_vol AS (
    SELECT symbol, avg_vol_20d, close FROM avg_volume_cte WHERE rn = 1
),
intensity_cte AS (
    SELECT
        ss.symbol, c."companyName" as name, c."sectorName" as sector,
        ss.institutional_buy, ss.institutional_sell,
        (CAST(ss.institutional_buy AS NUMERIC) - ss.institutional_sell) as net_qty,
        lav.avg_vol_20d, lav.close,
        CASE
            WHEN lav.avg_vol_20d > 0
            THEN ROUND(((CAST(ss.institutional_buy AS NUMERIC) - ss.institutional_sell) / lav.avg_vol_20d) * 100, 2)
            ELSE 0
        END as intensity,
        COALESCE(ss.top_buyers[1:3]::text[], ARRAY[]::text[]) as producers,
        COALESCE(ss.top_sellers[1:3]::text[], ARRAY[]::text[]) as offloaders
    FROM symbol_accumulation ss
    INNER JOIN companies c ON ss.symbol = c.symbol
    INNER JOIN latest_avg_vol lav ON ss.symbol = lav.symbol
    WHERE {where_clause}
)
SELECT * FROM intensity_cte
WHERE ABS(intensity) > 5
ORDER BY ABS(intensity) DESC;
"""


def _build_aggressive_where(sector):
    """Build the WHERE clause and params for the aggressive query."""
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


def _run_aggressive_query(days, sector):
    """Execute the aggressive institutional activity SQL and return raw results."""
    where_clause, params = _build_aggressive_where(sector)
    query = _AGGRESSIVE_QUERY_TEMPLATE.format(days=days, where_clause=where_clause)
    return _exec(query, params)


def _format_aggressive_results(results):
    """Split raw results into accumulators and distributors lists."""
    return {
        'accumulators': [r for r in results if r['intensity'] > 0][:10],
        'distributors': [r for r in results if r['intensity'] < 0][:10],
    }


def _fetch_latest_price_date():
    """Return the most recent date that has meaningful price data."""
    with connections['default'].cursor() as cursor:
        cursor.execute("""
            SELECT transaction_date FROM daily_stock_price
            GROUP BY transaction_date HAVING COUNT(*) > 100
            ORDER BY transaction_date DESC LIMIT 1
        """)
        row = cursor.fetchone()
    return row[0] if row else timezone.now().date()


def _fetch_top_brokers_for_symbol(symbol):
    """Return up to 5 broker entity_ids with highest cumulative_net for symbol."""
    with connections['default'].cursor() as cursor:
        cursor.execute("""
            SELECT entity_id FROM daily_cumulative_accumulation
            WHERE symbol = %s AND transaction_date = (
                SELECT transaction_date FROM daily_cumulative_accumulation
                GROUP BY transaction_date HAVING COUNT(*) > 100
                ORDER BY transaction_date DESC LIMIT 1
            )
            ORDER BY cumulative_net DESC LIMIT 5
        """, [symbol])
        return [row[0] for row in cursor.fetchall()]


def _fetch_broker_history(symbol, top_brokers, start_date):
    """Fetch cumulative_net time series for the given brokers and symbol."""
    placeholders = ', '.join(['%s'] * len(top_brokers))
    query = (
        f"SELECT transaction_date, entity_id, cumulative_net "
        f"FROM daily_cumulative_accumulation "
        f"WHERE symbol = %s AND entity_id IN ({placeholders}) AND transaction_date >= %s"
    )
    with connections['default'].cursor() as cursor:
        cursor.execute(query, [symbol] + top_brokers + [start_date])
        return cursor.fetchall()


def _build_broker_history_series(rows):
    """Convert raw history rows into a sorted list of date-keyed dicts."""
    data_map = {}
    for row in rows:
        date_str = row[0].strftime('%Y-%m-%d')
        broker, net = row[1], row[2]
        if date_str not in data_map:
            data_map[date_str] = {'date': date_str}
        data_map[date_str][broker] = net
    return sorted(data_map.values(), key=lambda x: x['date'])


def _fetch_buy_sell_totals(symbol, start_date, is_all):
    """Fetch buyer and seller totals from floorsheet, optionally filtered by symbol."""
    with connections['default'].cursor() as cursor:
        if is_all:
            cursor.execute("""
                SELECT buyer_id, SUM(transaction_quantity), SUM(transaction_quantity * transaction_rate)
                FROM daily_floorsheet WHERE transaction_date >= %s GROUP BY buyer_id
            """, [start_date])
        else:
            cursor.execute("""
                SELECT buyer_id, SUM(transaction_quantity), SUM(transaction_quantity * transaction_rate)
                FROM daily_floorsheet WHERE symbol = %s AND transaction_date >= %s GROUP BY buyer_id
            """, [symbol, start_date])
        buyers = {row[0]: {'buy_qty': row[1], 'buy_amt': row[2]} for row in cursor.fetchall()}

        if is_all:
            cursor.execute("""
                SELECT seller_id, SUM(transaction_quantity), SUM(transaction_quantity * transaction_rate)
                FROM daily_floorsheet WHERE transaction_date >= %s GROUP BY seller_id
            """, [start_date])
        else:
            cursor.execute("""
                SELECT seller_id, SUM(transaction_quantity), SUM(transaction_quantity * transaction_rate)
                FROM daily_floorsheet WHERE symbol = %s AND transaction_date >= %s GROUP BY seller_id
            """, [symbol, start_date])
        sellers = {row[0]: {'sell_qty': row[1], 'sell_amt': row[2]} for row in cursor.fetchall()}

    return buyers, sellers


def _compute_leader_stats(buyers, sellers):
    """Merge buyer/seller totals into per-broker net stats list."""
    all_brokers = set(buyers.keys()) | set(sellers.keys())
    leader_stats = []
    for b in all_brokers:
        b_data = buyers.get(b, {'buy_qty': 0, 'buy_amt': 0})
        s_data = sellers.get(b, {'sell_qty': 0, 'sell_amt': 0})
        net_qty = b_data['buy_qty'] - s_data['sell_qty']
        net_amt = b_data['buy_amt'] - s_data['sell_amt']
        buy_rate = round(b_data['buy_amt'] / b_data['buy_qty'], 2) if b_data['buy_qty'] > 0 else 0
        sell_rate = round(s_data['sell_amt'] / s_data['sell_qty'], 2) if s_data['sell_qty'] > 0 else 0
        leader_stats.append({
            'broker': b,
            'net_qty': net_qty,
            'net_amt': net_amt,
            'buy_qty': b_data['buy_qty'],
            'sell_qty': s_data['sell_qty'],
            'buy_rate': buy_rate,
            'sell_rate': sell_rate,
        })
    return leader_stats


def _split_buy_sell_leaders(leader_stats, is_all):
    """Return top 10 buy and sell leaders sorted by net_amt (all) or net_qty (symbol)."""
    sort_key = 'net_amt' if is_all else 'net_qty'
    buy_leaders = sorted(
        [l for l in leader_stats if l[sort_key] > 0], key=lambda x: x[sort_key], reverse=True
    )[:10]
    raw_sell_leaders = sorted(
        [l for l in leader_stats if l[sort_key] < 0], key=lambda x: x[sort_key]
    )[:10]
    sell_leaders = [{**l, 'net_qty': abs(l['net_qty']), 'net_amt': abs(l['net_amt'])} for l in raw_sell_leaders]
    return buy_leaders, sell_leaders


class AccumulationMixin(viewsets.ViewSet):
    """
    Mixin containing accumulation-related actions for CompanyViewSet.
    """

    @action(detail=False, methods=['get'])
    def accumulation(self, request):
        """
        Return accumulation flows.
        Uses Top 15 Broker Concentration (Holders) to determine Net Accumulation (Smart Money flow).
        Optional: ?symbol=NABIL to get a single symbol's data.
        """
        time_range = request.query_params.get('range', '1D')
        sector = request.query_params.get('sector', 'All')
        symbol = request.query_params.get('symbol', '').strip().upper() or None
        return Response(accumulation_flows(range_key=time_range, sector=sector, symbol=symbol))

    @action(detail=False, methods=['get'])
    def aggressive(self, request):
        """
        Identify aggressive institutional activity relative to 20-Day average volume.
        """
        time_range = request.query_params.get('range', '1W')
        sector = request.query_params.get('sector', 'All')
        days = RANGE_MAP.get(time_range, 7)

        ck = _cache_key('aggressive', time_range, sector)
        cached = cache.get(ck)
        if cached is not None:
            return Response(cached)

        results = _run_aggressive_query(days, sector)
        data = _format_aggressive_results(results)
        cache.set(ck, data, 300)
        return Response(data)

    @action(detail=False, methods=['get'])
    def broker_trends(self, request):
        symbol_filter = request.query_params.get('symbol', '').strip().upper() or None
        time_range = request.query_params.get('range', 'ALL')
        return Response(_broker_trends_svc(symbol=symbol_filter, range_key=time_range))

    @action(detail=False, methods=['get'])
    def below_cost(self, request):
        """
        Return broker positions where LTP is below their WAC (cost basis).
        """
        time_range = request.query_params.get('range', 'ALL')
        sector = request.query_params.get('sector', 'All')
        return Response(_below_cost_svc(range_key=time_range, sector=sector))

    @action(detail=False, methods=['get'])
    def broker_favorites(self, request):
        broker_str = request.query_params.get('broker')
        if not broker_str:
            return Response({'error': 'broker ID is required'}, status=400)
        try:
            broker = int(broker_str)
        except ValueError:
            return Response({'error': 'broker ID must be an integer'}, status=400)

        time_range = request.query_params.get('period') or request.query_params.get('range', '3M')
        return Response(_broker_favorites_svc(broker_id=broker, range_key=time_range))

    @action(detail=False, methods=['get'])
    def brokers_graph(self, request):
        symbol = request.query_params.get('symbol')
        time_range = request.query_params.get('range', '1Y')
        if not symbol:
            return Response({'error': 'Symbol is required'}, status=400)

        is_all = symbol == 'All'
        today = _fetch_latest_price_date()
        start_date = today - timedelta(days=RANGE_MAP.get(time_range, 365))

        sorted_data, top_brokers = self._fetch_symbol_broker_history(symbol, is_all, start_date)
        if sorted_data is None:
            return Response({
                'data': [], 'history': [], 'brokers': [],
                'top_brokers': [], 'buy_leaders': [], 'sell_leaders': []
            })

        buyers, sellers = _fetch_buy_sell_totals(symbol, start_date, is_all)
        leader_stats = _compute_leader_stats(buyers, sellers)
        buy_leaders, sell_leaders = _split_buy_sell_leaders(leader_stats, is_all)

        return Response({
            'data': sorted_data,
            'history': sorted_data,
            'brokers': top_brokers,
            'top_brokers': top_brokers,
            'buy_leaders': buy_leaders,
            'sell_leaders': sell_leaders,
        })

    def _fetch_symbol_broker_history(self, symbol, is_all, start_date):
        """Return (sorted_data, top_brokers) for broker history chart, or (None, None) if no data."""
        if is_all:
            return [], []

        top_brokers = _fetch_top_brokers_for_symbol(symbol)
        if not top_brokers:
            return None, None

        rows = _fetch_broker_history(symbol, top_brokers, start_date)
        sorted_data = _build_broker_history_series(rows)
        return sorted_data, top_brokers

    @action(detail=False, methods=['get'])
    def accumulation_brokers(self, request):
        """Return list of active broker IDs for accumulation filtering."""
        cache_key = 'active_broker_ids'
        broker_ids = cache.get(cache_key)

        if broker_ids is None:
            with connections['default'].cursor() as cursor:
                cursor.execute("SELECT DISTINCT buyer_id FROM daily_floorsheet ORDER BY buyer_id")
                broker_ids = [str(row[0]) for row in cursor.fetchall()]
            cache.set(cache_key, broker_ids, 86400)

        return Response(broker_ids)
