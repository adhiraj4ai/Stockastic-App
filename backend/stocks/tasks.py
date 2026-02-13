from celery import shared_task
from django.contrib.auth.models import User


@shared_task(bind=True, name='stocks.check_notifications')
def check_all_user_notifications(self):
    """
    Periodic task to check portfolio and watchlist alerts for all active users.
    Runs every 15 minutes during market hours, hourly otherwise.
    """
    from stocks.services.notification_service import check_portfolio_alerts, check_watchlist_alerts
    
    total_portfolio = 0
    total_watchlist = 0
    
    for user in User.objects.filter(is_active=True):
        try:
            portfolio_count = check_portfolio_alerts(user)
            watchlist_count = check_watchlist_alerts(user)
            total_portfolio += portfolio_count
            total_watchlist += watchlist_count
        except Exception as e:
            print(f"Error checking notifications for user {user.username}: {e}")
    
    return {
        'total_portfolio_notifications': total_portfolio,
        'total_watchlist_notifications': total_watchlist,
        'total_notifications': total_portfolio + total_watchlist
    }
