
import os
import django
from django.db import connection

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'stockastic.settings')
django.setup()

def check_counts():
    tables = [
        'daily_cumulative_accumulation',
        'daily_floorsheet',
        'companies',
        'daily_stock_price'
    ]
    
    print("Checking row counts for Accumulation tables:")
    print("-" * 50)
    
    with connection.cursor() as cursor:
        for table in tables:
            try:
                cursor.execute(f"SELECT COUNT(*) FROM {table}")
                count = cursor.fetchone()[0]
                print(f"{table}: {count}")
                
                # Check for test data in companies
                if table == 'companies':
                    cursor.execute("SELECT COUNT(*) FROM companies WHERE \"sectorName\" = 'Unknown' OR \"sectorName\" IS NULL")
                    unknown_sector = cursor.fetchone()[0]
                    print(f"  - Companies with Unknown/NULL sector: {unknown_sector}")
                    
                    cursor.execute("SELECT COUNT(*) FROM companies WHERE status = 'A'")
                    active_status = cursor.fetchone()[0]
                    print(f"  - Companies with status='A': {active_status}")

            except Exception as e:
                print(f"{table}: Error - {str(e)}")

        # Check accumulation data details
        print("-" * 50)
        print("Checking daily_cumulative_accumulation details:")
        cursor.execute("SELECT MAX(transaction_date) FROM daily_cumulative_accumulation")
        max_date = cursor.fetchone()[0]
        print(f"Latest transaction_date in accumulation: {max_date}")

if __name__ == '__main__':
    check_counts()
