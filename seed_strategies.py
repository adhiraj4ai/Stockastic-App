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
import pandas as pd
import numpy as np

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
import numpy as np

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
import numpy as np

class InsideBarMomentum(Strategy):
    # Inside-bar breakout: the PREVIOUS bar was an inside bar (contained by its
    # mother bar); enter when the CURRENT bar breaks the mother-bar high in a
    # long-term uptrend. (The original tested the breakout on the inside bar itself,
    # where Close < mother_high by definition — so it never traded.)
    trend_ema = 200
    atr_period = 14
    atr_mult = 2.5

    def init(self):
        H, L, C = pd.Series(self.data.High), pd.Series(self.data.Low), pd.Series(self.data.Close)
        self.ema_trend = self.I(lambda: ta.ema(C, self.trend_ema).values)
        self.atr = self.I(lambda: ta.atr(H, L, C, self.atr_period).values)

    def next(self):
        if len(self.data) < 4:
            return
        price = self.data.Close[-1]
        if self.position and not np.isnan(self.atr[-1]):
            new_sl = price - self.atr_mult * self.atr[-1]
            for trade in self.trades:
                if trade.sl is None or new_sl > trade.sl:
                    trade.sl = new_sl

        # mother = bar[-3], inside = bar[-2], breakout = current bar[-1]
        mother_high, mother_low = self.data.High[-3], self.data.Low[-3]
        inside_high, inside_low = self.data.High[-2], self.data.Low[-2]
        is_inside = inside_high < mother_high and inside_low > mother_low

        if is_inside and price > mother_high and price > self.ema_trend[-1] and not self.position:
            stop = min(inside_low, price - self.atr_mult * self.atr[-1])
            if stop < price:
                self.buy(sl=stop)
        elif price < self.ema_trend[-1] and self.position:
            self.position.close()
"""

# -----------------------------------------------------------------------------
# STRATEGY 8: Three White Soldiers (Trend)
# Smoothed trend following
# -----------------------------------------------------------------------------
CODE_HEIKIN_ASHI = """
from backtesting import Strategy
import pandas as pd

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
import numpy as np

