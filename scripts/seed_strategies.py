import os
import sys
import django
import json

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
import pandas as pd
import pandas_ta as ta

class RsiBollingerReversion(Strategy):
    rsi_period = 14
    bb_period = 5
    bb_std = 2.0
    rsi_lower = 30
    rsi_upper = 70
    
    def init(self):
        self.rsi = self.I(ta.rsi, pd.Series(self.data.Close), self.rsi_period)
        self.bb_lower = self.I(lambda x: ta.bbands(pd.Series(x), length=self.bb_period, std=self.bb_std).iloc[:, 0], self.data.Close)
        self.bb_upper = self.I(lambda x: ta.bbands(pd.Series(x), length=self.bb_period, std=self.bb_std).iloc[:, 2], self.data.Close)

    def next(self):
        if self.data.Close[-1] < self.bb_lower[-1] and self.rsi[-1] < self.rsi_lower:
            if not self.position:
                self.buy()
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
from backtesting.test import SMA

class GoldenCrossPullback(Strategy):
    n_fast = 50
    n_slow = 200
    tp_pct = 1.20 # 20% gain
    
    def init(self):
        self.sma_fast = self.I(SMA, self.data.Close, self.n_fast)
        self.sma_slow = self.I(SMA, self.data.Close, self.n_slow)

    def next(self):
        price = self.data.Close[-1]
        is_uptrend = self.sma_fast[-1] > self.sma_slow[-1]
        near_support = abs(price - self.sma_fast[-1]) / price < 0.015
        
        if is_uptrend and near_support and price > self.sma_fast[-1]:
             if not self.position:
                 self.buy()
        
        if price < self.sma_slow[-1] or (self.position and price > self.trades[0].entry_price * self.tp_pct):
             if self.position:
                 self.position.close()
"""

# -----------------------------------------------------------------------------
# STRATEGY 3: Volume Breakout
# Momentum Strategy for strong moves
# -----------------------------------------------------------------------------
CODE_VOLUME_BREAKOUT = """
from backtesting import Strategy
import pandas as pd

class VolumeBreakout(Strategy):
    lookback = 20
    vol_multiplier = 2.0
    sl_pct = 0.95
    
    def init(self):
        self.high_rolling = self.I(lambda x: pd.Series(x).rolling(self.lookback).max(), self.data.High)
        self.vol_avg = self.I(lambda x: pd.Series(x).rolling(self.lookback).mean(), self.data.Volume)

    def next(self):
        price = self.data.Close[-1]
        if price >= self.high_rolling[-2] and self.data.Volume[-1] > (self.vol_avg[-1] * self.vol_multiplier):
            if not self.position:
                self.buy()
        
        if self.position and price < self.trades[0].entry_price * self.sl_pct:
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
    rsi_period = 2
    rsi_lower = 10
    rsi_upper = 90
    ma_period = 200
    exit_ma_period = 5
    
    def init(self):
        self.rsi = self.I(ta.rsi, pd.Series(self.data.Close), self.rsi_period)
        self.sma_200 = self.I(SMA, self.data.Close, self.ma_period)
        self.sma_5 = self.I(SMA, self.data.Close, self.exit_ma_period)
        
    def next(self):
        if self.data.Close[-1] > self.sma_200[-1] and self.rsi[-1] < self.rsi_lower:
            if not self.position:
                self.buy()
        elif self.position and self.data.Close[-1] > self.sma_5[-1]:
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
    trend_filter = 200
    
    def init(self):
        self.macd = self.I(lambda x: ta.macd(pd.Series(x), fast=self.fast, slow=self.slow, signal=self.signal).iloc[:, 0], self.data.Close)
        self.signal_line = self.I(lambda x: ta.macd(pd.Series(x), fast=self.fast, slow=self.slow, signal=self.signal).iloc[:, 2], self.data.Close)
        self.sma_trend = self.I(SMA, self.data.Close, self.trend_filter)
        
    def next(self):
        if crossover(self.macd, self.signal_line) and self.data.Close[-1] > self.sma_trend[-1]:
            if not self.position:
                self.buy()
        elif crossover(self.signal_line, self.macd):
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

