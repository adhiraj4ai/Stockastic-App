from __future__ import annotations
from ..base import Alert, IAlertChecker
from ...notification_service import SEVERITY_MAP
from ....models import WatchlistItem, Notification, DailyTradingPlan, DailyStockPrice
from django.contrib.auth.models import User


class ZoneEntryChecker:
    """Notifies when an alert-enabled watchlist symbol is IN_ZONE per the latest daily plan."""

    def check(self, user: User) -> list[Alert]:
        plan, statuses = self._load_plan()
        if not statuses:
            return []
        return self._build_alerts(user, plan, statuses)

    def _load_plan(self):
        plan = DailyTradingPlan.objects.order_by('-date').first()
        statuses = (plan.payload.get('entry_statuses') or {}) if plan else {}
        return plan, statuses

    def _fetch_price(self, ticker: str) -> float | None:
        row = DailyStockPrice.objects.filter(ticker=ticker).order_by('-date').values('close').first()
        return float(row['close']) if row else None

    def _build_alerts(self, user, plan, statuses: dict) -> list[Alert]:
        alerts = []
        items = WatchlistItem.objects.filter(user=user, alert_enabled=True)
        n_type = Notification.NotificationType.WATCHLIST_ENTRY
        for item in items:
            if statuses.get(item.ticker) != 'IN_ZONE':
                continue
            alerts.append(Alert(
                notification_type=n_type,
                title=f"{item.ticker} is in its entry zone",
                message=(
                    f"{item.ticker} closed inside its canonical entry zone "
                    f"(ATR-based) per the latest plan ({plan.payload.get('as_of')})."
                ),
                ticker=item.ticker,
                redirect_url=f'/ticker/{item.ticker}',
                watchlist_item_id=item.id,
                metadata={
                    'price': self._fetch_price(item.ticker),
                    'symbol': item.ticker,
                    'plan_date': plan.payload.get('as_of'),
                },
                severity=SEVERITY_MAP.get(str(n_type), 'normal'),
            ))
        return alerts
