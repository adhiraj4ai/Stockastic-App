from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from django.db import connections
from datetime import timedelta
from django.utils import timezone
from django.db.models import Max
from django.core.cache import cache
from ..models import DailyStockPrice, DailyFloorsheet

class AccumulationMixin(viewsets.ViewSet):
    """
    Mixin containing accumulation-related actions for CompanyViewSet.
    These methods are sourced from the original implementation and adapted for the CompanyViewSet context.
    """

    @action(detail=False, methods=['get'])
    def accumulation(self, request):
        """
        Return accumulation flows.
        Uses Top 15 Broker Concentration (Holders) to determine Net Accumulation (Smart Money flow).
        """
        time_range = request.query_params.get('range', '1D')
        sector = request.query_params.get('sector', 'All')

        range_map = {
            '1D': 1, '1W': 7, '2W': 14, '1M': 30, '3M': 90, '6M': 180, '1Y': 365, '2Y': 730
        }
        days = range_map.get(time_range, 1) if time_range != 'ALL' else 36500

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
            WHERE rank <= 15 -- Top 15 Holders
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
        price_history AS (
            SELECT
                symbol,
                close,
                LAG(close) OVER (PARTITION BY symbol ORDER BY transaction_date) as prev_close
            FROM daily_stock_price
            WHERE transaction_date > (SELECT max_date - INTERVAL '30 days' FROM ref_date)
        ),
        rsi_calc AS (
            SELECT
                symbol,
                ROUND(CASE
                    WHEN AVG(CASE WHEN close < prev_close THEN prev_close - close ELSE 0 END) = 0
                    THEN 100.0
                    ELSE 100.0 - (100.0 / (1.0 + (
                        AVG(CASE WHEN close > prev_close THEN close - prev_close ELSE 0 END) /
                        AVG(CASE WHEN close < prev_close THEN prev_close - close ELSE 0 END)
                    )))
                END::numeric, 2) as rsi
            FROM price_history
            WHERE prev_close IS NOT NULL
            GROUP BY symbol
        ),
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
            ROUND(rc.rsi::numeric, 2) as rsi,
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
        WHERE c."instrumentType" NOT IN ('Mutual Funds', 'Non-Convertible Debentures')
        AND c.status = 'A'
        AND c."sectorName" != 'Unknown' AND c."sectorName" IS NOT NULL
        {"" if sector.lower() == 'all' else f"AND c.\"sectorName\" = '{sector}'"}
        ORDER BY net_qty DESC;
        """

        with connections['default'].cursor() as cursor:
            cursor.execute(query)
            columns = [col[0] for col in cursor.description]
            results = [dict(zip(columns, row)) for row in cursor.fetchall()]

        return Response(results)

    @action(detail=False, methods=['get'])
    def aggressive(self, request):
        """
        Identify aggressive institutional activity relative to 20-Day average volume.
        """
        time_range = request.query_params.get('range', '1W')
        sector = request.query_params.get('sector', 'All')
        
        range_map = {
            '1D': 1, '1W': 7, '2W': 14, '1M': 30, '3M': 90, '6M': 180, '1Y': 365, '2Y': 730
        }
        days = range_map.get(time_range, 7)
        
        query = f"""
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
            WHERE rank <= 15 -- Top 15 Holders
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
            WHERE c."instrumentType" NOT IN ('Mutual Funds', 'Non-Convertible Debentures')
            AND c.status = 'A'
            AND c."sectorName" != 'Unknown' AND c."sectorName" IS NOT NULL
            {"" if sector.lower() == 'all' else f"AND c.\"sectorName\" = '{sector}'"}
        )
        SELECT * FROM intensity_cte
        WHERE ABS(intensity) > 5
        ORDER BY ABS(intensity) DESC;
        """
        
        with connections['default'].cursor() as cursor:
            cursor.execute(query)
            columns = [col[0] for col in cursor.description]
            results = [dict(zip(columns, row)) for row in cursor.fetchall()]
            
        return Response({
            'accumulators': [r for r in results if r['intensity'] > 0][:10],
            'distributors': [r for r in results if r['intensity'] < 0][:10]
        })

    @action(detail=False, methods=['get'])
    def broker_trends(self, request):
        # robust implementation using floorsheet aggregation for trends
        # and accumulation snapshot for total position
        symbol_filter = request.query_params.get('symbol', '').strip().upper()
        time_range = request.query_params.get('range', 'ALL')

        range_map = {
            '1D': 1, '1W': 7, '2W': 14, '1M': 30, '3M': 90, '6M': 180, '1Y': 365, 'ALL': 36500
        }
        days = range_map.get(time_range, 36500)

        if symbol_filter:
            symbol_where = f"AND la.symbol = '{symbol_filter}'"
            cumnet_where = ""
            limit_clause = ""
        else:
            symbol_where = ""
            cumnet_where = "AND la.cumulative_net > 100000"  # Lowered threshold to see more relevant trends
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
            SELECT
                symbol,
                buyer_id as broker,
                transaction_quantity as qty,
                transaction_date
            FROM daily_floorsheet
            WHERE transaction_date > (SELECT LEAST(date_50d, range_start) FROM date_milestones)
            {"AND symbol = '" + symbol_filter + "'" if symbol_filter else ""}
            UNION ALL
            SELECT
                symbol,
                seller_id as broker,
                -transaction_quantity as qty,
                transaction_date
            FROM daily_floorsheet
            WHERE transaction_date > (SELECT LEAST(date_50d, range_start) FROM date_milestones)
            {"AND symbol = '" + symbol_filter + "'" if symbol_filter else ""}
        ),
        trend_stats AS (
            SELECT
                fn.symbol,
                fn.broker,
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
            {"WHERE symbol = '" + symbol_filter + "'" if symbol_filter else ""}
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
        {symbol_where}
        {cumnet_where}
        ORDER BY la.cumulative_net DESC
        {limit_clause};
        """
        with connections['default'].cursor() as cursor:
            cursor.execute(query)
            columns = [col[0] for col in cursor.description]
            results = [dict(zip(columns, row)) for row in cursor.fetchall()]
        return Response(results)

    @action(detail=False, methods=['get'])
    def below_cost(self, request):
        """
        Return broker positions where LTP is below their WAC (cost basis).
        Includes 5D/10D/15D/20D/50D trend data and ROC.
        """
        time_range = request.query_params.get('range', 'ALL')
        range_map = {
            '1D': 1, '1W': 7, '2W': 14, '1M': 30, '3M': 90, '6M': 180, '1Y': 365, 'ALL': 36500
        }
        days = range_map.get(time_range, 36500)

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
        price_history AS (
            SELECT 
                symbol, 
                transaction_date, 
                close,
                LAG(close) OVER (PARTITION BY symbol ORDER BY transaction_date) as prev_close
            FROM daily_stock_price
            WHERE transaction_date > (SELECT latest_date - INTERVAL '30 days' FROM date_milestones)
        ),
        rsi_calc AS (
            SELECT
                symbol,
                ROUND(CASE
                    WHEN AVG(CASE WHEN close < prev_close THEN prev_close - close ELSE 0 END) = 0
                    THEN 100.0
                    ELSE 100.0 - (100.0 / (1.0 + (
                        AVG(CASE WHEN close > prev_close THEN close - prev_close ELSE 0 END) /
                        AVG(CASE WHEN close < prev_close THEN prev_close - close ELSE 0 END)
                    )))
                END::numeric, 2) as rsi
            FROM price_history
            WHERE prev_close IS NOT NULL
            GROUP BY symbol
        )
        SELECT
            wd.symbol, wd.broker, wd.cumulative_net, wd.wac,
            COALESCE(ts.net_range, 0) as range_net,
            dsp.close as ltp,
            ROUND((dsp.close - wd.wac) / NULLIF(wd.wac, 0) * 100, 2) as roc,
            c."companyName" as name, c."sectorName" as sector,
            ROUND(rc.rsi::numeric, 2) as rsi,
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
        AND c."instrumentType" NOT IN ('Mutual Funds', 'Non-Convertible Debentures')
        AND c.status = 'A'
        AND c."sectorName" != 'Unknown' AND c."sectorName" IS NOT NULL
        ORDER BY roc ASC
        LIMIT 500;
        """
        with connections['default'].cursor() as cursor:
            cursor.execute(query)
            columns = [col[0] for col in cursor.description]
            results = [dict(zip(columns, row)) for row in cursor.fetchall()]
        return Response(results)

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

        range_map = {
            '1D': 1, '1W': 7, '2W': 14, '1M': 30, '3M': 90, '6M': 180, '1Y': 365, '2Y': 730, 'ALL': 36500
        }
        days = range_map.get(time_range, 90)

        # Client-side pagination: Return all records for the broker/range
        
        params = []
        
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
                SUM(CASE WHEN df.buyer_id = {broker} THEN df.transaction_quantity ELSE 0 END) as buy_qty,
                SUM(CASE WHEN df.seller_id = {broker} THEN df.transaction_quantity ELSE 0 END) as sell_qty,
                SUM(CASE 
                    WHEN df.buyer_id = {broker} THEN df.transaction_quantity 
                    WHEN df.seller_id = {broker} THEN -df.transaction_quantity 
                    ELSE 0 
                END) as qty_accumulated,
                SUM(CASE 
                    WHEN df.buyer_id = {broker} THEN df.transaction_amount
                    WHEN df.seller_id = {broker} THEN -df.transaction_amount 
                    ELSE 0 
                END) as net_amount
            FROM daily_floorsheet df, target_date td
            WHERE df.transaction_date > td.start_date
            AND (df.buyer_id = {broker} OR df.seller_id = {broker})
            GROUP BY df.symbol
            HAVING SUM(CASE 
                    WHEN df.buyer_id = {broker} THEN df.transaction_quantity 
                    WHEN df.seller_id = {broker} THEN -df.transaction_quantity 
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
            WHERE symbol = ba.symbol AND entity_id = '{broker}'
            ORDER BY transaction_date DESC LIMIT 1
        ) ca ON true
        WHERE c."instrumentType" NOT IN ('Mutual Funds', 'Non-Convertible Debentures')
        AND c.status = 'A'
        AND c."sectorName" != 'Unknown' AND c."sectorName" IS NOT NULL
        ORDER BY ba.qty_accumulated DESC;
        """

        with connections['default'].cursor() as cursor:
            cursor.execute(query, params)
            rows = cursor.fetchall()
            
        base_results = []
        if rows:
            columns = ['symbol', 'name', 'current_net', 'wac', 'qty_accumulated', 'buy_qty', 'sell_qty', 'net_amount']
            base_results = [dict(zip(columns, row)) for row in rows]
            
            # Fetch LTP and Calculate ROC for all symbols
            symbols = [r['symbol'] for r in base_results]
            
            # Get latest date
            latest_price_obj = DailyStockPrice.objects.filter(ticker__in=symbols).order_by('-date').first()
            if latest_price_obj:
                latest_date = latest_price_obj.date
                # ROC Period (14 days)
                roc_period_date = latest_date - timedelta(days=20) 
                
                # Fetch recent prices
                prices = DailyStockPrice.objects.filter(
                    ticker__in=symbols, 
                    date__gte=roc_period_date
                ).values('ticker', 'date', 'close').order_by('ticker', 'date')
                
                price_map = {}
                for p in prices:
                    if p['ticker'] not in price_map: price_map[p['ticker']] = []
                    price_map[p['ticker']].append(p)
                
                final_results = []
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
                            
                            # Calculate RSI
                            up_moves = [item_prices[i]['close'] - item_prices[i-1]['close'] for i in range(1, len(item_prices)) if item_prices[i]['close'] > item_prices[i-1]['close']]
                            down_moves = [item_prices[i-1]['close'] - item_prices[i]['close'] for i in range(1, len(item_prices)) if item_prices[i]['close'] < item_prices[i-1]['close']]
                            
                            avg_up = sum(up_moves) / 14 if up_moves else 0
                            avg_down = sum(down_moves) / 14 if down_moves else 0.001
                            rs = avg_up / avg_down
                            item['rsi'] = round(100 - (100 / (1 + rs)), 2)
                            
                    item['ltp'] = ltp
                    item['roc'] = round(roc, 2)
                    final_results.append(item)
                base_results = final_results
            else:
                 for r in base_results:
                     r['ltp'] = 0
                     r['roc'] = 0

        return Response(base_results)

    @action(detail=False, methods=['get'])
    def brokers_graph(self, request):
        symbol = request.query_params.get('symbol')

        time_range = request.query_params.get('range', '1Y')
        if not symbol:
            return Response({'error': 'Symbol is required'}, status=400)

        is_all = symbol == 'All'

        with connections['default'].cursor() as cursor:
            cursor.execute("""
                SELECT transaction_date FROM daily_stock_price
                GROUP BY transaction_date HAVING COUNT(*) > 100
                ORDER BY transaction_date DESC LIMIT 1
            """)
            row = cursor.fetchone()
            today = row[0] if row else timezone.now().date()

        range_map = {'1D': 1, '1W': 7, '2W': 14, '1M': 30, '3M': 90, '6M': 180, '1Y': 365, 'ALL': 3650}
        days = range_map.get(time_range, 365)
        start_date = today - timedelta(days=days)
        
        if not is_all:
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
                top_brokers = [row[0] for row in cursor.fetchall()]
                
                if not top_brokers: 
                    return Response({
                        'data': [], 
                        'brokers': [],
                        'buy_leaders': [],
                        'sell_leaders': []
                    })
                
                placeholders = ', '.join(['%s'] * len(top_brokers))
                query = f"SELECT transaction_date, entity_id, cumulative_net FROM daily_cumulative_accumulation WHERE symbol = %s AND entity_id IN ({placeholders}) AND transaction_date >= %s"
                cursor.execute(query, [symbol] + top_brokers + [start_date])
                rows = cursor.fetchall()

            # Proccess into Recharts format (Simplified for now - can enhance later)
            # We need to pivot data: date, broker1, broker2...
            data_map = {}
            for row in rows:
                date_str = row[0].strftime('%Y-%m-%d')
                broker, net = row[1], row[2]
                if date_str not in data_map: data_map[date_str] = {'date': date_str}
                data_map[date_str][broker] = net
                
            sorted_data = sorted(list(data_map.values()), key=lambda x: x['date'])
        else:
            top_brokers = []
            sorted_data = []

        # Calculate Buy/Sell Leaders for the period
        with connections['default'].cursor() as cursor:
            if is_all:
                fs_query = f"""
                SELECT 
                    buyer_id as broker, 
                    SUM(transaction_quantity) as buy_qty,
                    SUM(transaction_quantity * transaction_rate) as buy_amt
                FROM daily_floorsheet 
                WHERE transaction_date >= %s
                GROUP BY buyer_id
                """
                cursor.execute(fs_query, [start_date])
            else:
                fs_query = f"""
                SELECT 
                    buyer_id as broker, 
                    SUM(transaction_quantity) as buy_qty,
                    SUM(transaction_quantity * transaction_rate) as buy_amt
                FROM daily_floorsheet 
                WHERE symbol = %s AND transaction_date >= %s
                GROUP BY buyer_id
                """
                cursor.execute(fs_query, [symbol, start_date])
                
            buyers = {row[0]: {'buy_qty': row[1], 'buy_amt': row[2]} for row in cursor.fetchall()}

            if is_all:
                fs_query_sell = f"""
                SELECT 
                    seller_id as broker, 
                    SUM(transaction_quantity) as sell_qty,
                    SUM(transaction_quantity * transaction_rate) as sell_amt
                FROM daily_floorsheet 
                WHERE transaction_date >= %s
                GROUP BY seller_id
                """
                cursor.execute(fs_query_sell, [start_date])
            else:
                fs_query_sell = f"""
                SELECT 
                    seller_id as broker, 
                    SUM(transaction_quantity) as sell_qty,
                    SUM(transaction_quantity * transaction_rate) as sell_amt
                FROM daily_floorsheet 
                WHERE symbol = %s AND transaction_date >= %s
                GROUP BY seller_id
                """
                cursor.execute(fs_query_sell, [symbol, start_date])
                
            sellers = {row[0]: {'sell_qty': row[1], 'sell_amt': row[2]} for row in cursor.fetchall()}

        # Combine and rank
        all_brokers = set(buyers.keys()) | set(sellers.keys())
        leader_stats = []
        for b in all_brokers:
           b_data = buyers.get(b, {'buy_qty': 0, 'buy_amt': 0})
           s_data = sellers.get(b, {'sell_qty': 0, 'sell_amt': 0})
           net_qty = b_data['buy_qty'] - s_data['sell_qty']
           net_amt = b_data['buy_amt'] - s_data['sell_amt']
           
           leader_stats.append({
               'broker': b,
               'net_qty': net_qty,
               'net_amt': net_amt,
               'buy_qty': b_data['buy_qty'],
               'sell_qty': s_data['sell_qty'],
               'buy_rate': round(b_data['buy_amt'] / b_data['buy_qty'], 2) if b_data['buy_qty'] > 0 else 0,
               'sell_rate': round(s_data['sell_amt'] / s_data['sell_qty'], 2) if s_data['sell_qty'] > 0 else 0
           })
           
        # If is_all, rank by net_amt, else net_qty
        sort_key = 'net_amt' if is_all else 'net_qty'
        
        buy_leaders = sorted([l for l in leader_stats if l[sort_key] > 0], key=lambda x: x[sort_key], reverse=True)[:10]
        
        raw_sell_leaders = sorted([l for l in leader_stats if l[sort_key] < 0], key=lambda x: x[sort_key])[:10]
        sell_leaders = []
        for l in raw_sell_leaders:
            l_copy = l.copy()
            l_copy['net_qty'] = abs(l_copy['net_qty'])
            l_copy['net_amt'] = abs(l_copy['net_amt'])
            sell_leaders.append(l_copy)

        return Response({
            'history': sorted_data,
            'top_brokers': top_brokers,
            'buy_leaders': buy_leaders,
            'sell_leaders': sell_leaders
        })

    @action(detail=False, methods=['get'])
    def accumulation_brokers(self, request):
        """
        Return list of active broker IDs for accumulation filtering.
        Uses raw SQL consistent with the rest of this mixin, with server-side caching.
        """
        cache_key = 'active_broker_ids'
        broker_ids = cache.get(cache_key)
        
        if broker_ids is None:
            with connections['default'].cursor() as cursor:
                cursor.execute("""
                    SELECT DISTINCT buyer_id
                    FROM daily_floorsheet
                    ORDER BY buyer_id
                """)
                broker_ids = [str(row[0]) for row in cursor.fetchall()]
            
            # Cache for 24 hours
            cache.set(cache_key, broker_ids, 86400)
            
        return Response(broker_ids)