CODE_INSIDE_BAR = """
from backtesting import Strategy

class InsideBarMomentum(Strategy):
    def init(self):
        pass

    def next(self):
        if len(self.data) < 2: return
        is_inside = (self.data.High[-1] < self.data.High[-2]) and (self.data.Low[-1] > self.data.Low[-2])
        if is_inside and self.data.Close[-1] > self.data.High[-2]:
            if not self.position: self.buy()
        elif self.position and self.data.Close[-1] < self.data.Low[-2]:
            self.position.close()
"""

# -----------------------------------------------------------------------------
# STRATEGY 8: Three White Soldiers (Trend)
# Smoothed trend following
# -----------------------------------------------------------------------------
CODE_HEIKIN_ASHI = """
from backtesting import Strategy

class HeikinAshiTrend(Strategy):
    lookback = 5
    consecutive = 3
    
    def init(self):
        pass

    def next(self):
        if len(self.data) < self.lookback: return
        green = [self.data.Close[i] > self.data.Open[i] for i in range(-self.consecutive, 0)]
        rising = self.data.Close[-1] > self.data.Close[-2] > self.data.Close[-3]
        
        if all(green) and rising:
            if not self.position:
                self.buy()
        elif self.data.Close[-1] < self.data.Open[-1]:
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
        self.H = self.I(lambda x: pd.Series(x).rolling(self.entry_window).max(), self.data.High)
        self.L = self.I(lambda x: pd.Series(x).rolling(self.exit_window).min(), self.data.Low)
        
    def next(self):
        if self.data.Close[-1] > self.H[-2]:
            if not self.position:
                self.buy()
        elif self.data.Close[-1] < self.L[-2]:
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
        self.st_dir = self.I(lambda h, l, c: ta.supertrend(pd.Series(h), pd.Series(l), pd.Series(c), length=self.period, multiplier=self.multiplier).iloc[:, 1], self.data.High, self.data.Low, self.data.Close)

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
    sma_period = 50
    sl_pct = 0.95
    
    def init(self):
        self.vwap = self.I(lambda h, l, c, v: ta.vwap(pd.Series(h, index=self.data.index), pd.Series(l, index=self.data.index), pd.Series(c, index=self.data.index), pd.Series(v, index=self.data.index)).values, self.data.High, self.data.Low, self.data.Close, self.data.Volume)
        self.sma_50 = self.I(SMA, self.data.Close, self.sma_period)

    def next(self):
        if self.data.Close[-1] > self.sma_50[-1]:
            if self.data.Close[-2] < self.vwap[-2] and self.data.Close[-1] > self.vwap[-1]:
                if not self.position:
                    self.buy()
        
        if self.position and self.data.Close[-1] < self.vwap[-1] * self.sl_pct:
            self.position.close()
"""

