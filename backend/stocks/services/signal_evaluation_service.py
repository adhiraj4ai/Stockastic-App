import logging
from datetime import date
from collections import defaultdict
from ..models import GeneratedSignal
from ..models.market import DailyStockPrice

logger = logging.getLogger(__name__)

class SignalEvaluationService:
    """Evaluates the mathematical success/failure of generated signals."""

    @staticmethod
    def evaluate_active_signals():
        """
        Loops through all 'ACTIVE' signals.
        Checks if the daily price action has hit the target_price or stop_loss_price.
        Updates status, pnl_percent, and closed_date accordingly.
        """
        active_signals = GeneratedSignal.objects.filter(status='ACTIVE')
        if not active_signals.exists():
            logger.info("No active signals to evaluate.")
            return 0

        # Group by symbol to optimize price lookups
        signals_by_symbol = defaultdict(list)
        for sig in active_signals:
            if sig.target_price is None or sig.stop_loss_price is None or sig.ltp <= 0:
                continue
            signals_by_symbol[sig.symbol].append(sig)

        evaluated_count = 0
        today = date.today()

        for symbol, signals in signals_by_symbol.items():
            # Get the latest price for the symbol
            latest_price_obj = DailyStockPrice.objects.filter(ticker=symbol).order_by('-date').first()
            if not latest_price_obj:
                continue

            # In a real rigorous backtester, we'd check all days between 'generated_date' and 'today'. 
            # Because this runs daily, checking just the latest day's high/low is usually sufficient.
            latest_high = latest_price_obj.high
            latest_low = latest_price_obj.low
            latest_close = latest_price_obj.close
            latest_date = latest_price_obj.date

            for sig in signals:
                # Can't evaluate on the exact generation day realistically unless intraday data
                if sig.generated_date >= latest_date:
                    continue

                status_updated = False
                
                if sig.signal == 'BUY':
                    # Hit Stop Loss first in the daily candle (conservative assumption)
                    if latest_low <= sig.stop_loss_price:
                        sig.status = 'LOST'
                        sig.pnl_percent = ((sig.stop_loss_price - sig.ltp) / sig.ltp) * 100
                        sig.closed_date = latest_date
                        status_updated = True
                    # Hit Target
                    elif latest_high >= sig.target_price:
                        sig.status = 'WON'
                        sig.pnl_percent = ((sig.target_price - sig.ltp) / sig.ltp) * 100
                        sig.closed_date = latest_date
                        status_updated = True

                elif sig.signal == 'SELL':
                    # Hit Stop Loss first
                    if latest_high >= sig.stop_loss_price:
                        sig.status = 'LOST'
                        sig.pnl_percent = ((sig.ltp - sig.stop_loss_price) / sig.ltp) * 100
                        sig.closed_date = latest_date
                        status_updated = True
                    # Hit Target
                    elif latest_low <= sig.target_price:
                        sig.status = 'WON'
                        sig.pnl_percent = ((sig.ltp - sig.target_price) / sig.ltp) * 100
                        sig.closed_date = latest_date
                        status_updated = True

                if status_updated:
                    sig.save(update_fields=['status', 'pnl_percent', 'closed_date'])
                    evaluated_count += 1
                    logger.info(f"Signal Evaluated: {sig.symbol} ({sig.signal}) -> {sig.status} at {sig.pnl_percent:.2f}%")

        return evaluated_count
