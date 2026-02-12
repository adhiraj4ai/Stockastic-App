import sys
import os
import django

# Mocking missing modules that might be imported by models but aren't needed for seeding
try:
    import celery
except ImportError:
    mock_celery = type('MockCelery', (), {'Celery': lambda *args, **kwargs: None})
    sys.modules['celery'] = mock_celery

try:
    import cryptography
except ImportError:
    sys.modules['cryptography'] = type('MockCryptography', (), {'fernet': type('MockFernet', (), {'Fernet': lambda *args, **kwargs: None})})
    # For abstract-base-user encryption field
    sys.modules['users.encryption'] = type('MockEncryption', (), {'EncryptedField': lambda *args, **kwargs: None})

# Add backend to sys.path so 'stockastic' and 'stocks' modules can be found
sys.path.append(os.path.join(os.getcwd(), 'backend'))

# Force-disable celery if it's causing issues in signal handling or model loading
os.environ['CELERY_OFFLINE'] = 'True'

try:
    from django.conf import settings
    if not settings.configured:
        os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'stockastic.settings')
        django.setup()
except Exception as e:
    print(f"Django setup error: {e}")

from django.contrib.auth.models import User
from stocks.models import Strategy, DailyCumulativeAccumulation

# =============================================================================
# PURE SIGNAL STRATEGIES
# Stop-loss, take-profit, and position sizing are handled by the system.
# Each strategy focuses ONLY on entry/exit signal logic.
# =============================================================================

# -----------------------------------------------------------------------------
# 1. RSI + Bollinger Bands Mean Reversion
# Buys oversold + lower band touch, exits on overbought or upper band
# -----------------------------------------------------------------------------
CODE_RSI_BB = """
from backtesting import Strategy
import pandas as pd
import pandas_ta as ta

class RsiBollingerReversion(Strategy):
    rsi_period = 14
    bb_period = 20
    bb_std = 2.0
    rsi_lower = 30
    rsi_upper = 70

    def init(self):
        close = pd.Series(self.data.Close)
        self.rsi = self.I(ta.rsi, close, self.rsi_period)
        bb = ta.bbands(close, length=self.bb_period, std=self.bb_std)
        self.bb_lower = self.I(lambda: bb.iloc[:, 0].values)
        self.bb_mid = self.I(lambda: bb.iloc[:, 1].values)
        self.bb_upper = self.I(lambda: bb.iloc[:, 2].values)

    def next(self):
        if self.rsi[-1] < self.rsi_lower and self.data.Close[-1] <= self.bb_lower[-1]:
            if not self.position: self.buy()
        elif self.position:
            if self.rsi[-1] > self.rsi_upper or self.data.Close[-1] >= self.bb_upper[-1]:
                self.position.close()
"""

# -----------------------------------------------------------------------------
# 2. Golden Cross Pullback
# Buys dips to 50 SMA when 50 > 200 SMA (confirmed uptrend)
# -----------------------------------------------------------------------------
CODE_GOLDEN_PULLBACK = """
from backtesting import Strategy
from backtesting.test import SMA

class GoldenCrossPullback(Strategy):
    n_fast = 50
    n_slow = 200

    def init(self):
        self.sma_fast = self.I(SMA, self.data.Close, self.n_fast)
        self.sma_slow = self.I(SMA, self.data.Close, self.n_slow)

    def next(self):
        price = self.data.Close[-1]
        is_uptrend = self.sma_fast[-1] > self.sma_slow[-1]
        near_support = abs(price - self.sma_fast[-1]) / price < 0.02

        if is_uptrend and near_support and price > self.sma_fast[-1]:
            if not self.position: self.buy()
        elif self.position:
            if price < self.sma_slow[-1]:
                self.position.close()
"""

# -----------------------------------------------------------------------------
# 3. Volume Breakout Hunter
# Buys 20-day high breakouts confirmed by 2x average volume
# -----------------------------------------------------------------------------
CODE_VOLUME_BREAKOUT = """
from backtesting import Strategy
import pandas as pd

class VolumeBreakout(Strategy):
    lookback = 20
    vol_multiplier = 2.0

    def init(self):
        self.high_rolling = self.I(lambda x: pd.Series(x).rolling(self.lookback).max().values, self.data.High)
        self.vol_avg = self.I(lambda x: pd.Series(x).rolling(self.lookback).mean().values, self.data.Volume)

    def next(self):
        if len(self.data) < self.lookback + 1: return
        price = self.data.Close[-1]
        if price > self.high_rolling[-2] and self.data.Volume[-1] > (self.vol_avg[-1] * self.vol_multiplier):
            if not self.position: self.buy()
        elif self.position:
            low_rolling = min(self.data.Low[-self.lookback:])
            if price < low_rolling:
                self.position.close()
"""

