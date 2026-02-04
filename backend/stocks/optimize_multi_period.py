# Multi-Period Optimization Logic
# This file contains the clean implementation for optimizing across multiple time periods

from datetime import datetime, timedelta
import optuna
from backtesting import Backtest, Strategy
from backtesting.lib import crossover
from backtesting.test import SMA
import pandas as pd
import numpy as np
import inspect
import pandas_ta as ta


# Default Risk values for optimization
DEFAULT_SL_ATR_MULT = 2.0
DEFAULT_TP_ATR_MULT = 3.0
DEFAULT_COMMISSION = 0.0036  # 0.36% NEPSE average brokerage


# create_sl_tp_wrapped_strategy removed - logic now internal to strategies for ATR-based optimization


class SafeIndicator:
    """Wrapper to prevent .values crash on None indicators"""
    def __init__(self, obj):
        self.obj = obj
    
    @property
    def values(self):
        if self.obj is None:
            # Return empty numpy array to prevent backtesting.py from crashing
            return np.array([])
        if hasattr(self.obj, 'values'):
            return self.obj.values
        return self.obj
    
    def __len__(self):
        return len(self.obj) if self.obj is not None else 0
    
    def __getitem__(self, key):
        if self.obj is None: return None
        return self.obj[key]


class SafeTa:
    """Wrapper for pandas_ta to make indicators return SafeIndicator objects"""
    def __init__(self, real_ta):
        self._ta = real_ta
        
    def __getattr__(self, name):
        attr = getattr(self._ta, name)
        if callable(attr):
            def wrapper(*args, **kwargs):
                res = attr(*args, **kwargs)
                return SafeIndicator(res)
            return wrapper
        return attr


def calculate_3y_splits(symbol, DailyStockPrice, end_date=None):
    """
    Calculate chronological 3Y date ranges starting from the earliest available data for the symbol.
    """
    if not end_date:
        end_date = datetime.now().date()
    else:
        end_dt = datetime.strptime(end_date, '%Y-%m-%d').date()
        end_date = end_dt

    # Find earliest data point for this symbol
    from django.db.models import Min
    res = DailyStockPrice.objects.filter(ticker=symbol).aggregate(min_date=Min('date'))
    start_date = res['min_date']
    
    if not start_date:
        # Fallback if no data found
        start_date = end_date - timedelta(days=365*3)
    
    periods = []
    curr_start = start_date
    
    while curr_start < end_date:
        curr_end = curr_start + timedelta(days=365*3)
        
        # If the remaining period after this one would be very small (< 180 days),
        # just extend this period to the end and stop.
        if (end_date - curr_end).days < 180:
            curr_end = end_date
            
        period_name = f"{curr_start.year}-{curr_end.year} (3Y)"
        periods.append((period_name, curr_start.strftime('%Y-%m-%d'), curr_end.strftime('%Y-%m-%d')))
        
        # Move start forward
        curr_start = curr_end
        
        # Breakdown if we reached the end
        if curr_start >= end_date:
            break
        
    return periods


