"""
SmartAccumulatedCrossoverRecommendationEngine — combines broker accumulation data
with Smart Crossover (EMA + MACD + BB) signals.
"""
import logging
from datetime import datetime, timedelta
from typing import Dict, List, Optional

import pandas as pd
import talib

from ...models import DailyStockPrice
from .shared_helpers import (
    _accumulated_symbol_universe,
    _parse_target_date,
    _load_symbol_ohlcv,
    _select_analysis_row,
)

logger = logging.getLogger(__name__)


class SmartAccumulatedCrossoverRecommendationEngine:
    """
    Combines Broker Accumulation Data with Smart Crossover (EMA + MACD + BB).
    Universe: Only symbols present in DailyCumulativeAccumulation.
    Logic:
        BUY: MACD Hist > 0 AND 20 <= RSI <= 75 AND EMA_9 > EMA_26
        SELL: MACD Hist < 0 AND EMA_9 < EMA_26 AND Close < BB_Lower
    """

    @staticmethod
    def _coerce_numeric(df: pd.DataFrame) -> None:
        """Coerce OHLCV columns to numeric in place."""
        for col in ['close', 'high', 'low', 'volume']:
            if col in df.columns:
                df[col] = pd.to_numeric(df[col], errors='coerce')

    def _compute_indicators(self, df: pd.DataFrame) -> pd.DataFrame:
        """Attach EMA9/26, MACD, BB, RSI to the dataframe."""
        if df.empty:
            return df
        self._coerce_numeric(df)
        close = df['close'].values.astype(float)
        df['ema_9'] = talib.EMA(close, timeperiod=9)
        df['ema_26'] = talib.EMA(close, timeperiod=26)
        macd, macdsignal, macdhist = talib.MACD(close, fastperiod=12, slowperiod=26, signalperiod=9)
        df['macd'] = macd
        df['macd_signal'] = macdsignal
        df['macd_hist'] = macdhist
        upper, middle, lower = talib.BBANDS(close, timeperiod=20, nbdevup=2, nbdevdn=2, matype=0)
        df['bb_upper'] = upper
        df['bb_middle'] = middle
        df['bb_lower'] = lower
        df['rsi'] = talib.RSI(close, timeperiod=14)
        return df

    @staticmethod
    def _macd_strength_points(abs_hist: float) -> int:
        """Return strength score contribution from MACD histogram magnitude."""
        if abs_hist > 2.0:
            return 3
        if abs_hist > 1.0:
            return 2
        if abs_hist > 0.5:
            return 1
        return 0

    @staticmethod
    def _ema_strength_points(ema_diff: float, close: float) -> int:
        """Return strength score contribution from EMA spread."""
        if abs(ema_diff) > (close * 0.02):
            return 2
        if abs(ema_diff) > (close * 0.01):
            return 1
        return 0

    def _calculate_signal_strength(self, row, signal_type) -> float:
        """Calculate strength score (0-100) based on signal components."""
        macd_hist = row.get('macd_hist', 0)
        close = row.get('close', 0)
        score = self._macd_strength_points(abs(macd_hist))
        if (signal_type == 'BUY' and macd_hist > 0) or (signal_type == 'SELL' and macd_hist < 0):
            score += 1
        ema_diff = (row.get('ema_9', 0) or 0) - (row.get('ema_26', 0) or 0)
        score += self._ema_strength_points(ema_diff, close)
        if signal_type == 'BUY' and close > row.get('bb_lower', 0):
            score += 2
        return score

    @staticmethod
    def _evaluate_signal(row):
        """Return (signal_type, reason_list) for a Smart Crossover row."""
        macd_hist = row.get('macd_hist', 0) or 0
        rsi = row.get('rsi', 50) or 50
        ema_9 = row.get('ema_9', 0) or 0
        ema_26 = row.get('ema_26', 0) or 0
        close = row.get('close', 0)
        bb_lower = row.get('bb_lower', 0) or 0
        if (macd_hist > 0) and (20 <= rsi <= 75) and (ema_9 > ema_26):
            return 'BUY', ["Bullish MACD, RSI healthy, EMA Golden Cross"]
        if (macd_hist < 0) and (ema_9 < ema_26) and (close < bb_lower):
            return 'SELL', ["Bearish MACD, EMA Death Cross, Price below BB Lower"]
        return None, []

    def _find_crossover(self, df: pd.DataFrame, row, signal_type):
        """Walk back to the start of the current signal run; return (date, price)."""
        crossover_date, crossover_price = row.name, float(row.get('close', 0))
        if len(df) <= 1:
            return crossover_date, crossover_price
        current_idx = df.index.get_loc(row.name)
        for i in range(current_idx - 1, -1, -1):
            prev_row = df.iloc[i]
            p_signal, _ = self._evaluate_signal(prev_row)
            if p_signal != signal_type:
                break
            crossover_date = prev_row.name
            crossover_price = float(prev_row.get('close', 0))
        return crossover_date, crossover_price

    def _build_recommendation(self, symbol, df, row, signal_type, reason):
        """Assemble a single Smart Crossover recommendation dict."""
        rsi = row.get('rsi', 50) or 50
        macd_hist = row.get('macd_hist', 0) or 0
        close = row.get('close', 0)
        crossover_date, crossover_price = self._find_crossover(df, row, signal_type)
        strength = min(100, (self._calculate_signal_strength(row, signal_type) / 8) * 100)
        return {
            'symbol': symbol,
            'signal': signal_type,
            'strength': round(strength, 1),
            'reason': "; ".join(reason),
            'close': float(close),
            'date': row.name.strftime('%Y-%m-%d'),
            'crossover_date': crossover_date.strftime('%Y-%m-%d'),
            'crossover_price': crossover_price,
            'rsi': round(float(rsi), 1),
            'macd_hist': round(float(macd_hist), 2),
        }

    def _analyze_symbol(self, symbol, start_date, target_date_obj):
        """Return a recommendation for the symbol, or None when no signal fires."""
        df = _load_symbol_ohlcv(symbol, start_date)
        if df.empty or len(df) < 30:
            return None
        df = self._compute_indicators(df)
        row = _select_analysis_row(df, target_date_obj)
        if row is None:
            return None
        signal_type, reason = self._evaluate_signal(row)
        if not signal_type:
            return None
        return self._build_recommendation(symbol, df, row, signal_type, reason)

    def execute(self, transaction_date=None, sector=None):
        """Return sorted recommendations for accumulated symbols."""
        threshold = 50000
        accumulated_symbols, latest_acc_date = _accumulated_symbol_universe(threshold, sector)
        if not latest_acc_date:
            logger.warning("No accumulation data found at all.")
            return []
        if not accumulated_symbols:
            logger.info("No accumulated symbols found after filtering.")
            return []
        target_date_obj = _parse_target_date(transaction_date)
        start_date = (target_date_obj or datetime.now().date()) - timedelta(days=90)
        recommendations = [
            rec for symbol in accumulated_symbols
            if (rec := self._analyze_symbol(symbol, start_date, target_date_obj)) is not None
        ]
        return sorted(recommendations, key=lambda x: x['strength'], reverse=True)

    def _build_history_market_signals(self, symbol: str, days: int = 90) -> pd.DataFrame:
        """Build the per-date indicator DataFrame for `symbol` over `days`."""
        end_date = datetime.now().date()
        start_date = end_date - timedelta(days=days + 60)
        qs = DailyStockPrice.objects.filter(
            ticker=symbol, date__gte=start_date, date__lte=end_date,
        ).order_by('date').values('date', 'close', 'high', 'low', 'volume')
        df = pd.DataFrame(list(qs))
        if df.empty or len(df) < 30:
            return pd.DataFrame()
        df['date'] = pd.to_datetime(df['date'])
        df.set_index('date', inplace=True)
        df = self._compute_indicators(df)
        cutoff_dt = pd.Timestamp(end_date - timedelta(days=days))
        return df[df.index >= cutoff_dt]

    def _history_row(self, date_idx, row) -> Optional[Dict]:
        """Build a single backfill row, or None when no signal fires."""
        signal_type, reason = self._evaluate_signal(row)
        if not signal_type:
            return None
        rsi = row.get('rsi', 50) or 50
        macd_hist = row.get('macd_hist', 0) or 0
        strength = min(100, (self._calculate_signal_strength(row, signal_type) / 8) * 100)
        return {
            "date": date_idx.date(),
            "signal": signal_type,
            "close": float(row.get('close', 0)),
            "strength": strength,
            "reason": reason[0],
            "trend_direction": "",
            "target": None,
            "stop": None,
            "metadata": {"rsi": float(rsi), "macd_hist": float(macd_hist)},
        }

    def compute_history_rows(self, symbol: str, days: int = 365) -> List[Dict]:
        """Return per-date signal dicts (NO DB writes) for episode backfill."""
        valid_df = self._build_history_market_signals(symbol, days)
        return [
            r for date_idx, row in valid_df.iterrows()
            if (r := self._history_row(date_idx, row)) is not None
        ]

    def execute_history(self, symbol: str, days: int = 90) -> List[Dict]:
        """Generate signal history for a symbol and save to SignalEpisode (Backfill)."""
        from stocks.services.signal_episode.backfill import replay_producer_symbol
        from stocks.services.signal_episode.adapters import engine_reading

        rows = self.compute_history_rows(symbol, days)
        readings = [
            engine_reading(
                d=r["date"], signal=r["signal"], ltp=r["close"],
                strength=r.get("strength", 0), tier=r.get("trend_direction", ""),
                rationale=r.get("reason", ""), target=r.get("target"),
                stop=r.get("stop"), metadata=r.get("metadata", {}),
            )
            for r in rows
        ]
        replay_producer_symbol(source="SMART_CROSSOVER", strategy=None, symbol=symbol, readings=readings)
        return self.get_history_from_db(symbol, days)

    def get_history_from_db(self, symbol: str, days: int = 90) -> List[Dict]:
        """Load history from SignalEpisode DB records."""
        from ...models import SignalEpisode

        episodes = SignalEpisode.objects.filter(
            source="SMART_CROSSOVER", symbol=symbol
        ).order_by("-start_date")[: max(days, 1)]
        history = []
        for ep in episodes:
            history.append({
                'date': ep.start_date.strftime("%Y-%m-%d"),
                'signal': ep.direction,
                'strength': round(ep.entry_strength or 0, 1),
                'price': float(ep.entry_price) if ep.entry_price else 0,
                'reason': ep.rationale or '',
                'rsi': round(ep.metadata.get('rsi', 0), 1),
                'macd_hist': round(ep.metadata.get('macd_hist', 0), 2),
            })
        return history
