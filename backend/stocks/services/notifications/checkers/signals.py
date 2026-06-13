from __future__ import annotations
from datetime import date
from ..base import Alert, IAlertChecker
from ...notification_service import SEVERITY_MAP
from ....models import PortfolioItem, WatchlistItem, Notification, DailyStockPrice
from django.contrib.auth.models import User


class SignalsChecker:
    """Checks today's BUY/SELL strategy signals for portfolio and watchlist tickers."""

    def check(self, user: User) -> list[Alert]:
        tickers = self._user_tickers(user)
        if not tickers:
            return []
        groups = self._group_signals(tickers)
        return self._build_alerts(groups)

    def _user_tickers(self, user) -> set[str]:
        portfolio = set(PortfolioItem.objects.filter(user=user).values_list('ticker', flat=True))
        watchlist = set(WatchlistItem.objects.filter(user=user).values_list('ticker', flat=True))
        return portfolio | watchlist

    def _group_signals(self, tickers: set) -> dict:
        from ....models import SignalEpisode
        today = date.today()
        groups: dict[str, list] = {}
        signals = SignalEpisode.objects.filter(
            symbol__in=tickers, start_date=today, direction__in=['BUY', 'SELL']
        ).select_related('strategy')
        for sig in signals:
            key = f"{sig.symbol}_{sig.direction}"
            groups.setdefault(key, []).append(sig)
        return groups

    def _fetch_price(self, ticker: str) -> float | None:
        row = DailyStockPrice.objects.filter(ticker=ticker).order_by('-date').values('close').first()
        return float(row['close']) if row else None

    def _day_change(self, ticker: str) -> float | None:
        row = DailyStockPrice.objects.filter(ticker=ticker).order_by('-date').values('diff_percent').first()
        return float(row['diff_percent']) if row and row['diff_percent'] is not None else None

    def _build_alerts(self, groups: dict) -> list[Alert]:
        alerts = []
        today = date.today()
        for key, sig_list in groups.items():
            symbol, signal_type = key.split('_')
            alert = self._alert_for_group(symbol, signal_type, sig_list, today)
            if alert:
                alerts.append(alert)
        return alerts

    def _alert_for_group(self, symbol: str, signal_type: str, sig_list: list, today: date) -> Alert | None:
        count = len(sig_list)
        n = Notification.NotificationType
        if signal_type == 'BUY':
            n_type = n.SIGNAL_STRONG_BUY if count >= 3 else n.SIGNAL_BUY
            title = f"{symbol} - {'Strong ' if count >= 3 else ''}Buy Signal"
            message = f"{count} {'strategies are' if count > 1 else 'strategy is'} signaling BUY for {symbol}."
        else:
            n_type = n.SIGNAL_STRONG_SELL if count >= 3 else n.SIGNAL_SELL
            title = f"{symbol} - {'Strong ' if count >= 3 else ''}Sell Signal"
            message = f"{count} {'strategies are' if count > 1 else 'strategy is'} signaling SELL for {symbol}."
        strategy_names = [s.strategy.name for s in sig_list if s.strategy]
        return Alert(
            notification_type=n_type,
            title=title,
            message=message,
            ticker=symbol,
            redirect_url=f'/signals?ticker={symbol}',
            metadata={
                'signal_count': count, 'signal_type': signal_type, 'strategies': strategy_names,
                'date': str(today), 'price': self._fetch_price(symbol),
                'change_pct': self._day_change(symbol), 'symbol': symbol,
            },
            severity=SEVERITY_MAP.get(str(n_type), 'normal'),
        )
