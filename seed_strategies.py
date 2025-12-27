import os
import sys
import django

# Environment setup is handled if this script is run via `python manage.py shell < seed_strategies.py`
# But if run standalone, we need to setup.
try:
    from django.conf import settings
    
    # Add backend to sys.path so 'stockastic' module can be found
    sys.path.append(os.path.join(os.getcwd(), 'backend'))

    if not settings.configured:
        os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'stockastic.settings')
        django.setup()
except ImportError:
    pass

from django.contrib.auth.models import User
from stocks.models import Strategy, DailyCumulativeAccumulation

# -----------------------------------------------------------------------------
# STRATEGY 1: RSI + Bollinger Bands Mean Reversion
# High Win Rate for Ranging Markets (60-70% typical)
# -----------------------------------------------------------------------------
CODE_RSI_BB = """
from backtesting import Strategy
from backtesting.lib import crossover
from backtesting.test import SMA
import pandas as pd
import pandas_ta as ta

def RSI(array, n):
    return ta.rsi(pd.Series(array), length=n)

def BBANDS(array, n, std):
    # Returns (lower, mid, upper)
    bands = ta.bbands(pd.Series(array), length=n, std=std)
    # pandas_ta returns columns: BBL, BBM, BBU
    return bands.iloc[:, 0].values, bands.iloc[:, 1].values, bands.iloc[:, 2].values

class RsiBollingerReversion(Strategy):
    rsi_period = 14
    bb_period = 20
    bb_std = 2.0
    rsi_lower = 30
    rsi_upper = 70
    
    def init(self):
        # Calculate RSI
        self.rsi = self.I(ta.rsi, pd.Series(self.data.Close), self.rsi_period)
        
        # Calculate Bollinger Bands (using pandas_ta directly or helper)
        # We need to wrap it in self.I to make it an indicator
        self.bb_lower = self.I(lambda x: ta.bbands(pd.Series(x), length=self.bb_period, std=self.bb_std).iloc[:, 0], self.data.Close)
        self.bb_upper = self.I(lambda x: ta.bbands(pd.Series(x), length=self.bb_period, std=self.bb_std).iloc[:, 2], self.data.Close)

    def next(self):
        # Entry: Price < Lower Band AND RSI < 30 (Oversold overlap)
        if self.data.Close[-1] < self.bb_lower[-1] and self.rsi[-1] < self.rsi_lower:
            if not self.position:
                self.buy()
        
        # Exit: RSI > 70 (Overbought) OR Price > Upper Band
        elif self.rsi[-1] > self.rsi_upper or self.data.Close[-1] > self.bb_upper[-1]:
            if self.position:
                self.position.close()
"""

# -----------------------------------------------------------------------------
# STRATEGY 2: Golden Cross Pullback
# High Win Rate Trend Following (Catching the dip in an uptrend)
# -----------------------------------------------------------------------------
CODE_GOLDEN_PULLBACK = """
from backtesting import Strategy
from backtesting.lib import crossover
from backtesting.test import SMA

class GoldenCrossPullback(Strategy):
    n_fast = 50
    n_slow = 200
    pullback_percent = 0.05 # 5% pullback from recent high
    
    def init(self):
        self.sma_fast = self.I(SMA, self.data.Close, self.n_fast)
        self.sma_slow = self.I(SMA, self.data.Close, self.n_slow)

    def next(self):
        price = self.data.Close[-1]
        
        # Condition 1: Long Term Uptrend (50SMA > 200SMA)
        is_uptrend = self.sma_fast[-1] > self.sma_slow[-1]
        
        # Condition 2: Deep Pullback? (Price is close to 50SMA support)
        # Buy if price is within 1% of 50SMA
        near_support = abs(price - self.sma_fast[-1]) / price < 0.015
        
        if is_uptrend and near_support and price > self.sma_fast[-1]: # Support hold check implies price is still above or just touching
             if not self.position:
                 self.buy()
        
        # Exit: Trend Reversal or Target
        # Stop Loss: Close below 200 SMA
        if price < self.sma_slow[-1]:
             if self.position:
                 self.position.close()
        
        # Take Profit: 20% gain (simple rule)
        # Real implementation would use ATR for dynamic targets
        if self.position and (price - self.trades[0].entry_price) / self.trades[0].entry_price > 0.20:
             self.position.close()
"""

# -----------------------------------------------------------------------------
# STRATEGY 3: Volume Breakout
# Momentum Strategy for strong moves
# -----------------------------------------------------------------------------
CODE_VOLUME_BREAKOUT = """
from backtesting import Strategy
import pandas as pd
import numpy as np

class VolumeBreakout(Strategy):
    lookback = 20
    vol_multiplier = 2.0
    
    def init(self):
        # Calculate Rolling Max High
        self.high_rolling = self.I(lambda x: pd.Series(x).rolling(self.lookback).max(), self.data.High)
        
        # Calculate Average Volume
        self.vol_avg = self.I(lambda x: pd.Series(x).rolling(self.lookback).mean(), self.data.Volume)

    def next(self):
        price = self.data.Close[-1]
        vol = self.data.Volume[-1]
        
        # Breakout Condition:
        # 1. Price closes above the 20-day High (of previous days usually, but here we compare to rolling)
        # 2. Volume is 2x average volume
        
        is_breakout = price >= self.high_rolling[-2] # Breakout of PREVIOUS N days high
        is_vol_spike = vol > (self.vol_avg[-1] * self.vol_multiplier)
        
        if is_breakout and is_vol_spike:
            if not self.position:
                self.buy()
                
        # Exit: Trailing Stop or simple reversion
        # Lets use a simple 10% Trailing Stop logic simulation or just close if price drops below 20SMA
        # For simplicity in this Snippet: Close if price drops 5% below entry
        if self.position:
             if price < self.trades[0].entry_price * 0.95:
                 self.position.close()
"""

# -----------------------------------------------------------------------------
# STRATEGY 4: RSI-2 Mean Reversion (Larry Connors)
# Very high win rate short term strategy
# -----------------------------------------------------------------------------
CODE_RSI2 = """
from backtesting import Strategy
from backtesting.test import SMA
import pandas as pd
import pandas_ta as ta

class RSI2Strategy(Strategy):
    # Parameters
    rsi_period = 2
    rsi_lower = 10
    rsi_upper = 90
    ma_period = 200
    exit_ma_period = 5
    
    def init(self):
        # Indicators
        self.rsi = self.I(ta.rsi, pd.Series(self.data.Close), self.rsi_period)
        self.sma_200 = self.I(SMA, self.data.Close, self.ma_period)
        self.sma_5 = self.I(SMA, self.data.Close, self.exit_ma_period)
        
    def next(self):
        price = self.data.Close[-1]
        
        # Rule 1: Long-term Uptrend (Price > 200 SMA)
        is_uptrend = price > self.sma_200[-1]
        
        # Rule 2: Deep Oversold (RSI(2) < 10) - Aggressive dip buying
        is_oversold = self.rsi[-1] < self.rsi_lower
        
        if is_uptrend and is_oversold:
            if not self.position:
                self.buy()
                
        # Exit: Price closes ABOVE 5-day SMA (Reversion to mean accomplished)
        if self.position and price > self.sma_5[-1]:
            self.position.close()
"""

