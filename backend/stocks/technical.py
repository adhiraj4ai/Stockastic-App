import pandas as pd
import numpy as np
import talib

def _get_scalar(val):
    """Safely extract a scalar value from a Series or array."""
    if val is None:
        return None
    try:
        if hasattr(val, "item"):
            return val.item()
        if isinstance(val, (pd.Series, np.ndarray, list)):
            if len(val) >= 1:
                return val.iloc[-1] if isinstance(val, pd.Series) else val[-1]
        return val
    except:
        return None

def _get_prices_df(ticker):
    """Fetch and prepare price data for calculations."""
    from .models import DailyStockPrice
    prices = DailyStockPrice.objects.filter(ticker=ticker).order_by('date')
    if not prices.exists():
        return None

    df = pd.DataFrame(list(prices.values('date', 'open', 'high', 'low', 'close', 'volume')))
    df['date'] = pd.to_datetime(df['date'])
    df.set_index('date', inplace=True)

    for col in ['open', 'high', 'low', 'close', 'volume']:
        df[col] = pd.to_numeric(df[col], errors='coerce')
    df.dropna(inplace=True)

    if len(df) < 50:
        return None
    return df

def _add_ind(indicators, category, name, value, raw_val=None, suffix=""):
    """Format and add indicator to the results list."""
    if raw_val is None:
        raw_val = value
    
    raw_val = _get_scalar(raw_val)

    display_val = "-"
    if raw_val is not None:
        if pd.isna(raw_val):
            raw_val = None
        else:
            try:
                display_val = f"{float(raw_val):.2f}{suffix}"
            except:
                display_val = str(raw_val)
    
    indicators.append({
        'category': category,
        'name': name,
        'value': display_val,
        'raw_value': raw_val,
        'sector_low': '-', 
        'sector_high': '-',
        'sector_low_ticker': '-',
        'sector_high_ticker': '-'
    })

def _calculate_momentum(df, indicators):
    """Calculate and add momentum indicators using talib."""
    close = df['close'].values
    high = df['high'].values
    low = df['low'].values
    
    rsi = talib.RSI(close, timeperiod=14)
    current_rsi = _get_scalar(rsi[-1]) if rsi is not None and len(rsi) > 0 else None
    _add_ind(indicators, 'Momentum', 'RSI (14)', current_rsi)

    slowk, slowd = talib.STOCH(high, low, close, fastk_period=14, slowk_period=3, slowk_matype=0, slowd_period=3, slowd_matype=0)
    current_stoch_k = _get_scalar(slowk[-1]) if slowk is not None and len(slowk) > 0 else None
    _add_ind(indicators, 'Momentum', 'Stochastic %K', current_stoch_k)

    cci = talib.CCI(high, low, close, timeperiod=20)
    current_cci = _get_scalar(cci[-1]) if cci is not None and len(cci) > 0 else None
    _add_ind(indicators, 'Momentum', 'CCI (20)', current_cci)

    willr = talib.WILLR(high, low, close, timeperiod=14)
    current_willr = _get_scalar(willr[-1]) if willr is not None and len(willr) > 0 else None
    _add_ind(indicators, 'Momentum', 'Williams %R', current_willr)

    roc = talib.ROC(close, timeperiod=14)
    current_roc = _get_scalar(roc[-1]) if roc is not None and len(roc) > 0 else None
    _add_ind(indicators, 'Momentum', 'ROC (14)', current_roc, suffix="%")

    uo = talib.ULTOSC(high, low, close, timeperiod1=7, timeperiod2=14, timeperiod3=28)
    current_uo = _get_scalar(uo[-1]) if uo is not None and len(uo) > 0 else None
    _add_ind(indicators, 'Momentum', 'Ultimate Osc.', current_uo)

def _add_macd_indicators(df, indicators):
    """Add MACD line, histogram, and signal to indicators list."""
    close = df['close'].values
    macd, macdsignal, macdhist = talib.MACD(close, fastperiod=12, slowperiod=26, signalperiod=9)
    _add_ind(indicators, 'Trend', 'MACD (12,26,9)', _get_scalar(macd[-1]) if macd is not None and len(macd) > 0 else None)
    _add_ind(indicators, 'Trend', 'MACD Histogram', _get_scalar(macdhist[-1]) if macdhist is not None and len(macdhist) > 0 else None)
    _add_ind(indicators, 'Trend', 'MACD Signal', _get_scalar(macdsignal[-1]) if macdsignal is not None and len(macdsignal) > 0 else None)


