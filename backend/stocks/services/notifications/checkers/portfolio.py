from __future__ import annotations
from ..base import Alert, IAlertChecker
from ...notification_service import get_latest_price
from ....models import PortfolioItem, Notification
from django.contrib.auth.models import User


class PortfolioChecker:
    """Checks portfolio items for stop-loss, target, WACC, and gain/loss alerts."""

    def check(self, user: User) -> list[Alert]:
        hits = self._collect_hits(user)
        return self._build_alerts(hits)

    def _collect_hits(self, user: User) -> dict:
        hits = {t: [] for t in [
            Notification.NotificationType.STOP_LOSS_HIT,
            Notification.NotificationType.TARGET_REACHED,
            Notification.NotificationType.BELOW_WACC,
            Notification.NotificationType.SIGNIFICANT_GAIN,
            Notification.NotificationType.SIGNIFICANT_LOSS,
        ]}
        for item in PortfolioItem.objects.filter(user=user):
            price = get_latest_price(item.ticker)
            if not price:
                continue
            self._classify_item(item, price, hits)
        return hits

    def _classify_item(self, item, price: float, hits: dict) -> None:
        wacc = float(item.wacc) if item.wacc else float(item.buy_price)
        change_pct = ((price - wacc) / wacc * 100) if wacc > 0 else 0
        n = Notification.NotificationType

        if item.stop_loss_price and price <= float(item.stop_loss_price):
            hits[n.STOP_LOSS_HIT].append(item)
        if self._any_target_hit(item, price):
            hits[n.TARGET_REACHED].append(item)
        if price < wacc:
            hits[n.BELOW_WACC].append(item)
        if change_pct >= 10.0:
            hits[n.SIGNIFICANT_GAIN].append(item)
        elif change_pct <= -10.0:
            hits[n.SIGNIFICANT_LOSS].append(item)

    def _any_target_hit(self, item, price: float) -> bool:
        return any(
            tp and price >= float(tp)
            for tp in (item.target_price, item.target_price_2, item.target_price_3)
        )

    def _build_alerts(self, hits: dict) -> list[Alert]:
        alerts = []
        for n_type, items in hits.items():
            if not items:
                continue
            alert = self._single_alert(n_type, items[0]) if len(items) == 1 \
                else self._aggregate_alert(n_type, items)
            if alert:
                alerts.append(alert)
        return alerts

    def _single_alert(self, n_type, item) -> Alert | None:
        price = get_latest_price(item.ticker)
        if not price:
            return None
        wacc = float(item.wacc) if item.wacc else float(item.buy_price)
        change_pct = ((price - wacc) / wacc * 100) if wacc > 0 else 0
        title, message = self._label_for_type(n_type, item.ticker, price, wacc)
        return Alert(
            notification_type=n_type,
            title=title,
            message=message,
            ticker=item.ticker,
            redirect_url='/portfolio?tab=holdings',
            portfolio_item_id=item.id,
            metadata={'price': price, 'wacc': wacc, 'change_pct': change_pct},
        )

    def _aggregate_alert(self, n_type, items) -> Alert:
        symbols = [i.ticker for i in items]
        label = str(n_type).lower().replace('_', ' ').title()
        return Alert(
            notification_type=n_type,
            title=f"{len(items)} Assets: {label}",
            message=(f"{len(items)} assets ({', '.join(symbols[:2])}"
                     f"{'...' if len(symbols) > 2 else ''}) triggered {label}."),
            ticker='SUMMARY',
            redirect_url='/portfolio?tab=holdings',
            metadata={'symbols': symbols, 'count': len(items)},
        )

    def _label_for_type(self, n_type, ticker: str, price: float, wacc: float):
        n = Notification.NotificationType
        labels = {
            n.STOP_LOSS_HIT: (f"{ticker} Stop-Loss Hit",
                              f"{ticker} hit your stop-loss at Rs. {price:.2f}."),
            n.TARGET_REACHED: (f"{ticker} Target Reached",
                               f"{ticker} reached your profit target at Rs. {price:.2f}."),
            n.BELOW_WACC: (f"{ticker} Below Cost",
                           f"{ticker} dropped below your average cost of Rs. {wacc:.2f}."),
            n.SIGNIFICANT_GAIN: (f"{ticker} Up 10%+",
                                 f"{ticker} gained over 10% from your cost price."),
            n.SIGNIFICANT_LOSS: (f"{ticker} Down 10%+",
                                 f"{ticker} dropped over 10% from your cost price."),
        }
        return labels.get(n_type, (ticker, ''))
