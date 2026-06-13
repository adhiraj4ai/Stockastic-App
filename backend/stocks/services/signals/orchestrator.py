from __future__ import annotations
import logging
from .base import ISignalGenerator

logger = logging.getLogger(__name__)


class SignalOrchestrator:
    """Iterates registered generators and persists all signals."""

    def __init__(self, generators: list[ISignalGenerator]):
        self._generators = generators

    def generate_all(self, progress_callback=None) -> int:
        total = 0
        for i, gen in enumerate(self._generators):
            if progress_callback:
                progress_callback(i + 1, len(self._generators), gen.source_key)
            total += self._run_one(gen)
        return total

    def _run_one(self, gen: ISignalGenerator) -> int:
        try:
            result = gen.generate()
            if isinstance(result, dict):
                return sum(self._persist(k, v) for k, v in result.items())
            return self._persist(gen.source_key, result)
        except Exception as exc:
            logger.error("[%s] generation failed: %s", gen.source_key, exc)
            return 0

    def _persist(self, source_key: str, signals: list) -> int:
        from ..signal_generation_service import SignalGenerationService
        return SignalGenerationService._persist_signals(source_key, signals)