def _add_price_trends(df, indicators):
    """Add simple 5D, 10D, and 1M price-change trend indicators."""
    if len(df) < 30:
        return
    latest = float(df['close'].iloc[-1])
    for label, offset in [('5D Trend', 5), ('10D Trend', 10), ('1M Trend', 22)]:
        if len(df) > offset:
            prev = float(df['close'].iloc[-(offset + 1)])
            chg = ((latest - prev) / prev) * 100 if prev != 0 else 0
            _add_ind(indicators, 'Trend', label, chg, suffix="%")


def _add_ichimoku(df, indicators):
    """Add Ichimoku base/conversion line indicator if enough data is available."""
    if len(df) < 52:
        return
    tenkan = (df['high'].rolling(9).max() + df['low'].rolling(9).min()) / 2
    kijun = (df['high'].rolling(26).max() + df['low'].rolling(26).min()) / 2
    conv, base = _get_scalar(tenkan.iloc[-1]), _get_scalar(kijun.iloc[-1])
    display = (
        f"{base:.1f} / {conv:.1f}"
        if (base is not None and not np.isnan(base) and conv is not None and not np.isnan(conv))
        else "-"
    )
    _add_ind(indicators, 'Trend', 'Ichimoku (Base/Conv)', display, base)


def _calculate_trend(df, indicators):
    """Calculate and add trend indicators using talib and manual Ichimoku logic."""
    close = df['close'].values
    high = df['high'].values
    low = df['low'].values

    _add_macd_indicators(df, indicators)
    _add_price_trends(df, indicators)

    adx = talib.ADX(high, low, close, timeperiod=14)
    _add_ind(indicators, 'Trend', 'ADX (14)', _get_scalar(adx[-1]) if adx is not None and len(adx) > 0 else None)

    aroon_down, aroon_up = talib.AROON(high, low, timeperiod=14)
    u = _get_scalar(aroon_up[-1]) if aroon_up is not None and len(aroon_up) > 0 else None
    d = _get_scalar(aroon_down[-1]) if aroon_down is not None and len(aroon_down) > 0 else None
    aroon_display = f"{u:.0f} / {d:.0f}" if (u is not None and not np.isnan(u) and d is not None and not np.isnan(d)) else "-"
    _add_ind(indicators, 'Trend', 'Aroon Up/Down', aroon_display, u)

    _add_ichimoku(df, indicators)

    psar = talib.SAR(high, low, acceleration=0.02, maximum=0.2)
    _add_ind(indicators, 'Trend', 'PSAR', _get_scalar(psar[-1]) if psar is not None and len(psar) > 0 else None)

    for length in [50, 200]:
        _add_ind(indicators, 'Trend', f'{length}-Day SMA', _get_scalar(talib.SMA(close, timeperiod=length)[-1]))

def _add_keltner_channels(close, high, low, indicators):
    """Compute and add Keltner Channels (EMA ± 2×ATR) to indicators."""
    ema_20 = talib.EMA(close, timeperiod=20)
    atr_20 = talib.ATR(high, low, close, timeperiod=20)
    if not (ema_20 is not None and atr_20 is not None and len(ema_20) > 0 and len(atr_20) > 0):
        return
    u_raw = ema_20[-1] + (2 * atr_20[-1])
    l_raw = ema_20[-1] - (2 * atr_20[-1])
    display = f"{u_raw:.1f} / {l_raw:.1f}" if not (np.isnan(u_raw) or np.isnan(l_raw)) else "-"
    _add_ind(indicators, 'Volatility', 'Keltner Channels', display, u_raw)


