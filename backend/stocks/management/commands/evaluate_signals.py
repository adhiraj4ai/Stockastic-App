from django.core.management.base import BaseCommand
from django.utils import timezone
from decimal import Decimal
from stocks.models import GeneratedSignal, DailyStockPrice
from django.db import transaction

class Command(BaseCommand):
    help = 'Evaluates active signals against latest market prices to update won/lost status'

    def handle(self, *args, **options):
        active_signals = GeneratedSignal.objects.filter(status='ACTIVE')
        self.stdout.write(f"Found {active_signals.count()} active signals to evaluate.")

        won_count: int = 0
        lost_count: int = 0
        
        # Get latest prices for all symbols in active signals
        symbols = active_signals.values_list('symbol', flat=True).distinct()
        latest_prices = {}
        
        for symbol in symbols:
            latest_price = DailyStockPrice.objects.filter(ticker=symbol).order_by('-date').first()
            if latest_price:
                latest_prices[symbol] = latest_price.close

        with transaction.atomic():
            for sig in active_signals:
                current_price = latest_prices.get(sig.symbol)
                if not current_price:
                    continue
                
                # Convert to Decimal for comparison if needed
                curr = Decimal(str(current_price))
                target = sig.target_price
                sl = sig.stop_loss_price
                entry = sig.ltp
                
                new_status = None
                
                if sig.signal == 'BUY':
                    if target and curr >= target:
                        new_status = 'WON'
                    elif sl and curr <= sl:
                        new_status = 'LOST'
                elif sig.signal == 'SELL':
                    if target and curr <= target:
                        new_status = 'WON'
                    elif sl and curr >= sl:
                        new_status = 'LOST'
                
                if new_status:
                    sig.status = new_status
                    sig.closed_date = timezone.now().date()
                    # Calculate PnL
                    if entry and entry > 0:
                        if sig.signal == 'BUY':
                            sig.pnl_percent = ((curr - entry) / entry) * 100
                        else:
                            sig.pnl_percent = ((entry - curr) / entry) * 100
                    
                    sig.save()
                    if new_status == 'WON':
                        won_count += 1
                    else:
                        lost_count += 1

        self.stdout.write(self.style.SUCCESS(f"Evaluation complete: {won_count} WON, {lost_count} LOST."))
