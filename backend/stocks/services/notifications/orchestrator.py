from __future__ import annotations
import logging
from .base import Alert, IAlertChecker
from django.contrib.auth.models import User

logger = logging.getLogger(__name__)


class NotificationOrchestrator:
    """Iterates registered checkers and persists any Alerts they produce."""

    def __init__(self, checkers: list[IAlertChecker]):
        self._checkers = checkers

    def run(self, user: User) -> int:
        total = 0
        for checker in self._checkers:
            total += self._run_one(checker, user)
        return total

    def _run_one(self, checker: IAlertChecker, user: User) -> int:
        try:
            alerts = checker.check(user)
            return sum(1 for a in alerts if self._persist(a, user))
        except Exception as exc:
            logger.error("%s failed for %s: %s", checker.__class__.__name__, user, exc)
            return 0

    def _persist(self, alert: Alert, user: User) -> bool:
        from ..notification_service import create_notification
        result = create_notification(
            user=user,
            notification_type=alert.notification_type,
            title=alert.title,
            message=alert.message,
            ticker=alert.ticker,
            redirect_url=alert.redirect_url,
            portfolio_item_id=alert.portfolio_item_id,
            watchlist_item_id=alert.watchlist_item_id,
            metadata=alert.metadata,
            severity=alert.severity,
        )
        return result is not None