# -----------------------------------------------------------------------------
# 4. RSI-2 Mean Reversion (Larry Connors)
# Ultra-short-term: buys RSI(2) < 10 in uptrend, exits above 5-day SMA
# -----------------------------------------------------------------------------
CODE_RSI2 = """
from backtesting import Strategy
from backtesting.test import SMA
import pandas as pd
import pandas_ta as ta

class RSI2Strategy(Strategy):
    rsi_period = 2
    rsi_lower = 10
    ma_period = 200
    exit_ma_period = 5

    def init(self):
        self.rsi = self.I(ta.rsi, pd.Series(self.data.Close), self.rsi_period)
        self.sma_200 = self.I(SMA, self.data.Close, self.ma_period)
        self.sma_5 = self.I(SMA, self.data.Close, self.exit_ma_period)

    def next(self):
        if self.data.Close[-1] > self.sma_200[-1] and self.rsi[-1] < self.rsi_lower:
            if not self.position: self.buy()
        elif self.position and self.data.Close[-1] > self.sma_5[-1]:
            self.position.close()
"""

# -----------------------------------------------------------------------------
# 5. MACD Trend Follower
# MACD crossover with 200 SMA trend filter
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
        macd_df = ta.macd(pd.Series(self.data.Close), fast=self.fast, slow=self.slow, signal=self.signal)
        self.macd_line = self.I(lambda: macd_df.iloc[:, 0].values)
        self.signal_line = self.I(lambda: macd_df.iloc[:, 2].values)
        self.sma_trend = self.I(SMA, self.data.Close, self.trend_filter)

    def next(self):
        if crossover(self.macd_line, self.signal_line) and self.data.Close[-1] > self.sma_trend[-1]:
            if not self.position: self.buy()
        elif crossover(self.signal_line, self.macd_line):
            if self.position: self.position.close()
"""

# -----------------------------------------------------------------------------
# 6. Dual Thrust Breakout
# Opening range breakout using prior N-day volatility range
# -----------------------------------------------------------------------------
CODE_DUAL_THRUST = """
from backtesting import Strategy
import pandas as pd

class DualThrust(Strategy):
    n = 4
    k1 = 0.5
    k2 = 0.5

    def init(self):
        self.HH = self.I(lambda x: pd.Series(x).rolling(self.n).max().values, self.data.High)
        self.HC = self.I(lambda x: pd.Series(x).rolling(self.n).max().values, self.data.Close)
        self.LC = self.I(lambda x: pd.Series(x).rolling(self.n).min().values, self.data.Close)
        self.LL = self.I(lambda x: pd.Series(x).rolling(self.n).min().values, self.data.Low)

    def next(self):
        if len(self.data) < self.n + 1: return
        r1 = self.HH[-1] - self.LC[-1]
        r2 = self.HC[-1] - self.LL[-1]
        range_val = max(r1, r2)
        buy_trigger = self.data.Open[-1] + self.k1 * range_val
        sell_trigger = self.data.Open[-1] - self.k2 * range_val

        if self.data.Close[-1] > buy_trigger:
            if not self.position: self.buy()
        elif self.data.Close[-1] < sell_trigger:
            if self.position: self.position.close()
"""

# -----------------------------------------------------------------------------
# 7. Inside Bar Momentum
# Buys breakout above mother bar after consolidation
# -----------------------------------------------------------------------------
CODE_INSIDE_BAR = """
from backtesting import Strategy

class InsideBarMomentum(Strategy):
    def init(self):
        pass

    def next(self):
        if len(self.data) < 3: return
        is_inside = (self.data.High[-2] < self.data.High[-3]) and (self.data.Low[-2] > self.data.Low[-3])
        if is_inside and self.data.Close[-1] > self.data.High[-3]:
            if not self.position: self.buy()
        elif self.position and self.data.Close[-1] < self.data.Low[-3]:
            self.position.close()
"""

# -----------------------------------------------------------------------------
# 8. Three White Soldiers (Trend)
# 3 consecutive bullish candles with rising closes
# -----------------------------------------------------------------------------
CODE_HEIKIN_ASHI = """
from backtesting import Strategy

class HeikinAshiTrend(Strategy):
    consecutive = 3

    def init(self):
        pass

    def next(self):
        if len(self.data) < self.consecutive + 1: return
        green = all(self.data.Close[i] > self.data.Open[i] for i in range(-self.consecutive, 0))
        rising = all(self.data.Close[i] > self.data.Close[i-1] for i in range(-self.consecutive+1, 0))

        if green and rising:
            if not self.position: self.buy()
        elif self.position and self.data.Close[-1] < self.data.Open[-1]:
            self.position.close()
"""

# -----------------------------------------------------------------------------
# 9. Turtle Trading (Donchian Channel Breakout)
# Buys 20-day high breakout, exits on 10-day low
# -----------------------------------------------------------------------------
CODE_TURTLE = """
from backtesting import Strategy
import pandas as pd

class TurtleTrading(Strategy):
    entry_window = 20
    exit_window = 10

    def init(self):
        self.H = self.I(lambda x: pd.Series(x).rolling(self.entry_window).max().values, self.data.High)
        self.L = self.I(lambda x: pd.Series(x).rolling(self.exit_window).min().values, self.data.Low)

    def next(self):
        if len(self.data) < self.entry_window + 1: return
        if self.data.Close[-1] > self.H[-2]:
            if not self.position: self.buy()
        elif self.data.Close[-1] < self.L[-2]:
            if self.position: self.position.close()
"""

# -----------------------------------------------------------------------------
# 10. Supertrend Follower
# ATR-based trend indicator: buy on green, sell on red
# -----------------------------------------------------------------------------
CODE_SUPERTREND = """
from backtesting import Strategy
import pandas as pd
import pandas_ta as ta

