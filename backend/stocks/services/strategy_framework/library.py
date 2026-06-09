"""Concrete components. Each is written and tested ONCE, then reused everywhere.

Adding a new strategy is now a composition, not a new file. The set below is enough
to express the main archetypes among the existing 41 (trend-follow, breakout,
mean-reversion, broker-accumulation); new alphas/stops slot in the same way.
"""

import numpy as np
import pandas as pd

from .base import Alpha, Regime, Stop, ExitRule, ta

__all__ = [
    # alphas
    "SupertrendFlip", "SmaCross", "RsiOversold", "DonchianBreakout", "MacdCross",
    "AccumulationAboveMA", "AccumulationMaCross", "StochRsiCross", "MfiOversold",
    "VwapReclaim", "VolumeBreakout", "ParabolicSarFlip", "IchimokuCloud",
    "KeltnerReclaim", "AdxDi", "ZScoreReversion",
    # regimes
    "AboveEMA", "AdxAbove",
    # stops
    "AtrTrail", "FixedAtr",
    # exits
    "TrendBreak",
]


def _close(strat):
    return pd.Series(strat.data.Close)


def _hlc(strat):
    return pd.Series(strat.data.High), pd.Series(strat.data.Low), pd.Series(strat.data.Close)


# --------------------------------------------------------------------------- #
# Alphas
# --------------------------------------------------------------------------- #
class SupertrendFlip(Alpha):
    """Long when Supertrend flips up; reverse exit when it flips down."""

    def __init__(self, period=10, multiplier=3.0):
        self.period, self.multiplier = period, multiplier

    def register(self, strat):
        h, l, c = _hlc(strat)
        st = ta.supertrend(h, l, c, length=self.period, multiplier=self.multiplier)
        self._put(strat,
                  direction=strat.I(lambda: st.iloc[:, 1].values),
                  line=strat.I(lambda: st.iloc[:, 0].values))

    def entry(self, strat):
        d = self._get(strat, "direction")
        return d[-2] == -1 and d[-1] == 1

    def exit(self, strat):
        return self._get(strat, "direction")[-1] == -1


class SmaCross(Alpha):
    def __init__(self, fast=20, slow=50):
        self.fast, self.slow = fast, slow

    def register(self, strat):
        c = _close(strat)
        self._put(strat,
                  fast=strat.I(lambda: ta.sma(c, self.fast).values),
                  slow=strat.I(lambda: ta.sma(c, self.slow).values))

    def entry(self, strat):
        f, s = self._get(strat, "fast"), self._get(strat, "slow")
        return f[-2] <= s[-2] and f[-1] > s[-1]

    def exit(self, strat):
        f, s = self._get(strat, "fast"), self._get(strat, "slow")
        return f[-1] < s[-1]


class RsiOversold(Alpha):
    """Mean-reversion: enter when RSI is oversold, exit when overbought."""

    def __init__(self, period=14, lower=40, upper=70):
        self.period, self.lower, self.upper = period, lower, upper

    def register(self, strat):
        c = _close(strat)
        self._put(strat, rsi=strat.I(lambda: ta.rsi(c, self.period).values))

    def entry(self, strat):
        return self._get(strat, "rsi")[-1] < self.lower

    def exit(self, strat):
        return self._get(strat, "rsi")[-1] > self.upper


class DonchianBreakout(Alpha):
    def __init__(self, entry_window=20, exit_window=10):
        self.entry_window, self.exit_window = entry_window, exit_window

    def register(self, strat):
        h, l, _ = _hlc(strat)
        self._put(strat,
                  hi=strat.I(lambda: h.rolling(self.entry_window).max().values),
                  lo=strat.I(lambda: l.rolling(self.exit_window).min().values))

    def entry(self, strat):
        return strat.data.Close[-1] > self._get(strat, "hi")[-2]

    def exit(self, strat):
        return strat.data.Close[-1] < self._get(strat, "lo")[-2]


class MacdCross(Alpha):
    def __init__(self, fast=12, slow=26, signal=9):
        self.fast, self.slow, self.signal = fast, slow, signal

    def register(self, strat):
        c = _close(strat)
        m = ta.macd(c, fast=self.fast, slow=self.slow, signal=self.signal)
        self._put(strat,
                  macd=strat.I(lambda: m.iloc[:, 0].values),
                  sig=strat.I(lambda: m.iloc[:, 2].values))

    def entry(self, strat):
        m, s = self._get(strat, "macd"), self._get(strat, "sig")
        return m[-2] <= s[-2] and m[-1] > s[-1]

    def exit(self, strat):
        m, s = self._get(strat, "macd"), self._get(strat, "sig")
        return m[-1] < s[-1]


