from decimal import Decimal
from django.contrib.auth.models import User
from django.utils import timezone
from django.db import connections
from django.db.models import Sum, F, Q, Avg
import pandas as pd
import pandas_ta as ta
import numpy as np
from ..models import (
    Notification, PortfolioItem, WatchlistItem, 
    DailyStockPrice, Company, DailyCumulativeAccumulation,
    DailyFloorsheet
)


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

        groups = {}
        for sig in signals:
            if not sig: continue
            key = f"{sig.symbol}_{sig.signal}"
            if key not in groups:
                groups[key] = []
            groups[key].append(sig)

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

            Notification.objects.create(
                user=user,
                type=Notification.NotificationType.TREND_BUY_5D,
                title=title,
                message=message,
                ticker=symbol,
                redirect_url=f"/accumulation/below-cost?search={symbol}",
                metadata={
                    'brokers': [b['broker'] for b in brokers],
                    'top_broker': top_broker['broker'] if top_broker else "Unknown",
                    'net_5d': net_5d_val
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
            
            # Indicators
            rsi = ta.rsi(df['close'], length=14)
            sma_50 = ta.sma(df['close'], length=50)
            sma_200 = ta.sma(df['close'], length=200)
            avg_vol_20 = df['volume'].rolling(window=20).mean()
            
            latest_rsi = rsi.iloc[-1] if rsi is not None else 50
            latest_vol = df['volume'].iloc[-1]
            latest_avg_vol = avg_vol_20.iloc[-1] if avg_vol_20 is not None else 0
            latest_close = df['close'].iloc[-1]
            
            # --- VOLUME SPIKE ---
            if latest_vol > (latest_avg_vol * 3) and latest_avg_vol > 0:
                if not Notification.objects.filter(user=user, ticker=symbol, type=Notification.NotificationType.VOLUME_SPIKE, created_at__gte=one_day_ago).exists():
                    Notification.objects.create(
                        user=user, ticker=symbol, type=Notification.NotificationType.VOLUME_SPIKE,
                        title=f"{symbol} - Volume Spike",
                        message=f"Unusual volume detected: {latest_vol:,} which is {latest_vol/latest_avg_vol:.1f}x the 20-day average.",
                        redirect_url=f"/ticker/{symbol}"
                    )
                    notifications_created += 1

            # --- RSI OVERSOLD ---
            if latest_rsi < 30:
                if not Notification.objects.filter(user=user, ticker=symbol, type=Notification.NotificationType.RSI_OVERSOLD, created_at__gte=one_day_ago).exists():
                    Notification.objects.create(
                        user=user, ticker=symbol, type=Notification.NotificationType.RSI_OVERSOLD,
                        title=f"{symbol} - RSI Oversold",
                        message=f"{symbol} is currently oversold with an RSI of {latest_rsi:.1f}. Potential reversal area.",
                        redirect_url=f"/ticker/{symbol}"
                    )
                    notifications_created += 1

            # --- RSI OVERBOUGHT ---
            if latest_rsi > 70:
                if not Notification.objects.filter(user=user, ticker=symbol, type=Notification.NotificationType.RSI_OVERBOUGHT, created_at__gte=one_day_ago).exists():
                    Notification.objects.create(
                        user=user, ticker=symbol, type=Notification.NotificationType.RSI_OVERBOUGHT,
                        title=f"{symbol} - RSI Overbought",
                        message=f"{symbol} is currently overbought with an RSI of {latest_rsi:.1f}. Caution recommended.",
                        redirect_url=f"/ticker/{symbol}"
                    )
                    notifications_created += 1

            # --- GOLDEN CROSS ---
            if len(df) > 200:
                prev_sma50 = sma_50.iloc[-2]
                prev_sma200 = sma_200.iloc[-2]
                curr_sma50 = sma_50.iloc[-1]
                curr_sma200 = sma_200.iloc[-1]
                
                if prev_sma50 <= prev_sma200 and curr_sma50 > curr_sma200:
                    if not Notification.objects.filter(user=user, ticker=symbol, type=Notification.NotificationType.GOLDEN_CROSS, created_at__gte=one_day_ago).exists():
                        Notification.objects.create(
                            user=user, ticker=symbol, type=Notification.NotificationType.GOLDEN_CROSS,
                            title=f"{symbol} - Golden Cross",
                            message=f"Bullish 50-day SMA crossed above 200-day SMA for {symbol}.",
                            redirect_url=f"/ticker/{symbol}"
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
                    Notification.objects.create(
                        user=user, ticker=acc.symbol, type=Notification.NotificationType.WHALE_ENTRY,
                        title=f"Whale Entry: {acc.symbol}",
                        message=f"Broker {acc.entity_id} has entered a fresh position in {acc.symbol} with {acc.cumulative_net:,} units.",
                        redirect_url=f"/accumulation/trends?search={acc.symbol}"
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
        
        total_value = sum(item.quantity * item.wac for item in items if item.wac)
        if total_value == 0: return 0
        
        for item in items:
            weight = (item.quantity * item.wac) / total_value
            if weight > 0.40: # 40% threshold
                if not Notification.objects.filter(user=user, ticker=item.ticker, type=Notification.NotificationType.PORTFOLIO_DIVERSITY, created_at__gte=one_week_ago).exists():
                    Notification.objects.create(
                        user=user, ticker=item.ticker, type=Notification.NotificationType.PORTFOLIO_DIVERSITY,
                        title="Concentration Warning",
                        message=f"{item.ticker} now makes up {weight*100:.1f}% of your portfolio. Consider diversifying.",
                        redirect_url="/portfolio"
                    )
                    notifications_created += 1
            
            # 2. Take Profit Alert (Logic: Gain > 30% or Profit over Rs 100k)
            # This would require fetching current price for each item
            curr_price = get_latest_price(item.ticker)
            if curr_price:
                profit_percent = ((curr_price - float(item.wac)) / float(item.wac)) * 100
                if profit_percent > 30:
                    if not Notification.objects.filter(user=user, ticker=item.ticker, type=Notification.NotificationType.TAKE_PROFIT, created_at__gte=one_week_ago).exists():
                        Notification.objects.create(
                            user=user, ticker=item.ticker, type=Notification.NotificationType.TAKE_PROFIT,
                            title=f"Profit Rocket: {item.ticker}",
                            message=f"You are up {profit_percent:.1f}% on {item.ticker}. Consider locking in some profits!",
                            redirect_url="/portfolio"
                        )
                        notifications_created += 1

    except Exception as e:
        print(f"Error in check_portfolio_management_alerts: {e}")
    return notifications_created
