import os
import django
import sys
from datetime import timedelta

# Set up Django environment
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'stockastic.settings')
django.setup()

from stocks.models import DailyStockPrice, DailyFloorsheet
from stocks.analytics.smart_money import SmartMoneyAnalyzer

def debug_smart_money():
    print("--- Debugging Smart Money Analyzer ---")

    # 1. Check Data Availability
    earliest_price = DailyStockPrice.objects.order_by('date').first()
    latest_price = DailyStockPrice.objects.order_by('-date').first()
    price_count = DailyStockPrice.objects.count()

    earliest_tx = DailyFloorsheet.objects.order_by('transaction_date').first()
    latest_tx = DailyFloorsheet.objects.order_by('-transaction_date').first()
    tx_count = DailyFloorsheet.objects.count()

    print(f"Stock Prices: {price_count} records")
    if earliest_price:
        print(f"  Range: {earliest_price.date} to {latest_price.date}")
    else:
        print("  Range: None")

    print(f"Floorsheet Txs: {tx_count} records")
    if earliest_tx:
        print(f"  Range: {earliest_tx.transaction_date} to {latest_tx.transaction_date}")
    else:
        print("  Range: None")

    # 2. Run Analyzer with Default Settings
    analyzer = SmartMoneyAnalyzer(lookback_days=90, rally_threshold=0.10, rally_window=5)
    print("\n--- Finding Rallies ---")
    rallies = analyzer.find_rallies()
    print(f"Found {len(rallies)} rallies in the last {analyzer.lookback_days} days.")
    for r in rallies[:5]:
        print(f"  - {r['ticker']} on {r['rally_date']} (+{r['pct_gain']:.1%})")

    if not rallies:
        print("!! No rallies found. Try relaxing thresholds?")
        # Try relaxed thresholds
        analyzer_relaxed = SmartMoneyAnalyzer(lookback_days=180, rally_threshold=0.05, rally_window=10)
        rallies_relaxed = analyzer_relaxed.find_rallies()
        print(f"  [Relaxed] Found {len(rallies_relaxed)} rallies (5% gain in 10 days, 180 lookback).")

    print("\n--- Identifying Smart Brokers ---")
    smart_brokers = analyzer.identify_smart_brokers()
    print(f"Identified {len(smart_brokers)} smart brokers.")
    for b in smart_brokers[:5]:
        print(f"  - Broker {b[0]}: Score {b[1]}")

    print("\n--- Getting Whale Signals ---")
    signals = analyzer.get_whale_signals()
    print(f"Leaderboard Size: {len(signals['leaderboard'])}")
    print(f"Signals Count: {len(signals['signals'])}")
    for s in signals['signals'][:5]:
        print(f"  - Broker {s['broker_id']} buying {s['symbol']} (Amt: {s['amount']})")

if __name__ == "__main__":
    try:
        debug_smart_money()
    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