# -----------------------------------------------------------------------------
# STRATEGY 12: Smart Money Accumulation (Broker Data)
# Complex: Uses DailyCumulativeAccumulation model
# -----------------------------------------------------------------------------
CODE_SMART_MONEY = """
from backtesting import Strategy
import pandas as pd
import numpy as np
from stocks.models import DailyCumulativeAccumulation

class SmartMoneyAccumulation(Strategy):
    top_n = 5
    sma_period = 20
    
    def init(self):
        qs = DailyCumulativeAccumulation.objects.filter(symbol=symbol).values('transaction_date', 'entity_id', 'cumulative_net')
        if not qs:
            self.sm_cum = self.I(lambda x: np.zeros(len(x)), self.data.Close)
            return

        df = pd.DataFrame(list(qs))
        df['transaction_date'] = pd.to_datetime(df['transaction_date'])
        pivot = df.pivot_table(index='transaction_date', columns='entity_id', values='cumulative_net', aggfunc='last').fillna(method='ffill').fillna(0)
        pivot = pivot.reindex(pd.Series(self.data.Close).index).fillna(method='ffill').fillna(0)
        top = pivot.iloc[-1].sort_values(ascending=False).head(self.top_n).index
        self.sm_cum = self.I(lambda x: pivot[top].sum(axis=1).values, self.data.Close)

    def next(self):
        if len(self.sm_cum) < self.sma_period: return
        sma = pd.Series(self.sm_cum).rolling(self.sma_period).mean().iloc[-1]
        if self.sm_cum[-1] > sma:
            if not self.position: self.buy()
        elif self.sm_cum[-1] < sma:
            if self.position: self.position.close()
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
    lookback = 20
    
    def init(self):
        qs = DailyCumulativeAccumulation.objects.filter(symbol=symbol).values('transaction_date', 'cumulative_net')
        if not qs:
            self.acc = self.I(lambda x: np.zeros(len(x)), self.data.Close)
            return

        df = pd.DataFrame(list(qs))
        df['transaction_date'] = pd.to_datetime(df['transaction_date'])
        daily = df.groupby('transaction_date')['cumulative_net'].sum()
        self.acc = self.I(lambda x: daily.reindex(pd.Series(x).index).fillna(method='ffill').fillna(0).values, self.data.Close)

    def next(self):
        if len(self.data) < self.lookback: return
        p_diff = self.data.Close[-1] - self.data.Close[-self.lookback]
        a_diff = self.acc[-1] - self.acc[-self.lookback]
        
        if p_diff < 0 and a_diff > 0:
            if not self.position: self.buy()
        elif p_diff > 0 and a_diff < 0:
            if self.position: self.position.close()
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
    vol_period = 20
    vol_mult = 1.5
    sl_pct = 0.95
    breakout = 20
    
    def init(self):
        qs = DailyCumulativeAccumulation.objects.filter(symbol=symbol).values('transaction_date', 'entity_id', 'cumulative_net')
        if not qs:
            self.buy_vol = self.I(lambda x: np.zeros(len(x)), self.data.Close)
            self.avg_vol = self.I(lambda x: np.zeros(len(x)), self.data.Close)
            return

        df = pd.DataFrame(list(qs))
        df['transaction_date'] = pd.to_datetime(df['transaction_date'])
        flow = df.pivot_table(index='transaction_date', columns='entity_id', values='cumulative_net').sum(axis=1).diff().fillna(0)
        self.buy_vol = self.I(lambda x: flow.reindex(pd.Series(x).index).fillna(0).values, self.data.Close)
        self.avg_vol = self.I(lambda x: pd.Series(x).rolling(self.vol_period).mean().values, self.buy_vol)

    def next(self):
        if len(self.data.High) < self.breakout + 1: return
        max_h = max(self.data.High[-self.breakout-1:-1])
        if self.data.Close[-1] > max_h and self.buy_vol[-1] > (self.avg_vol[-1] * self.vol_mult):
            if not self.position: self.buy()
        
        if self.position and self.data.Close[-1] < self.position.entry_price * self.sl_pct:
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

class AccumulationSqueeze(Strategy):
    bb_len = 20
    bb_std = 2.0
    threshold = 0.05
    acc_lookback = 50
    acc_quantile = 0.80
    tp_pct = 1.10
    sl_pct = 0.95
    
    def init(self):
        self.bb_width = self.I(lambda x: (ta.bbands(pd.Series(x), length=self.bb_len, std=self.bb_std).iloc[:, 2] - ta.bbands(pd.Series(x), length=self.bb_len, std=self.bb_std).iloc[:, 0]).values, self.data.Close)
        qs = DailyCumulativeAccumulation.objects.filter(symbol=symbol).values('transaction_date', 'cumulative_net')
        if not qs:
            self.acc = self.I(lambda x: np.zeros(len(x)), self.data.Close)
            return

        df = pd.DataFrame(list(qs))
        df['transaction_date'] = pd.to_datetime(df['transaction_date'])
        intensity = df.groupby('transaction_date')['cumulative_net'].sum().diff().fillna(0)
        self.acc = self.I(lambda x: intensity.reindex(pd.Series(x).index).fillna(0).values, self.data.Close)

    def next(self):
        if len(self.acc) < self.acc_lookback: return
        if (self.bb_width[-1] / self.data.Close[-1]) < self.threshold and self.acc[-1] > pd.Series(self.acc[-self.acc_lookback:]).quantile(self.acc_quantile):
            if not self.position: self.buy()
        if self.position and (self.data.Close[-1] > self.position.entry_price * self.tp_pct or self.data.Close[-1] < self.position.entry_price * self.sl_pct):
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
    fast = 10
    slow = 50
    
    def init(self):
        qs = DailyCumulativeAccumulation.objects.filter(symbol=symbol).values('transaction_date', 'entity_id', 'cumulative_net')
        if not qs:
             self.fast_ma = self.I(lambda x: np.zeros(len(x)), self.data.Close)
             self.slow_ma = self.I(lambda x: np.zeros(len(x)), self.data.Close)
             return

        df = pd.DataFrame(list(qs))
        df['transaction_date'] = pd.to_datetime(df['transaction_date'])
        pivot = df.pivot_table(index='transaction_date', columns='entity_id', values='cumulative_net', aggfunc='last').fillna(method='ffill').fillna(0)
        top = pivot.iloc[-1].sort_values(ascending=False).head(5).index
        flow = pivot[top].sum(axis=1)
        line = self.I(lambda x: flow.reindex(pd.Series(x).index).fillna(method='ffill').fillna(0).values, self.data.Close)
        self.fast_ma = self.I(lambda x: pd.Series(line).rolling(self.fast).mean().values, self.data.Close)
        self.slow_ma = self.I(lambda x: pd.Series(line).rolling(self.slow).mean().values, self.data.Close)

    def next(self):
        if crossover(self.fast_ma, self.slow_ma):
            if not self.position: self.buy()
        elif crossover(self.slow_ma, self.fast_ma):
            if self.position: self.position.close()
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
        self.psar = self.I(lambda h, l, c: ta.psar(pd.Series(h), pd.Series(l), pd.Series(c)).iloc[:, 0].fillna(ta.psar(pd.Series(h), pd.Series(l), pd.Series(c)).iloc[:, 1]).values, self.data.High, self.data.Low, self.data.Close)

    def next(self):
        if self.data.Close[-2] < self.psar[-2] and self.data.Close[-1] > self.psar[-1]:
             if not self.position: self.buy()
        elif self.data.Close[-2] > self.psar[-2] and self.data.Close[-1] < self.psar[-1]:
             if self.position: self.position.close()
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
    tenkan = 9
    kijun = 26
    senkou = 52
    
    def init(self):
        self.span_a = self.I(lambda h,l,c: ta.ichimoku(pd.Series(h),pd.Series(l),pd.Series(c), tenkan=self.tenkan, kijun=self.kijun, senkou=self.senkou)[0].iloc[:, 2].values, self.data.High, self.data.Low, self.data.Close)
        self.span_b = self.I(lambda h,l,c: ta.ichimoku(pd.Series(h),pd.Series(l),pd.Series(c), tenkan=self.tenkan, kijun=self.kijun, senkou=self.senkou)[0].iloc[:, 3].values, self.data.High, self.data.Low, self.data.Close)

    def next(self):
        if self.data.Close[-1] > self.span_a[-1] and self.data.Close[-1] > self.span_b[-1]:
             if not self.position: self.buy()
        elif self.data.Close[-1] < self.span_a[-1] or self.data.Close[-1] < self.span_b[-1]:
             if self.position: self.position.close()
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
    period = 14
    threshold = 25
    
    def init(self):
        self.adx = self.I(lambda h,l,c: ta.adx(pd.Series(h), pd.Series(l), pd.Series(c), length=self.period).iloc[:, 0].values, self.data.High, self.data.Low, self.data.Close)
        self.dmp = self.I(lambda h,l,c: ta.adx(pd.Series(h), pd.Series(l), pd.Series(c), length=self.period).iloc[:, 1].values, self.data.High, self.data.Low, self.data.Close)
        self.dmn = self.I(lambda h,l,c: ta.adx(pd.Series(h), pd.Series(l), pd.Series(c), length=self.period).iloc[:, 2].values, self.data.High, self.data.Low, self.data.Close)

    def next(self):
        if self.adx[-1] > self.threshold and self.dmp[-1] > self.dmn[-1]:
            if not self.position: self.buy()
        elif self.dmn[-1] > self.dmp[-1]:
            if self.position: self.position.close()
"""

