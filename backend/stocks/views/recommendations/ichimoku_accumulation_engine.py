"""
IchimokuAccumulationRecommendationEngine — combines Ichimoku Cloud trend analysis
with broker accumulation data to generate signals.
"""
import logging
from datetime import datetime, timedelta
from typing import Dict, List, Optional

import numpy as np
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


class IchimokuAccumulationRecommendationEngine:
    """
    Combines Ichimoku Cloud Trend Analysis with Broker Accumulation Data.
    Universe: Only symbols present in DailyCumulativeAccumulation.
    Logic:
        BUY: Price ABOVE Cloud (close > Span A AND close > Span B)
             AND Tenkan-sen > Kijun-sen (bullish)
             AND RSI in healthy range (30-70)
        SELL: Price BELOW Cloud (close < Span A OR close < Span B)
              AND Tenkan-sen < Kijun-sen (bearish)
    """

    @staticmethod
    def _coerce_numeric(df: pd.DataFrame) -> None:
        """Coerce OHLCV columns to numeric in place."""
        for col in ['close', 'high', 'low', 'volume']:
            if col in df.columns:
                df[col] = pd.to_numeric(df[col], errors='coerce')

    @staticmethod
    def _apply_ichimoku_lines(df: pd.DataFrame, high: np.ndarray, low: np.ndarray) -> None:
        """Attach Tenkan/Kijun/Span A/Span B and cloud bounds in place."""
        high_s, low_s = pd.Series(high), pd.Series(low)
        df['tenkan'] = (high_s.rolling(9).max() + low_s.rolling(9).min()) / 2
        df['kijun'] = (high_s.rolling(26).max() + low_s.rolling(26).min()) / 2
        df['span_a'] = (df['tenkan'] + df['kijun']) / 2
        df['span_b'] = (high_s.rolling(52).max() + low_s.rolling(52).min()) / 2
        df['cloud_top'] = df[['span_a', 'span_b']].max(axis=1)
        df['cloud_bottom'] = df[['span_a', 'span_b']].min(axis=1)

    def _compute_indicators(self, df: pd.DataFrame) -> pd.DataFrame:
        """Attach Ichimoku lines and RSI to the dataframe."""
        if df.empty:
            return df
        self._coerce_numeric(df)
        close = df['close'].values.astype(float)
        high = df['high'].values.astype(float)
        low = df['low'].values.astype(float)
        self._apply_ichimoku_lines(df, high, low)
        df['rsi'] = talib.RSI(close, timeperiod=14)
        return df

    @staticmethod
    def _tk_spread_points(numerator: float, denominator: float) -> int:
        """Score the Tenkan/Kijun spread for either signal direction."""
        if denominator <= 0:
            return 0
        spread = (numerator / denominator) * 100
        if spread > 2:
            return 2
        if spread > 0.5:
            return 1
        return 0

    @staticmethod
    def _cloud_distance_points(distance_pct: float) -> int:
        """Score how far price sits beyond the cloud edge."""
        if distance_pct > 5:
            return 3
        if distance_pct > 2:
            return 2
        return 1

    def _buy_strength(self, close, span_a, span_b, tenkan, kijun, rsi) -> int:
        """Sum the Ichimoku BUY-side strength components."""
        score = 0
        cloud_top = max(span_a, span_b)
        if cloud_top > 0 and close > cloud_top:
            score += self._cloud_distance_points(((close - cloud_top) / cloud_top) * 100)
        if tenkan > 0 and kijun > 0:
            score += self._tk_spread_points(tenkan - kijun, kijun)
        if 40 <= rsi <= 60:
            score += 2
        elif 30 <= rsi <= 70:
            score += 1
        if cloud_top > 0 and (abs(span_a - span_b) / cloud_top) > 0.02:
            score += 1
        return score

    def _sell_strength(self, close, span_a, span_b, tenkan, kijun, rsi) -> int:
        """Sum the Ichimoku SELL-side strength components."""
        score = 0
        cloud_bottom = min(span_a, span_b)
        if cloud_bottom > 0 and close < cloud_bottom:
            score += self._cloud_distance_points(((cloud_bottom - close) / cloud_bottom) * 100)
        if tenkan > 0 and kijun > 0:
            score += self._tk_spread_points(kijun - tenkan, kijun)
        if rsi > 70:
            score += 2
        elif rsi > 60:
            score += 1
        return score

    def _calculate_signal_strength(self, row, signal_type) -> float:
        """Calculate strength score (0-100) based on Ichimoku components."""
        args = (
            row.get('close', 0) or 0, row.get('span_a', 0) or 0, row.get('span_b', 0) or 0,
            row.get('tenkan', 0) or 0, row.get('kijun', 0) or 0, row.get('rsi', 50) or 50,
        )
        if signal_type == 'BUY':
            score = self._buy_strength(*args)
        elif signal_type == 'SELL':
            score = self._sell_strength(*args)
        else:
            score = 0
        return min(100, (score / 9) * 100)

    @staticmethod
    def _ichimoku_values(row):
        """Return (close, span_a, span_b, tenkan, kijun, rsi) or None if incomplete."""
        close = row.get('close', 0) or 0
        span_a, span_b = row.get('span_a'), row.get('span_b')
        tenkan, kijun = row.get('tenkan'), row.get('kijun')
        rsi = row.get('rsi', 50) or 50
        if pd.isna(span_a) or pd.isna(span_b) or pd.isna(tenkan) or pd.isna(kijun):
            return None
        return close, float(span_a), float(span_b), float(tenkan), float(kijun), rsi

    @staticmethod
    def _evaluate_signal(values):
        """Return (signal_type, reason_list) from extracted Ichimoku values."""
        close, span_a, span_b, tenkan, kijun, rsi = values
        if (close > span_a and close > span_b) and (tenkan > kijun) and (30 <= rsi <= 70):
            reason = ["Price above Ichimoku Cloud", "Tenkan-sen > Kijun-sen (Bullish)"]
            if 40 <= rsi <= 60:
                reason.append("RSI in optimal range")
            return 'BUY', reason
        if (close < span_a and close < span_b) and (tenkan < kijun):
            reason = ["Price below Ichimoku Cloud", "Tenkan-sen < Kijun-sen (Bearish)"]
            if rsi > 70:
                reason.append("RSI overbought")
            return 'SELL', reason
        return None, []

    @classmethod
    def _prev_signal(cls, prev_row):
        """Classify a previous row's signal for crossover backtracking."""
        values = cls._ichimoku_values(prev_row)
        if values is None:
            return 'STOP'
        return cls._evaluate_signal(values)[0]

    def _find_crossover(self, df, row, signal_type):
        """Walk back to the start of the current signal run; return (date, price)."""
        crossover_date, crossover_price = row.name, float(row.get('close', 0) or 0)
        if len(df) <= 1:
            return crossover_date, crossover_price
        current_idx = df.index.get_loc(row.name)
        for i in range(current_idx - 1, -1, -1):
            prev_row = df.iloc[i]
            p_signal = self._prev_signal(prev_row)
            if p_signal == 'STOP' or p_signal != signal_type:
                break
            crossover_date = prev_row.name
            crossover_price = float(prev_row.get('close', 0) or 0)
        return crossover_date, crossover_price

    def _build_recommendation(self, symbol, df, row, signal_type, reason, values):
        """Assemble a single Ichimoku recommendation dict."""
        close, span_a, span_b, _, _, rsi = values
        crossover_date, crossover_price = self._find_crossover(df, row, signal_type)
        strength = self._calculate_signal_strength(row, signal_type)
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
            'macd_hist': 0,
        }

    def _analyze_symbol(self, symbol, start_date, target_date_obj):
        """Return a recommendation for the symbol, or None when no signal fires."""
        df = _load_symbol_ohlcv(symbol, start_date)
        if df.empty or len(df) < 52:
            return None
        df = self._compute_indicators(df)
        row = _select_analysis_row(df, target_date_obj)
        if row is None:
            return None
        values = self._ichimoku_values(row)
        if values is None:
            return None
        signal_type, reason = self._evaluate_signal(values)
        if not signal_type:
            return None
        return self._build_recommendation(symbol, df, row, signal_type, reason, values)

    def execute(self, transaction_date=None, sector=None):
        """Return sorted recommendations for accumulated symbols."""
        threshold = 20000
        accumulated_symbols, latest_acc_date = _accumulated_symbol_universe(threshold, sector)
        if not latest_acc_date:
            logger.warning("No accumulation data found.")
            return []
        if not accumulated_symbols:
            logger.info("No accumulated symbols found after filtering.")
            return []
        target_date_obj = _parse_target_date(transaction_date)
        start_date = (target_date_obj or datetime.now().date()) - timedelta(days=180)
        recommendations = [
            rec for symbol in accumulated_symbols
            if (rec := self._analyze_symbol(symbol, start_date, target_date_obj)) is not None
        ]
        return sorted(recommendations, key=lambda x: x['strength'], reverse=True)

    def _build_history_market_signals(self, symbol: str, days: int = 90) -> pd.DataFrame:
        """Build the per-date indicator DataFrame for `symbol` over `days`."""
        end_date = datetime.now().date()
        start_date = end_date - timedelta(days=days + 120)
        qs = DailyStockPrice.objects.filter(
            ticker=symbol, date__gte=start_date, date__lte=end_date,
        ).order_by('date').values('date', 'close', 'high', 'low', 'volume')
        df = pd.DataFrame(list(qs))
        if df.empty or len(df) < 60:
            return pd.DataFrame()
        df['date'] = pd.to_datetime(df['date'])
        df.set_index('date', inplace=True)
        df = self._compute_indicators(df)
        cutoff_dt = pd.Timestamp(end_date - timedelta(days=days))
        return df[df.index >= cutoff_dt]

    @staticmethod
    def _classify_history_signal(close, span_a, span_b, tenkan, kijun, rsi):
        """Return (signal_type, reason) for a history row using OR-based exit."""
        if (close > span_a and close > span_b) and (tenkan > kijun) and (30 <= rsi <= 70):
            return 'BUY', "Price above Cloud; Bullish TK Cross"
        if (close < span_a or close < span_b) and (tenkan < kijun):
            return 'SELL', "Price below Cloud; Bearish TK Cross"
        return None, ""

    def _history_row(self, date_idx, row) -> Optional[Dict]:
        """Build a single backfill row, or None when no signal fires."""
        span_a, span_b = row.get('span_a'), row.get('span_b')
        if pd.isna(span_a) or pd.isna(span_b):
            return None
        close = row.get('close', 0) or 0
        rsi = row.get('rsi', 50) or 50
        span_a, span_b = float(span_a), float(span_b)
        tenkan = float(row.get('tenkan')) if not pd.isna(row.get('tenkan')) else 0
        kijun = float(row.get('kijun')) if not pd.isna(row.get('kijun')) else 0
        signal_type, reason = self._classify_history_signal(close, span_a, span_b, tenkan, kijun, rsi)
        if not signal_type:
            return None
        return {
            "date": date_idx.date(), "signal": signal_type, "close": float(close),
            "strength": self._calculate_signal_strength(row, signal_type), "reason": reason,
            "trend_direction": "", "target": None, "stop": None,
            "metadata": {"rsi": float(rsi), "span_a": span_a, "span_b": span_b},
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
        replay_producer_symbol(source="ICHIMOKU", strategy=None, symbol=symbol, readings=readings)
        return self.get_history_from_db(symbol, days)

    def get_history_from_db(self, symbol: str, days: int = 90) -> List[Dict]:
        """Load history from SignalEpisode DB records."""
        from ...models import SignalEpisode

        episodes = SignalEpisode.objects.filter(
            source="ICHIMOKU", symbol=symbol
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
                'macd_hist': 0,
            })
        return history
