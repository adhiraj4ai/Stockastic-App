from ..models import Notification, DailyStockPrice

# Display priority per notification type. Anything not listed is NORMAL.
# critical/high pop up in the UI; low never pops (bell badge only).
SEVERITY_MAP = {
    'STOP_LOSS_HIT': 'critical',
    'TARGET_REACHED': 'high',
    'TAKE_PROFIT': 'high',
    'SIGNIFICANT_GAIN': 'high',
    'SIGNIFICANT_LOSS': 'high',
    'SIGNAL_STRONG_BUY': 'high',
    'SIGNAL_STRONG_SELL': 'high',
    'WATCHLIST_ENTRY': 'high',
    'WATCHLIST_BREAKOUT': 'high',
    'DAILY_PLAN_READY': 'high',
    'WHALE_ENTRY': 'high',
    'PRICE_ALERT': 'high',
    'PORTFOLIO_DIVERSITY': 'low',
    'BELOW_WACC': 'low',
}


def _find_existing_unread(user, notification_type, ticker):
    """Return the first unread notification matching type+ticker, or None."""
    return Notification.objects.filter(
        user=user, type=notification_type, ticker=ticker, read=False
    ).first()


def _re_alert(existing, title, message, severity, metadata):
    """Update an existing unread notification to re-alert (move to top)."""
    from django.utils import timezone
    existing.title = title
    existing.message = message
    existing.created_at = timezone.now()
    existing.severity = severity
    if metadata:
        existing.metadata = metadata
    existing.save()
    return existing


def _is_recent_duplicate(user, notification_type, ticker):
    """Return True if a notification of the same type+ticker was created in the last hour."""
    from django.utils import timezone
    from datetime import timedelta
    one_hour_ago = timezone.now() - timedelta(hours=1)
    return Notification.objects.filter(
        user=user, type=notification_type, ticker=ticker, created_at__gte=one_hour_ago
    ).exists()


def create_notification(user, notification_type, title, message, ticker=None, redirect_url=None,
                       portfolio_item_id=None, watchlist_item_id=None, metadata=None, severity=None):
    """Create or re-alert a notification, with duplicate suppression."""
    resolved_severity = severity or SEVERITY_MAP.get(str(notification_type), 'normal')

    existing = _find_existing_unread(user, notification_type, ticker)
    if existing:
        return _re_alert(existing, title, message, resolved_severity, metadata)

    if _is_recent_duplicate(user, notification_type, ticker):
        return None

    return Notification.objects.create(
        user=user,
        type=notification_type,
        title=title,
        message=message,
        ticker=ticker,
        redirect_url=redirect_url,
        portfolio_item_id=portfolio_item_id,
        watchlist_item_id=watchlist_item_id,
        metadata=metadata or {},
        severity=resolved_severity,
    )


def get_latest_price(ticker):
    """Get the latest closing price for a ticker."""
    try:
        latest = DailyStockPrice.objects.filter(ticker=ticker).order_by('-date').first()
        return float(latest.close) if latest else None
    except Exception as e:
        print(f"Error fetching price for {ticker}: {e}")
        return None


def get_latest_day_change(ticker):
    """Latest session's day-change %, or None."""
    try:
        latest = DailyStockPrice.objects.filter(ticker=ticker).order_by('-date').first()
        return float(latest.diff_percent) if latest and latest.diff_percent is not None else None
    except Exception:
        return None


