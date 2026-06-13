from __future__ import annotations

import logging
from datetime import date

logger = logging.getLogger(__name__)


class SmartCrossoverGenerator:
    source_key = 'SMART_CROSSOVER'

    def generate(self) -> list[dict]:
        from stocks.views.recommendations import SmartAccumulatedCrossoverRecommendationEngine

        signals = []
        try:
            engine = SmartAccumulatedCrossoverRecommendationEngine()
            recommendations = engine.execute()
            today = date.today()
            for rec in recommendations:
                signals.append(self._to_signal(rec, today))
        except Exception as e:
            logger.error(f"Smart Crossover signal generation error: {e}")
        return signals

    def _to_signal(self, rec: dict, today: date) -> dict:
        return {
            'symbol': rec['symbol'],
            'signal': rec['signal'],
            'signal_tier': 'Smart Crossover',
            'strength': rec.get('strength', 0),
            'ltp': rec.get('close', 0),
            'rationale': rec.get('reason', ''),
            'generated_date': today,
            'metadata': {
                'rsi': rec.get('rsi'),
                'macd_hist': rec.get('macd_hist'),
                'crossover_date': rec.get('crossover_date', ''),
                'crossover_price': rec.get('crossover_price', 0),
            },
        }
