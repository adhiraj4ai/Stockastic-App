from __future__ import annotations

import logging
from datetime import date
from django.db import connections

logger = logging.getLogger(__name__)

_QUERY_TPL = """
WITH accumulation_ref AS (
    SELECT transaction_date as latest_acc_date
    FROM daily_cumulative_accumulation
    {where_val}
    GROUP BY transaction_date HAVING COUNT(*) > 100
    ORDER BY transaction_date DESC LIMIT 1
),
ranked_holders AS (
    SELECT symbol, entity_id, cumulative_net,
           ROW_NUMBER() OVER (PARTITION BY symbol ORDER BY cumulative_net DESC) as rank
    FROM daily_cumulative_accumulation, accumulation_ref
    WHERE transaction_date = accumulation_ref.latest_acc_date AND cumulative_net > 0
),
smart_money AS (
    SELECT symbol, entity_id as broker FROM ranked_holders WHERE rank <= 15
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
symbol_distribution AS (
    SELECT
        bd.symbol,
        COUNT(DISTINCT bd.broker) FILTER (WHERE sm.broker IS NOT NULL AND bd.net_5d < 0) as dist_count,
        SUM(CASE WHEN sm.broker IS NOT NULL THEN bd.net_5d ELSE 0 END) as inst_net_5d,
        SUM(CASE WHEN sm.broker IS NOT NULL THEN bd.net_20d ELSE 0 END) as inst_net_20d,
        MAX(bd.wac) as top_broker_wac
    FROM latest_broker_delta bd
    LEFT JOIN smart_money sm ON bd.symbol = sm.symbol AND bd.broker = sm.broker
    GROUP BY bd.symbol
),
latest_price AS (
    SELECT DISTINCT ON (symbol) symbol, close,
           LAG(close, 5) OVER (PARTITION BY symbol ORDER BY transaction_date) as close_5d
    FROM daily_stock_price
    {where_val}
    ORDER BY symbol, transaction_date DESC
)
SELECT
    sd.symbol, c."companyName" as name, c."sectorName" as sector,
    sd.dist_count, sd.inst_net_5d, sd.inst_net_20d, sd.top_broker_wac,
    lp.close as ltp, lp.close_5d
FROM symbol_distribution sd
INNER JOIN companies c ON sd.symbol = c.symbol
INNER JOIN latest_price lp ON sd.symbol = lp.symbol
WHERE c."instrumentType" NOT IN ('Mutual Funds', 'Non-Convertible Debentures')
AND c.status = 'A'
AND sd.dist_count >= 2
AND sd.inst_net_5d < -50000
ORDER BY sd.inst_net_5d ASC;
"""


class DistributionAlertGenerator:
    source_key = 'DISTRIBUTION_ALERT'

    def generate(self) -> list[dict]:
        return self._run(target_date=None)

    def _run(self, target_date=None) -> list[dict]:
        where_val = "WHERE transaction_date <= %s" if target_date else ""
        query = _QUERY_TPL.format(where_val=where_val)
        params = [target_date, target_date] if target_date else []

        signals = []
        try:
            with connections['default'].cursor() as cursor:
                cursor.execute(query, params)
                columns = [col[0] for col in cursor.description]
                raw = [dict(zip(columns, row)) for row in cursor.fetchall()]
            today = target_date or date.today()
            for row in raw:
                sig = self._classify(row, today)
                if sig:
                    signals.append(sig)
        except Exception as e:
            logger.error(f"Distribution Alert signal generation error: {e}")
        return signals

    def _classify(self, row: dict, today) -> dict | None:
        ltp = float(row['ltp'] or 0)
        if ltp <= 0:
            return None
        wac = float(row['top_broker_wac'] or 0)
        net_5d = float(row['inst_net_5d'] or 0)
        dist_count = row['dist_count']
        price_5d = float(row['close_5d'] or ltp)
        price_change = ((ltp - price_5d) / price_5d) * 100 if price_5d > 0 else 0
        markup = ((ltp - wac) / wac) * 100 if wac > 0 else 0

        tier, strength, rationale = self._tier(dist_count, markup, net_5d)
        return {
            'symbol': row['symbol'],
            'signal': 'SELL',
            'signal_tier': tier,
            'strength': strength,
            'ltp': ltp,
            'rationale': rationale,
            'generated_date': today,
            'metadata': {
                'name': row.get('name', ''),
                'sector': row.get('sector', ''),
                'dist_count': dist_count,
                'inst_net_5d': net_5d,
                'top_broker_wac': wac,
                'markup_percent': round(markup, 2),
                'price_change_5d': round(price_change, 2),
            },
        }

    def _tier(self, dist_count, markup, net_5d):
        if dist_count >= 3 and markup >= 0:
            return ('Heavy Distribution', 90,
                    f"{dist_count} institutional brokers offloading above their cost basis. Profit-taking detected.")
        if dist_count >= 2 and net_5d < -100000:
            return ('Accelerating Sell-off', 80,
                    f"Aggressive institutional selling ({dist_count} brokers, {abs(int(net_5d)):,} shares net sold in 5D).")
        return ('Distribution Warning', 65,
                f"Institutional distribution pattern: {dist_count} smart-money brokers reducing positions.")