class SupertrendStrategy(Strategy):
    # Supertrend trend-follower: enter on bullish flip inside a long-term uptrend,
    # ride the trend with the Supertrend line as a trailing stop.
    period = 10
    multiplier = 3.0
    trend_ema = 200

    def init(self):
        H, L, C = pd.Series(self.data.High), pd.Series(self.data.Low), pd.Series(self.data.Close)
        st = ta.supertrend(H, L, C, length=self.period, multiplier=self.multiplier)
        self.st_dir = self.I(lambda: st.iloc[:, 1].values)   # 1 up, -1 down
        self.st_line = self.I(lambda: st.iloc[:, 0].values)  # trailing line
        self.ema_trend = self.I(lambda: ta.ema(C, self.trend_ema).values)

    def next(self):
        price = self.data.Close[-1]
        # Trail the protective stop up to the Supertrend line.
        if self.position and not np.isnan(self.st_line[-1]):
            for trade in self.trades:
                if trade.sl is None or self.st_line[-1] > trade.sl:
                    trade.sl = self.st_line[-1]

        flipped_up = self.st_dir[-2] == -1 and self.st_dir[-1] == 1
        in_uptrend = price > self.ema_trend[-1]
        if flipped_up and in_uptrend and not self.position:
            stop = self.st_line[-1]
            if not np.isnan(stop) and stop < price:
                self.buy(sl=stop)
        elif self.st_dir[-1] == -1 and self.position:
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
import numpy as np

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
    # Follow the top brokers' cumulative net position: go long while their flow line
    # is above its MA AND price is in a long-term uptrend; ATR trailing stop.
    top_n_brokers = 5
    acc_ma = 20
    trend_ema = 200
    atr_period = 14
    atr_mult = 3.0

    def init(self):
        H, L, C = pd.Series(self.data.High), pd.Series(self.data.Low), pd.Series(self.data.Close)
        self.ema_trend = self.I(lambda: ta.ema(C, self.trend_ema).values)
        self.atr = self.I(lambda: ta.atr(H, L, C, self.atr_period).values)

        dates = self.data.index  # real DatetimeIndex — align accumulation onto price bars
        qs = DailyCumulativeAccumulation.objects.filter(symbol=symbol).values(
            'transaction_date', 'entity_id', 'cumulative_net')
        if not qs:
            self.smart_cum = self.I(lambda: np.zeros(len(dates)))
            self.smart_ma = self.I(lambda: np.zeros(len(dates)))
            return
        acc_df = pd.DataFrame(list(qs))
        acc_df['transaction_date'] = pd.to_datetime(acc_df['transaction_date'])
        pivot = acc_df.pivot_table(index='transaction_date', columns='entity_id',
                                   values='cumulative_net', aggfunc='last').ffill().fillna(0)
        pivot = pivot.reindex(dates).ffill().fillna(0)
        top = pivot.iloc[-1].sort_values(ascending=False).head(self.top_n_brokers).index
        line = pivot[top].sum(axis=1)
        self.smart_cum = self.I(lambda: line.values)
        self.smart_ma = self.I(lambda: line.rolling(self.acc_ma).mean().values)

    def next(self):
        price = self.data.Close[-1]
        if self.position and not np.isnan(self.atr[-1]):
            new_sl = price - self.atr_mult * self.atr[-1]
            for trade in self.trades:
                if trade.sl is None or new_sl > trade.sl:
                    trade.sl = new_sl

        accumulating = self.smart_cum[-1] > self.smart_ma[-1]
        if accumulating and price > self.ema_trend[-1] and not self.position:
            stop = price - self.atr_mult * self.atr[-1]
            if stop < price:
                self.buy(sl=stop)
        elif self.smart_cum[-1] < self.smart_ma[-1] and self.position:
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
    # Contrarian: buy bullish divergence (price falling while broker accumulation
    # rises — smart money absorbing supply). No trend filter (it is a reversal
    # signal by design); risk controlled with an ATR stop.
    lookback = 10
    atr_period = 14
    atr_mult = 3.0

    def init(self):
        H, L, C = pd.Series(self.data.High), pd.Series(self.data.Low), pd.Series(self.data.Close)
        self.atr = self.I(lambda: ta.atr(H, L, C, self.atr_period).values)

        dates = self.data.index
        qs = DailyCumulativeAccumulation.objects.filter(symbol=symbol).values(
            'transaction_date', 'cumulative_net')
        if not qs:
            self.buying_pressure = self.I(lambda: np.zeros(len(dates)))
            return
        acc_df = pd.DataFrame(list(qs))
        acc_df['transaction_date'] = pd.to_datetime(acc_df['transaction_date'])
        daily_cum = acc_df.groupby('transaction_date')['cumulative_net'].sum()
        line = daily_cum.reindex(dates).ffill().fillna(0)
        self.buying_pressure = self.I(lambda: line.values)

    def next(self):
        price = self.data.Close[-1]
        if self.position and not np.isnan(self.atr[-1]):
            new_sl = price - self.atr_mult * self.atr[-1]
            for trade in self.trades:
                if trade.sl is None or new_sl > trade.sl:
                    trade.sl = new_sl

        if len(self.data) < self.lookback:
            return
        price_change = self.data.Close[-1] - self.data.Close[-self.lookback]
        acc_change = self.buying_pressure[-1] - self.buying_pressure[-self.lookback]

        if price_change < 0 and acc_change > 0 and not self.position:
            stop = price - self.atr_mult * self.atr[-1]
            if stop < price:
                self.buy(sl=stop)
        elif price_change > 0 and acc_change < 0 and self.position:
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
    # Price breaks the prior N-day high WITH a broker buy-flow spike, inside a
    # long-term uptrend; ATR trailing stop, exit on trend break.
    lookback = 20
    vol_mult = 1.5
    trend_ema = 200
    atr_period = 14
    atr_mult = 3.0

    def init(self):
        H, L, C = pd.Series(self.data.High), pd.Series(self.data.Low), pd.Series(self.data.Close)
        self.ema_trend = self.I(lambda: ta.ema(C, self.trend_ema).values)
        self.atr = self.I(lambda: ta.atr(H, L, C, self.atr_period).values)
        # Prior-N-day high (shifted so today's bar is excluded).
        self.high_n = self.I(lambda: H.rolling(self.lookback).max().shift(1).values)

        dates = self.data.index
        qs = DailyCumulativeAccumulation.objects.filter(symbol=symbol).values(
            'transaction_date', 'entity_id', 'cumulative_net')
        if not qs:
            self.buy_vol = self.I(lambda: np.zeros(len(dates)))
            self.avg_buy_vol = self.I(lambda: np.zeros(len(dates)))
            return
        acc_df = pd.DataFrame(list(qs))
        acc_df['transaction_date'] = pd.to_datetime(acc_df['transaction_date'])
        flow = (acc_df.pivot_table(index='transaction_date', columns='entity_id',
                                   values='cumulative_net', aggfunc='last')
                .sum(axis=1).diff().fillna(0))
        flow = flow.reindex(dates).fillna(0)
        self.buy_vol = self.I(lambda: flow.values)
        self.avg_buy_vol = self.I(lambda: flow.rolling(self.lookback).mean().values)

    def next(self):
        price = self.data.Close[-1]
        if self.position and not np.isnan(self.atr[-1]):
            new_sl = price - self.atr_mult * self.atr[-1]
            for trade in self.trades:
                if trade.sl is None or new_sl > trade.sl:
                    trade.sl = new_sl

        breakout = not np.isnan(self.high_n[-1]) and price > self.high_n[-1]
        vol_spike = self.buy_vol[-1] > self.avg_buy_vol[-1] * self.vol_mult
        if breakout and vol_spike and price > self.ema_trend[-1] and not self.position:
            stop = price - self.atr_mult * self.atr[-1]
            if stop < price:
                self.buy(sl=stop)
        elif price < self.ema_trend[-1] and self.position:
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
from stocks.models import DailyCumulativeAccumulation
import numpy as np

