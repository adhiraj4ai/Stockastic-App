from __future__ import annotations
from ..base import Alert, IAlertChecker
from ...notification_service import SEVERITY_MAP
from ....models import WatchlistItem, Notification, DailyStockPrice
from django.contrib.auth.models import User


class WatchlistChecker:
    """Checks alert-enabled watchlist items for target price and stop-loss hits."""

    def check(self, user: User) -> list[Alert]:
        hits = self._collect_hits(user)
        return self._build_alerts(hits)

    def _collect_hits(self, user: User) -> dict:
        n = Notification.NotificationType
        hits = {n.TARGET_REACHED: [], n.STOP_LOSS_HIT: []}
        for item in WatchlistItem.objects.filter(user=user, alert_enabled=True):
            price = self._fetch_price(item.ticker)
            if not price:
                continue
            if item.target_price and price >= float(item.target_price):
                hits[n.TARGET_REACHED].append((item, price))
            if item.stop_loss_price and price <= float(item.stop_loss_price):
                hits[n.STOP_LOSS_HIT].append((item, price))
        return hits

    def _fetch_price(self, ticker: str) -> float | None:
        row = DailyStockPrice.objects.filter(ticker=ticker).order_by('-date').values('close').first()
        return float(row['close']) if row else None

    def _build_alerts(self, hits: dict) -> list[Alert]:
        alerts = []
        for n_type, item_prices in hits.items():
            if not item_prices:
                continue
            alert = self._single_alert(n_type, *item_prices[0]) if len(item_prices) == 1 \
                else self._aggregate_alert(n_type, item_prices)
            if alert:
                alerts.append(alert)
        return alerts

    def _single_alert(self, n_type, item, price: float) -> Alert | None:
        n = Notification.NotificationType
        title = f"{item.ticker} Target Reached" if n_type == n.TARGET_REACHED \
            else f"{item.ticker} Below Stop Price"
        return Alert(
            notification_type=n_type,
            title=title,
            message=f"{item.ticker} is at Rs. {price:.2f}, hitting your watchlist alert.",
            ticker=item.ticker,
            redirect_url=f'/ticker/{item.ticker}',
            watchlist_item_id=item.id,
            metadata={'price': price, 'symbol': item.ticker},
            severity=self._severity_for(n_type),
        )

    def _aggregate_alert(self, n_type, item_prices: list) -> Alert:
        symbols = [item.ticker for item, _ in item_prices]
        label = n_type.label
        return Alert(
            notification_type=n_type,
            title=f"{len(item_prices)} Watchlist: {label}",
            message=(f"{len(item_prices)} watchlist items ({', '.join(symbols[:2])}"
                     f"{'...' if len(symbols) > 2 else ''}) hit their alert levels."),
            ticker='SUMMARY',
            redirect_url='/watchlist',
            metadata={'symbols': symbols, 'count': len(item_prices)},
            severity=self._severity_for(n_type),
        )

    def _severity_for(self, n_type) -> str:
        return SEVERITY_MAP.get(str(n_type), 'normal')
