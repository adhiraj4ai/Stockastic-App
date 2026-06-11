from decimal import Decimal
from django.contrib.auth.models import User
from django.utils import timezone
from django.db import connections
from django.db.models import Sum, F, Q, Avg
import pandas as pd
import talib
import numpy as np
from ..models import (
    Notification, PortfolioItem, WatchlistItem,
    DailyStockPrice, Company, DailyCumulativeAccumulation,
    DailyFloorsheet
)

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


def create_notification(user, notification_type, title, message, ticker=None, redirect_url=None,
                       portfolio_item_id=None, watchlist_item_id=None, metadata=None, severity=None):
    """
    Helper function to create a notification.
    If an unread notification of the same type and ticker already exists,
    updates it and moves it to the top (re-alert).
    """
    from django.utils import timezone
    from datetime import timedelta

    resolved_severity = severity or SEVERITY_MAP.get(str(notification_type), 'normal')

    # Identify existing UNREAD notification of same type/ticker
    existing_unread = Notification.objects.filter(
        user=user,
        type=notification_type,
        ticker=ticker,
        read=False
    ).first()

    if existing_unread:
        # Re-alert: move to top, update content
        existing_unread.title = title
        existing_unread.message = message
        existing_unread.created_at = timezone.now()
        existing_unread.severity = resolved_severity
        if metadata:
            existing_unread.metadata = metadata
        existing_unread.save()
        return existing_unread

    # Check for duplicate READ notifications in the last hour (prevents annoyance after reading)
    one_hour_ago = timezone.now() - timedelta(hours=1)
    if Notification.objects.filter(
        user=user,
        type=notification_type,
        ticker=ticker,
        created_at__gte=one_hour_ago
    ).exists():
        return None

    # Create new
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