class AccumulationSqueeze(Strategy):
    # Coiled volatility (tight Bollinger bands) + hidden accumulation (broker buying
    # intensity in its recent top quartile) inside a long-term uptrend. ATR trailing
    # stop; exit on trend break.
    squeeze_pct = 0.10
    acc_quantile = 0.70
    trend_ema = 200
    atr_period = 14
    atr_mult = 3.0

    def init(self):
        H, L, C = pd.Series(self.data.High), pd.Series(self.data.Low), pd.Series(self.data.Close)
        self.ema_trend = self.I(lambda: ta.ema(C, self.trend_ema).values)
        self.atr = self.I(lambda: ta.atr(H, L, C, self.atr_period).values)
        bb = ta.bbands(C, length=20, std=2.0)
        self.bb_width = self.I(lambda: (bb.iloc[:, 2] - bb.iloc[:, 0]).values)

        dates = self.data.index
        qs = DailyCumulativeAccumulation.objects.filter(symbol=symbol).values(
            'transaction_date', 'cumulative_net')
        if not qs:
            self.buying_pressure = self.I(lambda: np.zeros(len(dates)))
            return
        acc_df = pd.DataFrame(list(qs))
        acc_df['transaction_date'] = pd.to_datetime(acc_df['transaction_date'])
        intensity = acc_df.groupby('transaction_date')['cumulative_net'].sum().diff().fillna(0)
        intensity = intensity.reindex(dates).fillna(0).astype(float)
        self.buying_pressure = self.I(lambda: intensity.values)

    def next(self):
        price = self.data.Close[-1]
        if self.position and not np.isnan(self.atr[-1]):
            new_sl = price - self.atr_mult * self.atr[-1]
            for trade in self.trades:
                if trade.sl is None or new_sl > trade.sl:
                    trade.sl = new_sl

        if len(self.buying_pressure) < 50:
            return
        is_squeeze = (self.bb_width[-1] / price) < self.squeeze_pct
        recent = pd.Series(self.buying_pressure[-50:])
        high_acc = self.buying_pressure[-1] > recent.quantile(self.acc_quantile)
        if is_squeeze and high_acc and price > self.ema_trend[-1] and not self.position:
            stop = price - self.atr_mult * self.atr[-1]
            if stop < price:
                self.buy(sl=stop)
        elif price < self.ema_trend[-1] and self.position:
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
    # Trade the TREND OF OWNERSHIP: fast/slow MA crossover of the top brokers'
    # cumulative flow line, gated by a long-term price uptrend; ATR trailing stop.
    top_n_brokers = 5
    fast = 10
    slow = 50
    trend_ema = 200
    atr_period = 14
    atr_mult = 3.0

    def init(self):
        H, L, C = pd.Series(self.data.High), pd.Series(self.data.Low), pd.Series(self.data.Close)
        self.ema_trend = self.I(lambda: ta.ema(C, self.trend_ema).values)
        self.atr = self.I(lambda: ta.atr(H, L, C, self.atr_period).values)

        dates = self.data.index
        qs = DailyCumulativeAccumulation.objects.filter(symbol=symbol).values(
            'transaction_date', 'entity_id', 'cumulative_net')
        if not qs:
            self.acc_fast = self.I(lambda: np.zeros(len(dates)))
            self.acc_slow = self.I(lambda: np.zeros(len(dates)))
            return
        acc_df = pd.DataFrame(list(qs))
        acc_df['transaction_date'] = pd.to_datetime(acc_df['transaction_date'])
        pivot = acc_df.pivot_table(index='transaction_date', columns='entity_id',
                                   values='cumulative_net', aggfunc='last').ffill().fillna(0)
        top = pivot.iloc[-1].sort_values(ascending=False).head(self.top_n_brokers).index
        flow = pivot[top].sum(axis=1).reindex(dates).ffill().fillna(0)
        self.acc_fast = self.I(lambda: flow.rolling(self.fast).mean().values)
        self.acc_slow = self.I(lambda: flow.rolling(self.slow).mean().values)

    def next(self):
        price = self.data.Close[-1]
        if self.position and not np.isnan(self.atr[-1]):
            new_sl = price - self.atr_mult * self.atr[-1]
            for trade in self.trades:
                if trade.sl is None or new_sl > trade.sl:
                    trade.sl = new_sl

        if crossover(self.acc_fast, self.acc_slow) and price > self.ema_trend[-1] and not self.position:
            stop = price - self.atr_mult * self.atr[-1]
            if stop < price:
                self.buy(sl=stop)
        elif crossover(self.acc_slow, self.acc_fast) and self.position:
            self.position.close()
