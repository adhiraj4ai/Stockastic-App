import logging
from datetime import date, timedelta
from collections import defaultdict
from ..models import GeneratedSignal
from ..models.market import DailyStockPrice

logger = logging.getLogger(__name__)

# Signals without TP/SL older than this many days are auto-closed
ORPHAN_EXPIRY_DAYS = 30


class SignalEvaluationService:
    """Evaluates the mathematical success/failure of generated signals."""

    @staticmethod
    def evaluate_active_signals():
        """
        Loops through all 'ACTIVE' signals.
        1. Signals with valid TP/SL: checks ALL daily candles since generation
           to find the first day the target or stop loss was hit.
        2. Orphaned signals (missing TP/SL or LTP): attempts to backfill levels
           from current price data, or auto-closes if too old.
        """
        active_signals = list(GeneratedSignal.objects.filter(status='ACTIVE'))
        if not active_signals:
            logger.info("No active signals to evaluate.")
            return 0

        evaluated_count = 0
        today = date.today()

        # Separate valid signals from orphaned ones
        valid_signals = defaultdict(list)
        orphaned_signals = []

        for sig in active_signals:
            if sig.target_price is None or sig.stop_loss_price is None or sig.ltp <= 0:
                orphaned_signals.append(sig)
            else:
                valid_signals[sig.symbol].append(sig)

        # --- Handle orphaned signals (missing TP/SL) ---
        evaluated_count += SignalEvaluationService._handle_orphaned_signals(
            orphaned_signals, today
        )

        # --- Evaluate valid signals ---
        for symbol, signals in valid_signals.items():
            earliest_date = min(sig.generated_date for sig in signals)

            daily_prices = list(
                DailyStockPrice.objects
                .filter(ticker=symbol, date__gt=earliest_date)
                .order_by('date')
                .values('date', 'high', 'low', 'close')
            )

            if not daily_prices:
                continue

            for sig in signals:
                for day in daily_prices:
                    if day['date'] <= sig.generated_date:
                        continue

                    day_high = float(day['high'])
                    day_low = float(day['low'])
                    entry = float(sig.ltp)
                    target = float(sig.target_price)
                    stop_loss = float(sig.stop_loss_price)

                    if sig.signal == 'BUY':
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

    @staticmethod
    def _handle_orphaned_signals(orphaned_signals, today):
        """
        Handle signals missing target_price, stop_loss_price, or ltp.
        1. Try to backfill levels using the LTP at generation time.
        2. If too old (> ORPHAN_EXPIRY_DAYS), auto-close with realized PnL.
        """
        count = 0
        expiry_cutoff = today - timedelta(days=ORPHAN_EXPIRY_DAYS)

        for sig in orphaned_signals:
            # Try to backfill LTP from the day's close if missing
            if sig.ltp <= 0:
                price_on_date = (
                    DailyStockPrice.objects
                    .filter(ticker=sig.symbol, date=sig.generated_date)
                    .values_list('close', flat=True)
                    .first()
                )
                if price_on_date and float(price_on_date) > 0:
                    sig.ltp = float(price_on_date)
                    logger.info(f"Backfilled LTP for {sig.symbol}: {sig.ltp}")
                else:
                    # Can't determine entry — auto-close if old
                    if sig.generated_date <= expiry_cutoff:
                        sig.status = 'CLOSED_MANUAL'
                        sig.closed_date = today
                        sig.save(update_fields=['status', 'closed_date'])
                        count += 1
                        logger.info(f"Auto-closed orphaned signal {sig.symbol} (no LTP, expired)")
                    continue

            ltp = float(sig.ltp)

            # Backfill TP/SL using the standard generation formula
            if sig.target_price is None or sig.stop_loss_price is None:
                metadata = sig.metadata or {}
                if sig.signal == 'BUY':
                    tp1 = round(ltp * 1.05, 2)
                    tp2 = round(ltp * 1.10, 2)
                    tp3 = round(ltp * 1.15, 2)
                    wac = metadata.get('top_broker_wac', 0)
                    sl = round(wac * 0.98, 2) if (wac > 0 and wac < ltp) else round(ltp * 0.95, 2)
                else:
                    tp1 = round(ltp * 0.95, 2)
                    tp2 = round(ltp * 0.90, 2)
                    tp3 = round(ltp * 0.85, 2)
                    sl = round(ltp * 1.05, 2)

                sig.target_price = tp2
                sig.stop_loss_price = sl
                metadata.update({'tp1': tp1, 'tp2': tp2, 'tp3': tp3, 'sl': sl})
                sig.metadata = metadata
                sig.save(update_fields=['ltp', 'target_price', 'stop_loss_price', 'metadata'])
                count += 1
                logger.info(f"Backfilled TP/SL for {sig.symbol}: TP={tp2}, SL={sl}")

        return count
