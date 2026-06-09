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
    "AccumulationAboveMA",
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
