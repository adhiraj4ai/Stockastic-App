from typing import Dict, Any, List
from django.db import connections
from .base import BaseTool, ToolParameter

class GetStockAccumulationTool(BaseTool):
    """Get accumulation analysis for a specific stock"""
    
    @property
    def name(self) -> str:
        return "get_stock_accumulation"
    
    @property
    def description(self) -> str:
        return "Analyze broker accumulation for a specific stock. Shows top buyers and sellers over a period."
    
    @property
    def parameters(self) -> List[ToolParameter]:
        return [
            ToolParameter(name="symbol", type="string", description="Stock symbol (e.g., NABIL)", required=True),
            ToolParameter(name="days", type="number", description="Analysis period in days (default 7)", required=False),
        ]
    
    def execute(self, user, symbol: str, days: int = 7) -> Dict[str, Any]:
        
        # We need to calculate the change in cumulative_net over the period
        query = f"""
        WITH latest_date AS (
            SELECT MAX(transaction_date) as max_date 
            FROM daily_cumulative_accumulation 
            WHERE symbol = %s
        ),
        start_date AS (
            SELECT (max_date - INTERVAL '{days} days')::date as min_date
            FROM latest_date
        ),
        latest_pos AS (
            SELECT entity_id, cumulative_net
            FROM daily_cumulative_accumulation, latest_date
            WHERE symbol = %s AND transaction_date = latest_date.max_date
        ),
        start_pos AS (
            SELECT entity_id, cumulative_net
            FROM daily_cumulative_accumulation, start_date
            WHERE symbol = %s AND transaction_date <= start_date.min_date
            ORDER BY transaction_date DESC
            LIMIT 1
             -- Note: This start_pos logic is slightly flawed if there are multiple brokers. 
             -- Better approach: Calculate delta for each broker.
        ),
        broker_deltas AS (
            SELECT 
                l.entity_id,
                l.cumulative_net as current_holding,
                COALESCE(s.cumulative_net, 0) as start_holding,
                (l.cumulative_net - COALESCE(s.cumulative_net, 0)) as net_change
            FROM latest_pos l
            LEFT JOIN (
                SELECT entity_id, cumulative_net, transaction_date
                FROM daily_cumulative_accumulation, start_date
                WHERE symbol = %s AND transaction_date <= start_date.min_date
                -- We need the record closest to start_date for EACH broker
                AND (entity_id, transaction_date) IN (
                    SELECT entity_id, MAX(transaction_date)
                    FROM daily_cumulative_accumulation
                    WHERE symbol = %s AND transaction_date <= start_date.min_date
                    GROUP BY entity_id
                )
            ) s ON l.entity_id = s.entity_id
            WHERE (l.cumulative_net - COALESCE(s.cumulative_net, 0)) != 0
        )
        SELECT 
            entity_id as broker_id,
            current_holding,
            net_change
        FROM broker_deltas
        ORDER BY net_change DESC;
        """
        
        # Simplify: The broker.py logic tracks 'net flow' from floorsheet which is cleaner for 'accumulation' over a period.
        # But `DailyCumulativeAccumulation` is the final truth of holdings. 
        # Let's use the logic from `broker_trends` in broker.py which compares lagged cumulative_net.
        
        # Revised Query based on `broker_trends` logic roughly
        query = f"""
        WITH target_dates AS (
            SELECT 
                MAX(transaction_date) as end_date,
                (MAX(transaction_date) - INTERVAL '{days} days')::date as start_date
            FROM daily_cumulative_accumulation
            WHERE symbol = %s
        ),
        broker_changes AS (
            SELECT 
                curr.entity_id,
                curr.cumulative_net as end_net,
                prev.cumulative_net as start_net,
                (curr.cumulative_net - COALESCE(prev.cumulative_net, 0)) as net_change
            FROM daily_cumulative_accumulation curr
            JOIN target_dates td ON curr.transaction_date = td.end_date
            LEFT JOIN daily_cumulative_accumulation prev 
                ON curr.symbol = prev.symbol 
                AND curr.entity_id = prev.entity_id
                AND prev.transaction_date = (
                    SELECT MAX(transaction_date) 
                    FROM daily_cumulative_accumulation 
                    WHERE symbol = curr.symbol 
                    AND entity_id = curr.entity_id 
                    AND transaction_date <= td.start_date
                )
            WHERE curr.symbol = %s
        )
        SELECT * FROM broker_changes
        WHERE net_change != 0
        ORDER BY net_change DESC
        """
        
        try:
            with connections['default'].cursor() as cursor:
                cursor.execute(query, [symbol, symbol])
                columns = [col[0] for col in cursor.description]
                results = [dict(zip(columns, row)) for row in cursor.fetchall()]
            
            if not results:
                return {"result": f"No accumulation data found for {symbol} in the last {days} days."}

            # Process top buyers/sellers
            buyers = [r for r in results if r['net_change'] > 0][:5]
            sellers = [r for r in results if r['net_change'] < 0]
            sellers.sort(key=lambda x: x['net_change']) # ascending (most negative first)
            sellers = sellers[:5]
            
            total_accumulation = sum(r['net_change'] for r in buyers)
            total_dumping = sum(abs(r['net_change']) for r in sellers)
            
            return {
                "symbol": symbol.upper(),
                "period_days": days,
                "top_buyers": [
                    {"broker": r['entity_id'], "bought_qty": float(r['net_change']), "current_holding": float(r['end_net'])}
                    for r in buyers
                ],
                "top_sellers": [
                    {"broker": r['entity_id'], "sold_qty": float(abs(r['net_change'])), "current_holding": float(r['end_net'])}
                    for r in sellers
                ],
                "net_accumulation_volume": float(total_accumulation - total_dumping)
            }
            
        except Exception as e:
            return {"error": f"Failed to analyze accumulation: {str(e)}"}

