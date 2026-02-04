from rest_framework import status, viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from django.db import connections
from datetime import timedelta
from django.utils import timezone
from django.db.models import Max
from ..models import DailyStockPrice, Company, DailyFloorsheet, StockFundamental, DailyCumulativeAccumulation

class BrokerViewSet(viewsets.ViewSet):
    """
    ViewSet for broker analysis and accumulation trends.
    """
    permission_classes = [AllowAny]

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
            SELECT MAX(transaction_date) as max_date FROM daily_cumulative_accumulation
        ),
        ranked_holders AS (
            SELECT 
                symbol, entity_id, cumulative_net,
                ROW_NUMBER() OVER (PARTITION BY symbol ORDER BY cumulative_net DESC) as rank
            FROM daily_cumulative_accumulation, ref_date
            WHERE transaction_date = ref_date.max_date
            AND cumulative_net > 0 
        ),
        smart_money AS (
            SELECT symbol, entity_id as broker 
            FROM ranked_holders 
            WHERE rank <= 15 -- Top 15 Holders
        ),
        fs_target AS (
             SELECT (MAX(transaction_date) - INTERVAL '{days} days') as start_date FROM daily_floorsheet
        ),
        floorsheet_activity AS (
            SELECT 
                buyer_id as broker, symbol, transaction_quantity as buy_qty, 0 as sell_qty
            FROM daily_floorsheet, fs_target
            WHERE transaction_date > fs_target.start_date
            UNION ALL
            SELECT 
                seller_id as broker, symbol, 0 as buy_qty, transaction_quantity as sell_qty
            FROM daily_floorsheet, fs_target
            WHERE transaction_date > fs_target.start_date
        ),
        broker_net AS (
            SELECT 
                broker, symbol, (SUM(buy_qty) - SUM(sell_qty)) as net_flow,
                SUM(buy_qty) as total_buy,
                SUM(sell_qty) as total_sell
            FROM floorsheet_activity
            GROUP BY broker, symbol
            HAVING (SUM(buy_qty) - SUM(sell_qty)) != 0
        ),
        symbol_agg AS (
             SELECT 
                 bn.symbol,
                 SUM(CASE WHEN sm.broker IS NOT NULL THEN bn.net_flow ELSE 0 END) as smart_net_qty,
                 SUM(bn.total_buy) as total_vol,
                 ARRAY_AGG(bn.broker ORDER BY bn.net_flow DESC) FILTER (WHERE bn.net_flow > 0) as top_buyers,
                 ARRAY_AGG(bn.broker ORDER BY bn.net_flow ASC) FILTER (WHERE bn.net_flow < 0) as top_sellers
             FROM broker_net bn
             LEFT JOIN smart_money sm ON bn.symbol = sm.symbol AND CAST(bn.broker AS VARCHAR) = sm.broker
             GROUP BY bn.symbol
        )
        SELECT 
            sa.symbol, c."companyName" as name, c."sectorName" as sector,
            CASE WHEN sa.smart_net_qty > 0 THEN sa.smart_net_qty ELSE 0 END as buy_qty,
            CASE WHEN sa.smart_net_qty < 0 THEN ABS(sa.smart_net_qty) ELSE 0 END as sell_qty,
            sa.smart_net_qty as net_qty,
            CASE WHEN sa.total_vol > 0 
               THEN (ABS(sa.smart_net_qty) / sa.total_vol) * 100 
               ELSE 0 END as accumulation_ratio,
            COALESCE(sa.top_buyers[1:3], ARRAY[]::integer[]) as top_buyers,
            COALESCE(sa.top_sellers[1:3], ARRAY[]::integer[]) as top_sellers,
            COALESCE(dsp.close, 0) as close
        FROM symbol_agg sa
        INNER JOIN companies c ON sa.symbol = c.symbol
        LEFT JOIN (
            SELECT DISTINCT ON (symbol) symbol, close 
            FROM daily_stock_price 
            ORDER BY symbol, transaction_date DESC
        ) dsp ON sa.symbol = dsp.symbol
        WHERE c."instrumentType" NOT IN ('Mutual Funds', 'Non-Convertible Debentures')
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
        WITH ref_date AS (
            SELECT MAX(transaction_date) as current_date FROM daily_floorsheet
        ),
        target_range AS (
            SELECT current_date - INTERVAL '{days} days' as start_date FROM ref_date
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
                symbol,
                SUM(CASE WHEN net_flow > 0 THEN net_flow ELSE 0 END) as institutional_buy,
                SUM(CASE WHEN net_flow < 0 THEN ABS(net_flow) ELSE 0 END) as institutional_sell,
                ARRAY_AGG(broker ORDER BY net_flow DESC) FILTER (WHERE net_flow > 0) as top_buyers,
                ARRAY_AGG(broker ORDER BY net_flow ASC) FILTER (WHERE net_flow < 0) as top_sellers
            FROM broker_symbol_summary
            GROUP BY symbol
        ),
        avg_volume_cte AS (
            SELECT 
                symbol,
                AVG(volume) OVER (PARTITION BY symbol ORDER BY transaction_date DESC ROWS BETWEEN CURRENT ROW AND 19 FOLLOWING) as avg_vol_20d,
                close,
                transaction_date,
                ROW_NUMBER() OVER (PARTITION BY symbol ORDER BY transaction_date DESC) as rn
            FROM daily_stock_price
            WHERE transaction_date <= (SELECT current_date FROM ref_date)
        ),
        latest_avg_vol AS (
            SELECT symbol, avg_vol_20d, close FROM avg_volume_cte WHERE rn = 1
        ),
        intensity_cte AS (
            SELECT 
                ss.symbol, c."companyName" as name, c."sectorName" as sector,
                ss.institutional_buy, ss.institutional_sell,
                (ss.institutional_buy - ss.institutional_sell) as net_qty,
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
            {"" if sector.lower() == 'all' else f"AND c.\\\"sectorName\\\" = '{sector}'"}
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
        query = """
        WITH trend_data AS (
            SELECT 
                ca.*,
                ca.cumulative_net - LAG(ca.cumulative_net, 5) OVER (PARTITION BY ca.symbol, ca.entity_id ORDER BY ca.transaction_date) AS net_5d,
                ca.cumulative_net - LAG(ca.cumulative_net, 10) OVER (PARTITION BY ca.symbol, ca.entity_id ORDER BY ca.transaction_date) AS net_10d,
                ca.cumulative_net - LAG(ca.cumulative_net, 20) OVER (PARTITION BY ca.symbol, ca.entity_id ORDER BY ca.transaction_date) AS net_20d,
                ca.cumulative_net - LAG(ca.cumulative_net, 50) OVER (PARTITION BY ca.symbol, ca.entity_id ORDER BY ca.transaction_date) AS net_50d,
                MAX(ca.transaction_date) OVER () AS latest_date
            FROM daily_cumulative_accumulation ca
            INNER JOIN companies c ON ca.symbol = c.symbol
            WHERE c."instrumentType" NOT IN ('Mutual Funds', 'Non-Convertible Debentures')
        )
        SELECT 
            td.symbol, td.entity_id as broker, td.cumulative_net,
            ROUND(td.cumulative_buy_amount / NULLIF(td.cumulative_buy, 0), 2) as wac,
            CASE WHEN td.net_5d > 0 THEN 'Increasing' WHEN td.net_5d < 0 THEN 'Decreasing' ELSE 'Stable' END AS trend_5d,
            ROUND(ABS(COALESCE(td.net_5d, 0)) / NULLIF(ABS(td.cumulative_net), 1) * 100, 2) AS change_5d,
            CASE WHEN td.net_10d > 0 THEN 'Increasing' WHEN td.net_10d < 0 THEN 'Decreasing' ELSE 'Stable' END AS trend_10d,
            dsp.close as ltp
        FROM trend_data td
        LEFT JOIN (
            SELECT DISTINCT ON (symbol) symbol, close 
            FROM daily_stock_price ORDER BY symbol, transaction_date DESC
        ) dsp ON td.symbol = dsp.symbol
        WHERE td.transaction_date = td.latest_date
        AND td.cumulative_net > 250000
        ORDER BY td.cumulative_net DESC;
        """
        with connections['default'].cursor() as cursor:
            cursor.execute(query)
            columns = [col[0] for col in cursor.description]
            results = [dict(zip(columns, row)) for row in cursor.fetchall()]
        return Response(results)

    @action(detail=False, methods=['get'])
    def favorites(self, request):
        broker = request.query_params.get('broker')
        if not broker:
            return Response({'error': 'broker ID is required'}, status=400)

        query = """
        WITH ref_date AS (SELECT MAX(transaction_date) as current_date FROM daily_floorsheet),
        broker_activity AS (
            SELECT symbol, transaction_date, transaction_quantity as net_qty, (transaction_quantity * transaction_rate) as net_amt
            FROM daily_floorsheet WHERE buyer_id = %s
            UNION ALL
            SELECT symbol, transaction_date, -transaction_quantity as net_qty, -(transaction_quantity * transaction_rate) as net_amt
            FROM daily_floorsheet WHERE seller_id = %s
        ),
        aggregated_stats AS (
            SELECT 
                ba.symbol,
                SUM(CASE WHEN ba.transaction_date > (rd.current_date - INTERVAL '1 month') THEN ba.net_qty ELSE 0 END) as flow_1m,
                MAX(ba.transaction_date) as last_trade_date
            FROM broker_activity ba, ref_date rd
            GROUP BY ba.symbol
        )
        SELECT 
            ast.symbol, c."companyName" as name, COALESCE(ca.cumulative_net, 0) as current_net,
            CASE WHEN ca.cumulative_buy > 0 THEN ROUND(ca.cumulative_buy_amount / ca.cumulative_buy, 2) ELSE 0 END as wac,
            ast.flow_1m as change_1m
        FROM aggregated_stats ast
        INNER JOIN companies c ON ast.symbol = c.symbol
        LEFT JOIN LATERAL (
            SELECT cumulative_net, cumulative_buy, cumulative_buy_amount 
            FROM daily_cumulative_accumulation 
            WHERE symbol = ast.symbol AND entity_id = %s
            ORDER BY transaction_date DESC LIMIT 1
        ) ca ON true
        WHERE c."instrumentType" NOT IN ('Mutual Funds', 'Non-Convertible Debentures')
        ORDER BY current_net DESC;
        """
        with connections['default'].cursor() as cursor:
            cursor.execute(query, [broker, broker, broker])
            columns = [col[0] for col in cursor.description]
            results = [dict(zip(columns, row)) for row in cursor.fetchall()]
        return Response(results)

    @action(detail=False, methods=['get'])
    def graph(self, request):
        symbol = request.query_params.get('symbol')
        time_range = request.query_params.get('range', '1Y')
        if not symbol:
            return Response({'error': 'Symbol is required'}, status=400)
            
        max_date_agg = DailyStockPrice.objects.aggregate(Max('date'))
        today = max_date_agg['date__max'] or timezone.now().date()
        range_map = {'1W': 7, '1M': 30, '1Y': 365, 'ALL': 3650}
        days = range_map.get(time_range, 365)
        start_date = today - timedelta(days=days)
        
        with connections['default'].cursor() as cursor:
            cursor.execute("""
                SELECT entity_id FROM daily_cumulative_accumulation 
                WHERE symbol = %s AND transaction_date = (SELECT MAX(transaction_date) FROM daily_cumulative_accumulation)
                ORDER BY cumulative_net DESC LIMIT 5
            """, [symbol])
            top_brokers = [row[0] for row in cursor.fetchall()]
            
            if not top_brokers: return Response({'data': [], 'brokers': []})
            
            placeholders = ', '.join(['%s'] * len(top_brokers))
            query = f"SELECT transaction_date, entity_id, cumulative_net FROM daily_cumulative_accumulation WHERE symbol = %s AND entity_id IN ({placeholders}) AND transaction_date >= %s"
            cursor.execute(query, [symbol] + top_brokers + [start_date])
            rows = cursor.fetchall()

        # Proccess into Recharts format (Simplified for now)
        return Response({'data': [], 'brokers': top_brokers}) # Placeholder

@api_view(['GET'])
@permission_classes([AllowAny])
def get_broker_portfolio(request):
    broker_id = request.query_params.get('broker_id')
    if not broker_id:
        return Response({'error': 'broker_id is required'}, status=400)
    
    query = """
    WITH latest_positions AS (
        SELECT 
            ca.symbol, ca.entity_id, ca.cumulative_net,
            ROW_NUMBER() OVER (PARTITION BY ca.symbol, ca.entity_id ORDER BY ca.transaction_date DESC) as rn
        FROM daily_cumulative_accumulation ca
        WHERE ca.entity_id = %s
    )
    SELECT 
        pos.symbol, c."companyName" as name, c."sectorName" as sector,
        pos.cumulative_net as quantity, dsp.close as current_price,
        (pos.cumulative_net * dsp.close) as value
    FROM latest_positions pos
    INNER JOIN companies c ON pos.symbol = c.symbol
    LEFT JOIN (
        SELECT DISTINCT ON (symbol) symbol, close FROM daily_stock_price ORDER BY symbol, transaction_date DESC
    ) dsp ON pos.symbol = dsp.symbol
    WHERE pos.rn = 1 AND pos.cumulative_net > 0
    ORDER BY value DESC;
    """
    with connections['default'].cursor() as cursor:
        cursor.execute(query, [broker_id])
        columns = [col[0] for col in cursor.description]
        results = [dict(zip(columns, row)) for row in cursor.fetchall()]
    return Response({'holdings': results})

@api_view(['GET'])
@permission_classes([AllowAny])
def accumulation_history(request):
    broker = request.query_params.get('broker')
    symbol = request.query_params.get('symbol')
    if not broker or not symbol:
        return Response({'error': 'Params required'}, status=400)
    history = DailyCumulativeAccumulation.objects.filter(entity_id=broker, symbol=symbol).order_by('transaction_date')
    return Response([{'date': h.transaction_date, 'net': h.cumulative_net} for h in history])