class SupertrendStrategy(Strategy):
    period = 10
    multiplier = 3.0

    def init(self):
        st = ta.supertrend(pd.Series(self.data.High), pd.Series(self.data.Low), pd.Series(self.data.Close), length=self.period, multiplier=self.multiplier)
        self.st_dir = self.I(lambda: st.iloc[:, 1].values)

    def next(self):
        if self.st_dir[-1] == 1:
            if not self.position: self.buy()
        elif self.st_dir[-1] == -1:
            if self.position: self.position.close()
"""

# -----------------------------------------------------------------------------
# 11. VWAP Pullback
# Buys when price reclaims VWAP in an uptrend
# -----------------------------------------------------------------------------
CODE_VWAP = """
from backtesting import Strategy
from backtesting.test import SMA
import pandas as pd
import pandas_ta as ta

class VWAPPullback(Strategy):
    sma_period = 50

    def init(self):
        idx = self.data.index if hasattr(self.data, 'index') else pd.RangeIndex(len(self.data.Close))
        self.vwap = self.I(lambda h,l,c,v: ta.vwap(pd.Series(h, index=idx), pd.Series(l, index=idx), pd.Series(c, index=idx), pd.Series(v, index=idx)).values, self.data.High, self.data.Low, self.data.Close, self.data.Volume)
        self.sma_50 = self.I(SMA, self.data.Close, self.sma_period)

    def next(self):
        if self.data.Close[-1] > self.sma_50[-1]:
            if self.data.Close[-2] < self.vwap[-2] and self.data.Close[-1] > self.vwap[-1]:
                if not self.position: self.buy()
        elif self.position and self.data.Close[-1] < self.vwap[-1]:
            self.position.close()
"""

# -----------------------------------------------------------------------------
# 12. Smart Money Accumulation (Broker Data)
# Buys when top-5 broker net accumulation exceeds its moving average
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
        self.sm_ma = self.I(lambda x: pd.Series(x).rolling(self.sma_period).mean().values, self.sm_cum)

    def next(self):
        if len(self.data) < self.sma_period: return
        if self.sm_cum[-1] > self.sm_ma[-1]:
            if not self.position: self.buy()
        elif self.sm_cum[-1] < self.sm_ma[-1]:
            if self.position: self.position.close()
"""

# -----------------------------------------------------------------------------
# 13. Accumulation Divergence
# Price falling + accumulation rising = bullish divergence
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
# 14. Institutional Breakout
# Price breakout confirmed by broker accumulation flow spike
# -----------------------------------------------------------------------------
CODE_INSTITUTIONAL_BREAKOUT = """
from backtesting import Strategy
import pandas as pd
import numpy as np
from stocks.models import DailyCumulativeAccumulation

class InstitutionalBreakout(Strategy):
    vol_period = 20
    vol_mult = 1.5
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
        if len(self.data) < self.breakout + 1: return
        max_h = max(self.data.High[-self.breakout-1:-1])
        if self.data.Close[-1] > max_h and self.buy_vol[-1] > (self.avg_vol[-1] * self.vol_mult):
            if not self.position: self.buy()
        elif self.position and self.data.Close[-1] < min(self.data.Low[-10:]):
            self.position.close()
"""

# -----------------------------------------------------------------------------
# 15. Accumulation Squeeze
# Low BB width + high accumulation = coiling for breakout
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

    def init(self):
        close = pd.Series(self.data.Close)
        bb = ta.bbands(close, length=self.bb_len, std=self.bb_std)
        self.bb_width = self.I(lambda: ((bb.iloc[:, 2] - bb.iloc[:, 0]) / close).values)
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
        is_squeeze = self.bb_width[-1] < self.threshold
        is_accumulating = self.acc[-1] > pd.Series(self.acc[-self.acc_lookback:]).quantile(self.acc_quantile)
        if is_squeeze and is_accumulating:
            if not self.position: self.buy()
        elif self.position and self.bb_width[-1] > self.threshold * 2:
            self.position.close()
"""

# -----------------------------------------------------------------------------
# 16. Smart Money Trend (Flow Crossover)
# MA crossover of the accumulation line itself
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
        self.fast_ma = self.I(lambda x: pd.Series(x).rolling(self.fast).mean().values, line)
        self.slow_ma = self.I(lambda x: pd.Series(x).rolling(self.slow).mean().values, line)

    def next(self):
        if crossover(self.fast_ma, self.slow_ma):
            if not self.position: self.buy()
        elif crossover(self.slow_ma, self.fast_ma):
            if self.position: self.position.close()
"""

# -----------------------------------------------------------------------------
# 17. Parabolic SAR
# Classic stop-and-reverse trend following
# -----------------------------------------------------------------------------
CODE_PSAR = """
from backtesting import Strategy
import pandas as pd
import pandas_ta as ta

class ParabolicSAR(Strategy):
    def init(self):
        psar = ta.psar(pd.Series(self.data.High), pd.Series(self.data.Low), pd.Series(self.data.Close))
        long_col = psar.iloc[:, 0]
        short_col = psar.iloc[:, 1]
        self.psar = self.I(lambda: long_col.fillna(short_col).values)

    def next(self):
        if len(self.data) < 3: return
        if self.data.Close[-2] < self.psar[-2] and self.data.Close[-1] > self.psar[-1]:
            if not self.position: self.buy()
        elif self.data.Close[-2] > self.psar[-2] and self.data.Close[-1] < self.psar[-1]:
            if self.position: self.position.close()
"""

