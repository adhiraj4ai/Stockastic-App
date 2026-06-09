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
    "WilliamsROversold", "AroonCross", "CoppockTurn", "CmfCross", "ForceIndexZero",
    "ObvAboveMA", "SmaPullback", "Rsi2Connors", "ThreeWhiteSoldiers", "DualThrust",
    "AlligatorBreakout", "Nr7Breakout", "InsideBarBreakout", "FibGoldenZone",
    "TurtleSoupReversal", "AccumulationDivergence",
    # regimes
    "AboveEMA", "AdxAbove", "AboveSMA", "RsiBand", "VolumeAboveAverage",
    # stops
    "AtrTrail", "FixedAtr",
    # exits
    "TrendBreak", "TakeProfitPct", "TrailingStopPct", "TimeExit", "RsiExit", "MaCrossExit",
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


class WilliamsROversold(Alpha):
    def __init__(self, period=14, lower=-80, upper=-20):
        self.period, self.lower, self.upper = period, lower, upper

    def register(self, strat):
        h, l, c = _hlc(strat)
        self._put(strat, wr=strat.I(lambda: ta.willr(h, l, c, length=self.period).values))

    def entry(self, strat):
        return self._get(strat, "wr")[-1] < self.lower

    def exit(self, strat):
        return self._get(strat, "wr")[-1] > self.upper


class AroonCross(Alpha):
    def __init__(self, period=14, strong=70):
        self.period, self.strong = period, strong

    def register(self, strat):
        h, l, _ = _hlc(strat)
        ar = ta.aroon(h, l, length=self.period)
        self._put(strat, down=strat.I(lambda: ar.iloc[:, 0].values),
                  up=strat.I(lambda: ar.iloc[:, 1].values))

    def entry(self, strat):
        u, d = self._get(strat, "up"), self._get(strat, "down")
        return u[-2] < d[-2] and u[-1] > d[-1] and u[-1] > self.strong

    def exit(self, strat):
        return self._get(strat, "down")[-1] > self._get(strat, "up")[-1]


class CoppockTurn(Alpha):
    def __init__(self, length=10, fast=11, slow=14):
        self.length, self.fast, self.slow = length, fast, slow

    def register(self, strat):
        c = _close(strat)
        self._put(strat, cop=strat.I(
            lambda: ta.coppock(c, length=self.length, fast=self.fast, slow=self.slow).values))

    def entry(self, strat):
        cop = self._get(strat, "cop")
        return cop[-2] < 0 and cop[-1] > 0

    def exit(self, strat):
        return self._get(strat, "cop")[-1] < 0


class CmfCross(Alpha):
    def __init__(self, period=20, entry=0.05):
        self.period, self.entry_thr = period, entry

    def register(self, strat):
        h, l, c = _hlc(strat)
        v = pd.Series(strat.data.Volume)
        self._put(strat, cmf=strat.I(lambda: ta.cmf(h, l, c, v, length=self.period).values))

    def entry(self, strat):
        cmf = self._get(strat, "cmf")
        return cmf[-2] < self.entry_thr and cmf[-1] >= self.entry_thr

    def exit(self, strat):
        return self._get(strat, "cmf")[-1] < 0


class ForceIndexZero(Alpha):
    def __init__(self, period=13):
        self.period = period

    def register(self, strat):
        c = _close(strat)
        v = pd.Series(strat.data.Volume)
        self._put(strat, efi=strat.I(lambda: ta.efi(c, v, length=self.period).values))

    def entry(self, strat):
        efi = self._get(strat, "efi")
        return efi[-2] < 0 and efi[-1] > 0


class ObvAboveMA(Alpha):
    def __init__(self, ma=20):
        self.ma = ma

    def register(self, strat):
        c = _close(strat)
        v = pd.Series(strat.data.Volume)
        obv = ta.obv(c, v)
        self._put(strat, obv=strat.I(lambda: obv.values),
                  obvma=strat.I(lambda: obv.rolling(self.ma).mean().values))

    def entry(self, strat):
        return self._get(strat, "obv")[-1] > self._get(strat, "obvma")[-1]


