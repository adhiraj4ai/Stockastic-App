"""
Broker Accumulation Strategy Recommendations

Adapted from user's BrokerAccumulationStrategy to work with Django ORM.
Generates buy/sell signals based on broker accumulation patterns and technical indicators.
Uses pandas_ta for technical indicator calculations (already available in the project).
"""

import logging
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Dict, Optional, List

import numpy as np
import pandas as pd
import talib

from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from ..models import DailyStockPrice, DailyCumulativeAccumulation, Company

logger = logging.getLogger(__name__)


@dataclass
class BrokerAccumulationParameters:
    min_accumulation_days: int = 10
    volume_breakout_threshold: float = 2.0
    price_breakout_threshold: float = 0.02
    rsi_oversold: int = 30
    rsi_overbought: int = 70
    min_buyer_percentage: float = 60.0
    lookback_period: int = 200
    min_net_volume: int = 10000
    window_days: int = 10
    momentum_rsi_lower: int = 30
    momentum_rsi_upper: int = 70
    confidence_thresholds: Dict[str, float] = field(default_factory=lambda: {
        'strong_buy': 75.0,
        'buy': 50.0
    })


class BrokerAccumulationRecommendationEngine:
    """
    Engine that generates recommendations based on broker accumulation patterns.
    Adapted to use Django ORM instead of external trading module.
    """
    
    def __init__(self, params: Optional[BrokerAccumulationParameters] = None):
        self.params = params if params is not None else BrokerAccumulationParameters()
        self.daily_data: pd.DataFrame = pd.DataFrame()
        self.accumulation_data: pd.DataFrame = pd.DataFrame()

    def _load_daily_data(self, start_date: str, end_date: str, symbols: Optional[List[str]] = None) -> pd.DataFrame:
        """Load daily OHLCV data from Django model."""
        queryset = DailyStockPrice.objects.filter(
            date__gte=start_date,
            date__lte=end_date
        ).order_by('ticker', 'date')
        
        if symbols:
            queryset = queryset.filter(ticker__in=symbols)
        
        data = list(queryset.values(
            'ticker', 'date', 'open', 'high', 'low', 'close', 'volume'
        ))
        
        if not data:
            return pd.DataFrame()
        
        df = pd.DataFrame(data)
        df.rename(columns={
            'ticker': 'symbol',
            'date': 'transaction_date'
        }, inplace=True)
        
        # Convert to numeric
        for col in ['open', 'high', 'low', 'close', 'volume']:
            df[col] = pd.to_numeric(df[col], errors='coerce')
        
        df.set_index('transaction_date', inplace=True)
        return df

    def _load_accumulation_data(self, end_date: str, symbols: Optional[List[str]] = None) -> pd.DataFrame:
        """Load broker accumulation data from Django model."""
        # Get the window start date
        end_dt = datetime.strptime(end_date, "%Y-%m-%d").date()
        start_dt = end_dt - timedelta(days=self.params.window_days * 2)
        
        queryset = DailyCumulativeAccumulation.objects.filter(
            transaction_date__gte=start_dt,
            transaction_date__lte=end_dt
        )
        
        if symbols:
            queryset = queryset.filter(symbol__in=symbols)
        
        data = list(queryset.values(
            'symbol', 'transaction_date', 'entity_id',
            'cumulative_buy', 'cumulative_sell', 'cumulative_net'
        ))
        
        if not data:
            return pd.DataFrame()
        
        df = pd.DataFrame(data)
        
        # Convert to numeric
        for col in ['cumulative_buy', 'cumulative_sell', 'cumulative_net']:
            df[col] = pd.to_numeric(df[col], errors='coerce')
        
        # Aggregate by symbol and date
        agg_df = df.groupby(['symbol', 'transaction_date']).agg({
            'cumulative_buy': 'sum',
            'cumulative_sell': 'sum',
            'cumulative_net': 'sum'
        }).reset_index()
        
        agg_df.rename(columns={'cumulative_net': 'cumulative_net_volume'}, inplace=True)
        agg_df.set_index('transaction_date', inplace=True)
        
        return agg_df

    def _compute_indicators_for_symbol(self, group: pd.DataFrame) -> pd.DataFrame:
        """Compute technical indicators for a single symbol's data using talib."""
        df = group.copy()
        
        # Ensure we have enough data
        if len(df) < 20:
            return df
        
        try:
            close = df['close'].values.astype(float)
            high = df['high'].values.astype(float)
            low = df['low'].values.astype(float)
            volume = df['volume'].values.astype(float)

            # Moving Averages
            df['sma_5'] = talib.SMA(close, timeperiod=5)
            df['sma_10'] = talib.SMA(close, timeperiod=10)
            df['sma_20'] = talib.SMA(close, timeperiod=20)
            df['sma_50'] = talib.SMA(close, timeperiod=50)
            df['sma_200'] = talib.SMA(close, timeperiod=200)
            df['ema_20'] = talib.EMA(close, timeperiod=20)
            df['ema_50'] = talib.EMA(close, timeperiod=50)

            # RSI
            df['rsi_14'] = talib.RSI(close, timeperiod=14)
            
            # ROC
            df['roc_10'] = talib.ROC(close, timeperiod=10)

            # ADX
            df['adx'] = talib.ADX(high, low, close, timeperiod=14)
            df['plus_di'] = talib.PLUS_DI(high, low, close, timeperiod=14)
            df['minus_di'] = talib.MINUS_DI(high, low, close, timeperiod=14)

            # MACD
            macd, macdsignal, macdhist = talib.MACD(close, fastperiod=12, slowperiod=26, signalperiod=9)
            df['macd'] = macd
            df['macd_signal'] = macdsignal

            # OBV
            df['obv'] = talib.OBV(close, volume)

            # AD Line (Accumulation/Distribution)
            df['ad_line'] = talib.AD(high, low, close, volume)

            # Parabolic SAR
            df['sar'] = talib.SAR(high, low, acceleration=0.02, maximum=0.2)

            # MFI
            df['mfi'] = talib.MFI(high, low, close, volume, timeperiod=14)
                
        except Exception as e:
            logger.warning(f"Error computing indicators: {e}")
        
        return df

    def _compute_indicators(self) -> None:
        """Compute technical indicators for the daily data."""
        if self.daily_data.empty:
            logger.error("No daily data available for computing indicators!")
            return

        self.daily_data.sort_values(['symbol', 'transaction_date'], inplace=True)
        
        # Process each symbol
        result_dfs = []
        for symbol, group in self.daily_data.groupby('symbol'):
            processed = self._compute_indicators_for_symbol(group)
            result_dfs.append(processed)
        
        if result_dfs:
            self.daily_data = pd.concat(result_dfs)

        # Compute breakout flags
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

    def _confirm_accumulation(self) -> np.ndarray:
        """Confirm accumulation patterns using both accumulation and daily OHLCV data."""
        if self.accumulation_data.empty or self.daily_data.empty:
            logger.warning("No accumulation or daily data available!")
            return np.array([])

        merged_data = pd.merge(
            self.accumulation_data.reset_index(),
            self.daily_data.reset_index(),
            on=['symbol', 'transaction_date'],
            how='inner'
        ).set_index('transaction_date')

        if merged_data.empty:
            return np.array([])

        def calculate_metrics(group: pd.DataFrame) -> pd.Series:
            net_volume = group['cumulative_net_volume'].sum()
            latest_date = group.index.max()
            latest_ad_line = group['ad_line'].iloc[-1] if 'ad_line' in group.columns and pd.notna(group['ad_line'].iloc[-1]) else 0
            latest_obv = group['obv'].iloc[-1] if 'obv' in group.columns and pd.notna(group['obv'].iloc[-1]) else 0
            return pd.Series({
                'net_volume': net_volume,
                'latest_date': latest_date,
                'ad_line': latest_ad_line,
                'obv': latest_obv
            })

        acc_metrics = merged_data.groupby('symbol', group_keys=True).apply(
            calculate_metrics, include_groups=False
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
        
        # Handle missing columns
        df['macd'] = df.get('macd', pd.Series(0, index=df.index))
        df['macd_signal'] = df.get('macd_signal', pd.Series(0, index=df.index))
        df['rsi_14'] = df.get('rsi_14', pd.Series(50, index=df.index))
        df['roc_10'] = df.get('roc_10', pd.Series(0, index=df.index))
        df['volume_breakout'] = df.get('volume_breakout', pd.Series(False, index=df.index))
        
        df['macd_bullish'] = df['macd'] > df['macd_signal']
        df['rsi_optimal'] = df['rsi_14'].between(40, 70)
        df['roc_momentum'] = df['roc_10'].between(5, 15)
        df['momentum_points'] = (
            df['macd_bullish'].astype(int) +
            df['rsi_optimal'].astype(int) +
            df['roc_momentum'].astype(int) +
            df['volume_breakout'].astype(int)
        )
        max_points = 4
        df['momentum_score'] = (df['momentum_points'] / max_points) * 100
        return df

    def _confirm_advanced_trend(self, momentum_data: pd.DataFrame) -> pd.DataFrame:
        """Confirm advanced trend patterns."""
        df = momentum_data.copy()

        # Handle missing columns with defaults
        for col in ['sma_5', 'sma_10', 'sma_20', 'sma_50', 'sma_200', 'adx', 'sar', 'close']:
            if col not in df.columns:
                df[col] = 0 if col != 'close' else df.get('close', 0)

        # Moving Average Crossovers
        # Moving Average Crossovers - Handle NaNs
        s5 = df['sma_5'].fillna(0)
        s10 = df['sma_10'].fillna(0)
        s20 = df['sma_20'].fillna(0)
        s50 = df['sma_50'].fillna(0)
        s200 = df['sma_200'].fillna(0)

        df['ma_5_10_bullish'] = s5 > s10
        df['ma_10_20_bullish'] = s10 > s20
        df['ma_20_50_bullish'] = s20 > s50
        df['ma_50_200_bullish'] = s50 > s200

        # SMA Slopes
        df['sma_5_slope'] = df['sma_5'].diff().fillna(0)
        df['sma_10_slope'] = df['sma_10'].diff().fillna(0)
        df['sma_20_slope'] = df['sma_20'].diff().fillna(0)

        # Trend Strength Score
        df['trend_strength_score'] = (
            df['ma_5_10_bullish'].astype(int) * 4 +
            df['ma_10_20_bullish'].astype(int) * 3 +
            df['ma_20_50_bullish'].astype(int) * 2 +
            df['ma_50_200_bullish'].astype(int) * 1 +
            (df['sma_5_slope'] > 0).astype(int) +
            (df['sma_20_slope'] > 0).astype(int)
        )

        # Trend Direction Classification
        df['trend_direction'] = np.select(
            [
                (df['sma_5'] > df['sma_10']) & (df['sma_10'] > df['sma_20']) & (df['adx'] > 25),
                (df['sma_5'] < df['sma_10']) & (df['sma_10'] < df['sma_20']) & (df['adx'] > 25),
                (df['sma_5'] > df['sma_10']) & (df['sma_10'] > df['sma_20']) & (df['adx'] <= 25),
                (df['sma_5'] < df['sma_10']) & (df['sma_10'] < df['sma_20']) & (df['adx'] <= 25),
                (df['sma_10'] < df['sma_5']) & (df['sma_10'] > df['sma_20']) & (df['adx'] > 20),
                (df['adx'] < 20)
            ],
            ['Strong Bullish', 'Strong Bearish', 'Weak Bullish', 'Weak Bearish', 'Transition', 'Sideways'],
            default='Neutral'
        )

        # Incorporate Parabolic SAR (handle missing sar)
        df['sar_trend'] = np.where(
            (df['sar'] > 0) & (df['close'] > df['sar']), 
            'Bullish', 
            np.where((df['sar'] > 0), 'Bearish', 'Neutral')
        )

        # Refine Trend Direction with SAR Confirmation
        df['trend_direction'] = np.select(
            [
                (df['trend_direction'] == 'Strong Bullish') & (df['sar_trend'] == 'Bullish'),
                (df['trend_direction'] == 'Strong Bearish') & (df['sar_trend'] == 'Bearish'),
                (df['trend_direction'].isin(['Weak Bullish', 'Transition'])) & (df['sar_trend'] == 'Bullish'),
                (df['trend_direction'].isin(['Weak Bearish', 'Transition'])) & (df['sar_trend'] == 'Bearish'),
                (df['trend_direction'].isin(['Strong Bullish', 'Weak Bullish'])) & (df['sar_trend'] == 'Bearish'),
                (df['trend_direction'].isin(['Strong Bearish', 'Weak Bearish'])) & (df['sar_trend'] == 'Bullish'),
                (df['trend_direction'] == 'Sideways') & (df['sar_trend'] == 'Bullish'),
                (df['trend_direction'] == 'Sideways') & (df['sar_trend'] == 'Bearish')
            ],
            [
                'Confirmed Strong Bullish',
                'Confirmed Strong Bearish',
                'Confirmed Bullish',
                'Confirmed Bearish',
                'Weakening Bullish',
                'Weakening Bearish',
                'Range Bullish',
                'Range Bearish'
            ],
            default='Neutral'
        )

        df['trend_direction'] = df['trend_direction'].fillna('Neutral')

        return df

    def _generate_signals(self, trend_data: pd.DataFrame) -> pd.DataFrame:
        """Generate trading signals based on trend data."""
        # Handle missing columns
        for col in ['close', 'sma_20', 'sma_50', 'sma_5', 'sma_10', 'macd', 'macd_signal', 
                    'roc_10', 'rsi_14', 'adx', 'volume_breakout']:
            if col not in trend_data.columns:
                trend_data[col] = 0 if col != 'volume_breakout' else False
        
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
        )

        max_points = 23
        trend_data['confidence_score'] = (trend_data['confidence_score'] / max_points) * 100

        # Adjust confidence score based on trend direction
        trend_data['confidence_score'] = np.where(
            trend_data['trend_direction'].isin([
                'Bullish', 'Weakening Bullish', 'Confirmed Strong Bullish',
                'Confirmed Bullish', 'Ranging Bullish', 'Range Bullish'
            ]),
            trend_data['confidence_score'],
            -trend_data['confidence_score']
        )

        # Assign signal types
        trend_data['signal_type'] = np.select(
            [
                trend_data['confidence_score'] >= 75,
                trend_data['confidence_score'] >= 50,
                trend_data['confidence_score'] >= 25,
                trend_data['confidence_score'] <= -75,
                trend_data['confidence_score'] <= -50,
                trend_data['confidence_score'] <= -25
            ],
            ['STRONG_BUY', 'BUY', 'WEAK_BUY', 'STRONG_SELL', 'SELL', 'WEAK_SELL'],
            default='NEUTRAL'
        )

        return trend_data

    def _generate_reason(self, row: pd.Series) -> str:
        """Generate a human-readable reason for the signal."""
        reasons = []
        
        if row['signal_type'] in ['BUY', 'STRONG_BUY', 'WEAK_BUY']:
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
        elif row['signal_type'] in ['SELL', 'STRONG_SELL', 'WEAK_SELL']:
            if pd.notna(row.get('rsi_14')) and row['rsi_14'] > 70:
                reasons.append("Overbought")
            if pd.notna(row.get('macd')) and pd.notna(row.get('macd_signal')) and row['macd'] < row['macd_signal']:
                reasons.append("MACD bearish")
            if not reasons:
                reasons.append("Distribution pattern detected")
        else:
            reasons.append("No clear signal")
        
        return "; ".join(reasons[:3])

    def execute(self, transaction_date: Optional[str] = None, sector: Optional[str] = None) -> List[Dict]:
        """
        Execute the strategy and return recommendations.
        
        Returns list of dicts with: symbol, signal, strength, reason, close, date
        """
        # Determine date range
        if transaction_date is None:
            # Get latest date from database
            latest = DailyStockPrice.objects.order_by('-date').first()
            if not latest:
                logger.warning("No price data available")
                return []
            end_date = latest.date
        else:
            end_date = datetime.strptime(transaction_date, "%Y-%m-%d").date()
        
        end_date_str = end_date.strftime("%Y-%m-%d")
        start_date = end_date - timedelta(days=365)
        start_date_str = start_date.strftime("%Y-%m-%d")
        
        logger.info(f"Executing Broker Accumulation Strategy for {end_date_str}...")

        # Get symbols from sector if specified
        symbols = None
        if sector and sector != 'All':
            symbols = list(
                Company.objects.filter(sector=sector)
                .values_list('symbol', flat=True)
            )
            if not symbols:
                logger.info(f"No active companies found in sector: {sector}")
                return []

        # Load data
        self.daily_data = self._load_daily_data(start_date_str, end_date_str, symbols)
        self.accumulation_data = self._load_accumulation_data(end_date_str, symbols)

        if self.daily_data.empty:
            logger.info("No daily data available.")
            return []

        # Compute indicators
        self._compute_indicators()

        # Confirm accumulation patterns
        accumulation_symbols = self._confirm_accumulation()
        if accumulation_symbols.size == 0:
            logger.info("No stocks passed accumulation criteria.")
            # Fall back to all symbols with technical analysis only
            accumulation_symbols = self.daily_data['symbol'].unique()

        # Filter to accumulated data
        accumulated_data = self.daily_data[
            self.daily_data['symbol'].isin(accumulation_symbols)
        ].copy()
        
        if accumulated_data.empty:
            logger.info("No data after accumulation filter.")
            return []

        # Confirm momentum
        momentum_data = self._confirm_momentum(accumulated_data)
        
        # Confirm trend
        trend_data = self._confirm_advanced_trend(momentum_data)
        
        # Generate signals
        final_signals = self._generate_signals(trend_data)

        # Filter to latest date only
        final_signals = final_signals.reset_index()
        max_date = final_signals['transaction_date'].max()
        final_signals = final_signals[final_signals['transaction_date'] == max_date]

        # Filter out NEUTRAL signals
        final_signals = final_signals[final_signals['signal_type'] != 'NEUTRAL']

        # Format output for API
        recommendations = []
        for _, row in final_signals.iterrows():
            signal = 'BUY' if 'BUY' in row['signal_type'] else 'SELL'
            strength = abs(row['confidence_score'])
            
            recommendations.append({
                'symbol': row['symbol'],
                'signal': signal,
                'strength': round(strength, 1),
                'reason': self._generate_reason(row),
                'close': float(row['close']) if pd.notna(row['close']) else 0,
                'date': max_date.strftime("%Y-%m-%d") if hasattr(max_date, 'strftime') else str(max_date),
                'trend_direction': row.get('trend_direction', 'Unknown'),
                'rsi': round(row['rsi_14'], 1) if pd.notna(row.get('rsi_14')) else None,
                'macd': round(row['macd'], 2) if pd.notna(row.get('macd')) else None,
            })

        # Sort by strength
        recommendations.sort(key=lambda x: x['strength'], reverse=True)
        
        logger.info(f"Generated {len(recommendations)} recommendations for {max_date}.")
        return recommendations

    def _build_history_market_signals(self, symbol: str, days: int = 90) -> pd.DataFrame:
        """Build the per-date market_signals DataFrame for `symbol` over `days`
        (filtered to the cutoff window). Returns an empty DataFrame if no data."""
        end_date = DailyStockPrice.objects.filter(ticker=symbol).order_by('-date').values_list('date', flat=True).first()
        if not end_date:
            return pd.DataFrame()

        end_date_dt = end_date
        start_date_dt = end_date_dt - timedelta(days=days + self.params.lookback_period)

        start_date_str = start_date_dt.strftime("%Y-%m-%d")
        end_date_str = end_date_dt.strftime("%Y-%m-%d")

        self.daily_data = self._load_daily_data(start_date_str, end_date_str, [symbol])
        if self.daily_data.empty:
            return pd.DataFrame()

        acc_start_dt = start_date_dt - timedelta(days=self.params.window_days * 2)

        acc_queryset = DailyCumulativeAccumulation.objects.filter(
            transaction_date__gte=acc_start_dt,
            transaction_date__lte=end_date_dt,
            symbol=symbol
        ).values('transaction_date', 'cumulative_net')

        acc_df = pd.DataFrame(list(acc_queryset))
        if acc_df.empty:
            self.accumulation_data = pd.DataFrame()
        else:
            acc_df['cumulative_net'] = pd.to_numeric(acc_df['cumulative_net'], errors='coerce')
            acc_df = acc_df.groupby('transaction_date')['cumulative_net'].sum().reset_index()
            acc_df.rename(columns={'cumulative_net': 'cumulative_net_volume'}, inplace=True)
            acc_df.set_index('transaction_date', inplace=True)
            self.accumulation_data = acc_df

        self._compute_indicators()

        if self.daily_data.empty:
            return pd.DataFrame()

        df = self.daily_data.copy()

        if not self.accumulation_data.empty:
            rolling_acc = self.accumulation_data['cumulative_net_volume'].rolling(
                window=self.params.window_days, min_periods=1
            ).sum()
            rolling_acc = rolling_acc.reindex(df.index, method='ffill').fillna(0)
            df['rolling_net_volume'] = rolling_acc
        else:
            df['rolling_net_volume'] = 0

        momentum_data = self._confirm_momentum(df)
        trend_data = self._confirm_advanced_trend(momentum_data)
        market_signals = self._generate_signals(trend_data)

        if market_signals.empty:
            return pd.DataFrame()

        # Ensure index is DatetimeIndex
        try:
            market_signals.index = pd.to_datetime(market_signals.index)
        except Exception:
            # Fallback if index isn't dates but 'date' column exists
            if 'date' in market_signals.columns:
                market_signals['date'] = pd.to_datetime(market_signals['date'])
                market_signals.set_index('date', inplace=True)

        # Sort by date descending
        market_signals = market_signals.sort_index(ascending=False)

        cutoff_date = end_date_dt - timedelta(days=days)
        market_signals = market_signals[market_signals.index.date >= cutoff_date]

        return market_signals

    def execute_history(self, symbol: str, days: int = 90) -> List[Dict]:
        """
        Generate signal history for a specific symbol and save to SignalEpisode (Backfill).
        Returns the history from DB.
        """
        from stocks.services.signal_episode.backfill import replay_producer_symbol
        from stocks.services.signal_episode.adapters import engine_reading

        rows = self.compute_history_rows(symbol, days)
        readings = [
            engine_reading(
                d=r["date"], signal=r["signal"], ltp=r["close"],
                strength=r.get("strength", 0),
                tier=r.get("trend_direction", ""),
                rationale=r.get("reason", ""),
                target=r.get("target"),
                stop=r.get("stop"),
                metadata=r.get("metadata", {}),
            )
            for r in rows
        ]
        replay_producer_symbol(source="BROKER_ACCUMULATION", strategy=None, symbol=symbol, readings=readings)
        return self.get_history_from_db(symbol, days)

    def compute_history_rows(self, symbol: str, days: int = 365) -> List[Dict]:
        """Return per-date signal dicts (NO DB writes) for episode backfill."""
        market_signals = self._build_history_market_signals(symbol, days)
        rows = []
        if market_signals.empty:
            return rows
        for dt, row in market_signals.iterrows():
            signal_type = row['signal_type']
            if signal_type == 'NEUTRAL':
                continue
            is_accumulated = (
                (row.get('rolling_net_volume', 0) > self.params.min_net_volume) and
                (row.get('ad_line', 0) > 0) and
                (row.get('obv', 0) > 0)
            )
            rows.append({
                "date": dt.date(),
                "signal": "BUY" if "BUY" in signal_type else "SELL",
                "close": float(row['close']),
                "strength": abs(row['confidence_score']),
                "reason": self._generate_reason(row),
                "trend_direction": row.get('trend_direction', ''),
                "target": None, "stop": None,
                "metadata": {"is_accumulated": bool(is_accumulated),
                             "rsi": row.get('rsi_14'), "macd": row.get('macd')},
            })
        return rows

    def get_history_from_db(self, symbol: str, days: int = 90) -> List[Dict]:
        from ..models import SignalEpisode

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


