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
import pandas_ta as ta

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
        """Compute technical indicators for a single symbol's data using pandas_ta."""
        df = group.copy()
        
        # Ensure we have enough data
        if len(df) < 20:
            return df
        
        try:
            # Moving Averages
            df['sma_5'] = ta.sma(df['close'], length=5)
            df['sma_10'] = ta.sma(df['close'], length=10)
            df['sma_20'] = ta.sma(df['close'], length=20)
            df['sma_50'] = ta.sma(df['close'], length=50)
            df['sma_200'] = ta.sma(df['close'], length=200)
            df['ema_20'] = ta.ema(df['close'], length=20)
            df['ema_50'] = ta.ema(df['close'], length=50)

            # RSI
            df['rsi_14'] = ta.rsi(df['close'], length=14)
            
            # ROC
            df['roc_10'] = ta.roc(df['close'], length=10)

            # ADX
            adx_result = ta.adx(df['high'], df['low'], df['close'], length=14)
            if adx_result is not None and not adx_result.empty:
                if 'ADX_14' in adx_result.columns:
                    df['adx'] = adx_result['ADX_14'].values
                if 'DMP_14' in adx_result.columns:
                    df['plus_di'] = adx_result['DMP_14'].values
                if 'DMN_14' in adx_result.columns:
                    df['minus_di'] = adx_result['DMN_14'].values

            # MACD
            macd_result = ta.macd(df['close'], fast=12, slow=26, signal=9)
            if macd_result is not None and not macd_result.empty:
                macd_col = [c for c in macd_result.columns if 'MACD_' in c and 'h' not in c.lower() and 's' not in c.lower()]
                signal_col = [c for c in macd_result.columns if 'MACDs_' in c]
                if macd_col:
                    df['macd'] = macd_result[macd_col[0]].values
                if signal_col:
                    df['macd_signal'] = macd_result[signal_col[0]].values

            # OBV
            obv = ta.obv(df['close'], df['volume'])
            if obv is not None:
                df['obv'] = obv.values

            # AD Line (Accumulation/Distribution)
            ad = ta.ad(df['high'], df['low'], df['close'], df['volume'])
            if ad is not None:
                df['ad_line'] = ad.values

            # Parabolic SAR
            psar = ta.psar(df['high'], df['low'], df['close'])
            if psar is not None and not psar.empty:
                # Get the SAR value (either long or short)
                psar_l = [c for c in psar.columns if 'PSARl_' in c]
                psar_s = [c for c in psar.columns if 'PSARs_' in c]
                if psar_l and psar_s:
                    df['sar'] = psar[psar_l[0]].fillna(psar[psar_s[0]]).values
                elif psar_l:
                    df['sar'] = psar[psar_l[0]].values
                elif psar_s:
                    df['sar'] = psar[psar_s[0]].values

            # MFI
            mfi = ta.mfi(df['high'], df['low'], df['close'], df['volume'], length=14)
            if mfi is not None:
                df['mfi'] = mfi.values
                
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
                Company.objects.filter(sector=sector, status='A')
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

    def _get_or_create_strategy(self) -> 'Strategy':
        from ..models import Strategy
        from django.contrib.auth.models import User
        
        # We need a user to own the strategy
        user = User.objects.first()
        if not user:
             # Should not happen in normal usage, but handle gracefully
             # In dev, maybe create one? But let's assume one exists.
             raise Exception("No user found to assign strategy to.")

        strategy, _ = Strategy.objects.get_or_create(
            name='Broker Accumulation (Institutional)',
            defaults={
                'code': 'broker_accumulation_v1',
                'user': user
            }
        )
        return strategy

    def _save_signal(self, symbol: str, date: datetime.date, signal_type: str, strength: float, reason: str, close: float, metadata: Dict = None):
        from ..models import StrategySignal
        
        strategy = self._get_or_create_strategy()
        
        # Map signal type to model choices
        model_signal = 'NEUTRAL'
        if 'BUY' in signal_type:
            model_signal = 'BUY'
        elif 'SELL' in signal_type:
            model_signal = 'SELL'
            
        meta = metadata or {}
        meta.update({
            'strength': strength,
            'reason': reason,
        })

        StrategySignal.objects.update_or_create(
            strategy=strategy,
            symbol=symbol,
            date=date,
            defaults={
                'signal': model_signal,
                'last_close': close,
                'metadata': meta
            }
        )

    def execute_history(self, symbol: str, days: int = 90) -> List[Dict]:
        """
        Generate signal history for a specific symbol and save to DB (Backfill).
        Returns the history from DB.
        """
        end_date = DailyStockPrice.objects.filter(ticker=symbol).order_by('-date').values_list('date', flat=True).first()
        if not end_date:
            return []
            
        end_date_dt = end_date
        start_date_dt = end_date_dt - timedelta(days=days + self.params.lookback_period)
        
        start_date_str = start_date_dt.strftime("%Y-%m-%d")
        end_date_str = end_date_dt.strftime("%Y-%m-%d")
        
        self.daily_data = self._load_daily_data(start_date_str, end_date_str, [symbol])
        if self.daily_data.empty:
            return []
            
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
            return []

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
            return []
        
        if market_signals.empty:
            return []
        
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

        for date, row in market_signals.iterrows():
            is_accumulated = (
                (row.get('rolling_net_volume', 0) > self.params.min_net_volume) and
                (row.get('ad_line', 0) > 0) and
                (row.get('obv', 0) > 0)
            )
            
            signal_type = row['signal_type']
            if signal_type == 'NEUTRAL':
                continue
                
            # If we want to strictly enforce accumulation for BUYs even in history:
            # if 'BUY' in signal_type and not is_accumulated: continue
            
            strength = abs(row['confidence_score'])
            reason = self._generate_reason(row)
            
            self._save_signal(
                symbol=symbol,
                date=date.date(),
                signal_type=signal_type,
                strength=strength,
                reason=reason,
                close=float(row['close']),
                metadata={'is_accumulated': bool(is_accumulated)}
            )
            
        # Now fetch from DB to return consistent format
        return self.get_history_from_db(symbol, days)

    def get_history_from_db(self, symbol: str, days: int = 90) -> List[Dict]:
        from ..models import StrategySignal
        strategy = self._get_or_create_strategy()
        
        cutoff_date = datetime.now().date() - timedelta(days=days)
        
        signals = StrategySignal.objects.filter(
            strategy=strategy,
            symbol=symbol,
            date__gte=cutoff_date
        ).order_by('-date')
        
        history = []
        for s in signals:
            history.append({
                'date': s.date.strftime("%Y-%m-%d"),
                'signal': s.signal,
                'strength': round(s.metadata.get('strength', 0), 1),
                'price': float(s.last_close) if s.last_close else 0,
                'reason': s.metadata.get('reason', ''),
                'is_accumulated': s.metadata.get('is_accumulated', False)
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
        
        # Check if we have recent signals
        from ..models import StrategySignal
        strategy = engine._get_or_create_strategy()
        recent_signal = StrategySignal.objects.filter(
            strategy=strategy, 
            symbol=symbol
        ).order_by('-date').first()
        
        # If no signals or last signal is old (> 5 days), trigger backfill
        should_backfill = True
        if recent_signal:
            latest_price_date = DailyStockPrice.objects.filter(ticker=symbol).order_by('-date').values_list('date', flat=True).first()
            if latest_price_date and recent_signal.date >= (latest_price_date - timedelta(days=5)):
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

    def _get_or_create_strategy(self) -> 'Strategy':
        from ..models import Strategy
        from django.contrib.auth.models import User
        
        user = User.objects.first()
        strategy, _ = Strategy.objects.get_or_create(
            name='Smart Accumulated Crossover',
            defaults={
                'code': 'smart_accumulated_crossover_v1',
                'user': user
            }
        )
        return strategy

    def _compute_indicators(self, df: pd.DataFrame) -> pd.DataFrame:
        if df.empty:
            return df
            
        # Ensure numeric
        for col in ['close', 'high', 'low', 'volume']:
            if col in df.columns:
                df[col] = pd.to_numeric(df[col], errors='coerce')
        
        # Calculate Indicators using pandas_ta
        # EMAs
        df['ema_9'] = df.ta.ema(length=9)
        df['ema_26'] = df.ta.ema(length=26)
        
        # MACD (12, 26, 9)
        macd = df.ta.macd(fast=12, slow=26, signal=9)
        if macd is not None and not macd.empty:
            try:
                # Dynamic lookup
                macd_col = next(c for c in macd.columns if c.startswith('MACD_'))
                signal_col = next(c for c in macd.columns if c.startswith('MACDs_'))
                hist_col = next(c for c in macd.columns if c.startswith('MACDh_'))
                
                df['macd'] = macd[macd_col]
                df['macd_signal'] = macd[signal_col]
                df['macd_hist'] = macd[hist_col]
            except StopIteration:
                pass
            
        # Bollinger Bands (20, 2)
        bb = df.ta.bbands(length=20, std=2)
        if bb is not None and not bb.empty:
            # Dynamic lookup because pandas_ta naming can vary (e.g. BBU_20_2.0 vs BBU_20_2.0_2.0)
            try:
                upper_col = next(c for c in bb.columns if c.startswith('BBU'))
                middle_col = next(c for c in bb.columns if c.startswith('BBM'))
                lower_col = next(c for c in bb.columns if c.startswith('BBL'))
                
                df['bb_upper'] = bb[upper_col]
                df['bb_middle'] = bb[middle_col]
                df['bb_lower'] = bb[lower_col]
            except StopIteration:
                pass
            
        # RSI (14)
        df['rsi'] = df.ta.rsi(length=14)
        
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

    def _save_signal(self, symbol, date, signal, strength, reason, close, metadata=None):
        from ..models import StrategySignal
        strategy = self._get_or_create_strategy()
        
        StrategySignal.objects.update_or_create(
            strategy=strategy,
            symbol=symbol,
            date=date,
            defaults={
                'signal': signal,
                'last_close': close, 
                'metadata': {
                    'strength': strength,
                    'reason': reason,
                    **(metadata or {})
                }
            }
        )

    def execute_history(self, symbol: str, days: int = 90) -> List[Dict]:
        """Generate and save history for a symbol."""
        # 1. Load Data
        end_date = datetime.now().date()
        start_date = end_date - timedelta(days=days + 60) # Buffer for indicators
        
        qs = DailyStockPrice.objects.filter(
            ticker=symbol, 
            date__gte=start_date,
            date__lte=end_date
        ).order_by('date').values('date', 'close', 'high', 'low', 'volume')
        
        df = pd.DataFrame(list(qs))
        if df.empty or len(df) < 30:
            return []
            
        df['date'] = pd.to_datetime(df['date'])
        df.set_index('date', inplace=True)
        
        # 2. Indicators
        df = self._compute_indicators(df)
        
        # 3. Generate Signals Loop
        # We only want signals within 'days' window, but indicators computed on full range
        cutoff_dt = pd.Timestamp(end_date - timedelta(days=days))
        valid_df = df[df.index >= cutoff_dt]
        
        generated_signals = []
        
        for date_idx, row in valid_df.iterrows():
            macd_hist = row.get('macd_hist', 0) or 0
            rsi = row.get('rsi', 50) or 50
            ema_9 = row.get('ema_9', 0) or 0
            ema_26 = row.get('ema_26', 0) or 0
            close = row.get('close', 0)
            bb_lower = row.get('bb_lower', 0) or 0
            
            signal_type = None
            reason = ""
            
            if (macd_hist > 0) and (20 <= rsi <= 75) and (ema_9 > ema_26):
                signal_type = 'BUY'
                reason = "Bullish MACD, RSI healthy, EMA Golden Cross"
            elif (macd_hist < 0) and (ema_9 < ema_26) and (close < bb_lower):
                signal_type = 'SELL'
                reason = "Bearish MACD, EMA Death Cross, Price below BB Lower"
            else:
                 signal_type = 'NEUTRAL' # Or just skip? User code explicitly returns neutral.
                 # But frontend usually shows only Buy/Sell signals or history?
                 # History modal usually shows all points? No, usually just significant ones.
                 # Let's support BUY/SELL only to save space, or all? 
                 # User code `save_signals` saves ALL.
                 # But our StrategySignal model is better for sparse signals?
                 # Let's stick to relevant signals (Buy/Sell). Neutral clutters.
                 continue

            raw_score = self._calculate_signal_strength(row, signal_type)
            strength = min(100, (raw_score / 8) * 100)
            
            self._save_signal(
                symbol=symbol,
                date=date_idx.date(),
                signal=signal_type,
                strength=strength,
                reason=reason,
                close=float(close),
                metadata={'rsi': float(rsi), 'macd_hist': float(macd_hist)}
            )
            
            generated_signals.append({
                 'date': date_idx.strftime('%Y-%m-%d'),
                 'signal': signal_type,
                 'strength': round(strength, 1),
                 'price': float(close),
                 'reason': reason
            })
            
        return generated_signals # Return strictly what we generated, but endpoint usually fetches from DB
            
    def get_history_from_db(self, symbol: str, days: int = 90) -> List[Dict]:
        from ..models import StrategySignal
        strategy = self._get_or_create_strategy()
        cutoff_date = datetime.now().date() - timedelta(days=days)
        
        signals = StrategySignal.objects.filter(
            strategy=strategy,
            symbol=symbol,
            date__gte=cutoff_date
        ).order_by('-date')
        
        history = []
        for s in signals:
            history.append({
                'date': s.date.strftime("%Y-%m-%d"),
                'signal': s.signal,
                'strength': round(s.metadata.get('strength', 0), 1),
                'price': float(s.last_close) if s.last_close else 0,
                'reason': s.metadata.get('reason', ''),
                'rsi': round(s.metadata.get('rsi', 0), 1),
                'macd_hist': round(s.metadata.get('macd_hist', 0), 2)
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
        
        # Check if we have recent signals
        from ..models import StrategySignal
        strategy = engine._get_or_create_strategy()
        recent_signal = StrategySignal.objects.filter(
            strategy=strategy, 
            symbol=symbol
        ).order_by('-date').first()
        
        should_backfill = True
        if recent_signal:
            latest_price_date = DailyStockPrice.objects.filter(ticker=symbol).order_by('-date').values_list('date', flat=True).first()
            if latest_price_date and recent_signal.date >= (latest_price_date - timedelta(days=5)):
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
        logger.exception(f"Error generating smart accumulated crossover history for {symbol}")
        return Response({'error': str(e)}, status=500)