# -----------------------------------------------------------------------------
# 18. Ichimoku Cloud Breakout
# Buys above both Senkou Span A and B
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
        ich = ta.ichimoku(pd.Series(self.data.High), pd.Series(self.data.Low), pd.Series(self.data.Close), tenkan=self.tenkan, kijun=self.kijun, senkou=self.senkou)
        self.span_a = self.I(lambda: ich[0].iloc[:, 0].values)
        self.span_b = self.I(lambda: ich[0].iloc[:, 1].values)
        self.tenkan_line = self.I(lambda: ich[0].iloc[:, 2].values)
        self.kijun_line = self.I(lambda: ich[0].iloc[:, 3].values)

    def next(self):
        price = self.data.Close[-1]
        above_cloud = price > max(self.span_a[-1], self.span_b[-1])
        tk_cross = self.tenkan_line[-1] > self.kijun_line[-1]
        if above_cloud and tk_cross:
            if not self.position: self.buy()
        elif price < min(self.span_a[-1], self.span_b[-1]):
            if self.position: self.position.close()
"""

# -----------------------------------------------------------------------------
# 19. ADX + DI Trend
# Only trades strong trends (ADX > 25) with DI+ confirmation
# -----------------------------------------------------------------------------
CODE_ADX = """
from backtesting import Strategy
import pandas as pd
import pandas_ta as ta

class ADXTrend(Strategy):
    period = 14
    threshold = 25

    def init(self):
        adx_df = ta.adx(pd.Series(self.data.High), pd.Series(self.data.Low), pd.Series(self.data.Close), length=self.period)
        self.adx = self.I(lambda: adx_df.iloc[:, 0].values)
        self.dmp = self.I(lambda: adx_df.iloc[:, 1].values)
        self.dmn = self.I(lambda: adx_df.iloc[:, 2].values)

    def next(self):
        if self.adx[-1] > self.threshold and self.dmp[-1] > self.dmn[-1]:
            if not self.position: self.buy()
        elif self.dmn[-1] > self.dmp[-1]:
            if self.position: self.position.close()
"""

# -----------------------------------------------------------------------------
# 20. Fibonacci Golden Zone
# Buys in the 50%-61.8% retracement zone of recent swing
# -----------------------------------------------------------------------------
CODE_FIBO = """
from backtesting import Strategy
import pandas as pd
import pandas_ta as ta

class FibonacciGoldenZone(Strategy):
    lookback = 50
    fib_high = 0.618
    fib_low = 0.500
    trend_ma = 100

    def init(self):
        self.sma = self.I(lambda c: ta.sma(pd.Series(c), length=self.trend_ma).values, self.data.Close)

    def next(self):
        if len(self.data) < self.lookback: return
        h = max(self.data.High[-self.lookback:])
        l = min(self.data.Low[-self.lookback:])
        diff = h - l
        if diff == 0: return
        fib_hi = l + self.fib_high * diff
        fib_lo = l + self.fib_low * diff
        price = self.data.Close[-1]
        if fib_lo <= price <= fib_hi and price > self.sma[-1]:
            if not self.position: self.buy()
        elif self.position:
            if price > h or price < l:
                self.position.close()
"""

# -----------------------------------------------------------------------------
# 21. Stochastic RSI Cross
# K/D crossover in oversold territory
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
    os_level = 20

    def init(self):
        stoch = ta.stochrsi(pd.Series(self.data.Close), length=self.length, rsi_length=self.rsi_len, k=self.k_per, d=self.d_per)
        self.k = self.I(lambda: stoch.iloc[:, 0].values)
        self.d = self.I(lambda: stoch.iloc[:, 1].values)

    def next(self):
        if len(self.data) < 3: return
        if self.k[-2] < self.d[-2] and self.k[-1] > self.d[-1] and self.k[-1] < self.os_level:
            if not self.position: self.buy()
        elif self.k[-2] > self.d[-2] and self.k[-1] < self.d[-1] and self.k[-1] > self.ob:
            if self.position: self.position.close()
"""

# -----------------------------------------------------------------------------
# 22. Williams %R Trend
# Oversold entry in uptrend (Price > 50 SMA)
# -----------------------------------------------------------------------------
CODE_WILLIAMS = """
from backtesting import Strategy
import pandas as pd
import pandas_ta as ta

class WilliamsTrend(Strategy):
    length = 14
    sma_len = 50
    os_level = -80
    ob_level = -20

    def init(self):
        self.willr = self.I(lambda h,l,c: ta.willr(pd.Series(h), pd.Series(l), pd.Series(c), length=self.length).values, self.data.High, self.data.Low, self.data.Close)
        self.sma = self.I(lambda c: ta.sma(pd.Series(c), length=self.sma_len).values, self.data.Close)

    def next(self):
        if self.data.Close[-1] > self.sma[-1] and self.willr[-1] < self.os_level:
            if not self.position: self.buy()
        elif self.willr[-1] > self.ob_level:
            if self.position: self.position.close()
"""