"""

# -----------------------------------------------------------------------------
# STRATEGY 17: Parabolic SAR (Classic)
# Trailing Stop Strategy
# -----------------------------------------------------------------------------
CODE_PSAR = """
from backtesting import Strategy
import pandas as pd

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
import numpy as np

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
import numpy as np

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
import numpy as np

class ForceIndexImpulse(Strategy):
    # Volume-momentum: enter when the Elder Force Index turns positive in a
    # long-term uptrend; protect with an ATR trailing stop.
    efi_period = 13
    trend_ema = 200
    atr_period = 14
    atr_mult = 3.0

    def init(self):
        H, L = pd.Series(self.data.High), pd.Series(self.data.Low)
        C, V = pd.Series(self.data.Close), pd.Series(self.data.Volume)
        self.efi = self.I(lambda: ta.efi(C, V, length=self.efi_period).values)
        self.ema_trend = self.I(lambda: ta.ema(C, self.trend_ema).values)
        self.atr = self.I(lambda: ta.atr(H, L, C, self.atr_period).values)

    def next(self):
        price = self.data.Close[-1]
        if self.position and not np.isnan(self.atr[-1]):
            new_sl = price - self.atr_mult * self.atr[-1]
            for trade in self.trades:
                if trade.sl is None or new_sl > trade.sl:
                    trade.sl = new_sl

        crossed_up = self.efi[-2] < 0 and self.efi[-1] > 0
        if crossed_up and price > self.ema_trend[-1] and not self.position:
            stop = price - self.atr_mult * self.atr[-1]
            if stop < price:
                self.buy(sl=stop)
        # Let winners run: exit only on a long-term trend break (ATR stop handles the rest).
        elif price < self.ema_trend[-1] and self.position:
            self.position.close()
"""

# -----------------------------------------------------------------------------
# STRATEGY 24: Chaikin Money Flow Divergence
# Volume Accumulation
# -----------------------------------------------------------------------------
CODE_CMF = """
from backtesting import Strategy
import pandas as pd
import numpy as np

class CMFAccumulation(Strategy):
    # Buy confirmed accumulation (CMF crossing up through a positive threshold)
    # within a long-term uptrend; ATR trailing stop, exit when flow turns negative.
    cmf_period = 20
    cmf_entry = 0.05
    trend_ema = 200
    atr_period = 14
    atr_mult = 3.0

    def init(self):
        H, L = pd.Series(self.data.High), pd.Series(self.data.Low)
        C, V = pd.Series(self.data.Close), pd.Series(self.data.Volume)
        self.cmf = self.I(lambda: ta.cmf(H, L, C, V, length=self.cmf_period).values)
        self.ema_trend = self.I(lambda: ta.ema(C, self.trend_ema).values)
        self.atr = self.I(lambda: ta.atr(H, L, C, self.atr_period).values)

    def next(self):
        price = self.data.Close[-1]
        if self.position and not np.isnan(self.atr[-1]):
            new_sl = price - self.atr_mult * self.atr[-1]
            for trade in self.trades:
                if trade.sl is None or new_sl > trade.sl:
                    trade.sl = new_sl

        crossed_up = self.cmf[-2] < self.cmf_entry and self.cmf[-1] >= self.cmf_entry
        if crossed_up and price > self.ema_trend[-1] and not self.position:
            stop = price - self.atr_mult * self.atr[-1]
            if stop < price:
                self.buy(sl=stop)
        elif self.cmf[-1] < 0 and self.position:
            self.position.close()
"""

# -----------------------------------------------------------------------------
# STRATEGY 25: Keltner Channel Breakout
# Volatility Breakout
# -----------------------------------------------------------------------------
CODE_KELTNER = """
from backtesting import Strategy
import pandas as pd
import numpy as np