# -----------------------------------------------------------------------------
# STRATEGY 20: Fibonacci Golden Zone
# Retracement Strategy
# -----------------------------------------------------------------------------
CODE_FIBO = """
from backtesting import Strategy

class FibonacciGoldenZone(Strategy):
    lookback = 50
    fib_high = 0.618
    fib_low = 0.500
    
    def init(self):
        pass

    def next(self):
        if len(self.data) < self.lookback: return
        h, l = max(self.data.High[-self.lookback:]), min(self.data.Low[-self.lookback:])
        diff = h - l
        if diff == 0: return
        f_hi, f_lo = l + self.fib_high * diff, l + self.fib_low * diff
        if f_lo <= self.data.Close[-1] <= f_hi:
            if not self.position: self.buy()
        if self.position:
             if self.data.Close[-1] > h or self.data.Close[-1] < l:
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
    length = 14
    rsi_len = 14
    k_per = 3
    d_per = 3
    ob = 80
    os = 20
    
    def init(self):
        self.k = self.I(lambda c: ta.stochrsi(pd.Series(c), length=self.length, rsi_length=self.rsi_len, k=self.k_per, d=self.d_per).iloc[:, 0].values, self.data.Close)
        self.d = self.I(lambda c: ta.stochrsi(pd.Series(c), length=self.length, rsi_length=self.rsi_len, k=self.k_per, d=self.d_per).iloc[:, 1].values, self.data.Close)

    def next(self):
        if self.k[-2] < self.d[-2] and self.k[-1] > self.d[-1] and self.k[-1] < self.os:
            if not self.position: self.buy()
        elif self.k[-2] > self.d[-2] and self.k[-1] < self.d[-1] and self.k[-1] > self.ob:
             if self.position: self.position.close()
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
    length = 14
    sma_len = 50
    os = -80
    ob = -20
    
    def init(self):
        self.willr = self.I(lambda h,l,c: ta.willr(pd.Series(h), pd.Series(l), pd.Series(c), length=self.length).values, self.data.High, self.data.Low, self.data.Close)
        self.sma = self.I(lambda c: ta.sma(pd.Series(c), length=self.sma_len).values, self.data.Close)

    def next(self):
        if self.data.Close[-1] > self.sma[-1] and self.willr[-1] < self.os:
            if not self.position: self.buy()
        elif self.willr[-1] > self.ob:
             if self.position: self.position.close()
"""

