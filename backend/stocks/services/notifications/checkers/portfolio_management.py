from __future__ import annotations
from ..base import Alert, IAlertChecker
from ...notification_service import SEVERITY_MAP
from ....models import PortfolioItem, Notification, DailyStockPrice
from django.contrib.auth.models import User


class PortfolioManagementChecker:
    """Checks for portfolio concentration (> 40%) and take-profit opportunities (> 30% gain)."""

    def check(self, user: User) -> list[Alert]:
        items = list(PortfolioItem.objects.filter(user=user, quantity__gt=0))
        if not items:
            return []
        total_value = self._total_value(items)
        if total_value == 0:
            return []
        return self._build_alerts(items, total_value)

    def _total_value(self, items: list) -> float:
        return sum(
            item.quantity * (float(item.wacc) if item.wacc else float(item.buy_price))
            for item in items if (item.wacc or item.buy_price)
        )

    def _fetch_price(self, ticker: str) -> float | None:
        row = DailyStockPrice.objects.filter(ticker=ticker).order_by('-date').values('close').first()
        return float(row['close']) if row else None

    def _build_alerts(self, items: list, total_value: float) -> list[Alert]:
        alerts: list[Alert] = []
        for item in items:
            wacc_val = float(item.wacc) if item.wacc else float(item.buy_price)
            curr_price = self._fetch_price(item.ticker)
            weight = (item.quantity * wacc_val) / total_value
            if weight > 0.40:
                alerts.append(self._concentration_alert(item, weight, curr_price))
            if curr_price:
                profit_pct = ((curr_price - wacc_val) / wacc_val) * 100
                if profit_pct > 30:
                    alerts.append(self._take_profit_alert(item, profit_pct, curr_price))
        return alerts

    def _concentration_alert(self, item, weight: float, curr_price: float | None) -> Alert:
        n_type = Notification.NotificationType.PORTFOLIO_DIVERSITY
        return Alert(
            notification_type=n_type,
            title="Concentration Warning",
            message=(f"{item.ticker} now makes up {weight * 100:.1f}% of your portfolio. "
                     f"Consider diversifying."),
            ticker=item.ticker,
            redirect_url="/portfolio",
            metadata={'weight': weight, 'symbol': item.ticker, 'price': curr_price},
            severity=SEVERITY_MAP.get(str(n_type), 'normal'),
        )

    def _take_profit_alert(self, item, profit_pct: float, curr_price: float) -> Alert:
        n_type = Notification.NotificationType.TAKE_PROFIT
        return Alert(
            notification_type=n_type,
            title=f"Profit Rocket: {item.ticker}",
            message=(f"You are up {profit_pct:.1f}% on {item.ticker}. "
                     f"Consider locking in some profits!"),
            ticker=item.ticker,
            redirect_url="/portfolio",
            metadata={
                'profit_percent': profit_pct, 'change_pct': profit_pct,
                'symbol': item.ticker, 'price': curr_price,
            },
            severity=SEVERITY_MAP.get(str(n_type), 'normal'),
        )