class AccumulationAboveMA(Alpha):
    """Broker-flow alpha: top-N brokers' cumulative net position above its MA.

    `symbol` must be passed in (available in the strategy exec scope).
    """

    def __init__(self, symbol, top_n=5, ma=20):
        self.symbol, self.top_n, self.ma = symbol, top_n, ma

    def register(self, strat):
        from stocks.models import DailyCumulativeAccumulation
        dates = strat.data.index
        qs = DailyCumulativeAccumulation.objects.filter(symbol=self.symbol).values(
            'transaction_date', 'entity_id', 'cumulative_net')
        if not qs:
            self._put(strat, line=strat.I(lambda: np.zeros(len(dates))),
                      ma=strat.I(lambda: np.zeros(len(dates))))
            return
        df = pd.DataFrame(list(qs))
        df['transaction_date'] = pd.to_datetime(df['transaction_date'])
        pivot = df.pivot_table(index='transaction_date', columns='entity_id',
                               values='cumulative_net', aggfunc='last').ffill().fillna(0)
        pivot = pivot.reindex(dates).ffill().fillna(0)
        top = pivot.iloc[-1].sort_values(ascending=False).head(self.top_n).index
        line = pivot[top].sum(axis=1).astype(float)
        self._put(strat,
                  line=strat.I(lambda: line.values),
                  ma=strat.I(lambda: line.rolling(self.ma).mean().values))

    def entry(self, strat):
        return self._get(strat, "line")[-1] > self._get(strat, "ma")[-1]

    def exit(self, strat):
        return self._get(strat, "line")[-1] < self._get(strat, "ma")[-1]


class AccumulationMaCross(Alpha):
    """Trade the trend of OWNERSHIP: fast/slow MA crossover of top brokers' flow."""

    def __init__(self, symbol, top_n=5, fast=10, slow=50):
        self.symbol, self.top_n, self.fast, self.slow = symbol, top_n, fast, slow

    def register(self, strat):
        from stocks.models import DailyCumulativeAccumulation
        dates = strat.data.index
        qs = DailyCumulativeAccumulation.objects.filter(symbol=self.symbol).values(
            'transaction_date', 'entity_id', 'cumulative_net')
        if not qs:
            self._put(strat, fast=strat.I(lambda: np.zeros(len(dates))),
                      slow=strat.I(lambda: np.zeros(len(dates))))
            return
        df = pd.DataFrame(list(qs))
        df['transaction_date'] = pd.to_datetime(df['transaction_date'])
        pivot = df.pivot_table(index='transaction_date', columns='entity_id',
                               values='cumulative_net', aggfunc='last').ffill().fillna(0)
        pivot = pivot.reindex(dates).ffill().fillna(0)
        top = pivot.iloc[-1].sort_values(ascending=False).head(self.top_n).index
        flow = pivot[top].sum(axis=1).astype(float)
        self._put(strat,
                  fast=strat.I(lambda: flow.rolling(self.fast).mean().values),
                  slow=strat.I(lambda: flow.rolling(self.slow).mean().values))

    def entry(self, strat):
        f, s = self._get(strat, "fast"), self._get(strat, "slow")
        return f[-2] <= s[-2] and f[-1] > s[-1]

    def exit(self, strat):
        f, s = self._get(strat, "fast"), self._get(strat, "slow")
        return f[-1] < s[-1]


class StochRsiCross(Alpha):
    """StochRSI K-over-D cross from oversold; exit on bearish cross from overbought."""

    def __init__(self, oversold=20, overbought=80):
        self.oversold, self.overbought = oversold, overbought

    def register(self, strat):
        c = _close(strat)
        sr = ta.stochrsi(c)
        self._put(strat, k=strat.I(lambda: sr.iloc[:, 0].values),
                  d=strat.I(lambda: sr.iloc[:, 1].values))

    def entry(self, strat):
        k, d = self._get(strat, "k"), self._get(strat, "d")
        return k[-2] < d[-2] and k[-1] > d[-1] and k[-1] < self.oversold

    def exit(self, strat):
        k, d = self._get(strat, "k"), self._get(strat, "d")
        return k[-2] > d[-2] and k[-1] < d[-1] and k[-1] > self.overbought