@api_view(['GET'])
@permission_classes([AllowAny])
def get_broker_accumulation_history(request):
    """
    Get signal history for a specific symbol.
    Triggers a backfill if no recent history exists (auto-healing).
    """
    symbol = request.query_params.get('symbol')
    if not symbol:
        return Response({'error': 'Symbol is required'}, status=400)
        
    try:
        engine = BrokerAccumulationRecommendationEngine()

        # Check if we have recent episodes
        from ..models import SignalEpisode
        recent_episode = SignalEpisode.objects.filter(
            source="BROKER_ACCUMULATION",
            symbol=symbol,
        ).order_by("-start_date").first()

        # If no episodes or last episode is old (> 5 days), trigger backfill
        should_backfill = True
        if recent_episode:
            latest_price_date = DailyStockPrice.objects.filter(ticker=symbol).order_by('-date').values_list('date', flat=True).first()
            if latest_price_date and recent_episode.start_date >= (latest_price_date - timedelta(days=5)):
                should_backfill = False

        if should_backfill:
            raw_history = engine.execute_history(symbol)
        else:
            raw_history = engine.get_history_from_db(symbol)
            
        # --- ENRICHMENT & PNL CALCULATION ---
        # 1. Fetch Company Metadata
        try:
            company = Company.objects.get(symbol=symbol)
            company_name = company.name
            sector = company.sector
        except Company.DoesNotExist:
            company_name = symbol
            sector = "Unknown"
            
        # 2. Fetch Latest Price
        latest_price_obj = DailyStockPrice.objects.filter(ticker=symbol).order_by('-date').first()
        current_price = latest_price_obj.close if latest_price_obj else 0.0
        
        # 3. Calculate PnL
        # Sort history by date ascending for calculation
        history_asc = sorted(raw_history, key=lambda x: x['date'])
        
        last_buy_price = None
        enriched_history = []
        
        for record in history_asc:
            new_record = record.copy()
            signal = record['signal']
            price = record['price']
            
            if signal == 'BUY':
                last_buy_price = price
            elif signal == 'SELL':
                if last_buy_price:
                    pnl_amount = price - last_buy_price
                    pnl_percent = (pnl_amount / last_buy_price) * 100
                    new_record['pnl_amount'] = round(pnl_amount, 2)
                    new_record['pnl_percent'] = round(pnl_percent, 2)
                    last_buy_price = None # Reset cycle
                else:
                    # Sell without Buy (or outside window)
                    new_record['pnl_amount'] = 0
                    new_record['pnl_percent'] = 0
            
            enriched_history.append(new_record)
            
        # Return descending for display
        enriched_history.reverse()
        
        response_data = {
            'symbol': symbol,
            'name': company_name,
            'sector': sector,
            'current_price': float(current_price),
            'history': enriched_history
        }
            
        return Response(response_data)
    except Exception as e:
        logger.exception(f"Error generating history for {symbol}")
        return Response({'error': str(e)}, status=500)

