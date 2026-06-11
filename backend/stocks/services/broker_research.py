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
"""
import hashlib
from collections import defaultdict
from datetime import timedelta
from django.db import connections
from django.core.cache import cache
from django.db.models import Sum, Count, Avg, Q, Max
from django.utils import timezone

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


# ─────────────────────────────────────────────────────────────────────────────
# FloorsheetViewSet extractions
# ─────────────────────────────────────────────────────────────────────────────

def smart_money(range_key="1D"):
    """
    Identify top accumulating 'smart brokers' and their active whale signals.
    Extracted verbatim from FloorsheetViewSet.smart_money.
    """
    from ..models.market import DailyFloorsheet, Company

    # Local to this feature — '1D': 0 means today-only; intentionally differs from RANGE_MAP
    range_days = {
        '1D': 0, '2D': 1, '3D': 2, '1W': 6,
        '1M': 29, '3M': 89, '6M': 179,
    }
    days = range_days.get(range_key, 0)

    allowed_symbols = Company.objects.values_list('symbol', flat=True)
    latest_price = DailyStockPrice.objects.order_by('-date').values_list('date', flat=True).first()
    today = latest_price if latest_price else timezone.now().date()
    start_date = today - timedelta(days=days)

    # 1. Leaderboard: Top 10 buying brokers in the selected range
    top_brokers = DailyFloorsheet.objects.filter(
        transaction_date__gte=start_date,
        symbol__in=allowed_symbols
    ).values('buyer_id').annotate(
        total_buy_vol=Sum('transaction_quantity')
    ).order_by('-total_buy_vol')[:10]

    leaderboard = []
    smart_broker_ids = []
    for idx, pb in enumerate(top_brokers):
        rank = 'S' if idx == 0 else 'A' if idx < 3 else 'B' if idx < 6 else 'C'
        score = int((pb['total_buy_vol'] or 0) / 1000)
        leaderboard.append({
            "broker_id": pb['buyer_id'],
            "score": score,
            "rank": rank
        })
        smart_broker_ids.append(pb['buyer_id'])

    # 2. Active Whale Signals: Massive accumulations by these brokers in the selected range
    # Scale minimum qty threshold with the range (shorter ranges = lower threshold)
    min_qty = max(500, int(5000 * max(days, 1) / 30))
    signals_qs = DailyFloorsheet.objects.filter(
        transaction_date__gte=start_date,
        buyer_id__in=smart_broker_ids,
        symbol__in=allowed_symbols
    ).values('buyer_id', 'symbol').annotate(
        qty=Sum('transaction_quantity'),
        amount=Sum('transaction_amount')
    ).filter(qty__gte=min_qty).order_by('-amount')[:20]

    # Fetch LTP for these symbols
    symbols = [s['symbol'] for s in signals_qs]
    prices_qs = DailyStockPrice.objects.filter(ticker__in=symbols).order_by('ticker', '-date').distinct('ticker')
    price_map = {p.ticker: float(p.close) for p in prices_qs if p.close is not None}

    signals = []
    for sq in signals_qs:
        avg_buy_price = float(sq['amount'] / sq['qty']) if sq['qty'] > 0 else 0
        signals.append({
            "broker_id": sq['buyer_id'],
            "symbol": sq['symbol'],
            "avg_buy_price": round(avg_buy_price, 2),
            "ltp": price_map.get(sq['symbol'], 0),
            "qty": sq['qty'],
            "amount": float(sq['amount']),
            "date": str(start_date)
        })

    # 3. KPI aggregates
    kpi = {
        "total_whale_volume": sum(s['qty'] for s in signals),
        "total_whale_amount": sum(s['amount'] for s in signals),
        "active_symbols": len(set(s['symbol'] for s in signals)),
        "active_brokers": len(smart_broker_ids),
    }

    # 4. Top symbols by smart money net volume (buy − sell across all smart brokers)
    buy_side = DailyFloorsheet.objects.filter(
        transaction_date__gte=start_date,
        buyer_id__in=smart_broker_ids,
        symbol__in=allowed_symbols
    ).values('symbol').annotate(
        buy_qty=Sum('transaction_quantity'),
        buy_amount=Sum('transaction_amount'),
        buy_broker_count=Count('buyer_id', distinct=True),
    )
    sell_side = DailyFloorsheet.objects.filter(
        transaction_date__gte=start_date,
        seller_id__in=smart_broker_ids,
        symbol__in=allowed_symbols
    ).values('symbol').annotate(
        sell_qty=Sum('transaction_quantity'),
        sell_amount=Sum('transaction_amount'),
    )

    buy_map  = {r['symbol']: r for r in buy_side}
    sell_map = {r['symbol']: r for r in sell_side}

    all_symbols = set(buy_map) | set(sell_map)
    symbol_flows_raw = []
    for sym in all_symbols:
        b = buy_map.get(sym, {})
        s = sell_map.get(sym, {})
        buy_qty    = b.get('buy_qty', 0) or 0
        sell_qty   = s.get('sell_qty', 0) or 0
        net_qty    = buy_qty - sell_qty
        buy_amount = float(b.get('buy_amount') or 0)
        sell_amount= float(s.get('sell_amount') or 0)
        symbol_flows_raw.append({
            'symbol':        sym,
            'smart_buy_qty': buy_qty,
            'smart_sell_qty':sell_qty,
            'net_qty':       net_qty,
            'buy_amount':    buy_amount,
            'sell_amount':   sell_amount,
            'net_amount':    buy_amount - sell_amount,
            'broker_count':  b.get('buy_broker_count', 0) or 0,
        })

    # Sort by net accumulation (descending); exclude net sellers
    symbol_flows = sorted(
        [sf for sf in symbol_flows_raw if sf['net_qty'] > 0],
        key=lambda x: x['net_qty'], reverse=True
    )[:20]

    return {
        "leaderboard": leaderboard,
        "signals": signals,
        "kpi": kpi,
        "symbol_flows": symbol_flows,
    }


def focus_ranking(range_key="1W"):
    """
    For each trading day in the range, find the top-10 brokers by buy volume,
    then rank the top-5 stocks those brokers are collectively buying (Net Volume).
    Extracted verbatim from FloorsheetViewSet.broker_focus_ranking.
    """
    from ..models.market import DailyBuyerFloorsheet, DailySellerFloorsheet

    # Local to this feature — uses trading-session counts, not calendar days; intentionally differs from RANGE_MAP
    range_days = {'1W': 6, '2W': 13, '1M': 29}
    days = range_days.get(range_key, 6)

    # 1. Reference Day (Latest Trading Session)
    latest_date_data = DailyBuyerFloorsheet.objects.aggregate(Max('transaction_date'))
    latest_date = latest_date_data['transaction_date__max']

    if not latest_date:
        latest_price_obj = DailyStockPrice.objects.order_by('-date').first()
        latest_date = latest_price_obj.date if latest_price_obj else timezone.now().date()

    start_date = latest_date - timedelta(days=days)

    # 2. Fetch Aggregated Data
    raw_buys = DailyBuyerFloorsheet.objects.filter(transaction_date__gte=start_date).values(
        'transaction_date', 'buyer_id', 'symbol', 'buy_volume', 'average_weighted_price'
    )
    raw_sells = DailySellerFloorsheet.objects.filter(transaction_date__gte=start_date).values(
        'transaction_date', 'seller_id', 'symbol', 'sell_volume'
    )

    broker_data = defaultdict(lambda: defaultdict(lambda: defaultdict(lambda: {'buy_vol': 0, 'sell_vol': 0, 'buy_amount': 0})))

    for row in raw_buys:
        d, b, s = row['transaction_date'], row['buyer_id'], row['symbol']
        vol = float(row['buy_volume'] or 0)
        avg_price = float(row['average_weighted_price'] or 0)
        broker_data[d][b][s]['buy_vol'] += vol
        broker_data[d][b][s]['buy_amount'] += (vol * avg_price)

    for row in raw_sells:
        d, b, s = row['transaction_date'], row['seller_id'], row['symbol']
        broker_data[d][b][s]['sell_vol'] += float(row['sell_volume'] or 0)

    dates = sorted(broker_data.keys())
    daily_rankings = {}
    daily_top_brokers = {}

    for date in dates:
        # Rank brokers by total BUY volume that day
        broker_buys = {b: sum(stats['buy_vol'] for stats in stocks.values()) for b, stocks in broker_data[date].items()}
        top10_brokers = sorted(broker_buys, key=lambda b: -broker_buys[b])[:10]

        # Aggregate Focus Group's activities
        stock_net_agg = defaultdict(int)
        stock_buy_agg = defaultdict(int)
        stock_amount_agg = defaultdict(float)
        stock_top_sellers = defaultdict(list)

        for broker in top10_brokers:
            for sym, stats in broker_data[date][broker].items():
                stock_net_agg[sym] += (stats['buy_vol'] - stats['sell_vol'])
                stock_buy_agg[sym] += stats['buy_vol']
                stock_amount_agg[sym] += stats['buy_amount']

        # Rank stocks by Focus Group's Net Volume
        top10_net_stocks = sorted(stock_net_agg.items(), key=lambda x: -x[1])[:10]

        # Top 5 Distribution Agents (Market-wide top sellers)
        for sym, _ in top10_net_stocks:
            sym_sellers = []
            for b, stocks in broker_data[date].items():
                if sym in stocks and stocks[sym]['sell_vol'] > 0:
                    sym_sellers.append((b, stocks[sym]['sell_vol']))
            stock_top_sellers[sym] = [b for b, v in sorted(sym_sellers, key=lambda x: -x[1])[:5]]

        daily_top_brokers[str(date)] = top10_brokers
        daily_rankings[str(date)] = [
            {
                'symbol': sym,
                'rank': idx + 1,
                'volume': net_vol,
                'buy_price': round(stock_amount_agg[sym] / stock_buy_agg[sym], 2) if stock_buy_agg[sym] > 0 else 0,
                'top_sellers': stock_top_sellers[sym]
            }
            for idx, (sym, net_vol) in enumerate(top10_net_stocks)
        ]

    # 3. Final Enrichment
    all_syms = {item['symbol'] for day in daily_rankings.values() for item in day}

    # LTP Retrieval
    ltp_map = {}
    if all_syms:
        ltp_qs = DailyStockPrice.objects.filter(ticker__in=all_syms, date=latest_date).values('ticker', 'close')
        for p in ltp_qs:
            ltp_map[p['ticker']] = float(p['close'])

        if len(ltp_map) < len(all_syms):
            missing = all_syms - set(ltp_map.keys())
            for sym in missing:
                last_p = DailyStockPrice.objects.filter(ticker=sym).order_by('-date').first()
                if last_p: ltp_map[sym] = float(last_p.close)

    date_strs = [str(d) for d in dates]
    series = []
    for sym in all_syms:
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
        series.append({
            'symbol': sym,
            'ltp': ltp_map.get(sym),
            'ranks': ranks,
            'volumes': net_volumes,
            'appearances': appearances,
            'avg_rank': round(rank_sum / appearances, 2) if appearances else 10.0,
        })

    series.sort(key=lambda s: (-s['appearances'], s['avg_rank']))

    return {
        'dates': date_strs,
        'daily_top_brokers': daily_top_brokers,
        'daily_rankings': daily_rankings,
        'series': series,
        'debug_info': {
            'latest_date': str(latest_date),
            'raw_buys_count': len(raw_buys),
            'raw_sells_count': len(raw_sells)
        }
    }


# ─────────────────────────────────────────────────────────────────────────────
# BrokerViewSet / broker.py function-view extractions
# ─────────────────────────────────────────────────────────────────────────────

def navigator_signals():
    """
    Identify high-potential signals using Institutional Clustering and Divergence.
    Extracted verbatim from BrokerViewSet.signals.

    Returns the list of signal dicts exactly as the REST endpoint serialises them.
    Param parsing (none required for this action) stays in the view.
    """
    query = """
    WITH accumulation_ref AS (
        SELECT transaction_date as latest_acc_date
        FROM daily_cumulative_accumulation
        GROUP BY transaction_date
        HAVING COUNT(*) > 100
        ORDER BY transaction_date DESC
        LIMIT 1
    ),
    ranked_holders AS (
        SELECT
            symbol, entity_id, cumulative_net,
            ROW_NUMBER() OVER (PARTITION BY symbol ORDER BY cumulative_net DESC) as rank
        FROM daily_cumulative_accumulation, accumulation_ref
        WHERE transaction_date = accumulation_ref.latest_acc_date
        AND cumulative_net > 0
    ),
    smart_money AS (
        SELECT symbol, entity_id as broker
        FROM ranked_holders
        WHERE rank <= 15
    ),
    broker_delta AS (
        SELECT
            ca.symbol, ca.entity_id as broker,
            ca.cumulative_net as current_net,
            (ca.cumulative_net - LAG(ca.cumulative_net, 5) OVER (PARTITION BY ca.symbol, ca.entity_id ORDER BY ca.transaction_date)) as net_5d,
            (ca.cumulative_net - LAG(ca.cumulative_net, 20) OVER (PARTITION BY ca.symbol, ca.entity_id ORDER BY ca.transaction_date)) as net_20d,
            ROUND(ca.cumulative_buy_amount / NULLIF(ca.cumulative_buy, 0), 2) as wac,
            ca.transaction_date
        FROM daily_cumulative_accumulation ca
    ),
    latest_broker_delta AS (
        SELECT bd.* FROM broker_delta bd, accumulation_ref
        WHERE bd.transaction_date = accumulation_ref.latest_acc_date
    ),
    symbol_clustering AS (
        SELECT
            bd.symbol,
            COUNT(DISTINCT bd.broker) FILTER (WHERE sm.broker IS NOT NULL AND bd.net_5d > 0) as cluster_count,
            SUM(CASE WHEN sm.broker IS NOT NULL THEN bd.net_5d ELSE 0 END) as inst_net_5d,
            SUM(CASE WHEN sm.broker IS NOT NULL THEN bd.net_20d ELSE 0 END) as inst_net_20d,
            MAX(bd.wac) as top_broker_wac
        FROM latest_broker_delta bd
        LEFT JOIN smart_money sm ON bd.symbol = sm.symbol AND bd.broker = sm.broker
        GROUP BY bd.symbol
    ),
    price_ref AS (
        SELECT
            symbol, close,
            LAG(close, 5) OVER (PARTITION BY symbol ORDER BY transaction_date) as close_5d,
            transaction_date,
            ROW_NUMBER() OVER (PARTITION BY symbol ORDER BY transaction_date DESC) as rn
        FROM daily_stock_price
    ),
    latest_price AS (
        SELECT * FROM price_ref WHERE rn = 1
    )
    SELECT
        sc.symbol, c."companyName" as name, c."sectorName" as sector,
        sc.cluster_count, sc.inst_net_5d, sc.inst_net_20d, sc.top_broker_wac,
        lp.close as ltp, lp.close_5d
    FROM symbol_clustering sc
    INNER JOIN companies c ON sc.symbol = c.symbol
    INNER JOIN latest_price lp ON sc.symbol = lp.symbol
    WHERE c."instrumentType" NOT IN ('Mutual Funds', 'Non-Convertible Debentures')
    AND (sc.cluster_count >= 1 OR sc.inst_net_5d > 50000)
    ORDER BY sc.cluster_count DESC, sc.inst_net_5d DESC;
    """

    with connections['default'].cursor() as cursor:
        cursor.execute(query)
        columns = [col[0] for col in cursor.description]
        raw_results = [dict(zip(columns, row)) for row in cursor.fetchall()]

    signals = []
    for row in raw_results:
        ltp = float(row['ltp'] or 0)
        wac = float(row['top_broker_wac'] or 0)
        net_5d = float(row['inst_net_5d'] or 0)
        clusters = row['cluster_count']
        price_5d = float(row['close_5d'] or ltp)

        price_change = ((ltp - price_5d) / price_5d) * 100 if price_5d > 0 else 0
        markup = ((ltp - wac) / wac) * 100 if wac > 0 else 0

        signal_type = None
        rationale = ""
        strength = "Low"

        # 1. Platinum (Optimal Entry)
        if clusters >= 2 and -5 <= markup <= 5:
            signal_type = "Platinum Buy"
            rationale = f"Institutional Clustering ({clusters} brokers) near average cost (WAC)."
            strength = "Exceptional"

        # 2. Gold (Strong Momentum or Heavy Cluster)
        elif clusters >= 4 or (net_5d > 200000 and price_change > 2):
            signal_type = "Gold Signal"
            if clusters >= 4:
                rationale = f"High Institutional Clustering ({clusters} brokers) identified."
            else:
                rationale = f"Aggressive institutional accumulation with price momentum."
            strength = "High"

        # 3. Silver (Early Entry)
        elif clusters >= 2:
            signal_type = "Silver Signal"
            rationale = f"Early institutional interest detected from {clusters} smart-money brokers."
            strength = "Medium"

        # 4. Divergence (Contrarian)
        elif price_change < -3 and net_5d > 100000:
            signal_type = "Bullish Divergence"
            rationale = "Institutional accumulation increasing despite price correction."
            strength = "High"

        if signal_type:
            row.update({
                'signal_type': signal_type,
                'rationale': rationale,
                'strength': strength,
                'markup_percent': round(markup, 2),
                'price_change_5d': round(price_change, 2)
            })
            signals.append(row)

    return signals


def broker_portfolio(broker_id):
    """
    Return a broker's full portfolio: holdings with multi-period trend deltas.
    Extracted verbatim from get_broker_portfolio function view.

    broker_id: int or str broker ID (mirrors query param parsing in the view).
    entity_id column is varchar — broker_id is coerced to str before binding.
    400/missing-param guard stays in the view.
    """
    broker_id = str(broker_id)
    query = """
    WITH ref_dates AS (
        SELECT
            MAX(transaction_date) as t0,
            MAX(transaction_date) - INTERVAL '5 days' as t5,
            MAX(transaction_date) - INTERVAL '10 days' as t10,
            MAX(transaction_date) - INTERVAL '15 days' as t15,
            MAX(transaction_date) - INTERVAL '30 days' as t30,
            MAX(transaction_date) - INTERVAL '90 days' as t90
        FROM daily_cumulative_accumulation
        WHERE entity_id = %s
    ),
    latest_positions AS (
        SELECT
            ca.symbol, ca.entity_id, ca.cumulative_net,
            ca.cumulative_buy, ca.cumulative_buy_amount,
            ROW_NUMBER() OVER (PARTITION BY ca.symbol, ca.entity_id ORDER BY ca.transaction_date DESC) as rn
        FROM daily_cumulative_accumulation ca
        WHERE ca.entity_id = %s
    ),
    historical_data AS (
        SELECT
            pos.symbol,
            (SELECT cumulative_net FROM daily_cumulative_accumulation h
             WHERE h.symbol = pos.symbol AND h.entity_id = pos.entity_id AND h.transaction_date <= rd.t5
             ORDER BY h.transaction_date DESC LIMIT 1) as net_5d,
            (SELECT cumulative_net FROM daily_cumulative_accumulation h
             WHERE h.symbol = pos.symbol AND h.entity_id = pos.entity_id AND h.transaction_date <= rd.t10
             ORDER BY h.transaction_date DESC LIMIT 1) as net_10d,
            (SELECT cumulative_net FROM daily_cumulative_accumulation h
             WHERE h.symbol = pos.symbol AND h.entity_id = pos.entity_id AND h.transaction_date <= rd.t15
             ORDER BY h.transaction_date DESC LIMIT 1) as net_15d,
            (SELECT cumulative_net FROM daily_cumulative_accumulation h
             WHERE h.symbol = pos.symbol AND h.entity_id = pos.entity_id AND h.transaction_date <= rd.t30
             ORDER BY h.transaction_date DESC LIMIT 1) as net_30d,
            (SELECT cumulative_net FROM daily_cumulative_accumulation h
             WHERE h.symbol = pos.symbol AND h.entity_id = pos.entity_id AND h.transaction_date <= rd.t90
             ORDER BY h.transaction_date DESC LIMIT 1) as net_90d
        FROM latest_positions pos, ref_dates rd
        WHERE pos.rn = 1
    )
    SELECT
        pos.symbol, c."companyName" as name, c."sectorName" as sector,
        pos.cumulative_net as quantity, dsp.close as current_price,
        COALESCE(pos.cumulative_net * dsp.close, 0) as value,
        COALESCE(pos.cumulative_buy_amount / NULLIF(pos.cumulative_buy, 0), 0) as wac,
        (pos.cumulative_net - COALESCE(hd.net_5d, 0)) as trend_5d,
        (pos.cumulative_net - COALESCE(hd.net_10d, 0)) as trend_10d,
        (pos.cumulative_net - COALESCE(hd.net_15d, 0)) as trend_15d,
        (pos.cumulative_net - COALESCE(hd.net_30d, 0)) as trend_1m,
        (pos.cumulative_net - COALESCE(hd.net_90d, 0)) as trend_3m
    FROM latest_positions pos
    INNER JOIN companies c ON pos.symbol = c.symbol
    LEFT JOIN historical_data hd ON pos.symbol = hd.symbol
    LEFT JOIN (
        SELECT DISTINCT ON (symbol) symbol, close FROM daily_stock_price ORDER BY symbol, transaction_date DESC
    ) dsp ON pos.symbol = dsp.symbol
    WHERE pos.rn = 1 AND pos.cumulative_net > 0
    ORDER BY value DESC;
    """
    with connections['default'].cursor() as cursor:
        cursor.execute(query, [broker_id, broker_id])
        columns = [col[0] for col in cursor.description]
        results = [dict(zip(columns, row)) for row in cursor.fetchall()]
    total_value = sum(h['value'] for h in results if h['value'])
    return {'broker_id': broker_id, 'total_value': total_value, 'holdings': results}


def accumulation_history(broker_id, symbol, page=1, page_size=250):
    """
    Return paginated daily accumulation delta history for a broker/symbol pair.
    Extracted verbatim from accumulation_history function view.

    broker_id: broker entity_id (str or int — coerced to str to match varchar column).
    symbol: ticker string.
    400/missing-param guard stays in the view.
    """
    from ..models import DailyCumulativeAccumulation

    # Fetch history
    history = DailyCumulativeAccumulation.objects.filter(entity_id=str(broker_id), symbol=symbol).order_by('transaction_date')

    # Calculate all deltas
    results = []
    prev_h = None

    for h in history:
        if prev_h:
            buy_qty = float(h.cumulative_buy - prev_h.cumulative_buy)
            buy_amt = float(h.cumulative_buy_amount - prev_h.cumulative_buy_amount)
            sell_qty = float(h.cumulative_sell - prev_h.cumulative_sell)
            sell_amt = float(h.cumulative_sell_amount - prev_h.cumulative_sell_amount)
            net_qty = float(h.cumulative_net - prev_h.cumulative_net)
        else:
            # First day in history (start state)
            buy_qty = float(h.cumulative_buy)
            buy_amt = float(h.cumulative_buy_amount)
            sell_qty = float(h.cumulative_sell)
            sell_amt = float(h.cumulative_sell_amount)
            net_qty = float(h.cumulative_net)

        results.append({
            'date': h.transaction_date.strftime('%Y-%m-%d'),
            'buy_qty': buy_qty,
            'buy_rate': buy_amt / buy_qty if buy_qty > 0 else 0,
            'buy_amount': buy_amt,
            'sell_qty': sell_qty,
            'sell_rate': sell_amt / sell_qty if sell_qty > 0 else 0,
            'sell_amount': sell_amt,
            'net_quantity': net_qty,
            'cumulative_qty': float(h.cumulative_net),
            'wac': float(h.cumulative_buy_amount / h.cumulative_buy) if h.cumulative_buy > 0 else 0
        })
        prev_h = h

    # Reverse to show newest first for the table
    results.reverse()

    # Paginate
    start = (page - 1) * page_size
    end = start + page_size

    return results[start:end]


# ─────────────────────────────────────────────────────────────────────────────
# Per-symbol accumulation forecast (NEW — wraps price_forecast helpers)
# ─────────────────────────────────────────────────────────────────────────────

FORECAST_CACHE_TTL = 4 * 60 * 60  # mirrors the view's @cache_page TTL


def _compute_forecast(symbol: str, min_intensity: float) -> dict | None:
    """
    Core per-symbol forecast computation extracted from AccumulationForecastView.get.
    Returns the response dict on success, or None when data is absent/insufficient.
    HTTP handling and param parsing remain in the view.

    Imports helpers lazily to avoid circular imports: price_forecast imports
    backtest_harness which does not import broker_research, but broker_research
    importing price_forecast at module level would create a mutual dependency
    if price_forecast ever imports broker_research (e.g. for chat tools).
    """
    from datetime import date, timedelta
    import pandas as pd
    from stocks.views.price_forecast import (
        STUDY_YEARS, LAG_ANALYSIS_LAGS,
        _load_price_df, _load_acc_df, _build_daily_acc, _compute_features,
        _identify_events, _compute_forward_returns, _add_extra_lags_for_analysis,
        _compute_study_stats, _build_projection, _build_history, _build_price_series,
    )

    start_date = date.today() - timedelta(days=STUDY_YEARS * 365)

    price_df = _load_price_df(symbols=[symbol], start_date=start_date)
    if price_df.empty:
        return None

    acc_df = _load_acc_df(symbols=[symbol], start_date=start_date)
    if acc_df.empty:
        return None

    daily_acc = _build_daily_acc(acc_df)
    features = _compute_features(price_df, daily_acc)
    if features.empty:
        return None

    # Current state (most recent row with valid intensity)
    latest = features[features['ticker'] == symbol].sort_values('date')
    latest_valid = latest[latest['intensity'].notna()]
    if latest_valid.empty:
        return None

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

    # Study — all historical events for this symbol
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

    projection = _build_projection(events_with_returns, current_intensity, current_price, current_date)
    history = _build_history(events_with_returns)
    price_series = _build_price_series(features, events, symbol)

    return {
        'symbol': symbol,
        'current': current_state,
        'study': study,
        'projection': projection,
        'history': history,
        'price_series': price_series,
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


def share_transfers(symbol, broker1, broker2, range_key="1M", start_date=None, end_date=None):
    """
    Analyze share transfers between two specific brokers for a symbol.
    Extracted verbatim from FloorsheetViewSet.broker_transfer.

    Param validation (400 responses) stays in the view layer.
    This function accepts already-resolved, already-validated params:
      - symbol: str
      - broker1, broker2: int
      - range_key: str key into local range_map, or None to use start_date/end_date
      - start_date, end_date: str 'YYYY-MM-DD' (used when range_key is None/not given)

    If range_key, start_date, AND end_date are all None, the query runs unbounded over
    full history (verbatim-preserved view behavior); callers should pass a range.
    """
    from ..models.market import DailyFloorsheet, DailyCumulativeAccumulation

    b1_id = int(broker1)
    b2_id = int(broker2)

    # If range_key provided, override start/end dates (same logic as view)
    if range_key:
        # Local to this feature — 'ALL': 3650 (10yr cap) vs RANGE_MAP's 36500; intentionally differs from RANGE_MAP
        range_map = {
            '1D': 0, '1W': 7, '2W': 14, '1M': 30, '3M': 90, '6M': 180, '1Y': 365, 'ALL': 3650
        }
        days = range_map.get(range_key, 30)
        now = timezone.now().date()
        latest_price = DailyStockPrice.objects.order_by('-date').first()
        today = latest_price.date if latest_price else now

        end_date_obj = today
        start_date_obj = today - timedelta(days=days)

        start_date = start_date_obj.strftime('%Y-%m-%d')
        end_date = end_date_obj.strftime('%Y-%m-%d')

    # Base filters
    filters = Q(symbol=symbol)

    # Date range filter
    if start_date and end_date:
        filters &= Q(transaction_date__range=[start_date, end_date])
    elif start_date:
        filters &= Q(transaction_date__gte=start_date)
    elif end_date:
        filters &= Q(transaction_date__lte=end_date)

    # Broker pair filter: (B1 buys from B2) OR (B2 buys from B1)
    transfer_filter = (Q(buyer_id=b1_id, seller_id=b2_id) | Q(buyer_id=b2_id, seller_id=b1_id))

    queryset = DailyFloorsheet.objects.filter(filters & transfer_filter)

    # Get Smart Money (Top 15 holders) to calculate total net accumulation
    top_15_brokers = list(DailyCumulativeAccumulation.objects.filter(
        symbol=symbol
    ).order_by('-transaction_date', '-cumulative_net').values_list('entity_id', flat=True)[:15])

    # Subquery for symbol's total net accumulation (Smart Money flow)
    symbol_daily_net = DailyFloorsheet.objects.filter(filters).values('transaction_date').annotate(
        net_acc=Sum('transaction_quantity', filter=Q(buyer_id__in=top_15_brokers)) -
                Sum('transaction_quantity', filter=Q(seller_id__in=top_15_brokers))
    )
    net_acc_map = {item['transaction_date']: item['net_acc'] for item in symbol_daily_net}

    # Daily aggregation helper for broker-specific metrics and symbol totals
    daily_meta = DailyFloorsheet.objects.filter(filters).values('transaction_date').annotate(
        b1_net=Sum('transaction_quantity', filter=Q(buyer_id=b1_id)) - Sum('transaction_quantity', filter=Q(seller_id=b1_id)),
        b2_net=Sum('transaction_quantity', filter=Q(buyer_id=b2_id)) - Sum('transaction_quantity', filter=Q(seller_id=b2_id)),
        b1_buy=Sum('transaction_quantity', filter=Q(buyer_id=b1_id)),
        b1_sell=Sum('transaction_quantity', filter=Q(seller_id=b1_id)),
        b2_buy=Sum('transaction_quantity', filter=Q(buyer_id=b2_id)),
        b2_sell=Sum('transaction_quantity', filter=Q(seller_id=b2_id)),
        symbol_total_vol=Sum('transaction_quantity')  # Total market volume for the day
    )
    # Create lookup maps
    meta_map = {item['transaction_date']: item for item in daily_meta}

    # Overall summary aggregations for the transfer pair
    stats = queryset.aggregate(
        total_volume_1_to_2=Sum('transaction_quantity', filter=Q(buyer_id=b1_id, seller_id=b2_id)),
        total_volume_2_to_1=Sum('transaction_quantity', filter=Q(buyer_id=b2_id, seller_id=b1_id)),
        total_amount_1_to_2=Sum('transaction_amount', filter=Q(buyer_id=b1_id, seller_id=b2_id)),
        total_amount_2_to_1=Sum('transaction_amount', filter=Q(buyer_id=b2_id, seller_id=b1_id)),
        count_1_to_2=Count('transaction_id', filter=Q(buyer_id=b1_id, seller_id=b2_id)),
        count_2_to_1=Count('transaction_id', filter=Q(buyer_id=b2_id, seller_id=b1_id)),
        avg_rate_1_to_2=Avg('transaction_rate', filter=Q(buyer_id=b1_id, seller_id=b2_id)),
        avg_rate_2_to_1=Avg('transaction_rate', filter=Q(buyer_id=b2_id, seller_id=b1_id))
    )

    # Daily aggregation for the chart and table
    qs_daily = queryset.values('transaction_date').annotate(
        volume_1_to_2=Sum('transaction_quantity', filter=Q(buyer_id=b1_id, seller_id=b2_id)),
        volume_2_to_1=Sum('transaction_quantity', filter=Q(buyer_id=b2_id, seller_id=b1_id)),
        amount_1_to_2=Sum('transaction_amount', filter=Q(buyer_id=b1_id, seller_id=b2_id)),
        amount_2_to_1=Sum('transaction_amount', filter=Q(buyer_id=b2_id, seller_id=b1_id)),
        avg_rate_1_to_2=Avg('transaction_rate', filter=Q(buyer_id=b1_id, seller_id=b2_id)),
        avg_rate_2_to_1=Avg('transaction_rate', filter=Q(buyer_id=b2_id, seller_id=b1_id))
    ).order_by('transaction_date')

    # Get symbol price history for percentage change
    prices = DailyStockPrice.objects.filter(ticker=symbol).order_by('date')
    price_map = {p.date: float(p.close) for p in prices}
    sorted_dates = sorted(price_map.keys())

    daily_stats = []
    for item in qs_daily:
        dt = item['transaction_date']
        meta = meta_map.get(dt, {})

        # Calculate price change %
        price_change = 0
        try:
            idx = sorted_dates.index(dt)
            if idx > 0:
                curr = price_map[dt]
                prev = price_map[sorted_dates[idx - 1]]
                if prev > 0:
                    price_change = round(((curr - prev) / prev) * 100, 2)
        except (ValueError, IndexError):
            pass

        item.update({
            'net_accumulation': net_acc_map.get(dt, 0),
            'b1_net': meta.get('b1_net', 0),
            'b2_net': meta.get('b2_net', 0),
            'b1_buy': meta.get('b1_buy', 0),
            'b1_sell': meta.get('b1_sell', 0),
            'b2_buy': meta.get('b2_buy', 0),
            'b2_sell': meta.get('b2_sell', 0),
            'symbol_total_vol': meta.get('symbol_total_vol', 0),
            'price_change_pc': price_change,
            'close_price': price_map.get(dt, 0)
        })
        daily_stats.append(item)

    return {
        "summary": {
            "broker1_to_broker2": {
                "total_volume": stats['total_volume_1_to_2'] or 0,
                "total_amount": stats['total_amount_1_to_2'] or 0,
                "total_transactions": stats['count_1_to_2'] or 0,
                "avg_rate": round(stats['avg_rate_1_to_2'] or 0, 2)
            },
            "broker2_to_broker1": {
                "total_volume": stats['total_volume_2_to_1'] or 0,
                "total_amount": stats['total_amount_2_to_1'] or 0,
                "total_transactions": stats['count_2_to_1'] or 0,
                "avg_rate": round(stats['avg_rate_2_to_1'] or 0, 2)
            }
        },
        "daily_stats": list(daily_stats),
        "aggregated_transfers": list(daily_stats)[::-1]
    }