# -----------------------------------------------------------------------------
# STRATEGY 23: Force Index Impulse
# Volume + Price Momentum
# -----------------------------------------------------------------------------
CODE_FORCE = """
from backtesting import Strategy
import pandas as pd
import pandas_ta as ta

class ForceIndexImpulse(Strategy):
    length = 13
    
    def init(self):
        self.efi = self.I(lambda c,v: ta.efi(pd.Series(c, index=self.data.index), pd.Series(v, index=self.data.index), length=self.length).values, self.data.Close, self.data.Volume)

    def next(self):
        if self.efi[-2] < 0 and self.efi[-1] > 0:
            if not self.position: self.buy()
        elif self.efi[-2] > 0 and self.efi[-1] < 0:
            if self.position: self.position.close()
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
    length = 20
    threshold = 0.1
    
    def init(self):
        self.cmf = self.I(lambda h,l,c,v: ta.cmf(pd.Series(h), pd.Series(l), pd.Series(c), pd.Series(v), length=self.length).values, self.data.High, self.data.Low, self.data.Close, self.data.Volume)

    def next(self):
        if self.cmf[-2] < self.threshold and self.cmf[-1] > self.threshold:
            if not self.position: self.buy()
        elif self.cmf[-1] < 0:
            if self.position: self.position.close()
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
    length = 20
    scalar = 2
    
    def init(self):
        self.kc_lower = self.I(lambda h,l,c: ta.kc(pd.Series(h), pd.Series(l), pd.Series(c), length=self.length, scalar=self.scalar).iloc[:, 0].values, self.data.High, self.data.Low, self.data.Close)
        self.kc_upper = self.I(lambda h,l,c: ta.kc(pd.Series(h), pd.Series(l), pd.Series(c), length=self.length, scalar=self.scalar).iloc[:, 2].values, self.data.High, self.data.Low, self.data.Close)

    def next(self):
        if self.data.Close[-1] > self.kc_upper[-1]:
            if not self.position: self.buy()
        elif self.data.Close[-1] < self.kc_lower[-1]:
            if self.position: self.position.close()
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
    length = 14
    os = 20
    ob = 80
    
    def init(self):
        self.mfi = self.I(lambda h,l,c,v: ta.mfi(pd.Series(h), pd.Series(l), pd.Series(c), pd.Series(v), length=self.length).values, self.data.High, self.data.Low, self.data.Close, self.data.Volume)

    def next(self):
        if self.mfi[-1] < self.os:
            if not self.position: self.buy()
        elif self.mfi[-1] > self.ob:
            if self.position: self.position.close()
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
    sma_len = 20
    
    def init(self):
        self.obv = self.I(lambda c, v: ta.obv(pd.Series(c), pd.Series(v)).values, self.data.Close, self.data.Volume)
        self.obv_ma = self.I(lambda x: ta.sma(pd.Series(x), length=self.sma_len).values, self.obv)

    def next(self):
        price_ma = pd.Series(self.data.Close).rolling(self.sma_len).mean().iloc[-1]
        if self.obv[-1] > self.obv_ma[-1] and self.data.Close[-1] > price_ma:
            if not self.position: self.buy()
        elif self.obv[-1] < self.obv_ma[-1]:
            if self.position: self.position.close()
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
    length = 14
    
    def init(self):
        self.aroon_down = self.I(lambda h,l: ta.aroon(pd.Series(h), pd.Series(l), length=self.length).iloc[:, 0].values, self.data.High, self.data.Low)
        self.aroon_up = self.I(lambda h,l: ta.aroon(pd.Series(h), pd.Series(l), length=self.length).iloc[:, 1].values, self.data.High, self.data.Low)

    def next(self):
        if self.aroon_up[-2] < self.aroon_down[-2] and self.aroon_up[-1] > self.aroon_down[-1]:
            if not self.position: self.buy()
        elif self.aroon_up[-1] < self.aroon_down[-1]:
            if self.position: self.position.close()
"""

