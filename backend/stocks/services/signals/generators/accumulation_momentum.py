from __future__ import annotations

import logging
from datetime import date
from django.db import connections

logger = logging.getLogger(__name__)

_QUERY = """
WITH accumulation_ref AS (
    SELECT transaction_date as latest_acc_date
    FROM daily_cumulative_accumulation
    GROUP BY transaction_date HAVING COUNT(*) > 100
    ORDER BY transaction_date DESC LIMIT 1
),
ranked_holders AS (
    SELECT symbol, entity_id,
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
        (ca.cumulative_net - LAG(ca.cumulative_net, 5) OVER w) as net_5d,
        (ca.cumulative_net - LAG(ca.cumulative_net, 10) OVER w) as net_10d,
        (ca.cumulative_net - LAG(ca.cumulative_net, 20) OVER w) as net_20d,
        ROUND(ca.cumulative_buy_amount / NULLIF(ca.cumulative_buy, 0), 2) as wac,
        ca.transaction_date
    FROM daily_cumulative_accumulation ca
    WINDOW w AS (PARTITION BY ca.symbol, ca.entity_id ORDER BY ca.transaction_date)
),
latest_delta AS (
    SELECT bd.* FROM broker_delta bd, accumulation_ref
    WHERE bd.transaction_date = accumulation_ref.latest_acc_date
),
symbol_momentum AS (
    SELECT
        ld.symbol,
        SUM(CASE WHEN sm.broker IS NOT NULL THEN ld.net_5d ELSE 0 END) as inst_net_5d,
        SUM(CASE WHEN sm.broker IS NOT NULL THEN ld.net_10d ELSE 0 END) as inst_net_10d,
        SUM(CASE WHEN sm.broker IS NOT NULL THEN ld.net_20d ELSE 0 END) as inst_net_20d,
        MAX(ld.wac) FILTER (WHERE sm.broker IS NOT NULL) as top_broker_wac,
        ROUND(SUM(CASE WHEN sm.broker IS NOT NULL THEN ld.net_5d ELSE 0 END) / 5.0) as pace_5d,
        ROUND(SUM(CASE WHEN sm.broker IS NOT NULL THEN ld.net_10d ELSE 0 END) / 10.0) as pace_10d
    FROM latest_delta ld
    LEFT JOIN smart_money sm ON ld.symbol = sm.symbol AND ld.broker = sm.broker
    GROUP BY ld.symbol
),
latest_price AS (
    SELECT DISTINCT ON (symbol) symbol, close
    FROM daily_stock_price ORDER BY symbol, transaction_date DESC
)
SELECT
    sm.symbol, c."companyName" as name, c."sectorName" as sector,
    sm.inst_net_5d, sm.inst_net_10d, sm.inst_net_20d,
    sm.pace_5d, sm.pace_10d, sm.top_broker_wac,
    lp.close as ltp
FROM symbol_momentum sm
INNER JOIN companies c ON sm.symbol = c.symbol
INNER JOIN latest_price lp ON sm.symbol = lp.symbol
WHERE c."instrumentType" NOT IN ('Mutual Funds', 'Non-Convertible Debentures')
AND c.status = 'A'
AND sm.pace_10d != 0
AND ABS(sm.inst_net_5d) > 20000
ORDER BY ABS(sm.pace_5d) DESC;
"""


class AccumulationMomentumGenerator:
    source_key = 'ACC_MOMENTUM'

    def generate(self) -> list[dict]:
        signals = []
        try:
            with connections['default'].cursor() as cursor:
                cursor.execute(_QUERY)
                columns = [col[0] for col in cursor.description]
                raw = [dict(zip(columns, row)) for row in cursor.fetchall()]
            today = date.today()
            for row in raw:
                sig = self._classify(row, today)
                if sig:
                    signals.append(sig)
        except Exception as e:
            logger.error(f"Accumulation Momentum signal generation error: {e}")
        return signals

    def _classify(self, row: dict, today: date) -> dict | None:
        ltp = float(row['ltp'] or 0)
        pace_10d = float(row['pace_10d'] or 0)
        if ltp <= 0 or pace_10d == 0:
            return None
        pace_5d = float(row['pace_5d'] or 0)
        net_5d = float(row['inst_net_5d'] or 0)
        accel_ratio = pace_5d / pace_10d
        if abs(accel_ratio) < 1.5:
            return None
        signal_type, tier, strength, rationale = self._tier(net_5d, accel_ratio)
        if not signal_type:
            return None
        return {
            'symbol': row['symbol'],
            'signal': signal_type,
            'signal_tier': tier,
            'strength': strength,
            'ltp': ltp,
            'rationale': rationale,
            'generated_date': today,
            'metadata': self._metadata(row, net_5d, pace_5d, pace_10d, accel_ratio),
        }

    def _metadata(self, row: dict, net_5d, pace_5d, pace_10d, accel_ratio) -> dict:
        return {
            'name': row.get('name', ''),
            'sector': row.get('sector', ''),
            'inst_net_5d': net_5d,
            'inst_net_10d': float(row.get('inst_net_10d', 0)),
            'pace_5d': pace_5d,
            'pace_10d': pace_10d,
            'accel_ratio': round(accel_ratio, 2),
            'top_broker_wac': float(row.get('top_broker_wac') or 0),
        }

    def _tier(self, net_5d, accel_ratio):
        if net_5d > 0:
            if accel_ratio >= 2.5:
                return ('BUY', 'Surge Accumulation', 90,
                        f"Accumulation pace accelerating {accel_ratio:.1f}x (5D vs 10D avg). {int(net_5d):,} net shares in 5D.")
            if accel_ratio >= 2.0:
                return ('BUY', 'Accelerating Accumulation', 80,
                        f"Accumulation pace accelerating {accel_ratio:.1f}x (5D vs 10D avg). {int(net_5d):,} net shares in 5D.")
            return ('BUY', 'Building Momentum', 68,
                    f"Accumulation pace accelerating {accel_ratio:.1f}x (5D vs 10D avg). {int(net_5d):,} net shares in 5D.")
        if net_5d < 0:
            if accel_ratio >= 2.5:
                return ('SELL', 'Surge Distribution', 85,
                        f"Distribution pace accelerating {accel_ratio:.1f}x (5D vs 10D avg). {abs(int(net_5d)):,} net shares sold in 5D.")
            if accel_ratio >= 2.0:
                return ('SELL', 'Accelerating Sell-off', 75,
                        f"Distribution pace accelerating {accel_ratio:.1f}x (5D vs 10D avg). {abs(int(net_5d)):,} net shares sold in 5D.")
            return ('SELL', 'Increasing Pressure', 63,
                    f"Distribution pace accelerating {accel_ratio:.1f}x (5D vs 10D avg). {abs(int(net_5d)):,} net shares sold in 5D.")
        return None, '', 0, ''
