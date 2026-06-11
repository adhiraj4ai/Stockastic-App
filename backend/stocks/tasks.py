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
            check_active_signal_alerts(user)
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


@shared_task
def generate_all_signals_task():
    """Daily: run every signal engine, then resolve ACTIVE episodes on TP/SL."""
    from stocks.services.signal_generation_service import SignalGenerationService
    from stocks.services.signal_episode.service import evaluate_active_episodes
    saved = SignalGenerationService.generate_all(None)
    closed = evaluate_active_episodes()
    return {"signals_saved": saved, "episodes_closed": closed}


@shared_task
def evaluate_episodes_task():
    """Resolve ACTIVE SignalEpisodes against latest prices (TP/SL hits)."""
    from stocks.services.signal_episode.service import evaluate_active_episodes
    return {"episodes_closed": evaluate_active_episodes()}


@shared_task
def generate_daily_plan_task():
    """Nightly: build tomorrow's trading plan, then notify entitled users.

    Runs after generate_all_signals_task (which already evaluates episodes).
    On failure the previous plan keeps serving; we log to DataUploadLog.
    """
    from django.contrib.auth.models import User
    from django.db.models import Q
    from stocks.models import DataUploadLog
    from stocks.services import daily_plan as daily_plan_service
    from stocks.services.notification_service import create_notification
    from users.models import TierPermission

    try:
        plan = daily_plan_service.build_daily_plan()
    except Exception as exc:
        DataUploadLog.objects.create(
            file_name="daily_plan", upload_type="PLAN", status="FAILED",
            error_message=str(exc),
        )
        return {"status": "FAILED", "error": str(exc)}

    if not getattr(plan, "was_regenerated", True):
        # Same source session as the existing plan (holiday / no new data): don't re-log or re-notify.
        return {"status": "SKIPPED", "plan_date": plan.date.isoformat()}

    pick_count = len(plan.payload.get("picks", []))
    DataUploadLog.objects.create(
        file_name=f"daily_plan_{plan.date.isoformat()}", upload_type="PLAN",
        status="SUCCESS", records_count=pick_count,
    )

    # Lazy cross-app imports (chat depends on the SDK; stocks services touch the
    # unmanaged price table) — keep them inside the task so import-time stays cheap
    # and tests can patch stocks.services.daily_plan.* on the module they import.
    import logging
    from django.db import transaction
    from chat.briefing import render_my_actions, render_plan_briefing
    from chat.models import ChatMessage, ChatSession
    from stocks.services.daily_plan import user_overlay
    from stocks.services.position_sizing import sizing_map_for_user

    logger = logging.getLogger(__name__)

    enabled_tiers = list(
        TierPermission.objects.filter(module_key="daily_plan", is_enabled=True)
        .values_list("tier", flat=True)
    )
    users = User.objects.filter(is_active=True).filter(
        Q(profile__subscription_tier__in=enabled_tiers) | Q(is_superuser=True)
    ).distinct()

    plan_prose = render_plan_briefing(plan)
    picks = plan.payload.get("picks", [])
    title = f"Morning Briefing — {plan.date.isoformat()}"
    notification_message = (
        f"{pick_count} high-confluence setup(s) for {plan.date.isoformat()} "
        f"(regime: {plan.regime})."
        if pick_count
        else f"No qualifying setups for {plan.date.isoformat()} (regime: {plan.regime})."
    )
    notified = 0
    for user in users:
        # Per-user resilience: if one user's overlay/sizing build blows up (e.g. a bad
        # holding row), log it and still notify them — falling back to /plan.
        redirect_url = "/plan"
        try:
            session = ChatSession.objects.filter(user=user, title=title).first()
            if session is None:
                overlay = user_overlay(user)
                sizing = sizing_map_for_user(user, picks)
                briefing = (
                    plan_prose
                    + "\n\nYour actions:\n"
                    + render_my_actions(overlay, sizing, picks)
                )
                with transaction.atomic():
                    session = ChatSession.objects.create(user=user, title=title)
                    ChatMessage.objects.create(
                        session=session,
                        role=ChatMessage.ROLE_ASSISTANT,
                        text=briefing,
                        # Frontend (MessageBubble.tsx) renders assistant `blocks` keyed on
                        # `kind`; a single `{"kind": "text", "subagent": None, "text": ...}`
                        # block is the exact shape streaming.py persists for plain assistant text.
                        blocks=[{"kind": "text", "subagent": None, "text": briefing}],
                    )
            redirect_url = f"/chat?session={session.id}"
        except Exception:
            logger.exception("morning-briefing build failed for user %s", user.pk)

        create_notification(
            user=user,
            notification_type="DAILY_PLAN_READY",
            title=f"Tomorrow's Plan ready — {plan.date.isoformat()}",
            message=notification_message,
            ticker="SUMMARY",
            redirect_url=redirect_url,
            metadata={"plan_date": plan.date.isoformat(), "picks": pick_count},
        )
        notified += 1
    return {"plan_date": plan.date.isoformat(), "picks": pick_count, "notified": notified}
