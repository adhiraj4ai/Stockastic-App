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

    def scan_all(self):
        """Returns counts and symbol-lists for all 10 signal types."""
        results = {
            "pa_buy": [], "pa_sell": [],
            "mr_buy": [], "mr_sell": [],
            "rsi_bull_div": [], "rsi_bear_div": [],
            "macd_bull_div": [], "macd_bear_div": [],
            "dow_buy": [], "dow_sell": []
        }

        for ticker in self.tickers:
            try:
                df = _get_prices_df(ticker)
                if df is None or len(df) < 50:
                    continue

                # 1. Price Action (using PA Analyzer)
                analyzer = PriceActionAnalyzer(ticker)
                pa_data = analyzer.get_analysis(lookback=2)
                if pa_data and "error" not in pa_data and len(pa_data["history"]) > 0:
                    latest = pa_data["history"][0]
                    # SMC + Patterns
                    has_bullish_pa = any(e['sentiment'] == 'BULLISH' for e in latest.get('smc_events', [])) or \
                                     any(p['sentiment'] == 'BULLISH' for p in latest.get('patterns', []))
                    has_bearish_pa = any(e['sentiment'] == 'BEARISH' for e in latest.get('smc_events', [])) or \
                                     any(p['sentiment'] == 'BEARISH' for p in latest.get('patterns', []))
                    
                    if has_bullish_pa: results["pa_buy"].append(ticker)
                    if has_bearish_pa: results["pa_sell"].append(ticker)

                # 2. Indicators using talib
                close = df['close'].values.astype(float)
                df['rsi'] = talib.RSI(close, timeperiod=14)
                df['sma_20'] = talib.SMA(close, timeperiod=20)
                macd, macdsignal, macdhist = talib.MACD(close, fastperiod=12, slowperiod=26, signalperiod=9)
                df['macd'] = macd
                
                latest_price = float(df['close'].iloc[-1])
                latest_rsi = float(df['rsi'].iloc[-1]) if not pd.isna(df['rsi'].iloc[-1]) else 50
                sma20 = float(df['sma_20'].iloc[-1]) if not pd.isna(df['sma_20'].iloc[-1]) else latest_price

                # Mean Reversal
                if latest_rsi < 30 and latest_price < (sma20 * 0.98):
                    results["mr_buy"].append(ticker)
                elif latest_rsi > 70 and latest_price > (sma20 * 1.02):
                    results["mr_sell"].append(ticker)

                # 3. Divergence
                lookback = 30
                if len(df) >= lookback:
                    hist = df.tail(lookback)
                    # Find local price trough
                    price_min_idx = hist['low'].idxmin()
                    price_min_val = hist['low'].min()
                    # Find previous trough
                    prev_hist = df.loc[:price_min_idx].tail(30).iloc[:-5] 
                    if not prev_hist.empty:
                        prev_min_val = prev_hist['low'].min()
                        if price_min_val < prev_min_val: # Price lower low
                            rsi_at_current = hist.loc[price_min_idx, 'rsi']
                            rsi_at_prev = prev_hist['rsi'].min()
                            if rsi_at_current > rsi_at_prev: # RSI higher low
                                results["rsi_bull_div"].append(ticker)
                            
                            macd_at_current = hist.loc[price_min_idx, 'macd'] if 'macd' in hist.columns else 0
                            macd_at_prev = prev_hist['macd'].min() if 'macd' in prev_hist.columns else 0
                            if macd_at_current > macd_at_prev:
                                results["macd_bull_div"].append(ticker)

                        # Higher High check
                        price_max_idx = hist['high'].idxmax()
                        price_max_val = hist['high'].max()
                        prev_max_val = prev_hist['high'].max()
                        if price_max_val > prev_max_val:
                            rsi_at_current = hist.loc[price_max_idx, 'rsi']
                            rsi_at_prev = prev_hist['rsi'].max()
                            if rsi_at_current < rsi_at_prev: # RSI lower high
                                results["rsi_bear_div"].append(ticker)
                                
                            macd_at_current = hist.loc[price_max_idx, 'macd'] if 'macd' in hist.columns else 0
                            macd_at_prev = prev_hist['macd'].max() if 'macd' in prev_hist.columns else 0
                            if macd_at_current < macd_at_prev:
                                results["macd_bear_div"].append(ticker)

                # 4. Dow Signal
                range_high = df['high'].shift(1).rolling(20).max().iloc[-1]
                range_low = df['low'].shift(1).rolling(20).min().iloc[-1]
                
                if latest_price > range_high:
                    results["dow_buy"].append(ticker)
                elif latest_price < range_low:
                    results["dow_sell"].append(ticker)

            except Exception as e:
                logger.error(f"Scanner error for {ticker}: {e}")
                continue

        return results