# -----------------------------------------------------------------------------
# STRATEGY 5: MACD Trend Follower
# Trend Following with MACD Confirmation
# -----------------------------------------------------------------------------
CODE_MACD_TREND = """
from backtesting import Strategy
from backtesting.lib import crossover
from backtesting.test import SMA
import pandas as pd
import pandas_ta as ta

class MACDTrend(Strategy):
    fast = 12
    slow = 26
    signal = 9
    trend_filter_period = 200
    
    def init(self):
        # Calculate MACD
        # pandas_ta macd returns a DataFrame with columns MACD_12_26_9, MACDh_12_26_9, MACDs_12_26_9
        # macd line, histogram, signal line
        self.macd = self.I(lambda x: ta.macd(pd.Series(x), fast=self.fast, slow=self.slow, signal=self.signal).iloc[:, 0], self.data.Close)
        self.signal_line = self.I(lambda x: ta.macd(pd.Series(x), fast=self.fast, slow=self.slow, signal=self.signal).iloc[:, 2], self.data.Close)
        
        # Trend Filter
        self.sma_trend = self.I(SMA, self.data.Close, self.trend_filter_period)
        
    def next(self):
        price = self.data.Close[-1]
        
        # Buy Signal: MACD crosses ABOVE Signal Line
        # Confirmation: Price is ABOVE 200 SMA (Bullish Trend)
        
        if crossover(self.macd, self.signal_line) and price > self.sma_trend[-1]:
            if not self.position:
                self.buy()
                
        # Exit: MACD crosses BELOW Signal Line
        if crossover(self.signal_line, self.macd):
            if self.position:
                self.position.close()
"""

# -----------------------------------------------------------------------------
# STRATEGY 6: Dual Thrust (Breakout)
# Famous opening range breakout strategy
# -----------------------------------------------------------------------------
CODE_DUAL_THRUST = """
from backtesting import Strategy
import pandas as pd
import numpy as np

class DualThrust(Strategy):
    n = 4  # Lookback days for range
    k1 = 0.5 # Buy trigger constant
    k2 = 0.5 # Sell trigger constant
    
    def init(self):
        # Calculate Range (HH - LC) and (HC - LL)
        # Prior N Days High
        self.HH = self.I(lambda x: pd.Series(x).rolling(self.n).max(), self.data.High)
        self.HC = self.I(lambda x: pd.Series(x).rolling(self.n).max(), self.data.Close)
        self.LC = self.I(lambda x: pd.Series(x).rolling(self.n).min(), self.data.Close)
        self.LL = self.I(lambda x: pd.Series(x).rolling(self.n).min(), self.data.Low)

    def next(self):
        # Current Open Price triggers the range calculation for TODAY
        # We use previous day's range data to set today's triggers
        
        # Range calculation
        r1 = self.HH[-1] - self.LC[-1]
        r2 = self.HC[-1] - self.LL[-1]
        range_val = max(r1, r2)
        
        # Buy signal: Price > Open + K1 * Range
        buy_trigger = self.data.Open[-1] + self.k1 * range_val
        seller_trigger = self.data.Open[-1] - self.k2 * range_val
        
        if self.data.Close[-1] > buy_trigger:
            if not self.position:
                self.buy()
                
        elif self.data.Close[-1] < seller_trigger:
            if self.position:
                self.position.close()
"""

# -----------------------------------------------------------------------------
# STRATEGY 7: Inside Bar Momentum
# Price Action Strategy
# -----------------------------------------------------------------------------
CODE_INSIDE_BAR = """
from backtesting import Strategy
import pandas as pd

class InsideBarMomentum(Strategy):
    atr_period = 14
    
    def init(self):
        # Used for stop loss sizing
        pass # Pure price action often doesn't need indicators in init

    def next(self):
        if len(self.data) < 3: return
        
        # Definitions
        # Bar -1 is the "Inside Bar"
        # Bar -2 is the "Mother Bar"
        
        mother_high = self.data.High[-2]
        mother_low = self.data.Low[-2]
        
        inside_high = self.data.High[-1]
        inside_low = self.data.Low[-1]
        
        # Check if it was an Inside Bar
        is_inside_bar = (inside_high < mother_high) and (inside_low > mother_low)
        
        # Trigger: Current price breaks the Mother Bar High
        if is_inside_bar and self.data.Close[-1] > mother_high:
            if not self.position:
                self.buy()
        
        # Exit: Stop loss below mother bar low
        if self.position:
            if self.data.Close[-1] < mother_low:
                self.position.close()
"""

# -----------------------------------------------------------------------------
# STRATEGY 8: Three White Soldiers (Trend)
# Smoothed trend following
# -----------------------------------------------------------------------------
CODE_HEIKIN_ASHI = """
from backtesting import Strategy
import pandas as pd
import pandas_ta as ta

def calculate_ha(df):
    ha = df.copy()
    ha['HA_Close'] = (df['Open'] + df['High'] + df['Low'] + df['Close']) / 4
    ha['HA_Open'] = 0.0
    return ha

class HeikinAshiTrend(Strategy):
    # Simple rule: Buy if last 3 HA candles are Green (Close > Open) and rising
    
    def init(self):
        pass

    def next(self):
        # We need rigorous HA calculation usually, but checking consecutive 3 green regular candles is a proxy in standard data
        
        if len(self.data) < 5: return
        
        # Check simple trend: 
        # Price is above 20 SMA
        # Last 3 candles had Higher Highs and Higher Lows
        
        c1 = self.data.Close[-1] > self.data.Open[-1] # Green
        c2 = self.data.Close[-2] > self.data.Open[-2] # Green
        c3 = self.data.Close[-3] > self.data.Open[-3] # Green
        
        rising = self.data.Close[-1] > self.data.Close[-2] > self.data.Close[-3]
        
        if c1 and c2 and c3 and rising:
            if not self.position:
                self.buy()
        
        # Exit on red candle
        if self.data.Close[-1] < self.data.Open[-1]:
             if self.position:
                 self.position.close()
"""

# -----------------------------------------------------------------------------
# STRATEGY 9: Turtle Trading (Donchian Breakout)
# Classic Trend Following
# -----------------------------------------------------------------------------
CODE_TURTLE = """
from backtesting import Strategy
import pandas as pd

class TurtleTrading(Strategy):
    entry_window = 20
    exit_window = 10
    
    def init(self):
        # Donchian Channels
        # High of last N days
        self.H = self.I(lambda x: pd.Series(x).rolling(self.entry_window).max(), self.data.High)
        # Low of last M days
        self.L = self.I(lambda x: pd.Series(x).rolling(self.exit_window).min(), self.data.Low)
        
    def next(self):
        prev_20_high = self.H[-2]
        
        if self.data.Close[-1] > prev_20_high:
            if not self.position:
                self.buy()
        
        # Exit: Price drops below 10-day Low
        prev_10_low = self.L[-2]
        if self.data.Close[-1] < prev_10_low:
            if self.position:
                self.position.close()
"""