class KeltnerBreakout(Strategy):
    # Keltner trend-pullback: in a long-term uptrend with a rising channel, buy when
    # price reclaims the channel basis after a dip (continuation, not chasing a spike).
    # ATR trailing stop; exit on a long-term trend break.
    kc_period = 20
    kc_scalar = 2.0
    trend_ema = 200
    atr_period = 14
    atr_mult = 3.0

    def init(self):
        H, L, C = pd.Series(self.data.High), pd.Series(self.data.Low), pd.Series(self.data.Close)
        kc = ta.kc(H, L, C, length=self.kc_period, scalar=self.kc_scalar)
        self.kc_basis = self.I(lambda: kc.iloc[:, 1].values)
        self.kc_upper = self.I(lambda: kc.iloc[:, 2].values)
        self.ema_trend = self.I(lambda: ta.ema(C, self.trend_ema).values)
        self.atr = self.I(lambda: ta.atr(H, L, C, self.atr_period).values)

    def next(self):
        price = self.data.Close[-1]
        if self.position and not np.isnan(self.atr[-1]):
            new_sl = price - self.atr_mult * self.atr[-1]
            for trade in self.trades:
                if trade.sl is None or new_sl > trade.sl:
                    trade.sl = new_sl

        # Pullback continuation: price reclaims the basis from below while the channel
        # is rising and we're in a long-term uptrend.
        reclaim = self.data.Close[-2] <= self.kc_basis[-2] and price > self.kc_basis[-1]
        channel_rising = self.kc_basis[-1] > self.kc_basis[-5]
        if reclaim and channel_rising and price > self.ema_trend[-1] and not self.position:
            stop = price - self.atr_mult * self.atr[-1]
            if stop < price:
                self.buy(sl=stop)
        # Let winners run: exit only on a long-term trend break (ATR stop handles the rest).
        elif price < self.ema_trend[-1] and self.position:
            self.position.close()
"""

# -----------------------------------------------------------------------------
# STRATEGY 26: Money Flow Index Reversal
# Volume Weighted RSI
# -----------------------------------------------------------------------------
CODE_MFI = """
from backtesting import Strategy
import pandas as pd

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

import numpy as np

class AroonTrend(Strategy):
    # Early-trend detection: enter when Aroon Up crosses above Aroon Down with
    # strong upside (Up > threshold) in a long-term uptrend; ATR trailing stop.
    aroon_period = 14
    aroon_strong = 70
    trend_ema = 200
    atr_period = 14
    atr_mult = 3.0

    def init(self):
        H, L, C = pd.Series(self.data.High), pd.Series(self.data.Low), pd.Series(self.data.Close)
        ar = ta.aroon(H, L, length=self.aroon_period)
        self.aroon_down = self.I(lambda: ar.iloc[:, 0].values)
        self.aroon_up = self.I(lambda: ar.iloc[:, 1].values)
        self.ema_trend = self.I(lambda: ta.ema(C, self.trend_ema).values)
        self.atr = self.I(lambda: ta.atr(H, L, C, self.atr_period).values)

    def next(self):
        price = self.data.Close[-1]
        if self.position and not np.isnan(self.atr[-1]):
            new_sl = price - self.atr_mult * self.atr[-1]
            for trade in self.trades:
                if trade.sl is None or new_sl > trade.sl:
                    trade.sl = new_sl

        cross_up = (self.aroon_up[-2] < self.aroon_down[-2]
                    and self.aroon_up[-1] > self.aroon_down[-1])
        strong = self.aroon_up[-1] > self.aroon_strong
        if cross_up and strong and price > self.ema_trend[-1] and not self.position:
            stop = price - self.atr_mult * self.atr[-1]
            if stop < price:
                self.buy(sl=stop)
        elif self.aroon_down[-1] > self.aroon_up[-1] and self.position:
            self.position.close()
"""

# -----------------------------------------------------------------------------
# STRATEGY 29: Coppock Curve
# Long Term Bottom Fishing
# -----------------------------------------------------------------------------
CODE_COPPOCK = """
from backtesting import Strategy
import pandas as pd
import numpy as np

class CoppockCurve(Strategy):
    # Long-term momentum: enter when the Coppock Curve crosses up through zero in a
    # long-term uptrend; ATR trailing stop, exit when momentum turns negative.
    cop_length = 10
    cop_fast = 11
    cop_slow = 14
    trend_ema = 200
    atr_period = 14
    atr_mult = 3.0

    def init(self):
        H, L, C = pd.Series(self.data.High), pd.Series(self.data.Low), pd.Series(self.data.Close)
        self.coppock = self.I(lambda: ta.coppock(C, length=self.cop_length,
                                                 fast=self.cop_fast, slow=self.cop_slow).values)
        self.ema_trend = self.I(lambda: ta.ema(C, self.trend_ema).values)
        self.atr = self.I(lambda: ta.atr(H, L, C, self.atr_period).values)

    def next(self):
        price = self.data.Close[-1]
        if self.position and not np.isnan(self.atr[-1]):
            new_sl = price - self.atr_mult * self.atr[-1]
            for trade in self.trades:
                if trade.sl is None or new_sl > trade.sl:
                    trade.sl = new_sl

        crossed_up = self.coppock[-2] < 0 and self.coppock[-1] > 0
        if crossed_up and price > self.ema_trend[-1] and not self.position:
            stop = price - self.atr_mult * self.atr[-1]
            if stop < price:
                self.buy(sl=stop)
        elif self.coppock[-1] < 0 and self.position:
            self.position.close()