class MfiOversold(Alpha):
    def __init__(self, period=14, oversold=20, overbought=80):
        self.period, self.oversold, self.overbought = period, oversold, overbought

    def register(self, strat):
        h, l, c = _hlc(strat)
        v = pd.Series(strat.data.Volume)
        self._put(strat, mfi=strat.I(lambda: ta.mfi(h, l, c, v, length=self.period).values))

    def entry(self, strat):
        return self._get(strat, "mfi")[-1] < self.oversold

    def exit(self, strat):
        return self._get(strat, "mfi")[-1] > self.overbought


class VwapReclaim(Alpha):
    """Close reclaims the rolling VWAP from below."""

    def register(self, strat):
        idx = strat.data.index
        self._put(strat, vwap=strat.I(lambda: ta.vwap(
            pd.Series(strat.data.High, index=idx), pd.Series(strat.data.Low, index=idx),
            pd.Series(strat.data.Close, index=idx), pd.Series(strat.data.Volume, index=idx)).values))

    def entry(self, strat):
        w = self._get(strat, "vwap")
        return strat.data.Close[-2] < w[-2] and strat.data.Close[-1] > w[-1]


class VolumeBreakout(Alpha):
    """N-day-high breakout confirmed by a volume spike."""

    def __init__(self, lookback=20, vol_mult=2.0):
        self.lookback, self.vol_mult = lookback, vol_mult

    def register(self, strat):
        h = pd.Series(strat.data.High)
        v = pd.Series(strat.data.Volume)
        self._put(strat,
                  hi=strat.I(lambda: h.rolling(self.lookback).max().values),
                  vavg=strat.I(lambda: v.rolling(self.lookback).mean().values))

    def entry(self, strat):
        return (strat.data.Close[-1] >= self._get(strat, "hi")[-2]
                and strat.data.Volume[-1] > self._get(strat, "vavg")[-1] * self.vol_mult)


class ParabolicSarFlip(Alpha):
    """Close crosses above Parabolic SAR; exit on cross below (SAR is the trail)."""

    def register(self, strat):
        h, l, c = _hlc(strat)
        psar = ta.psar(h, l, c)
        self._put(strat, sar=strat.I(lambda: psar.iloc[:, 0].fillna(psar.iloc[:, 1]).values))

    def entry(self, strat):
        s = self._get(strat, "sar")
        return strat.data.Close[-2] < s[-2] and strat.data.Close[-1] > s[-1]

    def exit(self, strat):
        s = self._get(strat, "sar")
        return strat.data.Close[-1] < s[-1]


class IchimokuCloud(Alpha):
    """Long while price holds above the cloud (Span A/B); exit below the cloud top."""

    def register(self, strat):
        h, l, c = _hlc(strat)
        ich = ta.ichimoku(h, l, c)[0]
        self._put(strat, a=strat.I(lambda: ich.iloc[:, 0].values),
                  b=strat.I(lambda: ich.iloc[:, 1].values))

    def entry(self, strat):
        a, b = self._get(strat, "a"), self._get(strat, "b")
        return strat.data.Close[-1] > max(a[-1], b[-1])

    def exit(self, strat):
        a, b = self._get(strat, "a"), self._get(strat, "b")
        return strat.data.Close[-1] < max(a[-1], b[-1])


class KeltnerReclaim(Alpha):
    """Pullback continuation: price reclaims a rising Keltner basis."""

    def __init__(self, length=20, scalar=2.0):
        self.length, self.scalar = length, scalar

    def register(self, strat):
        h, l, c = _hlc(strat)
        kc = ta.kc(h, l, c, length=self.length, scalar=self.scalar)
        self._put(strat, basis=strat.I(lambda: kc.iloc[:, 1].values))

    def entry(self, strat):
        bs = self._get(strat, "basis")
        return (strat.data.Close[-2] <= bs[-2] and strat.data.Close[-1] > bs[-1]
                and bs[-1] > bs[-5])


