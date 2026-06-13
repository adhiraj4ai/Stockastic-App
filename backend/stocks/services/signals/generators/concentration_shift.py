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
current_holders AS (
    SELECT symbol, entity_id, cumulative_net,
           ROW_NUMBER() OVER (PARTITION BY symbol ORDER BY cumulative_net DESC) as rank
    FROM daily_cumulative_accumulation, accumulation_ref
    WHERE transaction_date = accumulation_ref.latest_acc_date AND cumulative_net > 0
),
past_ref AS (
    SELECT transaction_date as past_date
    FROM daily_cumulative_accumulation
    {where_val}
    GROUP BY transaction_date HAVING COUNT(*) > 100
    ORDER BY transaction_date DESC LIMIT 1 OFFSET 10
),
past_holders AS (
    SELECT symbol, entity_id, cumulative_net,
           ROW_NUMBER() OVER (PARTITION BY symbol ORDER BY cumulative_net DESC) as rank
    FROM daily_cumulative_accumulation, past_ref
    WHERE transaction_date = past_ref.past_date AND cumulative_net > 0
),
holder_counts AS (
    SELECT
        c.symbol,
        COUNT(DISTINCT ch.entity_id) FILTER (WHERE ch.rank <= 15) as current_count,
        COUNT(DISTINCT ph.entity_id) FILTER (WHERE ph.rank <= 15) as past_count
    FROM (SELECT DISTINCT symbol FROM current_holders WHERE rank <= 15) c
    LEFT JOIN current_holders ch ON c.symbol = ch.symbol AND ch.rank <= 15
    LEFT JOIN past_holders ph ON c.symbol = ph.symbol AND ph.rank <= 15
    GROUP BY c.symbol
),
latest_price AS (
    SELECT DISTINCT ON (symbol) symbol, close
    FROM daily_stock_price
    {where_val}
    ORDER BY symbol, transaction_date DESC
)
SELECT
    hc.symbol, co."companyName" as name, co."sectorName" as sector,
    hc.current_count, hc.past_count,
    (hc.current_count - hc.past_count) as shift,
    lp.close as ltp
FROM holder_counts hc
INNER JOIN companies co ON hc.symbol = co.symbol
INNER JOIN latest_price lp ON hc.symbol = lp.symbol
WHERE co."instrumentType" NOT IN ('Mutual Funds', 'Non-Convertible Debentures')
AND co.status = 'A'
AND ABS(hc.current_count - hc.past_count) >= 2
ORDER BY ABS(hc.current_count - hc.past_count) DESC;
"""


class ConcentrationShiftGenerator:
    source_key = 'CONCENTRATION_SHIFT'

    def generate(self) -> list[dict]:
        return self._run(target_date=None)

    def generate_for_date(self, target_date=None) -> list[dict]:
        return self._run(target_date=target_date)

    def _run(self, target_date=None) -> list[dict]:
        where_val = "WHERE transaction_date <= %s" if target_date else ""
        query = _QUERY_TPL.format(where_val=where_val)
        params = [target_date] * 3 if target_date else []

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
            logger.error(f"Concentration Shift signal generation error: {e}")
        return signals

    def _classify(self, row: dict, today) -> dict | None:
        ltp = float(row['ltp'] or 0)
        if ltp <= 0:
            return None
        shift = row['shift']
        current = row['current_count']
        past = row['past_count']

        signal_type, tier, strength, rationale = self._tier(shift, current, past)
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
            'metadata': {
                'name': row.get('name', ''),
                'sector': row.get('sector', ''),
                'current_holder_count': current,
                'past_holder_count': past,
                'shift': shift,
            },
        }

    def _tier(self, shift, current, past):
        if shift >= 3:
            return ('BUY', 'Broadening Interest', 85,
                    f"{shift} new institutional brokers entered top-15 holders in 10 days ({past}→{current}). Widening smart-money base.")
        if shift >= 2:
            return ('BUY', 'New Entrants', 70,
                    f"{shift} new smart-money brokers building positions. Holder count: {past}→{current}.")
        if shift <= -3:
            return ('SELL', 'Narrowing Interest', 80,
                    f"{abs(shift)} institutional brokers exited top-15 in 10 days ({past}→{current}). Smart money retreating.")
        if shift <= -2:
            return ('SELL', 'Holder Exit', 68,
                    f"{abs(shift)} smart-money brokers reduced to below top-15. Holder count: {past}→{current}.")
        return None, '', 0, ''
