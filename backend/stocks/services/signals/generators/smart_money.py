from __future__ import annotations

import logging
from datetime import date
from django.db import connections

logger = logging.getLogger(__name__)

_QUERY = """
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


class SmartMoneyGenerator:
    source_key = 'SMART_MONEY'

    def generate(self) -> list[dict]:
        signals = []
        try:
            with connections['default'].cursor() as cursor:
                cursor.execute(_QUERY)
                columns = [col[0] for col in cursor.description]
                raw_results = [dict(zip(columns, row)) for row in cursor.fetchall()]
            today = date.today()
            for row in raw_results:
                sig = self._classify(row, today)
                if sig:
                    signals.append(sig)
        except Exception as e:
            logger.error(f"Smart Money signal generation error: {e}")
        return signals

    def _classify(self, row: dict, today: date) -> dict | None:
        ltp = float(row['ltp'] or 0)
        wac = float(row['top_broker_wac'] or 0)
        net_5d = float(row['inst_net_5d'] or 0)
        clusters = row['cluster_count']
        price_5d = float(row['close_5d'] or ltp)
        price_change = ((ltp - price_5d) / price_5d) * 100 if price_5d > 0 else 0
        markup = ((ltp - wac) / wac) * 100 if wac > 0 else 0
        signal_type, signal_tier, rationale, strength = self._tier(
            clusters, markup, net_5d, price_change
        )
        if not signal_type:
            return None
        return {
            'symbol': row['symbol'],
            'signal': signal_type,
            'signal_tier': signal_tier,
            'strength': strength,
            'ltp': ltp,
            'rationale': rationale,
            'generated_date': today,
            'metadata': self._metadata(row, clusters, net_5d, wac, markup, price_change),
        }

    def _metadata(self, row, clusters, net_5d, wac, markup, price_change) -> dict:
        return {
            'name': row.get('name', ''),
            'sector': row.get('sector', ''),
            'cluster_count': clusters,
            'inst_net_5d': net_5d,
            'top_broker_wac': wac,
            'markup_percent': round(markup, 2),
            'price_change_5d': round(price_change, 2),
        }

    def _tier(self, clusters, markup, net_5d, price_change):
        if clusters >= 2 and -5 <= markup <= 5:
            return 'BUY', 'Platinum Buy', f"Institutional Clustering ({clusters} brokers) near average cost (WAC).", 95
        if clusters >= 4 or (net_5d > 200000 and price_change > 2):
            rationale = (
                f"High Institutional Clustering ({clusters} brokers) identified."
                if clusters >= 4
                else "Aggressive institutional accumulation with price momentum."
            )
            return 'BUY', 'Gold Signal', rationale, 80
        if clusters >= 2:
            return 'BUY', 'Silver Signal', f"Early institutional interest detected from {clusters} smart-money brokers.", 60
        if price_change < -3 and net_5d > 100000:
            return 'BUY', 'Bullish Divergence', "Institutional accumulation increasing despite price correction.", 75
        return None, '', '', 0
