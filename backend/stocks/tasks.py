import logging

from celery import shared_task
from django.contrib.auth.models import User
from django.db import models
from stocks.services.signals import default_orchestrator
from stocks.services.signal_episode.service import evaluate_active_episodes

logger = logging.getLogger(__name__)



@shared_task(bind=True, name='stocks.check_notifications')
def check_all_user_notifications(self):
    """
    Periodic task — checks all alert types for all active users via NotificationOrchestrator.
    """
    from stocks.services.notifications import default_orchestrator
    from django.contrib.auth.models import User

    total = 0
    for user in User.objects.filter(is_active=True):
        try:
            total += default_orchestrator.run(user)
        except Exception as exc:
            logger.error("Notification check failed for user %s: %s", user, exc)
    return total
def _resolve_snapshot_date():
    """Return the most recent date for which price data is available."""
    from stocks.models import DailyStockPrice
    from django.utils import timezone
    today = timezone.now().date()
    if DailyStockPrice.objects.filter(date=today).exists():
        return today
    entry = DailyStockPrice.objects.order_by('-date').first()
    return entry.date if entry else None


def _snapshot_account(account, today, nepse_index):
    """Create or update the snapshot for a single account.  Returns 1 if written, 0 if skipped."""
    from stocks.models import PortfolioItem, PortfolioSnapshot
    from stocks.services.portfolio_service import PortfolioService
    from decimal import Decimal
    items = PortfolioItem.objects.filter(account=account)
    if not items.exists():
        return 0
    enriched = PortfolioService.get_portfolio_metrics(items)
    invested = sum(Decimal(str(i.investment_value)) for i in enriched)
    current = sum(Decimal(str(i.current_value)) for i in enriched)
    PortfolioSnapshot.objects.update_or_create(
        user=account.user, account=account, date=today,
        defaults={'total_value': current + account.balance, 'invested_value': invested,
                  'cash_balance': account.balance, 'nepse_index': nepse_index},
    )
    return 1


@shared_task(bind=True, name='stocks.capture_portfolio_snapshots')
def capture_portfolio_snapshots(self):
    """Daily task to capture portfolio snapshots for all users after market close."""
    from stocks.models import DailyStockPrice, PortfolioAccount
    today = _resolve_snapshot_date()
    if today is None:
        return "No price data found to create snapshots."
    nepse_index = DailyStockPrice.objects.filter(date=today).aggregate(
        total=models.Sum('close')
    )['total'] or 0
    created_count = sum(
        _snapshot_account(account, today, nepse_index)
        for account in PortfolioAccount.objects.all()
    )
    return f"Captured {created_count} snapshots for {today}."


@shared_task
def generate_all_signals_task():
    """Daily: run every signal engine, then resolve ACTIVE episodes on TP/SL."""
    saved = default_orchestrator.generate_all(None)
    closed = evaluate_active_episodes()
    return {"signals_saved": saved, "episodes_closed": closed}


@shared_task
def evaluate_episodes_task():
    """Resolve ACTIVE SignalEpisodes against latest prices (TP/SL hits)."""
    return {"episodes_closed": evaluate_active_episodes()}


def _build_plan_or_fail():
    """Run build_daily_plan(); on exception log to DataUploadLog and re-raise as dict."""
    from stocks.models import DataUploadLog
    from stocks.services import daily_plan as daily_plan_service
    try:
        return daily_plan_service.build_daily_plan(), None
    except Exception as exc:
        DataUploadLog.objects.create(
            file_name="daily_plan", upload_type="PLAN", status="FAILED", error_message=str(exc),
        )
        return None, {"status": "FAILED", "error": str(exc)}


def _log_plan_success(plan, pick_count):
    from stocks.models import DataUploadLog
    DataUploadLog.objects.create(
        file_name=f"daily_plan_{plan.date.isoformat()}", upload_type="PLAN",
        status="SUCCESS", records_count=pick_count,
    )


def _entitled_users(enabled_tiers):
    from django.contrib.auth.models import User
    from django.db.models import Q
    return User.objects.filter(is_active=True).filter(
        Q(profile__subscription_tier__in=enabled_tiers) | Q(is_superuser=True)
    ).distinct()