def fetch_period_data(symbol, sector, period_start, period_end, DailyStockPrice, Company):
    """Fetch and prepare data for a specific period"""
    data_map = {}
    
    if symbol == 'ALL' or (sector and sector.upper() == 'ALL'):
        companies = Company.objects.filter(status='A').values_list('symbol', flat=True)
        queryset = DailyStockPrice.objects.filter(ticker__in=companies)
        queryset = queryset.filter(date__range=[period_start, period_end])
        queryset = queryset.order_by('date')
        all_data = list(queryset.values('ticker', 'date', 'open', 'high', 'low', 'close', 'volume'))
        
    elif sector:
        companies = Company.objects.filter(sector__iexact=sector, status='A').values_list('symbol', flat=True)
        if not companies:
            return None, f'No active companies in sector: {sector}'
        
        queryset = DailyStockPrice.objects.filter(ticker__in=companies)
        queryset = queryset.filter(date__range=[period_start, period_end])
        queryset = queryset.order_by('date')
        all_data = list(queryset.values('ticker', 'date', 'open', 'high', 'low', 'close', 'volume'))
        
    else:
        # Single symbol
        all_data = []
        queryset = DailyStockPrice.objects.filter(ticker=symbol)
        queryset = queryset.filter(date__range=[period_start, period_end])
        queryset = queryset.order_by('date')
        
        ticks_data = list(queryset.values('date', 'open', 'high', 'low', 'close', 'volume'))
        if not ticks_data:
            return None, 'No data found for symbol/dates'
        
        df = pd.DataFrame(ticks_data)
        df.rename(columns={
            'open': 'Open', 'high': 'High', 'low': 'Low', 'close': 'Close', 'volume': 'Volume'
        }, inplace=True)
        
        numeric_cols = ['Open', 'High', 'Low', 'Close', 'Volume']
        df[numeric_cols] = df[numeric_cols].astype(float)
        
        # Filter bad data
        df = df[
            (df['High'] / df['Open'] <= 2.0) & (df['Low'] / df['Open'] >= 0.5) & (df['Close'] > 0)
        ].copy()
        
        if df.empty:
            return None, 'No valid data after filtering'
        
        df['date'] = pd.to_datetime(df['date'])
        df.set_index('date', inplace=True)
        data_map[symbol] = df
        return data_map, None
    
    # Process list-based data (ALL or SECTOR)
    if not all_data:
        return None, 'No data found'
    
    master_df = pd.DataFrame(all_data)
    master_df.rename(columns={
        'open': 'Open', 'high': 'High', 'low': 'Low', 'close': 'Close', 'volume': 'Volume'
    }, inplace=True)
    numeric_cols = ['Open', 'High', 'Low', 'Close', 'Volume']
    master_df[numeric_cols] = master_df[numeric_cols].astype(float)
    master_df['date'] = pd.to_datetime(master_df['date'])
    
    for ticker, group in master_df.groupby('ticker'):
        sub_df = group.copy()
        sub_df = sub_df[
            (sub_df['High'] / sub_df['Open'] <= 2.0) &
            (sub_df['Low'] / sub_df['Open'] >= 0.5) &
            (sub_df['Close'] > 0)
        ]
        if not sub_df.empty:
            sub_df.set_index('date', inplace=True)
            data_map[ticker] = sub_df
    
    if not data_map:
        return None, 'No valid data found'
    
    return data_map, None


