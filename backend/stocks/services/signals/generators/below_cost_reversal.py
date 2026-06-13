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
broker_positions AS (
    SELECT
        ca.symbol, ca.entity_id as broker,
        ca.cumulative_net,
        ROUND(ca.cumulative_buy_amount / NULLIF(ca.cumulative_buy, 0), 2) as wac,
        (ca.cumulative_net - LAG(ca.cumulative_net, 5) OVER (PARTITION BY ca.symbol, ca.entity_id ORDER BY ca.transaction_date)) as net_5d,
        ca.transaction_date
    FROM daily_cumulative_accumulation ca
),
latest_positions AS (
    SELECT bp.* FROM broker_positions bp, accumulation_ref
    WHERE bp.transaction_date = accumulation_ref.latest_acc_date
),
below_cost_accumulators AS (
    SELECT
        lp.symbol,
        COUNT(DISTINCT lp.broker) FILTER (WHERE sm.broker IS NOT NULL AND lp.net_5d > 0) as accum_count,
        SUM(CASE WHEN sm.broker IS NOT NULL AND lp.net_5d > 0 THEN lp.net_5d ELSE 0 END) as accum_net_5d,
        AVG(lp.wac) FILTER (WHERE sm.broker IS NOT NULL AND lp.wac > 0) as avg_wac,
        SUM(lp.cumulative_net) FILTER (WHERE sm.broker IS NOT NULL) as total_inst_holding
    FROM latest_positions lp
    LEFT JOIN smart_money sm ON lp.symbol = sm.symbol AND lp.broker = sm.broker
    WHERE lp.cumulative_net > 10000
    GROUP BY lp.symbol
),
latest_price AS (
    SELECT DISTINCT ON (symbol) symbol, close
    FROM daily_stock_price
    {where_val}
    ORDER BY symbol, transaction_date DESC
)
SELECT
    bca.symbol, c."companyName" as name, c."sectorName" as sector,
    bca.accum_count, bca.accum_net_5d, bca.avg_wac, bca.total_inst_holding,
    lp.close as ltp
FROM below_cost_accumulators bca
INNER JOIN companies c ON bca.symbol = c.symbol
INNER JOIN latest_price lp ON bca.symbol = lp.symbol
WHERE c."instrumentType" NOT IN ('Mutual Funds', 'Non-Convertible Debentures')
AND c.status = 'A'
AND bca.avg_wac > 0
AND lp.close < bca.avg_wac
AND bca.accum_count >= 1
AND bca.accum_net_5d > 10000
ORDER BY bca.accum_count DESC, bca.accum_net_5d DESC;
"""


class BelowCostReversalGenerator:
    source_key = 'BELOW_COST_REVERSAL'

    def generate(self) -> list[dict]:
        return self._run(target_date=None)

    def generate_for_date(self, target_date=None) -> list[dict]:
        return self._run(target_date=target_date)

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
            logger.error(f"Below Cost Reversal signal generation error: {e}")
        return signals

    def _classify(self, row: dict, today) -> dict | None:
        ltp = float(row['ltp'] or 0)
        if ltp <= 0:
            return None
        wac = float(row['avg_wac'] or 0)
        accum_count = row['accum_count']
        net_5d = float(row['accum_net_5d'] or 0)
        discount = ((wac - ltp) / wac) * 100 if wac > 0 else 0

        tier, strength, rationale = self._tier(accum_count, discount)
        return {
            'symbol': row['symbol'],
            'signal': 'BUY',
            'signal_tier': tier,
            'strength': strength,
            'ltp': ltp,
            'rationale': rationale,
            'generated_date': today,
            'metadata': {
                'name': row.get('name', ''),
                'sector': row.get('sector', ''),
                'accum_count': accum_count,
                'accum_net_5d': net_5d,
                'avg_wac': wac,
                'discount_pct': round(discount, 2),
                'total_inst_holding': float(row.get('total_inst_holding', 0)),
                'top_broker_wac': wac,
            },
        }

    def _tier(self, accum_count, discount):
        if accum_count >= 3 and discount >= 5:
            return ('Deep Value Accumulation', 92,
                    f"{accum_count} institutional brokers averaging down at {discount:.1f}% below cost. Strong conviction.")
        if accum_count >= 2:
            return ('Institutional Averaging', 78,
                    f"{accum_count} smart-money brokers buying below WAC. Institutions see value at current levels.")
        return ('Below-Cost Buying', 65,
                f"Institutional accumulation continues despite price being {discount:.1f}% below avg cost.")
