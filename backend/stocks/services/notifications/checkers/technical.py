from __future__ import annotations
from datetime import date, timedelta
from ..base import Alert, IAlertChecker
from ...notification_service import SEVERITY_MAP
from ....models import PortfolioItem, WatchlistItem, Notification, DailyStockPrice
from django.contrib.auth.models import User


class TechnicalChecker:
    """Checks for Volume Spikes, RSI extremes, and MA crossovers for portfolio/watchlist."""

    def check(self, user: User) -> list[Alert]:
        symbols = self._user_symbols(user)
        if not symbols:
            return []
        return self._analyse(symbols)

    def _user_symbols(self, user) -> list[str]:
        p = set(PortfolioItem.objects.filter(user=user).values_list('ticker', flat=True))
        w = set(WatchlistItem.objects.filter(user=user).values_list('ticker', flat=True))
        return list(p | w)

    def _analyse(self, symbols: list) -> list[Alert]:
        import pandas as pd
        import talib
        import numpy as np
        lookback = date.today() - timedelta(days=300)
        price_data = list(DailyStockPrice.objects.filter(
            ticker__in=symbols, date__gte=lookback
        ).order_by('ticker', 'date').values('ticker', 'date', 'close', 'volume'))
        if not price_data:
            return []
        df_all = pd.DataFrame(price_data)
        alerts: list[Alert] = []
        for symbol in symbols:
            df = df_all[df_all['ticker'] == symbol].copy()
            if len(df) < 50:
                continue
            alerts.extend(self._alerts_for_symbol(symbol, df, talib, np))
        return alerts

    def _alerts_for_symbol(self, symbol: str, df, talib, np) -> list[Alert]:
        import pandas as pd
        df['date'] = pd.to_datetime(df['date'])
        df = df.set_index('date')
        close_vals = df['close'].values.astype(float)
        rsi = talib.RSI(close_vals, timeperiod=14)
        sma_50 = talib.SMA(close_vals, timeperiod=50)
        sma_200 = talib.SMA(close_vals, timeperiod=200)
        avg_vol_20 = df['volume'].rolling(window=20).mean()
        latest_rsi = rsi[-1] if not np.isnan(rsi[-1]) else 50
        latest_vol = df['volume'].iloc[-1]
        latest_avg_vol = avg_vol_20.iloc[-1] or 0
        latest_close = float(df['close'].iloc[-1])
        prev_close = float(df['close'].iloc[-2]) if len(df) >= 2 else None
        day_change_pct = ((latest_close - prev_close) / prev_close * 100) if prev_close else None
        return self._classify(symbol, latest_close, latest_vol, latest_avg_vol,
                               latest_rsi, sma_50, sma_200, day_change_pct, df)

    def _classify(self, symbol, close, vol, avg_vol, rsi, sma_50, sma_200,
                  day_change_pct, df) -> list[Alert]:
        alerts = []
        n = Notification.NotificationType
        meta_base = {'price': close, 'change_pct': day_change_pct, 'symbol': symbol}
        if vol > (avg_vol * 3) and avg_vol > 0:
            alerts.append(self._make(n.VOLUME_SPIKE, symbol,
                f"{symbol} - Volume Spike",
                f"Unusual volume detected: {vol:,} which is {vol/avg_vol:.1f}x the 20-day average.",
                {**meta_base, 'vol_multiplier': vol / avg_vol}))
        if rsi < 30:
            alerts.append(self._make(n.RSI_OVERSOLD, symbol,
                f"{symbol} - RSI Oversold",
                f"{symbol} is currently oversold with an RSI of {rsi:.1f}. Potential reversal area.",
                {**meta_base, 'rsi': rsi}))
        if rsi > 70:
            alerts.append(self._make(n.RSI_OVERBOUGHT, symbol,
                f"{symbol} - RSI Overbought",
                f"{symbol} is currently overbought with an RSI of {rsi:.1f}. Caution recommended.",
                {**meta_base, 'rsi': rsi}))
        if len(df) > 200 and sma_50[-2] <= sma_200[-2] and sma_50[-1] > sma_200[-1]:
            alerts.append(self._make(n.GOLDEN_CROSS, symbol,
                f"{symbol} - Golden Cross",
                f"Bullish 50-day SMA crossed above 200-day SMA for {symbol}.",
                meta_base))
        return alerts

    def _make(self, n_type, ticker, title, message, metadata) -> Alert:
        return Alert(
            notification_type=n_type, title=title, message=message,
            ticker=ticker, redirect_url=f'/ticker/{ticker}',
            metadata=metadata, severity=SEVERITY_MAP.get(str(n_type), 'normal'),
        )