class CrossValidationObjective:
    """Picklable objective class for Optuna multi-processing"""
    def __init__(self, data_maps, code_template, param_ranges, objective_type):
        self.data_maps = data_maps
        self.code_template = code_template
        self.objective_type = objective_type
        # param_ranges already has SL/TP injected by run_single_objective_optimization
        self.param_ranges = param_ranges

    def __call__(self, trial):
        params = {}
        for param_name, param_config in self.param_ranges.items():
            if isinstance(param_config, dict):
                param_type = param_config.get('type', 'int')
                min_val, max_val = param_config['range']
                
                if param_type == 'float':
                    params[param_name] = trial.suggest_float(param_name, min_val, max_val)
                else:
                    params[param_name] = trial.suggest_int(param_name, int(min_val), int(max_val))
            else:
                min_val, max_val = param_config
                params[param_name] = trial.suggest_int(param_name, int(min_val), int(max_val))
        
        # ATR Multipliers are optimized directly as strategy parameters
        sl_atr_mult = params.get('sl_atr_mult', DEFAULT_SL_ATR_MULT)
        tp_atr_mult = params.get('tp_atr_mult', DEFAULT_TP_ATR_MULT)
        
        # Replace parameters in code using precision regex
        import re
        code = self.code_template
        for param_name, param_value in params.items():
            # Replace ANY param defined at the class level
            pattern = rf"^\s*{param_name}\s*=\s*.*"
            replacement = f"    {param_name} = {param_value} "
            code = re.sub(pattern, replacement, code, flags=re.MULTILINE)
        
        if 'pd.Series(x).index' in code:
            code = code.replace('pd.Series(x).index', 'self.data.index')
        if '.position.entry_price' in code:
            code = code.replace('.position.entry_price', '.trades[0].entry_price')
        
        local_scope = {
            'Backtest': Backtest, 'Strategy': Strategy, 'crossover': crossover,
            'SMA': SMA, 'pd': pd, 'np': np, 'ta': SafeTa(ta),
        }
        
        try:
            exec(code, local_scope)
        except Exception as e:
            return -9999
        
        # Strategy class now contains its own SL/TP logic based on ATR
        strategy_class = strategy_class
        
        # Helper function for parallel backtest execution
        def run_single_bt(ticker_data):
            ticker, df_data = ticker_data
            try:
                # Use updated commission and exclusive orders
                bt = Backtest(df_data, strategy_class, cash=1000000, commission=DEFAULT_COMMISSION, exclusive_orders=True, finalize_trades=True)
                stats = bt.run()
                
                win_rate = stats.get('Win Rate [%]', 0)
                if win_rate is None or (isinstance(win_rate, float) and win_rate != win_rate):
                    win_rate = 0
                
                return_pct = stats.get('Return [%]', 0)
                if return_pct is None or (isinstance(return_pct, float) and return_pct != return_pct):
                    return_pct = 0
                
                return (win_rate, return_pct)
            except:
                return None
        
        from concurrent.futures import ThreadPoolExecutor
        
        all_win_rates = []
        all_returns = []
        
        for fold_data_map in self.data_maps:
            # Run backtests in parallel within each fold
            with ThreadPoolExecutor(max_workers=4) as executor:
                results = list(executor.map(run_single_bt, fold_data_map.items()))
            
            # Collect valid results
            win_rates = []
            returns = []
            for r in results:
                if r is not None:
                    win_rates.append(r[0])
                    returns.append(r[1])
            
            if win_rates:
                all_win_rates.append(sum(win_rates) / len(win_rates))
                all_returns.append(sum(returns) / len(returns))
        
        if not all_win_rates:
            return -9999
        
        avg_win_rate = sum(all_win_rates) / len(all_win_rates)
        avg_return = sum(all_returns) / len(all_returns)

        if self.objective_type == 'win_rate':
            return avg_win_rate
        elif self.objective_type == 'profit':
            return avg_return
        else:  # 'balanced'
            return (avg_win_rate * 2) + (avg_return / 10)

def run_single_objective_optimization(data_maps, code_template, param_ranges, objective_type, n_trials, n_jobs=4):
    """Run optimization for a single objective using smart Bayesian sampling (TPE)"""
    
    # Inject ATR multiplier ranges for optimization
    if 'sl_atr_mult' not in param_ranges:
        param_ranges = param_ranges.copy()
        param_ranges['sl_atr_mult'] = {'type': 'float', 'range': [1.0, 3.5]}
    if 'tp_atr_mult' not in param_ranges:
        param_ranges = param_ranges.copy()
        param_ranges['tp_atr_mult'] = {'type': 'float', 'range': [1.5, 6.0]}
    
    # Calculate rough search space size for logging
    total_combinations = 1
    for param_name, param_config in param_ranges.items():
        if isinstance(param_config, dict):
            p_range = param_config.get('range', [1, 10])
            p_type = param_config.get('type', 'int')
            start, end = p_range[0], p_range[1]
            if p_type == 'float':
                count = 5  # We'll use 5 steps max for floats
            else:
                count = int(end) - int(start) + 1
        else:
            start, end = param_config[0], param_config[1]
            count = int(end) - int(start) + 1
        total_combinations *= count
    
    # Use TPE Sampler (Bayesian) instead of GridSampler - much faster and smarter
    sampler = optuna.samplers.TPESampler(seed=42, n_startup_trials=10)
    
    # Add MedianPruner for early stopping of unpromising trials
    pruner = optuna.pruners.MedianPruner(n_startup_trials=5, n_warmup_steps=2)
    
    # Cap trials at reasonable number - TPE finds good solutions in ~50-100 trials
    actual_n_trials = min(n_trials, 100) if n_trials > 0 else min(total_combinations, 100)
    
    print(f"      🚀 Smart Search (TPE): {actual_n_trials} trials (vs {total_combinations} grid combinations) across {len(data_maps)} folds (Jobs: {n_jobs})")
    
    import tempfile
    import os
    
    # Use SQLite for multi-process coordination
    db_fd, db_path = tempfile.mkstemp(suffix='.db')
    os.close(db_fd)
    storage_url = f"sqlite:///{db_path}"
    
    try:
        objective_func = CrossValidationObjective(data_maps, code_template, param_ranges, objective_type)
        
        study = optuna.create_study(
            direction='maximize', 
            sampler=sampler,
            pruner=pruner,
            storage=storage_url,
            study_name=f"opt_{objective_type}_{datetime.now().timestamp()}"
        )
        study.optimize(objective_func, n_trials=actual_n_trials, n_jobs=n_jobs)
        
        return {
            'best_params': study.best_params,
            'best_value': study.best_value,
            'n_trials': len(study.trials)
        }
    finally:
        if os.path.exists(db_path):
            try:
                os.unlink(db_path)
            except: pass