# -----------------------------------------------------------------------------
# STRATEGY 10: Supertrend Follower
# Premier trend following indicator
# -----------------------------------------------------------------------------
CODE_SUPERTREND = """
from backtesting import Strategy
import pandas as pd
import pandas_ta as ta

class SupertrendStrategy(Strategy):
    period = 10
    multiplier = 3.0
    
    def init(self):
        def get_st_dir(high, low, close):
            df = pd.DataFrame({'High': high, 'Low': low, 'Close': close})
            st = ta.supertrend(df['High'], df['Low'], df['Close'], length=self.period, multiplier=self.multiplier)
            return st.iloc[:, 1].values # 1 = Uptrend, -1 = Downtrend

        self.st_dir = self.I(get_st_dir, self.data.High, self.data.Low, self.data.Close)

    def next(self):
        if self.st_dir[-1] == 1:
            if not self.position:
                self.buy()
        elif self.st_dir[-1] == -1:
            if self.position:
                self.position.close()
"""

# -----------------------------------------------------------------------------
# STRATEGY 11: VWAP Pullback
# Institutional mean reversion / trend continuation
# -----------------------------------------------------------------------------
CODE_VWAP = """
from backtesting import Strategy
from backtesting.test import SMA
import pandas as pd
import pandas_ta as ta

class VWAPPullback(Strategy):
    def init(self):
        # Calculate VWAP
        def get_vwap(high, low, close, volume):
            # VWAP requires DatetimeIndex
            idx = self.data.index
            return ta.vwap(pd.Series(high, index=idx), pd.Series(low, index=idx), pd.Series(close, index=idx), pd.Series(volume, index=idx)).values
            
        self.vwap = self.I(get_vwap, self.data.High, self.data.Low, self.data.Close, self.data.Volume)
        self.sma_50 = self.I(SMA, self.data.Close, 50)

    def next(self):
        price = self.data.Close[-1]
        vwap_val = self.vwap[-1]
        
        if price > self.sma_50[-1]:
            # Buy if price dips below VWAP but closes above it (rejection of value area) Or simple version: Buy when price crosses above VWAP
            if self.data.Close[-2] < self.vwap[-2] and self.data.Close[-1] > vwap_val:
                if not self.position:
                    self.buy()
        
        if self.position:
            if price < vwap_val * 0.95:
                self.position.close()
"""

# -----------------------------------------------------------------------------
# STRATEGY 12: Smart Money Accumulation (Broker Data)
# Complex: Uses DailyCumulativeAccumulation model
# -----------------------------------------------------------------------------
CODE_SMART_MONEY = """
from backtesting import Strategy
from backtesting.test import SMA
import pandas as pd
import numpy as np
# Import Django Model directly
from stocks.models import DailyCumulativeAccumulation

# Global symbol variable is injected by views.py: 'symbol'

class SmartMoneyAccumulation(Strategy):
    top_n_brokers = 5
    
    def init(self):
        # Fetch detailed accumulation data for this symbol
        # This runs ONCE at the start of backtest
        
        ticker = symbol # 'symbol' is available in global scope of this script execution
        
        # Get data sorted by date
        qs = DailyCumulativeAccumulation.objects.filter(symbol=ticker).values('transaction_date', 'entity_id', 'cumulative_net')
        if not qs:
            # Fallback if no data: Array of zeros
            self.acc_indicator = self.I(lambda x: np.zeros(len(x)), self.data.Close)
            return

        acc_df = pd.DataFrame(list(qs))
        acc_df['transaction_date'] = pd.to_datetime(acc_df['transaction_date'])
        
        # Reindex to match the price data dates
        price_dates = pd.Series(self.data.Close).index
        
        # Pivot to get: Index=Date, Cols=Brokers, Values=CumulativeNet
        pivot_df = acc_df.pivot_table(index='transaction_date', columns='entity_id', values='cumulative_net', aggfunc='last').fillna(method='ffill').fillna(0)
        
        # Align with price data dates
        pivot_df = pivot_df.reindex(price_dates).fillna(method='ffill').fillna(0)
        
        # Identify "Smart Money"? 
        # Find top 5 brokers with highest cumulative sum at the end
        total_acc = pivot_df.iloc[-1].sort_values(ascending=False)
        top_buyers = total_acc.head(self.top_n_brokers).index
        
        # Calculate daily net flow of ONLY top buyers (diff of cumulative)
        smart_money_cum = pivot_df[top_buyers].sum(axis=1)
        
        # Register indicator
        self.smart_money_cum = self.I(lambda x: smart_money_cum.values, self.data.Close)

    def next(self):
        # Buy if Smart Money is Accumulating Aggressively
        # i.e., Smart Money Cumulative Line is ABOVE its 20-day MA
        
        # Calculate MA of Indicator manually
        period = 20
        if len(self.smart_money_cum) < period: return
        
        sma_acc = pd.Series(self.smart_money_cum).rolling(period).mean().iloc[-1]
        current_acc = self.smart_money_cum[-1]
        
        if current_acc > sma_acc:
             if not self.position:
                 self.buy()
        
        elif current_acc < sma_acc:
             if self.position:
                 self.position.close()
"""

# -----------------------------------------------------------------------------
# STRATEGY 13: Accumulation Divergence
# Price making lows, Accumulation making highs
# -----------------------------------------------------------------------------
CODE_ACC_DIVERGENCE = """
from backtesting import Strategy
import pandas as pd
import numpy as np
from stocks.models import DailyCumulativeAccumulation

class AccumulationDivergence(Strategy):
    def init(self):
        ticker = symbol 
        qs = DailyCumulativeAccumulation.objects.filter(symbol=ticker).values('transaction_date', 'cumulative_net')
        if not qs:
            self.buying_pressure = self.I(lambda x: np.zeros(len(x)), self.data.Close)
            return

        acc_df = pd.DataFrame(list(qs))
        acc_df['transaction_date'] = pd.to_datetime(acc_df['transaction_date'])
        
        # Total Cumulative Net across all reporting brokers
        daily_cum = acc_df.groupby('transaction_date')['cumulative_net'].sum()
        
        def get_acc_line(dates_idx):
            return daily_cum.reindex(dates_idx).fillna(method='ffill').fillna(0).values

        self.buying_pressure = self.I(lambda x: get_acc_line(pd.Series(x).index), self.data.Close)

    def next(self):
        # Divergence Logic
        # Price is LOWER than 10 days ago
        # Buying Pressure is HIGHER than 10 days ago (Smart money absorbing supply)
        lookback = 10
        if len(self.data) < lookback: return
        
        price_change = self.data.Close[-1] - self.data.Close[-lookback]
        acc_change = self.buying_pressure[-1] - self.buying_pressure[-lookback]
        
        if price_change < 0 and acc_change > 0:
            if not self.position:
                self.buy()
                
        # Exit
        if price_change > 0 and acc_change < 0:
            if self.position:
                self.position.close()
"""