# -----------------------------------------------------------------------------
# STRATEGY 29: Coppock Curve
# Long Term Bottom Fishing
# -----------------------------------------------------------------------------
CODE_COPPOCK = """
from backtesting import Strategy
import pandas as pd
import pandas_ta as ta

class CoppockCurve(Strategy):
    def init(self):
        self.coppock = self.I(lambda c: ta.coppock(pd.Series(c)).values, self.data.Close)

    def next(self):
        if self.coppock[-2] < 0 and self.coppock[-1] < 0 and self.coppock[-1] > self.coppock[-2]:
            if not self.position: self.buy()
        elif self.coppock[-1] < self.coppock[-2]:
            if self.position: self.position.close()
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
    atr_len = 14
    sma_len = 20
    
    def init(self):
        self.atr = self.I(lambda h,l,c: ta.atr(pd.Series(h), pd.Series(l), pd.Series(c), length=self.atr_len).values, self.data.High, self.data.Low, self.data.Close)
        self.sma = self.I(lambda x: pd.Series(x).rolling(self.sma_len).mean().values, self.data.Close)
        
    def next(self):
        if self.data.Close[-1] > self.sma[-1]:
            if not self.position: self.buy()
        if self.position and self.data.Close[-1] < (self.sma[-1] - self.atr[-1]):
            self.position.close()
"""