class SmartAccumulatedCrossoverRecommendationEngine:
    """
    Combines Broker Accumulation Data with Smart Crossover (EMA + MACD + BB).
    Universe: Only symbols present in DailyCumulativeAccumulation.
    Logic:
        BUY: MACD Hist > 0 AND 20 <= RSI <= 75 AND EMA_9 > EMA_26
        SELL: MACD Hist < 0 AND EMA_9 < EMA_26 AND Close < BB_Lower
    """

    def _compute_indicators(self, df: pd.DataFrame) -> pd.DataFrame:
        if df.empty:
            return df
            
        # Ensure numeric
        for col in ['close', 'high', 'low', 'volume']:
            if col in df.columns:
                df[col] = pd.to_numeric(df[col], errors='coerce')
        
        close = df['close'].values.astype(float)
        high = df['high'].values.astype(float)
        low = df['low'].values.astype(float)

        # EMAs
        df['ema_9'] = talib.EMA(close, timeperiod=9)
        df['ema_26'] = talib.EMA(close, timeperiod=26)
        
        # MACD (12, 26, 9)
        macd, macdsignal, macdhist = talib.MACD(close, fastperiod=12, slowperiod=26, signalperiod=9)
        df['macd'] = macd
        df['macd_signal'] = macdsignal
        df['macd_hist'] = macdhist
            
        # Bollinger Bands (20, 2)
        upper, middle, lower = talib.BBANDS(close, timeperiod=20, nbdevup=2, nbdevdn=2, matype=0)
        df['bb_upper'] = upper
        df['bb_middle'] = middle
        df['bb_lower'] = lower
            
        # RSI (14)
        df['rsi'] = talib.RSI(close, timeperiod=14)
        
        return df

    def _calculate_signal_strength(self, row, signal_type):
        """Calculate strength score (0-10) based on user logic."""
        score = 0
        macd_hist = row.get('macd_hist', 0)
        close = row.get('close', 0)
        
        # 1. MACD Strength
        abs_hist = abs(macd_hist)
        if abs_hist > 2.0: score += 3
        elif abs_hist > 1.0: score += 2
        elif abs_hist > 0.5: score += 1
        
        # MACD Direction Confirmation
        if (signal_type == 'BUY' and macd_hist > 0) or (signal_type == 'SELL' and macd_hist < 0):
            score += 1
            
        # 2. EMA Crossover Strength
        ema_diff = (row.get('ema_9', 0) or 0) - (row.get('ema_26', 0) or 0)
        if abs(ema_diff) > (close * 0.02): score += 2
        elif abs(ema_diff) > (close * 0.01): score += 1
        
        # 3. BB Confirmation
        if signal_type == 'BUY' and close > row.get('bb_lower', 0):
             score += 2 # Accumulation near bottom? Or just price valid? logic says: row['close'] > row['bb_lower']
             
        # Normalize to 0-100 for frontend (approx)
        # Max score approx 8. 
        # User logic returns raw score.
        
        return score

    def execute(self, transaction_date=None, sector=None):
        recommendations = []
        
        # 1. Define Universe: Accumulated Stocks ONLY
        # Logic: Find the latest date with significant coverage, then filter symbols.
        from django.db.models import Count, Max
        
        # Get dates with record counts
        date_counts = DailyCumulativeAccumulation.objects.values('transaction_date').annotate(
            count=Count('symbol', distinct=True)
        ).order_by('-transaction_date')
        
        # Find the most recent date with > 100 symbols (comprehensive data)
        latest_acc_date = None
        for d in date_counts:
            if d['count'] > 100:
                latest_acc_date = d['transaction_date']
                break
        
        if not latest_acc_date:
            # Fallback to the absolute latest date if no comprehensive date found
            latest_acc_date = date_counts[0]['transaction_date'] if date_counts else None
            
        if not latest_acc_date:
            logger.warning("No accumulation data found at all.")
            return []
            
        logger.info(f"Using accumulation data from {latest_acc_date} ({date_counts[0]['count'] if date_counts else 0} symbols available)")
        
        # Filter symbols with significant accumulation
        # Use a more reasonable threshold (50k instead of 200k)
        THRESHOLD = 50000 
        accumulated_symbols = set(
            DailyCumulativeAccumulation.objects.filter(
                transaction_date=latest_acc_date,
                cumulative_net__gt=THRESHOLD
            ).values_list('symbol', flat=True)
        )
        
        logger.info(f"Filtered to {len(accumulated_symbols)} symbols with net accumulation > {THRESHOLD} on {latest_acc_date}")
            
        # Filter by sector if needed
        if sector and sector != 'All':
            sector_symbols = set(Company.objects.filter(sector=sector).values_list('symbol', flat=True))
            accumulated_symbols = accumulated_symbols.intersection(sector_symbols)
            
        if not accumulated_symbols:
            logger.info("No accumulated symbols found after filtering.")
            return []
            
        # 2. Load Data
        target_date_obj = None
        if transaction_date:
            try:
                target_date_obj = datetime.strptime(transaction_date, '%Y-%m-%d').date()
            except (ValueError, TypeError):
                pass

        days_back = 90
        start_date = (target_date_obj or datetime.now().date()) - timedelta(days=days_back)
        
        for symbol in accumulated_symbols:
            # Load Data
            qs = DailyStockPrice.objects.filter(
                ticker=symbol, 
                date__gte=start_date
            ).order_by('date').values('date', 'close', 'high', 'low', 'volume')
            
            df = pd.DataFrame(list(qs))
            if df.empty or len(df) < 30: # Need enough for ema26
                continue
                
            df['date'] = pd.to_datetime(df['date'])
            df.set_index('date', inplace=True)
            
            # Compute Indicators
            df = self._compute_indicators(df)
            
            # Analyze Last Row (or target date)
            if target_date_obj:
                try:
                    # Find closest date <= target
                    # For simplicity, use exact or last available
                     row = df.loc[df.index <= pd.Timestamp(target_date_obj)].iloc[-1]
                except IndexError:
                    continue
            else:
                row = df.iloc[-1]
                
            # Logic
            # Handle NaNs
            macd_hist = row.get('macd_hist', 0) or 0
            rsi = row.get('rsi', 50) or 50
            ema_9 = row.get('ema_9', 0) or 0
            ema_26 = row.get('ema_26', 0) or 0
            close = row.get('close', 0)
            bb_lower = row.get('bb_lower', 0) or 0
            
            signal_type = None
            reason = []
            
            # BUY: MACD_Hist > 0 AND 20 <= RSI <= 75 AND EMA_9 > EMA_26
            if (macd_hist > 0) and (20 <= rsi <= 75) and (ema_9 > ema_26):
                signal_type = 'BUY'
                reason.append("Bullish MACD, RSI healthy, EMA Golden Cross")
                
            # SELL: MACD_Hist < 0 AND EMA_9 < EMA_26 AND Close < BB_Lower
            elif (macd_hist < 0) and (ema_9 < ema_26) and (close < bb_lower):
                signal_type = 'SELL'
                reason.append("Bearish MACD, EMA Death Cross, Price below BB Lower")
                
            if signal_type:
                # Find Crossover Date
                # Look back to find when this specific signal sequence started
                crossover_date = row.name
                crossover_price = float(close)
                if len(df) > 1:
                    # Get index of current row
                    current_idx = df.index.get_loc(row.name)
                    # Iterate backwards from current row
                    for i in range(current_idx - 1, -1, -1):
                        prev_row = df.iloc[i]
                        p_macd_hist = prev_row.get('macd_hist', 0) or 0
                        p_rsi = prev_row.get('rsi', 50) or 50
                        p_ema_9 = prev_row.get('ema_9', 0) or 0
                        p_ema_26 = prev_row.get('ema_26', 0) or 0
                        p_close = prev_row.get('close', 0)
                        p_bb_lower = prev_row.get('bb_lower', 0) or 0
                        
                        p_signal = None
                        if (p_macd_hist > 0) and (20 <= p_rsi <= 75) and (p_ema_9 > p_ema_26):
                            p_signal = 'BUY'
                        elif (p_macd_hist < 0) and (p_ema_9 < p_ema_26) and (p_close < p_bb_lower):
                            p_signal = 'SELL'
                        
                        if p_signal == signal_type:
                            crossover_date = prev_row.name
                            crossover_price = float(p_close)
                        else:
                            break
                
                # Calculate Strength
                raw_score = self._calculate_signal_strength(row, signal_type)
                strength = min(100, (raw_score / 8) * 100) 
                
                # Save to DB
                self._save_signal(
                    symbol=symbol,
                    date=row.name.date(),
                    signal=signal_type,
                    strength=strength,
                    reason="; ".join(reason),
                    close=float(close),
                    metadata={
                        'rsi': float(rsi), 
                        'macd_hist': float(macd_hist),
                        'crossover_date': crossover_date.strftime('%Y-%m-%d'),
                        'crossover_price': crossover_price
                    }
                )
                
                recommendations.append({
                    'symbol': symbol,
                    'signal': signal_type,
                    'strength': round(strength, 1),
                    'reason': "; ".join(reason),
                    'close': float(close),
                    'date': row.name.strftime('%Y-%m-%d'),
                    'crossover_date': crossover_date.strftime('%Y-%m-%d'),
                    'crossover_price': crossover_price,
                    'rsi': round(float(rsi), 1),
                    'macd_hist': round(float(macd_hist), 2)
                })
                
        return sorted(recommendations, key=lambda x: x['strength'], reverse=True)

    def _build_history_market_signals(self, symbol: str, days: int = 90) -> pd.DataFrame:
        """Build the per-date indicator DataFrame for `symbol` over `days`.
        Returns an empty DataFrame if no data or insufficient rows."""
        end_date = datetime.now().date()
        start_date = end_date - timedelta(days=days + 60)  # Buffer for indicators

        qs = DailyStockPrice.objects.filter(
            ticker=symbol,
            date__gte=start_date,
            date__lte=end_date,
        ).order_by('date').values('date', 'close', 'high', 'low', 'volume')

        df = pd.DataFrame(list(qs))
        if df.empty or len(df) < 30:
            return pd.DataFrame()

        df['date'] = pd.to_datetime(df['date'])
        df.set_index('date', inplace=True)
        df = self._compute_indicators(df)

        cutoff_dt = pd.Timestamp(end_date - timedelta(days=days))
        return df[df.index >= cutoff_dt]

    def compute_history_rows(self, symbol: str, days: int = 365) -> List[Dict]:
        """Return per-date signal dicts (NO DB writes) for episode backfill."""
        valid_df = self._build_history_market_signals(symbol, days)
        rows = []
        for date_idx, row in valid_df.iterrows():
            macd_hist = row.get('macd_hist', 0) or 0
            rsi = row.get('rsi', 50) or 50
            ema_9 = row.get('ema_9', 0) or 0
            ema_26 = row.get('ema_26', 0) or 0
            close = row.get('close', 0)
            bb_lower = row.get('bb_lower', 0) or 0

            if (macd_hist > 0) and (20 <= rsi <= 75) and (ema_9 > ema_26):
                signal_type = 'BUY'
                reason = "Bullish MACD, RSI healthy, EMA Golden Cross"
            elif (macd_hist < 0) and (ema_9 < ema_26) and (close < bb_lower):
                signal_type = 'SELL'
                reason = "Bearish MACD, EMA Death Cross, Price below BB Lower"
            else:
                continue

            raw_score = self._calculate_signal_strength(row, signal_type)
            strength = min(100, (raw_score / 8) * 100)

            rows.append({
                "date": date_idx.date(),
                "signal": signal_type,
                "close": float(close),
                "strength": strength,
                "reason": reason,
                "trend_direction": "",
                "target": None,
                "stop": None,
                "metadata": {"rsi": float(rsi), "macd_hist": float(macd_hist)},
            })
        return rows

    def execute_history(self, symbol: str, days: int = 90) -> List[Dict]:
        """Generate signal history for a symbol and save to SignalEpisode (Backfill)."""
        from stocks.services.signal_episode.backfill import replay_producer_symbol
        from stocks.services.signal_episode.adapters import engine_reading

        rows = self.compute_history_rows(symbol, days)
        readings = [
            engine_reading(
                d=r["date"], signal=r["signal"], ltp=r["close"],
                strength=r.get("strength", 0),
                tier=r.get("trend_direction", ""),
                rationale=r.get("reason", ""),
                target=r.get("target"),
                stop=r.get("stop"),
                metadata=r.get("metadata", {}),
            )
            for r in rows
        ]
        replay_producer_symbol(source="SMART_CROSSOVER", strategy=None, symbol=symbol, readings=readings)
        return self.get_history_from_db(symbol, days)

    def get_history_from_db(self, symbol: str, days: int = 90) -> List[Dict]:
        from ..models import SignalEpisode

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