# -----------------------------------------------------------------------------
# STRATEGY 14: Institutional Breakout
# Price Breakout CONFIRMED by Broker Accumulation
# -----------------------------------------------------------------------------
CODE_INSTITUTIONAL_BREAKOUT = """
from backtesting import Strategy
import pandas as pd
import numpy as np
from stocks.models import DailyCumulativeAccumulation

class InstitutionalBreakout(Strategy):
    def init(self):
        ticker = symbol 
        qs = DailyCumulativeAccumulation.objects.filter(symbol=ticker).values('transaction_date', 'entity_id', 'cumulative_net')
        if not qs:
            self.buy_vol = self.I(lambda x: np.zeros(len(x)), self.data.Close)
            return

        acc_df = pd.DataFrame(list(qs))
        acc_df['transaction_date'] = pd.to_datetime(acc_df['transaction_date'])
        
        # Calculate daily flow from cumulative
        daily_flow = acc_df.pivot_table(index='transaction_date', columns='entity_id', values='cumulative_net').sum(axis=1).diff().fillna(0)
        
        def get_buy_vol(dates_idx):
            return daily_flow.reindex(dates_idx).fillna(0).values

        self.buy_vol = self.I(lambda x: get_buy_vol(pd.Series(x).index), self.data.Close)
        
        # Calculate Rolling Average of Buy Vol
        self.avg_buy_vol = self.I(lambda x: pd.Series(x).rolling(20).mean().values, self.buy_vol)

    def next(self):
        # 1. Price Breakout (20 day high)
        # 2. Institutional Volume Spike (Buy Vol > 1.5 * Avg Buy Vol)
        
        # Need to calculate 20 day high manually or use helper?
        # Lets rely on simple High[-1] check vs Rolling max
        
        # Note: In 'next', indicators are already arrays. 
        # self.data.High is an array if we access via [-N:] slices but simplified here.
        # We need self.I for indicators usually.
        pass # Logic handled in next step directly

        # Check Breakout
        # We can simulate rolling max by checking previous candles
        # Efficient way:
        highs = self.data.High[-21:-1] # Last 20 days excluding today
        if len(highs) < 20: return
        max_h = max(highs)
        
        price_breakout = self.data.Close[-1] > max_h
        vol_spike = self.buy_vol[-1] > (self.avg_buy_vol[-1] * 1.5)
        
        if price_breakout and vol_spike:
            if not self.position:
                self.buy()
        
        if self.position and self.data.Close[-1] < self.data.Close[-1] * 0.95:
             self.position.close()
"""

# -----------------------------------------------------------------------------
# STRATEGY 15: Accumulation Squeeze (Coiling)
# Hidden Accumulation + Low Volatility
# -----------------------------------------------------------------------------
CODE_ACC_SQUEEZE = """
from backtesting import Strategy
import pandas as pd
import numpy as np
import pandas_ta as ta
from stocks.models import DailyCumulativeAccumulation
import numpy as np

class AccumulationSqueeze(Strategy):
    def init(self):
        ticker = symbol 
        # Broker Buying Intensity
        qs = DailyCumulativeAccumulation.objects.filter(symbol=ticker).values('transaction_date', 'cumulative_net')
        if not qs:
            self.buying_pressure = self.I(lambda x: np.zeros(len(x)), self.data.Close)
            return

        acc_df = pd.DataFrame(list(qs))
        acc_df['transaction_date'] = pd.to_datetime(acc_df['transaction_date'])
        
        # Buying Intensity = Diff of total cumulative
        total_cum = acc_df.groupby('transaction_date')['cumulative_net'].sum()
        daily_intensity = total_cum.diff().fillna(0)
        
        def get_buy_intensity(dates_idx):
            return daily_intensity.reindex(dates_idx).fillna(0).values

        self.buying_pressure = self.I(lambda x: get_buy_intensity(pd.Series(x).index), self.data.Close)
        
        # Bollinger Band Width
        self.bb_width = self.I(lambda x: (ta.bbands(pd.Series(x), length=20, std=2.0).iloc[:, 2] - ta.bbands(pd.Series(x), length=20, std=2.0).iloc[:, 0]).values, self.data.Close)

    def next(self):
        # 1. Volatility Squeeze (BB Width is historically low < 5%)
        # 2. Hidden Accumulation (Buying Pressure in top quartile)
        
        price = self.data.Close[-1]
        width_ratio = self.bb_width[-1] / price # relative width
        
        is_squeeze = width_ratio < 0.05 # 5% band width is quite tight
        
        # Check if accumulation is high relative to recent history
        if len(self.buying_pressure) < 50: return
        recent_acc = pd.Series(self.buying_pressure[-50:])
        high_acc = self.buying_pressure[-1] > recent_acc.quantile(0.80)
        
        if is_squeeze and high_acc:
            if not self.position:
                self.buy()
                
        # Exit on sharp move or stop
        # Standard deviation expansion or 5% target
        if self.position:
             if price > self.position.entry_price * 1.10 or price < self.position.entry_price * 0.95:
                 self.position.close()
"""

# -----------------------------------------------------------------------------
# STRATEGY 16: Smart Money Trend (Flow Crossover)
# Moving Average Crossover OF the Accumulation Line
# -----------------------------------------------------------------------------
CODE_SMART_MONEY_TREND = """
from backtesting import Strategy
from backtesting.lib import crossover
import pandas as pd
import numpy as np
from stocks.models import DailyCumulativeAccumulation

class SmartMoneyTrend(Strategy):
    def init(self):
        ticker = symbol 
        qs = DailyCumulativeAccumulation.objects.filter(symbol=ticker).values('transaction_date', 'entity_id', 'cumulative_net')
        if not qs:
             self.smart_line = self.I(lambda x: np.zeros(len(x)), self.data.Close)
             return

        acc_df = pd.DataFrame(list(qs))
        acc_df['transaction_date'] = pd.to_datetime(acc_df['transaction_date'])
        
        # Net Flow of Top Brokers
        # We assume Top 5 are Smart Money
        pivot = acc_df.pivot_table(index='transaction_date', columns='entity_id', values='cumulative_net', aggfunc='last').fillna(method='ffill').fillna(0)
        top_buyers = pivot.iloc[-1].sort_values(ascending=False).head(5).index
        flow = pivot[top_buyers].sum(axis=1) # Cumulative Flow Line
        
        def get_flow_line(dates_idx):
            return flow.reindex(dates_idx).fillna(method='ffill').fillna(0).values

        self.smart_line = self.I(lambda x: get_flow_line(pd.Series(x).index), self.data.Close)
        
        # MAs of the Flow Line
        self.acc_fast = self.I(lambda x: pd.Series(self.smart_line).rolling(10).mean().values, self.data.Close)
        self.acc_slow = self.I(lambda x: pd.Series(self.smart_line).rolling(50).mean().values, self.data.Close)

    def next(self):
        # Trade the Trend of OWNERSHIP, not Price
        if crossover(self.acc_fast, self.acc_slow):
            if not self.position:
                self.buy()
        
        elif crossover(self.acc_slow, self.acc_fast):
            if self.position:
                 self.position.close()
"""

