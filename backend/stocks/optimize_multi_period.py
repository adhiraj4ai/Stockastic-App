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


# Default SL/TP values (can be overridden via params)
DEFAULT_SL_PCT = 0.95  # 5% stop loss below entry
DEFAULT_TP_PCT = 1.15  # 15% take profit above entry


def create_sl_tp_wrapped_strategy(original_strategy, sl_pct=None, tp_pct=None):
    """
    Wrap any strategy class with stop loss and take profit logic.
    This single wrapper applies SL/TP to ALL strategies uniformly.
    
    Args:
        original_strategy: The backtesting.py Strategy class to wrap
        sl_pct: Stop loss percentage (e.g., 0.95 = 5% loss trigger). None to disable.
        tp_pct: Take profit percentage (e.g., 1.15 = 15% gain trigger). None to disable.
    
    Returns:
        A new Strategy class with SL/TP logic injected into next()
        The class has sl_exits and tp_exits counters accessible after backtest.
    """
    # Use defaults if not provided
    _sl_pct = sl_pct if sl_pct is not None else DEFAULT_SL_PCT
    _tp_pct = tp_pct if tp_pct is not None else DEFAULT_TP_PCT
    
    class WrappedStrategy(original_strategy):
        # Counters for SL/TP exits - accessible after backtest (class-level)
        sl_exits = 0
        tp_exits = 0
        
        def init(self):
            # Reset counters at start of each backtest
            WrappedStrategy.sl_exits = 0
            WrappedStrategy.tp_exits = 0
            # Call parent init
            super().init()
        
        def next(self):
            # Run the original strategy logic first
            super().next()
            
            # Apply SL/TP if in a position
            try:
                if self.position and len(self.trades) > 0:
                    entry_price = self.trades[-1].entry_price
                    current_price = self.data.Close[-1]
                    
                    # Stop Loss: Close if price drops below threshold
                    if _sl_pct and current_price <= entry_price * _sl_pct:
                        self.position.close()
                        WrappedStrategy.sl_exits += 1
                    # Take Profit: Close if price rises above threshold  
                    elif _tp_pct and current_price >= entry_price * _tp_pct:
                        self.position.close()
                        WrappedStrategy.tp_exits += 1
            except Exception:
                pass  # Silently ignore SL/TP errors to not break strategy
    
    # Preserve the original class name for debugging
    WrappedStrategy.__name__ = f"SL_TP_{original_strategy.__name__}"
    return WrappedStrategy


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
        if curr_end > end_date:
            curr_end = end_date
        
        period_name = f"{curr_start.year}-{curr_end.year} (3Y)"
        periods.append((period_name, curr_start.strftime('%Y-%m-%d'), curr_end.strftime('%Y-%m-%d')))
        
        # Move start forward
        curr_start = curr_end
        
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
        
        # Extract SL/TP from params (they're optimized along with other params)
        sl_pct = params.get('sl_pct', DEFAULT_SL_PCT)
        tp_pct = params.get('tp_pct', DEFAULT_TP_PCT)
        
        # Replace parameters in code (for strategy-specific params, not SL/TP)
        code = self.code_template
        for param_name, param_value in params.items():
            if param_name not in ('sl_pct', 'tp_pct'):  # SL/TP handled via wrapper
                code = code.replace(f"{param_name} = ", f"{param_name} = {param_value} #")
                code = code.replace(f"{param_name}=", f"{param_name}={param_value} #")
        
        if 'pd.Series(x).index' in code:
            code = code.replace('pd.Series(x).index', 'self.data.index')
        if '.position.entry_price' in code:
            code = code.replace('.position.entry_price', '.trades[0].entry_price')
        
        local_scope = {
            'Backtest': Backtest, 'Strategy': Strategy, 'crossover': crossover,
            'SMA': SMA, 'pd': pd, 'np': np,
        }
        
        try:
            exec(code, local_scope)
        except Exception as e:
            return -9999
        
        from backtesting import Strategy as BTStrategy
        strategy_class = None
        for name, obj in local_scope.items():
            if inspect.isclass(obj) and issubclass(obj, BTStrategy) and obj is not BTStrategy:
                strategy_class = obj
                break
        
        if not strategy_class:
            return -9999
        
        # Wrap strategy with SL/TP logic (all strategies get this automatically)
        wrapped_strategy = create_sl_tp_wrapped_strategy(strategy_class, sl_pct=sl_pct, tp_pct=tp_pct)
        
        all_win_rates = []
        all_returns = []
        
        for fold_data_map in self.data_maps:
            win_rates = []
            returns = []
            for ticker, df_data in fold_data_map.items():
                try:
                    local_scope['symbol'] = ticker
                    local_scope['ticker'] = ticker
                    bt = Backtest(df_data, wrapped_strategy, cash=1000000, commission=.002, exclusive_orders=True, finalize_trades=True)
                    stats = bt.run()
                    
                    win_rate = stats.get('Win Rate [%]', 0)
                    if win_rate is None or (isinstance(win_rate, float) and win_rate != win_rate):
                        win_rate = 0
                    win_rates.append(win_rate)
                    
                    return_pct = stats.get('Return [%]', 0)
                    if return_pct is None or (isinstance(return_pct, float) and return_pct != return_pct):
                        return_pct = 0
                    returns.append(return_pct)
                except:
                    continue
            
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
    """Run optimization for a single objective evaluating across multiple data folds in parallel"""
    
    # Inject default SL/TP param ranges if not already provided
    # This must happen BEFORE the grid is created
    if 'sl_pct' not in param_ranges:
        param_ranges = param_ranges.copy()
        param_ranges['sl_pct'] = {'type': 'float', 'range': [0.90, 0.98]}
    if 'tp_pct' not in param_ranges:
        param_ranges = param_ranges.copy()
        param_ranges['tp_pct'] = {'type': 'float', 'range': [1.05, 1.25]}
    
    search_space = {}
    total_combinations = 1
    
    for param_name, param_config in param_ranges.items():
        if isinstance(param_config, dict):
            p_type = param_config.get('type', 'int')
            p_range = param_config.get('range', [1, 10])
            start, end = p_range[0], p_range[1]
        else:
            p_type = 'int'
            start, end = param_config[0], param_config[1]
        
        if p_type == 'int':
            count = int(end) - int(start) + 1
            search_space[param_name] = list(range(int(start), int(end) + 1))
        elif p_type == 'float':
            step = (end - start) / 10.0
            if step == 0: step = 0.1
            values = []
            curr = start
            while curr <= end + 1e-9:
                values.append(round(curr, 4))
                curr += step
            search_space[param_name] = values
            count = len(values)
        else:
            count = int(end) - int(start) + 1
            search_space[param_name] = list(range(int(start), int(end) + 1))
        total_combinations *= count
    
    sampler = optuna.samplers.GridSampler(search_space)
    actual_n_trials = total_combinations
    
    print(f"      🔍 Exhaustive Search: {actual_n_trials} combinations across {len(data_maps)} folds (Jobs: {n_jobs})")
    
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
    # Extract SL/TP from params
    sl_pct = params.get('sl_pct', DEFAULT_SL_PCT)
    tp_pct = params.get('tp_pct', DEFAULT_TP_PCT)
    
    # Replace parameters in code (not SL/TP - handled via wrapper)
    code = code_template
    for param_name, param_value in params.items():
        if param_name not in ('sl_pct', 'tp_pct'):  # SL/TP handled via wrapper
            code = code.replace(f"{param_name} = ", f"{param_name} = {param_value} #")
        
    local_scope = {
        'Backtest': Backtest,
        'Strategy': Strategy,
        'crossover': crossover,
        'SMA': SMA,
        'pd': pd,
        'np': np,
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
            return None
        
        # Wrap strategy with SL/TP logic (all strategies get this automatically)
        wrapped_strategy = create_sl_tp_wrapped_strategy(strategy_class, sl_pct=sl_pct, tp_pct=tp_pct)
            
        # Use the first dataframe (primary symbol) for the main backtest plot/stats
        symbol = list(data_map.keys())[0]
        local_scope['symbol'] = symbol
        local_scope['ticker'] = symbol
        df = data_map[symbol]
        
        bt = Backtest(df, wrapped_strategy, cash=1000000, commission=.002, exclusive_orders=True, finalize_trades=True)
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
