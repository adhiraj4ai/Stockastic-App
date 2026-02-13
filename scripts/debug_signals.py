import os
import django
from django.db import connections
from django.conf import settings

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

def check_accumulation():
    with connections['default'].cursor() as cursor:
        # Check latest date
        cursor.execute("""
            SELECT transaction_date, COUNT(*) 
            FROM daily_cumulative_accumulation 
            GROUP BY transaction_date 
            ORDER BY transaction_date DESC 
            LIMIT 5
        """)
        dates = cursor.fetchall()
        print("\nLatest Accumulation Dates:")
        for d in dates:
            print(f"Date: {d[0]}, Count: {d[1]}")

        # Check distribution of cumulative_net for the latest date
        if dates:
            latest_date = dates[0][0]
            cursor.execute("""
                SELECT 
                    COUNT(*) as total,
                    COUNT(*) FILTER (WHERE cumulative_net > 0) as pos_acc,
                    COUNT(*) FILTER (WHERE cumulative_net > 10000) as gt_10k,
                    COUNT(*) FILTER (WHERE cumulative_net > 50000) as gt_50k,
                    COUNT(*) FILTER (WHERE cumulative_net > 100000) as gt_100k
                FROM daily_cumulative_accumulation
                WHERE transaction_date = %s
            """, [latest_date])
            dist = cursor.fetchone()
            print(f"\nDistribution for {latest_date}:")
            print(f"Total Records: {dist[0]}")
            print(f"Positive Net: {dist[1]}")
            print(f"> 10k: {dist[2]}")
            print(f"> 50k: {dist[3]}")
            print(f"> 100k: {dist[4]}")

if __name__ == "__main__":
    check_accumulation()
