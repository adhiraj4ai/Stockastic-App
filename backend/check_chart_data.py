import os
import django
import sys

# Setup Django
sys.path.append('/Users/jugalraj/Documents/Projects/Stockastic/backend')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'stockastic.settings')
django.setup()

from stocks.models import DailyStockPrice, DailyFloorsheet, Company
from django.db.models import Count, Min, Max

def debug_data():
    print("--- Companies ---")
    company_count = Company.objects.count()
    print(f"Total Companies: {company_count}")
    
    print("\n--- Daily Stock Price ---")
    price_count = DailyStockPrice.objects.count()
    latest_price = DailyStockPrice.objects.order_by('-date').first()
    print(f"Total Price Records: {price_count}")
    if latest_price:
        print(f"Latest Price Date: {latest_price.date}")
        
    print("\n--- Daily Floorsheet ---")
    floorsheet_count = DailyFloorsheet.objects.count()
    latest_f = DailyFloorsheet.objects.order_by('-transaction_date').first()
    print(f"Total Floorsheet Records: {floorsheet_count}")
    if latest_f:
        print(f"Latest Floorsheet Date: {latest_f.transaction_date}")
        print(f"Example DateTime: {latest_f.transaction_datetime}")

    # Check for a specific symbol, e.g., 'RADHI'
    print("\n--- RADHI Data Check ---")
    radhi_prices = DailyStockPrice.objects.filter(ticker='RADHI').count()
    radhi_f = DailyFloorsheet.objects.filter(symbol='RADHI').count()
    print(f"RADHI Price Records: {radhi_prices}")
    print(f"RADHI Floorsheet Records: {radhi_f}")

if __name__ == "__main__":
    debug_data()
