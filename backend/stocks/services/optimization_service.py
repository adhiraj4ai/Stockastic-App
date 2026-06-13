import re
import os
os.environ.setdefault('NUMBA_CACHE_DIR', '/tmp/numba_cache')
import inspect
import pandas as pd
import numpy as np
import optuna
from backtesting import Backtest, Strategy
from backtesting.lib import crossover
from backtesting.test import SMA
import talib
from datetime import datetime, timedelta
from django.db.models import Min, Q
from ..models.market import Company, DailyStockPrice
from ..models.strategy import Strategy as StrategyModel, StrategyExperiment, ScopeType
import uuid
import logging
from concurrent.futures import ThreadPoolExecutor

logger = logging.getLogger(__name__)

OOS_FRACTION = 0.30  # held-out tail fraction for out-of-sample validation

# --- Wrappers for Robustness and Library Migration ---

class SafeIndicator:
    def __init__(self, obj):
        self.obj = obj
    @property
    def values(self):
        if self.obj is None: return np.array([])
        if hasattr(self.obj, 'values'): return self.obj.values
        return self.obj
    def __len__(self): return len(self.obj) if self.obj is not None else 0
    def __getitem__(self, key):
        if self.obj is None: return None
        return self.obj[key]


def _to_arr(x):
    """Convert Series/DataFrame/list to float64 numpy array."""
    if isinstance(x, (pd.Series, pd.DataFrame)):
        return x.values.astype(float)
    return np.asarray(x, dtype=float)


def _idx(x):
    """Return index of a Series, or None."""
    return x.index if isinstance(x, pd.Series) else None


