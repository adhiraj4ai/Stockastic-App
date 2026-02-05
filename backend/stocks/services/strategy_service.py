import re
import inspect
import pandas as pd
import numpy as np
import logging
from backtesting import Backtest, Strategy
from backtesting.lib import crossover
from backtesting.test import SMA
import pandas_ta as ta
from ..models.strategy import Strategy as StrategyModel, StrategySignal, StrategyExperiment, ScopeType
from ..models.portfolio import PortfolioItem
from ..models.market import DailyStockPrice, Company
from .optimization_service import SafeTa

logger = logging.getLogger(__name__)

# Global capture container for the single-threaded execution
CAPTURE_CONTEXT = {}

class StrategyService:
    @staticmethod
    def generate_all_signals(symbol_arg=None, progress_callback=None):
        """Generates daily Buy/Sell/Hold signals for all strategies against latest data."""
        strategies = StrategyModel.objects.all().order_by('id')
        
        if symbol_arg:
            symbols = [symbol_arg]
        else:
            symbols = list(DailyStockPrice.objects.values_list('ticker', flat=True).distinct())

        portfolio_symbols = set(PortfolioItem.objects.values_list('ticker', flat=True).distinct())
        company_sectors = dict(Company.objects.values_list('symbol', 'sector'))
        sector_names = set(Company.objects.values_list('sector', flat=True).distinct())
        EXCLUDED_SYMBOLS = {'NEPSE', 'SENSITIVE', 'FLOAT'}
        all_excluded = sector_names | EXCLUDED_SYMBOLS

        signals_saved = 0
        signals_skipped = 0
        total_symbols = len(symbols)

        for i, symbol in enumerate(symbols):
            if symbol in all_excluded or 'INDEX' in symbol.upper():
                signals_skipped += 1
                continue
                
            sector = company_sectors.get(symbol)
            saved, skipped = StrategyService.generate_signals_for_symbol(symbol, strategies, portfolio_symbols, sector)
            signals_saved += saved
            signals_skipped += skipped
            
            if progress_callback:
                progress_callback(i + 1, total_symbols, symbol)
                
        return signals_saved, signals_skipped

    @staticmethod
    def generate_signals_for_symbol(symbol, strategies, portfolio_symbols, sector):
        """Process a single symbol against multiple strategies to generate signals."""
        ticks = list(DailyStockPrice.objects.filter(ticker=symbol).order_by('date').values('date', 'open', 'high', 'low', 'close', 'volume'))
        if not ticks:
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
                # 1. Parameter Lookup
                exp = StrategyService._get_latest_optimized_experiment(s, symbol, sector)
                best_params = exp.parameters if exp else {}

                # 2. Prepare Code
                code = StrategyService._inject_params_into_code(s.code, best_params)

                # 3. Execution & Wrapper
                local_scope = {
                    'Backtest': Backtest, 'Strategy': Strategy, 'crossover': crossover, 
                    'SMA': SMA, 'pd': pd, 'np': np, 'ta': SafeTa(ta), 'symbol': symbol
                }
                exec(code, local_scope)
                
                strat_class = next((obj for obj in local_scope.values() if inspect.isclass(obj) and issubclass(obj, Strategy) and obj is not Strategy), None)
                if not strat_class: continue

                # 4. Instrumented Backtest
                class SignalCaptureWrapper(strat_class):
                    def next(self):
                        super().next()
                        orders = self.orders
                        sig = "NEUTRAL"
                        if any(o.size > 0 for o in orders): sig = "BUY"
                        elif any(o.size < 0 for o in orders): sig = "SELL"
                        elif self.position.size != 0:
                            sig = "HOLD" if self.position.size > 0 else "HOLD_SHORT"
                            
                        CAPTURE_CONTEXT['last_signal'] = sig
                        CAPTURE_CONTEXT['orders_count'] = len(orders)
                        CAPTURE_CONTEXT['position'] = self.position.size

                CAPTURE_CONTEXT.clear()
                bt = Backtest(df, SignalCaptureWrapper, cash=100_000, commission=.002, finalize_trades=True)
                bt.run()
                
                final_signal = CAPTURE_CONTEXT.get('last_signal', 'NEUTRAL')
                if final_signal == 'NEUTRAL' or (final_signal in ['HOLD', 'HOLD_SHORT'] and not is_in_portfolio):
                    skipped_count += 1
                    continue
                
                # 5. Persist Signal
                meta = {
                    'orders': CAPTURE_CONTEXT.get('orders_count', 0),
                    'position_size': CAPTURE_CONTEXT.get('position', 0),
                    'optimized_params': best_params if best_params else "Defaults Used",
                    'optimization_scope': exp.scope_type if exp else "DEFAULT",
                    'experiment_id': exp.id if exp else None
                }

                StrategySignal.objects.update_or_create(
                    strategy=s, symbol=symbol, date=last_date,
                    defaults={'signal': final_signal, 'last_close': last_close, 'metadata': meta}
                )
                saved_count += 1
                
            except Exception as e:
                logger.error(f"Failed signal gen for {symbol} with strategy {s.name}: {e}")
                skipped_count += 1
        
        return saved_count, skipped_count

    @staticmethod
    def _get_latest_optimized_experiment(strategy, symbol, sector):
        """Hierarchy: Symbol > Sector > Market (ALL)"""
        # Symbol
        exp = StrategyExperiment.objects.filter(
            strategy=strategy, scope_type=ScopeType.SYMBOL, scope_value=symbol,
            run_type=StrategyExperiment.RunType.OPTIMIZATION, is_published=True
        ).order_by('-created_at').first()
        
        if not exp and sector:
            # Sector
            exp = StrategyExperiment.objects.filter(
                strategy=strategy, scope_type=ScopeType.SECTOR, scope_value=sector,
                run_type=StrategyExperiment.RunType.OPTIMIZATION, is_published=True
            ).order_by('-created_at').first()
            
        if not exp:
            # Market
            exp = StrategyExperiment.objects.filter(
                strategy=strategy, scope_type=ScopeType.ALL,
                run_type=StrategyExperiment.RunType.OPTIMIZATION, is_published=True
            ).order_by('-created_at').first()
            
        return exp

    @staticmethod
    def _inject_params_into_code(code, params):
        if not params: return code
        for name, val in params.items():
            if isinstance(val, int):
                code = re.sub(rf"(\s{name}\s*=\s*)[\d\.]+", rf"\g<1>{val}", code)
            else:
                code = re.sub(rf"(\s{name}\s*=\s*)[\d\.]+", rf"\g<1>{val:.4f}", code)
        return code
