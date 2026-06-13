"""Private helpers for the batch_indicators view."""
import datetime
import logging

import numpy as np
import pandas as pd
import talib

from django.db.models import Count

from ...models import DailyStockPrice

logger = logging.getLogger(__name__)

_HISTORY_DAYS = 60
_MIN_ROWS_FOR_TECHNICALS = 30


def _fetch_latest_date():
    """Return the latest trading date with more than 10 tickers."""
    result = DailyStockPrice.objects.values('date').annotate(
        count=Count('ticker')
    ).filter(count__gt=10).order_by('-date').first()
    return result['date'] if result else None


def _fetch_price_df(symbols, latest_date):
    """Fetch 60 days of price history and return as DataFrame (or empty)."""
    start_date = latest_date - datetime.timedelta(days=_HISTORY_DAYS)
    prices_qs = DailyStockPrice.objects.filter(
        ticker__in=symbols,
        date__gte=start_date,
        date__lte=latest_date,
    ).values('ticker', 'date', 'close', 'prev_close', 'open').order_by('date')
    if not prices_qs.exists():
        return pd.DataFrame()
    return pd.DataFrame(list(prices_qs))


def _calc_trends(t_df, close):
    """Return dict of 5d/10d/1m trend percentages."""
    def pct(n):
        ref = float(t_df.iloc[-n]['close']) if len(t_df) >= n else float(t_df.iloc[0]['close'])
        return round(((close - ref) / ref * 100) if ref > 0 else 0, 2)
    return {'5d': pct(5), '10d': pct(10), '1m': pct(20)}


def _calc_talib_indicators(close_vals):
    """Return (rsi, macd, macd_signal, macd_hist, roc14) from close_vals."""
    def safe(arr):
        return round(float(arr[-1]), 2) if arr is not None and len(arr) > 0 and not np.isnan(arr[-1]) else None

    rsi = talib.RSI(close_vals, timeperiod=14)
    macd, macdsignal, macdhist = talib.MACD(close_vals, fastperiod=12, slowperiod=26, signalperiod=9)
    roc = talib.ROC(close_vals, timeperiod=14)
    return safe(rsi), safe(macd), safe(macdsignal), safe(macdhist), safe(roc)


def _compute_ticker_result(ticker, t_df):
    """Return indicator result dict for a single ticker DataFrame."""
    t_df['close'] = pd.to_numeric(t_df['close'])
    close = float(t_df.iloc[-1]['close'])
    trends = _calc_trends(t_df, close)

    rsi_val = macd_val = macd_signal = macd_hist = roc14_val = None
    if len(t_df) >= _MIN_ROWS_FOR_TECHNICALS:
        try:
            rsi_val, macd_val, macd_signal, macd_hist, roc14_val = _calc_talib_indicators(
                t_df['close'].values.astype(float)
            )
        except Exception as e:
            logger.warning(f"Error calculating batch indicators for {ticker}: {e}")

    return {
        'trends': trends,
        'rsi': rsi_val,
        'macd': macd_val,
        'macd_signal': macd_signal,
        'macd_hist': macd_hist,
        'roc': roc14_val,
    }
