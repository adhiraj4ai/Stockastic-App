"""
Signal Generation Service

Orchestrates generation of all signal types and persists them to SignalEpisode via ingest_reading.
Called by the `generate_all_signals` management command, which is triggered via pipeline.
"""

import logging
from datetime import date
from .signal_episode.service import ingest_reading
from .signal_episode.adapters import engine_reading
from stocks.services.signals import default_orchestrator

logger = logging.getLogger(__name__)

_WAC_SL_BUFFER = 0.98
_LTP_SL_BUFFER = 0.95
_TP1 = 1.05
_TP2 = 1.10
_TP3 = 1.15
_SELL_TP1 = 0.95
_SELL_TP2 = 0.90
_SELL_TP3 = 0.85
_SELL_SL = 1.05


class SignalGenerationService:
    """Generates and stores signals from all sources."""

    @staticmethod
    def generate_all(progress_callback=None) -> int:
        """Delegate all signal generation to the registered orchestrator."""
        return default_orchestrator.generate_all(progress_callback)

    @staticmethod
    def _build_price_levels(sig: dict, ltp: float) -> dict:
        """Compute TP1/TP2/TP3/SL levels for a signal dict given a last-traded price."""
        if ltp <= 0:
            return {}
        if sig['signal'] == 'BUY':
            wac = sig.get('metadata', {}).get('top_broker_wac', 0)
            sl = round(wac * _WAC_SL_BUFFER, 2) if (wac > 0 and wac < ltp) else round(ltp * _LTP_SL_BUFFER, 2)
            return {
                'tp1': round(ltp * _TP1, 2),
                'tp2': round(ltp * _TP2, 2),
                'tp3': round(ltp * _TP3, 2),
                'sl': sl,
            }
        if sig['signal'] == 'SELL':
            return {
                'tp1': round(ltp * _SELL_TP1, 2),
                'tp2': round(ltp * _SELL_TP2, 2),
                'tp3': round(ltp * _SELL_TP3, 2),
                'sl': round(ltp * _SELL_SL, 2),
            }
        return {}

    @staticmethod
    def _persist_one(source: str, sig: dict, today) -> bool:
        """Persist a single signal dict. Returns True on success, False on any error."""
        try:
            ltp = float(sig.get('ltp', 0))
            metadata = dict(sig.get('metadata', {}))
            levels = SignalGenerationService._build_price_levels(sig, ltp)
            metadata.update(levels)
            tp2 = levels.get('tp2', sig.get('target_price'))
            sl = levels.get('sl', sig.get('stop_loss_price'))
            reading = engine_reading(
                d=sig.get('generated_date', today), signal=sig['signal'], ltp=ltp,
                strength=sig.get('strength', 0), tier=sig.get('signal_tier', ''),
                rationale=sig.get('rationale', ''), target=tp2, stop=sl, metadata=metadata,
            )
            ingest_reading(source=source, strategy=None, symbol=sig['symbol'], reading=reading)
            return True
        except Exception as e:
            logger.error(f"Failed to save signal for {sig.get('symbol')}: {e}")
            return False

    @classmethod
    def _persist_signals(cls, source: str, signals: list) -> int:
        """Persist a list of signal dicts to SignalEpisode. Returns count saved."""
        today = date.today()
        return sum(1 for sig in signals if cls._persist_one(source, sig, today))


# ---------------------------------------------------------------------------
# Backward-compat shim — new code should use signals.default_orchestrator
# ---------------------------------------------------------------------------
def generate_all_signals(progress_callback=None):
    """Legacy entry-point. Prefer signals.default_orchestrator.generate_all()."""
    from .signals import default_orchestrator
    return default_orchestrator.generate_all(progress_callback=progress_callback)
