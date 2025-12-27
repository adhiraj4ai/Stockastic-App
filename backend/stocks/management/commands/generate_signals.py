
import os
import sys
import pandas as pd
from django.core.management.base import BaseCommand
from django.db.models import Count
from backtesting import Backtest, Strategy
import traceback

from stocks.models import Strategy as StrategyModel, DailyStockPrice, StrategySignal, PortfolioItem, StrategyExperiment, Company, ScopeType

# Global capture container for the single-threaded execution
CAPTURE_CONTEXT = {}

class Command(BaseCommand):
    help = 'Generates daily Buy/Sell/Hold signals for all strategies against latest data.'

    def add_arguments(self, parser):
        parser.add_argument('--symbol', type=str, help='Specific symbol to run for (e.g., NABIL)')

    def handle(self, *args, **options):
        # Silence Pandas FutureWarnings
        pd.set_option('future.no_silent_downcasting', True)
        
        symbol_arg = options['symbol']
        
        # 1. Get Strategies
        strategies = StrategyModel.objects.all().order_by('id')
        
        # 2. Get Symbols
        if symbol_arg:
            symbols = [symbol_arg]
        else:
            # For now, let's limit to NABIL for testing or top 5 volume stocks if none provided?
            # User wants "for a symbol i should be able to see".
            # It implies pre-calculating for ALL.
            # But let's start with just NABIL and SHPC if they exist.
            symbols = list(DailyStockPrice.objects.values_list('ticker', flat=True).distinct())
            # Limit to 5 for prototype performance
            # symbols = symbols[:5] 

        if not symbols:
            self.stdout.write(self.style.WARNING("No symbols found!"))
            return

        # 3. Get portfolio symbols (for SELL signal filtering)
        portfolio_symbols = set(PortfolioItem.objects.values_list('ticker', flat=True).distinct())
        
        # 4. Get Company Sectors for lookup
        company_sectors = dict(Company.objects.values_list('symbol', 'sector'))

        self.stdout.write(f"Portfolio contains {len(portfolio_symbols)} unique symbols")
        self.stdout.write(f"processing {len(strategies)} strategies for {len(symbols)} symbols...")
        
        signals_saved = 0
        signals_skipped = 0
        
        for symbol in symbols:
            sector = company_sectors.get(symbol)
            saved, skipped = self.process_symbol(symbol, strategies, portfolio_symbols, sector)
            signals_saved += saved
            signals_skipped += skipped
            
        self.stdout.write(self.style.SUCCESS(
            f"Signal generation complete. Saved: {signals_saved}, Skipped: {signals_skipped} (NEUTRAL or non-portfolio SELL)"
        ))

    def process_symbol(self, symbol, strategies, portfolio_symbols, sector):
        # self.stdout.write(f"\nProcessing {symbol}...")
        
        # Fetch Data Once
        ticks = list(DailyStockPrice.objects.filter(ticker=symbol).order_by('date').values('date', 'open', 'high', 'low', 'close', 'volume'))
        if not ticks:
            self.stdout.write(f"  No data for {symbol}")
            return 0, 0

        df = pd.DataFrame(ticks)
        df.rename(columns={'open':'Open','high':'High','low':'Low','close':'Close','volume':'Volume'}, inplace=True)
        df[['Open','High','Low','Close','Volume']] = df[['Open','High','Low','Close','Volume']].astype(float)
        df['date'] = pd.to_datetime(df['date'])
        df.set_index('date', inplace=True)
        
        last_date = df.index[-1].date()
        last_close = df.iloc[-1]['Close']
        
        is_in_portfolio = symbol in portfolio_symbols
        saved_count = 0
        skipped_count = 0
        
        for s in strategies:
            try:
                # 1. Parameter Lookup Hierarchy: Symbol > Sector > Market (ALL)
                best_params = {}
                
                # Check Symbol level
                exp = StrategyExperiment.objects.filter(
                    strategy=s, 
                    scope_type=ScopeType.SYMBOL, 
                    scope_value=symbol,
                    run_type=StrategyExperiment.RunType.OPTIMIZATION,
                    is_published=True
                ).order_by('-created_at').first()
                
                if not exp and sector:
                    # Check Sector level
                    exp = StrategyExperiment.objects.filter(
                        strategy=s, 
                        scope_type=ScopeType.SECTOR, 
                        scope_value=sector,
                        run_type=StrategyExperiment.RunType.OPTIMIZATION,
                        is_published=True
                    ).order_by('-created_at').first()
                
                if not exp:
                    # Check Market (ALL) level
                    exp = StrategyExperiment.objects.filter(
                        strategy=s, 
                        scope_type=ScopeType.ALL, 
                        run_type=StrategyExperiment.RunType.OPTIMIZATION,
                        is_published=True
                    ).order_by('-created_at').first()
                
                if exp and exp.parameters:
                    best_params = exp.parameters
                    # self.stdout.write(f"    Using optimized params from {exp.scope_type} ({exp.scope_value})")

                # 2. Inject Parameters into Code
                code = s.code
                if best_params:
                    import re
                    for name, val in best_params.items():
                        # Replace matching class variables e.g. "n1 = 20" with "n1 = 15"
                        # Handle both int and float injection with \g<1> to avoid group ambiguity
                        if isinstance(val, int):
                            code = re.sub(rf"(\s{name}\s*=\s*)[\d\.]+", rf"\g<1>{val}", code)
                        else:
                            code = re.sub(rf"(\s{name}\s*=\s*)[\d\.]+", rf"\g<1>{val:.4f}", code)

                # Prepare Scope
                strat_scope = {'symbol': symbol}
                # Exec
                exec(code, strat_scope, strat_scope)
                
                # Find Class
                strat_class = None
                BaseStrategy = strat_scope.get('Strategy')
                
                for name, obj in strat_scope.items():
                    if isinstance(obj, type) and name != 'Strategy':
                         if BaseStrategy and issubclass(obj, BaseStrategy):
                             strat_class = obj
                
                if not strat_class:
                    continue
                    
                # Create Instrumented Class
                # Define wrapper dynamically to avoid cross-contamination
                
                class SignalCaptureWrapper(strat_class):
                    def next(self):
                        super().next()
                        
                        # Capture Logic
                        # Check orders (self.orders captures pending orders)
                        orders = self.orders
                        has_active_buy = any(o.size > 0 for o in orders)
                        has_active_sell = any(o.size < 0 for o in orders)
                        
                        sig = "NEUTRAL"
                        if has_active_buy:
                            sig = "BUY"
                        elif has_active_sell:
                            sig = "SELL"
                        elif self.position.size != 0:
                            sig = "HOLD"
                            if self.position.size > 0: sig = "HOLD" # Explicitly HOLD LONG
                            if self.position.size < 0: sig = "HOLD_SHORT" # Rare for us
                            
                        # Save to context
                        CAPTURE_CONTEXT['last_signal'] = sig
                        CAPTURE_CONTEXT['orders_count'] = len(orders)
                        CAPTURE_CONTEXT['position'] = self.position.size

                # Reset Context
                CAPTURE_CONTEXT.clear()
                
                # Run Backtest
                # We need cash enough to buy
                bt = Backtest(df, SignalCaptureWrapper, cash=100_000, commission=.002, finalize_trades=True)
                bt.run()
                
                # Extract Result
                final_signal = CAPTURE_CONTEXT.get('last_signal', 'NEUTRAL')
                meta = {
                    'orders': CAPTURE_CONTEXT.get('orders_count', 0),
                    'position_size': CAPTURE_CONTEXT.get('position', 0)
                }
                
                # FILTERING LOGIC:
                # 1. Skip NEUTRAL signals (too many, not actionable)
                if final_signal == 'NEUTRAL':
                    skipped_count += 1
                    continue
                
                # 2. Only save SELL and HOLD signals if stock is in portfolio
                if final_signal in ['SELL', 'HOLD', 'HOLD_SHORT'] and not is_in_portfolio:
                    skipped_count += 1
                    continue
                
                # Save to DB (only BUY, HOLD, and portfolio SELL signals)
                meta['optimized_params'] = best_params if best_params else "None (Defaults Used)"
                meta['optimization_scope'] = exp.scope_type if exp else "DEFAULT"
                meta['experiment_id'] = exp.id if exp else None

                obj, created = StrategySignal.objects.update_or_create(
                    strategy=s,
                    symbol=symbol,
                    date=last_date,
                    defaults={
                        'signal': final_signal,
                        'last_close': last_close,
                        'metadata': meta
                    }
                )
                saved_count += 1
                
                # self.stdout.write(f"  {s.name}: {final_signal}")
                
            except Exception as e:
                # self.stdout.write(self.style.ERROR(f"  Failed {s.name}: {e}"))
                pass
        
        return saved_count, skipped_count