def check_portfolio_alerts(user):
    """
    Check all portfolio items for stop-loss hits, target achievements, and significant movements.
    Aggregates multiple hits of the same type into a single summary notification.
    """
    notifications_created = 0
    from ..models import Notification
    
    # { NotificationType: [item1, item2] }
    hits = {
        Notification.NotificationType.STOP_LOSS_HIT: [],
        Notification.NotificationType.TARGET_REACHED: [],
        Notification.NotificationType.BELOW_WACC: [],
        Notification.NotificationType.SIGNIFICANT_GAIN: [],
        Notification.NotificationType.SIGNIFICANT_LOSS: [],
    }
    
    try:
        items = PortfolioItem.objects.filter(user=user)
        
        for item in items:
            current_price = get_latest_price(item.ticker)
            if not current_price: continue
            
            wacc = float(item.wacc) if item.wacc else float(item.buy_price)
            price_change_pct = ((current_price - wacc) / wacc) * 100 if wacc > 0 else 0
            
            # 1. Check stop-loss
            if item.stop_loss_price and current_price <= float(item.stop_loss_price):
                hits[Notification.NotificationType.STOP_LOSS_HIT].append(item)
            
            # 2. Check target prices
            hit_target = False
            if item.target_price and current_price >= float(item.target_price): hit_target = True
            elif item.target_price_2 and current_price >= float(item.target_price_2): hit_target = True
            elif item.target_price_3 and current_price >= float(item.target_price_3): hit_target = True
            
            if hit_target:
                hits[Notification.NotificationType.TARGET_REACHED].append(item)

            # 3. Check below WACC (Cost price)
            if current_price < wacc:
                hits[Notification.NotificationType.BELOW_WACC].append(item)
            
            # 4. Check significant gain/loss (>10% from WACC)
            if price_change_pct >= 10.0:
                hits[Notification.NotificationType.SIGNIFICANT_GAIN].append(item)
            elif price_change_pct <= -10.0:
                hits[Notification.NotificationType.SIGNIFICANT_LOSS].append(item)
        
        # --- Dispatch Notifications ---
        for n_type, impacted_items in hits.items():
            if not impacted_items: continue
            
            if len(impacted_items) == 1:
                # Single hit: stay specific
                item = impacted_items[0]
                price = get_latest_price(item.ticker)
                wacc_curr = float(item.wacc) if item.wacc else float(item.buy_price)
                price_change_pct = ((price - wacc_curr) / wacc_curr) * 100 if wacc_curr > 0 else 0
                
                title, message = "", ""
                if n_type == Notification.NotificationType.STOP_LOSS_HIT:
                    title = f"{item.ticker} Stop-Loss Hit"
                    message = f"{item.ticker} hit your stop-loss at Rs. {price:.2f}."
                elif n_type == Notification.NotificationType.TARGET_REACHED:
                    title = f"{item.ticker} Target Reached"
                    message = f"{item.ticker} reached your profit target at Rs. {price:.2f}."
                elif n_type == Notification.NotificationType.BELOW_WACC:
                    title = f"{item.ticker} Below Cost"
                    message = f"{item.ticker} dropped below your average cost of Rs. {wacc_curr:.2f}."
                elif n_type == Notification.NotificationType.SIGNIFICANT_GAIN:
                    title = f"{item.ticker} Up 10%+"
                    message = f"{item.ticker} has gained over 10% from your cost price."
                elif n_type == Notification.NotificationType.SIGNIFICANT_LOSS:
                    title = f"{item.ticker} Down 10%+"
                    message = f"{item.ticker} has dropped over 10% from your cost price."
                
                level, level_type = None, None
                if n_type == Notification.NotificationType.STOP_LOSS_HIT and item.stop_loss_price:
                    level, level_type = float(item.stop_loss_price), 'stop'
                elif n_type == Notification.NotificationType.TARGET_REACHED:
                    for tp in (item.target_price, item.target_price_2, item.target_price_3):
                        if tp and price >= float(tp):
                            level, level_type = float(tp), 'target'
                            break

                notification = create_notification(
                    user=user,
                    notification_type=n_type,
                    title=title,
                    message=message,
                    ticker=item.ticker,
                    redirect_url='/portfolio?tab=holdings',
                    portfolio_item_id=item.id,
                    metadata={
                        'price': price,
                        'wacc': wacc_curr,
                        'change_pct': price_change_pct,
                        'symbol': item.ticker,
                        'level': level,
                        'level_type': level_type,
                    }
                )
                if notification: notifications_created += 1
            else:
                # Multiple hits: AGGREGATE
                items_data = []
                for item in impacted_items:
                    price = get_latest_price(item.ticker)
                    wacc_curr = float(item.wacc) if item.wacc else float(item.buy_price)
                    change_pct = ((price - wacc_curr) / wacc_curr) * 100 if wacc_curr > 0 else 0
                    
                    detail = ""
                    if n_type == Notification.NotificationType.STOP_LOSS_HIT: detail = "Stop-Loss Hit"
                    elif n_type == Notification.NotificationType.TARGET_REACHED: detail = "Target Reached"
                    elif n_type == Notification.NotificationType.BELOW_WACC: detail = "Below Cost"
                    elif n_type == Notification.NotificationType.SIGNIFICANT_GAIN: detail = "Up 10%+"
                    elif n_type == Notification.NotificationType.SIGNIFICANT_LOSS: detail = "Down 10%+"
                    
                    items_data.append({
                        'symbol': item.ticker,
                        'detail': detail,
                        'price': price,
                        'change_pct': change_pct,
                        'wacc': wacc_curr
                    })

                symbols = [i.ticker for i in impacted_items]
                type_label = n_type.lower().replace('_', ' ').replace('hit', '').replace('reached', '').strip().title()
                
                notification = create_notification(
                    user=user,
                    notification_type=n_type,
                    title=f"{len(impacted_items)} Assets: {type_label}",
                    message=f"{len(impacted_items)} assets in your portfolio ({', '.join(symbols[:2])}{'...' if len(symbols) > 2 else ''}) have triggered a {type_label} alert.",
                    ticker='SUMMARY',
                    redirect_url='/portfolio?tab=holdings',
                    metadata={
                        'symbols': symbols, 
                        'count': len(impacted_items),
                        'items': items_data
                    }
                )
                if notification: notifications_created += 1
                
    except Exception as e:
        print(f"Error checking portfolio alerts for user {user.username}: {e}")
    
    return notifications_created