# -----------------------------------------------------------------------------
# 23. Force Index Impulse
# Elder's Force Index zero-line crossover (price change * volume)
# -----------------------------------------------------------------------------
CODE_FORCE = """
from backtesting import Strategy
import pandas as pd
import pandas_ta as ta

class ForceIndexImpulse(Strategy):
    length = 13

    def init(self):
        idx = self.data.index if hasattr(self.data, 'index') else pd.RangeIndex(len(self.data.Close))
        self.efi = self.I(lambda c,v: ta.efi(pd.Series(c, index=idx), pd.Series(v, index=idx), length=self.length).values, self.data.Close, self.data.Volume)

    def next(self):
        if len(self.data) < 3: return
        if self.efi[-2] < 0 and self.efi[-1] > 0:
            if not self.position: self.buy()
        elif self.efi[-2] > 0 and self.efi[-1] < 0:
            if self.position: self.position.close()
"""

# -----------------------------------------------------------------------------
# 24. Chaikin Money Flow
# Buys when CMF crosses above threshold (accumulation)
# -----------------------------------------------------------------------------
CODE_CMF = """
from backtesting import Strategy
import pandas as pd
import pandas_ta as ta

class CMFDivergence(Strategy):
    length = 20
    threshold = 0.05

    def init(self):
        self.cmf = self.I(lambda h,l,c,v: ta.cmf(pd.Series(h), pd.Series(l), pd.Series(c), pd.Series(v), length=self.length).values, self.data.High, self.data.Low, self.data.Close, self.data.Volume)

    def next(self):
        if len(self.data) < 3: return
        if self.cmf[-2] < self.threshold and self.cmf[-1] > self.threshold:
            if not self.position: self.buy()
        elif self.cmf[-1] < -self.threshold:
            if self.position: self.position.close()
"""

# -----------------------------------------------------------------------------
# 25. Keltner Channel Breakout
# Volatility breakout above upper Keltner Channel
# -----------------------------------------------------------------------------
CODE_KELTNER = """
from backtesting import Strategy
import pandas as pd
import pandas_ta as ta

class KeltnerBreakout(Strategy):
    length = 20
    scalar = 2

    def init(self):
        kc = ta.kc(pd.Series(self.data.High), pd.Series(self.data.Low), pd.Series(self.data.Close), length=self.length, scalar=self.scalar)
        self.kc_lower = self.I(lambda: kc.iloc[:, 0].values)
        self.kc_mid = self.I(lambda: kc.iloc[:, 1].values)
        self.kc_upper = self.I(lambda: kc.iloc[:, 2].values)

    def next(self):
        if self.data.Close[-1] > self.kc_upper[-1]:
            if not self.position: self.buy()
        elif self.data.Close[-1] < self.kc_lower[-1]:
            if self.position: self.position.close()
"""

# -----------------------------------------------------------------------------
# 26. Money Flow Index Reversal
# Volume-weighted RSI – buys oversold, sells overbought
# -----------------------------------------------------------------------------
CODE_MFI = """
from backtesting import Strategy
import pandas as pd
import pandas_ta as ta

class MFIReversal(Strategy):
    length = 14
    os_level = 20
    ob_level = 80

    def init(self):
        self.mfi = self.I(lambda h,l,c,v: ta.mfi(pd.Series(h), pd.Series(l), pd.Series(c), pd.Series(v), length=self.length).values, self.data.High, self.data.Low, self.data.Close, self.data.Volume)

    def next(self):
        if len(self.data) < 3: return
        if self.mfi[-2] > self.os_level and self.mfi[-1] < self.os_level:
            pass
        if self.mfi[-2] < self.os_level and self.mfi[-1] > self.os_level:
            if not self.position: self.buy()
        elif self.mfi[-1] > self.ob_level:
            if self.position: self.position.close()
"""

# -----------------------------------------------------------------------------
# 27. On-Balance Volume (OBV) Trend
# OBV above its MA + price above its MA = confirmed trend
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
        self.price_ma = self.I(lambda c: ta.sma(pd.Series(c), length=self.sma_len).values, self.data.Close)

    def next(self):
        if self.obv[-1] > self.obv_ma[-1] and self.data.Close[-1] > self.price_ma[-1]:
            if not self.position: self.buy()
        elif self.obv[-1] < self.obv_ma[-1]:
            if self.position: self.position.close()
"""

# -----------------------------------------------------------------------------
# 28. Aroon Trend Strength
# Aroon Up / Down crossover for early trend detection
# -----------------------------------------------------------------------------
CODE_AROON = """
from backtesting import Strategy
import pandas as pd
import pandas_ta as ta

class AroonTrend(Strategy):
    length = 14

    def init(self):
        aroon = ta.aroon(pd.Series(self.data.High), pd.Series(self.data.Low), length=self.length)
        self.aroon_down = self.I(lambda: aroon.iloc[:, 0].values)
        self.aroon_up = self.I(lambda: aroon.iloc[:, 1].values)

    def next(self):
        if len(self.data) < 3: return
        if self.aroon_up[-2] < self.aroon_down[-2] and self.aroon_up[-1] > self.aroon_down[-1]:
            if not self.position: self.buy()
        elif self.aroon_up[-1] < self.aroon_down[-1]:
            if self.position: self.position.close()
