"""Broker Research analytics service layer.

Extracted behavior-identical from AccumulationMixin so the chat tools and the
REST API share one implementation (and one cache). FloorsheetViewSet and
broker.py extractions to follow. Functions return the exact structures the
views serialize.
"""
import hashlib
from datetime import timedelta
from django.db import connections
from django.core.cache import cache

from ..models.market import DailyStockPrice

RANGE_MAP = {
    '1D': 1, '1W': 7, '2W': 14, '1M': 30, '3M': 90, '6M': 180, '1Y': 365, '2Y': 730, 'ALL': 36500
}


def _cache_key(*parts):
    raw = ':'.join(str(p) for p in parts)
    return 'acc:' + hashlib.md5(raw.encode()).hexdigest()


def _exec(query, params=None):
    with connections['default'].cursor() as cursor:
        cursor.execute(query, params or [])
        columns = [col[0] for col in cursor.description]
        return [dict(zip(columns, row)) for row in cursor.fetchall()]


# ─── Proper 14-period Wilder RSI CTE (reusable) ──────────────────────────
RSI_CTE = """
price_changes AS (
    SELECT
        symbol, transaction_date, close,
        close - LAG(close) OVER (PARTITION BY symbol ORDER BY transaction_date) as change,
        ROW_NUMBER() OVER (PARTITION BY symbol ORDER BY transaction_date DESC) as rn
    FROM daily_stock_price
    WHERE transaction_date > (SELECT max_date - INTERVAL '60 days' FROM ref_date)
),
rsi_calc AS (
    SELECT
        symbol,
        ROUND(CASE
            WHEN SUM(CASE WHEN change < 0 THEN ABS(change) ELSE 0 END) = 0 THEN 100.0
            ELSE 100.0 - (100.0 / (1.0 + (
                (SUM(CASE WHEN change > 0 THEN change ELSE 0 END) FILTER (WHERE rn <= 14)) /
                NULLIF(SUM(CASE WHEN change < 0 THEN ABS(change) ELSE 0 END) FILTER (WHERE rn <= 14), 0)
            )))
        END::numeric, 2) as rsi
    FROM price_changes
    WHERE change IS NOT NULL AND rn <= 14
    GROUP BY symbol
)
"""


