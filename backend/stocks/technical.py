
import pandas as pd
import pandas_ta as ta
import numpy as np
from .models import DailyStockPrice

def get_technical_indicators(ticker, days=365):
    """
    Calculate technical indicators for a given ticker.
    Returns a list of dicts with 'name', 'value' (formatted), 'raw_value' (float), 'category'
    """
    try:
        # Load data
        prices = DailyStockPrice.objects.filter(ticker=ticker).order_by('date')
        if not prices.exists():
            return []

        df = pd.DataFrame(list(prices.values('date', 'open', 'high', 'low', 'close', 'volume')))
        df['date'] = pd.to_datetime(df['date'])
        df.set_index('date', inplace=True)

        # Ensure numeric types for calculations
        for col in ['open', 'high', 'low', 'close', 'volume']:
            df[col] = pd.to_numeric(df[col], errors='coerce')
        df.dropna(inplace=True) # Drop rows with NaN after conversion

        if len(df) < 50: # Need enough data for calculations
             return []

        # Helper to safely extract scalar
        def get_scalar(val):
            if val is None: return None
            try:
                if hasattr(val, "item"): 
                    return val.item()
                if isinstance(val, (pd.Series, np.ndarray, list)):
                    if len(val) == 1: return val[0]
                    # If multiple, likely duplication issue, take last or first?
                    # For safety, take last
                    if len(val) > 0: return val[-1]
                return val
            except:
                return None

        # --- 1. Momentum ---
        # RSI (14)
        rsi = df.ta.rsi(length=14)
        current_rsi = get_scalar(rsi.iloc[-1]) if rsi is not None and not rsi.empty else None

        # Stochastic (14, 3, 3)
        stoch = df.ta.stoch(k=14, d=3, smooth_k=3) # Returns STOCHk, STOCHd
        current_stoch_k = get_scalar(stoch['STOCHk_14_3_3'].iloc[-1]) if stoch is not None and not stoch.empty and 'STOCHk_14_3_3' in stoch.columns else None
        
        # CCI (20)
        cci = df.ta.cci(length=20)
        current_cci = get_scalar(cci.iloc[-1]) if cci is not None and not cci.empty else None
        
        # Williams %R (14)
        willr = df.ta.willr(length=14)
        current_willr = get_scalar(willr.iloc[-1]) if willr is not None and not willr.empty else None

        # ROC (12)
        roc = df.ta.roc(length=12)
        current_roc = get_scalar(roc.iloc[-1]) if roc is not None and not roc.empty else None
        
        # Ultimate Oscillator
        uo = df.ta.uo()
        current_uo = get_scalar(uo.iloc[-1]) if uo is not None and not uo.empty else None


        # --- 2. Trend ---
        # MACD (12, 26, 9)
        macd = df.ta.macd(fast=12, slow=26, signal=9)
        current_macd = get_scalar(macd['MACD_12_26_9'].iloc[-1]) if macd is not None and not macd.empty and 'MACD_12_26_9' in macd.columns else None

        # ADX (14)
        adx = df.ta.adx(length=14)
        current_adx = get_scalar(adx['ADX_14'].iloc[-1]) if adx is not None and not adx.empty and 'ADX_14' in adx.columns else None

        # SMAs
        sma_20 = df.ta.sma(length=20)
        current_sma_20 = get_scalar(sma_20.iloc[-1]) if sma_20 is not None and not sma_20.empty else None

        sma_50 = df.ta.sma(length=50)
        current_sma_50 = get_scalar(sma_50.iloc[-1]) if sma_50 is not None and not sma_50.empty else None

        sma_200 = df.ta.sma(length=200)
        current_sma_200 = get_scalar(sma_200.iloc[-1]) if sma_200 is not None and not sma_200.empty else None
        
        # EMAs
        ema_12 = df.ta.ema(length=12)
        current_ema_12 = get_scalar(ema_12.iloc[-1]) if ema_12 is not None and not ema_12.empty else None
        
        ema_26 = df.ta.ema(length=26)
        current_ema_26 = get_scalar(ema_26.iloc[-1]) if ema_26 is not None and not ema_26.empty else None
        
        ema_50 = df.ta.ema(length=50)
        current_ema_50 = get_scalar(ema_50.iloc[-1]) if ema_50 is not None and not ema_50.empty else None
        
        ema_200 = df.ta.ema(length=200)
        current_ema_200 = get_scalar(ema_200.iloc[-1]) if ema_200 is not None and not ema_200.empty else None
        
        # Parabolic SAR (0.02, 0.2)
        psar = df.ta.psar() 
        current_psar = None
        if psar is not None and not psar.empty:
            vals = psar.iloc[-1]
            p_l = get_scalar(vals.get('PSARl_0.02_0.2'))
            p_s = get_scalar(vals.get('PSARs_0.02_0.2'))
            if p_l is not None and not pd.isna(p_l):
                current_psar = p_l
            elif p_s is not None and not pd.isna(p_s):
                current_psar = p_s
                
        # Aroon (14)
        aroon = df.ta.aroon(length=14)
        current_aroon_u = get_scalar(aroon['AROONU_14'].iloc[-1]) if aroon is not None and not aroon.empty and 'AROONU_14' in aroon.columns else None
        current_aroon_d = get_scalar(aroon['AROOND_14'].iloc[-1]) if aroon is not None and not aroon.empty and 'AROOND_14' in aroon.columns else None
        
        # Ichimoku (9, 26, 52)
        ichimoku = df.ta.ichimoku()
        current_ichimoku_base = None
        current_ichimoku_conv = None
        # Explicitly check for tuple and not empty
        if ichimoku is not None and isinstance(ichimoku, tuple) and len(ichimoku) > 0:
            ichi_df = ichimoku[0]
            if ichi_df is not None and not ichi_df.empty:
                current_ichimoku_conv = get_scalar(ichi_df['ITS_9'].iloc[-1]) if 'ITS_9' in ichi_df.columns else None
                current_ichimoku_base = get_scalar(ichi_df['IKS_26'].iloc[-1]) if 'IKS_26' in ichi_df.columns else None


        # --- 3. Volatility ---
        # Bollinger Bands (20, 2)
        bb = df.ta.bbands(length=20, std=2)
        current_bb_p = get_scalar(bb['BBP_20_2.0'].iloc[-1]) if bb is not None and not bb.empty and 'BBP_20_2.0' in bb.columns else None
        
        # ATR (14)
        atr = df.ta.atr(length=14)
        current_atr = get_scalar(atr.iloc[-1]) if atr is not None and not atr.empty else None
        
        # Keltner Channels (20, 2)
        kc = df.ta.kc() 
        current_kc_u = None
        current_kc_l = None
        if kc is not None and not kc.empty:
             cols = kc.columns
             kcu = [c for c in cols if c.startswith('KCU')]
             kcl = [c for c in cols if c.startswith('KCL')]
             if kcu and kcl:
                 current_kc_u = get_scalar(kc[kcu[0]].iloc[-1])
                 current_kc_l = get_scalar(kc[kcl[0]].iloc[-1])

        # Donchian Channels (20)
        dc = df.ta.donchian(length=20)
        current_dc_u = None
        current_dc_l = None
        if dc is not None and not dc.empty:
             u_col = 'DCU_20_20'
             l_col = 'DCL_20_20'
             if u_col in dc.columns:
                 current_dc_u = get_scalar(dc[u_col].iloc[-1])
                 current_dc_l = get_scalar(dc[l_col].iloc[-1])


        # --- 4. Volume ---
        # MFI (14)
        mfi = df.ta.mfi(length=14)
        current_mfi = get_scalar(mfi.iloc[-1]) if mfi is not None and not mfi.empty else None
        
        # OBV
        obv = df.ta.obv()
        current_obv = get_scalar(obv.iloc[-1]) if obv is not None and not obv.empty else None
        
        # CMF (20)
        cmf = df.ta.cmf(length=20)
        current_cmf = get_scalar(cmf.iloc[-1]) if cmf is not None and not cmf.empty else None


        # --- 5. Support & Resistance ---
        # Rolling Yearly Pivots (as requested: "Always consider a year of data")
        current_p, current_r1, current_s1, current_r2, current_s2, current_r3, current_s3 = None, None, None, None, None, None, None
        
        if len(df) >= 1:
            # Use strict 3-month window (90 calendar days) as requested
            last_date = df.index[-1]
            start_date = last_date - pd.Timedelta(days=90)
            window = df[df.index > start_date]
            
            if not window.empty:
                year_high = window['high'].max()
                year_low = window['low'].min()
                year_close = window['close'].iloc[-1]
                
                # Pivot Point Calculation (Classic) based on 1-year range
                # P = (H + L + C) / 3
                p = (year_high + year_low + year_close) / 3
                
                # R1 = 2*P - L
                r1 = (2 * p) - year_low
                
                # S1 = 2*P - H
                s1 = (2 * p) - year_high
                
                # R2 = P + (H - L)
                r2 = p + (year_high - year_low)
                
                # S2 = P - (H - L)
                s2 = p - (year_high - year_low)
    
                # R3 = P + 2*(H - L)
                r3 = p + 2 * (year_high - year_low)
                
                # S3 = P - 2*(H - L)
                s3 = p - 2 * (year_high - year_low)
                
                current_p = p
                current_r1 = r1
                current_s1 = s1
                current_r2 = r2
                current_s2 = s2
                current_r3 = r3
                current_s3 = s3


        indicators = []

        # Helper to add
        def add_ind(category, name, value, raw_val=None, suffix=""):
            if raw_val is None: raw_val = value 
            
            # Use get_scalar just in case
            if raw_val is not None:
                raw_val = get_scalar(raw_val)

            # Format value
            display_val = "-"
            # Explicit check for None and then safe isnan
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

        # --- Populate ---
        
        # Momentum
        add_ind('Momentum', 'RSI (14)', current_rsi, current_rsi)
        add_ind('Momentum', 'Stochastic %K', current_stoch_k, current_stoch_k)
        add_ind('Momentum', 'CCI (20)', current_cci, current_cci)
        add_ind('Momentum', 'Williams %R', current_willr, current_willr)
        add_ind('Momentum', 'ROC (12)', current_roc, current_roc, "%")
        add_ind('Momentum', 'Ultimate Osc.', current_uo, current_uo)

        # Trend
        add_ind('Trend', 'MACD (12,26,9)', current_macd, current_macd) 
        add_ind('Trend', 'ADX (14)', current_adx, current_adx)
        # Safe format for multiple values
        aroon_display = f"{current_aroon_u:.0f} / {current_aroon_d:.0f}" if (current_aroon_u is not None and current_aroon_d is not None) else "-"
        add_ind('Trend', 'Aroon Up/Down', aroon_display, current_aroon_u)
        
        ichi_display = f"{current_ichimoku_base:.1f} / {current_ichimoku_conv:.1f}" if (current_ichimoku_base is not None and current_ichimoku_conv is not None) else "-"
        add_ind('Trend', 'Ichimoku (Base/Conv)', ichi_display, current_ichimoku_base)
        
        add_ind('Trend', 'PSAR', current_psar, current_psar)
        
        add_ind('Trend', '20-Day SMA', current_sma_20, current_sma_20)
        add_ind('Trend', '50-Day SMA', current_sma_50, current_sma_50)
        add_ind('Trend', '200-Day SMA', current_sma_200, current_sma_200)
        add_ind('Trend', '12-Day EMA', current_ema_12, current_ema_12)
        add_ind('Trend', '26-Day EMA', current_ema_26, current_ema_26)
        add_ind('Trend', '50-Day EMA', current_ema_50, current_ema_50)
        add_ind('Trend', '200-Day EMA', current_ema_200, current_ema_200)

        # Volatility
        add_ind('Volatility', 'Bollinger %B', current_bb_p, current_bb_p)
        add_ind('Volatility', 'ATR (14)', current_atr, current_atr)
        
        if current_kc_u is not None:
             kc_disp = f"{current_kc_u:.1f} / {current_kc_l:.1f}" if current_kc_l is not None else f"{current_kc_u:.1f}"
             add_ind('Volatility', 'Keltner Channels', kc_disp, current_kc_u)
        if current_dc_u is not None:
             dc_disp = f"{current_dc_u:.1f} / {current_dc_l:.1f}" if current_dc_l is not None else f"{current_dc_u:.1f}"
             add_ind('Volatility', 'Donchian Channels', dc_disp, current_dc_u)

        # Volume
        add_ind('Volume', 'MFI (14)', current_mfi, current_mfi)
        add_ind('Volume', 'OBV', current_obv, current_obv)
        add_ind('Volume', 'CMF (20)', current_cmf, current_cmf)

        # Support & Resistance
        if current_p is not None:
            add_ind('Support & Resistance', 'Pivot (P)', current_p, current_p)
            add_ind('Support & Resistance', 'Resistance 1 (R1)', current_r1, current_r1)
            add_ind('Support & Resistance', 'Support 1 (S1)', current_s1, current_s1)
            add_ind('Support & Resistance', 'Resistance 2 (R2)', current_r2, current_r2)
            add_ind('Support & Resistance', 'Support 2 (S2)', current_s2, current_s2)
            add_ind('Support & Resistance', 'Resistance 3 (R3)', current_r3, current_r3)
            add_ind('Support & Resistance', 'Support 3 (S3)', current_s3, current_s3)

        return indicators

    except Exception as e:
        import traceback
        traceback.print_exc() # Print full stack trace for debugging
        print(f"Error calculating indicators for {ticker}: {e}")
        return []