# -----------------------------------------------------------------------------
# STRATEGY 31: Williams Alligator v2
# Trend Following with Fractal Confirmation
# -----------------------------------------------------------------------------
CODE_ALLIGATOR_V2 = """
from backtesting import Strategy
import pandas as pd
import pandas_ta as ta

class WilliamsAlligatorV2(Strategy):
    jaw_period = 13 # range: [8, 34]
    teeth_period = 8 # range: [5, 21]
    lips_period = 5 # range: [3, 13]
    jaw_shift = 8 # range: [5, 13]
    teeth_shift = 5 # range: [3, 8]
    lips_shift = 3 # range: [2, 5]
    frac_period = 5 # range: [3, 10]
    
    def init(self):
        self.j = self.I(lambda x: ta.ema(pd.Series(x), length=self.jaw_period).shift(self.jaw_shift).fillna(method='bfill').values, self.data.Close)
        self.t = self.I(lambda x: ta.ema(pd.Series(x), length=self.teeth_period).shift(self.teeth_shift).fillna(method='bfill').values, self.data.Close)
        self.l = self.I(lambda x: ta.ema(pd.Series(x), length=self.lips_period).shift(self.lips_shift).fillna(method='bfill').values, self.data.Close)
        self.rh = self.I(lambda x: pd.Series(x).rolling(self.frac_period).max().shift(1).values, self.data.High)

    def next(self):
        if self.l[-1] > self.t[-1] > self.j[-1] and self.data.Close[-1] > self.rh[-1]:
            if not self.position: self.buy()
        elif self.l[-1] < self.t[-1]:
            if self.position: self.position.close()
"""

# -----------------------------------------------------------------------------
# STRATEGY 32: Turtle Soup Reversal
# Mean Reversion / Trap Trading
# -----------------------------------------------------------------------------
CODE_TURTLE_SOUP = """
from backtesting import Strategy
import pandas as pd

class TurtleSoup(Strategy):
    lookback = 20
    hold = 10
    
    def init(self):
        self.low_20 = self.I(lambda x: pd.Series(x).rolling(self.lookback).min().shift(1).values, self.data.Low)
        
    def next(self):
        if self.data.Low[-1] < self.low_20[-1] and self.data.Close[-1] > self.low_20[-1]:
            if not self.position: self.buy()
        elif self.position and (len(self.data) - self.trades[0].entry_bar) > self.hold:
             self.position.close()
"""

# -----------------------------------------------------------------------------
# STRATEGY 33: Golden Cross + ADX
# Filtered Trend Following
# -----------------------------------------------------------------------------
CODE_GOLDEN_ADX = """
from backtesting import Strategy
import pandas as pd
import pandas_ta as ta

class GoldenCrossADX(Strategy):
    fast = 50
    slow = 200
    adx_len = 14
    adx_th = 25
    
    def init(self):
        self.sma_f = self.I(lambda x: ta.sma(pd.Series(x), length=self.fast).values, self.data.Close)
        self.sma_s = self.I(lambda x: ta.sma(pd.Series(x), length=self.slow).values, self.data.Close)
        self.adx = self.I(lambda h,l,c: ta.adx(pd.Series(h), pd.Series(l), pd.Series(c), length=self.adx_len).iloc[:, 0].values, self.data.High, self.data.Low, self.data.Close)

    def next(self):
        if self.sma_f[-1] > self.sma_s[-1] and self.adx[-1] > self.adx_th:
            if not self.position: self.buy()
        elif self.sma_f[-1] < self.sma_s[-1]:
            if self.position: self.position.close()
"""

# -----------------------------------------------------------------------------
# STRATEGY 34: MACD + Parabolic SAR
# Momentum + Trailing Stop
# -----------------------------------------------------------------------------
CODE_MACD_SAR = """
from backtesting import Strategy
import pandas as pd
import pandas_ta as ta

class MACD_SAR(Strategy):
    def init(self):
        self.macd = self.I(lambda c: ta.macd(pd.Series(c)).iloc[:, 0].values, self.data.Close)
        self.signal = self.I(lambda c: ta.macd(pd.Series(c)).iloc[:, 2].values, self.data.Close)
        self.sar = self.I(lambda h,l,c: ta.psar(pd.Series(h), pd.Series(l), pd.Series(c)).iloc[:, 0].values, self.data.High, self.data.Low, self.data.Close)

    def next(self):
        if self.macd[-2] < self.signal[-2] and self.macd[-1] > self.signal[-1] and self.data.Close[-1] > self.sar[-1]:
            if not self.position: self.buy()
        elif self.data.Close[-1] < self.sar[-1]:
            if self.position: self.position.close()
"""