def run_final_backtest(data_map, code_template, params):
    """Run a final backtest to get full stats and plot"""
    # ATR Multipliers are used directly from params
    # Replace parameters in code using precision regex
    import re
    code = code_template
    for param_name, param_value in params.items():
        pattern = rf"^\s*{param_name}\s*=\s*.*"
        replacement = f"    {param_name} = {param_value} "
        code = re.sub(pattern, replacement, code, flags=re.MULTILINE)
        
    if 'pd.Series(x).index' in code:
        code = code.replace('pd.Series(x).index', 'self.data.index')
    if '.position.entry_price' in code:
        code = code.replace('.position.entry_price', '.trades[0].entry_price')

    local_scope = {
        'Backtest': Backtest,
        'Strategy': Strategy,
        'crossover': crossover,
        'SMA': SMA,
        'pd': pd,
        'np': np,
        'ta': SafeTa(ta),
    }
    
    try:
        exec(code, local_scope)
        from backtesting import Strategy as BTStrategy
        strategy_class = None
        for name, obj in local_scope.items():
            if inspect.isclass(obj) and issubclass(obj, BTStrategy) and obj is not BTStrategy:
                strategy_class = obj
                break
                
        if not strategy_class:
            return None, None, None
        
        # Use the first dataframe (primary symbol) for the main backtest plot/stats
        symbol = list(data_map.keys())[0]
        local_scope['symbol'] = symbol
        local_scope['ticker'] = symbol
        df = data_map[symbol]
        
        bt = Backtest(df, strategy_class, cash=1000000, commission=DEFAULT_COMMISSION, exclusive_orders=True, finalize_trades=True)
        stats = bt.run()
        
        # safely get plot
        plot_html = None
        try:
            import tempfile
            import os
            
            # Create a temporary file
            with tempfile.NamedTemporaryFile(delete=False, suffix='.html') as tmp:
                temp_filename = tmp.name
            
            # Generate plot to file
            bt.plot(filename=temp_filename, open_browser=False)
            
            # Read file content
            with open(temp_filename, 'r', encoding='utf-8') as f:
                plot_html = f.read()
                
            # Clean up
            os.unlink(temp_filename)
        except Exception as e:
            print(f"Plot generation failed: {e}")
            pass
            
        # Convert stats to dict
        stats_dict = {}

        for k, v in stats.items():
            if k != '_equity_curve' and k != '_trades':
                 try:
                     # Check for NumPy numeric types specifically
                     if isinstance(v, (int, float, np.integer, np.floating)):
                         val = float(v)
                         if np.isnan(val) or np.isinf(val):
                             stats_dict[k] = 0.0
                         else:
                             stats_dict[k] = val
                     else:
                         stats_dict[k] = str(v)
                 except:
                     stats_dict[k] = str(v)

        # Helper for safer calculations
        def get_val(key, default=0.0):
            val = stats_dict.get(key, default)
            try:
                return float(val) if not isinstance(val, str) else float(val.replace('$', '').replace(',', '').replace('%', ''))
            except:
                return float(default)

        # Structure for Frontend MetricsDisplay - Expanded to match full report
        stats_dict['categorized'] = {
            'Performance Metrics': {
                'Start Balance': f"${get_val('Start Value', 100000):,.2f}",
                'End Balance': f"${get_val('Equity Final [$]', 0):,.2f}",
                'Net Profit [$]': f"${(get_val('Equity Final [$]', 0) - get_val('Start Value', 100000)):,.2f}",
                'Return [%]': f"{get_val('Return [%]', 0):.2f}%",
                'Buy & Hold Return [%]': f"{get_val('Buy & Hold Return [%]', 0):.2f}%",
                'Sharpe Ratio': f"{get_val('Sharpe Ratio', 0):.2f}",
                'Sortino Ratio': f"{get_val('Sortino Ratio', 0):.2f}",
                'Calmar Ratio': f"{get_val('Calmar Ratio', 0):.2f}", 
                'SQN': f"{get_val('SQN', 0):.2f}",
            },
            'Risk Metrics': {
                'Max Drawdown [%]': f"{get_val('Max. Drawdown [%]', 0):.2f}%",
                'Avg. Drawdown [%]': f"{get_val('Avg. Drawdown [%]', 0):.2f}%",
                'Max Drawdown Duration': str(stats_dict.get('Max. Drawdown Duration', 'N/A')),
                'Avg. Drawdown Duration': str(stats_dict.get('Avg. Drawdown Duration', 'N/A')),
                'Volatility (Ann.) [%]': f"{get_val('Volatility (Ann.) [%]', 0):.2f}%",
            },
            'Trade Metrics': {
                'Total Trades': int(get_val('# Trades', 0)),
                'Win Rate [%]': f"{get_val('Win Rate [%]', 0):.2f}%",
                'Best Trade [%]': f"{get_val('Best Trade [%]', 0):.2f}%",
                'Worst Trade [%]': f"{get_val('Worst Trade [%]', 0):.2f}%",
                'Avg. Trade [%]': f"{get_val('Avg. Trade [%]', 0):.2f}%",
                'Max Trade Duration': str(stats_dict.get('Max. Trade Duration', 'N/A')),
                'Avg. Trade Duration': str(stats_dict.get('Avg. Trade Duration', 'N/A')),
                'Profit Factor': f"{get_val('Profit Factor', 0):.2f}",
                'Expectancy [%]': f"{get_val('Expectancy [%]', 0):.2f}%",
            }
        }

        # Return stats, backtest instance, AND plot_html
        return stats_dict, bt, plot_html

    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"Final backtest failed: {e}")
        return None, None, None