def accumulation_flows(range_key="1D", sector="All", symbol=None):
    """
    Return accumulation flows.
    Uses Top 15 Broker Concentration (Holders) to determine Net Accumulation (Smart Money flow).
    Optional: symbol to get a single symbol's data.
    """
    time_range = range_key
    symbol = (symbol or '').strip().upper()

    days = RANGE_MAP.get(time_range, 1) if time_range != 'ALL' else 36500

    # Check cache (5-min TTL)
    ck = _cache_key('accumulation', time_range, sector, symbol)
    cached = cache.get(ck)
    if cached is not None:
        return cached

    # Build WHERE clauses with parameterised values
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

    where_clause = ' AND '.join(where_parts)

    query = f"""
    WITH ref_date AS (
        SELECT transaction_date as max_date
        FROM daily_cumulative_accumulation
        GROUP BY transaction_date
        HAVING COUNT(*) > 100
        ORDER BY transaction_date DESC
        LIMIT 1
    ),
    target_date AS (
        SELECT (max_date - INTERVAL '{days} days') as start_date FROM ref_date
    ),
    latest_positions AS (
        SELECT
            symbol, entity_id, cumulative_net,
            ROW_NUMBER() OVER (PARTITION BY symbol ORDER BY cumulative_net DESC) as rank
        FROM daily_cumulative_accumulation, ref_date
        WHERE transaction_date = ref_date.max_date
        AND cumulative_net > 0
    ),
    past_positions AS (
        SELECT DISTINCT ON (dca.symbol, dca.entity_id)
            dca.symbol, dca.entity_id, dca.cumulative_net
        FROM daily_cumulative_accumulation dca, target_date
        WHERE dca.transaction_date <= target_date.start_date
        ORDER BY dca.symbol, dca.entity_id, dca.transaction_date DESC
    ),
    smart_money AS (
        SELECT symbol, entity_id as broker
        FROM latest_positions
        WHERE rank <= 15
    ),
    broker_net AS (
        SELECT
            l.symbol, l.entity_id as broker,
            (l.cumulative_net - COALESCE(p.cumulative_net, 0)) as net_flow,
            0 as total_buy,
            0 as total_sell
        FROM latest_positions l
        LEFT JOIN past_positions p ON l.symbol = p.symbol AND l.entity_id = p.entity_id
        WHERE (l.cumulative_net - COALESCE(p.cumulative_net, 0)) != 0
    ),
    total_volume AS (
        SELECT symbol, SUM(volume) as total_vol
        FROM daily_stock_price, target_date, ref_date
        WHERE transaction_date > target_date.start_date AND transaction_date <= ref_date.max_date
        GROUP BY symbol
    ),
    symbol_agg AS (
        SELECT
            bn.symbol,
            SUM(CASE WHEN sm.broker IS NOT NULL THEN bn.net_flow ELSE 0 END) as smart_net_qty,
            COALESCE(MAX(tv.total_vol), 0) as total_vol,
            ARRAY_AGG(bn.broker ORDER BY bn.net_flow DESC) FILTER (WHERE bn.net_flow > 0) as top_buyers,
            ARRAY_AGG(bn.broker ORDER BY bn.net_flow ASC) FILTER (WHERE bn.net_flow < 0) as top_sellers
        FROM broker_net bn
        LEFT JOIN smart_money sm ON bn.symbol = sm.symbol AND CAST(bn.broker AS VARCHAR) = sm.broker
        LEFT JOIN total_volume tv ON bn.symbol = tv.symbol
        GROUP BY bn.symbol
    ),
    {RSI_CTE},
    roc_calc AS (
        SELECT DISTINCT ON (symbol)
            symbol, close as ref_close
        FROM daily_stock_price, ref_date
        WHERE transaction_date <= ref_date.max_date - INTERVAL '14 days'
        ORDER BY symbol, transaction_date DESC
    )
    SELECT
        sa.symbol, c."companyName" as name, c."sectorName" as sector,
        CASE WHEN sa.smart_net_qty > 0 THEN sa.smart_net_qty ELSE 0 END as buy_qty,
        CASE WHEN sa.smart_net_qty < 0 THEN ABS(sa.smart_net_qty) ELSE 0 END as sell_qty,
        sa.smart_net_qty as net_qty,
        CASE WHEN sa.total_vol > 0
           THEN ROUND((ABS(sa.smart_net_qty)::NUMERIC / sa.total_vol) * 100, 2)
           ELSE 0 END as accumulation_ratio,
        COALESCE(sa.top_buyers[1:3], ARRAY[]::text[]) as top_buyers,
        COALESCE(sa.top_sellers[1:3], ARRAY[]::text[]) as top_sellers,
        COALESCE(dsp.close, 0) as close,
        COALESCE(rc.rsi, 0) as rsi,
        ROUND((dsp.close - roc.ref_close) / NULLIF(roc.ref_close, 0) * 100, 2) as roc
    FROM symbol_agg sa
    INNER JOIN companies c ON sa.symbol = c.symbol
    LEFT JOIN (
        SELECT DISTINCT ON (symbol) symbol, close
        FROM daily_stock_price
        ORDER BY symbol, transaction_date DESC
    ) dsp ON sa.symbol = dsp.symbol
    LEFT JOIN rsi_calc rc ON sa.symbol = rc.symbol
    LEFT JOIN roc_calc roc ON sa.symbol = roc.symbol
    WHERE {where_clause}
    ORDER BY net_qty DESC;
    """

    results = _exec(query, params)
    cache.set(ck, results, 300)  # 5-min cache
    return results