"""

# -----------------------------------------------------------------------------
# 29. Coppock Curve
# Long-term bottom detection (turns up from below zero)
# -----------------------------------------------------------------------------
CODE_COPPOCK = """
from backtesting import Strategy
import pandas as pd
import pandas_ta as ta

class CoppockCurve(Strategy):
    def init(self):
        self.coppock = self.I(lambda c: ta.coppock(pd.Series(c)).values, self.data.Close)

    def next(self):
        if len(self.data) < 3: return
        if self.coppock[-2] < 0 and self.coppock[-1] < 0 and self.coppock[-1] > self.coppock[-2]:
            if not self.position: self.buy()
        elif self.coppock[-1] < self.coppock[-2]:
            if self.position: self.position.close()
"""

# -----------------------------------------------------------------------------
# 30. Volatility Stop (ATR Trailing)
# Uses ATR below SMA as dynamic exit trigger
# -----------------------------------------------------------------------------
CODE_ATR_TRAIL = """
from backtesting import Strategy
import pandas as pd
import pandas_ta as ta

class VolatilityStop(Strategy):
    atr_len = 14
    sma_len = 20
    atr_mult = 1.5

    def init(self):
        self.atr = self.I(lambda h,l,c: ta.atr(pd.Series(h), pd.Series(l), pd.Series(c), length=self.atr_len).values, self.data.High, self.data.Low, self.data.Close)
        self.sma = self.I(lambda x: pd.Series(x).rolling(self.sma_len).mean().values, self.data.Close)

    def next(self):
        if self.data.Close[-1] > self.sma[-1]:
            if not self.position: self.buy()
        if self.position and self.data.Close[-1] < (self.sma[-1] - self.atr[-1] * self.atr_mult):
            self.position.close()
"""

# -----------------------------------------------------------------------------
# 31. Williams Alligator v2
# Alligator lines + fractal breakout confirmation
# -----------------------------------------------------------------------------
CODE_ALLIGATOR_V2 = """
from backtesting import Strategy
import pandas as pd
import pandas_ta as ta

class WilliamsAlligatorV2(Strategy):
    jaw_period = 13
    teeth_period = 8
    lips_period = 5
    jaw_shift = 8
    teeth_shift = 5
    lips_shift = 3
    frac_period = 5

    def init(self):
        close = pd.Series(self.data.Close)
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
# 32. Turtle Soup Reversal
# Fades failed breakdowns (price dips under 20-day low but closes back)
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
        if len(self.data) < self.lookback + 1: return
        if self.data.Low[-1] < self.low_20[-1] and self.data.Close[-1] > self.low_20[-1]:
            if not self.position: self.buy()
        elif self.position:
            bars_held = len(self.data) - self.trades[-1].entry_bar if self.trades else 0
            if bars_held > self.hold:
                self.position.close()
"""

# -----------------------------------------------------------------------------
# 33. Golden Cross + ADX
# 50/200 SMA cross only when ADX confirms strong trend
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
        adx_df = ta.adx(pd.Series(self.data.High), pd.Series(self.data.Low), pd.Series(self.data.Close), length=self.adx_len)
        self.adx = self.I(lambda: adx_df.iloc[:, 0].values)

    def next(self):
        if self.sma_f[-1] > self.sma_s[-1] and self.adx[-1] > self.adx_th:
            if not self.position: self.buy()
        elif self.sma_f[-1] < self.sma_s[-1]:
            if self.position: self.position.close()
"""

# -----------------------------------------------------------------------------
# 34. MACD + Parabolic SAR
# MACD crossover entry, SAR trailing exit
# -----------------------------------------------------------------------------
CODE_MACD_SAR = """
from backtesting import Strategy
import pandas as pd
import pandas_ta as ta

class MACD_SAR(Strategy):
    def init(self):
        macd_df = ta.macd(pd.Series(self.data.Close))
        self.macd = self.I(lambda: macd_df.iloc[:, 0].values)
        self.signal = self.I(lambda: macd_df.iloc[:, 2].values)
        psar = ta.psar(pd.Series(self.data.High), pd.Series(self.data.Low), pd.Series(self.data.Close))
        self.sar = self.I(lambda: psar.iloc[:, 0].fillna(psar.iloc[:, 1]).values)

    def next(self):
        if len(self.data) < 3: return
        macd_cross_up = self.macd[-2] < self.signal[-2] and self.macd[-1] > self.signal[-1]
        if macd_cross_up and self.data.Close[-1] > self.sar[-1]:
            if not self.position: self.buy()
        elif self.position and self.data.Close[-1] < self.sar[-1]:
            self.position.close()
"""

# -----------------------------------------------------------------------------
# 35. Elder's Triple Screen
# Weekly MACD slope + daily Stochastic oversold
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
    os_level = 30
    ob_level = 80

    def init(self):
        macd_h = ta.macd(pd.Series(self.data.Close), fast=self.w_fast, slow=self.w_slow, signal=self.w_sig)
        self.w_macd_slope = self.I(lambda: macd_h.iloc[:, 1].diff().fillna(0).values)
        stoch = ta.stoch(pd.Series(self.data.High), pd.Series(self.data.Low), pd.Series(self.data.Close), k=self.k_per)
        self.k = self.I(lambda: stoch.iloc[:, 0].values)

    def next(self):
        if len(self.data) < 3: return
        if self.w_macd_slope[-1] > 0 and self.k[-2] < self.os_level and self.k[-1] > self.k[-2]:
            if not self.position: self.buy()
        elif self.k[-1] > self.ob_level:
            if self.position: self.position.close()
