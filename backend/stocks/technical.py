import pandas as pd
import pandas_ta as ta
import numpy as np
from .models import DailyStockPrice

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
    """Calculate and add momentum indicators."""
    rsi = df.ta.rsi(length=14)
    current_rsi = _get_scalar(rsi.iloc[-1]) if rsi is not None and not rsi.empty else None
    _add_ind(indicators, 'Momentum', 'RSI (14)', current_rsi)

    stoch = df.ta.stoch(k=14, d=3, smooth_k=3)
    current_stoch_k = _get_scalar(stoch['STOCHk_14_3_3'].iloc[-1]) if stoch is not None and not stoch.empty and 'STOCHk_14_3_3' in stoch.columns else None
    _add_ind(indicators, 'Momentum', 'Stochastic %K', current_stoch_k)

    cci = df.ta.cci(length=20)
    current_cci = _get_scalar(cci.iloc[-1]) if cci is not None and not cci.empty else None
    _add_ind(indicators, 'Momentum', 'CCI (20)', current_cci)

    willr = df.ta.willr(length=14)
    current_willr = _get_scalar(willr.iloc[-1]) if willr is not None and not willr.empty else None
    _add_ind(indicators, 'Momentum', 'Williams %R', current_willr)

    roc = df.ta.roc(length=12)
    current_roc = _get_scalar(roc.iloc[-1]) if roc is not None and not roc.empty else None
    _add_ind(indicators, 'Momentum', 'ROC (12)', current_roc, suffix="%")

    uo = df.ta.uo()
    current_uo = _get_scalar(uo.iloc[-1]) if uo is not None and not uo.empty else None
    _add_ind(indicators, 'Momentum', 'Ultimate Osc.', current_uo)

def _calculate_trend(df, indicators):
    """Calculate and add trend indicators."""
    macd = df.ta.macd(fast=12, slow=26, signal=9)
    current_macd = _get_scalar(macd['MACD_12_26_9'].iloc[-1]) if macd is not None and not macd.empty and 'MACD_12_26_9' in macd.columns else None
    _add_ind(indicators, 'Trend', 'MACD (12,26,9)', current_macd)

    adx = df.ta.adx(length=14)
    current_adx = _get_scalar(adx['ADX_14'].iloc[-1]) if adx is not None and not adx.empty and 'ADX_14' in adx.columns else None
    _add_ind(indicators, 'Trend', 'ADX (14)', current_adx)

    aroon = df.ta.aroon(length=14)
    current_aroon_u = _get_scalar(aroon['AROONU_14'].iloc[-1]) if aroon is not None and not aroon.empty and 'AROONU_14' in aroon.columns else None
    current_aroon_d = _get_scalar(aroon['AROOND_14'].iloc[-1]) if aroon is not None and not aroon.empty and 'AROOND_14' in aroon.columns else None
    aroon_display = f"{current_aroon_u:.0f} / {current_aroon_d:.0f}" if (current_aroon_u is not None and current_aroon_d is not None) else "-"
    _add_ind(indicators, 'Trend', 'Aroon Up/Down', aroon_display, current_aroon_u)

    ichimoku = df.ta.ichimoku()
    if ichimoku is not None and isinstance(ichimoku, tuple) and len(ichimoku) > 0:
        ichi_df = ichimoku[0]
        if ichi_df is not None and not ichi_df.empty:
            conv = _get_scalar(ichi_df['ITS_9'].iloc[-1]) if 'ITS_9' in ichi_df.columns else None
            base = _get_scalar(ichi_df['IKS_26'].iloc[-1]) if 'IKS_26' in ichi_df.columns else None
            display = f"{base:.1f} / {conv:.1f}" if (base is not None and conv is not None) else "-"
            _add_ind(indicators, 'Trend', 'Ichimoku (Base/Conv)', display, base)

    psar = df.ta.psar()
    current_psar = None
    if psar is not None and not psar.empty:
        vals = psar.iloc[-1]
        p_l = _get_scalar(vals.get('PSARl_0.02_0.2'))
        p_s = _get_scalar(vals.get('PSARs_0.02_0.2'))
        current_psar = p_l if (p_l is not None and not pd.isna(p_l)) else p_s
    _add_ind(indicators, 'Trend', 'PSAR', current_psar)

    for length in [20, 50, 200]:
        val = _get_scalar(df.ta.sma(length=length).iloc[-1])
        _add_ind(indicators, 'Trend', f'{length}-Day SMA', val)
    
    for length in [12, 26, 50, 200]:
        val = _get_scalar(df.ta.ema(length=length).iloc[-1])
        _add_ind(indicators, 'Trend', f'{length}-Day EMA', val)

