from __future__ import annotations
from ..base import Alert, IAlertChecker
from ...notification_service import SEVERITY_MAP
from ....models import PortfolioItem, Notification, DailyStockPrice
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
            price = self._fetch_price(item.ticker)
            if not price:
                continue
            self._classify_item(item, price, hits)
        return hits

    def _fetch_price(self, ticker: str) -> float | None:
        row = DailyStockPrice.objects.filter(ticker=ticker).order_by('-date').values('close').first()
        return float(row['close']) if row else None

    def _classify_item(self, item, price: float, hits: dict) -> None:
        wacc = float(item.wacc) if item.wacc else float(item.buy_price)
        change_pct = ((price - wacc) / wacc * 100) if wacc > 0 else 0
        n = Notification.NotificationType

        if item.stop_loss_price and price <= float(item.stop_loss_price):
            hits[n.STOP_LOSS_HIT].append((item, price))
        if self._any_target_hit(item, price):
            hits[n.TARGET_REACHED].append((item, price))
        if price < wacc:
            hits[n.BELOW_WACC].append((item, price))
        if change_pct >= 10.0:
            hits[n.SIGNIFICANT_GAIN].append((item, price))
        elif change_pct <= -10.0:
            hits[n.SIGNIFICANT_LOSS].append((item, price))

    @staticmethod
    def _any_target_hit(item, price: float) -> bool:
        return any(
            tp and price >= float(tp)
            for tp in (item.target_price, item.target_price_2, item.target_price_3)
        )

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
            severity=self._severity_for(n_type),
        )

    def _aggregate_alert(self, n_type, item_prices: list) -> Alert:
        symbols = [item.ticker for item, _ in item_prices]
        label = n_type.label
        return Alert(
            notification_type=n_type,
            title=f"{len(item_prices)} Assets: {label}",
            message=(f"{len(item_prices)} assets ({', '.join(symbols[:2])}"
                     f"{'...' if len(symbols) > 2 else ''}) triggered {label}."),
            ticker='SUMMARY',
            redirect_url='/portfolio?tab=holdings',
            metadata={'symbols': symbols, 'count': len(item_prices)},
            severity=self._severity_for(n_type),
        )

    def _severity_for(self, n_type) -> str:
        return SEVERITY_MAP.get(str(n_type), 'normal')

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