# -----------------------------------------------------------------------------
# STRATEGY 35: Elder's Triple Screen
# Multi-Timeframe Trading
# -----------------------------------------------------------------------------
CODE_ELDER_TRIPLE = """
from backtesting import Strategy
import pandas as pd
import pandas_ta as ta

class ElderTripleScreen(Strategy):
    w_fast = 60
    w_slow = 130
    w_sig = 45
    k_per = 14
    os = 30
    ob = 80
    
    def init(self):
        self.w_macd_slope = self.I(lambda c: ta.macd(pd.Series(c), fast=self.w_fast, slow=self.w_slow, signal=self.w_sig).iloc[:, 1].diff().fillna(0).values, self.data.Close)
        self.k = self.I(lambda h,l,c: ta.stoch(pd.Series(h), pd.Series(l), pd.Series(c), k=self.k_per).iloc[:, 0].values, self.data.High, self.data.Low, self.data.Close)

    def next(self):
        if self.w_macd_slope[-1] > 0 and self.k[-2] < self.os and self.k[-1] > self.k[-2]:
            if not self.position: self.buy()
        elif self.k[-1] > self.ob:
            if self.position: self.position.close()
"""

# -----------------------------------------------------------------------------
# STRATEGY 36: NR7 Volatility Breakout
# Price Action / Toby Crabel
# -----------------------------------------------------------------------------
CODE_NR7 = """
from backtesting import Strategy
import pandas as pd

class NR7Breakout(Strategy):
    lookback = 8
    sl = -0.02
    tp = 0.05
    
    def init(self):
        self.range = self.I(lambda h,l: (pd.Series(h) - pd.Series(l)).values, self.data.High, self.data.Low)

    def next(self):
        if len(self.range) < self.lookback: return
        if self.range[-2] < min(self.range[-self.lookback:-2]) and self.data.Close[-1] > self.data.High[-2]:
            if not self.position: self.buy()
        if self.position:
             if self.position.pl_pct < self.sl or self.position.pl_pct > self.tp:
                 self.position.close()
"""

# -----------------------------------------------------------------------------
# STRATEGY 37: Z-Score Mean Reversion
# Statistical / Quant
# -----------------------------------------------------------------------------
CODE_ZSCORE = """
from backtesting import Strategy
import pandas as pd

class ZScoreReversion(Strategy):
    window = 20
    entry = -2.0
    exit = 0.0
    
    def init(self):
        self.z = self.I(lambda c: ((pd.Series(c) - pd.Series(c).rolling(self.window).mean()) / pd.Series(c).rolling(self.window).std()).values, self.data.Close)

    def next(self):
        if self.z[-1] < self.entry:
            if not self.position: self.buy()
        elif self.z[-1] > self.exit:
            if self.position: self.position.close()
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
        "code": CODE_ALLIGATOR_V2,
        "optimization_config": {
            "jaw_period": [8, 34],
            "teeth_period": [5, 21],
            "lips_period": [3, 13],
            "jaw_shift": [5, 13],
            "teeth_shift": [3, 8],
            "lips_shift": [2, 5],
            "frac_period": [3, 10]
        }
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
                'is_public': True,
                'optimization_config': json.dumps(s.get('optimization_config', {}))
            }
        )
        if strategy.name == "Williams Alligator v2":
             print(f"[DEBUG] Saving config for {strategy.name}: {json.dumps(s.get('optimization_config', {}))}")
        
        if created:
            print(f"[CREATED] {s['name']}")
        else:
            print(f"[UPDATED] {s['name']}")

if __name__ == '__main__':
    seed()