def _calculate_volatility(df, indicators):
    """Calculate and add volatility indicators using talib and manual KC/DC."""
    close = df['close'].values
    high = df['high'].values
    low = df['low'].values

    upper, _mid, lower = talib.BBANDS(close, timeperiod=20, nbdevup=2, nbdevdn=2, matype=0)
    if upper is not None and len(upper) > 0:
        u, l, c = upper[-1], lower[-1], close[-1]
        bb_p = (c - l) / (u - l) if (u - l) != 0 else 0
        _add_ind(indicators, 'Volatility', 'Bollinger %B', bb_p)

    atr = talib.ATR(high, low, close, timeperiod=14)
    _add_ind(indicators, 'Volatility', 'ATR (14)', _get_scalar(atr[-1]) if atr is not None and len(atr) > 0 else None)

    _add_keltner_channels(close, high, low, indicators)

    if len(df) >= 20:
        u = df['high'].rolling(window=20).max().iloc[-1]
        l = df['low'].rolling(window=20).min().iloc[-1]
        _add_ind(indicators, 'Volatility', 'Donchian Channels', f"{u:.1f} / {l:.1f}", u)

def _calculate_volume(df, indicators):
    """Calculate and add volume indicators using talib."""
    close = df['close'].values
    high = df['high'].values
    low = df['low'].values
    volume = df['volume'].values.astype(float)
    
    mfi = talib.MFI(high, low, close, volume, timeperiod=14)
    _add_ind(indicators, 'Volume', 'MFI (14)', _get_scalar(mfi[-1]) if mfi is not None else None)
    
    obv = talib.OBV(close, volume)
    _add_ind(indicators, 'Volume', 'OBV', _get_scalar(obv[-1]) if obv is not None else None)
    
    # Chaikin Money Flow (CMF) - Manual Calculation as talib doesn't have it directly (only ADO)
    ad = talib.AD(high, low, close, volume)
    # CMF = Sum(AD, n) / Sum(Vol, n) is NOT correct, CMF uses Money Flow Multiplier
    # Guard against division by zero if high == low (flat price)
    range_diff = high - low
    mfm = np.zeros_like(close)
    mask = range_diff != 0
    mfm[mask] = ((close[mask] - low[mask]) - (high[mask] - close[mask])) / range_diff[mask]
    
    mfv = mfm * volume
    
    # Guard against division by zero in rolling volume sum
    vol_sum = pd.Series(volume).rolling(20).sum()
    cmf = pd.Series(mfv).rolling(20).sum() / vol_sum.replace(0, np.nan)
    cmf = cmf.fillna(0)
    
    _add_ind(indicators, 'Volume', 'CMF (20)', _get_scalar(cmf.iloc[-1]))

def _find_swing_levels(df, current_price):
    """Return (resistances, supports) lists from 2-year structural swing points."""
    n = 15
    df['is_peak'] = df['high'] == df['high'].rolling(window=2 * n + 1, center=True).max()
    df['is_trough'] = df['low'] == df['low'].rolling(window=2 * n + 1, center=True).min()
    recent = df.tail(252 * 2)
    peaks = recent[recent['is_peak']]['high'].unique()
    troughs = recent[recent['is_trough']]['low'].unique()
    resistances = sorted(p for p in peaks if p > current_price)
    supports = sorted((t for t in troughs if t < current_price), reverse=True)
    return resistances, supports


def _calculate_support_resistance(df, indicators):
    """Add support and resistance levels from structural swing points and pivot."""
    if len(df) < 50:
        return
    current_price = float(df['close'].iloc[-1])
    resistances, supports = _find_swing_levels(df, current_price)

    year = df.tail(252)
    pivot_p = (year['high'].max() + year['low'].min() + year['close'].iloc[-1]) / 3
    _add_ind(indicators, 'Support & Resistance', 'Pivot (P)', pivot_p)

    for i in range(3):
        if i < len(resistances):
            _add_ind(indicators, 'Support & Resistance', f'Resistance {i+1}', resistances[i])
        if i < len(supports):
            _add_ind(indicators, 'Support & Resistance', f'Support {i+1}', supports[i])

def get_technical_indicators(ticker, days=365):
    """Entry point for calculating technical indicators."""
    try:
        df = _get_prices_df(ticker)
        if df is None:
            return []

        indicators = []
        _calculate_momentum(df, indicators)
        _calculate_trend(df, indicators)
        _calculate_volatility(df, indicators)
        _calculate_volume(df, indicators)
        _calculate_support_resistance(df, indicators)

        return indicators

    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"Error calculating indicators for {ticker}: {e}")
        return []
