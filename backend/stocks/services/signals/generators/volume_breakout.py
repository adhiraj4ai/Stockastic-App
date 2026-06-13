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
floorsheet_ref AS (
    SELECT transaction_date as latest_fs_date
    FROM daily_floorsheet
    {where_val}
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
today_inst_vol AS (
    SELECT
        df.symbol,
        SUM(CASE WHEN sm_b.broker IS NOT NULL THEN df.transaction_quantity ELSE 0 END) as inst_buy_vol,
        SUM(CASE WHEN sm_s.broker IS NOT NULL THEN df.transaction_quantity ELSE 0 END) as inst_sell_vol,
        SUM(df.transaction_quantity) as total_vol
    FROM daily_floorsheet df
    INNER JOIN floorsheet_ref fr ON df.transaction_date = fr.latest_fs_date
    LEFT JOIN smart_money sm_b ON df.symbol = sm_b.symbol AND df.buyer_id::text = sm_b.broker
    LEFT JOIN smart_money sm_s ON df.symbol = sm_s.symbol AND df.seller_id::text = sm_s.broker
    GROUP BY df.symbol
),
avg_vol AS (
    SELECT symbol, AVG(volume) as avg_vol_20d
    FROM (
        SELECT symbol, volume,
               ROW_NUMBER() OVER (PARTITION BY symbol ORDER BY transaction_date DESC) as rn
        FROM daily_stock_price
        {where_val}
    ) sub WHERE rn <= 20
    GROUP BY symbol
),
latest_price AS (
    SELECT DISTINCT ON (symbol) symbol, close,
           LAG(close, 1) OVER (PARTITION BY symbol ORDER BY transaction_date) as prev_close
    FROM daily_stock_price
    {where_val}
    ORDER BY symbol, transaction_date DESC
)
SELECT
    tiv.symbol, c."companyName" as name, c."sectorName" as sector,
    tiv.inst_buy_vol, tiv.inst_sell_vol, tiv.total_vol,
    av.avg_vol_20d,
    lp.close as ltp, lp.prev_close,
    ROUND(tiv.total_vol / NULLIF(av.avg_vol_20d, 0), 2) as vol_ratio
FROM today_inst_vol tiv
INNER JOIN companies c ON tiv.symbol = c.symbol
INNER JOIN avg_vol av ON tiv.symbol = av.symbol
INNER JOIN latest_price lp ON tiv.symbol = lp.symbol
WHERE c."instrumentType" NOT IN ('Mutual Funds', 'Non-Convertible Debentures')
AND c.status = 'A'
AND av.avg_vol_20d > 0
AND tiv.total_vol > av.avg_vol_20d * 2
ORDER BY vol_ratio DESC;
"""


class VolumeBreakoutGenerator:
    source_key = 'VOLUME_BREAKOUT'

    def generate(self) -> list[dict]:
        return self._run(target_date=None)

    def generate_for_date(self, target_date=None) -> list[dict]:
        return self._run(target_date=target_date)

    def _run(self, target_date=None) -> list[dict]:
        where_val = "WHERE transaction_date <= %s" if target_date else ""
        query = _QUERY_TPL.format(where_val=where_val)
        params = [target_date] * 4 if target_date else []

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
            logger.error(f"Volume Breakout signal generation error: {e}")
        return signals

    def _classify(self, row: dict, today) -> dict | None:
        ltp = float(row['ltp'] or 0)
        if ltp <= 0:
            return None
        prev_close = float(row['prev_close'] or ltp)
        inst_buy = float(row['inst_buy_vol'] or 0)
        inst_sell = float(row['inst_sell_vol'] or 0)
        vol_ratio = float(row['vol_ratio'] or 0)
        price_change = ((ltp - prev_close) / prev_close) * 100 if prev_close > 0 else 0
        inst_net = inst_buy - inst_sell
        signal_type, tier, strength, rationale = self._tier(inst_net, price_change, vol_ratio)
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
            'metadata': self._metadata(row, vol_ratio, inst_buy, inst_sell, inst_net, price_change),
        }

    def _metadata(self, row, vol_ratio, inst_buy, inst_sell, inst_net, price_change) -> dict:
        return {
            'name': row.get('name', ''),
            'sector': row.get('sector', ''),
            'vol_ratio': vol_ratio,
            'inst_buy_vol': inst_buy,
            'inst_sell_vol': inst_sell,
            'inst_net': inst_net,
            'price_change_1d': round(price_change, 2),
        }

    def _tier(self, inst_net, price_change, vol_ratio):
        if inst_net > 0 and price_change > 0:
            tier = 'Volume Breakout' if vol_ratio >= 3 else 'Volume Surge'
            strength = min(95, 70 + int(vol_ratio * 5))
            rationale = f"Volume {vol_ratio:.1f}x above 20D avg with institutional net buying and {price_change:+.1f}% price move."
            return 'BUY', tier, strength, rationale
        if inst_net < 0 and price_change < 0:
            tier = 'Volume Breakdown' if vol_ratio >= 3 else 'Volume Sell-off'
            strength = min(90, 65 + int(vol_ratio * 5))
            rationale = f"Volume {vol_ratio:.1f}x above 20D avg with institutional net selling and {price_change:.1f}% price drop."
            return 'SELL', tier, strength, rationale
        return None, '', 0, ''