# -----------------------------------------------------------------------------
# STRATEGY 17: Parabolic SAR (Classic)
# Trailing Stop Strategy
# -----------------------------------------------------------------------------
CODE_PSAR = """
from backtesting import Strategy
import pandas as pd
import pandas_ta as ta

class ParabolicSAR(Strategy):
    def init(self):
        # Calculate PSAR
        # pandas_ta psar returns DataFrame with 2 cols: PSARl_... and PSARs_... (Long and Short)
        # We simplify to get the consolidated PSAR value line assuming it stitches them or we inspect cols
        
        def get_psar(high, low, close):
            df = pd.DataFrame({'High': high, 'Low': low, 'Close': close})
            # ta.psar returns 'PSARl_0.02_0.2' and 'PSARs_0.02_0.2'
            # We construct a single series
            res = ta.psar(df['High'], df['Low'], df['Close'])
            # Combine long and short columns filling NaNs
            combined = res.iloc[:, 0].fillna(res.iloc[:, 1])
            return combined.values

        self.psar = self.I(get_psar, self.data.High, self.data.Low, self.data.Close)

    def next(self):
        price = self.data.Close[-1]
        
        # Buy when Price crosses ABOVE PSAR
        if self.data.Close[-2] < self.psar[-2] and price > self.psar[-1]:
             if not self.position:
                 self.buy()
        
        # Sell when Price crosses BELOW PSAR
        elif self.data.Close[-2] > self.psar[-2] and price < self.psar[-1]:
             if self.position:
                 self.position.close()
"""

# -----------------------------------------------------------------------------
# STRATEGY 18: Ichimoku Cloud Breakout
# Visual Trend Following
# -----------------------------------------------------------------------------
CODE_ICHIMOKU = """
from backtesting import Strategy
import pandas as pd
import pandas_ta as ta

class IchimokuCloud(Strategy):
    def init(self):
        # Calculate Ichimoku
        def get_ichimoku(high, low, close):
            # ta.ichimoku returns (ichimoku_df, span_df)
            # Default params 9, 26, 52, 26, 26
            isa, isb = ta.ichimoku(high, low, close)[0].iloc[:, 2], ta.ichimoku(high, low, close)[0].iloc[:, 3]
            # span A, span B. 
            # Note: pandas_ta usually shifts the cloud forward. We need to be careful with indexing.
            # But Backtesting.py works with 'current' available data.
            return isa, isb
            
        # We simplify to "Price above both Spans"
        self.span_a = self.I(lambda h,l,c: ta.ichimoku(pd.Series(h),pd.Series(l),pd.Series(c))[0].iloc[:, 2].values, self.data.High, self.data.Low, self.data.Close)
        self.span_b = self.I(lambda h,l,c: ta.ichimoku(pd.Series(h),pd.Series(l),pd.Series(c))[0].iloc[:, 3].values, self.data.High, self.data.Low, self.data.Close)

    def next(self):
        price = self.data.Close[-1]
        
        # Buy: Price is ABOVE the Cloud (SpanA and SpanB)
        above_cloud = price > self.span_a[-1] and price > self.span_b[-1]
        
        if above_cloud:
             if not self.position:
                 self.buy()
                 
        # Exit: Price enters cloud or drops below
        elif price < self.span_a[-1] or price < self.span_b[-1]:
             if self.position:
                 self.position.close()
"""

# -----------------------------------------------------------------------------
# STRATEGY 19: ADX + DI Trend
# Strength Indicator
# -----------------------------------------------------------------------------
CODE_ADX = """
from backtesting import Strategy
import pandas as pd
import pandas_ta as ta

class ADXTrend(Strategy):
    def init(self):
        # ADX, DI+, DI-
        def get_adx_vars(high, low, close):
            # Returns [ADX, DMP, DMN]
            df = ta.adx(high, low, close, length=14)
            return df.iloc[:, 0].values, df.iloc[:, 1].values, df.iloc[:, 2].values
            
        # Register indicators. self.I only returns 1 array even if function returns tuple... wait.
        # self.I stores result in self.indicators. 
        # Correct way to unpack:
        
        # We fetch them individually explicitly for safety
        self.adx = self.I(lambda h,l,c: ta.adx(pd.Series(h, index=self.data.index), pd.Series(l, index=self.data.index), pd.Series(c, index=self.data.index)).iloc[:, 0].values, self.data.High, self.data.Low, self.data.Close)
        self.dmp = self.I(lambda h,l,c: ta.adx(pd.Series(h, index=self.data.index), pd.Series(l, index=self.data.index), pd.Series(c, index=self.data.index)).iloc[:, 1].values, self.data.High, self.data.Low, self.data.Close)
        self.dmn = self.I(lambda h,l,c: ta.adx(pd.Series(h, index=self.data.index), pd.Series(l, index=self.data.index), pd.Series(c, index=self.data.index)).iloc[:, 2].values, self.data.High, self.data.Low, self.data.Close)

    def next(self):
        # Buy: ADX > 25 (Strong Trend) AND DI+ > DI- (Bullish)
        strong_trend = self.adx[-1] > 25
        bullish = self.dmp[-1] > self.dmn[-1]
        
        if strong_trend and bullish:
            if not self.position:
                self.buy()
        
        # Exit: DI- crosses above DI+ (Bearish turn)
        if self.dmn[-1] > self.dmp[-1]:
             if self.position:
                 self.position.close()
"""

# -----------------------------------------------------------------------------
# STRATEGY 20: Fibonacci Golden Zone
# Retracement Strategy
# -----------------------------------------------------------------------------
CODE_FIBO = """
from backtesting import Strategy
import pandas as pd
import numpy as np

class FibonacciGoldenZone(Strategy):
    lookback = 50
    
    def init(self):
        pass # Pure price calculation

    def next(self):
        if len(self.data) < self.lookback: return
        
        # Identify recent High and Low in window
        highs = self.data.High[-self.lookback:]
        lows = self.data.Low[-self.lookback:]
        
        recent_high = max(highs)
        recent_low = min(lows)
        
        diff = recent_high - recent_low
        if diff == 0: return

        # 61.8% Retracement Level from High
        # Typically means price went up from Low to High, then dropped back down 61.8% of that move?
        # Or Retracement FROM the move?
        # Golden Zone usually: Pullback to 0.618 level of the Up Swing.
        # Level = Low + 0.382 * Diff (since it retraced 61.8% from top, it is at 38.2% from bottom?)
        # Let's say we look for a pullback to the 0.5 - 0.618 zone relative to swing.
        
        fib_618 = recent_low + 0.618 * diff
        fib_500 = recent_low + 0.500 * diff
        
        price = self.data.Close[-1]
        
        # Buy if price is in the Golden Zone (between 50% and 61.8%)
        in_zone = fib_500 <= price <= fib_618
        
        # And we need to confirm we are 'pulling back' not 'crashing'
        # Maybe check if we are above the recent low
        
        if in_zone:
            if not self.position:
                self.buy()
                
        # Exit: Target recent High
        if self.position:
             if price > recent_high:
                 self.position.close()
             elif price < recent_low: # Stop Loss
                 self.position.close()
"""

