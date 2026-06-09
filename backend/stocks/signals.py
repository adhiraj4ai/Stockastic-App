from django.db.models.signals import post_save, pre_delete
from django.dispatch import receiver
from .models import FinancialReport, StockFundamental, DailyStockPrice, PortfolioTransaction, TradePlanLeg
from django.db.models import Max
import logging

logger = logging.getLogger(__name__)

@receiver(post_save, sender=FinancialReport)
def sync_financials_to_fundamental(sender, instance, created, **kwargs):
    """
    Signal to update StockFundamental whenever a FinancialReport is saved.
    It checks if the saved report is the LATEST one for the ticker.
    If so, it propagates key metrics (EPS, BV, ROE) to the StockFundamental model.
    """
    ticker = instance.ticker
    logger.info(f"FinancialReport saved for {ticker}. Checking for sync...")

    # 1. Get the latest ANNUAL report for this ticker (not quarterly)
    latest_report = FinancialReport.objects.filter(
        ticker=ticker,
        report_type='ANNUAL'
    ).order_by('-fiscal_year').first()

    if not latest_report:
        return

    # If the instance saved is NOT the latest (e.g. editing an old report), we should still trigger
    # a sync based on the ACTUAL latest report to ensure consistency.
    # So we always use 'latest_report' to update Fundamental.

    try:
        fundamental, _ = StockFundamental.objects.get_or_create(ticker=ticker, defaults={
            'company_name': ticker, # Fallback
            'sector': 'Unknown'
        })
        
        # 2. Update Basic Metrics
        has_changes = False
        
        if latest_report.eps is not None:
             fundamental.eps = latest_report.eps
             has_changes = True
             
        if latest_report.book_value is not None:
             fundamental.book_value = latest_report.book_value
             has_changes = True
             
        if latest_report.return_on_equity is not None:
             fundamental.ro_equity = latest_report.return_on_equity
             has_changes = True

        # 3. Recalculate PE Ratio if possible
        # Formula: PE = Market Price / EPS
        if fundamental.eps and fundamental.eps > 0:
            latest_price = DailyStockPrice.objects.filter(ticker=ticker).order_by('-date').first()
            if latest_price and latest_price.close:
                new_pe = float(latest_price.close) / float(fundamental.eps)
                fundamental.pe_ratio = round(new_pe, 2)
                has_changes = True

        # 4. Save if updated
        if has_changes:
            fundamental.save()
            logger.info(f"Successfully synced StockFundamental for {ticker} from latest FinancialReport ({latest_report.fiscal_year} Q{latest_report.quarter}).")

    except Exception as e:
        logger.error(f"Error syncing StockFundamental for {ticker}: {e}")


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