def calculate_avg_cv_stats(data_maps, code_template, params):
    """
    Run backtests across all data maps with the given parameters 
    and return averaged performance metrics.
    """
    all_stats = []
    
    for dm in data_maps:
        stats_dict, bt, plot_html = run_final_backtest(dm, code_template, params)
        if stats_dict:
            all_stats.append(stats_dict)
            
    if not all_stats:
        return {}
        
    # Helper to parse formatted percentages/dollars back to floats
    def parse_val(v):
        if isinstance(v, (int, float)): return float(v)
        try:
            return float(str(v).replace('%', '').replace('$', '').replace(',', ''))
        except:
            return 0.0

    avg_metrics = {
        'win_rate': np.mean([parse_val(s['categorized']['Trade Metrics']['Win Rate [%]']) for s in all_stats]),
        'return_pct': np.mean([parse_val(s['categorized']['Performance Metrics']['Return [%]']) for s in all_stats]),
        'profit_factor': np.mean([parse_val(s['categorized']['Trade Metrics']['Profit Factor']) for s in all_stats]),
        'sharpe': np.mean([parse_val(s['categorized']['Performance Metrics']['Sharpe Ratio']) for s in all_stats]),
        'max_drawdown': np.mean([parse_val(s['categorized']['Risk Metrics']['Max Drawdown [%]']) for s in all_stats]),
        'total_trades': np.sum([parse_val(s['categorized']['Trade Metrics']['Total Trades']) for s in all_stats]),
        'avg_trades_per_fold': np.mean([parse_val(s['categorized']['Trade Metrics']['Total Trades']) for s in all_stats]),
    }
    
    return avg_metrics
