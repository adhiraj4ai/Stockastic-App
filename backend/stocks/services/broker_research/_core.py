"""Shared utilities, constants, and SQL templates for broker_research submodules."""
import hashlib
from django.db import connections
from django.core.cache import cache

RANGE_MAP = {
    '1D': 1, '1W': 7, '2W': 14, '1M': 30, '3M': 90, '6M': 180, '1Y': 365, '2Y': 730, 'ALL': 36500
}

FORECAST_CACHE_TTL = 4 * 60 * 60  # 4h; matches the daily-ETL data cadence


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

_ACC_FLOWS_SQL_TEMPLATE = """
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
        SELECT symbol, entity_id as broker FROM latest_positions WHERE rank <= 15
    ),
    broker_net AS (
        SELECT
            l.symbol, l.entity_id as broker,
            (l.cumulative_net - COALESCE(p.cumulative_net, 0)) as net_flow,
            0 as total_buy, 0 as total_sell
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
    {rsi_cte},
    roc_calc AS (
        SELECT DISTINCT ON (symbol) symbol, close as ref_close
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
        SELECT DISTINCT ON (symbol) symbol, close FROM daily_stock_price ORDER BY symbol, transaction_date DESC
    ) dsp ON sa.symbol = dsp.symbol
    LEFT JOIN rsi_calc rc ON sa.symbol = rc.symbol
    LEFT JOIN roc_calc roc ON sa.symbol = roc.symbol
    WHERE {{where_clause}}
    ORDER BY net_qty DESC;
"""

_BROKER_TRENDS_SQL_TEMPLATE = """
    WITH valid_dates AS (
        SELECT transaction_date FROM daily_floorsheet
        GROUP BY transaction_date HAVING COUNT(*) > 100
        ORDER BY transaction_date DESC LIMIT 51
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
        SELECT fn.symbol, fn.broker,
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
        ROUND(ABS(COALESCE(ts.net_5d, 0)) / NULLIF(ABS(la.cumulative_net), 0) * 100, 2) AS change_5d,
        CASE WHEN COALESCE(ts.net_10d, 0) > 0 THEN 'Increasing' WHEN COALESCE(ts.net_10d, 0) < 0 THEN 'Decreasing' ELSE 'Stable' END AS trend_10d,
        ROUND(ABS(COALESCE(ts.net_10d, 0)) / NULLIF(ABS(la.cumulative_net), 0) * 100, 2) AS change_10d,
        CASE WHEN COALESCE(ts.net_20d, 0) > 0 THEN 'Increasing' WHEN COALESCE(ts.net_20d, 0) < 0 THEN 'Decreasing' ELSE 'Stable' END AS trend_20d,
        ROUND(ABS(COALESCE(ts.net_20d, 0)) / NULLIF(ABS(la.cumulative_net), 0) * 100, 2) AS change_20d,
        CASE WHEN COALESCE(ts.net_50d, 0) > 0 THEN 'Increasing' WHEN COALESCE(ts.net_50d, 0) < 0 THEN 'Decreasing' ELSE 'Stable' END AS trend_50d,
        ROUND(ABS(COALESCE(ts.net_50d, 0)) / NULLIF(ABS(la.cumulative_net), 0) * 100, 2) AS change_50d,
        dsp.close as ltp
    FROM latest_accumulation la
    LEFT JOIN trend_stats ts ON la.symbol = ts.symbol AND la.entity_id = CAST(ts.broker AS VARCHAR)
    INNER JOIN companies c ON la.symbol = c.symbol
    LEFT JOIN (
        SELECT DISTINCT ON (symbol) symbol, close FROM daily_stock_price ORDER BY symbol, transaction_date DESC
    ) dsp ON la.symbol = dsp.symbol
    WHERE c."instrumentType" NOT IN ('Mutual Funds', 'Non-Convertible Debentures')
    AND c.status = 'A' AND c."sectorName" != 'Unknown' AND c."sectorName" IS NOT NULL
    {symbol_sql_where}
    {cumnet_where}
    ORDER BY la.cumulative_net DESC
    {limit_clause};
"""

