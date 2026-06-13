from __future__ import annotations

import logging
from datetime import date

logger = logging.getLogger(__name__)

_SOURCE_MAP = {
    "pa_buy": "PRICE_ACTION", "pa_sell": "PRICE_ACTION",
    "mr_buy": "MEAN_REVERSAL", "mr_sell": "MEAN_REVERSAL",
    "rsi_bull_div": "RSI_DIVERGENCE", "rsi_bear_div": "RSI_DIVERGENCE",
    "macd_bull_div": "MACD_DIVERGENCE", "macd_bear_div": "MACD_DIVERGENCE",
    "dow_buy": "DOW_SIGNAL", "dow_sell": "DOW_SIGNAL",
}


class InstitutionalAlertsGenerator:
    """
    Consolidated scanner for institutional signal types.
    generate() returns a dict keyed by sub-source (not a plain list).
    The orchestrator handles dict returns via isinstance(result, dict) in _run_one.
    """

    source_key = 'INSTITUTIONAL_ALERTS'

    def generate(self) -> dict:
        from stocks.models import Company
        from stocks.analytics.signal_scanner import MarketSignalScanner

        grouped_results: dict[str, list] = {src: [] for src in set(_SOURCE_MAP.values())}

        try:
            tickers = self._fetch_tickers(Company)
            scanner = MarketSignalScanner(tickers[:250])
            all_scan_results = scanner.scan_all()
            today = date.today()
            self._populate(grouped_results, all_scan_results, today)
        except Exception as e:
            logger.error(f"Institutional alerts generation error: {e}")

        return grouped_results

    def _fetch_tickers(self, Company) -> list:
        tickers = list(Company.objects.values_list('symbol', flat=True))
        if not tickers:
            tickers = list(Company.all_objects.values_list('symbol', flat=True))
        return tickers

    def _populate(self, grouped_results: dict, scan_results: dict, today: date) -> None:
        for key, symbols in scan_results.items():
            source = _SOURCE_MAP.get(key)
            if not source:
                continue
            signal_type = "BUY" if ("buy" in key or "bull" in key or "long" in key) else "SELL"
            for symbol in symbols:
                grouped_results[source].append(self._make_signal(symbol, signal_type, key, today))

    def _make_signal(self, symbol: str, signal_type: str, key: str, today: date) -> dict:
        return {
            'symbol': symbol,
            'signal': signal_type,
            'signal_tier': key.replace('_', ' ').title(),
            'strength': 75,
            'rationale': f"Institutional {key.replace('_', ' ')} detected via automated scanner.",
            'generated_date': today,
            'metadata': {'scan_key': key},
        }
