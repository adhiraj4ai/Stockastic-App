from decimal import Decimal
from django.contrib.auth.models import User
from ..models import Notification, PortfolioItem, WatchlistItem, DailyStockPrice


def create_notification(user, notification_type, title, message, ticker=None, redirect_url=None, 
                       portfolio_item_id=None, watchlist_item_id=None, metadata=None):
    """
    Helper function to create a notification.
    Prevents duplicate notifications within the last hour for the same type/ticker/user.
    """
    from django.utils import timezone
    from datetime import timedelta
    
    # Check for duplicate notifications in the last hour
    one_hour_ago = timezone.now() - timedelta(hours=1)
    existing = Notification.objects.filter(
        user=user,
        type=notification_type,
        ticker=ticker,
        created_at__gte=one_hour_ago
    ).exists()
    
    if existing:
        return None
    
    notification = Notification.objects.create(
        user=user,
        type=notification_type,
        title=title,
        message=message,
        ticker=ticker,
        redirect_url=redirect_url,
        portfolio_item_id=portfolio_item_id,
        watchlist_item_id=watchlist_item_id,
        metadata=metadata or {}
    )
    
    return notification


def get_latest_price(ticker):
    """Get the latest closing price for a ticker."""
    try:
        latest = DailyStockPrice.objects.filter(ticker=ticker).order_by('-date').first()
        return float(latest.close) if latest else None
    except Exception as e:
        print(f"Error fetching price for {ticker}: {e}")
        return None


def check_portfolio_alerts(user):
    """
    Check all portfolio items for stop-loss hits, target achievements, and significant movements.
    Returns the number of notifications created.
    """
    notifications_created = 0
    
    try:
        items = PortfolioItem.objects.filter(user=user)
        
        for item in items:
            current_price = get_latest_price(item.ticker)
            if not current_price:
                continue
            
            # Check stop-loss
            if item.stop_loss_price and current_price <= float(item.stop_loss_price):
                notification = create_notification(
                    user=user,
                    notification_type=Notification.NotificationType.STOP_LOSS_HIT,
                    title=f'{item.ticker} Stop-Loss Hit',
                    message=f'{item.ticker} hit your stop-loss at Rs. {current_price:.2f}. Consider reviewing your position.',
                    ticker=item.ticker,
                    redirect_url='/portfolio?tab=holdings',
                    portfolio_item_id=item.id,
                    metadata={
                        'current_price': current_price,
                        'stop_loss_price': float(item.stop_loss_price),
                        'quantity': item.quantity
                    }
                )
                if notification:
                    notifications_created += 1
            
            # Check target prices
            targets = []
            if item.target_price and current_price >= float(item.target_price):
                targets.append(('Target 1', float(item.target_price)))
            if item.target_price_2 and current_price >= float(item.target_price_2):
                targets.append(('Target 2', float(item.target_price_2)))
            if item.target_price_3 and current_price >= float(item.target_price_3):
                targets.append(('Target 3', float(item.target_price_3)))
            
            for target_name, target_price in targets:
                notification = create_notification(
                    user=user,
                    notification_type=Notification.NotificationType.TARGET_REACHED,
                    title=f'{item.ticker} {target_name} Reached',
                    message=f'{item.ticker} reached {target_name} at Rs. {current_price:.2f}. Consider taking profits.',
                    ticker=item.ticker,
                    redirect_url='/portfolio?tab=holdings',
                    portfolio_item_id=item.id,
                    metadata={
                        'current_price': current_price,
                        'target_price': target_price,
                        'target_name': target_name,
                        'quantity': item.quantity
                    }
                )
                if notification:
                    notifications_created += 1

            # Calculate metrics
            wacc = float(item.wacc) if item.wacc else float(item.buy_price)
            price_change_pct = ((current_price - wacc) / wacc) * 100 if wacc > 0 else 0

            # Check if dropped below WACC (Cost price)
            if current_price < wacc:
                notification = create_notification(
                    user=user,
                    notification_type=Notification.NotificationType.BELOW_WACC,
                    title=f'{item.ticker} Dropped Below Cost',
                    message=f'{item.ticker} is now trading at Rs. {current_price:.2f}, which is below your average cost of Rs. {wacc:.2f}.',
                    ticker=item.ticker,
                    redirect_url='/portfolio?tab=holdings',
                    portfolio_item_id=item.id,
                    metadata={
                        'current_price': current_price,
                        'wacc': wacc,
                        'quantity': item.quantity
                    }
                )
                if notification:
                    notifications_created += 1
            
            # Check significant gain/loss (>10% from WACC, excluding simple break-below which has its own alert)
            if price_change_pct >= 10.0:
                notification = create_notification(
                    user=user,
                    notification_type=Notification.NotificationType.SIGNIFICANT_GAIN,
                    title=f'{item.ticker} Up {price_change_pct:.1f}%',
                    message=f'{item.ticker} is up {price_change_pct:.1f}% from your average cost of Rs. {wacc:.2f}.',
                    ticker=item.ticker,
                    redirect_url='/portfolio?tab=holdings',
                    portfolio_item_id=item.id,
                    metadata={
                        'current_price': current_price,
                        'wacc': wacc,
                        'change_percent': price_change_pct,
                        'quantity': item.quantity
                    }
                )
                if notification:
                    notifications_created += 1
            elif price_change_pct <= -10.0:
                notification = create_notification(
                    user=user,
                    notification_type=Notification.NotificationType.SIGNIFICANT_LOSS,
                    title=f'{item.ticker} Down {abs(price_change_pct):.1f}%',
                    message=f'{item.ticker} is down {abs(price_change_pct):.1f}% from your average cost of Rs. {wacc:.2f}.',
                    ticker=item.ticker,
                    redirect_url='/portfolio?tab=holdings',
                    portfolio_item_id=item.id,
                    metadata={
                        'current_price': current_price,
                        'wacc': wacc,
                        'change_percent': price_change_pct,
                        'quantity': item.quantity
                    }
                )
                if notification:
                    notifications_created += 1
    
    except Exception as e:
        print(f"Error checking portfolio alerts for user {user.username}: {e}")
    
    return notifications_created