def check_watchlist_alerts(user):
    """
    Check watchlist items with alert_enabled=True for target price met and stop-loss hit.
    Aggregates multiple hits into summary notifications.
    """
    notifications_created = 0
    from ..models import Notification
    
    hits = {
        Notification.NotificationType.TARGET_REACHED: [],
        Notification.NotificationType.STOP_LOSS_HIT: [],
    }

    try:
        items = WatchlistItem.objects.filter(user=user, alert_enabled=True)

        for item in items:
            current_price = get_latest_price(item.ticker)
            if not current_price: continue

            # 1. Target price reached
            if item.target_price and current_price >= float(item.target_price):
                hits[Notification.NotificationType.TARGET_REACHED].append(item)

            # 2. Stop-loss / support level broken
            if item.stop_loss_price and current_price <= float(item.stop_loss_price):
                hits[Notification.NotificationType.STOP_LOSS_HIT].append(item)

        # --- Dispatch ---
        for n_type, impacted_items in hits.items():
            if not impacted_items: continue
            
            if len(impacted_items) == 1:
                item = impacted_items[0]
                price = get_latest_price(item.ticker)
                
                title = f"{item.ticker} Target Reached" if n_type == Notification.NotificationType.TARGET_REACHED else f"{item.ticker} Below Stop Price"
                message = f"{item.ticker} is at Rs. {price:.2f}, hitting your watchlist alert."
                
                if n_type == Notification.NotificationType.TARGET_REACHED:
                    level, level_type = (float(item.target_price), 'target') if item.target_price else (None, None)
                else:
                    level, level_type = (float(item.stop_loss_price), 'stop') if item.stop_loss_price else (None, None)

                notification = create_notification(
                    user=user,
                    notification_type=n_type,
                    title=title,
                    message=message,
                    ticker=item.ticker,
                    redirect_url=f'/ticker/{item.ticker}',
                    watchlist_item_id=item.id,
                    metadata={
                        'price': price,
                        'symbol': item.ticker,
                        'level': level,
                        'level_type': level_type,
                    }
                )
                if notification: notifications_created += 1
            else:
                items_data = []
                for item in impacted_items:
                    price = get_latest_price(item.ticker)
                    detail = "Target Reached" if n_type == Notification.NotificationType.TARGET_REACHED else "Stop Price Hit"
                    items_data.append({
                        'symbol': item.ticker,
                        'detail': detail,
                        'price': price,
                        'target': float(item.target_price) if item.target_price else None,
                        'stop': float(item.stop_loss_price) if item.stop_loss_price else None
                    })

                symbols = [i.ticker for i in impacted_items]
                label = "Targets Reached" if n_type == Notification.NotificationType.TARGET_REACHED else "Stop Prices Hit"
                
                notification = create_notification(
                    user=user,
                    notification_type=n_type,
                    title=f"{len(impacted_items)} Watchlist: {label}",
                    message=f"{len(impacted_items)} watchlist items ({', '.join(symbols[:2])}{'...' if len(symbols) > 2 else ''}) have hit their alert levels.",
                    ticker='SUMMARY',
                    redirect_url='/watchlist',
                    metadata={
                        'symbols': symbols, 
                        'count': len(impacted_items),
                        'items': items_data
                    }
                )
                if notification: notifications_created += 1

    except Exception as e:
        print(f"Error checking watchlist alerts for user {user.username}: {e}")

    return notifications_created


def check_zone_entry_alerts(user):
    """
    Notify when an alert-enabled watchlist symbol is IN_ZONE per the latest daily plan.
    Reads the plan's canonical ATR-based entry_statuses; create_notification dedups so the
    hourly check won't spam.
    """
    from ..models import DailyTradingPlan, Notification, WatchlistItem

    notifications_created = 0

    try:
        plan = DailyTradingPlan.objects.order_by('-date').first()
        statuses = (plan.payload.get('entry_statuses') or {}) if plan else {}
        if not statuses:
            return 0

        items = WatchlistItem.objects.filter(user=user, alert_enabled=True)
        for item in items:
            if statuses.get(item.ticker) != 'IN_ZONE':
                continue

            notification = create_notification(
                user=user,
                notification_type=Notification.NotificationType.WATCHLIST_ENTRY,
                title=f"{item.ticker} is in its entry zone",
                message=(f"{item.ticker} closed inside its canonical entry zone "
                         f"(ATR-based) per the latest plan ({plan.payload.get('as_of')})."),
                ticker=item.ticker,
                redirect_url=f'/ticker/{item.ticker}',
                watchlist_item_id=item.id,
                metadata={
                    'price': get_latest_price(item.ticker),
                    'symbol': item.ticker,
                    'plan_date': plan.payload.get('as_of'),
                },
            )
            if notification:
                notifications_created += 1

    except Exception as e:
        print(f"Error checking zone entry alerts for user {user.username}: {e}")

    return notifications_created