@api_view(['GET'])
@permission_classes([AllowAny])
def get_broker_accumulation_recommendations(request):
    """
    Get broker accumulation recommendations for the latest date.
    """
    try:
        transaction_date = request.query_params.get('date')
        sector = request.query_params.get('sector')
        
        engine = BrokerAccumulationRecommendationEngine()
        recommendations = engine.execute(transaction_date=transaction_date, sector=sector)
        return Response(recommendations)
    except Exception as e:
        logger.exception("Error generating broker accumulation recommendations")
        return Response({'error': str(e)}, status=500)

@api_view(['GET'])
@permission_classes([AllowAny])
def get_smart_accumulated_crossover_recommendations(request):
    """
    Get Smart Accumulated Crossover recommendations.
    """
    try:
        transaction_date = request.query_params.get('date')
        sector = request.query_params.get('sector')
        
        engine = SmartAccumulatedCrossoverRecommendationEngine()
        recommendations = engine.execute(transaction_date=transaction_date, sector=sector)
        return Response(recommendations)
    except Exception as e:
        logger.exception("Error generating smart accumulated crossover recommendations")
        return Response({'error': str(e)}, status=500)

@api_view(['GET'])
@permission_classes([AllowAny])
def get_smart_accumulated_crossover_history(request):
    """
    Get signal history for Smart Accumulated Crossover.
    """
    symbol = request.query_params.get('symbol')
    if not symbol:
        return Response({'error': 'Symbol is required'}, status=400)
        
    try:
        engine = SmartAccumulatedCrossoverRecommendationEngine()

        # Check if we have recent episodes
        from ..models import SignalEpisode
        recent_episode = SignalEpisode.objects.filter(
            source="SMART_CROSSOVER",
            symbol=symbol,
        ).order_by("-start_date").first()

        should_backfill = True
        if recent_episode:
            latest_price_date = DailyStockPrice.objects.filter(ticker=symbol).order_by('-date').values_list('date', flat=True).first()
            if latest_price_date and recent_episode.start_date >= (latest_price_date - timedelta(days=5)):
                should_backfill = False

        if should_backfill:
            raw_history = engine.execute_history(symbol)
        else:
            raw_history = engine.get_history_from_db(symbol)
            
        # --- ENRICHMENT & PNL CALCULATION ---
        # 1. Fetch Company Metadata
        try:
            company = Company.objects.get(symbol=symbol)
            company_name = company.name
            sector = company.sector
        except Company.DoesNotExist:
            company_name = symbol
            sector = "Unknown"
            
        # 2. Fetch Latest Price
        latest_price_obj = DailyStockPrice.objects.filter(ticker=symbol).order_by('-date').first()
        current_price = latest_price_obj.close if latest_price_obj else 0.0
        
        # 3. Calculate PnL
        # Sort history by date ascending for calculation
        history_asc = sorted(raw_history, key=lambda x: x['date'])
        
        last_buy_price = None
        enriched_history = []
        
        for record in history_asc:
            new_record = record.copy()
            signal = record['signal']
            price = record['price']
            
            if signal == 'BUY':
                last_buy_price = price
            elif signal == 'SELL':
                if last_buy_price:
                    pnl_amount = price - last_buy_price
                    pnl_percent = (pnl_amount / last_buy_price) * 100
                    new_record['pnl_amount'] = round(pnl_amount, 2)
                    new_record['pnl_percent'] = round(pnl_percent, 2)
                    last_buy_price = None # Reset cycle
                else:
                    # Sell without Buy (or outside window)
                    new_record['pnl_amount'] = 0
                    new_record['pnl_percent'] = 0
            
            enriched_history.append(new_record)
            
        # Return descending for display
        enriched_history.reverse()
        
        return Response(response_data)
    except Exception as e:
        logger.exception(f"Error generating smart accumulated crossover history for {symbol}")
        return Response({'error': str(e)}, status=500)


