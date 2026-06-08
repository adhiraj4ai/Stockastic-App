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
            from backtesting import Strategy as BTStrategy, Backtest
            from backtesting.lib import crossover, resample_apply
            from backtesting.test import SMA
            import talib as _talib
            from stocks.views.strategy import SafeTa
            import numpy as _np
            import pandas as _pd
            
            strat_scope = {
                'Strategy': BTStrategy,
                'Backtest': Backtest,
                'crossover': crossover,
                'resample_apply': resample_apply,
                'SMA': SMA,
                'ta': SafeTa(_talib),
                'talib': _talib,
                'np': _np,
                'pd': _pd,
                'symbol': symbol
            }
            code = s.code
            if code == 'broker_accumulation_v1':
                code = """
from backtesting import Strategy
import numpy as np
import pandas as pd
from stocks.models import DailyCumulativeAccumulation

class BrokerAccumulationStrategy(Strategy):
    def init(self):
        ticker = symbol
        qs = DailyCumulativeAccumulation.objects.filter(symbol=ticker).values('transaction_date', 'cumulative_net')
        if not qs:
            self.acc = self.I(lambda x: np.zeros(len(x)), self.data.Close)
            return
        df = pd.DataFrame(list(qs))
        df['transaction_date'] = pd.to_datetime(df['transaction_date'])
        daily = df.groupby('transaction_date')['cumulative_net'].sum()
        self.acc = self.I(lambda x: daily.reindex(pd.Series(x).index).ffill().fillna(0).values, self.data.Close)

    def next(self):
        if len(self.acc) < 2: return
        if self.acc[-1] > 0 and self.acc[-2] <= 0:
            if not self.position: self.buy()
        elif self.acc[-1] < 0 and self.acc[-2] >= 0:
            if self.position: self.position.close()
"""
            elif code == 'ichimoku_accumulation_v1' or (isinstance(code, str) and code.startswith('ichimoku_accumulation_v1')):
                code = """
from backtesting import Strategy
import pandas as pd
import numpy as np
import pandas_ta as ta
from stocks.models import DailyCumulativeAccumulation

class IchimokuAccumulation(Strategy):
    def init(self):
        close = pd.Series(self.data.Close)
        high = pd.Series(self.data.High)
        low = pd.Series(self.data.Low)
        # Ichimoku
        ichimoku_df = ta.ichimoku(high, low, close)[0]
        self.span_a = self.I(lambda: ichimoku_df.iloc[:, 2].values)
        self.span_b = self.I(lambda: ichimoku_df.iloc[:, 3].values)
        
        # Accumulation
        qs = DailyCumulativeAccumulation.objects.filter(symbol=symbol).values('transaction_date', 'cumulative_net')
        if not qs:
            self.acc = self.I(lambda x: np.zeros(len(x)), self.data.Close)
            return
        df = pd.DataFrame(list(qs))
        df['transaction_date'] = pd.to_datetime(df['transaction_date'])
        daily = df.groupby('transaction_date')['cumulative_net'].sum()
        self.acc = self.I(lambda x: daily.reindex(pd.Series(x).index).ffill().fillna(0).values, self.data.Close)

    def next(self):
        price = self.data.Close[-1]
        above_cloud = price > self.span_a[-1] and price > self.span_b[-1]
        accumulating = self.acc[-1] > 0
        if above_cloud and accumulating:
            if not self.position: self.buy()
        elif price < self.span_a[-1] or price < self.span_b[-1]:
            if self.position: self.position.close()
"""
            elif code == 'smart_accumulated_crossover_v1':
                code = """
from backtesting import Strategy
from backtesting.lib import crossover
import pandas as pd
import numpy as np
import pandas_ta as ta
from stocks.models import DailyCumulativeAccumulation

class SmartAccumulatedCrossover(Strategy):
    fast = 10
    slow = 50

    def init(self):
        qs = DailyCumulativeAccumulation.objects.filter(symbol=symbol).values('transaction_date', 'entity_id', 'cumulative_net')
        if not qs:
            self.fast_ma = self.I(lambda x: np.zeros(len(x)), self.data.Close)
            self.slow_ma = self.I(lambda x: np.zeros(len(x)), self.data.Close)
            return
        df = pd.DataFrame(list(qs))
        df['transaction_date'] = pd.to_datetime(df['transaction_date'])
        pivot = df.pivot_table(index='transaction_date', columns='entity_id', values='cumulative_net', aggfunc='last').ffill().fillna(0)
        top = pivot.iloc[-1].sort_values(ascending=False).head(5).index
        flow = pivot[top].sum(axis=1)
        line = self.I(lambda x: flow.reindex(pd.Series(x).index).ffill().fillna(0).values, self.data.Close)
        self.fast_ma = self.I(lambda x: pd.Series(x).rolling(self.fast).mean().values, line)
        self.slow_ma = self.I(lambda x: pd.Series(x).rolling(self.slow).mean().values, line)

    def next(self):
        if crossover(self.fast_ma, self.slow_ma):
            if not self.position: self.buy()
        elif crossover(self.slow_ma, self.fast_ma):
            if self.position: self.position.close()
"""
            exec(code, strat_scope, strat_scope)
            
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