_BELOW_COST_SQL_TEMPLATE = """
    WITH valid_dates AS (
        SELECT transaction_date FROM daily_floorsheet
        GROUP BY transaction_date HAVING COUNT(*) > 100
        ORDER BY transaction_date DESC LIMIT 51
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
    ref_date AS (SELECT (SELECT transaction_date FROM valid_dates LIMIT 1) as max_date),
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
        SELECT fn.symbol, fn.broker,
            SUM(CASE WHEN fn.transaction_date > dm.date_5d THEN fn.qty ELSE 0 END) as net_5d,
            SUM(CASE WHEN fn.transaction_date > dm.date_10d THEN fn.qty ELSE 0 END) as net_10d,
            SUM(CASE WHEN fn.transaction_date > dm.date_15d THEN fn.qty ELSE 0 END) as net_15d,
            SUM(CASE WHEN fn.transaction_date > dm.date_20d THEN fn.qty ELSE 0 END) as net_20d,
            SUM(CASE WHEN fn.transaction_date > dm.date_50d THEN fn.qty ELSE 0 END) as net_50d,
            SUM(CASE WHEN fn.transaction_date > dm.range_start THEN fn.qty ELSE 0 END) as net_range
        FROM floorsheet_net fn, date_milestones dm GROUP BY fn.symbol, fn.broker
    ),
    latest_accumulation AS (
        SELECT DISTINCT ON (symbol, entity_id)
            symbol, entity_id, cumulative_net, cumulative_buy, cumulative_buy_amount
        FROM daily_cumulative_accumulation ORDER BY symbol, entity_id, transaction_date DESC
    ),
    wac_data AS (
        SELECT la.symbol, la.entity_id as broker, la.cumulative_net,
            ROUND(la.cumulative_buy_amount / NULLIF(la.cumulative_buy, 0), 2) as wac
        FROM latest_accumulation la WHERE la.cumulative_net > 10000
    ),
    {rsi_cte}
    SELECT
        wd.symbol, wd.broker, wd.cumulative_net, wd.wac,
        COALESCE(ts.net_range, 0) as range_net, dsp.close as ltp,
        ROUND((dsp.close - wd.wac) / NULLIF(wd.wac, 0) * 100, 2) as roc,
        c."companyName" as name, c."sectorName" as sector, COALESCE(rc.rsi, 0) as rsi,
        CASE WHEN COALESCE(ts.net_5d,0) > 0 THEN 'Increasing' WHEN COALESCE(ts.net_5d,0) < 0 THEN 'Decreasing' ELSE 'Stable' END AS trend_5d,
        ROUND(ABS(COALESCE(ts.net_5d,0)) / NULLIF(ABS(wd.cumulative_net),0) * 100, 2) AS change_5d,
        CASE WHEN COALESCE(ts.net_10d,0) > 0 THEN 'Increasing' WHEN COALESCE(ts.net_10d,0) < 0 THEN 'Decreasing' ELSE 'Stable' END AS trend_10d,
        ROUND(ABS(COALESCE(ts.net_10d,0)) / NULLIF(ABS(wd.cumulative_net),0) * 100, 2) AS change_10d,
        CASE WHEN COALESCE(ts.net_15d,0) > 0 THEN 'Increasing' WHEN COALESCE(ts.net_15d,0) < 0 THEN 'Decreasing' ELSE 'Stable' END AS trend_15d,
        ROUND(ABS(COALESCE(ts.net_15d,0)) / NULLIF(ABS(wd.cumulative_net),0) * 100, 2) AS change_15d,
        CASE WHEN COALESCE(ts.net_20d,0) > 0 THEN 'Increasing' WHEN COALESCE(ts.net_20d,0) < 0 THEN 'Decreasing' ELSE 'Stable' END AS trend_20d,
        ROUND(ABS(COALESCE(ts.net_20d,0)) / NULLIF(ABS(wd.cumulative_net),0) * 100, 2) AS change_20d,
        CASE WHEN COALESCE(ts.net_50d,0) > 0 THEN 'Increasing' WHEN COALESCE(ts.net_50d,0) < 0 THEN 'Decreasing' ELSE 'Stable' END AS trend_50d,
        ROUND(ABS(COALESCE(ts.net_50d,0)) / NULLIF(ABS(wd.cumulative_net),0) * 100, 2) AS change_50d
    FROM wac_data wd
    LEFT JOIN trend_stats ts ON wd.symbol = ts.symbol AND wd.broker = CAST(ts.broker AS VARCHAR)
    LEFT JOIN rsi_calc rc ON wd.symbol = rc.symbol
    INNER JOIN companies c ON wd.symbol = c.symbol
    LEFT JOIN (
        SELECT DISTINCT ON (symbol) symbol, close FROM daily_stock_price ORDER BY symbol, transaction_date DESC
    ) dsp ON wd.symbol = dsp.symbol
    WHERE dsp.close < wd.wac AND wd.wac > 0 AND {{where_clause}}
    ORDER BY roc ASC LIMIT 500;
"""