"""

# -----------------------------------------------------------------------------
# STRATEGY 30: Volatility Stop (ATR Trailing)
# Risk Management
# -----------------------------------------------------------------------------
CODE_ATR_TRAIL = """
from backtesting import Strategy
import pandas as pd

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

# -----------------------------------------------------------------------------
# STRATEGY 31: Williams Alligator v2
# Trend Following with Fractal Confirmation
# -----------------------------------------------------------------------------
CODE_ALLIGATOR_V2 = """
from backtesting import Strategy
import pandas as pd
import numpy as np

class WilliamsAlligatorV2(Strategy):
    def init(self):
        # Alligator: Jaw (13,8), Teeth (8,5), Lips (5,3)
        # Using simple SMMA approximation or EMA for improved responsiveness v2
        
        # Using EMA for v2 (Modern approach)
        self.jaw = self.I(lambda x: ta.ema(pd.Series(x, index=self.data.index), length=13).shift(8).bfill().values, self.data.Close)
        self.teeth = self.I(lambda x: ta.ema(pd.Series(x, index=self.data.index), length=8).shift(5).bfill().values, self.data.Close)
        self.lips = self.I(lambda x: ta.ema(pd.Series(x, index=self.data.index), length=5).shift(3).bfill().values, self.data.Close)
        
        # Fractals (5 bar high)
        # We will simply look for "Breakout of 5-day High" as a proxy for fractal trigger
        self.recent_high = self.I(lambda x: pd.Series(x).rolling(5).max().shift(1).values, self.data.High)

    def next(self):
        # Alligator "Eating" (Uptrend): Lips > Teeth > Jaw
        is_uptrend = self.lips[-1] > self.teeth[-1] and self.teeth[-1] > self.jaw[-1]
        
        # Buy Trigger: Price breaks above recent 5-day high (Fractal logic simplified)
        breakout = self.data.Close[-1] > self.recent_high[-1]
        
        if not self.position:
            if is_uptrend and breakout:
                self.buy()
        
        else:
            # Exit: Lips cross below Teeth (Alligator goes to sleep)
            if self.lips[-1] < self.teeth[-1]:
                self.position.close()
"""

# -----------------------------------------------------------------------------
# STRATEGY 32: Turtle Soup Reversal
# Mean Reversion / Trap Trading
# -----------------------------------------------------------------------------
CODE_TURTLE_SOUP = """
from backtesting import Strategy
import pandas as pd
import numpy as np

class TurtleSoup(Strategy):
    def init(self):
        # 20-Day Low
        self.low_20 = self.I(lambda x: pd.Series(x).rolling(20).min().shift(1).values, self.data.Low)
        
    def next(self):
        # Setup: Current Low Undercut the 20-day Low
        undercut = self.data.Low[-1] < self.low_20[-1]
        
        # Trigger: Close Reclaimed the 20-day Low (False Breakout)
        reclaim = self.data.Close[-1] > self.low_20[-1]
        
        if not self.position:
            if undercut and reclaim:
                self.buy()
        
        else:
            # Exit: 10 day hold
            if len(self.trades) > 0 and (self.data.index[-1] - self.trades[0].entry_time).days > 10:
                 self.position.close()
"""

# -----------------------------------------------------------------------------
# STRATEGY 33: Golden Cross + ADX
# Filtered Trend Following
# -----------------------------------------------------------------------------
CODE_GOLDEN_ADX = """
from backtesting import Strategy
import pandas as pd
import numpy as np

class GoldenCrossADX(Strategy):
    def init(self):
        self.sma_50 = self.I(lambda x: ta.sma(pd.Series(x), length=50).values, self.data.Close)
        self.sma_200 = self.I(lambda x: ta.sma(pd.Series(x), length=200).values, self.data.Close)
        
        # ADX Filter
        def get_adx(high, low, close):
             # Returns ADX column only (index 0)
             res = ta.adx(pd.Series(high, index=self.data.index), pd.Series(low, index=self.data.index), pd.Series(close, index=self.data.index), length=14)
             return res.iloc[:, 0].values
             
        self.adx = self.I(get_adx, self.data.High, self.data.Low, self.data.Close)

    def next(self):
        # Logic: 50 cross over 200 AND ADX > 25
        # We check crossover manually or simply 'is above' with recent transition check?
        # Simple: If 50 > 200 AND ADX > 25.
        
        uptrend = self.sma_50[-1] > self.sma_200[-1]
        strong = self.adx[-1] > 25
        
        if not self.position:
            if uptrend and strong:
                self.buy()
        else:
            # Exit: Death Cross (50 crosses below 200)
            if self.sma_50[-1] < self.sma_200[-1]:
                self.position.close()
"""

