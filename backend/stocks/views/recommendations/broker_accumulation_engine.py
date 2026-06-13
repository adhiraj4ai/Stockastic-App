"""
BrokerAccumulationRecommendationEngine — generates buy/sell signals based on
broker accumulation patterns and technical indicators.
"""
import logging
from datetime import datetime, timedelta
from typing import Dict, List, Optional

import numpy as np
import pandas as pd
import talib

from ...models import DailyStockPrice, DailyCumulativeAccumulation, Company
from .broker_accumulation_parameters import BrokerAccumulationParameters
from .shared_helpers import _latest_price_date

logger = logging.getLogger(__name__)


class BrokerAccumulationRecommendationEngine:
    """
    Engine that generates recommendations based on broker accumulation patterns.
    Adapted to use Django ORM instead of external trading module.
    """

    def __init__(self, params: Optional[BrokerAccumulationParameters] = None):
        self.params = params if params is not None else BrokerAccumulationParameters()
        self.daily_data: pd.DataFrame = pd.DataFrame()
        self.accumulation_data: pd.DataFrame = pd.DataFrame()

    def _load_daily_data(
        self, start_date: str, end_date: str, symbols: Optional[List[str]] = None
    ) -> pd.DataFrame:
        """Load daily OHLCV data from Django model."""
        queryset = DailyStockPrice.objects.filter(
            date__gte=start_date, date__lte=end_date
        ).order_by('ticker', 'date')
        if symbols:
            queryset = queryset.filter(ticker__in=symbols)
        data = list(queryset.values('ticker', 'date', 'open', 'high', 'low', 'close', 'volume'))
        if not data:
            return pd.DataFrame()
        df = pd.DataFrame(data)
        df.rename(columns={'ticker': 'symbol', 'date': 'transaction_date'}, inplace=True)
        for col in ['open', 'high', 'low', 'close', 'volume']:
            df[col] = pd.to_numeric(df[col], errors='coerce')
        df.set_index('transaction_date', inplace=True)
        return df

    @staticmethod
    def _aggregate_accumulation(df: pd.DataFrame) -> pd.DataFrame:
        """Aggregate cumulative columns per symbol/date and index by date."""
        for col in ['cumulative_buy', 'cumulative_sell', 'cumulative_net']:
            df[col] = pd.to_numeric(df[col], errors='coerce')
        agg_df = df.groupby(['symbol', 'transaction_date']).agg({
            'cumulative_buy': 'sum',
            'cumulative_sell': 'sum',
            'cumulative_net': 'sum'
        }).reset_index()
        agg_df.rename(columns={'cumulative_net': 'cumulative_net_volume'}, inplace=True)
        agg_df.set_index('transaction_date', inplace=True)
        return agg_df

    def _load_accumulation_data(
        self, end_date: str, symbols: Optional[List[str]] = None
    ) -> pd.DataFrame:
        """Load broker accumulation data from Django model."""
        end_dt = datetime.strptime(end_date, "%Y-%m-%d").date()
        start_dt = end_dt - timedelta(days=self.params.window_days * 2)
        queryset = DailyCumulativeAccumulation.objects.filter(
            transaction_date__gte=start_dt, transaction_date__lte=end_dt
        )
        if symbols:
            queryset = queryset.filter(symbol__in=symbols)
        data = list(queryset.values(
            'symbol', 'transaction_date', 'entity_id',
            'cumulative_buy', 'cumulative_sell', 'cumulative_net'
        ))
        if not data:
            return pd.DataFrame()
        return self._aggregate_accumulation(pd.DataFrame(data))

    @staticmethod
    def _apply_moving_averages(df: pd.DataFrame, close: np.ndarray) -> None:
        """Attach SMA/EMA columns to the dataframe in place."""
        df['sma_5'] = talib.SMA(close, timeperiod=5)
        df['sma_10'] = talib.SMA(close, timeperiod=10)
        df['sma_20'] = talib.SMA(close, timeperiod=20)
        df['sma_50'] = talib.SMA(close, timeperiod=50)
        df['sma_200'] = talib.SMA(close, timeperiod=200)
        df['ema_20'] = talib.EMA(close, timeperiod=20)
        df['ema_50'] = talib.EMA(close, timeperiod=50)

    @staticmethod
    def _apply_oscillators(df: pd.DataFrame, high, low, close, volume) -> None:
        """Attach RSI/ROC/ADX/MACD/MFI columns to the dataframe in place."""
        df['rsi_14'] = talib.RSI(close, timeperiod=14)
        df['roc_10'] = talib.ROC(close, timeperiod=10)
        df['adx'] = talib.ADX(high, low, close, timeperiod=14)
        df['plus_di'] = talib.PLUS_DI(high, low, close, timeperiod=14)
        df['minus_di'] = talib.MINUS_DI(high, low, close, timeperiod=14)
        macd, macdsignal, _ = talib.MACD(close, fastperiod=12, slowperiod=26, signalperiod=9)
        df['macd'] = macd
        df['macd_signal'] = macdsignal
        df['mfi'] = talib.MFI(high, low, close, volume, timeperiod=14)

    @staticmethod
    def _apply_volume_and_trend(df: pd.DataFrame, high, low, close, volume) -> None:
        """Attach OBV/AD-line/SAR columns to the dataframe in place."""
        df['obv'] = talib.OBV(close, volume)
        df['ad_line'] = talib.AD(high, low, close, volume)
        df['sar'] = talib.SAR(high, low, acceleration=0.02, maximum=0.2)

    def _compute_indicators_for_symbol(self, group: pd.DataFrame) -> pd.DataFrame:
        """Compute technical indicators for a single symbol's data using talib."""
        df = group.copy()
        if len(df) < 20:
            return df
        try:
            close = df['close'].values.astype(float)
            high = df['high'].values.astype(float)
            low = df['low'].values.astype(float)
            volume = df['volume'].values.astype(float)
            self._apply_moving_averages(df, close)
            self._apply_oscillators(df, high, low, close, volume)
            self._apply_volume_and_trend(df, high, low, close, volume)
        except Exception as e:
            logger.warning(f"Error computing indicators: {e}")
        return df

    def _compute_breakout_flags(self) -> None:
        """Attach price/volume breakout boolean columns to daily_data in place."""
        self.daily_data['prev_close'] = self.daily_data.groupby('symbol')['close'].shift(1)
        self.daily_data['price_breakout'] = (
            (self.daily_data['close'] - self.daily_data['prev_close']) /
            self.daily_data['prev_close']
        ) >= self.params.price_breakout_threshold
        self.daily_data['volume_breakout'] = (
            (self.daily_data['volume'] > self.params.volume_breakout_threshold *
             self.daily_data.groupby('symbol')['volume'].transform('mean')) &
            self.daily_data['price_breakout']
        )

    def _compute_indicators(self) -> None:
        """Compute technical indicators for the daily data."""
        if self.daily_data.empty:
            logger.error("No daily data available for computing indicators!")
            return
        self.daily_data.sort_values(['symbol', 'transaction_date'], inplace=True)
        result_dfs = [
            self._compute_indicators_for_symbol(group)
            for _, group in self.daily_data.groupby('symbol')
        ]
        if result_dfs:
            self.daily_data = pd.concat(result_dfs)
        self._compute_breakout_flags()

    def _merge_accumulation_and_daily(self) -> pd.DataFrame:
        """Inner-join accumulation and daily data on symbol/date."""
        return pd.merge(
            self.accumulation_data.reset_index(),
            self.daily_data.reset_index(),
            on=['symbol', 'transaction_date'],
            how='inner'
        ).set_index('transaction_date')

    @staticmethod
    def _accumulation_metrics(group: pd.DataFrame) -> pd.Series:
        """Summarise net volume and latest AD-line/OBV for a symbol group."""
        has_ad = 'ad_line' in group.columns and pd.notna(group['ad_line'].iloc[-1])
        has_obv = 'obv' in group.columns and pd.notna(group['obv'].iloc[-1])
        return pd.Series({
            'net_volume': group['cumulative_net_volume'].sum(),
            'latest_date': group.index.max(),
            'ad_line': group['ad_line'].iloc[-1] if has_ad else 0,
            'obv': group['obv'].iloc[-1] if has_obv else 0,
        })

    def _confirm_accumulation(self) -> np.ndarray:
        """Confirm accumulation patterns using both accumulation and daily OHLCV data."""
        if self.accumulation_data.empty or self.daily_data.empty:
            logger.warning("No accumulation or daily data available!")
            return np.array([])
        merged_data = self._merge_accumulation_and_daily()
        if merged_data.empty:
            return np.array([])
        acc_metrics = merged_data.groupby('symbol', group_keys=True).apply(
            self._accumulation_metrics, include_groups=False
        ).reset_index()
        max_date = merged_data.index.max()
        strong_accumulation = acc_metrics[
            (acc_metrics['latest_date'] == max_date) &
            (acc_metrics['net_volume'] > self.params.min_net_volume) &
            (acc_metrics['ad_line'] > 0) &
            (acc_metrics['obv'] > 0)
        ]
        symbols = strong_accumulation['symbol'].unique()
        logger.info(f"Found {len(symbols)} stocks with strong accumulation on {max_date}.")
        return symbols

    def _confirm_momentum(self, filtered_data: pd.DataFrame) -> pd.DataFrame:
        """Confirm momentum patterns."""
        df = filtered_data.copy()
        df['macd'] = df.get('macd', pd.Series(0, index=df.index))
        df['macd_signal'] = df.get('macd_signal', pd.Series(0, index=df.index))
        df['rsi_14'] = df.get('rsi_14', pd.Series(50, index=df.index))
        df['roc_10'] = df.get('roc_10', pd.Series(0, index=df.index))
        df['volume_breakout'] = df.get('volume_breakout', pd.Series(False, index=df.index))
        df['macd_bullish'] = df['macd'] > df['macd_signal']
        df['rsi_optimal'] = df['rsi_14'].between(40, 70)
        df['roc_momentum'] = df['roc_10'].between(5, 15)
        df['momentum_points'] = (
            df['macd_bullish'].astype(int) + df['rsi_optimal'].astype(int) +
            df['roc_momentum'].astype(int) + df['volume_breakout'].astype(int)
        )
        df['momentum_score'] = (df['momentum_points'] / 4) * 100
        return df

    @staticmethod
    def _ensure_trend_columns(df: pd.DataFrame) -> None:
        """Backfill any missing trend-input columns with defaults in place."""
        for col in ['sma_5', 'sma_10', 'sma_20', 'sma_50', 'sma_200', 'adx', 'sar', 'close']:
            if col not in df.columns:
                df[col] = 0 if col != 'close' else df.get('close', 0)

    @staticmethod
    def _apply_ma_crossovers_and_slopes(df: pd.DataFrame) -> None:
        """Attach MA crossover booleans, slopes, and the trend strength score."""
        s5 = df['sma_5'].fillna(0)
        s10 = df['sma_10'].fillna(0)
        s20 = df['sma_20'].fillna(0)
        s50 = df['sma_50'].fillna(0)
        s200 = df['sma_200'].fillna(0)
        df['ma_5_10_bullish'] = s5 > s10
        df['ma_10_20_bullish'] = s10 > s20
        df['ma_20_50_bullish'] = s20 > s50
        df['ma_50_200_bullish'] = s50 > s200
        df['sma_5_slope'] = df['sma_5'].diff().fillna(0)
        df['sma_10_slope'] = df['sma_10'].diff().fillna(0)
        df['sma_20_slope'] = df['sma_20'].diff().fillna(0)
        df['trend_strength_score'] = (
            df['ma_5_10_bullish'].astype(int) * 4 +
            df['ma_10_20_bullish'].astype(int) * 3 +
            df['ma_20_50_bullish'].astype(int) * 2 +
            df['ma_50_200_bullish'].astype(int) * 1 +
            (df['sma_5_slope'] > 0).astype(int) +
            (df['sma_20_slope'] > 0).astype(int)
        )

    @staticmethod
    def _classify_trend_direction(df: pd.DataFrame) -> None:
        """Classify a base trend direction from MA stacking and ADX in place."""
        df['trend_direction'] = np.select(
            [
                (df['sma_5'] > df['sma_10']) & (df['sma_10'] > df['sma_20']) & (df['adx'] > 25),
                (df['sma_5'] < df['sma_10']) & (df['sma_10'] < df['sma_20']) & (df['adx'] > 25),
                (df['sma_5'] > df['sma_10']) & (df['sma_10'] > df['sma_20']) & (df['adx'] <= 25),
                (df['sma_5'] < df['sma_10']) & (df['sma_10'] < df['sma_20']) & (df['adx'] <= 25),
                (df['sma_10'] < df['sma_5']) & (df['sma_10'] > df['sma_20']) & (df['adx'] > 20),
                (df['adx'] < 20),
            ],
            ['Strong Bullish', 'Strong Bearish', 'Weak Bullish', 'Weak Bearish', 'Transition', 'Sideways'],
            default='Neutral',
        )

    @staticmethod
    def _refine_trend_with_sar(df: pd.DataFrame) -> None:
        """Refine trend direction using Parabolic SAR confirmation in place."""
        df['sar_trend'] = np.where(
            (df['sar'] > 0) & (df['close'] > df['sar']), 'Bullish',
            np.where((df['sar'] > 0), 'Bearish', 'Neutral'),
        )
        _bullish_labels = ['Weak Bullish', 'Transition']
        _bearish_labels = ['Weak Bearish', 'Transition']
        _weakening_bullish = ['Strong Bullish', 'Weak Bullish']
        _weakening_bearish = ['Strong Bearish', 'Weak Bearish']
        df['trend_direction'] = np.select(
            [
                (df['trend_direction'] == 'Strong Bullish') & (df['sar_trend'] == 'Bullish'),
                (df['trend_direction'] == 'Strong Bearish') & (df['sar_trend'] == 'Bearish'),
                (df['trend_direction'].isin(_bullish_labels)) & (df['sar_trend'] == 'Bullish'),
                (df['trend_direction'].isin(_bearish_labels)) & (df['sar_trend'] == 'Bearish'),
                (df['trend_direction'].isin(_weakening_bullish)) & (df['sar_trend'] == 'Bearish'),
                (df['trend_direction'].isin(_weakening_bearish)) & (df['sar_trend'] == 'Bullish'),
                (df['trend_direction'] == 'Sideways') & (df['sar_trend'] == 'Bullish'),
                (df['trend_direction'] == 'Sideways') & (df['sar_trend'] == 'Bearish'),
            ],
            [
                'Confirmed Strong Bullish', 'Confirmed Strong Bearish',
                'Confirmed Bullish', 'Confirmed Bearish',
                'Weakening Bullish', 'Weakening Bearish',
                'Range Bullish', 'Range Bearish',
            ],
            default='Neutral',
        )
        df['trend_direction'] = df['trend_direction'].fillna('Neutral')

    def _confirm_advanced_trend(self, momentum_data: pd.DataFrame) -> pd.DataFrame:
        """Confirm advanced trend patterns."""
        df = momentum_data.copy()
        self._ensure_trend_columns(df)
        self._apply_ma_crossovers_and_slopes(df)
        self._classify_trend_direction(df)
        self._refine_trend_with_sar(df)
        return df

    @staticmethod
    def _ensure_signal_columns(trend_data: pd.DataFrame) -> None:
        """Backfill any missing signal-input columns with defaults in place."""
        for col in ['close', 'sma_20', 'sma_50', 'sma_5', 'sma_10',
                    'macd', 'macd_signal', 'roc_10', 'rsi_14', 'adx', 'volume_breakout']:
            if col not in trend_data.columns:
                trend_data[col] = 0 if col != 'volume_breakout' else False

    @staticmethod
    def _compute_confidence_score(trend_data: pd.DataFrame) -> None:
        """Compute the normalized 0-100 confidence score in place."""
        max_points = 23
        trend_data['confidence_score'] = (
            (trend_data['close'] > trend_data['sma_20']).astype(int) * 3 +
            (trend_data['sma_20'] > trend_data['sma_50']).astype(int) * 3 +
            (trend_data['close'] > trend_data['sma_5']).astype(int) * 1 +
            (trend_data['sma_5'] > trend_data['sma_10']).astype(int) * 1 +
            (trend_data['macd'] > trend_data['macd_signal']).astype(int) * 2 +
            (trend_data['macd'] - trend_data['macd_signal']).gt(0).astype(int) * 1 +
            (trend_data['roc_10'].between(5, 25)).astype(int) * 2 +
            (trend_data['roc_10'] > 25).astype(int) * 3 +
            (trend_data['rsi_14'].between(40, 60)).astype(int) * 2 +
            (trend_data['rsi_14'].between(30, 40)).astype(int) * -1 +
            (trend_data['rsi_14'].between(60, 70)).astype(int) * -1 +
            (trend_data['rsi_14'] > 70).astype(int) * -2 +
            (trend_data['rsi_14'] < 30).astype(int) * -2 +
            (trend_data['adx'] > 25).astype(int) * 3 +
            (trend_data['volume_breakout']).astype(int) * 2
        ) / max_points * 100

    _BULLISH_TRENDS = frozenset([
        'Bullish', 'Weakening Bullish', 'Confirmed Strong Bullish',
        'Confirmed Bullish', 'Ranging Bullish', 'Range Bullish',
    ])

    @classmethod
    def _assign_signal_types(cls, trend_data: pd.DataFrame) -> None:
        """Sign the confidence score by trend and assign signal_type in place."""
        trend_data['confidence_score'] = np.where(
            trend_data['trend_direction'].isin(cls._BULLISH_TRENDS),
            trend_data['confidence_score'],
            -trend_data['confidence_score'],
        )
        trend_data['signal_type'] = np.select(
            [
                trend_data['confidence_score'] >= 75,
                trend_data['confidence_score'] >= 50,
                trend_data['confidence_score'] >= 25,
                trend_data['confidence_score'] <= -75,
                trend_data['confidence_score'] <= -50,
                trend_data['confidence_score'] <= -25,
            ],
            ['STRONG_BUY', 'BUY', 'WEAK_BUY', 'STRONG_SELL', 'SELL', 'WEAK_SELL'],
            default='NEUTRAL',
        )

    def _generate_signals(self, trend_data: pd.DataFrame) -> pd.DataFrame:
        """Generate trading signals based on trend data."""
        self._ensure_signal_columns(trend_data)
        self._compute_confidence_score(trend_data)
        self._assign_signal_types(trend_data)
        return trend_data

    def _generate_reason(self, row: pd.Series) -> str:
        """Generate a human-readable reason for the signal."""
        reasons = self._collect_buy_reasons(row) if 'BUY' in row['signal_type'] else \
                  self._collect_sell_reasons(row) if 'SELL' in row['signal_type'] else \
                  ["No clear signal"]
        return "; ".join(reasons[:3])

    @staticmethod
    def _collect_buy_reasons(row: pd.Series) -> list:
        """Collect reason strings for a BUY signal row."""
        reasons = []
        if row.get('ma_5_10_bullish', False):
            reasons.append("Short-term MA crossover")
        if pd.notna(row.get('macd')) and pd.notna(row.get('macd_signal')) and row['macd'] > row['macd_signal']:
            reasons.append("MACD bullish")
        if pd.notna(row.get('rsi_14')) and 40 <= row['rsi_14'] <= 60:
            reasons.append("RSI in optimal range")
        if row.get('volume_breakout', False):
            reasons.append("Volume breakout")
        if pd.notna(row.get('adx')) and row['adx'] > 25:
            reasons.append("Strong trend")
        if not reasons:
            reasons.append("Accumulation pattern detected")
        return reasons

    @staticmethod
    def _collect_sell_reasons(row: pd.Series) -> list:
        """Collect reason strings for a SELL signal row."""
        reasons = []
        if pd.notna(row.get('rsi_14')) and row['rsi_14'] > 70:
            reasons.append("Overbought")
        if pd.notna(row.get('macd')) and pd.notna(row.get('macd_signal')) and row['macd'] < row['macd_signal']:
            reasons.append("MACD bearish")
        if not reasons:
            reasons.append("Distribution pattern detected")
        return reasons

    @staticmethod
    def _resolve_end_date(transaction_date: Optional[str]):
        """Resolve the analysis end date from a string or the latest price."""
        if transaction_date is not None:
            return datetime.strptime(transaction_date, "%Y-%m-%d").date()
        latest = DailyStockPrice.objects.order_by('-date').first()
        return latest.date if latest else None

    @staticmethod
    def _sector_symbols(sector: Optional[str]) -> Optional[List[str]]:
        """Return symbols for a sector filter, or None when unfiltered."""
        if not sector or sector == 'All':
            return None
        return list(Company.objects.filter(sector=sector).values_list('symbol', flat=True))

    def _accumulation_universe(self) -> Optional[np.ndarray]:
        """Symbols passing accumulation, falling back to all symbols."""
        accumulation_symbols = self._confirm_accumulation()
        if accumulation_symbols.size == 0:
            logger.info("No stocks passed accumulation criteria.")
            return self.daily_data['symbol'].unique()
        return accumulation_symbols

    def _run_signal_pipeline(self, accumulation_symbols: np.ndarray) -> pd.DataFrame:
        """Filter to accumulated symbols and run momentum/trend/signal stages."""
        accumulated_data = self.daily_data[
            self.daily_data['symbol'].isin(accumulation_symbols)
        ].copy()
        if accumulated_data.empty:
            logger.info("No data after accumulation filter.")
            return pd.DataFrame()
        momentum_data = self._confirm_momentum(accumulated_data)
        trend_data = self._confirm_advanced_trend(momentum_data)
        return self._generate_signals(trend_data)

    @staticmethod
    def _latest_actionable_signals(final_signals: pd.DataFrame):
        """Keep only the latest-date, non-neutral signals; return (df, max_date)."""
        final_signals = final_signals.reset_index()
        max_date = final_signals['transaction_date'].max()
        final_signals = final_signals[final_signals['transaction_date'] == max_date]
        return final_signals[final_signals['signal_type'] != 'NEUTRAL'], max_date

    def _format_recommendation(self, row: pd.Series, max_date) -> Dict:
        """Build a single recommendation dict for the API response."""
        date_str = max_date.strftime("%Y-%m-%d") if hasattr(max_date, 'strftime') else str(max_date)
        return {
            'symbol': row['symbol'],
            'signal': 'BUY' if 'BUY' in row['signal_type'] else 'SELL',
            'strength': round(abs(row['confidence_score']), 1),
            'reason': self._generate_reason(row),
            'close': float(row['close']) if pd.notna(row['close']) else 0,
            'date': date_str,
            'trend_direction': row.get('trend_direction', 'Unknown'),
            'rsi': round(row['rsi_14'], 1) if pd.notna(row.get('rsi_14')) else None,
            'macd': round(row['macd'], 2) if pd.notna(row.get('macd')) else None,
        }

    def execute(
        self, transaction_date: Optional[str] = None, sector: Optional[str] = None
    ) -> List[Dict]:
        """Execute the strategy and return recommendations."""
        if not self._load_execution_data(transaction_date, sector):
            return []
        self._compute_indicators()
        final_signals = self._run_signal_pipeline(self._accumulation_universe())
        if final_signals.empty:
            return []
        final_signals, max_date = self._latest_actionable_signals(final_signals)
        recommendations = [
            self._format_recommendation(row, max_date)
            for _, row in final_signals.iterrows()
        ]
        recommendations.sort(key=lambda x: x['strength'], reverse=True)
        logger.info(f"Generated {len(recommendations)} recommendations for {max_date}.")
        return recommendations

    def _load_execution_data(
        self, transaction_date: Optional[str], sector: Optional[str]
    ) -> bool:
        """Load daily/accumulation data into state; return False if unusable."""
        end_date = self._resolve_end_date(transaction_date)
        if not end_date:
            logger.warning("No price data available")
            return False
        end_date_str = end_date.strftime("%Y-%m-%d")
        start_date_str = (end_date - timedelta(days=365)).strftime("%Y-%m-%d")
        logger.info(f"Executing Broker Accumulation Strategy for {end_date_str}...")
        symbols = self._sector_symbols(sector)
        if symbols == []:
            logger.info(f"No active companies found in sector: {sector}")
            return False
        self.daily_data = self._load_daily_data(start_date_str, end_date_str, symbols)
        self.accumulation_data = self._load_accumulation_data(end_date_str, symbols)
        if self.daily_data.empty:
            logger.info("No daily data available.")
            return False
        return True

    def _load_history_accumulation(self, symbol: str, start_date_dt, end_date_dt) -> None:
        """Load and aggregate per-date cumulative net volume into accumulation_data."""
        acc_start_dt = start_date_dt - timedelta(days=self.params.window_days * 2)
        acc_queryset = DailyCumulativeAccumulation.objects.filter(
            transaction_date__gte=acc_start_dt,
            transaction_date__lte=end_date_dt,
            symbol=symbol,
        ).values('transaction_date', 'cumulative_net')
        acc_df = pd.DataFrame(list(acc_queryset))
        if acc_df.empty:
            self.accumulation_data = pd.DataFrame()
            return
        acc_df['cumulative_net'] = pd.to_numeric(acc_df['cumulative_net'], errors='coerce')
        acc_df = acc_df.groupby('transaction_date')['cumulative_net'].sum().reset_index()
        acc_df.rename(columns={'cumulative_net': 'cumulative_net_volume'}, inplace=True)
        acc_df.set_index('transaction_date', inplace=True)
        self.accumulation_data = acc_df

    def _attach_rolling_net_volume(self, df: pd.DataFrame) -> None:
        """Attach the rolling net accumulation volume column in place."""
        if self.accumulation_data.empty:
            df['rolling_net_volume'] = 0
            return
        rolling_acc = self.accumulation_data['cumulative_net_volume'].rolling(
            window=self.params.window_days, min_periods=1
        ).sum()
        df['rolling_net_volume'] = rolling_acc.reindex(df.index, method='ffill').fillna(0)

    @staticmethod
    def _to_descending_date_index(market_signals: pd.DataFrame) -> pd.DataFrame:
        """Coerce the index to dates and sort newest-first."""
        try:
            market_signals.index = pd.to_datetime(market_signals.index)
        except Exception:
            if 'date' in market_signals.columns:
                market_signals['date'] = pd.to_datetime(market_signals['date'])
                market_signals.set_index('date', inplace=True)
        return market_signals.sort_index(ascending=False)

    def _build_history_market_signals(self, symbol: str, days: int = 90) -> pd.DataFrame:
        """Build the per-date market_signals DataFrame for `symbol` over `days`."""
        end_date_dt = _latest_price_date(symbol)
        if not end_date_dt:
            return pd.DataFrame()
        start_date_dt = end_date_dt - timedelta(days=days + self.params.lookback_period)
        self.daily_data = self._load_daily_data(
            start_date_dt.strftime("%Y-%m-%d"), end_date_dt.strftime("%Y-%m-%d"), [symbol]
        )
        if self.daily_data.empty:
            return pd.DataFrame()
        self._load_history_accumulation(symbol, start_date_dt, end_date_dt)
        self._compute_indicators()
        if self.daily_data.empty:
            return pd.DataFrame()
        return self._build_windowed_signals(symbol, end_date_dt, days)

    def _build_windowed_signals(self, symbol: str, end_date_dt, days: int) -> pd.DataFrame:
        """Run signal pipeline on loaded data and filter to the `days` window."""
        df = self.daily_data.copy()
        self._attach_rolling_net_volume(df)
        market_signals = self._generate_signals(
            self._confirm_advanced_trend(self._confirm_momentum(df))
        )
        if market_signals.empty:
            return pd.DataFrame()
        market_signals = self._to_descending_date_index(market_signals)
        cutoff_date = end_date_dt - timedelta(days=days)
        return market_signals[market_signals.index.date >= cutoff_date]

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
        replay_producer_symbol(
            source="BROKER_ACCUMULATION", strategy=None, symbol=symbol, readings=readings
        )
        return self.get_history_from_db(symbol, days)

    def _history_row(self, dt, row: pd.Series) -> Dict:
        """Build a single backfill row dict from a signal row."""
        is_accumulated = (
            (row.get('rolling_net_volume', 0) > self.params.min_net_volume) and
            (row.get('ad_line', 0) > 0) and
            (row.get('obv', 0) > 0)
        )
        return {
            "date": dt.date(),
            "signal": "BUY" if "BUY" in row['signal_type'] else "SELL",
            "close": float(row['close']),
            "strength": abs(row['confidence_score']),
            "reason": self._generate_reason(row),
            "trend_direction": row.get('trend_direction', ''),
            "target": None, "stop": None,
            "metadata": {
                "is_accumulated": bool(is_accumulated),
                "rsi": row.get('rsi_14'),
                "macd": row.get('macd'),
            },
        }

    def compute_history_rows(self, symbol: str, days: int = 365) -> List[Dict]:
        """Return per-date signal dicts (NO DB writes) for episode backfill."""
        market_signals = self._build_history_market_signals(symbol, days)
        if market_signals.empty:
            return []
        return [
            self._history_row(dt, row)
            for dt, row in market_signals.iterrows()
            if row['signal_type'] != 'NEUTRAL'
        ]

    def get_history_from_db(self, symbol: str, days: int = 90) -> List[Dict]:
        """Load history from SignalEpisode DB records."""
        from ...models import SignalEpisode

        episodes = SignalEpisode.objects.filter(
            source="BROKER_ACCUMULATION", symbol=symbol
        ).order_by("-start_date")[: max(days, 1)]
        history = []
        for ep in episodes:
            history.append({
                'date': ep.start_date.strftime("%Y-%m-%d"),
                'signal': ep.direction,
                'strength': round(ep.entry_strength or 0, 1),
                'price': float(ep.entry_price) if ep.entry_price else 0,
                'reason': ep.rationale or '',
                'is_accumulated': ep.metadata.get('is_accumulated', False),
            })
        return history