def _calculate_volatility(df, indicators):
    """Calculate and add volatility indicators."""
    bb = df.ta.bbands(length=20, std=2)
    current_bb_p = _get_scalar(bb['BBP_20_2.0'].iloc[-1]) if bb is not None and not bb.empty and 'BBP_20_2.0' in bb.columns else None
    _add_ind(indicators, 'Volatility', 'Bollinger %B', current_bb_p)

    atr = df.ta.atr(length=14)
    current_atr = _get_scalar(atr.iloc[-1]) if atr is not None and not atr.empty else None
    _add_ind(indicators, 'Volatility', 'ATR (14)', current_atr)

    kc = df.ta.kc()
    if kc is not None and not kc.empty:
        u = _get_scalar(kc[[c for c in kc.columns if c.startswith('KCU')][0]].iloc[-1])
        l = _get_scalar(kc[[c for c in kc.columns if c.startswith('KCL')][0]].iloc[-1])
        _add_ind(indicators, 'Volatility', 'Keltner Channels', f"{u:.1f} / {l:.1f}", u)

    dc = df.ta.donchian(length=20)
    if dc is not None and not dc.empty:
        u = _get_scalar(dc['DCU_20_20'].iloc[-1]) if 'DCU_20_20' in dc.columns else None
        l = _get_scalar(dc['DCL_20_20'].iloc[-1]) if 'DCL_20_20' in dc.columns else None
        if u is not None:
            _add_ind(indicators, 'Volatility', 'Donchian Channels', f"{u:.1f} / {l:.1f}", u)

def _calculate_volume(df, indicators):
    """Calculate and add volume indicators."""
    mfi = df.ta.mfi(length=14)
    _add_ind(indicators, 'Volume', 'MFI (14)', _get_scalar(mfi.iloc[-1]) if mfi is not None else None)
    
    obv = df.ta.obv()
    _add_ind(indicators, 'Volume', 'OBV', _get_scalar(obv.iloc[-1]) if obv is not None else None)
    
    cmf = df.ta.cmf(length=20)
    _add_ind(indicators, 'Volume', 'CMF (20)', _get_scalar(cmf.iloc[-1]) if cmf is not None else None)

def _calculate_support_resistance(df, indicators):
    """Calculate and add support and resistance levels."""
    last_date = df.index[-1]
    start_date = last_date - pd.Timedelta(days=90)
    window = df[df.index > start_date]
    
    if not window.empty:
        h, l, c = window['high'].max(), window['low'].min(), window['close'].iloc[-1]
        p = (h + l + c) / 3
        r1, s1 = (2 * p) - l, (2 * p) - h
        r2, s2 = p + (h - l), p - (h - l)
        r3, s3 = p + 2 * (h - l), p - 2 * (h - l)
        
        for name, val in [('Pivot (P)', p), ('Resistance 1 (R1)', r1), ('Support 1 (S1)', s1),
                          ('Resistance 2 (R2)', r2), ('Support 2 (S2)', s2),
                          ('Resistance 3 (R3)', r3), ('Support 3 (S3)', s3)]:
            _add_ind(indicators, 'Support & Resistance', name, val)

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