def broker_trends(symbol=None, range_key="ALL"):
    """Return broker trend analysis across symbols."""
    symbol_filter = (symbol or '').strip().upper()
    time_range = range_key
    days = RANGE_MAP.get(time_range, 36500)

    # Parameterised symbol filter
    if symbol_filter:
        symbol_sql_floorsheet = "AND symbol = %s"
        symbol_sql_accum = "WHERE symbol = %s"
        symbol_sql_where = "AND la.symbol = %s"
        cumnet_where = ""
        limit_clause = ""
    else:
        symbol_sql_floorsheet = ""
        symbol_sql_accum = ""
        symbol_sql_where = ""
        cumnet_where = "AND la.cumulative_net > 100000"
        limit_clause = "LIMIT 300"

    query = f"""
    WITH valid_dates AS (
        SELECT transaction_date
        FROM daily_floorsheet
        GROUP BY transaction_date
        HAVING COUNT(*) > 100
        ORDER BY transaction_date DESC
        LIMIT 51
    ),
    date_milestones AS (
        SELECT
            (SELECT transaction_date FROM valid_dates LIMIT 1) as latest_date,
            (SELECT transaction_date FROM valid_dates OFFSET 5 LIMIT 1) as date_5d,
            (SELECT transaction_date FROM valid_dates OFFSET 10 LIMIT 1) as date_10d,
            (SELECT transaction_date FROM valid_dates OFFSET 20 LIMIT 1) as date_20d,
            (SELECT transaction_date FROM valid_dates OFFSET 50 LIMIT 1) as date_50d,
            (SELECT transaction_date FROM valid_dates LIMIT 1) - INTERVAL '{days} days' as range_start
    ),
    floorsheet_net AS (
        SELECT symbol, buyer_id as broker, transaction_quantity as qty, transaction_date
        FROM daily_floorsheet
        WHERE transaction_date > (SELECT LEAST(date_50d, range_start) FROM date_milestones)
        {symbol_sql_floorsheet}
        UNION ALL
        SELECT symbol, seller_id as broker, -transaction_quantity as qty, transaction_date
        FROM daily_floorsheet
        WHERE transaction_date > (SELECT LEAST(date_50d, range_start) FROM date_milestones)
        {symbol_sql_floorsheet}
    ),
    trend_stats AS (
        SELECT
            fn.symbol, fn.broker,
            SUM(CASE WHEN fn.transaction_date > dm.date_5d THEN fn.qty ELSE 0 END) as net_5d,
            SUM(CASE WHEN fn.transaction_date > dm.date_10d THEN fn.qty ELSE 0 END) as net_10d,
            SUM(CASE WHEN fn.transaction_date > dm.date_20d THEN fn.qty ELSE 0 END) as net_20d,
            SUM(CASE WHEN fn.transaction_date > dm.date_50d THEN fn.qty ELSE 0 END) as net_50d,
            SUM(CASE WHEN fn.transaction_date > dm.range_start THEN fn.qty ELSE 0 END) as net_range
        FROM floorsheet_net fn, date_milestones dm
        GROUP BY fn.symbol, fn.broker
    ),
    latest_accumulation AS (
        SELECT DISTINCT ON (symbol, entity_id)
            symbol, entity_id, cumulative_net, cumulative_buy, cumulative_buy_amount
        FROM daily_cumulative_accumulation
        {symbol_sql_accum}
        ORDER BY symbol, entity_id, transaction_date DESC
    )
    SELECT
        la.symbol, la.entity_id as broker, la.cumulative_net,
        COALESCE(ts.net_range, 0) as range_net,
        ROUND(la.cumulative_buy_amount / NULLIF(la.cumulative_buy, 0), 2) as wac,
        CASE WHEN COALESCE(ts.net_5d, 0) > 0 THEN 'Increasing' WHEN COALESCE(ts.net_5d, 0) < 0 THEN 'Decreasing' ELSE 'Stable' END AS trend_5d,
        ROUND(ABS(COALESCE(ts.net_5d, 0)) / NULLIF(ABS(la.cumulative_net), 1) * 100, 2) AS change_5d,
        CASE WHEN COALESCE(ts.net_10d, 0) > 0 THEN 'Increasing' WHEN COALESCE(ts.net_10d, 0) < 0 THEN 'Decreasing' ELSE 'Stable' END AS trend_10d,
        ROUND(ABS(COALESCE(ts.net_10d, 0)) / NULLIF(ABS(la.cumulative_net), 1) * 100, 2) AS change_10d,
        CASE WHEN COALESCE(ts.net_20d, 0) > 0 THEN 'Increasing' WHEN COALESCE(ts.net_20d, 0) < 0 THEN 'Decreasing' ELSE 'Stable' END AS trend_20d,
        ROUND(ABS(COALESCE(ts.net_20d, 0)) / NULLIF(ABS(la.cumulative_net), 1) * 100, 2) AS change_20d,
        CASE WHEN COALESCE(ts.net_50d, 0) > 0 THEN 'Increasing' WHEN COALESCE(ts.net_50d, 0) < 0 THEN 'Decreasing' ELSE 'Stable' END AS trend_50d,
        ROUND(ABS(COALESCE(ts.net_50d, 0)) / NULLIF(ABS(la.cumulative_net), 1) * 100, 2) AS change_50d,
        dsp.close as ltp
    FROM latest_accumulation la
    LEFT JOIN trend_stats ts ON la.symbol = ts.symbol AND la.entity_id = CAST(ts.broker AS VARCHAR)
    INNER JOIN companies c ON la.symbol = c.symbol
    LEFT JOIN (
        SELECT DISTINCT ON (symbol) symbol, close
        FROM daily_stock_price ORDER BY symbol, transaction_date DESC
    ) dsp ON la.symbol = dsp.symbol
    WHERE c."instrumentType" NOT IN ('Mutual Funds', 'Non-Convertible Debentures')
    AND c.status = 'A'
    AND c."sectorName" != 'Unknown' AND c."sectorName" IS NOT NULL
    {symbol_sql_where}
    {cumnet_where}
    ORDER BY la.cumulative_net DESC
    {limit_clause};
    """

    # Build params: symbol_filter is used up to 3 times (floorsheet x2, accum, where)
    all_params = []
    if symbol_filter:
        all_params = [symbol_filter, symbol_filter, symbol_filter, symbol_filter]

    results = _exec(query, all_params)
    return results