class SmaPullback(Alpha):
    """Buy a pullback to the fast SMA inside a golden-cross uptrend."""

    def __init__(self, fast=50, slow=200, near=0.02):
        self.fast, self.slow, self.near = fast, slow, near

    def register(self, strat):
        c = _close(strat)
        self._put(strat, f=strat.I(lambda: ta.sma(c, self.fast).values),
                  s=strat.I(lambda: ta.sma(c, self.slow).values))

    def entry(self, strat):
        price = strat.data.Close[-1]
        f, s = self._get(strat, "f"), self._get(strat, "s")
        return f[-1] > s[-1] and abs(price - f[-1]) / price < self.near and price > f[-1]

    def exit(self, strat):
        return strat.data.Close[-1] < self._get(strat, "s")[-1]


class Rsi2Connors(Alpha):
    """Larry Connors RSI-2: aggressive dip-buy above a long SMA, exit above a short SMA."""

    def __init__(self, rsi_len=2, lower=10, sma_long=200, sma_exit=5):
        self.rsi_len, self.lower, self.sma_long, self.sma_exit = rsi_len, lower, sma_long, sma_exit

    def register(self, strat):
        c = _close(strat)
        self._put(strat, rsi=strat.I(lambda: ta.rsi(c, self.rsi_len).values),
                  long=strat.I(lambda: ta.sma(c, self.sma_long).values),
                  short=strat.I(lambda: ta.sma(c, self.sma_exit).values))

    def entry(self, strat):
        return strat.data.Close[-1] > self._get(strat, "long")[-1] and self._get(strat, "rsi")[-1] < self.lower

    def exit(self, strat):
        return strat.data.Close[-1] > self._get(strat, "short")[-1]


class ThreeWhiteSoldiers(Alpha):
    """Three consecutive higher closes with green candles; exit on a red candle."""

    def __init__(self, n=3):
        self.n = n

    def entry(self, strat):
        if len(strat.data.Close) < self.n + 1:
            return False
        C, O = strat.data.Close, strat.data.Open
        return all(C[-i] > C[-i - 1] and C[-i] > O[-i] for i in range(1, self.n + 1))

    def exit(self, strat):
        return strat.data.Close[-1] < strat.data.Open[-1]


class DualThrust(Alpha):
    def __init__(self, n=4, k1=0.5, k2=0.5):
        self.n, self.k1, self.k2 = n, k1, k2

    def register(self, strat):
        h, l, c = _hlc(strat)
        hh = h.rolling(self.n).max()
        lc = c.rolling(self.n).min()
        hc = c.rolling(self.n).max()
        ll = l.rolling(self.n).min()
        rng = pd.concat([hh - lc, hc - ll], axis=1).max(axis=1)
        self._put(strat, rng=strat.I(lambda: rng.values))

    def entry(self, strat):
        rng = self._get(strat, "rng")[-1]
        if np.isnan(rng):
            return False
        return strat.data.Close[-1] > strat.data.Open[-1] + self.k1 * rng

    def exit(self, strat):
        rng = self._get(strat, "rng")[-1]
        if np.isnan(rng):
            return False
        return strat.data.Close[-1] < strat.data.Open[-1] - self.k2 * rng


class AlligatorBreakout(Alpha):
    def __init__(self, jaw=13, teeth=8, lips=5, jaw_s=8, teeth_s=5, lips_s=3, frac=5):
        self.jaw, self.teeth, self.lips = jaw, teeth, lips
        self.jaw_s, self.teeth_s, self.lips_s, self.frac = jaw_s, teeth_s, lips_s, frac

    def register(self, strat):
        c = _close(strat)
        h, _, _ = _hlc(strat)
        self._put(strat,
                  jaw=strat.I(lambda: ta.ema(c, self.jaw).shift(self.jaw_s).bfill().values),
                  teeth=strat.I(lambda: ta.ema(c, self.teeth).shift(self.teeth_s).bfill().values),
                  lips=strat.I(lambda: ta.ema(c, self.lips).shift(self.lips_s).bfill().values),
                  hi=strat.I(lambda: h.rolling(self.frac).max().shift(1).values))

    def entry(self, strat):
        j, t, lp = self._get(strat, "jaw"), self._get(strat, "teeth"), self._get(strat, "lips")
        return lp[-1] > t[-1] > j[-1] and strat.data.Close[-1] > self._get(strat, "hi")[-1]

    def exit(self, strat):
        return self._get(strat, "lips")[-1] < self._get(strat, "teeth")[-1]