def check_active_signal_alerts(user):
    """
    Monitor all ACTIVE strategy signals from the Signal Intelligence hub.
    Notify user if any hit their target (TP) or stop loss (SL).
    Aggregates multiple hits into a single summary notification.
    """
    from datetime import date
    from ..models import SignalEpisode, Notification

    notifications_created = 0
    today = date.today()

    # Group results for aggregation: { 'WON': [sig1, sig2], 'LOST': [sig3] }
    hits = {'WON': [], 'LOST': []}

    # 1. Check ACTIVE signals and update status if hit
    active_signals = SignalEpisode.objects.filter(status='ACTIVE')

    for sig in active_signals:
        price = get_latest_price(sig.symbol)
        if not price: continue

        hit = False
        hit_type = None

        if sig.direction == 'BUY':
            if sig.target_price and price >= float(sig.target_price):
                hit = True
                hit_type = 'WON'
            elif sig.stop_loss_price and price <= float(sig.stop_loss_price):
                hit = True
                hit_type = 'LOST'
        elif sig.direction == 'SELL':
            if sig.target_price and price <= float(sig.target_price):
                hit = True
                hit_type = 'WON'
            elif sig.stop_loss_price and price >= float(sig.stop_loss_price):
                hit = True
                hit_type = 'LOST'

        if hit:
            # First user to trigger this today updates the global state
            sig.status = hit_type
            sig.end_date = today
            sig.save()
            hits[hit_type].append(sig)

    # 2. Check signals closed TODAY for users who haven't been notified yet
    closed_today = SignalEpisode.objects.filter(end_date=today, status__in=['WON', 'LOST'])
    for sig in closed_today:
        if sig not in hits[sig.status]: # Avoid double counting if already in hits from step 1
            hits[sig.status].append(sig)
            
    # 3. Generate Notifications (Aggregated vs Single)
    for hit_type, signals in hits.items():
        if not signals: continue
        
        notif_type = Notification.NotificationType.TARGET_REACHED if hit_type == 'WON' else Notification.NotificationType.STOP_LOSS_HIT
        status_text = "Target (TP) Reached" if hit_type == 'WON' else "Stop Loss (SL) Triggered"
        
        if len(signals) == 1:
            # Single hit: stay specific
            sig = signals[0]
            price = get_latest_price(sig.symbol)
            notification = create_notification(
                user=user,
                notification_type=notif_type,
                title=f"SIGNAL {hit_type}: {sig.symbol}",
                message=f"Strategy Signal for {sig.symbol} ({sig.source}) was closed as {hit_type}. {status_text}.",
                ticker=sig.symbol,
                redirect_url='/recommendations',
                metadata={
                    'signal_id': sig.id,
                    'hit_type': hit_type,
                    'source': sig.source,
                    'price': price,
                    'symbol': sig.symbol,
                    'level': (float(sig.target_price) if hit_type == 'WON' and sig.target_price
                              else float(sig.stop_loss_price) if sig.stop_loss_price else None),
                    'level_type': 'target' if hit_type == 'WON' else 'stop',
                }
            )
            if notification: notifications_created += 1
        else:
            # Multiple hits: AGGREGATE
            items_data = []
            seen_symbols = set()
            for s in signals:
                price = get_latest_price(s.symbol)
                items_data.append({
                    'symbol': s.symbol,
                    'detail': f"{hit_type} ({s.source})",
                    'price': price,
                    'target': float(s.target_price) if s.target_price else None,
                    'stop': float(s.stop_loss_price) if s.stop_loss_price else None
                })
                seen_symbols.add(s.symbol)

            symbols = list(seen_symbols)
            notification = create_notification(
                user=user,
                notification_type=notif_type,
                title=f"{len(signals)} Signals reached {hit_type}",
                message=f"{len(signals)} Strategy Signals ({', '.join(symbols[:3])}{'...' if len(symbols) > 3 else ''}) reached their objective today as {hit_type} ({status_text}).",
                ticker='SUMMARY',
                redirect_url='/recommendations',
                metadata={
                    'symbols': symbols,
                    'hit_type': hit_type,
                    'count': len(signals),
                    'items': items_data
                }
            )
            if notification: notifications_created += 1
            
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
    Fires for ALL tickers. Now aggregates multiple tickers into a single summary 
    notification to prevent overwhelming the user.
    """
    from datetime import date, timedelta
    from django.utils import timezone
    from ..models import SignalEpisode, Notification

    notifications_created = 0

    try:
        today = date.today()
        signals = SignalEpisode.objects.filter(
            start_date=today,
            direction__in=['BUY', 'SELL'],
            strategy__name__in=WHALE_WATCH_STRATEGY_NAMES,
        ).select_related('strategy')

        # Group by signal type (BUY vs SELL)
        summary_groups = {'BUY': [], 'SELL': []}
        for sig in signals:
            if not sig: continue
            summary_groups[sig.direction].append(sig)

        for signal_type, sig_list in summary_groups.items():
            if not sig_list:
                continue

            symbols = sorted(list({s.symbol for s in sig_list}))
            notif_type = (
                Notification.NotificationType.WHALE_BUY
                if signal_type == 'BUY'
                else Notification.NotificationType.WHALE_SELL
            )

            # 24-hour dedup for the summary itself
            # We use a special ticker value 'SUMMARY' to identify this aggregated alert
            one_day_ago = timezone.now() - timedelta(hours=24)
            if Notification.objects.filter(
                user=user, type=notif_type, ticker='SUMMARY',
                created_at__gte=one_day_ago
            ).exists():
                continue

            count = len(symbols)
            symbol_str = ", ".join(symbols[:8]) + ("..." if count > 8 else "")
            
            if signal_type == 'BUY':
                title = f'Whale Watch: {count} Symbols Detect BUY'
                message = f'Smart money accumulation detected for {count} tickers including {symbol_str}.'
            else:
                title = f'Whale Watch: {count} Symbols Detect SELL'
                message = f'Distribution detected for {count} tickers including {symbol_str}.'

            items_data = []
            for s in sig_list:
                price = get_latest_price(s.symbol)
                items_data.append({
                    'symbol': s.symbol,
                    'detail': f"{signal_type} ({s.strategy.name})",
                    'price': price
                })

            create_notification(
                user=user,
                notification_type=notif_type,
                title=title,
                message=message,
                ticker='SUMMARY',
                redirect_url='/recommendations',
                metadata={
                    'signal_type': signal_type,
                    'count': count,
                    'symbols': symbols,
                    'date': str(today),
                    'items': items_data
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
    from ..models import SignalEpisode

    notifications_created = 0

    try:
        # Get user's tickers
        portfolio_tickers = PortfolioItem.objects.filter(user=user).values_list('ticker', flat=True)
        watchlist_tickers = WatchlistItem.objects.filter(user=user).values_list('ticker', flat=True)
        all_tickers = set(list(portfolio_tickers) + list(watchlist_tickers))

        if not all_tickers:
            return 0

        # Get today's episodes for user's tickers (BUY/SELL only; HOLD/NEUTRAL no longer exist as episodes)
        today = date.today()
        signals = SignalEpisode.objects.filter(
            symbol__in=all_tickers,
            start_date=today,
            direction__in=['BUY', 'SELL']
        ).select_related('strategy')

        # Group by ticker and direction
        signal_groups = {}
        for sig in signals:
            key = f"{sig.symbol}_{sig.direction}"
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

            # Get strategy names for metadata (strategy FK may be null for source-based episodes)
            strategy_names = [s.strategy.name for s in sig_list if s.strategy]
            
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
            
            notification = create_notification(
                user=user,
                notification_type=notif_type,
                title=title,
                message=message,
                ticker=symbol,
                redirect_url=f'/signals?ticker={symbol}',
                metadata={
                    'signal_count': count,
                    'signal_type': signal_type,
                    'strategies': strategy_names,
                    'date': str(today),
                    'price': get_latest_price(symbol),
                    'symbol': symbol
                }
            )
            
            if notification:
                notifications_created += 1
    
    except Exception as e:
        print(f"Error checking signal alerts for user {user.username}: {e}")
    
    return notifications_created


def check_accumulation_trend_alerts(user):
    """
    Check portfolio and watchlist items for 5D increasing buying trend 
    while the stock is below cost (LTP < WAC).
    Returns the number of notifications created.
    """
    from datetime import timedelta
    from django.utils import timezone
    from django.db import connections
    
    notifications_created = 0
    try:
        # Get user's tickers
        portfolio_tickers = list(PortfolioItem.objects.filter(user=user).values_list('ticker', flat=True))
        watchlist_tickers = list(WatchlistItem.objects.filter(user=user).values_list('ticker', flat=True))
        
        tickers_to_check = set(portfolio_tickers + watchlist_tickers)
        
        if not tickers_to_check:
            return 0
            
        tickers_list = "', '".join(tickers_to_check)
        
        query = f"""
        WITH valid_dates AS (
            SELECT transaction_date
            FROM daily_floorsheet
            GROUP BY transaction_date
            HAVING COUNT(*) > 100
            ORDER BY transaction_date DESC
            LIMIT 6
        ),
        date_milestones AS (
            SELECT
                (SELECT transaction_date FROM valid_dates OFFSET 5 LIMIT 1) as date_5d
        ),
        floorsheet_net AS (
            SELECT symbol, buyer_id as broker, transaction_quantity as qty
            FROM daily_floorsheet
            WHERE symbol IN ('{tickers_list}')
            AND transaction_date > (SELECT date_5d FROM date_milestones)
            UNION ALL
            SELECT symbol, seller_id as broker, -transaction_quantity as qty
            FROM daily_floorsheet
            WHERE symbol IN ('{tickers_list}')
            AND transaction_date > (SELECT date_5d FROM date_milestones)
        ),
        trend_stats AS (
            SELECT
                fn.symbol, fn.broker,
                SUM(fn.qty) as net_5d
            FROM floorsheet_net fn
            GROUP BY fn.symbol, fn.broker
        ),
        latest_accumulation AS (
            SELECT DISTINCT ON (symbol, entity_id)
                symbol, entity_id, cumulative_net, cumulative_buy, cumulative_buy_amount
            FROM daily_cumulative_accumulation
            WHERE symbol IN ('{tickers_list}')
            ORDER BY symbol, entity_id, transaction_date DESC
        ),
        wac_data AS (
            SELECT
                la.symbol, la.entity_id as broker,
                ROUND(la.cumulative_buy_amount / NULLIF(la.cumulative_buy, 0), 2) as wac
            FROM latest_accumulation la
            WHERE la.cumulative_net > 10000
        )
        SELECT 
            wd.symbol, wd.broker, ts.net_5d, wd.wac, dsp.close as ltp
        FROM wac_data wd
        INNER JOIN trend_stats ts ON wd.symbol = ts.symbol AND wd.broker = CAST(ts.broker AS VARCHAR)
        LEFT JOIN (
            SELECT DISTINCT ON (symbol) symbol, close
            FROM daily_stock_price 
            WHERE symbol IN ('{tickers_list}')
            ORDER BY symbol, transaction_date DESC
        ) dsp ON wd.symbol = dsp.symbol
        WHERE dsp.close < wd.wac
        AND wd.wac > 0
        AND ts.net_5d > 0
        """
        
        with connections['default'].cursor() as cursor:
            cursor.execute(query)
            columns = [col[0] for col in cursor.description]
            results = [dict(zip(columns, row)) for row in cursor.fetchall()]
            
        symbols_with_trend = {}
        for row in results:
            symbol = row['symbol']
            if symbol not in symbols_with_trend:
                symbols_with_trend[symbol] = []
            symbols_with_trend[symbol].append(row)
            
        one_day_ago = timezone.now() - timedelta(hours=24)
            
        for symbol, brokers in symbols_with_trend.items():
            existing = Notification.objects.filter(
                user=user,
                type=Notification.NotificationType.TREND_BUY_5D,
                ticker=symbol,
                created_at__gte=one_day_ago
            ).exists()
            
            if existing:
                continue
                
            top_broker = max(brokers, key=lambda x: x['net_5d'])
            
            title = f"{symbol} - 5D Buying Trend"
            if len(brokers) == 1:
                message = f"Broker {top_broker['broker']} is accumulating {symbol} (Below Cost) with an increasing 5-day trend."
            else:
                message = f"Broker {top_broker['broker']} and {len(brokers)-1} others are accumulating {symbol} (Below Cost) with an increasing 5-day trend."
                
            net_5d_val = 0.0
            if top_broker and 'net_5d' in top_broker:
                try:
                    net_5d_val = float(top_broker['net_5d'])
                except (TypeError, ValueError):
                    net_5d_val = 0.0

            create_notification(
                user=user,
                notification_type=Notification.NotificationType.TREND_BUY_5D,
                title=title,
                message=message,
                ticker=symbol,
                redirect_url=f"/accumulation/below-cost?search={symbol}",
                metadata={
                    'brokers': [b['broker'] for b in brokers],
                    'top_broker': top_broker['broker'] if top_broker else "Unknown",
                    'net_5d': net_5d_val,
                    'price': float(top_broker['ltp']) if top_broker and top_broker.get('ltp') is not None else None,
                    'symbol': symbol
                }
            )
            notifications_created += 1
            
    except Exception as e:
        print(f"Error checking accumulation trend alerts for user {user.username}: {e}")
        
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
        trend_5d_count = check_accumulation_trend_alerts(user)
        tech_count = check_technical_alerts(user)
        broker_discovery_count = check_broker_discovery_alerts(user)
        portfolio_mgmt_count = check_portfolio_management_alerts(user)
        
        user_total = (
            int(portfolio_count) + int(watchlist_count) + int(signal_count) + 
            int(whale_count) + int(trend_5d_count) + int(tech_count) + 
            int(broker_discovery_count) + int(portfolio_mgmt_count)
        )
        total_notifications += user_total

    return total_notifications

def check_technical_alerts(user):
    """
    Check for Volume Spikes, RSI extremes, and MA crossovers for portfolio/watchlist.
    """
    from datetime import date, timedelta
    notifications_created = 0
    try:
        # 1. Get symbols
        portfolio_symbols = list(PortfolioItem.objects.filter(user=user).values_list('ticker', flat=True))
        watchlist_symbols = list(WatchlistItem.objects.filter(user=user).values_list('ticker', flat=True))
        all_symbols = list(set(portfolio_symbols + watchlist_symbols))
        
        if not all_symbols:
            return 0
            
        today = date.today()
        one_day_ago = timezone.now() - timedelta(hours=24)
        lookback = today - timedelta(days=300) # For 200d SMA
        
        # 2. Fetch price data
        price_data = list(DailyStockPrice.objects.filter(
            ticker__in=all_symbols,
            date__gte=lookback
        ).order_by('ticker', 'date').values('ticker', 'date', 'close', 'volume', 'high', 'low'))
        
        if not price_data:
            return 0
            
        df_all = pd.DataFrame(price_data)
        
        for symbol in all_symbols:
            df = df_all[df_all['ticker'] == symbol].copy()
            if len(df) < 50: continue
            
            df['date'] = pd.to_datetime(df['date'])
            df.set_index('date', inplace=True)
            
            # Indicators using talib
            close_vals = df['close'].values.astype(float)
            rsi = talib.RSI(close_vals, timeperiod=14)
            sma_50 = talib.SMA(close_vals, timeperiod=50)
            sma_200 = talib.SMA(close_vals, timeperiod=200)
            avg_vol_20 = df['volume'].rolling(window=20).mean()
            
            latest_rsi = rsi[-1] if rsi is not None and not np.isnan(rsi[-1]) else 50
            latest_vol = df['volume'].iloc[-1]
            latest_avg_vol = avg_vol_20.iloc[-1] if avg_vol_20 is not None else 0
            latest_close = df['close'].iloc[-1]
            prev_close = float(df['close'].iloc[-2]) if len(df) >= 2 else None
            day_change_pct = (((float(latest_close) - prev_close) / prev_close) * 100
                              if prev_close else None)

            # --- VOLUME SPIKE ---
            if latest_vol > (latest_avg_vol * 3) and latest_avg_vol > 0:
                if not Notification.objects.filter(user=user, ticker=symbol, type=Notification.NotificationType.VOLUME_SPIKE, created_at__gte=one_day_ago).exists():
                    create_notification(
                        user=user, ticker=symbol, notification_type=Notification.NotificationType.VOLUME_SPIKE,
                        title=f"{symbol} - Volume Spike",
                        message=f"Unusual volume detected: {latest_vol:,} which is {latest_vol/latest_avg_vol:.1f}x the 20-day average.",
                        redirect_url=f"/ticker/{symbol}",
                        metadata={'price': latest_close, 'vol_multiplier': latest_vol/latest_avg_vol, 'change_pct': day_change_pct, 'symbol': symbol}
                    )
                    notifications_created += 1

            # --- RSI OVERSOLD ---
            if latest_rsi < 30:
                if not Notification.objects.filter(user=user, ticker=symbol, type=Notification.NotificationType.RSI_OVERSOLD, created_at__gte=one_day_ago).exists():
                    create_notification(
                        user=user, ticker=symbol, notification_type=Notification.NotificationType.RSI_OVERSOLD,
                        title=f"{symbol} - RSI Oversold",
                        message=f"{symbol} is currently oversold with an RSI of {latest_rsi:.1f}. Potential reversal area.",
                        redirect_url=f"/ticker/{symbol}",
                        metadata={'price': latest_close, 'rsi': latest_rsi, 'change_pct': day_change_pct, 'symbol': symbol}
                    )
                    notifications_created += 1

            # --- RSI OVERBOUGHT ---
            if latest_rsi > 70:
                if not Notification.objects.filter(user=user, ticker=symbol, type=Notification.NotificationType.RSI_OVERBOUGHT, created_at__gte=one_day_ago).exists():
                    create_notification(
                        user=user, ticker=symbol, notification_type=Notification.NotificationType.RSI_OVERBOUGHT,
                        title=f"{symbol} - RSI Overbought",
                        message=f"{symbol} is currently overbought with an RSI of {latest_rsi:.1f}. Caution recommended.",
                        redirect_url=f"/ticker/{symbol}",
                        metadata={'price': latest_close, 'rsi': latest_rsi, 'change_pct': day_change_pct, 'symbol': symbol}
                    )
                    notifications_created += 1

            # --- GOLDEN CROSS ---
            if len(df) > 200:
                prev_sma50 = sma_50[-2]
                prev_sma200 = sma_200[-2]
                curr_sma50 = sma_50[-1]
                curr_sma200 = sma_200[-1]

                if prev_sma50 <= prev_sma200 and curr_sma50 > curr_sma200:
                    if not Notification.objects.filter(user=user, ticker=symbol, type=Notification.NotificationType.GOLDEN_CROSS, created_at__gte=one_day_ago).exists():
                        create_notification(
                            user=user, ticker=symbol, notification_type=Notification.NotificationType.GOLDEN_CROSS,
                            title=f"{symbol} - Golden Cross",
                            message=f"Bullish 50-day SMA crossed above 200-day SMA for {symbol}.",
                            redirect_url=f"/ticker/{symbol}",
                            metadata={'price': latest_close, 'change_pct': day_change_pct, 'symbol': symbol}
                        )
                        notifications_created += 1

    except Exception as e:
        print(f"Error in check_technical_alerts: {e}")
    return notifications_created

def check_broker_discovery_alerts(user):
    """
    Check for Top Broker Entry and Consistent Buying patterns.
    """
    from datetime import date, timedelta
    notifications_created = 0
    try:
        today = date.today()
        one_day_ago = timezone.now() - timedelta(hours=24)
        
        # --- WHALE ENTRY (NEW POSITION BY TOP BROKER) ---
        # Logic: Broker who had 0 Cumulative Net 5 days ago now has > 20k units
        five_days_ago = today - timedelta(days=7)
        
        # This is a bit complex for a single query, let's look for big net buys today
        recent_acc = DailyCumulativeAccumulation.objects.filter(
            transaction_date=today,
            cumulative_net__gt=20000
        ).exclude(entity_id__in=['OTHERS']) # Focus on specific brokers
        
        for acc in recent_acc:
            # Check if this broker is a "Top Broker" (Simplified: any broker with id < 60 for NEPSE)
            try:
                broker_id = int(acc.entity_id)
                if broker_id > 60: continue
            except: continue
            
            # Check if they had a position before
            prev_exists = DailyCumulativeAccumulation.objects.filter(
                symbol=acc.symbol, entity_id=acc.entity_id,
                transaction_date__lt=today, cumulative_net__gt=0
            ).exists()
            
            if not prev_exists:
                # Fresh big entry!
                if not Notification.objects.filter(user=user, ticker=acc.symbol, type=Notification.NotificationType.WHALE_ENTRY, created_at__gte=one_day_ago).exists():
                    create_notification(
                        user=user, ticker=acc.symbol, notification_type=Notification.NotificationType.WHALE_ENTRY,
                        title=f"Whale Entry: {acc.symbol}",
                        message=f"Broker {acc.entity_id} has entered a fresh position in {acc.symbol} with {acc.cumulative_net:,} units.",
                        redirect_url=f"/accumulation/trends?search={acc.symbol}",
                        metadata={'price': get_latest_price(acc.symbol), 'broker': acc.entity_id, 'units': acc.cumulative_net, 'symbol': acc.symbol}
                    )
                    notifications_created += 1

    except Exception as e:
        print(f"Error in check_broker_discovery_alerts: {e}")
    return notifications_created

def check_portfolio_management_alerts(user):
    """
    Check for Portfolio Concentration and Take Profit reminders.
    """
    from datetime import date, timedelta
    notifications_created = 0
    try:
        one_week_ago = timezone.now() - timedelta(days=7)
        
        # 1. Concentration Alert
        items = list(PortfolioItem.objects.filter(user=user, quantity__gt=0))
        if not items: return 0
        
        total_value = sum(item.quantity * (float(item.wacc) if item.wacc else float(item.buy_price)) for item in items if (item.wacc or item.buy_price))
        if total_value == 0: return 0
        
        for item in items:
            wacc_val = float(item.wacc) if item.wacc else float(item.buy_price)
            curr_price = get_latest_price(item.ticker)
            weight = (item.quantity * wacc_val) / total_value
            if weight > 0.40: # 40% threshold
                if not Notification.objects.filter(user=user, ticker=item.ticker, type=Notification.NotificationType.PORTFOLIO_DIVERSITY, created_at__gte=one_week_ago).exists():
                    create_notification(
                        user=user, ticker=item.ticker, notification_type=Notification.NotificationType.PORTFOLIO_DIVERSITY,
                        title="Concentration Warning",
                        message=f"{item.ticker} now makes up {weight*100:.1f}% of your portfolio. Consider diversifying.",
                        redirect_url="/portfolio",
                        metadata={'weight': weight, 'symbol': item.ticker, 'price': curr_price}
                    )
                    notifications_created += 1

            # 2. Take Profit Alert (Logic: Gain > 30% or Profit over Rs 100k)
            if curr_price:
                profit_percent = ((curr_price - wacc_val) / wacc_val) * 100
                if profit_percent > 30:
                    if not Notification.objects.filter(user=user, ticker=item.ticker, type=Notification.NotificationType.TAKE_PROFIT, created_at__gte=one_week_ago).exists():
                        create_notification(
                            user=user, ticker=item.ticker, notification_type=Notification.NotificationType.TAKE_PROFIT,
                            title=f"Profit Rocket: {item.ticker}",
                            message=f"You are up {profit_percent:.1f}% on {item.ticker}. Consider locking in some profits!",
                            redirect_url="/portfolio",
                            metadata={'profit_percent': profit_percent, 'change_pct': profit_percent, 'symbol': item.ticker, 'price': curr_price}
                        )
                        notifications_created += 1

    except Exception as e:
        print(f"Error in check_portfolio_management_alerts: {e}")
    return notifications_created