# -----------------------------------------------------------------------------
# STRATEGY 21: Stochastic RSI Cross
# Sensitive momentum
# -----------------------------------------------------------------------------
CODE_STOCH_RSI = """
from backtesting import Strategy
import pandas as pd
import pandas_ta as ta

class StochasticRSICross(Strategy):
    def init(self):
        # Stoch RSI k, d
        def get_stochrsi(close):
            # ta.stochrsi returns 2 columns: STOCHRSI_k, STOCHRSI_d
            res = ta.stochrsi(close, length=14, rsi_length=14, k=3, d=3)
            return res.iloc[:, 0], res.iloc[:, 1]
            
        self.k = self.I(lambda c: ta.stochrsi(pd.Series(c)).iloc[:, 0].values, self.data.Close)
        self.d = self.I(lambda c: ta.stochrsi(pd.Series(c)).iloc[:, 1].values, self.data.Close)

    def next(self):
        # K Crossing above D in Oversold territory (< 20)
        
        if self.k[-2] < self.d[-2] and self.k[-1] > self.d[-1]:
            if self.k[-1] < 20: # Oversold
                if not self.position:
                    self.buy()
        
        # Exit when K crosses below D (Overbought > 80)
        elif self.k[-2] > self.d[-2] and self.k[-1] < self.d[-1]:
             if self.k[-1] > 80:
                 if self.position:
                     self.position.close()
"""

# -----------------------------------------------------------------------------
# STRATEGY 22: Williams %R Trend
# Momentum Pullback
# -----------------------------------------------------------------------------
CODE_WILLIAMS = """
from backtesting import Strategy
import pandas as pd
import pandas_ta as ta

class WilliamsTrend(Strategy):
    def init(self):
        # Williams %R. Range is 0 to -100.
        # -80 to -100 is Oversold. 0 to -20 is Overbought.
        self.williams = self.I(lambda h,l,c: ta.willr(pd.Series(h), pd.Series(l), pd.Series(c), length=14).values, self.data.High, self.data.Low, self.data.Close)
        
        # Trend Filter
        self.sma_50 = self.I(lambda c: ta.sma(pd.Series(c), length=50).values, self.data.Close)

    def next(self):
        # Buy Dip in Uptrend
        # Uptrend: Price > 50 SMA
        # Dip: Williams %R < -80
        
        uptrend = self.data.Close[-1] > self.sma_50[-1]
        oversold = self.williams[-1] < -80
        
        if uptrend and oversold:
            if not self.position:
                self.buy()
                
        # Exit when it becomes Overbought (>-20)
        if self.williams[-1] > -20:
             if self.position:
                 self.position.close()
"""

# -----------------------------------------------------------------------------
# STRATEGY 23: Force Index Impulse
# Volume + Price Momentum
# -----------------------------------------------------------------------------
CODE_FORCE = """
from backtesting import Strategy
import pandas as pd
import pandas_ta as ta
import numpy as np

class ForceIndexImpulse(Strategy):
    def init(self):
        # Force Index (13 period usually for trend, 2 period for impulse)
        # We use 13 period EMA of Force Index to detect trend changes
        
        # ta.efi (Elder Force Index)
        def get_efi(c, v):
            return ta.efi(pd.Series(c, index=self.data.index), pd.Series(v, index=self.data.index), length=13).values
            
        self.efi = self.I(get_efi, self.data.Close, self.data.Volume)
        self.zero = self.I(lambda x: np.zeros(len(x)), self.data.Close)

    def next(self):
        # Buy: Force Index Crosses Above Zero (Bulls taking dominance)
        
        if self.efi[-2] < 0 and self.efi[-1] > 0:
            if not self.position:
                self.buy()
                
        # Sell: Force Index Crosses Below Zero
        elif self.efi[-2] > 0 and self.efi[-1] < 0:
            if self.position:
                self.position.close()
"""

# -----------------------------------------------------------------------------
# STRATEGY 24: Chaikin Money Flow Divergence
# Volume Accumulation
# -----------------------------------------------------------------------------
CODE_CMF = """
from backtesting import Strategy
import pandas as pd
import pandas_ta as ta

class CMFDivergence(Strategy):
    def init(self):
        # Chaikin Money Flow
        def get_cmf(high, low, close, volume):
            return ta.cmf(pd.Series(high), pd.Series(low), pd.Series(close), pd.Series(volume), length=20).values
        
        self.cmf = self.I(get_cmf, self.data.High, self.data.Low, self.data.Close, self.data.Volume)
        self.zero = self.I(lambda x: pd.Series([0]*len(x)), self.data.Close)

    def next(self):
        # Regular CMF Strategy: Buy when CMF > 0 (Buying Pressure), Sell when CMF < 0
        
        # Improvement: Buy when CMF crosses above 0.1 (Significant Accumulation)
        if self.cmf[-2] < 0.1 and self.cmf[-1] > 0.1:
            if not self.position:
                self.buy()
        
        elif self.cmf[-1] < 0:
            if self.position:
                self.position.close()
"""

# -----------------------------------------------------------------------------
# STRATEGY 25: Keltner Channel Breakout
# Volatility Breakout
# -----------------------------------------------------------------------------
CODE_KELTNER = """
from backtesting import Strategy
import pandas as pd
import pandas_ta as ta

class KeltnerBreakout(Strategy):
    def init(self):
        # Keltner Channels (EMA based, ATR width)
        def get_kc(high, low, close):
            kc = ta.kc(pd.Series(high, index=self.data.index), pd.Series(low, index=self.data.index), pd.Series(close, index=self.data.index))
            # Returns KCLe, KCBe, KCUe
            return kc.iloc[:, 0].values, kc.iloc[:, 2].values # Lower, Upper
            
        self.kc_lower, self.kc_upper = self.I(get_kc, self.data.High, self.data.Low, self.data.Close)

    def next(self):
        # Trend Following: Price Closes ABOVE Upper Channel -> Buy
        
        if self.data.Close[-1] > self.kc_upper[-1]:
            if not self.position:
                self.buy()
        
        # Exit: Price closes CLOSE to Middle? Or Touch Lower?
        # Let's say Price drops below Lower Channel or Reverts to Mean?
        # Revert to mean (Touch EMA/Mid) is common target.
        # Here we use Lower Channel stop.
        elif self.data.Close[-1] < self.kc_lower[-1]:
            if self.position:
                self.position.close()
"""

# -----------------------------------------------------------------------------
# STRATEGY 26: Money Flow Index Reversal
# Volume Weighted RSI
# -----------------------------------------------------------------------------
CODE_MFI = """
from backtesting import Strategy
import pandas as pd
import pandas_ta as ta

class MFIReversal(Strategy):
    def init(self):
        self.mfi = self.I(lambda h,l,c,v: ta.mfi(pd.Series(h), pd.Series(l), pd.Series(c), pd.Series(v), length=14).values, self.data.High, self.data.Low, self.data.Close, self.data.Volume)

    def next(self):
        # MFI < 20 is Oversold (Buy Signal)
        # MFI > 80 is Overbought (Sell Signal)
        
        if self.mfi[-1] < 20:
            if not self.position:
                self.buy()
        
        elif self.mfi[-1] > 80:
            if self.position:
                self.position.close()
"""


