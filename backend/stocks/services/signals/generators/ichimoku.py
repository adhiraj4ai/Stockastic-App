from __future__ import annotations

import logging
from datetime import date

logger = logging.getLogger(__name__)


class IchimokuGenerator:
    source_key = 'ICHIMOKU'

    def generate(self) -> list[dict]:
        from stocks.views.recommendations import IchimokuAccumulationRecommendationEngine

        signals = []
        try:
            engine = IchimokuAccumulationRecommendationEngine()
            recommendations = engine.execute()
            today = date.today()
            for rec in recommendations:
                signals.append(self._to_signal(rec, today))
        except Exception as e:
            logger.error(f"Ichimoku signal generation error: {e}")
        return signals

    def _to_signal(self, rec: dict, today: date) -> dict:
        return {
            'symbol': rec['symbol'],
            'signal': rec['signal'],
            'signal_tier': rec.get('cloud_status', 'Ichimoku'),
            'strength': rec.get('strength', 0),
            'ltp': rec.get('close', 0),
            'rationale': rec.get('reason', ''),
            'generated_date': today,
            'metadata': {
                'rsi': rec.get('rsi'),
                'macd_hist': rec.get('macd_hist'),
                'cloud_status': rec.get('cloud_status', ''),
            },
        }