# -----------------------------------------------------------------------------
# STRATEGY 34: MACD + Parabolic SAR
# Momentum + Trailing Stop
# -----------------------------------------------------------------------------
CODE_MACD_SAR = """
from backtesting import Strategy
import pandas as pd
import numpy as np

class MACD_SAR(Strategy):
    def init(self):
        # MACD
        def get_macd(close):
            # Returns MACD, Histogram, Signal
            m = ta.macd(pd.Series(close, index=self.data.index))
            return m.iloc[:, 0].values, m.iloc[:, 2].values # MACD, Signal
            
        self.macd, self.signal = self.I(get_macd, self.data.Close)
        
        # Parabolic SAR (0.02, 0.02, 0.2)
        def get_sar(high, low, close):
            return ta.psar(pd.Series(high, index=self.data.index), pd.Series(low, index=self.data.index), pd.Series(close, index=self.data.index)).iloc[:, 0].values
            
        self.sar = self.I(get_sar, self.data.High, self.data.Low, self.data.Close)

    def next(self):
        # Entry: MACD > Signal (Bullish crossover) AND Price > SAR (Uptrend)
        macd_cross = self.macd[-2] < self.signal[-2] and self.macd[-1] > self.signal[-1]
        price_above_sar = self.data.Close[-1] > self.sar[-1]
        
        if not self.position:
            if macd_cross and price_above_sar:
                self.buy()
        else:
            # Exit: Price crosses BELOW SAR (Trailing Stop Hit)
            if self.data.Close[-1] < self.sar[-1]:
                self.position.close()
"""

# -----------------------------------------------------------------------------
# STRATEGY 35: Elder's Triple Screen
# Multi-Timeframe Trading
# -----------------------------------------------------------------------------
CODE_ELDER_TRIPLE = """
from backtesting import Strategy
import pandas as pd
import numpy as np

class ElderTripleScreen(Strategy):
    def init(self):
        # Screen 1: The Tide (Long Term Trend)
        # We simulate "Weekly" MACD on Daily data by multiplying periods by 5
        # Standard MACD is 12, 26, 9. Weekly approx: 60, 130, 45
        
        # We need the MACD Histogram slope.
        # pandas_ta macd returns 3 columns. We want the Histogram (2nd col usually, but let's check vars)
        # MACD_12_26_9, MACDh_12_26_9, MACDs_12_26_9
        
        def get_weekly_macd_slope(close):
            # Calculate MACD with 5x periods
            df = ta.macd(pd.Series(close), fast=60, slow=130, signal=45)
            hist = df.iloc[:, 1] # Histogram
            # Slope = Current - Previous
            slope = hist.diff().fillna(0)
            return slope.values
            
        self.weekly_macd_slope = self.I(get_weekly_macd_slope, self.data.Close)
        
        # Screen 2: The Wave (Intermediate Correction)
        # Daily Stochastic (14, 3, 3). Buy when < 30 (Oversold) in Uptrend
        
        def get_stoch(high, low, close):
            # ta.stoch returns STOCHk, STOCHd
            df = ta.stoch(pd.Series(high), pd.Series(low), pd.Series(close))
            return df.iloc[:, 0].values # %K
            
        self.stoch_k = self.I(get_stoch, self.data.High, self.data.Low, self.data.Close)

    def next(self):
        # 1. Tide: Weekly Slope is POSITIVE (Uptrend)
        # 2. Wave: Daily Stoch is OVERSOLD (< 30)
        
        if self.weekly_macd_slope[-1] > 0: # Tide Up
            # Stoch was < 30 previously and is now rising
            if self.stoch_k[-2] < 30 and self.stoch_k[-1] > self.stoch_k[-2]:
                if not self.position:
                    self.buy()
                    
        # Exit: Stoch becomes Overbought (> 80)
        if self.stoch_k[-1] > 80:
            if self.position:
                self.position.close()
"""

# -----------------------------------------------------------------------------
# STRATEGY 36: NR7 Volatility Breakout
# Price Action / Toby Crabel
# -----------------------------------------------------------------------------
CODE_NR7 = """
from backtesting import Strategy
import pandas as pd
import numpy as np

class NR7Breakout(Strategy):
    def init(self):
        # Calculate Range of each bar
        def get_range(high, low):
            return (pd.Series(high) - pd.Series(low)).values
            
        self.daily_range = self.I(get_range, self.data.High, self.data.Low)

    def next(self):
        if len(self.daily_range) < 8: return
        
        # NR7: Today's range (last completed bar) is the smallest of the last 7 bars.
        # But we are in 'next', so [-1] is the current closing bar.
        
        # Check if YESTERDAY (Bar -2) was an NR7 day relative to its preceding 6 days
        # Ranges involved: [-8] to [-2]
        
        prev_range = self.daily_range[-2]
        prev_past_6 = self.daily_range[-8:-2]
        
        was_nr7 = prev_range < min(prev_past_6)
        
        if was_nr7:
            # If yesterday was NR7, we buy if Price breaks its High
            buy_trigger = self.data.High[-2]
            
            if self.data.Close[-1] > buy_trigger:
                if not self.position:
                    self.buy()
                    
        # Exit: Stop Loss 2%
        if self.position:
             # Stop Loss 2% and Take Profit 5%
             if self.position.pl_pct < -0.02:
                 self.position.close()
             elif self.position.pl_pct > 0.05:
                 self.position.close()
"""

