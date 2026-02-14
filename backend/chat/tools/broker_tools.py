from typing import Dict, Any, List
from django.db import connections
from .base import BaseTool, ToolParameter

class GetBrokerPortfolioTool(BaseTool):
    """Get the top holdings of a specific broker"""
    
    @property
    def name(self) -> str:
        return "get_broker_portfolio"
    
    @property
    def description(self) -> str:
        return "Retrieve the top holdings and portfolio distribution for a specific broker ID."
    
    @property
    def parameters(self) -> List[ToolParameter]:
        return [
            ToolParameter(name="broker_id", type="number", description="The ID of the broker (e.g., 58 for Naasa)", required=True),
        ]
    
    def execute(self, user, broker_id: int) -> Dict[str, Any]:
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
        ORDER BY value DESC
        LIMIT 20;
        """
        try:
            with connections['default'].cursor() as cursor:
                cursor.execute(query, [str(broker_id)])
                columns = [col[0] for col in cursor.description]
                results = [dict(zip(columns, row)) for row in cursor.fetchall()]
            
            if not results:
                return {"message": f"No portfolio data found for broker {broker_id}"}
                
            return {
                "broker_id": broker_id,
                "holdings": [
                    {
                        "symbol": r['symbol'],
                        "name": r['name'],
                        "quantity": float(r['quantity']),
                        "current_price": float(r['current_price'] or 0),
                        "market_value": float(r['value'] or 0)
                    }
                    for r in results
                ]
            }
        except Exception as e:
            return {"error": f"Failed to fetch broker portfolio: {str(e)}"}

class GetBrokerTopPicksTool(BaseTool):
    """Get stocks a broker has been accumulating most heavily recently"""
    
    @property
    def name(self) -> str:
        return "get_broker_top_picks"
    
    @property
    def description(self) -> str:
        return "Find the stocks a specific broker has been accumulating most aggressively in the last 30 days."
    
    @property
    def parameters(self) -> List[ToolParameter]:
        return [
            ToolParameter(name="broker_id", type="number", description="Broker ID", required=True),
        ]
    
    def execute(self, user, broker_id: int) -> Dict[str, Any]:
        # Implementation based on 'favorites' logic in broker.py
        query = """
        WITH ref_date AS (
            SELECT MAX(transaction_date) as current_date FROM daily_floorsheet
        ),
        broker_activity AS (
            SELECT symbol, transaction_date, transaction_quantity as net_qty
            FROM daily_floorsheet WHERE buyer_id = %s
            UNION ALL
            SELECT symbol, transaction_date, -transaction_quantity as net_qty
            FROM daily_floorsheet WHERE seller_id = %s
        ),
        monthly_stats AS (
            SELECT 
                ba.symbol,
                SUM(ba.net_qty) as flow_1m
            FROM broker_activity ba, ref_date rd
            WHERE ba.transaction_date > (rd.current_date - INTERVAL '1 month')
            GROUP BY ba.symbol
            HAVING SUM(ba.net_qty) > 0
        )
        SELECT 
            m.symbol, c."companyName" as name, m.flow_1m as net_bought_30d
        FROM monthly_stats m
        INNER JOIN companies c ON m.symbol = c.symbol
        ORDER BY net_bought_30d DESC
        LIMIT 10;
        """
        try:
            with connections['default'].cursor() as cursor:
                cursor.execute(query, [broker_id, broker_id])
                columns = [col[0] for col in cursor.description]
                results = [dict(zip(columns, row)) for row in cursor.fetchall()]
            
            return {
                "broker_id": broker_id,
                "top_accumulated_30d": [
                    {"symbol": r['symbol'], "name": r['name'], "net_qty": float(r['net_bought_30d'])}
                    for r in results
                ]
            }
        except Exception as e:
            return {"error": str(e)}

class GetBrokerTrendsTool(BaseTool):
    """Get general broker trends and rankings"""
    
    @property
    def name(self) -> str:
        return "get_broker_trends"
    
    @property
    def description(self) -> str:
        return "Get rankings of brokers based on their recent accumulation trends (Increasing holders vs Decreasing)."
    
    @property
    def parameters(self) -> List[ToolParameter]:
        return []
    
    def execute(self, user) -> Dict[str, Any]:
        # Based on broker_trends logic in broker.py
        query = """
        WITH latest_date AS (
            SELECT MAX(transaction_date) FROM daily_cumulative_accumulation
        ),
        trend_data AS (
            SELECT 
                entity_id as broker,
                SUM(CASE WHEN cumulative_net > LAG(cumulative_net, 5) OVER (PARTITION BY symbol, entity_id ORDER BY transaction_date) THEN 1 ELSE 0 END) as increasing_signals,
                SUM(CASE WHEN cumulative_net < LAG(cumulative_net, 5) OVER (PARTITION BY symbol, entity_id ORDER BY transaction_date) THEN 1 ELSE 0 END) as decreasing_signals
            FROM daily_cumulative_accumulation
            WHERE transaction_date = (SELECT * FROM latest_date)
            GROUP BY entity_id
        )
        SELECT broker, increasing_signals, decreasing_signals, 
               (increasing_signals - decreasing_signals) as net_sentiment
        FROM trend_data
        ORDER BY net_sentiment DESC
        LIMIT 15;
        """
        try:
            with connections['default'].cursor() as cursor:
                cursor.execute(query)
                columns = [col[0] for col in cursor.description]
                results = [dict(zip(columns, row)) for row in cursor.fetchall()]
            
            return {"top_trending_brokers": results}
        except Exception as e:
            return {"error": str(e)}
