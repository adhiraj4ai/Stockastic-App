from django.core.management.base import BaseCommand
from stocks.models import PortfolioTransaction, PortfolioItem, TransactionType
from django.db import transaction
from django.db.models import Sum

class Command(BaseCommand):
    help = 'Recalculates PortfolioItem quantities and WACC based on PortfolioTransaction history'

    def handle(self, *args, **options):
        self.stdout.write("Recalculating portfolio...")
        
        # 1. Reset all items to 0 (or delete?) - safer to iterate items
        items = PortfolioItem.objects.all()
        
        with transaction.atomic():
            for item in items:
                txns = PortfolioTransaction.objects.filter(
                    user=item.user, 
                    account=item.account, 
                    ticker=item.ticker
                ).order_by('transaction_date', 'created_at')
                
                if not txns.exists():
                    self.stdout.write(f"Deleting empty item: {item}")
                    item.delete()
                    continue

                qty = 0
                wacc = 0.0
                
                for txn in txns:
                    if txn.transaction_type in [TransactionType.BUY, TransactionType.BONUS]:
                        # Calculate cost
                        if txn.transaction_type == TransactionType.BUY:
                            cost = float(txn.quantity * txn.rate) + float(txn.commission + txn.sebon_fee + txn.dp_charge)
                        else:
                            cost = 0 # Bonus
                            
                        old_val = qty * wacc
                        qty += txn.quantity
                        if qty > 0:
                            wacc = (old_val + cost) / qty
                            
                    elif txn.transaction_type == TransactionType.SELL:
                        qty -= txn.quantity
                        # WACC doesn't change on sell, only realizable gain/loss
                        
                # Update item
                if qty <= 0:
                    self.stdout.write(f"Item {item} has 0 or negative quantity ({qty}). Deleting.")
                    item.delete()
                else:
                    item.quantity = qty
                    item.wacc = wacc
                    item.buy_price = wacc
                    item.save()
                    self.stdout.write(f"Updated {item.ticker}: Qty={qty}, WACC={wacc:.2f}")

        self.stdout.write(self.style.SUCCESS("Portfolio recalculation complete."))