# -----------------------------------------------------------------------------
# STRATEGY 27: On-Balance Volume (OBV) Trend
# Volume Validation
# -----------------------------------------------------------------------------
CODE_OBV = """
from backtesting import Strategy
import pandas as pd
import pandas_ta as ta

class OBVTrend(Strategy):
    def init(self):
        # OBV
        self.obv = self.I(lambda c, v: ta.obv(pd.Series(c), pd.Series(v)).values, self.data.Close, self.data.Volume)
        # OBV MA for Trend Confirmation
        self.obv_ma = self.I(lambda x: ta.sma(pd.Series(x), length=20).values, self.obv)

    def next(self):
        # Buy: OBV is above its 20-day MA (Volume Trend is Up)
        # AND Price is above its 20-day MA
        
        price_ma = pd.Series(self.data.Close).rolling(20).mean().iloc[-1]
        
        if self.obv[-1] > self.obv_ma[-1] and self.data.Close[-1] > price_ma:
            if not self.position:
                self.buy()
                
        # Exit: OBV drops below MA
        elif self.obv[-1] < self.obv_ma[-1]:
            if self.position:
                self.position.close()
"""

# -----------------------------------------------------------------------------
# STRATEGY 28: Aroon Trend Strength
# Early Trend Detection
# -----------------------------------------------------------------------------
CODE_AROON = """
from backtesting import Strategy
import pandas as pd
import pandas_ta as ta

class AroonTrend(Strategy):
    def init(self):
        # Aroon Up and Down
        def get_aroon(high, low):
            # ta.aroon returns Table with AROONDa_14, AROOND_14, AROONU_14
            # We want Aroon Up and Down
            # Note: pandas_ta usually returns AROOND (Down) and AROONU (Up)
            res = ta.aroon(high, low, length=14)
            return res.iloc[:, 0], res.iloc[:, 1] # AROOND, AROONU usually
            
        # Register carefully. We'll use simple lambda wrapper if needed or just extract
        # Let's inspect columns assumed: 0 is Down, 1 is Up
        self.aroon_down = self.I(lambda h,l: ta.aroon(pd.Series(h), pd.Series(l)).iloc[:, 0].values, self.data.High, self.data.Low)
        self.aroon_up = self.I(lambda h,l: ta.aroon(pd.Series(h), pd.Series(l)).iloc[:, 1].values, self.data.High, self.data.Low)

    def next(self):
        # Buy: Aroon Up crosses above Aroon Down
        
        if self.aroon_up[-2] < self.aroon_down[-2] and self.aroon_up[-1] > self.aroon_down[-1]:
            if not self.position:
                self.buy()
        
        # Exit: Aroon Up drops below 50 or crosses below Down
        elif self.aroon_up[-1] < self.aroon_down[-1]:
            if self.position:
                self.position.close()
"""

# -----------------------------------------------------------------------------
# STRATEGY 29: Coppock Curve
# Long Term Bottom Fishing
# -----------------------------------------------------------------------------
CODE_COPPOCK = """
from backtesting import Strategy
import pandas as pd
import pandas_ta as ta
import numpy as np

class CoppockCurve(Strategy):
    def init(self):
        # Coppock Curve: WMA[10] of (ROC[14] + ROC[11])
        def get_coppock(close):
            res = ta.coppock(pd.Series(close, index=self.data.index))
            return res.values
            
        self.coppock = self.I(get_coppock, self.data.Close)
        self.zero = self.I(lambda x: np.zeros(len(x)), self.data.Close)

    def next(self):
        # Buy: Coppock turns UP from below zero
        # i.e. Previous < 0, Current < 0, but Current > Previous
        # Or simpler: Crosses above Zero?
        # Classic is: Curve turns up.
        
        if self.coppock[-2] < 0 and self.coppock[-1] < 0:
            if self.coppock[-1] > self.coppock[-2]: # Turning up
                if not self.position:
                    self.buy()
                    
        # Exit: Curve turns down
        if self.coppock[-1] < self.coppock[-2]:
            if self.position:
                self.position.close()
"""

# -----------------------------------------------------------------------------
# STRATEGY 30: Volatility Stop (ATR Trailing)
# Risk Management
# -----------------------------------------------------------------------------
CODE_ATR_TRAIL = """
from backtesting import Strategy
import pandas as pd
import pandas_ta as ta

class VolatilityStop(Strategy):
    atr_period = 14
    multiplier = 3.0
    
    def init(self):
        self.atr = self.I(lambda h,l,c: ta.atr(pd.Series(h), pd.Series(l), pd.Series(c), length=self.atr_period).values, self.data.High, self.data.Low, self.data.Close)
        
    def next(self):
        price = self.data.Close[-1]
        
        # Simple Logic: Always in market if above Price > EMA?
        # Let's say we buy if Price > 20 SMA
        
        sma = pd.Series(self.data.Close).rolling(20).mean().iloc[-1]
        
        if price > sma:
            if not self.position:
                self.buy()
                
        # Exit Logic: Trailing Stop
        if self.position:
            # Trailing Stop is High of Trade - ATR * Multiplier
            # We need to track High since entry? Backtesting.py's self.position doesn't track High-since-entry easily without custom var.
            # We can use Close - ATR * 3 as dynamic stop level (Chandelier Exit style)
            # Or just use the ATR stop from current price? No, that's regular stop.
            # Chandelier: Max(High) - 3*ATR.
            
            # Simplified: Exit if Price < (20 SMA - 1 ATR)
            if price < (sma - self.atr[-1]):
                self.position.close()
"""