def below_cost(range_key="ALL", sector="All"):
    """
    Return broker positions where LTP is below their WAC (cost basis).
    """
    time_range = range_key
    days = RANGE_MAP.get(time_range, 36500)

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
    where_clause = ' AND '.join(where_parts)

    query = f"""
    WITH valid_dates AS (
        SELECT transaction_date
        FROM daily_floorsheet
        GROUP BY transaction_date
        HAVING COUNT(*) > 100
        ORDER BY transaction_date DESC
        LIMIT 51
    ),
    date_milestones AS (
        SELECT
            (SELECT transaction_date FROM valid_dates LIMIT 1) as latest_date,
            (SELECT transaction_date FROM valid_dates OFFSET 5 LIMIT 1) as date_5d,
            (SELECT transaction_date FROM valid_dates OFFSET 10 LIMIT 1) as date_10d,
            (SELECT transaction_date FROM valid_dates OFFSET 15 LIMIT 1) as date_15d,
            (SELECT transaction_date FROM valid_dates OFFSET 20 LIMIT 1) as date_20d,
            (SELECT transaction_date FROM valid_dates OFFSET 50 LIMIT 1) as date_50d,
            (SELECT transaction_date FROM valid_dates LIMIT 1) - INTERVAL '{days} days' as range_start
    ),
    ref_date AS (
        SELECT (SELECT transaction_date FROM valid_dates LIMIT 1) as max_date
    ),
    floorsheet_net AS (
        SELECT symbol, buyer_id as broker, transaction_quantity as qty, transaction_date
        FROM daily_floorsheet
        WHERE transaction_date > (SELECT LEAST(date_50d, range_start) FROM date_milestones)
        UNION ALL
        SELECT symbol, seller_id as broker, -transaction_quantity as qty, transaction_date
        FROM daily_floorsheet
        WHERE transaction_date > (SELECT LEAST(date_50d, range_start) FROM date_milestones)
    ),
    trend_stats AS (
        SELECT
            fn.symbol, fn.broker,
            SUM(CASE WHEN fn.transaction_date > dm.date_5d THEN fn.qty ELSE 0 END) as net_5d,
            SUM(CASE WHEN fn.transaction_date > dm.date_10d THEN fn.qty ELSE 0 END) as net_10d,
            SUM(CASE WHEN fn.transaction_date > dm.date_15d THEN fn.qty ELSE 0 END) as net_15d,
            SUM(CASE WHEN fn.transaction_date > dm.date_20d THEN fn.qty ELSE 0 END) as net_20d,
            SUM(CASE WHEN fn.transaction_date > dm.date_50d THEN fn.qty ELSE 0 END) as net_50d,
            SUM(CASE WHEN fn.transaction_date > dm.range_start THEN fn.qty ELSE 0 END) as net_range
        FROM floorsheet_net fn, date_milestones dm
        GROUP BY fn.symbol, fn.broker
    ),
    latest_accumulation AS (
        SELECT DISTINCT ON (symbol, entity_id)
            symbol, entity_id, cumulative_net, cumulative_buy, cumulative_buy_amount
        FROM daily_cumulative_accumulation
        ORDER BY symbol, entity_id, transaction_date DESC
    ),
    wac_data AS (
        SELECT
            la.symbol, la.entity_id as broker,
            la.cumulative_net,
            ROUND(la.cumulative_buy_amount / NULLIF(la.cumulative_buy, 0), 2) as wac
        FROM latest_accumulation la
        WHERE la.cumulative_net > 10000
    ),
    {RSI_CTE}
    SELECT
        wd.symbol, wd.broker, wd.cumulative_net, wd.wac,
        COALESCE(ts.net_range, 0) as range_net,
        dsp.close as ltp,
        ROUND((dsp.close - wd.wac) / NULLIF(wd.wac, 0) * 100, 2) as roc,
        c."companyName" as name, c."sectorName" as sector,
        COALESCE(rc.rsi, 0) as rsi,
        CASE WHEN COALESCE(ts.net_5d, 0) > 0 THEN 'Increasing' WHEN COALESCE(ts.net_5d, 0) < 0 THEN 'Decreasing' ELSE 'Stable' END AS trend_5d,
        ROUND(ABS(COALESCE(ts.net_5d, 0)) / NULLIF(ABS(wd.cumulative_net), 1) * 100, 2) AS change_5d,
        CASE WHEN COALESCE(ts.net_10d, 0) > 0 THEN 'Increasing' WHEN COALESCE(ts.net_10d, 0) < 0 THEN 'Decreasing' ELSE 'Stable' END AS trend_10d,
        ROUND(ABS(COALESCE(ts.net_10d, 0)) / NULLIF(ABS(wd.cumulative_net), 1) * 100, 2) AS change_10d,
        CASE WHEN COALESCE(ts.net_15d, 0) > 0 THEN 'Increasing' WHEN COALESCE(ts.net_15d, 0) < 0 THEN 'Decreasing' ELSE 'Stable' END AS trend_15d,
        ROUND(ABS(COALESCE(ts.net_15d, 0)) / NULLIF(ABS(wd.cumulative_net), 1) * 100, 2) AS change_15d,
        CASE WHEN COALESCE(ts.net_20d, 0) > 0 THEN 'Increasing' WHEN COALESCE(ts.net_20d, 0) < 0 THEN 'Decreasing' ELSE 'Stable' END AS trend_20d,
        ROUND(ABS(COALESCE(ts.net_20d, 0)) / NULLIF(ABS(wd.cumulative_net), 1) * 100, 2) AS change_20d,
        CASE WHEN COALESCE(ts.net_50d, 0) > 0 THEN 'Increasing' WHEN COALESCE(ts.net_50d, 0) < 0 THEN 'Decreasing' ELSE 'Stable' END AS trend_50d,
        ROUND(ABS(COALESCE(ts.net_50d, 0)) / NULLIF(ABS(wd.cumulative_net), 1) * 100, 2) AS change_50d
    FROM wac_data wd
    LEFT JOIN trend_stats ts ON wd.symbol = ts.symbol AND wd.broker = CAST(ts.broker AS VARCHAR)
    LEFT JOIN rsi_calc rc ON wd.symbol = rc.symbol
    INNER JOIN companies c ON wd.symbol = c.symbol
    LEFT JOIN (
        SELECT DISTINCT ON (symbol) symbol, close
        FROM daily_stock_price ORDER BY symbol, transaction_date DESC
    ) dsp ON wd.symbol = dsp.symbol
    WHERE dsp.close < wd.wac
    AND wd.wac > 0
    AND {where_clause}
    ORDER BY roc ASC
    LIMIT 500;
    """

    results = _exec(query, params)
    return results