class GetSmartMoneyAccumulationTool(BaseTool):
    """Identify 'Smart Money' accumulation trends"""
    
    @property
    def name(self) -> str:
        return "get_smart_money_accumulation"
    
    @property
    def description(self) -> str:
        return "Find stocks being accumulated by 'Smart Money' (Top Brokers/Holders)."
    
    @property
    def parameters(self) -> List[ToolParameter]:
        return [
            ToolParameter(name="sector", type="string", description="Filter by sector (e.g., 'Commercial Banks')", required=False),
            ToolParameter(name="limit", type="number", description="Number of results (default 5)", required=False),
        ]
    
    def execute(self, user, sector: str = "All", limit: int = 5) -> Dict[str, Any]:
        # This uses the sophisticated logic from BrokerViewSet.accumulation
        # It identifies Top 15 holders (Smart Money) and checks if they are buying.
        
        days = 7 # Default to 1 week analysis for "current" trends
        
        query = f"""
        WITH ref_date AS (
            SELECT transaction_date as max_date 
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
            FROM daily_cumulative_accumulation, ref_date
            WHERE transaction_date = ref_date.max_date
            AND cumulative_net > 0 
        ),
        smart_money AS (
            SELECT symbol, entity_id as broker 
            FROM ranked_holders 
            WHERE rank <= 15 -- Top 15 Holders represent Smart Money
        ),
        fs_target AS (
             SELECT (transaction_date - INTERVAL '{days} days') as start_date 
             FROM daily_floorsheet 
             WHERE transaction_date = (
                 SELECT transaction_date FROM daily_floorsheet 
                 GROUP BY transaction_date HAVING COUNT(*) > 100 
                 ORDER BY transaction_date DESC LIMIT 1
             )
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
                 SUM(bn.total_buy) as total_vol
             FROM broker_net bn
             LEFT JOIN smart_money sm ON bn.symbol = sm.symbol AND CAST(bn.broker AS VARCHAR) = sm.broker
             GROUP BY bn.symbol
        )
        SELECT 
            sa.symbol, c."companyName" as name, c."sectorName" as sector,
            sa.smart_net_qty as net_qty,
            sa.total_vol as total_vol,
            COALESCE(dsp.close, 0) as close
        FROM symbol_agg sa
        INNER JOIN companies c ON sa.symbol = c.symbol
        LEFT JOIN (
            SELECT DISTINCT ON (symbol) symbol, close 
            FROM daily_stock_price 
            ORDER BY symbol, transaction_date DESC
        ) dsp ON sa.symbol = dsp.symbol
        WHERE c."instrumentType" NOT IN ('Mutual Funds', 'Non-Convertible Debentures')
        {"" if not sector or sector.lower() == 'all' else f"AND c.\"sectorName\" = '{sector}'"}
        ORDER BY net_qty DESC
        LIMIT {limit};
        """
        
        try:
            with connections['default'].cursor() as cursor:
                cursor.execute(query)
                columns = [col[0] for col in cursor.description]
                results = [dict(zip(columns, row)) for row in cursor.fetchall()]
            
            return {
                "Title": "Smart Money Accumulation (Top 15 Holders Activity)",
                "Period": "Last 7 Days",
                "Results": [
                    {
                        "symbol": r['symbol'], 
                        "name": r['name'], 
                        "sector": r['sector'],
                        "smart_money_net_quantity": float(r['net_qty']),
                        "last_price": float(r['close'])
                    } 
                    for r in results
                ]
            }
        except Exception as e:
            return {"error": f"Failed to analyze smart money: {str(e)}"}