def check_watchlist_alerts(user):
    """
    Check watchlist items for entry opportunities and breakouts.
    Returns the number of notifications created.
    """
    notifications_created = 0
    
    try:
        items = WatchlistItem.objects.filter(user=user)
        
        for item in items:
            current_price = get_latest_price(item.ticker)
            if not current_price:
                continue
            
            # Check if price is near target entry price (within 2%)
            if item.target_entry_price:
                target = float(item.target_entry_price)
                price_diff_pct = abs((current_price - target) / target) * 100
                
                if price_diff_pct <= 2.0:
                    notification = create_notification(
                        user=user,
                        notification_type=Notification.NotificationType.WATCHLIST_ENTRY,
                        title=f'{item.ticker} Entry Opportunity',
                        message=f'{item.ticker} is near your target entry price of Rs. {target:.2f} (current: Rs. {current_price:.2f}).',
                        ticker=item.ticker,
                        redirect_url=f'/ticker/{item.ticker}',
                        watchlist_item_id=item.id,
                        metadata={
                            'current_price': current_price,
                            'target_entry_price': target,
                            'difference_percent': price_diff_pct
                        }
                    )
                    if notification:
                        notifications_created += 1
            
            # Check for breakout (price > resistance or significant volume spike)
            # This would require additional price history analysis
            # For now, we'll skip this to keep it simple
    
    except Exception as e:
        print(f"Error checking watchlist alerts for user {user.username}: {e}")
    
    return notifications_created


def check_signal_alerts(user):
    """
    Check for new trading signals on portfolio and watchlist stocks.
    Returns the number of notifications created.
    """
    from datetime import date
    from ..models import StrategySignal
    
    notifications_created = 0
    
    try:
        # Get user's tickers
        portfolio_tickers = PortfolioItem.objects.filter(user=user).values_list('ticker', flat=True)
        watchlist_tickers = WatchlistItem.objects.filter(user=user).values_list('ticker', flat=True)
        all_tickers = set(list(portfolio_tickers) + list(watchlist_tickers))
        
        if not all_tickers:
            return 0
        
        # Get today's signals for user's tickers
        today = date.today()
        signals = StrategySignal.objects.filter(
            symbol__in=all_tickers,
            date=today,
            signal__in=['BUY', 'SELL']
        ).select_related('strategy')
        
        # Group by ticker and signal type
        signal_groups = {}
        for sig in signals:
            key = f"{sig.symbol}_{sig.signal}"
            if key not in signal_groups:
                signal_groups[key] = []
            signal_groups[key].append(sig)
        
        # Create notifications for each group
        for key, sig_list in signal_groups.items():
            symbol, signal_type = key.split('_')
            count = len(sig_list)
            
            # Determine notification type based on signal strength
            if signal_type == 'BUY':
                notif_type = Notification.NotificationType.SIGNAL_STRONG_BUY if count >= 3 else Notification.NotificationType.SIGNAL_BUY
                title = f"{symbol} - {'Strong ' if count >= 3 else ''}Buy Signal"
                message = f"{count} {'strategies are' if count > 1 else 'strategy is'} signaling BUY for {symbol}."
            else:  # SELL
                notif_type = Notification.NotificationType.SIGNAL_STRONG_SELL if count >= 3 else Notification.NotificationType.SIGNAL_SELL
                title = f"{symbol} - {'Strong ' if count >= 3 else ''}Sell Signal"
                message = f"{count} {'strategies are' if count > 1 else 'strategy is'} signaling SELL for {symbol}."
            
            # Get strategy names for metadata
            strategy_names = [s.strategy.name for s in sig_list]
            
            # Use 24-hour deduplication window for signals (override default 1-hour)
            from django.utils import timezone
            from datetime import timedelta
            
            one_day_ago = timezone.now() - timedelta(hours=24)
            existing = Notification.objects.filter(
                user=user,
                type=notif_type,
                ticker=symbol,
                created_at__gte=one_day_ago
            ).exists()
            
            if existing:
                continue
            
            notification = Notification.objects.create(
                user=user,
                type=notif_type,
                title=title,
                message=message,
                ticker=symbol,
                redirect_url=f'/signals?ticker={symbol}',
                metadata={
                    'signal_count': count,
                    'signal_type': signal_type,
                    'strategies': strategy_names,
                    'date': str(today)
                }
            )
            
            if notification:
                notifications_created += 1
    
    except Exception as e:
        print(f"Error checking signal alerts for user {user.username}: {e}")
    
    return notifications_created


def check_all_users():
    """
    Check alerts for all active users.
    This function is called by the Celery periodic task.
    """
    total_notifications = 0
    
    for user in User.objects.filter(is_active=True):
        portfolio_count = check_portfolio_alerts(user)
        watchlist_count = check_watchlist_alerts(user)
        signal_count = check_signal_alerts(user)
        total_notifications += portfolio_count + watchlist_count + signal_count
    
    return total_notifications