def broker_favorites(broker_id, range_key="3M"):
    """Return symbols where a specific broker has been active in the given period."""
    broker = int(broker_id)
    time_range = range_key
    days = RANGE_MAP.get(time_range, 90)

    query = f"""
    WITH ref_date AS (
        SELECT transaction_date as current_date
        FROM daily_floorsheet
        GROUP BY transaction_date
        HAVING COUNT(*) > 100
        ORDER BY transaction_date DESC
        LIMIT 1
    ),
    target_date AS (
         SELECT (current_date - INTERVAL '{days} days') as start_date FROM ref_date
    ),
    broker_activity AS (
        SELECT
            df.symbol,
            SUM(CASE WHEN df.buyer_id = %s THEN df.transaction_quantity ELSE 0 END) as buy_qty,
            SUM(CASE WHEN df.seller_id = %s THEN df.transaction_quantity ELSE 0 END) as sell_qty,
            SUM(CASE
                WHEN df.buyer_id = %s THEN df.transaction_quantity
                WHEN df.seller_id = %s THEN -df.transaction_quantity
                ELSE 0
            END) as qty_accumulated,
            SUM(CASE
                WHEN df.buyer_id = %s THEN df.transaction_amount
                WHEN df.seller_id = %s THEN -df.transaction_amount
                ELSE 0
            END) as net_amount
        FROM daily_floorsheet df, target_date td
        WHERE df.transaction_date > td.start_date
        AND (df.buyer_id = %s OR df.seller_id = %s)
        GROUP BY df.symbol
        HAVING SUM(CASE
                WHEN df.buyer_id = %s THEN df.transaction_quantity
                WHEN df.seller_id = %s THEN -df.transaction_quantity
                ELSE 0
            END) != 0
    )
    SELECT
        ba.symbol,
        c."companyName" as name,
        COALESCE(ca.cumulative_net, 0) as current_net,
        CASE WHEN ca.cumulative_buy > 0 THEN ROUND(ca.cumulative_buy_amount / ca.cumulative_buy, 2) ELSE 0 END as wac,
        ba.qty_accumulated,
        ba.buy_qty,
        ba.sell_qty,
        ba.net_amount
    FROM broker_activity ba
    INNER JOIN companies c ON ba.symbol = c.symbol
    LEFT JOIN LATERAL (
        SELECT cumulative_net, cumulative_buy, cumulative_buy_amount
        FROM daily_cumulative_accumulation
        WHERE symbol = ba.symbol AND entity_id = %s
        ORDER BY transaction_date DESC LIMIT 1
    ) ca ON true
    WHERE c."instrumentType" NOT IN ('Mutual Funds', 'Non-Convertible Debentures')
    AND c.status = 'A'
    AND c."sectorName" != 'Unknown' AND c."sectorName" IS NOT NULL
    ORDER BY ba.qty_accumulated DESC;
    """

    # 10 broker params bind against integer buyer_id/seller_id columns;
    # the 11th binds against varchar entity_id in the LATERAL join — must be str.
    broker_params = [broker] * 10 + [str(broker)]

    with connections['default'].cursor() as cursor:
        cursor.execute(query, broker_params)
        rows = cursor.fetchall()

    base_results = []
    if rows:
        columns = ['symbol', 'name', 'current_net', 'wac', 'qty_accumulated', 'buy_qty', 'sell_qty', 'net_amount']
        base_results = [dict(zip(columns, row)) for row in rows]

        symbols = [r['symbol'] for r in base_results]
        latest_price_obj = DailyStockPrice.objects.filter(ticker__in=symbols).order_by('-date').first()
        if latest_price_obj:
            latest_date = latest_price_obj.date
            roc_period_date = latest_date - timedelta(days=20)

            prices = DailyStockPrice.objects.filter(
                ticker__in=symbols,
                date__gte=roc_period_date
            ).values('ticker', 'date', 'close').order_by('ticker', 'date')

            price_map = {}
            for p in prices:
                if p['ticker'] not in price_map:
                    price_map[p['ticker']] = []
                price_map[p['ticker']].append(p)

            for item in base_results:
                sym = item['symbol']
                item_prices = price_map.get(sym, [])
                ltp = 0
                roc = 0

                if item_prices:
                    current = item_prices[-1]
                    ltp = current['close']

                    if len(item_prices) > 1:
                        lookback = 14
                        prev_idx = max(0, len(item_prices) - 1 - lookback)
                        prev = item_prices[prev_idx]
                        if prev['close']:
                            roc = ((ltp - prev['close']) / prev['close']) * 100

                        # Proper 14-period RSI
                        changes = [
                            float(item_prices[i]['close']) - float(item_prices[i-1]['close'])
                            for i in range(1, len(item_prices))
                        ]
                        recent = changes[-14:] if len(changes) >= 14 else changes
                        avg_up = sum(c for c in recent if c > 0) / 14
                        avg_down = sum(abs(c) for c in recent if c < 0) / 14
                        if avg_down > 0:
                            rs = avg_up / avg_down
                            item['rsi'] = round(100 - (100 / (1 + rs)), 2)
                        else:
                            item['rsi'] = 100.0 if avg_up > 0 else 50.0

                item['ltp'] = ltp
                item['roc'] = round(roc, 2)
        else:
            for r in base_results:
                r['ltp'] = 0
                r['roc'] = 0

    return base_results
