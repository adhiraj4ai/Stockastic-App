import os
import sys
import django
import pandas as pd
from backtesting import Backtest
import traceback

# Setup Django environment
sys.path.append(os.path.join(os.getcwd(), 'backend'))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'stockastic.settings')
django.setup()

from stocks.models import Strategy, DailyStockPrice

def verify_strategies(symbol='NABIL'):
    print(f"Starting verification of strategies against {symbol}...")
    
    # 1. Fetch Data
    print(f"Fetching historical data for {symbol}...")
    ticks = list(DailyStockPrice.objects.filter(ticker=symbol).order_by('date').values('date', 'open', 'high', 'low', 'close', 'volume'))
    
    if not ticks:
        print(f"No data found for {symbol}!")
        return

    df = pd.DataFrame(ticks)
    df.rename(columns={'open':'Open','high':'High','low':'Low','close':'Close','volume':'Volume'}, inplace=True)
    df[['Open','High','Low','Close','Volume']] = df[['Open','High','Low','Close','Volume']].astype(float)
    df['date'] = pd.to_datetime(df['date'])
    df.set_index('date', inplace=True)
    
    # 2. Get Strategies
    strategies = Strategy.objects.all().order_by('id')
    print("-" * 60)
    
    passed_count = 0
    failed_count = 0
    failed_list = []
    
    for s in strategies:
        try:
            # Dynamic Strat Execution
            # logic: We must use a single dictionary for both globals and locals 
            # so that functions defined in the executed code can see variables (imports) defined in the same code.
            
            strat_scope = {'symbol': symbol} # Pass symbol as a 'global'
            exec(s.code, strat_scope, strat_scope)
            
            # Find the class
            # We need to find the class defined in this code that inherits from Strategy
            strat_class = None
            BaseStrategy = strat_scope.get('Strategy')
            
            for name, obj in strat_scope.items():
                # Must be a class, must not be 'Strategy' itself, and must inherit from Strategy
                if isinstance(obj, type) and name != 'Strategy':
                     if BaseStrategy and issubclass(obj, BaseStrategy):
                         # Prefer the class defined in this module (not imported) if possible
                         # But we can't easily check definition location without inspect
                         # Heuristic: The class name usually matches the strategy name loosely, 
                         # or it's the one that is NOT 'SMA' or 'Strategy'.
                         # Let's take the LAST valid one, as imports usually come first.
                         strat_class = obj
            
            if not strat_class:
                print(f"Skipping {s.name}: No class found.")
                continue
                
            bt = Backtest(df, strat_class, cash=100_000, commission=.002)
            stats = bt.run()
            
            # Basic validation
            ret = stats['Return [%]']
            dd = stats['Max. Drawdown [%]']
            trades = stats['# Trades']
            
            print(f"SUCCESS {s.name:<30} (Ret: {ret:.2f}%, Drawdown: {dd:.2f}%, Trades: {trades})")
            passed_count += 1
            
        except Exception as e:
            msg = str(e)
            if len(msg) > 100: msg = msg[:100] + "..."
            print(f"FAILED {s.name:<30}: {msg}")
            failed_count += 1
            failed_list.append(f"{s.name}: {msg}")
            # traceback.print_exc()

    print("\n" + "="*60)
    print("VERIFICATION SUMMARY")
    print("="*60)
    print(f"Total: {len(strategies)}")
    print(f"Passed: {passed_count}")
    print(f"Failed: {failed_count}")
    
    if failed_list:
        print("\nFailed Strategies:")
        for f in failed_list:
            print(f"- {f}")

if __name__ == '__main__':
    verify_strategies()
