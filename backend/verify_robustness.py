import os
import django
import pandas as pd
import pandas_ta as ta
from backtesting import Backtest

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'stockastic.settings')
django.setup()

from stocks.models import Strategy, DailyStockPrice

def verify_all():
    # 1. Prepare NEPSE Index Data
    nepse_prices = DailyStockPrice.objects.filter(ticker='NEPSE').order_by('date')
    if not nepse_prices.exists():
        print("Error: No NEPSE data found")
        return
    
    index_df = pd.DataFrame(list(nepse_prices.values('date', 'open', 'high', 'low', 'close', 'volume')))
    index_df.columns = ['Date', 'Open', 'High', 'Low', 'Close', 'Volume']
    index_df.set_index('Date', inplace=True)
    index_df.index = pd.to_datetime(index_df.index)
    index_df = index_df.astype(float)
    
    # 2. Get a Sample Stock (NABIL)
    symbol = 'NABIL'
    stock_prices = DailyStockPrice.objects.filter(ticker=symbol).order_by('date')
    df = pd.DataFrame(list(stock_prices.values('date', 'open', 'high', 'low', 'close', 'volume')))
    df.columns = ['Date', 'Open', 'High', 'Low', 'Close', 'Volume']
    df.set_index('Date', inplace=True)
    df.index = pd.to_datetime(df.index)
    df = df.astype(float)
    
    # 3. Join Index Data & Pre-calculate Filter
    df['IndexClose'] = index_df['Close'].reindex(df.index).ffill()
    df['IndexSMA200'] = ta.sma(df['IndexClose'], length=200)
    df = df.ffill().fillna(0)
    
    strategies = Strategy.objects.filter(id__in=range(10, 51)).order_by('id')
    results = []
    
    print(f"{'ID':<4} | {'Name':<30} | {'Status':<10} | {'Comment'}")
    print("-" * 60)
    
    import inspect
    from backtesting import Strategy as BTStrategy
    import numpy as np

    for s in strategies:
        try:
            exec_globals = {'pd': pd, 'ta': ta, 'Strategy': BTStrategy, 'np': np}
            exec(s.code, exec_globals, exec_globals)
            
            strategy_class = None
            for name, obj in exec_globals.items():
                if inspect.isclass(obj) and issubclass(obj, BTStrategy) and obj is not BTStrategy:
                    strategy_class = obj
                    break
            
            if not strategy_class:
                results.append((s.id, s.name, "FAIL", "No Strategy class found"))
                continue
            
            bt = Backtest(df, strategy_class, cash=100000, commission=0.0036)
            stats = bt.run()
            results.append((s.id, s.name, "PASS", f"Trades: {stats['# Trades']}"))
            
        except Exception as e:
            results.append((s.id, s.name, "FAIL", str(e)[:50]))
            
    for rid, name, status, comment in results:
        print(f"{rid:<4} | {name[:30]:<30} | {status:<10} | {comment}")
        
    passed = sum(1 for r in results if r[2] == "PASS")
    print("-" * 60)
    print(f"Total: {len(results)}, Passed: {passed}, Failed: {len(results) - passed}")

if __name__ == "__main__":
    verify_all()
