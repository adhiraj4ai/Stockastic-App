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
    Check watchlist items with alert_enabled=True for target price met and stop-loss hit.
    Returns the number of notifications created.
    """
    notifications_created = 0

    try:
        items = WatchlistItem.objects.filter(user=user, alert_enabled=True)

        for item in items:
            current_price = get_latest_price(item.ticker)
            if not current_price:
                continue

            # Target price reached
            if item.target_price and current_price >= float(item.target_price):
                notification = create_notification(
                    user=user,
                    notification_type=Notification.NotificationType.TARGET_REACHED,
                    title=f'{item.ticker} Target Price Reached',
                    message=f'{item.ticker} is at Rs. {current_price:.2f}, hitting your watchlist target of Rs. {float(item.target_price):.2f}. Consider acting.',
                    ticker=item.ticker,
                    redirect_url=f'/ticker/{item.ticker}',
                    watchlist_item_id=item.id,
                    metadata={
                        'current_price': current_price,
                        'target_price': float(item.target_price),
                    }
                )
                if notification:
                    notifications_created += 1

            # Stop-loss / support level broken
            if item.stop_loss_price and current_price <= float(item.stop_loss_price):
                notification = create_notification(
                    user=user,
                    notification_type=Notification.NotificationType.STOP_LOSS_HIT,
                    title=f'{item.ticker} Below Stop Price',
                    message=f'{item.ticker} is at Rs. {current_price:.2f}, below your watchlist stop of Rs. {float(item.stop_loss_price):.2f}.',
                    ticker=item.ticker,
                    redirect_url=f'/ticker/{item.ticker}',
                    watchlist_item_id=item.id,
                    metadata={
                        'current_price': current_price,
                        'stop_loss_price': float(item.stop_loss_price),
                    }
                )
                if notification:
                    notifications_created += 1

    except Exception as e:
        print(f"Error checking watchlist alerts for user {user.username}: {e}")

    return notifications_created


# Strategies that power the Whale Watch / Smart Money page
WHALE_WATCH_STRATEGY_NAMES = [
    'Broker Accumulation (Institutional)',
    'Smart Accumulated Crossover',
    'Ichimoku Cloud + Accumulation',
]


def check_whale_watch_alerts(user):
    """
    Notify for today's BUY/SELL signals generated by the three Whale Watch engines.
    Fires for ALL tickers (not just user portfolio/watchlist) since whale watch is
    a discovery tool. Uses 24-hour deduplication per ticker+signal.
    Returns the number of notifications created.
    """
    from datetime import date, timedelta
    from django.utils import timezone
    from ..models import StrategySignal

    notifications_created = 0

    try:
        today = date.today()
        signals = StrategySignal.objects.filter(
            date=today,
            signal__in=['BUY', 'SELL'],
            strategy__name__in=WHALE_WATCH_STRATEGY_NAMES,
        ).select_related('strategy')

        # Group by ticker+signal_type
        groups = {}
        for sig in signals:
            key = f"{sig.symbol}_{sig.signal}"
            groups.setdefault(key, []).append(sig)

        one_day_ago = timezone.now() - timedelta(hours=24)

        for key, sig_list in groups.items():
            symbol, signal_type = key.split('_', 1)
            notif_type = (
                Notification.NotificationType.WHALE_BUY
                if signal_type == 'BUY'
                else Notification.NotificationType.WHALE_SELL
            )

            # 24-hour dedup
            if Notification.objects.filter(
                user=user, type=notif_type, ticker=symbol,
                created_at__gte=one_day_ago
            ).exists():
                continue

            strategy_names = list({s.strategy.name for s in sig_list})
            strengths = [
                float(s.metadata.get('strength', 0))
                for s in sig_list if s.metadata and 'strength' in s.metadata
            ]
            strength = round(max(strengths), 1) if strengths else 0

            if signal_type == 'BUY':
                title = f'Whale Watch: {symbol} BUY'
                message = (
                    f'Smart money accumulation detected for {symbol} '
                    f'(strength: {strength}). {strategy_names[0]} signals BUY.'
                )
            else:
                title = f'Whale Watch: {symbol} SELL'
                message = (
                    f'Smart money distribution detected for {symbol} '
                    f'(strength: {strength}). {strategy_names[0]} signals SELL.'
                )

            Notification.objects.create(
                user=user,
                type=notif_type,
                title=title,
                message=message,
                ticker=symbol,
                redirect_url='/recommendations',
                metadata={
                    'signal_type': signal_type,
                    'strategies': strategy_names,
                    'strength': strength,
                    'date': str(today),
                }
            )
            notifications_created += 1

    except Exception as e:
        print(f"Error checking whale watch alerts for user {user.username}: {e}")

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
        whale_count = check_whale_watch_alerts(user)
        total_notifications += portfolio_count + watchlist_count + signal_count + whale_count

    return total_notifications
