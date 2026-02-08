from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from django.db import connections
from datetime import timedelta
from django.utils import timezone
from django.db.models import Max
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
        symbol_agg AS (
            SELECT 
                bn.symbol,
                SUM(CASE WHEN sm.broker IS NOT NULL THEN bn.net_flow ELSE 0 END) as smart_net_qty,
                0 as total_vol,
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
            0 as accumulation_ratio,
            COALESCE(sa.top_buyers[1:3], ARRAY[]::text[]) as top_buyers,
            COALESCE(sa.top_sellers[1:3], ARRAY[]::text[]) as top_sellers,
            COALESCE(dsp.close, 0) as close
        FROM symbol_agg sa
        INNER JOIN companies c ON sa.symbol = c.symbol
        LEFT JOIN (
            SELECT DISTINCT ON (symbol) symbol, close 
            FROM daily_stock_price 
            ORDER BY symbol, transaction_date DESC
        ) dsp ON sa.symbol = dsp.symbol
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
        query = """
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
                (SELECT transaction_date FROM valid_dates OFFSET 50 LIMIT 1) as date_50d
        ),
        floorsheet_net AS (
            SELECT 
                symbol, 
                buyer_id as broker, 
                transaction_quantity as qty, 
                transaction_date
            FROM daily_floorsheet
            WHERE transaction_date > (SELECT date_50d FROM date_milestones)
            UNION ALL
            SELECT 
                symbol, 
                seller_id as broker, 
                -transaction_quantity as qty, 
                transaction_date
            FROM daily_floorsheet
            WHERE transaction_date > (SELECT date_50d FROM date_milestones)
        ),
        trend_stats AS (
            SELECT 
                fn.symbol, 
                fn.broker,
                SUM(CASE WHEN fn.transaction_date > dm.date_5d THEN fn.qty ELSE 0 END) as net_5d,
                SUM(CASE WHEN fn.transaction_date > dm.date_10d THEN fn.qty ELSE 0 END) as net_10d,
                SUM(CASE WHEN fn.transaction_date > dm.date_20d THEN fn.qty ELSE 0 END) as net_20d,
                SUM(CASE WHEN fn.transaction_date > dm.date_50d THEN fn.qty ELSE 0 END) as net_50d
            FROM floorsheet_net fn, date_milestones dm
            GROUP BY fn.symbol, fn.broker
        ),
        latest_accumulation AS (
            SELECT DISTINCT ON (symbol, entity_id)
                symbol, entity_id, cumulative_net, cumulative_buy, cumulative_buy_amount
            FROM daily_cumulative_accumulation
            ORDER BY symbol, entity_id, transaction_date DESC
        )
        SELECT 
            la.symbol, la.entity_id as broker, la.cumulative_net,
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
        AND la.cumulative_net > 250000
        ORDER BY la.cumulative_net DESC
        LIMIT 200;
        """
        with connections['default'].cursor() as cursor:
            cursor.execute(query)
            columns = [col[0] for col in cursor.description]
            results = [dict(zip(columns, row)) for row in cursor.fetchall()]
        return Response(results)

    @action(detail=False, methods=['get'])
    def broker_favorites(self, request):
        broker = request.query_params.get('broker')
        if not broker:
            return Response({'error': 'broker ID is required'}, status=400)

        query = """
        WITH ref_date AS (
            SELECT transaction_date as current_date 
            FROM daily_floorsheet 
            GROUP BY transaction_date 
            HAVING COUNT(*) > 100 
            ORDER BY transaction_date DESC 
            LIMIT 1
        ),
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
        AND c.status = 'A'
        AND c."sectorName" != 'Unknown' AND c."sectorName" IS NOT NULL
        ORDER BY current_net DESC;
        """
        with connections['default'].cursor() as cursor:
            cursor.execute(query, [broker, broker, broker])
            results = [dict(zip(columns, row)) for row in cursor.fetchall()]
        return Response(results)

    @action(detail=False, methods=['get'])
    def brokers_graph(self, request):
        symbol = request.query_params.get('symbol')
        
        time_range = request.query_params.get('range', '1Y')
        if not symbol:
            return Response({'error': 'Symbol is required'}, status=400)
        
        is_all = symbol == 'All'
            
        from django.db.models import Count
        max_date_res = DailyStockPrice.objects.values('date').annotate(cnt=Count('date')).filter(cnt__gt=100).order_by('-date').first()
        today = max_date_res['date'] if max_date_res else (DailyStockPrice.objects.aggregate(Max('date'))['date__max'] or timezone.now().date())
        range_map = {'1D': 1, '1W': 7, '1M': 30, '1Y': 365, 'ALL': 3650}
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
            'data': sorted_data, 
            'brokers': top_brokers,
            'buy_leaders': buy_leaders,
            'sell_leaders': sell_leaders
        })

    @action(detail=False, methods=['get'])
    def accumulation_brokers(self, request):
        """
        Return list of active brokers for accumulation filtering.
        """
        brokers = DailyFloorsheet.objects.values_list('buyer_id', flat=True).distinct().order_by('buyer_id')
        # Also include sellers if needed, but buyers covers most active
        return Response(list(brokers))