def _get_or_create_briefing_session(user, title, plan_prose, picks):
    """Return (session, redirect_url) for the morning-briefing chat session."""
    import logging
    from django.db import transaction
    from chat.briefing import render_my_actions, render_plan_briefing
    from chat.models import ChatMessage, ChatSession
    from stocks.services.daily_plan import user_overlay
    from stocks.services.position_sizing import sizing_map_for_user
    _log = logging.getLogger(__name__)
    session = ChatSession.objects.filter(user=user, title=title).first()
    if session is not None:
        return session, f"/chat?session={session.id}"
    overlay = user_overlay(user)
    sizing = sizing_map_for_user(user, picks)
    briefing = plan_prose + "\n\nYour actions:\n" + render_my_actions(overlay, sizing, picks)
    with transaction.atomic():
        session = ChatSession.objects.create(user=user, title=title)
        ChatMessage.objects.create(
            session=session, role=ChatMessage.ROLE_ASSISTANT, text=briefing,
            blocks=[{"kind": "text", "subagent": None, "text": briefing}],
        )
    return session, f"/chat?session={session.id}"


def _notify_user_plan_ready(user, plan, pick_count, notification_message):
    """Build/link the morning-briefing session and create the DAILY_PLAN_READY notification."""
    import logging
    from chat.briefing import render_plan_briefing
    from stocks.services.notification_service import create_notification
    _log = logging.getLogger(__name__)
    title = f"Morning Briefing — {plan.date.isoformat()}"
    redirect_url = "/plan"
    try:
        plan_prose = render_plan_briefing(plan)
        picks = plan.payload.get("picks", [])
        _session, redirect_url = _get_or_create_briefing_session(user, title, plan_prose, picks)
    except Exception:
        _log.exception("morning-briefing build failed for user %s", user.pk)
    create_notification(
        user=user, notification_type="DAILY_PLAN_READY",
        title=f"Tomorrow's Plan ready — {plan.date.isoformat()}",
        message=notification_message, ticker="SUMMARY",
        redirect_url=redirect_url,
        metadata={"plan_date": plan.date.isoformat(), "picks": pick_count},
    )


@shared_task
def generate_daily_plan_task():
    """Nightly: build tomorrow's trading plan, then notify entitled users."""
    from users.models import TierPermission
    plan, err = _build_plan_or_fail()
    if err:
        return err
    if not getattr(plan, "was_regenerated", True):
        return {"status": "SKIPPED", "plan_date": plan.date.isoformat()}
    pick_count = len(plan.payload.get("picks", []))
    _log_plan_success(plan, pick_count)
    enabled_tiers = list(
        TierPermission.objects.filter(module_key="daily_plan", is_enabled=True)
        .values_list("tier", flat=True)
    )
    notification_message = (
        f"{pick_count} high-confluence setup(s) for {plan.date.isoformat()} (regime: {plan.regime})."
        if pick_count
        else f"No qualifying setups for {plan.date.isoformat()} (regime: {plan.regime})."
    )
    notified = 0
    for user in _entitled_users(enabled_tiers):
        _notify_user_plan_ready(user, plan, pick_count, notification_message)
        notified += 1
    return {"plan_date": plan.date.isoformat(), "picks": pick_count, "notified": notified}


@shared_task
def refresh_fundamentals_task():
    """Daily: recompute derived fundamentals (P/E, P/B, yields, growth) so
    price-dependent ratios track the latest close instead of going stale."""
    from stocks.services.fundamental_calculator import recalculate_all_fundamentals
    return {"tickers_updated": recalculate_all_fundamentals()}


@shared_task(bind=True, name="stocks.scan_accumulation_candidates")
def scan_accumulation_candidates_task(self):
    """Daily: rank accumulation candidates after broker analysis lands."""
    from stocks.services.accumulation.scanner import AccumulationScanner
    return {"candidates_identified": AccumulationScanner.scan_and_save_candidates()}
