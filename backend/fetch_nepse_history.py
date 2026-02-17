
import os
import django
import sys
import datetime
import time

# Set up Django environment
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "stockastic.settings")
django.setup()

from stocks.models import DailyStockPrice
from decimal import Decimal

def fetch_nepse_history():
    """
    Fetches historical NEPSE index data.
    Ideally, this should call an external API.
    For now, we will simulate it or use existing data if available.
    If 'NEPSE' ticker data exists in DailyStockPrice, we are good.
    """
    print("Checking for existing NEPSE data...")
    
    count = DailyStockPrice.objects.filter(ticker='NEPSE').count()
    if count > 0:
        print(f"Found {count} records for NEPSE index.")
        latest = DailyStockPrice.objects.filter(ticker='NEPSE').order_by('-date').first()
        print(f"Latest record: {latest.date} - Close: {latest.close}")
    else:
        print("No NEPSE data found in DailyStockPrice.")
        # Verification Step:
        # Check if there are other indices like 'NEPSE Index' or similar
        potential_tickers = DailyStockPrice.objects.filter(ticker__icontains='NEPSE').values_list('ticker', flat=True).distinct()
        print(f"Potential matches: {list(potential_tickers)}")

if __name__ == '__main__':
    fetch_nepse_history()
