import os
import django
import sys

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'stockastic.settings')
django.setup()

from stocks.models import DailyStockPrice

def check():
    count = DailyStockPrice.objects.filter(ticker='NABIL').count()
    print(f"DailyStockPrice count for NABIL: {count}")
    
    if count > 0:
        latest = DailyStockPrice.objects.filter(ticker='NABIL').order_by('-date').first()
        print(f"Latest price: date={latest.date}, close={latest.close}")

if __name__ == "__main__":
    check()