"""

# -----------------------------------------------------------------------------
# 36. NR7 Volatility Breakout
# Narrowest Range 7 day + next day breakout
# -----------------------------------------------------------------------------
CODE_NR7 = """
from backtesting import Strategy
import pandas as pd

class NR7Breakout(Strategy):
    lookback = 8

    def init(self):
        self.daily_range = self.I(lambda h,l: (pd.Series(h) - pd.Series(l)).values, self.data.High, self.data.Low)

    def next(self):
        if len(self.daily_range) < self.lookback: return
        yesterday_range = self.daily_range[-2]
        min_range = min(self.daily_range[-self.lookback:-2])
        is_nr7 = yesterday_range <= min_range
        if is_nr7 and self.data.Close[-1] > self.data.High[-2]:
            if not self.position: self.buy()
        elif self.position and self.data.Close[-1] < self.data.Low[-2]:
            self.position.close()
"""

# -----------------------------------------------------------------------------
# 37. Z-Score Mean Reversion
# Statistical: buys at -2 std devs, exits at mean reversion
# -----------------------------------------------------------------------------
CODE_ZSCORE = """
from backtesting import Strategy
import pandas as pd

class ZScoreReversion(Strategy):
    window = 20
    entry = -2.0
    exit_z = 0.0

    def init(self):
        close = pd.Series(self.data.Close)
        mean = close.rolling(self.window).mean()
        std = close.rolling(self.window).std()
        self.z = self.I(lambda: ((close - mean) / std).values)

    def next(self):
        if self.z[-1] < self.entry:
            if not self.position: self.buy()
        elif self.z[-1] > self.exit_z:
            if self.position: self.position.close()
