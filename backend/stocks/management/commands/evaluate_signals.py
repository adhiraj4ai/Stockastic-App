from django.core.management.base import BaseCommand
from django.utils import timezone
from decimal import Decimal
from stocks.models import GeneratedSignal, DailyStockPrice
from django.db import transaction

class Command(BaseCommand):
    help = 'Evaluates active signals against historical market prices (High/Low) to update won/lost status'

    def handle(self, *args, **options):
        active_signals = GeneratedSignal.objects.filter(status='ACTIVE')
        total_count = active_signals.count()
        self.stdout.write(f"Evaluating {total_count} active signals...")

        won_count = 0
        lost_count = 0
        processed_count = 0

        # Optimization: Map all prices since the oldest active signal to memory 
        # to avoid thousands of small DB queries if possible, but 3000 signals is manageable with prefetching.
        
        for sig in active_signals:
            processed_count += 1
            if processed_count % 100 == 0:
                self.stdout.write(f"Processed {processed_count}/{total_count} signals...")

            # Get all price action since the signal was generated, in chronological order
            prices = DailyStockPrice.objects.filter(
                ticker=sig.symbol, 
                date__gte=sig.generated_date
            ).order_by('date')

            target = sig.target_price
            sl = sig.stop_loss_price
            entry = sig.ltp

            new_status = None
            hit_date = None
            hit_price = None

            for p in prices:
                curr_high = Decimal(str(p.high))
                curr_low = Decimal(str(p.low))
                curr_close = Decimal(str(p.close))

                if sig.signal == 'BUY':
                    # Check Target Hit first (High of day)
                    if target and curr_high >= target:
                        new_status = 'WON'
                        hit_price = target # Conservative: user exit at target
                        hit_date = p.date
                        break
                    # Check SL Hit (Low of day)
                    elif sl and curr_low <= sl:
                        new_status = 'LOST'
                        hit_price = sl # Conservative
                        hit_date = p.date
                        break
                elif sig.signal == 'SELL':
                    # Check Target Hit (Low of day)
                    if target and curr_low <= target:
                        new_status = 'WON'
                        hit_price = target
                        hit_date = p.date
                        break
                    # Check SL Hit (High of day)
                    elif sl and curr_high >= sl:
                        new_status = 'LOST'
                        hit_price = sl
                        hit_date = p.date
                        break

            if new_status:
                with transaction.atomic():
                    sig.status = new_status
                    sig.closed_date = hit_date
                    
                    # Calculate PnL based on hit price
                    if entry and entry > 0:
                        if sig.signal == 'BUY':
                            sig.pnl_percent = ((hit_price - entry) / entry) * 100
                        else:
                            sig.pnl_percent = ((entry - hit_price) / entry) * 100
                    
                    sig.save()
                    if new_status == 'WON':
                        won_count += 1
                    else:
                        lost_count += 1

        self.stdout.write(f"Evaluation complete: {won_count} WON, {lost_count} LOST.")
