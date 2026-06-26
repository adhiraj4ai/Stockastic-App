"""Composite 0-100 accumulation strength score. Single source of truth."""
from dataclasses import dataclass

import numpy as np
import pandas as pd

from stocks.services.accumulation.flow import load_broker_flow

SCORE_MAX = 100.0
TOP_CONCENTRATION_N = 3
SLOPE_WINDOW_MIN = 2


@dataclass
class ScoreParams:
    top_n: int = 5
    w_concentration: float = 1.0
    w_coiling: float = 1.0
    w_breakout: float = 1.0
    conc_lookback: int = 10
    coil_lookback: int = 20
    breakout_lookback: int = 20


def _rising(series, lookback):
    """Boolean series: level higher than `lookback` bars ago (accumulation rising)."""
    return series > series.shift(max(lookback, SLOPE_WINDOW_MIN))


def concentration_factor(pivot, top_sum, lookback):
    """Top-3 share of net-buyers' positive cumulative_net, gated on rising flow."""
    if pivot.empty:
        return pd.Series(0.0, index=top_sum.index)
    positive = pivot.clip(lower=0)
    total_pos = positive.sum(axis=1).replace(0, np.nan)
    top3 = positive.apply(lambda row: row.nlargest(TOP_CONCENTRATION_N).sum(), axis=1)
    share = (top3 / total_pos).fillna(0).clip(0, 1)
    return (share * _rising(top_sum, lookback).astype(float)).fillna(0)


def coiling_factor(top_sum, price_df, lookback):
    """Accumulation rising AND volatility compressed AND price range-bound."""
    close = price_df["Close"]
    vol = close.rolling(lookback).std()
    vol_compressed = (vol <= vol.rolling(lookback, min_periods=1).min() * 1.05).astype(float)
    rng = (close.rolling(lookback).max() - close.rolling(lookback).min()) / close
    range_bound = (rng <= rng.rolling(lookback, min_periods=1).median()).astype(float)
    rising = _rising(top_sum, lookback).astype(float)
    return ((vol_compressed + range_bound + rising) / 3.0).fillna(0)


def breakout_factor(price_df, lookback):
    """1.0 when close crosses above the prior `lookback`-bar high."""
    close = price_df["Close"]
    prior_high = close.shift(1).rolling(lookback).max()
    return (close > prior_high).astype(float).fillna(0)


class AccumulationScoreService:
    """Combines the three factors into a single 0-100 score series."""

    @staticmethod
    def _normalized_weights(p):
        raw = np.array([p.w_concentration, p.w_coiling, p.w_breakout], dtype=float)
        total = raw.sum()
        return raw / total if total > 0 else np.array([1 / 3, 1 / 3, 1 / 3])

    @staticmethod
    def score_series(symbol, price_df, params=None):
        p = params or ScoreParams()
        flow = load_broker_flow(symbol, price_df.index, top_n=p.top_n)
        f1 = concentration_factor(flow.pivot, flow.top_sum, p.conc_lookback)
        f2 = coiling_factor(flow.top_sum, price_df, p.coil_lookback)
        f3 = breakout_factor(price_df, p.breakout_lookback)
        w = AccumulationScoreService._normalized_weights(p)
        composite = w[0] * f1 + w[1] * f2 + w[2] * f3
        return (composite * SCORE_MAX).clip(0, SCORE_MAX).fillna(0)

    @staticmethod
    def factor_breakdown(symbol, price_df, params=None):
        p = params or ScoreParams()
        flow = load_broker_flow(symbol, price_df.index, top_n=p.top_n)
        f1 = concentration_factor(flow.pivot, flow.top_sum, p.conc_lookback)
        f2 = coiling_factor(flow.top_sum, price_df, p.coil_lookback)
        f3 = breakout_factor(price_df, p.breakout_lookback)
        score = AccumulationScoreService.score_series(symbol, price_df, p)
        return {"concentration": float(f1.iloc[-1]), "coiling": float(f2.iloc[-1]),
                "breakout": float(f3.iloc[-1]), "score": float(score.iloc[-1])}

    @staticmethod
    def distribution_flipping(symbol, price_df, params=None):
        p = params or ScoreParams()
        flow = load_broker_flow(symbol, price_df.index, top_n=p.top_n)
        return (flow.top_sum < flow.top_sum.shift(p.conc_lookback)).fillna(False)
