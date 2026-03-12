from celery import shared_task
from django.contrib.auth.models import User
from django.db import models



@shared_task(bind=True, name='stocks.check_notifications')
def check_all_user_notifications(self):
    """
    Periodic task to check portfolio and watchlist alerts for all active users.
    Runs every 15 minutes during market hours, hourly otherwise.
    """
    from stocks.services.notification_service import (
        check_portfolio_alerts, check_watchlist_alerts,
        check_signal_alerts, check_whale_watch_alerts,
    )

    total_portfolio = 0
    total_watchlist = 0
    total_signals = 0
    total_whale = 0

    for user in User.objects.filter(is_active=True):
        try:
            total_portfolio += check_portfolio_alerts(user)
            total_watchlist += check_watchlist_alerts(user)
            total_signals += check_signal_alerts(user)
            total_whale += check_whale_watch_alerts(user)
        except Exception as e:
            print(f"Error checking notifications for user {user.username}: {e}")

    return {
        'total_portfolio_notifications': total_portfolio,
        'total_watchlist_notifications': total_watchlist,
        'total_signal_notifications': total_signals,
        'total_whale_notifications': total_whale,
        'total_notifications': total_portfolio + total_watchlist + total_signals + total_whale,
    }
@shared_task(bind=True, name='stocks.capture_portfolio_snapshots')
def capture_portfolio_snapshots(self):
    """
    Daily task to capture portfolio snapshots for all users.
    Should be run once a day after market close.
    """
    from stocks.models import PortfolioAccount, PortfolioItem, PortfolioSnapshot, DailyStockPrice
    from stocks.services.portfolio_service import PortfolioService
    from django.utils import timezone
    from decimal import Decimal
    
    today = timezone.now().date()
    
    # 1. Get NEPSE proxy (sum of all closes for today)
    latest_prices = DailyStockPrice.objects.filter(date=today)
    if not latest_prices.exists():
        # If no data for today yet, maybe market hasn't closed or data hasn't been uploaded
        # Look for latest available date
        latest_date_entry = DailyStockPrice.objects.order_by('-date').first()
        if latest_date_entry:
            today = latest_date_entry.date
            latest_prices = DailyStockPrice.objects.filter(date=today)
        else:
            return "No price data found to create snapshots."

    nepse_index = latest_prices.aggregate(total=models.Sum('close'))['total'] or 0

    accounts = PortfolioAccount.objects.all()
    created_count = 0
    
    for account in accounts:
        # Get portfolio items for this account
        items = PortfolioItem.objects.filter(account=account)
        if not items.exists():
            continue
            
        # Use PortfolioService to get latest metrics (including current_value)
        # We need to pass the queryset to get_portfolio_metrics
        enriched_items = PortfolioService.get_portfolio_metrics(items)
        
        invested_value = sum(Decimal(str(item.investment_value)) for item in enriched_items)
        current_holdings_value = sum(Decimal(str(item.current_value)) for item in enriched_items)
        
        # Portfolio Total Value = Current Holdings Value + Cash Balance
        total_value = current_holdings_value + account.balance
        
        PortfolioSnapshot.objects.update_or_create(
            user=account.user,
            account=account,
            date=today,
            defaults={
                'total_value': total_value,
                'invested_value': invested_value,
                'cash_balance': account.balance,
                'nepse_index': nepse_index
            }
        )
        created_count += 1
        
    return f"Captured {created_count} snapshots for {today}."
