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
        For each signal, checks ALL daily candles since the signal was generated
        to find the first day the target or stop loss was hit.
        Updates status, pnl_percent, and closed_date accordingly.
        """
        active_signals = GeneratedSignal.objects.filter(status='ACTIVE')
        if not active_signals.exists():
            logger.info("No active signals to evaluate.")
            return 0

        signals_by_symbol = defaultdict(list)
        for sig in active_signals:
            if sig.target_price is None or sig.stop_loss_price is None or sig.ltp <= 0:
                continue
            signals_by_symbol[sig.symbol].append(sig)

        evaluated_count = 0

        for symbol, signals in signals_by_symbol.items():
            # Find the earliest generation date among active signals for this symbol
            earliest_date = min(sig.generated_date for sig in signals)

            # Fetch all daily prices after the earliest generation date, in chronological order
            daily_prices = list(
                DailyStockPrice.objects
                .filter(ticker=symbol, date__gt=earliest_date)
                .order_by('date')
                .values('date', 'high', 'low', 'close')
            )

            if not daily_prices:
                continue

            for sig in signals:
                # Walk through each day after signal generation in order
                for day in daily_prices:
                    if day['date'] <= sig.generated_date:
                        continue

                    day_high = float(day['high'])
                    day_low = float(day['low'])
                    entry = float(sig.ltp)
                    target = float(sig.target_price)
                    stop_loss = float(sig.stop_loss_price)

                    if sig.signal == 'BUY':
                        # Check stop loss first (conservative: assume worst case hit first)
                        if day_low <= stop_loss:
                            sig.status = 'LOST'
                            sig.pnl_percent = ((stop_loss - entry) / entry) * 100
                            sig.closed_date = day['date']
                            break
                        elif day_high >= target:
                            sig.status = 'WON'
                            sig.pnl_percent = ((target - entry) / entry) * 100
                            sig.closed_date = day['date']
                            break

                    elif sig.signal == 'SELL':
                        # For SELL: stop loss is above entry, target is below
                        if day_high >= stop_loss:
                            sig.status = 'LOST'
                            sig.pnl_percent = ((entry - stop_loss) / entry) * 100
                            sig.closed_date = day['date']
                            break
                        elif day_low <= target:
                            sig.status = 'WON'
                            sig.pnl_percent = ((entry - target) / entry) * 100
                            sig.closed_date = day['date']
                            break

                if sig.status != 'ACTIVE':
                    sig.save(update_fields=['status', 'pnl_percent', 'closed_date'])
                    evaluated_count += 1
                    logger.info(f"Signal Evaluated: {sig.symbol} ({sig.signal}) -> {sig.status} at {sig.pnl_percent:.2f}%")

        return evaluated_count
