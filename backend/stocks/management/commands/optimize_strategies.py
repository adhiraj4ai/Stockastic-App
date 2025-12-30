
import optuna
import pandas as pd
import inspect
import re
import traceback
from datetime import datetime, timedelta
from django.core.management.base import BaseCommand
from django.db.models import Q
from backtesting import Backtest, Strategy
from backtesting.lib import crossover
from backtesting.test import SMA
from stocks.models import Strategy as StrategyModel, StrategyExperiment, Company, DailyStockPrice, ScopeType

class Command(BaseCommand):
    help = 'Optimize strategy parameters for all symbols, sectors, and market.'

    def add_arguments(self, parser):
        parser.add_argument('--strategy', type=int, help='Specific strategy ID to optimize')
        parser.add_argument('--symbol', type=str, help='Specific symbol to optimize (or "ALL")')
        parser.add_argument('--sector', type=str, help='Specific sector to optimize')
        parser.add_argument('--trials', type=int, default=30, help='Number of Optuna trials')
        parser.add_argument('--days', type=int, default=730, help='Number of days of data to use')
        parser.add_argument('--all-symbols', action='store_true', help='Optimize for every individual symbol (Slow!)')

    def handle(self, *args, **options):
        # Silence Pandas FutureWarnings
        pd.set_option('future.no_silent_downcasting', True)
        
        strategy_id = options['strategy']
        symbol_arg = options['symbol']
        sector_arg = options['sector']
        n_trials = options['trials']
        days = options['days']

        # Determine Date Range
        end_date = datetime.now().date()
        start_date = end_date - timedelta(days=days)

        # 1. Get Strategies
        if strategy_id:
            strategies = StrategyModel.objects.filter(id=strategy_id)
        else:
            strategies = StrategyModel.objects.all()

        if not strategies.exists():
            self.stdout.write(self.style.ERROR("No strategies found!"))
            return

        for strategy in strategies:
            # Silence the strategy-level header to reduce noise
            # self.stdout.write(f"\nOptimizing Strategy: {strategy.name}")
            
            # Extract possible parameters from code
            # Simplified: looking for "param = range" or just "param = value"
            # Since we don't have a formal way to define ranges in the Strategy model yet,
            # we'll look for tags like "# range: [min, max]" in the code or use defaults.
            # FOR NOW: Let's assume a default range for common attributes if not specified, 
            # but ideally the user provides param_ranges. 
            # Since this is a CLI, we might need a way to pass them or rely on code annotations.
            
            param_ranges = self.extract_param_ranges(strategy.code)
            if not param_ranges:
                self.stdout.write(self.style.WARNING(f"  No parameter ranges found in code for {strategy.name}. Use '# range: [min, max]' comments."))
                continue

            # 2. Scopes
            scopes = []
            if symbol_arg:
                if symbol_arg == 'ALL':
                    scopes.append(('ALL', 'ALL'))
                else:
                    scopes.append(('SYMBOL', symbol_arg))
            elif sector_arg:
                scopes.append(('SECTOR', sector_arg))
            else:
                # Default: Optimize for ALL, and then for each active Sector
                # We skip individual symbols by default unless asked, to save time.
                scopes.append(('ALL', 'ALL'))
                sectors = Company.objects.filter(status='A').values_list('sector', flat=True).distinct()
                for s in sectors:
                    if s:
                        scopes.append(('SECTOR', s))
                
                if options['all_symbols']:
                    symbols = Company.objects.filter(status='A').values_list('symbol', flat=True).distinct()
                    for sym in symbols:
                        scopes.append(('SYMBOL', sym))

            for scope_type, scope_val in scopes:
                # Silencing the scope header
                # self.stdout.write(f"  Scope: {scope_type} - {scope_val}")
                try:
                    self.run_optimization(strategy, scope_type, scope_val, start_date, end_date, n_trials, param_ranges)
                except Exception as e:
                    self.stdout.write(self.style.ERROR(f"    Failed: {str(e)}"))
                    traceback.print_exc()

    def extract_param_ranges(self, code):
        """
        Extracts parameters and their ranges from comments like:
        n1 = 10 # range: [5, 30]
        step = 0.02 # range: [0.01, 0.1]
        """
        ranges = {}
        # Pattern: param_name = value # range: [min, max]
        # Supports ints and floats in the range
        pattern = r"(\w+)\s*=\s*[\d\.]+\s*#\s*range:\s*\[\s*([\d\.]+)\s*,\s*([\d\.]+)\s*\]"
        matches = re.findall(pattern, code)
        for name, min_val, max_val in matches:
            try:
                # If both are ints, store as ints, else float
                if '.' not in min_val and '.' not in max_val:
                    ranges[name] = [int(min_val), int(max_val)]
                else:
                    ranges[name] = [float(min_val), float(max_val)]
            except ValueError:
                continue
        return ranges

    def run_optimization(self, strategy, scope_type, scope_val, start_date, end_date, n_trials, param_ranges):
        # 1. Fetch Data
        data_map = {}
        if scope_type == 'ALL':
            companies = Company.objects.filter(status='A').values_list('symbol', flat=True)
            queryset = DailyStockPrice.objects.filter(ticker__in=companies, date__range=[start_date, end_date]).order_by('date')
        elif scope_type == 'SECTOR':
            companies = Company.objects.filter(sector__iexact=scope_val, status='A').values_list('symbol', flat=True)
            queryset = DailyStockPrice.objects.filter(ticker__in=companies, date__range=[start_date, end_date]).order_by('date')
        else: # SYMBOL
            queryset = DailyStockPrice.objects.filter(ticker=scope_val, date__range=[start_date, end_date]).order_by('date')

        all_data = list(queryset.values('ticker', 'date', 'open', 'high', 'low', 'close', 'volume'))
        if not all_data:
            raise ValueError(f"No data found for {scope_val}")

        master_df = pd.DataFrame(all_data)
        master_df.rename(columns={'open': 'Open', 'high': 'High', 'low': 'Low', 'close': 'Close', 'volume': 'Volume'}, inplace=True)
        master_df[['Open', 'High', 'Low', 'Close', 'Volume']] = master_df[['Open', 'High', 'Low', 'Close', 'Volume']].astype(float)
        master_df['date'] = pd.to_datetime(master_df['date'])

        for ticker, group in master_df.groupby('ticker'):
            sub_df = group.copy()
            sub_df = sub_df[(sub_df['High'] / sub_df['Open'] <= 2.0) & (sub_df['Low'] / sub_df['Open'] >= 0.5) & (sub_df['Close'] > 0)]
            if not sub_df.empty:
                sub_df.set_index('date', inplace=True)
                data_map[ticker] = sub_df

        if not data_map:
            raise ValueError("No valid data points after filtering.")

        # 2. Optuna Objective
        def objective(trial):
            params = {}
            for name, r in param_ranges.items():
                if isinstance(r[0], int) and isinstance(r[1], int):
                    params[name] = trial.suggest_int(name, r[0], r[1])
                else:
                    params[name] = trial.suggest_float(name, r[0], r[1])

            # Inject into code
            code = strategy.code
            for name, val in params.items():
                # Correctly handle int vs float injection
                if isinstance(val, int):
                    code = re.sub(rf"({name}\s*=\s*)[\d\.]+", rf"\g<1>{val}", code)
                else:
                    code = re.sub(rf"({name}\s*=\s*)[\d\.]+", rf"\g<1>{val:.4f}", code)

            local_scope = {'Backtest': Backtest, 'Strategy': Strategy, 'crossover': crossover, 'SMA': SMA, 'pd': pd}
            exec(code, local_scope)
            
            strat_class = None
            for name, obj in local_scope.items():
                if inspect.isclass(obj) and issubclass(obj, Strategy) and obj is not Strategy:
                    strat_class = obj
                    break
            
            if not strat_class:
                return -9999

            returns = []
            for ticker, df in data_map.items():
                try:
                    bt = Backtest(df, strat_class, cash=100_000, commission=.002, exclusive_orders=True, finalize_trades=True)
                    stats = bt.run()
                    returns.append(stats['Return [%]'])
                except:
                    pass
            
            return sum(returns) / len(returns) if returns else -9999

        study = optuna.create_study(direction='maximize')
        study.optimize(objective, n_trials=n_trials)

        # 3. Save Results
        import uuid
        batch_id = uuid.uuid4()
        
        # Get final strategy class with best params
        final_code = strategy.code
        for name, val in study.best_params.items():
            if isinstance(val, int):
                final_code = re.sub(rf"({name}\s*=\s*)[\d\.]+", rf"\g<1>{val}", final_code)
            else:
                final_code = re.sub(rf"({name}\s*=\s*)[\d\.]+", rf"\g<1>{val:.4f}", final_code)
        
        local_scope = {'Backtest': Backtest, 'Strategy': Strategy, 'crossover': crossover, 'SMA': SMA, 'pd': pd}
        exec(final_code, local_scope)
        strat_class = None
        for name, obj in local_scope.items():
            if inspect.isclass(obj) and issubclass(obj, Strategy) and obj is not Strategy:
                strat_class = obj
                break

        if strat_class:
            for ticker, df in data_map.items():
                try:
                    bt = Backtest(df, strat_class, cash=100_000, commission=.002, exclusive_orders=True, finalize_trades=True)
                    stats = bt.run()
                    
                    # Create detailed BACKTEST experiment
                    # Convert stats to dict for storage
                    metrics = {
                        'pnl_percent': float(stats['Return [%]']),
                        'total_pnl': float(stats['Equity Final [$]'] - 100000),
                        'win_rate': float(stats['Win Rate [%]']),
                        'total_trades': int(stats['# Trades']),
                    }
                    
                    # We skip plot_html in CLI for performance/simplicity
                    StrategyExperiment.objects.create(
                        strategy=strategy,
                        user=strategy.user,
                        run_type=StrategyExperiment.RunType.BACKTEST,
                        scope_type=ScopeType.SYMBOL,
                        scope_value=ticker,
                        start_date=start_date,
                        end_date=end_date,
                        parameters=study.best_params,
                        metrics=metrics,
                        batch_id=batch_id,
                        status=StrategyExperiment.Status.SUCCESS,
                        is_published=True
                    )
                except:
                    pass

        StrategyExperiment.objects.create(
            strategy=strategy,
            user=strategy.user,
            run_type=StrategyExperiment.RunType.OPTIMIZATION,
            scope_type=scope_type,
            scope_value=scope_val,
            start_date=start_date,
            end_date=end_date,
            parameters=study.best_params,
            metrics={
                'best_return': study.best_value,
                'search_ranges': param_ranges,
                'n_trials': len(study.trials),
                'batch_id': str(batch_id)
            },
            status=StrategyExperiment.Status.SUCCESS,
            is_published=True,
            batch_id=batch_id
        )
        
        # Concise one-liner output for the pipeline logger
        params_str = ", ".join([f"{k}: {v}" for k, v in study.best_params.items()])
        self.stdout.write(self.style.SUCCESS(f"[{strategy.name}] ({scope_type}:{scope_val}) -> Params: {params_str} | Return: {study.best_value:.2f}%"))
