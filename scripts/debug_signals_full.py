import os
import django
from django.db import connections

import sys
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.append(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'backend'))

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

def debug_signal_generation():
    query = """
    WITH trend_data AS (
        SELECT 
            ca.*,
            MAX(ca.transaction_date) FILTER (WHERE ca.transaction_date IN (
                SELECT transaction_date FROM daily_cumulative_accumulation 
                GROUP BY transaction_date HAVING COUNT(*) > 100
            )) OVER () AS latest_date
        FROM daily_cumulative_accumulation ca
        INNER JOIN companies c ON ca.symbol = c.symbol
        WHERE c."instrumentType" NOT IN ('Mutual Funds', 'Non-Convertible Debentures')
    )
    SELECT 
        td.symbol, 
        td.entity_id as broker, 
        td.cumulative_net,
        ROUND(td.cumulative_buy_amount / NULLIF(td.cumulative_buy, 0), 2) as wac,
        dsp.close as ltp,
        td.transaction_date,
        td.latest_date
    FROM trend_data td
    INNER JOIN companies c ON td.symbol = c.symbol
    LEFT JOIN (
        SELECT DISTINCT ON (symbol) symbol, close 
        FROM daily_stock_price ORDER BY symbol, transaction_date DESC
    ) dsp ON td.symbol = dsp.symbol
    WHERE td.transaction_date = td.latest_date
    AND td.cumulative_net > 10000 
    ORDER BY td.cumulative_net DESC;
    """
    
    print("Executing query...")
    with connections['default'].cursor() as cursor:
        cursor.execute(query)
        columns = [col[0] for col in cursor.description]
        results = [dict(zip(columns, row)) for row in cursor.fetchall()]

    print(f"Query returned {len(results)} rows.")
    
    signals = []
    seen_symbols = set()

    print("\n--- Processing Rows ---")
    for row in results[:10]: # Check first 10
        print(f"Symbol: {row['symbol']}, Net: {row['cumulative_net']}, WAC: {row['wac']}, LTP: {row['ltp']}")
        
        if row['symbol'] in seen_symbols:
            continue

        ltp = row['ltp']
        wac = row['wac']
        
        if not ltp or not wac:
            print(f"  -> SKIPPED: Missing LTP or WAC")
            continue

        markup = ((float(ltp) - float(wac)) / float(wac)) * 100
        print(f"  -> Markup: {markup:.2f}%")

        signal_type = None
        if -5 <= markup <= 5:
            signal_type = "Platinum Buy"
        elif 5 < markup <= 15:
            signal_type = "Momentum Buy"
        elif markup < -5:
             signal_type = "Contrarian Buy" 
        else:
             signal_type = "Watchlist"
        
        print(f"  -> Signal: {signal_type}")
        
        if signal_type:
            signals.append(row)
            seen_symbols.add(row['symbol'])

    print(f"\nTotal Generated Signals: {len(signals)}")
    from collections import Counter
    types = [s.get('signal_type', 'Unknown') for s in signals] # This script logic doesn't actually add signal_type to row in the loop above for counting, fixing that logic mentally or in code
    # Re-simulating the loop for counting correctly
    final_types = []
    seen = set()
    for row in results:
        if row['symbol'] in seen: continue
        if not row['ltp'] or not row['wac']: continue
        markup = ((float(row['ltp']) - float(row['wac'])) / float(row['wac'])) * 100
        if -5 <= markup <= 5: t = "Platinum Buy"
        elif 5 < markup <= 15: t = "Momentum Buy"
        elif markup < -5: t = "Contrarian Buy"
        else: t = "Watchlist"
        final_types.append(t)
        seen.add(row['symbol'])
        
    print("\nSignal Distribution:")
    print(Counter(final_types))

if __name__ == "__main__":
    debug_signal_generation()