# =============================================================================
# ICHIMOKU CLOUD + ACCUMULATION STRATEGY
# =============================================================================

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

    def _compute_indicators(self, df: pd.DataFrame) -> pd.DataFrame:
        if df.empty:
            return df
            
        # Ensure numeric
        for col in ['close', 'high', 'low', 'volume']:
            if col in df.columns:
                df[col] = pd.to_numeric(df[col], errors='coerce')
        
        close = df['close'].values.astype(float)
        high = df['high'].values.astype(float)
        low = df['low'].values.astype(float)

        # Manual Ichimoku Calculation for Parity
        high_9 = pd.Series(high).rolling(window=9).max()
        low_9 = pd.Series(low).rolling(window=9).min()
        df['tenkan'] = (high_9 + low_9) / 2
        
        high_26 = pd.Series(high).rolling(window=26).max()
        low_26 = pd.Series(low).rolling(window=26).min()
        df['kijun'] = (high_26 + low_26) / 2
        
        # Senkou Span A (Leading Span A)
        df['span_a'] = ((df['tenkan'] + df['kijun']) / 2)
        
        # Senkou Span B (Leading Span B)
        high_52 = pd.Series(high).rolling(window=52).max()
        low_52 = pd.Series(low).rolling(window=52).min()
        df['span_b'] = (high_52 + low_52) / 2
            
        # RSI (14)
        df['rsi'] = talib.RSI(close, timeperiod=14)
        
        # Cloud top/bottom for reference
        df['cloud_top'] = df[['span_a', 'span_b']].max(axis=1)
        df['cloud_bottom'] = df[['span_a', 'span_b']].min(axis=1)
        
        return df

    def _calculate_signal_strength(self, row, signal_type):
        """Calculate strength score (0-100) based on Ichimoku components."""
        score = 0
        close = row.get('close', 0) or 0
        span_a = row.get('span_a', 0) or 0
        span_b = row.get('span_b', 0) or 0
        tenkan = row.get('tenkan', 0) or 0
        kijun = row.get('kijun', 0) or 0
        rsi = row.get('rsi', 50) or 50
        
        if signal_type == 'BUY':
            # Cloud distance - how far above cloud
            cloud_top = max(span_a, span_b)
            if cloud_top > 0 and close > cloud_top:
                distance_pct = ((close - cloud_top) / cloud_top) * 100
                if distance_pct > 5: score += 3
                elif distance_pct > 2: score += 2
                else: score += 1
            
            # Tenkan/Kijun spread
            if tenkan > 0 and kijun > 0:
                tk_spread = ((tenkan - kijun) / kijun) * 100
                if tk_spread > 2: score += 2
                elif tk_spread > 0.5: score += 1
                
            # RSI confirmation
            if 40 <= rsi <= 60: score += 2  # Optimal
            elif 30 <= rsi <= 70: score += 1  # Acceptable
            
            # Cloud thickness (thicker = stronger support)
            cloud_thickness = abs(span_a - span_b)
            if cloud_top > 0 and (cloud_thickness / cloud_top) > 0.02:
                score += 1
                
        elif signal_type == 'SELL':
            # Cloud distance - how far below cloud
            cloud_bottom = min(span_a, span_b)
            if cloud_bottom > 0 and close < cloud_bottom:
                distance_pct = ((cloud_bottom - close) / cloud_bottom) * 100
                if distance_pct > 5: score += 3
                elif distance_pct > 2: score += 2
                else: score += 1
            
            # Tenkan/Kijun spread (bearish)
            if tenkan > 0 and kijun > 0:
                tk_spread = ((kijun - tenkan) / kijun) * 100
                if tk_spread > 2: score += 2
                elif tk_spread > 0.5: score += 1
                
            # RSI confirmation
            if rsi > 70: score += 2  # Overbought
            elif rsi > 60: score += 1
            
        # Normalize to 0-100 (max score ~9)
        return min(100, (score / 9) * 100)

    def execute(self, transaction_date=None, sector=None):
        recommendations = []
        
        # 1. Define Universe: Accumulated Stocks ONLY
        from django.db.models import Count
        
        date_counts = DailyCumulativeAccumulation.objects.values('transaction_date').annotate(
            count=Count('symbol', distinct=True)
        ).order_by('-transaction_date')
        
        latest_acc_date = None
        for d in date_counts:
            if d['count'] > 100:
                latest_acc_date = d['transaction_date']
                break
        
        if not latest_acc_date:
            latest_acc_date = date_counts[0]['transaction_date'] if date_counts else None
            
        if not latest_acc_date:
            logger.warning("No accumulation data found.")
            return []
            
        logger.info(f"Ichimoku strategy using accumulation data from {latest_acc_date}")
        
        # Filter symbols with significant accumulation
        THRESHOLD = 20000
        accumulated_symbols = set(
            DailyCumulativeAccumulation.objects.filter(
                transaction_date=latest_acc_date,
                cumulative_net__gt=THRESHOLD
            ).values_list('symbol', flat=True)
        )
        
        logger.info(f"Filtered to {len(accumulated_symbols)} symbols with net accumulation > {THRESHOLD}")


            
        # Filter by sector if needed
        if sector and sector != 'All':
            sector_symbols = set(Company.objects.filter(sector=sector).values_list('symbol', flat=True))
            accumulated_symbols = accumulated_symbols.intersection(sector_symbols)
            
        if not accumulated_symbols:
            logger.info("No accumulated symbols found after filtering.")
            return []
        
        logger.info(f"Checking Ichimoku signals for {len(accumulated_symbols)} symbols...")
        symbol_count = 0

            
        # 2. Load Data and Analyze
        target_date_obj = None
        if transaction_date:
            try:
                target_date_obj = datetime.strptime(transaction_date, '%Y-%m-%d').date()
            except (ValueError, TypeError):
                pass

        days_back = 180  # Increase history for better 52-period calculations
        start_date = (target_date_obj or datetime.now().date()) - timedelta(days=days_back)

        
        for symbol in accumulated_symbols:
            qs = DailyStockPrice.objects.filter(
                ticker=symbol, 
                date__gte=start_date
            ).order_by('date').values('date', 'close', 'high', 'low', 'volume')
            
            df = pd.DataFrame(list(qs))
            if df.empty or len(df) < 52:  # Need 52 for Senkou Span B
                continue
            
            df['date'] = pd.to_datetime(df['date'])
            df.set_index('date', inplace=True)

            
            # Compute Indicators
            df = self._compute_indicators(df)
            
            # Analyze Last Row
            if target_date_obj:
                try:
                    row = df.loc[df.index <= pd.Timestamp(target_date_obj)].iloc[-1]
                except IndexError:
                    continue
            else:
                row = df.iloc[-1]
                
            # Extract values with NaN handling
            close = row.get('close', 0) or 0
            span_a = row.get('span_a') 
            span_b = row.get('span_b')
            tenkan = row.get('tenkan')
            kijun = row.get('kijun')
            rsi = row.get('rsi', 50) or 50
            
            # Skip if Ichimoku not computed
            if pd.isna(span_a) or pd.isna(span_b) or pd.isna(tenkan) or pd.isna(kijun):
                continue
                
            span_a = float(span_a)
            span_b = float(span_b)
            tenkan = float(tenkan)
            kijun = float(kijun)
            
            signal_type = None
            reason = []
            
            # BUY: Price ABOVE Cloud AND Tenkan > Kijun AND RSI healthy
            above_cloud = close > span_a and close > span_b
            tk_bullish = tenkan > kijun
            rsi_healthy = 30 <= rsi <= 70
            
            if above_cloud and tk_bullish and rsi_healthy:
                signal_type = 'BUY'
                reason.append("Price above Ichimoku Cloud")
                reason.append("Tenkan-sen > Kijun-sen (Bullish)")
                if 40 <= rsi <= 60:
                    reason.append("RSI in optimal range")
            
            # Debug some symbols that ARE above cloud but miss other criteria
            if above_cloud:
                pass # print(f"DEBUG: {symbol} is above cloud but tk_bullish={tk_bullish} rsi_healthy={rsi_healthy}")

                    
            # SELL: Price BELOW Cloud AND Tenkan < Kijun
            # Refining to be below BOTH spans for a stronger sell signal
            below_cloud = close < span_a and close < span_b
            tk_bearish = tenkan < kijun
            
            if below_cloud and tk_bearish:
                signal_type = 'SELL'
                reason.append("Price below Ichimoku Cloud")
                reason.append("Tenkan-sen < Kijun-sen (Bearish)")
                if rsi > 70:
                    reason.append("RSI overbought")
            
            if signal_type:
                symbol_count += 1
                logger.info(f"Signal found for {symbol}: {signal_type}")

                    
            if signal_type:
                # Find Crossover Date
                crossover_date = row.name
                crossover_price = float(close)
                
                if len(df) > 1:
                    current_idx = df.index.get_loc(row.name)
                    for i in range(current_idx - 1, -1, -1):
                        prev_row = df.iloc[i]
                        p_close = prev_row.get('close', 0) or 0
                        p_span_a = prev_row.get('span_a')
                        p_span_b = prev_row.get('span_b')
                        p_tenkan = prev_row.get('tenkan')
                        p_kijun = prev_row.get('kijun')
                        p_rsi = prev_row.get('rsi', 50) or 50
                        
                        if pd.isna(p_span_a) or pd.isna(p_span_b):
                            break
                            
                        p_above_cloud = p_close > p_span_a and p_close > p_span_b
                        p_below_cloud = p_close < p_span_a or p_close < p_span_b
                        p_tk_bullish = (p_tenkan or 0) > (p_kijun or 0)
                        p_tk_bearish = (p_tenkan or 0) < (p_kijun or 0)
                        
                        p_signal = None
                        if p_above_cloud and p_tk_bullish and (30 <= p_rsi <= 70):
                            p_signal = 'BUY'
                        elif p_below_cloud and p_tk_bearish:
                            p_signal = 'SELL'
                        
                        if p_signal == signal_type:
                            crossover_date = prev_row.name
                            crossover_price = float(p_close)
                        else:
                            break
                
                # Calculate Strength
                strength = self._calculate_signal_strength(row, signal_type)
                
                # Save to DB
                self._save_signal(
                    symbol=symbol,
                    date=row.name.date(),
                    signal=signal_type,
                    strength=strength,
                    reason="; ".join(reason),
                    close=float(close),
                    metadata={
                        'rsi': float(rsi), 
                        'span_a': span_a,
                        'span_b': span_b,
                        'crossover_date': crossover_date.strftime('%Y-%m-%d'),
                        'crossover_price': crossover_price
                    }
                )
                
                recommendations.append({
                    'symbol': symbol,
                    'signal': signal_type,
                    'strength': round(strength, 1),
                    'reason': "; ".join(reason),
                    'close': float(close),
                    'date': row.name.strftime('%Y-%m-%d'),
                    'crossover_date': crossover_date.strftime('%Y-%m-%d'),
                    'crossover_price': crossover_price,
                    'rsi': round(float(rsi), 1),
                    'macd_hist': 0  # Not used but keeping for frontend compatibility
                })
                
        return sorted(recommendations, key=lambda x: x['strength'], reverse=True)

    def _build_history_market_signals(self, symbol: str, days: int = 90) -> pd.DataFrame:
        """Build the per-date indicator DataFrame for `symbol` over `days`.
        Returns an empty DataFrame if no data or insufficient rows."""
        end_date = datetime.now().date()
        start_date = end_date - timedelta(days=days + 120)  # Buffer for Ichimoku

        qs = DailyStockPrice.objects.filter(
            ticker=symbol,
            date__gte=start_date,
            date__lte=end_date,
        ).order_by('date').values('date', 'close', 'high', 'low', 'volume')

        df = pd.DataFrame(list(qs))
        if df.empty or len(df) < 60:
            return pd.DataFrame()

        df['date'] = pd.to_datetime(df['date'])
        df.set_index('date', inplace=True)
        df = self._compute_indicators(df)

        cutoff_dt = pd.Timestamp(end_date - timedelta(days=days))
        return df[df.index >= cutoff_dt]

    def compute_history_rows(self, symbol: str, days: int = 365) -> List[Dict]:
        """Return per-date signal dicts (NO DB writes) for episode backfill."""
        valid_df = self._build_history_market_signals(symbol, days)
        rows = []
        for date_idx, row in valid_df.iterrows():
            close = row.get('close', 0) or 0
            span_a = row.get('span_a')
            span_b = row.get('span_b')
            tenkan = row.get('tenkan')
            kijun = row.get('kijun')
            rsi = row.get('rsi', 50) or 50

            if pd.isna(span_a) or pd.isna(span_b):
                continue

            span_a = float(span_a)
            span_b = float(span_b)
            tenkan = float(tenkan) if not pd.isna(tenkan) else 0
            kijun = float(kijun) if not pd.isna(kijun) else 0

            above_cloud = close > span_a and close > span_b
            below_cloud = close < span_a or close < span_b
            tk_bullish = tenkan > kijun
            tk_bearish = tenkan < kijun

            if above_cloud and tk_bullish and (30 <= rsi <= 70):
                signal_type = 'BUY'
                reason = "Price above Cloud; Bullish TK Cross"
            elif below_cloud and tk_bearish:
                signal_type = 'SELL'
                reason = "Price below Cloud; Bearish TK Cross"
            else:
                continue

            strength = self._calculate_signal_strength(row, signal_type)

            rows.append({
                "date": date_idx.date(),
                "signal": signal_type,
                "close": float(close),
                "strength": strength,
                "reason": reason,
                "trend_direction": "",
                "target": None,
                "stop": None,
                "metadata": {"rsi": float(rsi), "span_a": span_a, "span_b": span_b},
            })
        return rows

    def execute_history(self, symbol: str, days: int = 90) -> List[Dict]:
        """Generate signal history for a symbol and save to SignalEpisode (Backfill)."""
        from stocks.services.signal_episode.backfill import replay_producer_symbol
        from stocks.services.signal_episode.adapters import engine_reading

        rows = self.compute_history_rows(symbol, days)
        readings = [
            engine_reading(
                d=r["date"], signal=r["signal"], ltp=r["close"],
                strength=r.get("strength", 0),
                tier=r.get("trend_direction", ""),
                rationale=r.get("reason", ""),
                target=r.get("target"),
                stop=r.get("stop"),
                metadata=r.get("metadata", {}),
            )
            for r in rows
        ]
        replay_producer_symbol(source="ICHIMOKU", strategy=None, symbol=symbol, readings=readings)
        return self.get_history_from_db(symbol, days)

    def get_history_from_db(self, symbol: str, days: int = 90) -> List[Dict]:
        from ..models import SignalEpisode

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
                'macd_hist': 0,  # Not applicable for Ichimoku
            })
        return history


