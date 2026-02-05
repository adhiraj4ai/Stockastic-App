from django.core.management.base import BaseCommand
from stocks.models import PortfolioTransaction, PortfolioItem, TransactionType
from django.db import transaction
from django.db.models import Sum

class Command(BaseCommand):
    help = 'Recalculates PortfolioItem quantities and WACC based on PortfolioTransaction history'

    def handle(self, *args, **options):
        self.stdout.write("Recalculating portfolio...")
        
        items = PortfolioItem.objects.all()
        processed = 0
        
        with transaction.atomic():
            for item in items:
                ticker = item.ticker
                user = item.user
                account = item.account
                
                result = PortfolioService.recalculate_item(user, account, ticker)
                if result:
                    self.stdout.write(f"Updated {ticker}: Qty={result.quantity}, WACC={result.wacc:.2f}")
                else:
                    self.stdout.write(f"Item {ticker} deleted (0 quantity or no transactions)")
                
                processed += 1

        self.stdout.write(self.style.SUCCESS(f"Portfolio recalculation complete. Processed {processed} items."))

        self.stdout.write(self.style.SUCCESS("Portfolio recalculation complete."))