# -----------------------------------------------------------------------------
# STRATEGY 37: Z-Score Mean Reversion
# Statistical / Quant
# -----------------------------------------------------------------------------
CODE_ZSCORE = """
from backtesting import Strategy
import pandas as pd
import numpy as np

class ZScoreReversion(Strategy):
    window = 20
    z_entry = -2.0
    z_exit = 0.0
    
    def init(self):
        # Calculate Z-Score
        def get_zscore(close):
            series = pd.Series(close)
            # Rolling Mean and Std
            mean = series.rolling(self.window).mean()
            std = series.rolling(self.window).std()
            z = (series - mean) / std
            return z.values
            
        self.z_score = self.I(get_zscore, self.data.Close)

    def next(self):
        # Buy: Z-Score < -2.0 (Statistically Oversold)
        if self.z_score[-1] < self.z_entry:
            if not self.position:
                self.buy()
                
        # Exit: Z-Score > 0 (Reverted to Mean)
        if self.z_score[-1] > self.z_exit:
            if self.position:
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
        "name": "Williams Alligator v2",
        "description": "Trend Following. Uses Bill Williams' Alligator lines with Fractal confirmation. Buys when the Alligator is 'eating' (trending) and price breaks a recent fractal high.",
        "code": CODE_ALLIGATOR_V2
    },
    {
        "name": "Turtle Soup Reversal",
        "description": "Mean Reversion / Trap Trading. Buys when price makes a new 20-day Low but fails to stay there (closes back above previous low). Catches 'stop hunts'.",
        "code": CODE_TURTLE_SOUP
    },
    {
        "name": "Golden Cross + ADX",
        "description": "Filtered Trend. The classic 50/200 SMA crossover, but only taken when ADX > 25 confirms a strong trend. Avoids whipsaws in sideways markets.",
        "code": CODE_GOLDEN_ADX
    },
    {
        "name": "MACD + Parabolic SAR",
        "description": "Momentum + Trailing Stop. Enters on MACD crossover if price is above SAR. Uses SAR as a dynamic trailing stop to lock in profits.",
        "code": CODE_MACD_SAR
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
    {
        "name": "Williams Alligator v2",
        "description": "Trend Following. Uses Bill Williams' Alligator lines with Fractal confirmation. Buys when the Alligator is 'eating' (trending) and price breaks a recent fractal high.",
        "code": CODE_ALLIGATOR_V2
    },
    {
        "name": "Turtle Soup Reversal",
        "description": "Mean Reversion / Trap Trading. Buys when price makes a new 20-day Low but fails to stay there (closes back above previous low). Catches 'stop hunts'.",
        "code": CODE_TURTLE_SOUP
    },
    {
        "name": "Golden Cross + ADX",
        "description": "Filtered Trend. The classic 50/200 SMA crossover, but only taken when ADX > 25 confirms a strong trend. Avoids whipsaws in sideways markets.",
        "code": CODE_GOLDEN_ADX
    },
    {
        "name": "MACD + Parabolic SAR",
        "description": "Momentum + Trailing Stop. Enters on MACD crossover if price is above SAR. Uses SAR as a dynamic trailing stop to lock in profits.",
        "code": CODE_MACD_SAR
    },
    {
        "name": "Elder's Triple Screen",
        "description": "Multi-Timeframe System. 1. Tide: Weekly Slope Up (MACD). 2. Wave: Daily Stoch Oversold. 3. Ripple: Breakout Entry. Filters daily noise with weekly trend.",
        "code": CODE_ELDER_TRIPLE
    },
    {
        "name": "NR7 Volatility Breakout",
        "description": "Price Action. Identifies the Narrowest Range 7 (NR7) day (calm before storm) and buys the subsequent volatility expansion breakout.",
        "code": CODE_NR7
    },
    {
        "name": "Z-Score Mean Reversion",
        "description": "Statistical / Quant. Buys when price deviates -2 Standard Deviations from the Mean (Z-Score < -2) and sells when it reverts to mean (Z-Score > 0).",
        "code": CODE_ZSCORE
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