class Nr7Breakout(Alpha):
    def register(self, strat):
        h, l, _ = _hlc(strat)
        self._put(strat, rng=strat.I(lambda: (h - l).values))

    def entry(self, strat):
        r = self._get(strat, "rng")
        if len(r) < 8:
            return False
        return r[-2] < min(r[-8:-2]) and strat.data.Close[-1] > strat.data.High[-2]


class InsideBarBreakout(Alpha):
    def entry(self, strat):
        if len(strat.data.Close) < 4:
            return False
        H, L = strat.data.High, strat.data.Low
        is_inside = H[-2] < H[-3] and L[-2] > L[-3]
        return is_inside and strat.data.Close[-1] > H[-3]


class FibGoldenZone(Alpha):
    def __init__(self, lookback=50):
        self.lookback = lookback

    def register(self, strat):
        h, l, _ = _hlc(strat)
        self._put(strat, hi=strat.I(lambda: h.rolling(self.lookback).max().values),
                  lo=strat.I(lambda: l.rolling(self.lookback).min().values))

    def entry(self, strat):
        hi, lo = self._get(strat, "hi")[-1], self._get(strat, "lo")[-1]
        diff = hi - lo
        if diff <= 0:
            return False
        price = strat.data.Close[-1]
        return (lo + 0.5 * diff) <= price <= (lo + 0.618 * diff)

    def exit(self, strat):
        return strat.data.Close[-1] > self._get(strat, "hi")[-1]


class TurtleSoupReversal(Alpha):
    """False-breakout reversal: undercut the prior N-day low then reclaim it."""

    def __init__(self, lookback=20):
        self.lookback = lookback

    def register(self, strat):
        _, l, _ = _hlc(strat)
        self._put(strat, lo=strat.I(lambda: l.rolling(self.lookback).min().shift(1).values))

    def entry(self, strat):
        lo = self._get(strat, "lo")[-1]
        if np.isnan(lo):
            return False
        return strat.data.Low[-1] < lo and strat.data.Close[-1] > lo


class AccumulationDivergence(Alpha):
    """Contrarian: price falling while broker accumulation rises (absorption)."""

    def __init__(self, symbol, lookback=10):
        self.symbol, self.lookback = symbol, lookback

    def register(self, strat):
        from stocks.models import DailyCumulativeAccumulation
        dates = strat.data.index
        qs = DailyCumulativeAccumulation.objects.filter(symbol=self.symbol).values(
            'transaction_date', 'cumulative_net')
        if not qs:
            self._put(strat, acc=strat.I(lambda: np.zeros(len(dates))))
            return
        df = pd.DataFrame(list(qs))
        df['transaction_date'] = pd.to_datetime(df['transaction_date'])
        daily = df.groupby('transaction_date')['cumulative_net'].sum().reindex(dates).ffill().fillna(0).astype(float)
        self._put(strat, acc=strat.I(lambda: daily.values))

    def entry(self, strat):
        n = self.lookback
        if len(strat.data.Close) < n:
            return False
        acc = self._get(strat, "acc")
        return strat.data.Close[-1] < strat.data.Close[-n] and acc[-1] > acc[-n]

    def exit(self, strat):
        n = self.lookback
        acc = self._get(strat, "acc")
        return strat.data.Close[-1] > strat.data.Close[-n] and acc[-1] < acc[-n]


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
# Regimes (extra entry filters)
# --------------------------------------------------------------------------- #
class AboveSMA(Regime):
    """Allow entries only while price is above a simple moving average."""

    def __init__(self, sma_period=50):
        self.sma_period = sma_period

    def register(self, strat):
        c = _close(strat)
        self._put(strat, sma=strat.I(lambda: ta.sma(c, self.sma_period).values))

    def ok(self, strat):
        return strat.data.Close[-1] > self._get(strat, "sma")[-1]