class SafeTa:
    """
    Full talib-based replacement for pandas_ta.

    Implements the pandas_ta API (function names, parameter names, return shapes)
    so that strategy code using ``import pandas_ta as ta`` continues to work
    after pandas_ta is removed from the dependency list.

    DataFrame-returning functions preserve pandas_ta column ordering so that
    ``.iloc[:, n]`` access in existing strategies is correct.
    """

    def __init__(self, real_ta):
        self._ta = real_ta

    # ------------------------------------------------------------------ #
    #  Single-series indicators (return pd.Series)                        #
    # ------------------------------------------------------------------ #

    def rsi(self, close, length=14, **_):
        arr = _to_arr(close)
        return pd.Series(talib.RSI(arr, timeperiod=int(length)), index=_idx(close))

    def sma(self, close, length=10, **_):
        arr = _to_arr(close)
        return pd.Series(talib.SMA(arr, timeperiod=int(length)), index=_idx(close))

    def ema(self, close, length=10, **_):
        arr = _to_arr(close)
        return pd.Series(talib.EMA(arr, timeperiod=int(length)), index=_idx(close))

    def wma(self, close, length=10, **_):
        arr = _to_arr(close)
        return pd.Series(talib.WMA(arr, timeperiod=int(length)), index=_idx(close))

    def tema(self, close, length=10, **_):
        arr = _to_arr(close)
        return pd.Series(talib.TEMA(arr, timeperiod=int(length)), index=_idx(close))

    def dema(self, close, length=10, **_):
        arr = _to_arr(close)
        return pd.Series(talib.DEMA(arr, timeperiod=int(length)), index=_idx(close))

    def obv(self, close, volume, **_):
        return pd.Series(talib.OBV(_to_arr(close), _to_arr(volume)), index=_idx(close))

    def atr(self, high, low, close, length=14, **_):
        return pd.Series(
            talib.ATR(_to_arr(high), _to_arr(low), _to_arr(close), timeperiod=int(length)),
            index=_idx(close),
        )

    def cci(self, high, low, close, length=14, **_):
        return pd.Series(
            talib.CCI(_to_arr(high), _to_arr(low), _to_arr(close), timeperiod=int(length)),
            index=_idx(close),
        )

    def roc(self, close, length=10, **_):
        return pd.Series(talib.ROC(_to_arr(close), timeperiod=int(length)), index=_idx(close))

    def mom(self, close, length=10, **_):
        return pd.Series(talib.MOM(_to_arr(close), timeperiod=int(length)), index=_idx(close))

    def willr(self, high, low, close, length=14, **_):
        return pd.Series(
            talib.WILLR(_to_arr(high), _to_arr(low), _to_arr(close), timeperiod=int(length)),
            index=_idx(close),
        )

    # ------------------------------------------------------------------ #
    #  VWAP  (no talib equivalent — manual rolling daily calculation)     #
    # ------------------------------------------------------------------ #

    def vwap(self, high, low, close, volume, **_):
        h, l, c, v = _to_arr(high), _to_arr(low), _to_arr(close), _to_arr(volume)
        tp = (h + l + c) / 3.0
        cum_tpv = np.cumsum(tp * v)
        cum_v = np.cumsum(v)
        result = np.where(cum_v > 0, cum_tpv / cum_v, np.nan)
        return pd.Series(result, index=_idx(close))

    # ------------------------------------------------------------------ #
    #  Multi-output / DataFrame-returning indicators                      #
    # ------------------------------------------------------------------ #

    def bbands(self, close, length=20, std=2.0, **_):
        """Returns DataFrame with columns [BBL, BBM, BBU] (iloc[:, 0/1/2])."""
        upper, middle, lower = talib.BBANDS(
            _to_arr(close), timeperiod=int(length),
            nbdevup=float(std), nbdevdn=float(std),
        )
        idx = _idx(close)
        return pd.DataFrame({'BBL': lower, 'BBM': middle, 'BBU': upper}, index=idx)

    def macd(self, close, fast=12, slow=26, signal=9, **_):
        """Returns DataFrame with columns [MACD, MACDh, MACDs] (iloc[:, 0/1/2])."""
        macd_line, macdsig, macdhist = talib.MACD(
            _to_arr(close),
            fastperiod=int(fast), slowperiod=int(slow), signalperiod=int(signal),
        )
        idx = _idx(close)
        return pd.DataFrame({'MACD': macd_line, 'MACDh': macdhist, 'MACDs': macdsig}, index=idx)

    def adx(self, high, low, close, length=14, **_):
        """Returns DataFrame with columns [ADX, DMP, DMN] (iloc[:, 0/1/2])."""
        period = int(length)
        h, l, c = _to_arr(high), _to_arr(low), _to_arr(close)
        adx = talib.ADX(h, l, c, timeperiod=period)
        dmp = talib.PLUS_DI(h, l, c, timeperiod=period)
        dmn = talib.MINUS_DI(h, l, c, timeperiod=period)
        idx = _idx(close)
        return pd.DataFrame({'ADX': adx, 'DMP': dmp, 'DMN': dmn}, index=idx)

    def stochrsi(self, close, length=14, rsi_length=14, k=3, d=3, **_):
        """Returns DataFrame with columns [STOCHRSIk, STOCHRSId] (iloc[:, 0/1])."""
        fastk, fastd = talib.STOCHRSI(
            _to_arr(close),
            timeperiod=int(length), fastk_period=int(rsi_length),
            fastd_period=int(d), fastd_matype=0,
        )
        idx = _idx(close)
        return pd.DataFrame({'STOCHRSIk': fastk, 'STOCHRSId': fastd}, index=idx)

    def stoch(self, high, low, close, k=14, d=3, smooth_k=3, **_):
        """Returns DataFrame with columns [STOCHk, STOCHd] (iloc[:, 0/1])."""
        slowk, slowd = talib.STOCH(
            _to_arr(high), _to_arr(low), _to_arr(close),
            fastk_period=int(k), slowk_period=int(smooth_k),
            slowk_matype=0, slowd_period=int(d), slowd_matype=0,
        )
        idx = _idx(close)
        return pd.DataFrame({'STOCHk': slowk, 'STOCHd': slowd}, index=idx)

    def psar(self, high, low, *_, af0=0.02, af=0.02, max_af=0.2, **__):
        """Parabolic SAR — pandas_ta-compatible (talib.SAR underneath).

        Returns DataFrame with columns [PSARl, PSARs] matching iloc[:, 0/1].
        PSARl holds the SAR value when it is below price (uptrend), NaN otherwise.
        PSARs holds the SAR value when it is above price (downtrend), NaN otherwise.
        """
        h, l = _to_arr(high), _to_arr(low)
        acceleration = float(af0 if af0 else af)
        sar = talib.SAR(h, l, acceleration=acceleration, maximum=float(max_af))
        mid = (h + l) / 2.0
        psar_l = np.where(sar < mid, sar, np.nan)
        psar_s = np.where(sar >= mid, sar, np.nan)
        col = f'{acceleration:.2f}_{float(max_af):.1f}'
        return pd.DataFrame(
            {f'PSARl_{col}': psar_l, f'PSARs_{col}': psar_s},
            index=_idx(high),
        )

    # ------------------------------------------------------------------ #
    #  Ichimoku  (no talib equivalent — manual implementation)            #
    #  Column order matches pandas_ta: ISA, ISB, ITS, IKS, ICS           #
    # ------------------------------------------------------------------ #

    def ichimoku(self, high, low, close, tenkan=9, kijun=26, senkou=52, **_):
        """Returns (df, span_df) matching pandas_ta ichimoku output shape.

        df columns (iloc order): ISA_9, ISB_26, ITS_9, IKS_26, ICS
        span_df: forward-shifted cloud (Span A and B projected kijun bars ahead).
        """
        h, l = _to_arr(high), _to_arr(low)
        idx = _idx(high)
        n = len(h)

        def _donchian_mid(highs, lows, period):
            out = np.full(n, np.nan)
            for i in range(period - 1, n):
                out[i] = (highs[i - period + 1:i + 1].max() + lows[i - period + 1:i + 1].min()) / 2.0
            return out

        tenkan_sen = _donchian_mid(h, l, int(tenkan))
        kijun_sen = _donchian_mid(h, l, int(kijun))
        senkou_a = (tenkan_sen + kijun_sen) / 2.0
        senkou_b = _donchian_mid(h, l, int(senkou))

        close_arr = _to_arr(close)
        # Chikou: lagging span — close shifted back kijun bars
        chikou = np.full(n, np.nan)
        chikou[:n - int(kijun)] = close_arr[int(kijun):]

        df = pd.DataFrame(
            {'ISA_9': senkou_a, 'ISB_26': senkou_b, 'ITS_9': tenkan_sen, 'IKS_26': kijun_sen, 'ICS': chikou},
            index=idx,
        )

        # span_df: cloud projected kijun bars forward
        span_a_fwd = np.full(n, np.nan)
        span_b_fwd = np.full(n, np.nan)
        kijun_int = int(kijun)
        if n > kijun_int:
            span_a_fwd[kijun_int:] = senkou_a[:n - kijun_int]
            span_b_fwd[kijun_int:] = senkou_b[:n - kijun_int]
        span_df = pd.DataFrame({'ISA_9': span_a_fwd, 'ISB_26': span_b_fwd}, index=idx)

        return df, span_df

    # ------------------------------------------------------------------ #
    #  Composite indicators with no single talib function                 #
    #  (column order mirrors pandas_ta so .iloc[:, n] access is correct)  #
    # ------------------------------------------------------------------ #

    def supertrend(self, high, low, close, length=10, multiplier=3.0, **_):
        """Supertrend. Columns [SUPERT, SUPERTd, SUPERTl, SUPERTs] (iloc 0/1/2/3).

        SUPERTd is direction: 1 = uptrend, -1 = downtrend (matches pandas_ta).
        """
        h, l, c = _to_arr(high), _to_arr(low), _to_arr(close)
        n = len(c)
        period, mult = int(length), float(multiplier)
        atr = talib.ATR(h, l, c, timeperiod=period)
        hl2 = (h + l) / 2.0
        upper = hl2 + mult * atr
        lower = hl2 - mult * atr

        final_upper = np.full(n, np.nan)
        final_lower = np.full(n, np.nan)
        trend = np.full(n, np.nan)        # the supertrend line
        direction = np.full(n, np.nan)    # 1 up, -1 down

        for i in range(n):
            if np.isnan(atr[i]):
                continue
            if i == 0 or np.isnan(final_upper[i - 1]):
                final_upper[i] = upper[i]
                final_lower[i] = lower[i]
                direction[i] = 1
                trend[i] = final_lower[i]
                continue
            final_upper[i] = (upper[i] if (upper[i] < final_upper[i - 1] or c[i - 1] > final_upper[i - 1])
                              else final_upper[i - 1])
            final_lower[i] = (lower[i] if (lower[i] > final_lower[i - 1] or c[i - 1] < final_lower[i - 1])
                              else final_lower[i - 1])
            # Determine direction from previous trend line
            if c[i] > final_upper[i - 1]:
                direction[i] = 1
            elif c[i] < final_lower[i - 1]:
                direction[i] = -1
            else:
                direction[i] = direction[i - 1]
            trend[i] = final_lower[i] if direction[i] == 1 else final_upper[i]

        long_line = np.where(direction == 1, trend, np.nan)
        short_line = np.where(direction == -1, trend, np.nan)
        idx = _idx(close)
        return pd.DataFrame(
            {f'SUPERT_{period}_{mult}': trend, f'SUPERTd_{period}_{mult}': direction,
             f'SUPERTl_{period}_{mult}': long_line, f'SUPERTs_{period}_{mult}': short_line},
            index=idx,
        )

    def kc(self, high, low, close, length=20, scalar=2.0, mamode=None, **_):
        """Keltner Channels. Columns [KCLe, KCBe, KCUe] = lower, basis, upper (iloc 0/1/2)."""
        h, l, c = _to_arr(high), _to_arr(low), _to_arr(close)
        period, scale = int(length), float(scalar)
        basis = talib.EMA(c, timeperiod=period)
        rng = talib.ATR(h, l, c, timeperiod=period)
        upper = basis + scale * rng
        lower = basis - scale * rng
        idx = _idx(close)
        return pd.DataFrame(
            {f'KCLe_{period}_{scale}': lower, f'KCBe_{period}_{scale}': basis, f'KCUe_{period}_{scale}': upper},
            index=idx,
        )

    def cmf(self, high, low, close, volume, length=20, **_):
        """Chaikin Money Flow (single Series)."""
        h, l, c, v = _to_arr(high), _to_arr(low), _to_arr(close), _to_arr(volume)
        hl = h - l
        mfm = np.where(hl > 0, ((c - l) - (h - c)) / hl, 0.0)
        mfv = mfm * v
        period = int(length)
        mfv_s = pd.Series(mfv).rolling(period).sum()
        v_s = pd.Series(v).rolling(period).sum()
        cmf = (mfv_s / v_s).to_numpy()
        return pd.Series(cmf, index=_idx(close))

    def efi(self, close, volume, length=13, **_):
        """Elder Force Index (single Series): EMA(diff(close) * volume, length)."""
        c, v = _to_arr(close), _to_arr(volume)
        raw = np.empty(len(c))
        raw[0] = np.nan
        raw[1:] = (c[1:] - c[:-1]) * v[1:]
        ema = talib.EMA(np.nan_to_num(raw, nan=0.0), timeperiod=int(length))
        return pd.Series(ema, index=_idx(close))

    def coppock(self, close, length=10, fast=11, slow=14, **_):
        """Coppock Curve (single Series): WMA(ROC(slow) + ROC(fast), length)."""
        c = _to_arr(close)
        roc_fast = talib.ROC(c, timeperiod=int(fast))
        roc_slow = talib.ROC(c, timeperiod=int(slow))
        combined = np.nan_to_num(roc_fast, nan=0.0) + np.nan_to_num(roc_slow, nan=0.0)
        cop = talib.WMA(combined, timeperiod=int(length))
        return pd.Series(cop, index=_idx(close))

    def aroon(self, high, low, length=14, **_):
        """Aroon. Columns [AROOND, AROONU, AROONOSC] = down, up, osc (iloc 0/1/2)."""
        h, l = _to_arr(high), _to_arr(low)
        period = int(length)
        down, up = talib.AROON(h, l, timeperiod=period)
        osc = up - down
        idx = _idx(high)
        return pd.DataFrame(
            {f'AROOND_{period}': down, f'AROONU_{period}': up, f'AROONOSC_{period}': osc},
            index=idx,
        )

    # ------------------------------------------------------------------ #
    #  Generic passthrough for any other talib function                   #
    # ------------------------------------------------------------------ #

    def __getattr__(self, name):
        talib_name = name.upper()
        try:
            attr = getattr(self._ta, talib_name)
        except AttributeError:
            attr = getattr(self._ta, name)

        if callable(attr):
            _param_map = {
                'length': 'timeperiod', 'fast': 'fastperiod',
                'slow': 'slowperiod', 'signal': 'signalperiod',
                'n': 'timeperiod', 'upper': 'nbdevup', 'lower': 'nbdevdn',
            }
            def wrapper(*args, **kwargs):
                mapped_kwargs = {_param_map.get(k, k): v for k, v in kwargs.items()}
                mapped_args = [
                    a.values.astype(float) if isinstance(a, (pd.Series, pd.DataFrame)) else a
                    for a in args
                ]
                return SafeIndicator(attr(*mapped_args, **mapped_kwargs))
            return wrapper
        return attr