_BROKER_FAVORITES_SQL_TEMPLATE = """
    WITH ref_date AS (
        SELECT transaction_date as current_date FROM daily_floorsheet
        GROUP BY transaction_date HAVING COUNT(*) > 100
        ORDER BY transaction_date DESC LIMIT 1
    ),
    target_date AS (
         SELECT (current_date - INTERVAL '{days} days') as start_date FROM ref_date
    ),
    broker_activity AS (
        SELECT
            df.symbol,
            SUM(CASE WHEN df.buyer_id = %s THEN df.transaction_quantity ELSE 0 END) as buy_qty,
            SUM(CASE WHEN df.seller_id = %s THEN df.transaction_quantity ELSE 0 END) as sell_qty,
            SUM(CASE WHEN df.buyer_id = %s THEN df.transaction_quantity
                     WHEN df.seller_id = %s THEN -df.transaction_quantity ELSE 0 END) as qty_accumulated,
            SUM(CASE WHEN df.buyer_id = %s THEN df.transaction_amount
                     WHEN df.seller_id = %s THEN -df.transaction_amount ELSE 0 END) as net_amount
        FROM daily_floorsheet df, target_date td
        WHERE df.transaction_date > td.start_date
        AND (df.buyer_id = %s OR df.seller_id = %s)
        GROUP BY df.symbol
        HAVING SUM(CASE WHEN df.buyer_id = %s THEN df.transaction_quantity
                        WHEN df.seller_id = %s THEN -df.transaction_quantity ELSE 0 END) != 0
    )
    SELECT
        ba.symbol, c."companyName" as name,
        COALESCE(ca.cumulative_net, 0) as current_net,
        CASE WHEN ca.cumulative_buy > 0 THEN ROUND(ca.cumulative_buy_amount / ca.cumulative_buy, 2) ELSE 0 END as wac,
        ba.qty_accumulated, ba.buy_qty, ba.sell_qty, ba.net_amount
    FROM broker_activity ba
    INNER JOIN companies c ON ba.symbol = c.symbol
    LEFT JOIN LATERAL (
        SELECT cumulative_net, cumulative_buy, cumulative_buy_amount
        FROM daily_cumulative_accumulation
        WHERE symbol = ba.symbol AND entity_id = %s
        ORDER BY transaction_date DESC LIMIT 1
    ) ca ON true
    WHERE c."instrumentType" NOT IN ('Mutual Funds', 'Non-Convertible Debentures')
    AND c.status = 'A' AND c."sectorName" != 'Unknown' AND c."sectorName" IS NOT NULL
    ORDER BY ba.qty_accumulated DESC;
"""

_BROKER_PORTFOLIO_SQL = """
    WITH ref_dates AS (
        SELECT
            MAX(transaction_date) as t0,
            MAX(transaction_date) - INTERVAL '5 days' as t5,
            MAX(transaction_date) - INTERVAL '10 days' as t10,
            MAX(transaction_date) - INTERVAL '15 days' as t15,
            MAX(transaction_date) - INTERVAL '30 days' as t30,
            MAX(transaction_date) - INTERVAL '90 days' as t90
        FROM daily_cumulative_accumulation WHERE entity_id = %s
    ),
    latest_positions AS (
        SELECT ca.symbol, ca.entity_id, ca.cumulative_net,
            ca.cumulative_buy, ca.cumulative_buy_amount,
            ROW_NUMBER() OVER (PARTITION BY ca.symbol, ca.entity_id ORDER BY ca.transaction_date DESC) as rn
        FROM daily_cumulative_accumulation ca WHERE ca.entity_id = %s
    ),
    historical_data AS (
        SELECT pos.symbol,
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
        FROM latest_positions pos, ref_dates rd WHERE pos.rn = 1
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
        SELECT DISTINCT ON (symbol) symbol, close
        FROM daily_stock_price ORDER BY symbol, transaction_date DESC
    ) dsp ON pos.symbol = dsp.symbol
    WHERE pos.rn = 1 AND pos.cumulative_net > 0
    ORDER BY value DESC;
"""

_NAVIGATOR_SIGNALS_QUERY = """
    WITH accumulation_ref AS (
        SELECT transaction_date as latest_acc_date
        FROM daily_cumulative_accumulation
        GROUP BY transaction_date HAVING COUNT(*) > 100
        ORDER BY transaction_date DESC LIMIT 1
    ),
    ranked_holders AS (
        SELECT symbol, entity_id, cumulative_net,
            ROW_NUMBER() OVER (PARTITION BY symbol ORDER BY cumulative_net DESC) as rank
        FROM daily_cumulative_accumulation, accumulation_ref
        WHERE transaction_date = accumulation_ref.latest_acc_date AND cumulative_net > 0
    ),
    smart_money AS (SELECT symbol, entity_id as broker FROM ranked_holders WHERE rank <= 15),
    broker_delta AS (
        SELECT ca.symbol, ca.entity_id as broker, ca.cumulative_net as current_net,
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
        SELECT bd.symbol,
            COUNT(DISTINCT bd.broker) FILTER (WHERE sm.broker IS NOT NULL AND bd.net_5d > 0) as cluster_count,
            SUM(CASE WHEN sm.broker IS NOT NULL THEN bd.net_5d ELSE 0 END) as inst_net_5d,
            SUM(CASE WHEN sm.broker IS NOT NULL THEN bd.net_20d ELSE 0 END) as inst_net_20d,
            MAX(bd.wac) as top_broker_wac
        FROM latest_broker_delta bd
        LEFT JOIN smart_money sm ON bd.symbol = sm.symbol AND bd.broker = sm.broker
        GROUP BY bd.symbol
    ),
    price_ref AS (
        SELECT symbol, close,
            LAG(close, 5) OVER (PARTITION BY symbol ORDER BY transaction_date) as close_5d,
            transaction_date,
            ROW_NUMBER() OVER (PARTITION BY symbol ORDER BY transaction_date DESC) as rn
        FROM daily_stock_price
    ),
    latest_price AS (SELECT * FROM price_ref WHERE rn = 1)
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
