from __future__ import annotations
from datetime import date, timedelta
from ..base import Alert, IAlertChecker
from ...notification_service import SEVERITY_MAP
from ....models import Notification, DailyStockPrice, DailyCumulativeAccumulation
from django.contrib.auth.models import User


class BrokerDiscoveryChecker:
    """Alerts when a top broker (id ≤ 60) enters a fresh large position (≥ 20k units)."""

    def check(self, user: User) -> list[Alert]:
        today = date.today()
        return self._build_alerts(today)

    def _fetch_price(self, ticker: str) -> float | None:
        row = DailyStockPrice.objects.filter(ticker=ticker).order_by('-date').values('close').first()
        return float(row['close']) if row else None

    def _is_top_broker(self, entity_id: str) -> bool:
        try:
            return int(entity_id) <= 60
        except (ValueError, TypeError):
            return False

    def _is_fresh_entry(self, acc) -> bool:
        return not DailyCumulativeAccumulation.objects.filter(
            symbol=acc.symbol, entity_id=acc.entity_id,
            transaction_date__lt=acc.transaction_date, cumulative_net__gt=0,
        ).exists()

    def _build_alerts(self, today: date) -> list[Alert]:
        alerts = []
        n_type = Notification.NotificationType.WHALE_ENTRY
        recent_acc = DailyCumulativeAccumulation.objects.filter(
            transaction_date=today,
            cumulative_net__gt=20000,
        ).exclude(entity_id__in=['OTHERS'])
        for acc in recent_acc:
            if not self._is_top_broker(acc.entity_id):
                continue
            if not self._is_fresh_entry(acc):
                continue
            alerts.append(Alert(
                notification_type=n_type,
                title=f"Whale Entry: {acc.symbol}",
                message=(f"Broker {acc.entity_id} has entered a fresh position in {acc.symbol} "
                         f"with {acc.cumulative_net:,} units."),
                ticker=acc.symbol,
                redirect_url=f"/accumulation/trends?search={acc.symbol}",
                metadata={
                    'price': self._fetch_price(acc.symbol),
                    'broker': acc.entity_id,
                    'units': acc.cumulative_net,
                    'symbol': acc.symbol,
                },
                severity=SEVERITY_MAP.get(str(n_type), 'normal'),
            ))
        return alerts