"""


# =============================================================================
# STRATEGY DEFINITIONS
# =============================================================================
strategies = [
    {"name": "RSI & Bollinger Mean Reversion", "description": "Mean reversion for ranging markets. Buys when RSI < 30 AND price touches the lower Bollinger Band. Exits when overbought (RSI > 70) or price reaches upper band.", "code": CODE_RSI_BB},
    {"name": "Golden Cross Pullback", "description": "Trend following. Waits for 50 SMA > 200 SMA (confirmed uptrend), then buys pullbacks to the 50 SMA support. Exits below the 200 SMA.", "code": CODE_GOLDEN_PULLBACK},
    {"name": "Volume Breakout Hunter", "description": "Momentum strategy. Buys when price breaks 20-day high with 2x average volume confirmation. Exits on 20-day low breakdown.", "code": CODE_VOLUME_BREAKOUT},
    {"name": "RSI-2 Mean Reversion", "description": "Larry Connors' ultra-short-term strategy. Buys deep dips (RSI-2 < 10) in uptrend (Price > 200 SMA), exits on quick bounce above 5 SMA. Very high win rate.", "code": CODE_RSI2},
    {"name": "MACD Trend Follower", "description": "Classic momentum. Buys MACD/Signal crossover only when price is above 200 SMA (trend filter). Exits on bearish MACD crossover.", "code": CODE_MACD_TREND},
    {"name": "Dual Thrust Breakout", "description": "Opening range breakout. Calculates volatility range from prior N days and buys when price breaks above open + K * range.", "code": CODE_DUAL_THRUST},
    {"name": "Inside Bar Momentum", "description": "Price action. Identifies Inside Bars (consolidation) and buys when price breaks above the mother bar's high.", "code": CODE_INSIDE_BAR},
    {"name": "Three White Soldiers (Trend)", "description": "Pattern recognition. Buys when 3 consecutive bullish candles with rising closes appear. Exits on first bearish candle.", "code": CODE_HEIKIN_ASHI},
    {"name": "Turtle Trading (Channel Breakout)", "description": "Legendary Turtle experiment. Buys 20-day high breakouts, exits on 10-day lows. Catches major trends.", "code": CODE_TURTLE},
    {"name": "Supertrend Follower", "description": "ATR-based trend indicator. Buys when signal turns bullish (green), sells when bearish (red). Very effective in trending markets.", "code": CODE_SUPERTREND},
    {"name": "VWAP Pullback", "description": "Institutional-style. Buys when price reclaims VWAP in an uptrend (above 50 SMA). Uses VWAP as dynamic support.", "code": CODE_VWAP},
    {"name": "Smart Money Accumulation", "description": "Tracks net buying of top 5 brokers. Buys when cumulative accumulation exceeds its 20-day moving average.", "code": CODE_SMART_MONEY},
    {"name": "Accumulation Divergence", "description": "Contrarian. Identifies where price is dropping but accumulation (buying pressure) is rising — a bullish divergence.", "code": CODE_ACC_DIVERGENCE},
    {"name": "Institutional Breakout", "description": "Volume breakout confirmed by broker data. Only buys when accumulation flow is 1.5x above average.", "code": CODE_INSTITUTIONAL_BREAKOUT},
    {"name": "Accumulation Squeeze", "description": "Detects coiling: low Bollinger Band width (squeeze) + high accumulation intensity. Anticipates explosive moves.", "code": CODE_ACC_SQUEEZE},
    {"name": "Smart Money Trend (Ownership)", "description": "Trades the direction of ownership, not price. Buys when 10-day MA of accumulation crosses above 50-day MA.", "code": CODE_SMART_MONEY_TREND},
    {"name": "Parabolic SAR (Momentum)", "description": "Classic trend-following with stop-and-reverse. Buys when price crosses above SAR, sells on crossunder.", "code": CODE_PSAR},
    {"name": "Ichimoku Cloud Trend", "description": "Japanese trend analysis. Buys above the Cloud with Tenkan/Kijun confirmation. Exits below the Cloud.", "code": CODE_ICHIMOKU},
    {"name": "ADX Trend Strength", "description": "Filters choppy markets. Only buys when ADX > 25 (strong trend) and DI+ > DI-.", "code": CODE_ADX},
    {"name": "Fibonacci Golden Zone", "description": "Retracement strategy. Buys in the 50%-61.8% Fibonacci zone with 100 SMA trend filter. Exits at swing extremes.", "code": CODE_FIBO},
    {"name": "Stochastic RSI Cross", "description": "Sensitive momentum. Buys when Stoch RSI K crosses above D in oversold territory (< 20). Sells in overbought.", "code": CODE_STOCH_RSI},
    {"name": "Williams %R Trend", "description": "Momentum pullback. Buys when Williams %R is oversold (< -80) in an uptrend (Price > 50 SMA).", "code": CODE_WILLIAMS},
    {"name": "Force Index Impulse", "description": "Elder's Force Index (price change * volume). Buys when Force Index crosses above zero — bulls seize control.", "code": CODE_FORCE},
    {"name": "Chaikin Money Flow Divergence", "description": "Volume flow. Buys when CMF crosses above 0.05 threshold (accumulation). Sells when CMF turns negative.", "code": CODE_CMF},
    {"name": "Keltner Channel Breakout", "description": "Volatility breakout. Buys when price closes above upper Keltner Channel. ATR-based dynamic width.", "code": CODE_KELTNER},
    {"name": "Money Flow Index Reversal", "description": "Volume-weighted RSI. Buys when MFI turns up from oversold (< 20). Sells when MFI reaches overbought (> 80).", "code": CODE_MFI},
    {"name": "On-Balance Volume (OBV) Trend", "description": "Volume validation. Buys when OBV is above its MA AND price is above its MA — double confirmation.", "code": CODE_OBV},
    {"name": "Aroon Trend Strength", "description": "Early trend detection. Buys when Aroon Up crosses above Aroon Down, signalling new uptrend.", "code": CODE_AROON},
    {"name": "Coppock Curve (Long Term)", "description": "Long-term bottom fishing. Buys when the Coppock Curve turns up from below zero. Famous for catching major bottoms.", "code": CODE_COPPOCK},
    {"name": "Volatility Stop (ATR Trailing)", "description": "Risk management strategy. Buys above SMA, uses ATR-based trailing stop (SMA - 1.5*ATR) for exits.", "code": CODE_ATR_TRAIL},
    {
        "name": "Williams Alligator v2",
        "description": "Bill Williams' Alligator with fractal confirmation. Buys when Lips > Teeth > Jaw (eating) and price breaks fractal high.",
        "code": CODE_ALLIGATOR_V2,
        "optimization_config": {
            "jaw_period": [8, 34], "teeth_period": [5, 21], "lips_period": [3, 13],
            "jaw_shift": [5, 13], "teeth_shift": [3, 8], "lips_shift": [2, 5], "frac_period": [3, 10]
        }
    },
    {"name": "Turtle Soup Reversal", "description": "Mean reversion trap trading. Buys when price dips below 20-day low but closes back above — catches stop hunts.", "code": CODE_TURTLE_SOUP},
    {"name": "Golden Cross + ADX", "description": "Filtered trend following. Classic 50/200 SMA crossover, only taken when ADX > 25 confirms strong trend.", "code": CODE_GOLDEN_ADX},
    {"name": "MACD + Parabolic SAR", "description": "Momentum + trailing stop. Enters on MACD crossover if price is above SAR. Uses SAR as dynamic exit.", "code": CODE_MACD_SAR},
    {"name": "Elder's Triple Screen", "description": "Multi-timeframe. Screen 1: Weekly MACD slope up. Screen 2: Daily Stochastic oversold. Enters on bounce.", "code": CODE_ELDER_TRIPLE},
    {"name": "NR7 Volatility Breakout", "description": "Price action. Identifies Narrowest Range 7 day (calm before storm) and buys the subsequent breakout.", "code": CODE_NR7},
    {"name": "Z-Score Mean Reversion", "description": "Statistical/Quant. Buys when price deviates -2 StdDev from mean (Z-Score < -2). Sells at mean reversion.", "code": CODE_ZSCORE},
]

def seed():
    user = User.objects.first()
    if not user:
        print("Error: No users found. Please create a user first.")
        return

    print(f"Seeding {len(strategies)} strategies for user: {user.username}")

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
        action = "[CREATED]" if created else "[UPDATED]"
        print(f"{action} {s['name']}")

    print(f"\nDone! {len(strategies)} strategies seeded.")

if __name__ == '__main__':
    seed()