# --- Service Implementation ---

class OptimizationService:
    DEFAULT_COMMISSION = 0.0036

    @staticmethod
    def extract_param_ranges(code):
        """Extracts parameters and their ranges from code comments: # range: [min, max]"""
        ranges = {}
        pattern = r"(\w+)\s*=\s*[\d\.]+\s*#\s*range:\s*\[\s*([\d\.]+)\s*,\s*([\d\.]+)\s*\]"
        matches = re.findall(pattern, code)
        for name, min_val, max_val in matches:
            try:
                if '.' not in min_val and '.' not in max_val:
                    ranges[name] = [int(min_val), int(max_val)]
                else:
                    ranges[name] = [float(min_val), float(max_val)]
            except ValueError:
                continue
        return ranges

    @staticmethod
    def fetch_data(scope_type, scope_val, start_date, end_date):
        """Generalized data fetching for backtesting."""
        if scope_type == 'ALL':
            companies = Company.objects.all().values_list('symbol', flat=True)
            queryset = DailyStockPrice.objects.filter(ticker__in=companies, date__range=[start_date, end_date]).order_by('date')
        elif scope_type == 'SECTOR':
            companies = Company.objects.filter(sector__iexact=scope_val).values_list('symbol', flat=True)
            queryset = DailyStockPrice.objects.filter(ticker__in=companies, date__range=[start_date, end_date]).order_by('date')
        else: # SYMBOL
            queryset = DailyStockPrice.objects.filter(ticker=scope_val, date__range=[start_date, end_date]).order_by('date')

        all_data = list(queryset.values('ticker', 'date', 'open', 'high', 'low', 'close', 'volume'))
        if not all_data:
            return {}

        master_df = pd.DataFrame(all_data)
        master_df.rename(columns={'open': 'Open', 'high': 'High', 'low': 'Low', 'close': 'Close', 'volume': 'Volume'}, inplace=True)
        master_df[['Open', 'High', 'Low', 'Close', 'Volume']] = master_df[['Open', 'High', 'Low', 'Close', 'Volume']].astype(float)
        master_df['date'] = pd.to_datetime(master_df['date'])

        data_map = {}
        for ticker, group in master_df.groupby('ticker'):
            sub_df = group.copy()
            sub_df = sub_df[(sub_df['High'] / sub_df['Open'] <= 2.0) & (sub_df['Low'] / sub_df['Open'] >= 0.5) & (sub_df['Close'] > 0)]
            if not sub_df.empty:
                sub_df.set_index('date', inplace=True)
                data_map[ticker] = sub_df
        return data_map

    @staticmethod
    def anchored_split(df, oos_fraction=OOS_FRACTION):
        """Split a date-ordered price frame into (in_sample, out_of_sample) by tail fraction."""
        cut = int(len(df) * (1 - oos_fraction))
        return df.iloc[:cut], df.iloc[cut:]

    @staticmethod
    def run_optimization(strategy_model, scope_type, scope_val, start_date, end_date, n_trials, objective_type='win_rate'):
        """Runs Bayesian optimization for a strategy."""
        param_ranges = OptimizationService.extract_param_ranges(strategy_model.code)
        if not param_ranges:
            raise ValueError("No parameter ranges found in strategy code.")

        data_map = OptimizationService.fetch_data(scope_type, scope_val, start_date, end_date)
        if not data_map:
            raise ValueError(f"No valid data for scope {scope_type}:{scope_val}")

        # Split full data into in-sample (for tuning) and out-of-sample (for validation)
        is_map = {t: OptimizationService.anchored_split(df)[0] for t, df in data_map.items()}
        oos_map = {t: OptimizationService.anchored_split(df)[1] for t, df in data_map.items()}

        def _resolve_code(raw_code):
            """Return the executable strategy code string, resolving named aliases."""
            if raw_code == 'broker_accumulation_v1':
                return """
from backtesting import Strategy
import numpy as np
import pandas as pd
from stocks.models import DailyCumulativeAccumulation

class BrokerAccumulationStrategy(Strategy):
    def init(self):
        ticker = symbol
        qs = DailyCumulativeAccumulation.objects.filter(symbol=ticker).values('transaction_date', 'cumulative_net')
        if not qs:
            self.acc = self.I(lambda x: np.zeros(len(x)), self.data.Close)
            return
        df = pd.DataFrame(list(qs))
        df['transaction_date'] = pd.to_datetime(df['transaction_date'])
        daily = df.groupby('transaction_date')['cumulative_net'].sum()
        self.acc = self.I(lambda x: daily.reindex(pd.Series(x).index).ffill().fillna(0).values, self.data.Close)

    def next(self):
        if len(self.acc) < 2: return
        if self.acc[-1] > 0 and self.acc[-2] <= 0:
            if not self.position: self.buy()
        elif self.acc[-1] < 0 and self.acc[-2] >= 0:
            if self.position: self.position.close()
"""
            elif raw_code == 'ichimoku_accumulation_v1' or (isinstance(raw_code, str) and raw_code.startswith('ichimoku_accumulation_v1')):
                return """
from backtesting import Strategy
import pandas as pd
import numpy as np
import pandas_ta as ta
from stocks.models import DailyCumulativeAccumulation

class IchimokuAccumulation(Strategy):
    def init(self):
        close = pd.Series(self.data.Close)
        high = pd.Series(self.data.High)
        low = pd.Series(self.data.Low)
        # Ichimoku
        ichimoku_df = ta.ichimoku(high, low, close)[0]
        self.span_a = self.I(lambda: ichimoku_df.iloc[:, 2].values)
        self.span_b = self.I(lambda: ichimoku_df.iloc[:, 3].values)

        # Accumulation
        qs = DailyCumulativeAccumulation.objects.filter(symbol=symbol).values('transaction_date', 'cumulative_net')
        if not qs:
            self.acc = self.I(lambda x: np.zeros(len(x)), self.data.Close)
            return
        df = pd.DataFrame(list(qs))
        df['transaction_date'] = pd.to_datetime(df['transaction_date'])
        daily = df.groupby('transaction_date')['cumulative_net'].sum()
        self.acc = self.I(lambda x: daily.reindex(pd.Series(x).index).ffill().fillna(0).values, self.data.Close)

    def next(self):
        price = self.data.Close[-1]
        above_cloud = price > self.span_a[-1] and price > self.span_b[-1]
        accumulating = self.acc[-1] > 0
        if above_cloud and accumulating:
            if not self.position: self.buy()
        elif price < self.span_a[-1] or price < self.span_b[-1]:
            if self.position: self.position.close()
"""
            elif raw_code == 'smart_accumulated_crossover_v1':
                return """
from backtesting import Strategy
from backtesting.lib import crossover
import pandas as pd
import numpy as np
import pandas_ta as ta
from stocks.models import DailyCumulativeAccumulation

class SmartAccumulatedCrossover(Strategy):
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
        pivot = df.pivot_table(index='transaction_date', columns='entity_id', values='cumulative_net', aggfunc='last').ffill().fillna(0)
        top = pivot.iloc[-1].sort_values(ascending=False).head(5).index
        flow = pivot[top].sum(axis=1)
        line = self.I(lambda x: flow.reindex(pd.Series(x).index).ffill().fillna(0).values, self.data.Close)
        self.fast_ma = self.I(lambda x: pd.Series(x).rolling(self.fast).mean().values, line)
        self.slow_ma = self.I(lambda x: pd.Series(x).rolling(self.slow).mean().values, line)

    def next(self):
        if crossover(self.fast_ma, self.slow_ma):
            if not self.position: self.buy()
        elif crossover(self.slow_ma, self.fast_ma):
            if self.position: self.position.close()
"""
            return raw_code

        def _eval_params(params, eval_map):
            """Run a strategy with the given params over eval_map and return the average score.

            This is the single evaluation mechanism shared by both the Optuna objective
            (in-sample) and the OOS validation pass, ensuring the two numbers are comparable.
            Returns None if no symbol yields a valid score (all skipped or all errored).
            """
            base_code = _resolve_code(strategy_model.code)
            # Inject param values into the code
            code = base_code
            for name, val in params.items():
                code = re.sub(rf"({name}\s*=\s*)[\d\.]+", rf"\g<1>{val}", code)

            import sys as _sys
            ta_adapter = SafeTa(talib)
            _sys.modules['pandas_ta'] = ta_adapter  # type: ignore[assignment]
            local_scope = {
                'Backtest': Backtest, 'Strategy': Strategy, 'crossover': crossover,
                'SMA': SMA, 'pd': pd, 'np': np, 'ta': ta_adapter, 'talib': talib,
            }
            try:
                exec(code, local_scope)
                strat_class = next(
                    (obj for obj in local_scope.values()
                     if inspect.isclass(obj) and issubclass(obj, Strategy) and obj is not Strategy),
                    None,
                )
                if not strat_class:
                    return None
            except Exception:
                return None

            scores = []
            for ticker, df in eval_map.items():
                if len(df) < 20:
                    continue
                try:
                    bt = Backtest(
                        df, strat_class,
                        cash=100_000,
                        commission=OptimizationService.DEFAULT_COMMISSION,
                        exclusive_orders=True,
                        finalize_trades=True,
                    )
                    stats = bt.run()
                    val = stats.get('Win Rate [%]' if objective_type == 'win_rate' else 'Return [%]', 0)
                    scores.append(val or 0)
                except Exception:
                    continue

            return sum(scores) / len(scores) if scores else None

        def objective(trial):
            params = {}
            for name, r in param_ranges.items():
                if isinstance(r[0], int) and isinstance(r[1], int):
                    params[name] = trial.suggest_int(name, r[0], r[1])
                else:
                    params[name] = trial.suggest_float(name, r[0], r[1])

            # Tune ONLY on in-sample slice
            result = _eval_params(params, is_map)
            return result if result is not None else -9999

        study = optuna.create_study(direction='maximize')
        study.optimize(objective, n_trials=n_trials)

        # Evaluate best params on the held-out OOS tail using the SAME mechanism
        oos_value = _eval_params(study.best_params, oos_map)

        batch_id = uuid.uuid4()
        StrategyExperiment.objects.create(
            strategy=strategy_model,
            user=strategy_model.user,
            run_type=StrategyExperiment.RunType.OPTIMIZATION,
            scope_type=scope_type,
            scope_value=scope_val,
            start_date=start_date,
            end_date=end_date,
            parameters=study.best_params,
            metrics={
                "best_value": study.best_value,
                "oos_value": oos_value,
                "oos_fraction": OOS_FRACTION,
                # Accept only when there was a positive in-sample edge AND the OOS
                # run retained >= 50% of it. Guarding on best_value > 0 keeps the
                # flag coherent for the 'return' objective, whose best_value can be
                # negative (where a 0.5x multiplier would invert the threshold).
                "oos_accepted": bool(
                    oos_value is not None
                    and study.best_value > 0
                    and oos_value >= 0.5 * study.best_value
                ),
                "n_trials": len(study.trials),
            },
            batch_id=batch_id,
            status=StrategyExperiment.Status.SUCCESS
        )
        return study.best_params, study.best_value

    @staticmethod
    def _calculate_3y_splits(symbol):
        res = DailyStockPrice.objects.filter(ticker=symbol).aggregate(min_date=Min('date'))
        start_date = res['min_date'] or (datetime.now().date() - timedelta(days=365*3))
        end_date = datetime.now().date()
        
        periods = []
        curr_start = start_date
        while curr_start < end_date:
            curr_end = curr_start + timedelta(days=365*3)
            if (end_date - curr_end).days < 180: curr_end = end_date
            periods.append((f"{curr_start.year}-{curr_end.year}", curr_start, curr_end))
            curr_start = curr_end
            if curr_start >= end_date: break
        return periods