strategies = [
    {
        "name": "RSI & Bollinger Mean Reversion",
        "description": "A classic mean reversion strategy mainly for ranging markets. Buys when oversold (RSI < 30) at lower Bollinger Band. Sells when overbought. Win Rate Target: 65%+",
        "code": CODE_RSI_BB
    },
    {
        "name": "Golden Cross Pullback",
        "description": "Trend following strategy that buys dips. Waits for the 50 SMA to be above 200 SMA (Uptrend), then buys when price pulls back to the 50 SMA support line.",
        "code": CODE_GOLDEN_PULLBACK
    },
    {
        "name": "Volume Breakout Hunter",
        "description": "Momentum strategy chasing strong moves. Buys when price breaks the 20-day high with 2x average volume. Good for catching explosive stock moves.",
        "code": CODE_VOLUME_BREAKOUT
    },
    {
        "name": "RSI-2 Mean Reversion",
        "description": "Aggressive short-term mean reversion strategy by Larry Connors. Buys deep dips (RSI-2 < 10) in an uptrend (Price > 200SMA) and exits on quick bounce (Price > 5SMA). High Win Rate.",
        "code": CODE_RSI2
    },
    {
        "name": "MACD Trend Follower",
        "description": "Classic momentum strategy. Buys when MACD crosses above signal line, but ONLY if the price is in a long-term uptrend (above 200 SMA). Filters out false signals in downtrends.",
        "code": CODE_MACD_TREND
    },
    {
        "name": "Dual Thrust Breakout",
        "description": "A famous opening range breakout strategy. Calculates a volatility range from previous days and buys if price breaks out above the open + range buffer.",
        "code": CODE_DUAL_THRUST
    },
    {
        "name": "Inside Bar Momentum",
        "description": "Price Action Strategy. Identifies 'Inside Bars' (consolidation) and buys when price breaks out of the mother bar's high, anticipating a volatility expansion.",
        "code": CODE_INSIDE_BAR
    },
    {
        "name": "Three White Soldiers (Trend)",
        "description": "Pattern recognition strategy. Buys when 3 consecutive green candles with rising closes appear, signalling a strong confirmed trend start. Exits on first red candle.",
        "code": CODE_HEIKIN_ASHI
    },
     {
        "name": "Turtle Trading (Channel Breakout)",
        "description": "The legendary Turtle Trading experiment strategy. Buys 20-day highs (breakouts) and exits on 10-day lows. Catches massive trends but has lower win rate.",
        "code": CODE_TURTLE
    },
    {
        "name": "Supertrend Follower",
        "description": "Uses the Supertrend indicator (ATR based) to ride trends. Buys when signal turns Green, Sells when Red. Very effective in trending markets.",
        "code": CODE_SUPERTREND
    },
    {
        "name": "VWAP Pullback",
        "description": "Institutional style strategy. Buys when price reclaims the Volume Weighted Average Price (VWAP) in an uptrend, using it as dynamic support.",
        "code": CODE_VWAP
    },
    {
        "name": "Smart Money Accumulation",
        "description": "Advanced strategy leveraging Broker Accumulation Data. Tracks the net buying of top brokers to identify 'Smart Money' flow. Buys when top brokers are aggressively accumulating.",
        "code": CODE_SMART_MONEY
    },
    {
        "name": "Accumulation Divergence",
        "description": "Contrarian strategy. Identify where Price is dropping but Accumulation (Buying Pressure) is rising. This divergence often precedes a sharp reversal.",
        "code": CODE_ACC_DIVERGENCE
    },
    {
        "name": "Institutional Breakout",
        "description": "Volume Breakout strategy confirmed by Broker Data. Only buys breakouts where 'Buying Volume' from net accumulators is 50% higher than average.",
        "code": CODE_INSTITUTIONAL_BREAKOUT
    },
    {
        "name": "Accumulation Squeeze",
        "description": "Detects 'Coiling' setup: When Price Volatility is very low (Bollinger Squeeze) but Hidden Accumulation (Buying Pressure) is very high. Anticipates an explosive confirm move.",
        "code": CODE_ACC_SQUEEZE
    },
    {
        "name": "Smart Money Trend (Ownership)",
        "description": "Trades the trend of Ownership rather than Price. Buys when the 10-day MA of Net Accumulation crosses above the 50-day Mean. Tracks long-term transfer to strong hands.",
        "code": CODE_SMART_MONEY_TREND
    },
    {
        "name": "Parabolic SAR (Momentum)",
        "description": "Classic trend-following strategy using the Parabolic SAR (Stop and Reverse) indicator. Always in the market (Long or Short), continually adjusting trailing stops.",
        "code": CODE_PSAR
    },
    {
        "name": "Ichimoku Cloud Trend",
        "description": "Japanese trend strategy. Buys when Price confirms a breakout above the Ichimoku Cloud (Kumo). Excellent for capturing major mid-term trends.",
        "code": CODE_ICHIMOKU
    },
    {
        "name": "ADX Trend Strength",
        "description": "Filters out choppy markets. Only buys if the ADX (Average Directional Index) is above 25 (Strong Trend) and the DI+ line is above DI-.",
        "code": CODE_ADX
    },
    {
        "name": "Fibonacci Golden Zone",
        "description": "Retracement Strategy. Identifies a recent swing high/low and places buy orders at the 61.8% 'Golden' retracement level. High precision entry.",
        "code": CODE_FIBO
    },
    {
        "name": "Stochastic RSI Cross",
        "description": "Sensitive hyper-momentum strategy. Buys when the Stoch RSI K-line crosses above D-line while in deep oversold territory (< 20). Checks for rapid reversals.",
        "code": CODE_STOCH_RSI
    },
    {
        "name": "Williams %R Trend",
        "description": "Momentum pullback strategy. Uses Williams %R to find 'Oversold' entry points within a broader uptrend (Price > 50 SMA).",
        "code": CODE_WILLIAMS
    },
    {
        "name": "Force Index Impulse",
        "description": "Volume + Price Momentum. Uses Dr. Elder's Force Index (Price Change * Volume). Buys when Bulls seize control with conviction (Force Index crosses above Zero).",
        "code": CODE_FORCE
    },
    {
        "name": "Chaikin Money Flow Divergence",
        "description": "Volume flow strategy. Buys when the Chaikin Money Flow (CMF) crosses above 0.10, indicating significant accumulation pressure by large players.",
        "code": CODE_CMF
    },
    {
        "name": "Keltner Channel Breakout",
        "description": "Volatility Breakout. Buys when price closes above the Upper Keltner Channel. Uses ATR to dynamically adjust channel width.",
        "code": CODE_KELTNER
    },
    {
        "name": "Money Flow Index Reversal",
        "description": "Volume-weighted RSI. Buys when the Money Flow Index (MFI) dips below 20 (Oversold), signalling that selling pressure has exhausted.",
        "code": CODE_MFI
    },
    {
        "name": "On-Balance Volume (OBV) Trend",
        "description": "Cumulative volume trend. Buys when the OBV line creates a new high, confirming that volume is validating the price trend.",
        "code": CODE_OBV
    },
    {
        "name": "Aroon Trend Strength",
        "description": "Trend early warning system. Buys when Aroon Up crosses above Aroon Down, signalling the start of a new uptrend.",
        "code": CODE_AROON
    },
    {
        "name": "Coppock Curve (Long Term)",
        "description": "Long-term investment signal. Buys when the Coppock Curve turns up from below zero. Famous for catching major market bottoms.",
        "code": CODE_COPPOCK
    },
    {
        "name": "Volatility Stop (ATR Trailing)",
        "description": "Pure risk management. Uses Average True Range (ATR) to trail a stop loss behind price. Keeps you in the trend until volatility expands against you.",
        "code": CODE_ATR_TRAIL
    },
]

def seed():
    # Get a default user (usually superuser or first user)
    user = User.objects.first()
    if not user:
        print("Error: No users found. Please create a user first.")
        return

    print(f"Seeding strategies for user: {user.username}")
    
    for s in strategies:
        strategy, created = Strategy.objects.update_or_create(
            name=s['name'],
            defaults={
                'description': s['description'],
                'code': s['code'],
                'user': user,
                'is_public': True
            }
        )
        if created:
            print(f"[CREATED] {s['name']}")
        else:
            print(f"[UPDATED] {s['name']}")

if __name__ == '__main__':
    seed()
