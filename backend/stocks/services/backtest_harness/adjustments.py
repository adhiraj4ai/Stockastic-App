# backend/stocks/services/backtest_harness/adjustments.py
"""Corporate-action price adjustment for backtest-ready OHLCV frames.

NEPSE convention: ``ex_date`` is the first date trading at the adjusted
price (approximated by the dividend book-close date — at most one daily bar
of imprecision). All bars strictly BEFORE ex_date are multiplied by the
action's factor; volume is divided so turnover is conserved.
"""
import pandas as pd

__all__ = [
    "bonus_adjustment_factor", "rights_adjustment_factor",
    "apply_adjustments", "apply_adjustments_long",
]

_PRICE_COLS = ["Open", "High", "Low", "Close"]


def bonus_adjustment_factor(bonus_percent):
    """Factor for a bonus issue: 20 (%) -> 1/1.2."""
    return 1.0 / (1.0 + float(bonus_percent) / 100.0)


def rights_adjustment_factor(rights_percent, issue_price, cum_close):
    """Theoretical ex-rights factor; identity if the cum close is unusable."""
    cum_close = float(cum_close)
    if cum_close <= 0:
        return 1.0
    r = float(rights_percent) / 100.0
    terp = (cum_close + r * float(issue_price)) / (1.0 + r)
    return terp / cum_close


def apply_adjustments(df, actions):
    """Return a new frame with OHLC (and inversely Volume) scaled per action.

    ``df`` must have a DatetimeIndex and Open/High/Low/Close/Volume columns.
    Factors compound when multiple actions apply to the same bar. The input
    frame is never mutated — the adjusted bars are returned in a fresh copy.
    """
    if df is None or len(df) == 0 or not actions:
        return df
    df = df.copy()
    factor = pd.Series(1.0, index=df.index)
    for ex_date, f in actions:
        factor[df.index < pd.Timestamp(ex_date)] *= float(f)
    df[_PRICE_COLS] = df[_PRICE_COLS].mul(factor, axis=0)
    df["Volume"] = df["Volume"].div(factor)
    return df


def apply_adjustments_long(df, actions_by_ticker, ticker_col="ticker",
                           date_col="date", price_cols=("open", "high", "low", "close"),
                           volume_col="volume"):
    """Adjust a LONG-format multi-symbol frame (ticker/date columns, not indexed).

    ``actions_by_ticker``: {ticker: [(ex_date, factor), ...]}. Same convention as
    ``apply_adjustments``: bars strictly before ex_date are scaled; volume divided.
    Returns a new frame; the input is never mutated.
    """
    if df is None or len(df) == 0 or not actions_by_ticker:
        return df
    df = df.copy()
    factor = pd.Series(1.0, index=df.index)
    dates = pd.to_datetime(df[date_col])
    for ticker, actions in actions_by_ticker.items():
        tmask = df[ticker_col] == ticker
        if not tmask.any():
            continue
        for ex_date, f in actions:
            factor[tmask & (dates < pd.Timestamp(ex_date))] *= float(f)
    for col in price_cols:
        if col in df.columns:
            df[col] = df[col] * factor
    if volume_col and volume_col in df.columns:
        df[volume_col] = df[volume_col] / factor
    return df
