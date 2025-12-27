
import os
import sys
import django
import pandas as pd
from backtesting import Backtest, Strategy

# Setup Django environment
sys.path.append(os.path.join(os.getcwd(), 'backend'))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'stockastic.settings')
django.setup()

from stocks.models import DailyStockPrice

# Global capture list
SIGNAL_CAPTURE = {}

# Define a simple strategy that GUARANTEES a buy at the end
class GuaranteedBuy(Strategy):
    def init(self):
        pass
    def next(self):
        # Buy every bar (simplistic) to ensure orders exist
        self.buy()

# Mixin for instrumentation
class SignalCaptureStrategy(GuaranteedBuy):
    def next(self):
        super().next()
        # Capture state for this symbol (we assume single threaded run for now or use context)
        # We just want the LAST state.
        
        # Determine Signal
        # 1. Check orders (self.orders captures pending orders)
        orders = self.orders
        has_active_buy = any(o.size > 0 for o in orders) # Buy is + size
        has_active_sell = any(o.size < 0 for o in orders) # Sell is - size
        
        sig = "NEUTRAL"
        if has_active_buy:
            sig = "BUY"
        elif has_active_sell:
            sig = "SELL"
        elif self.position.size != 0:
            sig = "HOLD"
            
        SIGNAL_CAPTURE['last_signal'] = sig
        SIGNAL_CAPTURE['orders_count'] = len(orders)
        SIGNAL_CAPTURE['position'] = self.position.size

def verify_signal(symbol='NABIL'):
    print(f"Testing signal extraction for {symbol}...")
    
    ticks = list(DailyStockPrice.objects.filter(ticker=symbol).order_by('date').values('date', 'open', 'high', 'low', 'close', 'volume'))
    if not ticks: return

    df = pd.DataFrame(ticks)
    df.rename(columns={'open':'Open','high':'High','low':'Low','close':'Close','volume':'Volume'}, inplace=True)
    df[['Open','High','Low','Close','Volume']] = df[['Open','High','Low','Close','Volume']].astype(float)
    df['date'] = pd.to_datetime(df['date'])
    df.set_index('date', inplace=True)
    
    # Run with Instrumented Class
    bt = Backtest(df, SignalCaptureStrategy, cash=10000)
    bt.run()
    
    print("Signal Capture Result:")
    print(SIGNAL_CAPTURE)

if __name__ == '__main__':
    verify_signal()