class RsiBand(Regime):
    """Only enter when RSI sits in a sane band (avoid buying into overbought froth)."""

    def __init__(self, rsi_period=14, min_level=35, max_level=70):
        self.rsi_period, self.min_level, self.max_level = rsi_period, min_level, max_level

    def register(self, strat):
        c = _close(strat)
        self._put(strat, rsi=strat.I(lambda: ta.rsi(c, self.rsi_period).values))

    def ok(self, strat):
        return self.min_level <= self._get(strat, "rsi")[-1] <= self.max_level


class VolumeAboveAverage(Regime):
    """Only enter when volume confirms (current volume above its average × multiplier)."""

    def __init__(self, volume_period=20, volume_multiplier=1.0):
        self.volume_period, self.volume_multiplier = volume_period, volume_multiplier

    def register(self, strat):
        v = pd.Series(strat.data.Volume)
        self._put(strat, vavg=strat.I(lambda: v.rolling(self.volume_period).mean().values))

    def ok(self, strat):
        return strat.data.Volume[-1] > self._get(strat, "vavg")[-1] * self.volume_multiplier


# --------------------------------------------------------------------------- #
# Exits (richer exit rules — compose several; any one triggers a close)
# --------------------------------------------------------------------------- #
class TrendBreak(ExitRule):
    """Exit when price loses a long-term EMA (lets winners run otherwise)."""

    def __init__(self, ema_period=200):
        self.ema_period = ema_period

    def register(self, strat):
        c = _close(strat)
        self._put(strat, ema=strat.I(lambda: ta.ema(c, self.ema_period).values))

    def exit(self, strat):
        return strat.data.Close[-1] < self._get(strat, "ema")[-1]


class TakeProfitPct(ExitRule):
    """Bank a fixed percentage gain from the entry price."""

    def __init__(self, target_pct=15.0):
        self.target_pct = target_pct

    def exit(self, strat):
        if not self.position(strat):
            return False
        entry = strat.trades[0].entry_price
        return strat.data.Close[-1] >= entry * (1 + self.target_pct / 100.0)

    @staticmethod
    def position(strat):
        return bool(strat.trades)


class TrailingStopPct(ExitRule):
    """Percent trailing stop from the highest close reached since entry."""

    def __init__(self, trail_pct=10.0):
        self.trail_pct = trail_pct

    def exit(self, strat):
        if not strat.trades:
            strat._tsp_peak = None
            return False
        price = strat.data.Close[-1]
        peak = getattr(strat, "_tsp_peak", None)
        peak = price if peak is None else max(peak, price)
        strat._tsp_peak = peak
        return price < peak * (1 - self.trail_pct / 100.0)


class TimeExit(ExitRule):
    """Exit after a maximum number of bars held (avoids dead-money positions)."""

    def __init__(self, max_bars=20):
        self.max_bars = max_bars

    def exit(self, strat):
        if not strat.trades:
            return False
        return (len(strat.data) - 1 - strat.trades[0].entry_bar) >= self.max_bars


class RsiExit(ExitRule):
    """Exit when RSI becomes overbought."""

    def __init__(self, rsi_period=14, exit_level=70):
        self.rsi_period, self.exit_level = rsi_period, exit_level

    def register(self, strat):
        c = _close(strat)
        self._put(strat, rsi=strat.I(lambda: ta.rsi(c, self.rsi_period).values))

    def exit(self, strat):
        return self._get(strat, "rsi")[-1] > self.exit_level


class MaCrossExit(ExitRule):
    """Exit when a fast MA crosses back below a slow MA (momentum fading)."""

    def __init__(self, fast_period=10, slow_period=30):
        self.fast_period, self.slow_period = fast_period, slow_period

    def register(self, strat):
        c = _close(strat)
        self._put(strat, fast=strat.I(lambda: ta.sma(c, self.fast_period).values),
                  slow=strat.I(lambda: ta.sma(c, self.slow_period).values))

    def exit(self, strat):
        return self._get(strat, "fast")[-1] < self._get(strat, "slow")[-1]
