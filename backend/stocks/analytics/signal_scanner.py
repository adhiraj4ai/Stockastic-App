import pandas as pd
import talib
import numpy as np
import logging
from ..technical import _get_prices_df
from .price_action import PriceActionAnalyzer

logger = logging.getLogger(__name__)

class MarketSignalScanner:
    """
    Scans the market for 10 specific Institutional Signal types using talib.
    """
    def __init__(self, tickers):
        self.tickers = tickers

    @staticmethod
    def _scan_price_action(ticker, results):
        """Append ticker to pa_buy / pa_sell based on the latest PA analysis."""
        pa_data = PriceActionAnalyzer(ticker).get_analysis(lookback=2)
        if not pa_data or "error" in pa_data or not pa_data["history"]:
            return
        latest = pa_data["history"][0]
        smc = latest.get('smc_events', [])
        pats = latest.get('patterns', [])
        if any(e['sentiment'] == 'BULLISH' for e in smc) or any(p['sentiment'] == 'BULLISH' for p in pats):
            results["pa_buy"].append(ticker)
        if any(e['sentiment'] == 'BEARISH' for e in smc) or any(p['sentiment'] == 'BEARISH' for p in pats):
            results["pa_sell"].append(ticker)

    @staticmethod
    def _compute_indicators(df):
        """Return df with rsi, sma_20, macd columns added plus latest scalar values."""
        close = df['close'].values.astype(float)
        df['rsi'] = talib.RSI(close, timeperiod=14)
        df['sma_20'] = talib.SMA(close, timeperiod=20)
        macd, _sig, _hist = talib.MACD(close, fastperiod=12, slowperiod=26, signalperiod=9)
        df['macd'] = macd
        latest_price = float(df['close'].iloc[-1])
        latest_rsi = float(df['rsi'].iloc[-1]) if not pd.isna(df['rsi'].iloc[-1]) else 50
        sma20 = float(df['sma_20'].iloc[-1]) if not pd.isna(df['sma_20'].iloc[-1]) else latest_price
        return df, latest_price, latest_rsi, sma20

    @staticmethod
    def _scan_mean_reversal(ticker, results, latest_price, latest_rsi, sma20):
        if latest_rsi < 30 and latest_price < (sma20 * 0.98):
            results["mr_buy"].append(ticker)
        elif latest_rsi > 70 and latest_price > (sma20 * 1.02):
            results["mr_sell"].append(ticker)

    @staticmethod
    def _scan_bull_divergence(ticker, results, hist, prev_hist):
        """Detect bullish RSI/MACD divergence (lower price low, higher indicator low)."""
        price_min_idx = hist['low'].idxmin()
        if prev_hist.empty or hist['low'].min() >= prev_hist['low'].min():
            return
        if hist.loc[price_min_idx, 'rsi'] > prev_hist['rsi'].min():
            results["rsi_bull_div"].append(ticker)
        macd_cur = hist.loc[price_min_idx, 'macd'] if 'macd' in hist.columns else 0
        macd_prev = prev_hist['macd'].min() if 'macd' in prev_hist.columns else 0
        if macd_cur > macd_prev:
            results["macd_bull_div"].append(ticker)

    @staticmethod
    def _scan_bear_divergence(ticker, results, hist, prev_hist):
        """Detect bearish RSI/MACD divergence (higher price high, lower indicator high)."""
        price_max_idx = hist['high'].idxmax()
        if prev_hist.empty or hist['high'].max() <= prev_hist['high'].max():
            return
        if hist.loc[price_max_idx, 'rsi'] < prev_hist['rsi'].max():
            results["rsi_bear_div"].append(ticker)
        macd_cur = hist.loc[price_max_idx, 'macd'] if 'macd' in hist.columns else 0
        macd_prev = prev_hist['macd'].max() if 'macd' in prev_hist.columns else 0
        if macd_cur < macd_prev:
            results["macd_bear_div"].append(ticker)

    @staticmethod
    def _scan_divergence(ticker, df, results):
        lookback = 30
        if len(df) < lookback:
            return
        hist = df.tail(lookback)
        price_min_idx = hist['low'].idxmin()
        prev_hist = df.loc[:price_min_idx].tail(30).iloc[:-5]
        MarketSignalScanner._scan_bull_divergence(ticker, results, hist, prev_hist)
        MarketSignalScanner._scan_bear_divergence(ticker, results, hist, prev_hist)

    @staticmethod
    def _scan_dow(ticker, df, results, latest_price):
        range_high = df['high'].shift(1).rolling(20).max().iloc[-1]
        range_low = df['low'].shift(1).rolling(20).min().iloc[-1]
        if latest_price > range_high:
            results["dow_buy"].append(ticker)
        elif latest_price < range_low:
            results["dow_sell"].append(ticker)

    def _scan_ticker(self, ticker, results):
        """Run all signal checks for a single ticker and update results in place."""
        df = _get_prices_df(ticker)
        if df is None or len(df) < 50:
            return
        self._scan_price_action(ticker, results)
        df, latest_price, latest_rsi, sma20 = self._compute_indicators(df)
        self._scan_mean_reversal(ticker, results, latest_price, latest_rsi, sma20)
        self._scan_divergence(ticker, df, results)
        self._scan_dow(ticker, df, results, latest_price)

    def scan_all(self):
        """Return counts and symbol-lists for all 10 signal types."""
        results = {
            "pa_buy": [], "pa_sell": [],
            "mr_buy": [], "mr_sell": [],
            "rsi_bull_div": [], "rsi_bear_div": [],
            "macd_bull_div": [], "macd_bear_div": [],
            "dow_buy": [], "dow_sell": [],
        }
        for ticker in self.tickers:
            try:
                self._scan_ticker(ticker, results)
            except Exception as e:
                logger.error(f"Scanner error for {ticker}: {e}")
        return results
