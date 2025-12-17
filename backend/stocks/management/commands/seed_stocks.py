from django.core.management.base import BaseCommand
from stocks.models import DailyStockPrice, DailyFloorsheet
from django.utils import timezone
import random
from datetime import timedelta
from decimal import Decimal

class Command(BaseCommand):
    help = 'Seeds database with dummy stock data'

    def handle(self, *args, **kwargs):
        self.stdout.write('Seeding data...')
        
        tickers = ['AAPL', 'GOOGL', 'TSLA', 'AMZN', 'MSFT', 'NFLX', 'NVDA', 'META']
        brokers = ['Broker 1', 'Broker 2', 'Broker 3', 'Broker 4', 'Broker 5']
        
        end_date = timezone.now().date()
        start_date = end_date - timedelta(days=365)
        
        # Seed Stock Prices
        daily_prices = []
        for ticker in tickers:
            current_price = Decimal(random.uniform(100, 1000))
            current_date = start_date
            
            while current_date <= end_date:
                # Random walk
                change = Decimal(random.uniform(-5, 5))
                open_price = current_price + change
                close_price = open_price + Decimal(random.uniform(-2, 2))
                high_price = max(open_price, close_price) + Decimal(random.uniform(0, 5))
                low_price = min(open_price, close_price) - Decimal(random.uniform(0, 5))
                volume = random.randint(1000, 1000000)
                
                daily_prices.append(DailyStockPrice(
                    ticker=ticker,
                    date=current_date,
                    open=open_price,
                    high=high_price,
                    low=low_price,
                    close=close_price,
                    volume=volume
                ))
                
                current_price = close_price
                current_date += timedelta(days=1)
                
        # Bulk create prices (chunks of 1000 to be safe)
        DailyStockPrice.objects.bulk_create(daily_prices, batch_size=1000, ignore_conflicts=True)
        self.stdout.write(f'Seeded {len(daily_prices)} stock price records.')

        # Seed Floorsheet
        floorsheets = []
        for i in range(500):
            ticker = random.choice(tickers)
            date = end_date - timedelta(days=random.randint(0, 30))
            qty = random.randint(10, 1000)
            rate = Decimal(random.uniform(100, 1000))
            amount = qty * rate
            
            floorsheets.append(DailyFloorsheet(
                transaction_id=f"TXN-{random.randint(100000, 999999)}",
                ticker=ticker,
                buyer_broker=random.choice(brokers),
                seller_broker=random.choice(brokers),
                quantity=qty,
                rate=rate,
                amount=amount,
                date=date
            ))
            
        DailyFloorsheet.objects.bulk_create(floorsheets, ignore_conflicts=True)
        self.stdout.write(f'Seeded {len(floorsheets)} floorsheet records.')
        
        self.stdout.write(self.style.SUCCESS('Successfully seeded database'))
