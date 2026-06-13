"""Historical analog engine: "the last N times this setup appeared on this symbol".

Fingerprint = (accumulation-intensity bucket, RSI band, regime proxy).
Regime proxy = NEPSE index close vs its 200-day SMA on that day; dropped from the
fingerprint when index history is insufficient. Results with n < 5 are suppressed
(return None) — no fake base rates.
"""
import logging

import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)

MIN_MATCHES = 5
ACC_WINDOW = 10
VOL_WINDOW = 20
RSI_PERIOD = 14
INDEX_SMA = 200


def intensity_bucket(intensity):
    if intensity > 10:
        return "STRONG"
    if intensity > 3:
        return "MILD"
    if intensity >= -3:
        return "FLAT"
    return "NEG"


def rsi_band(rsi):
    if rsi < 30:
        return "OVERSOLD"
    if rsi < 50:
        return "LOW"
    if rsi < 70:
        return "HIGH"
    return "OVERBOUGHT"


def compute_rsi(closes, period=RSI_PERIOD):
    """Wilder RSI as a pandas Series aligned to `closes`."""
    delta = closes.diff()
    gain = delta.clip(lower=0).ewm(alpha=1 / period, min_periods=period).mean()
    loss = (-delta.clip(upper=0)).ewm(alpha=1 / period, min_periods=period).mean()
    rs = gain / loss.replace(0, np.nan)
    rsi = 100 - (100 / (1 + rs))
    return rsi.fillna(100.0).where(loss.notna(), np.nan)


def forward_return_stats(closes, match_positions, min_matches=MIN_MATCHES):
    """Median forward 1/3/5-day returns + 3-day win rate over matched positions.

    `closes` is a Series; `match_positions` are integer positions into it.
    Positions without a full 5-day forward window are dropped. Returns None if
    fewer than `min_matches` survive.
    """
    arr = closes.to_numpy(dtype=float)
    rows = []
    for p in match_positions:
        if p + 5 >= len(arr):
            continue
        base = arr[p]
        if base <= 0:
            continue
        rows.append((
            (arr[p + 1] / base - 1) * 100,
            (arr[p + 3] / base - 1) * 100,
            (arr[p + 5] / base - 1) * 100,
        ))
    if len(rows) < min_matches:
        return None
    f1, f3, f5 = (np.array([r[i] for r in rows]) for i in range(3))
    return {
        "n": len(rows),
        "fwd_1d_median_pct": round(float(np.median(f1)), 2),
        "fwd_3d_median_pct": round(float(np.median(f3)), 2),
        "fwd_5d_median_pct": round(float(np.median(f5)), 2),
        "win_rate_3d": round(float((f3 > 0).mean()), 2),
    }


def _daily_total_accumulation(symbol):
    """Total cumulative_net per day (summed across entities) as a date-indexed Series."""
    from django.db.models import Sum
    from stocks.models import DailyCumulativeAccumulation
    rows = (
        DailyCumulativeAccumulation.objects.filter(symbol=symbol)
        .values("transaction_date")
        .annotate(total=Sum("cumulative_net"))
        .order_by("transaction_date")
    )
    if not rows:
        return None
    s = pd.Series({r["transaction_date"]: float(r["total"] or 0) for r in rows})
    s.index = pd.to_datetime(s.index)
    return s


def _index_regime_series():
    """Boolean Series (date → above 200-SMA) for the NEPSE index, or None."""
    from stocks.models import DailyIndexValue
    rows = (
        DailyIndexValue.objects.filter(index_name__iexact="NEPSE")
        .values_list("date", "value").order_by("date")
    )
    if len(rows) < INDEX_SMA + 1:
        return None
    s = pd.Series({d: float(v) for d, v in rows})
    s.index = pd.to_datetime(s.index)
    return s > s.rolling(INDEX_SMA).mean()


def _load_price_df(symbol):
    """Indirection over backtest_harness.load_price_df (patchable in tests).

    backtest_harness imports native deps (backtesting lib); if that import fails
    at runtime we log a warning and return an empty frame so the analog section
    is simply omitted rather than crashing plan generation.
    """
    try:
        from stocks.services.backtest_harness import load_price_df
    except (ImportError, ModuleNotFoundError) as exc:
        logger.warning("analogs: backtest_harness unavailable: %s", exc)
        return pd.DataFrame()
    return load_price_df(symbol)


def _compute_signals(df, symbol):
    """Compute intensity, RSI and regime Series for `df`; return (intensity, rsi, regime)."""
    closes, volume = df["Close"], df["Volume"]
    acc = _daily_total_accumulation(symbol)
    if acc is None:
        return None, None, None
    acc = acc.reindex(df.index).ffill()
    acc_mom = acc - acc.shift(ACC_WINDOW)
    vol_avg = volume.rolling(VOL_WINDOW).mean()
    intensity = (acc_mom / vol_avg.replace(0, np.nan) * 100).clip(-50, 50)
    rsi = compute_rsi(closes)
    regime = _index_regime_series()
    if regime is not None:
        regime = regime.reindex(df.index).ffill()
    return intensity, rsi, regime


def _fingerprint(intensity, rsi, regime, i):
    """Build the (bucket, band, regime_bool) fingerprint tuple for position i."""
    return (
        intensity_bucket(float(intensity.iloc[i])),
        rsi_band(float(rsi.iloc[i])),
        bool(regime.iloc[i]) if regime is not None else None,
    )


def _find_match_positions(df, intensity, rsi, regime, valid, today_fp):
    """Return integer positions (excluding today) whose fingerprint matches today_fp."""
    match_positions = []
    for i in range(len(df) - 1):
        if valid.iloc[i] and _fingerprint(intensity, rsi, regime, i) == today_fp:
            match_positions.append(i)
    return match_positions


def analog_stats(symbol, as_of=None):
    """Forward-return base rates for days matching today's fingerprint, or None."""
    df = _load_price_df(symbol)
    if df is None or len(df) < 60:
        return None
    if as_of is not None:
        df = df.loc[: pd.Timestamp(as_of)]
        if len(df) < 60:
            return None

    intensity, rsi, regime = _compute_signals(df, symbol)
    if intensity is None:
        return None

    valid = intensity.notna() & rsi.notna()
    if regime is not None:
        valid &= regime.notna()
    if not valid.iloc[-1]:
        return None

    today_fp = _fingerprint(intensity, rsi, regime, -1)
    match_positions = _find_match_positions(df, intensity, rsi, regime, valid, today_fp)
    return forward_return_stats(df["Close"], match_positions)