@api_view(['GET'])
@permission_classes([AllowAny])
def get_ichimoku_accumulation_recommendations(request):
    """
    Get Ichimoku Cloud + Accumulation recommendations.
    """
    try:
        transaction_date = request.query_params.get('date')
        sector = request.query_params.get('sector')
        
        engine = IchimokuAccumulationRecommendationEngine()
        recommendations = engine.execute(transaction_date=transaction_date, sector=sector)
        return Response(recommendations)
    except Exception as e:
        logger.exception("Error generating ichimoku accumulation recommendations")
        return Response({'error': str(e)}, status=500)


@api_view(['GET'])
@permission_classes([AllowAny])
def get_ichimoku_accumulation_history(request):
    """
    Get signal history for Ichimoku Cloud + Accumulation.
    """
    symbol = request.query_params.get('symbol')
    if not symbol:
        return Response({'error': 'Symbol is required'}, status=400)
        
    try:
        engine = IchimokuAccumulationRecommendationEngine()

        # Check if we have recent episodes
        from ..models import SignalEpisode
        recent_episode = SignalEpisode.objects.filter(
            source="ICHIMOKU",
            symbol=symbol,
        ).order_by("-start_date").first()

        should_backfill = True
        if recent_episode:
            latest_price_date = DailyStockPrice.objects.filter(ticker=symbol).order_by('-date').values_list('date', flat=True).first()
            if latest_price_date and recent_episode.start_date >= (latest_price_date - timedelta(days=5)):
                should_backfill = False

        if should_backfill:
            raw_history = engine.execute_history(symbol)
        else:
            raw_history = engine.get_history_from_db(symbol)
            
        # Fetch Company Metadata
        try:
            company = Company.objects.get(symbol=symbol)
            company_name = company.name
            sector = company.sector
        except Company.DoesNotExist:
            company_name = symbol
            sector = "Unknown"
            
        # Fetch Latest Price
        latest_price_obj = DailyStockPrice.objects.filter(ticker=symbol).order_by('-date').first()
        current_price = latest_price_obj.close if latest_price_obj else 0.0
        
        # Calculate PnL
        history_asc = sorted(raw_history, key=lambda x: x['date'])
        
        last_buy_price = None
        enriched_history = []
        
        for record in history_asc:
            new_record = record.copy()
            signal = record['signal']
            price = record['price']
            
            if signal == 'BUY':
                last_buy_price = price
            elif signal == 'SELL':
                if last_buy_price:
                    pnl_amount = price - last_buy_price
                    pnl_percent = (pnl_amount / last_buy_price) * 100
                    new_record['pnl_amount'] = round(pnl_amount, 2)
                    new_record['pnl_percent'] = round(pnl_percent, 2)
                    last_buy_price = None
                else:
                    new_record['pnl_amount'] = 0
                    new_record['pnl_percent'] = 0
            
            enriched_history.append(new_record)
            
        enriched_history.reverse()
        
        response_data = {
            'symbol': symbol,
            'name': company_name,
            'sector': sector,
            'current_price': float(current_price),
            'history': enriched_history
        }
            
        return Response(response_data)
    except Exception as e:
        logger.exception(f"Error generating ichimoku accumulation history for {symbol}")
        return Response({'error': str(e)}, status=500)