class AdxDi(Alpha):
    """ADX strong + +DI over -DI; exit when -DI tops +DI."""

    def __init__(self, length=14, threshold=25):
        self.length, self.threshold = length, threshold

    def register(self, strat):
        h, l, c = _hlc(strat)
        adx = ta.adx(h, l, c, length=self.length)
        self._put(strat, adx=strat.I(lambda: adx.iloc[:, 0].values),
                  dmp=strat.I(lambda: adx.iloc[:, 1].values),
                  dmn=strat.I(lambda: adx.iloc[:, 2].values))

    def entry(self, strat):
        return (self._get(strat, "adx")[-1] > self.threshold
                and self._get(strat, "dmp")[-1] > self._get(strat, "dmn")[-1])

    def exit(self, strat):
        return self._get(strat, "dmn")[-1] > self._get(strat, "dmp")[-1]


class ZScoreReversion(Alpha):
    """Statistical dip: enter z std below the rolling mean; exit on reversion."""

    def __init__(self, window=20, z_entry=-2.0, z_exit=1.0):
        self.window, self.z_entry, self.z_exit = window, z_entry, z_exit

    def register(self, strat):
        c = _close(strat)

        def z():
            m = c.rolling(self.window).mean()
            s = c.rolling(self.window).std()
            return ((c - m) / s).values

        self._put(strat, z=strat.I(z))

    def entry(self, strat):
        return self._get(strat, "z")[-1] < self.z_entry

    def exit(self, strat):
        return self._get(strat, "z")[-1] > self.z_exit


# --------------------------------------------------------------------------- #
# Regimes
# --------------------------------------------------------------------------- #
class AboveEMA(Regime):
    """The single biggest edge found in Phase 1: only go long above a long EMA."""

    def __init__(self, period=200):
        self.period = period

    def register(self, strat):
        c = _close(strat)
        self._put(strat, ema=strat.I(lambda: ta.ema(c, self.period).values))

    def ok(self, strat):
        return strat.data.Close[-1] > self._get(strat, "ema")[-1]


class AdxAbove(Regime):
    def __init__(self, threshold=25, length=14):
        self.threshold, self.length = threshold, length

    def register(self, strat):
        h, l, c = _hlc(strat)
        self._put(strat, adx=strat.I(lambda: ta.adx(h, l, c, length=self.length).iloc[:, 0].values))

    def ok(self, strat):
        return self._get(strat, "adx")[-1] > self.threshold


# --------------------------------------------------------------------------- #
# Stops
# --------------------------------------------------------------------------- #
class AtrTrail(Stop):
    """Trailing ATR stop — suits trend-following alphas."""

    def __init__(self, period=14, multiplier=3.0):
        self.period, self.multiplier = period, multiplier

    def register(self, strat):
        h, l, c = _hlc(strat)
        self._put(strat, atr=strat.I(lambda: ta.atr(h, l, c, self.period).values))

    def initial(self, strat, price):
        a = self._get(strat, "atr")[-1]
        return None if np.isnan(a) else price - self.multiplier * a

    def trail(self, strat, trade):
        a = self._get(strat, "atr")[-1]
        if np.isnan(a):
            return
        new_sl = strat.data.Close[-1] - self.multiplier * a
        if trade.sl is None or new_sl > trade.sl:
            trade.sl = new_sl


class FixedAtr(Stop):
    """Fixed catastrophic ATR stop set at entry (NOT trailed) — suits mean-reverters
    (a ratcheting stop ejects reversion trades before the bounce)."""

    def __init__(self, period=14, multiplier=6.0):
        self.period, self.multiplier = period, multiplier

    def register(self, strat):
        h, l, c = _hlc(strat)
        self._put(strat, atr=strat.I(lambda: ta.atr(h, l, c, self.period).values))

    def initial(self, strat, price):
        a = self._get(strat, "atr")[-1]
        return None if np.isnan(a) else price - self.multiplier * a


# --------------------------------------------------------------------------- #
# Exits
# --------------------------------------------------------------------------- #
class TrendBreak(ExitRule):
    """Exit when price loses a long-term EMA (lets winners run otherwise)."""

    def __init__(self, period=200):
        self.period = period

    def register(self, strat):
        c = _close(strat)
        self._put(strat, ema=strat.I(lambda: ta.ema(c, self.period).values))

    def exit(self, strat):
        return strat.data.Close[-1] < self._get(strat, "ema")[-1]
