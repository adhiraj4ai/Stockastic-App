from django.db.models.signals import post_save, pre_delete
from django.dispatch import receiver
from .models import FinancialReport, StockFundamental, DailyStockPrice, PortfolioTransaction, TradePlanLeg
from django.db.models import Max
import logging

logger = logging.getLogger(__name__)

@receiver(post_save, sender=FinancialReport)
def sync_financials_to_fundamental(sender, instance, created, **kwargs):
    """Recalculate all derived StockFundamental metrics whenever a
    FinancialReport is saved (covers edits to old reports too, since the
    calculator always reads the actual latest reports)."""
    from .services.fundamental_calculator import recalculate_fundamentals

    try:
        recalculate_fundamentals(instance.ticker)
    except Exception as e:
        logger.error(f"Error syncing StockFundamental for {instance.ticker}: {e}")


@receiver(pre_delete, sender=PortfolioTransaction)
def reset_trade_plan_leg_on_transaction_delete(sender, instance, **kwargs):
    """
    When a PortfolioTransaction is deleted, reset any linked TradePlanLeg back
    to PENDING status and clear its transaction FK.
    Uses pre_delete so the FK still points to the instance before SET_NULL fires.
    """
    TradePlanLeg.objects.filter(transaction=instance).update(
        status=TradePlanLeg.LegStatus.PENDING,
        transaction=None,
    )
