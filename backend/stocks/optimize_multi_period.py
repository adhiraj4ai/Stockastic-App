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


def calculate_periods(end_date=None):
    """Calculate 1Y, 3Y, 5Y, 10Y date ranges from end_date (defaults to today)"""
    if not end_date:
        end_date = datetime.now().strftime('%Y-%m-%d')
    
    end_dt = datetime.strptime(end_date, '%Y-%m-%d')
    
    periods = [
        ('1Y', (end_dt - timedelta(days=365)).strftime('%Y-%m-%d'), end_date),
        ('3Y', (end_dt - timedelta(days=365*3)).strftime('%Y-%m-%d'), end_date),
        ('5Y', (end_dt - timedelta(days=365*5)).strftime('%Y-%m-%d'), end_date),
        ('10Y', (end_dt - timedelta(days=365*10)).strftime('%Y-%m-%d'), end_date),
    ]
    
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


def run_single_objective_optimization(data_map, code_template, param_ranges, objective_type, n_trials):
    """Run optimization for a single objective"""
    # Build search space for Grid sampler
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
            step = (end - start) / 20.0
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
    
    # Always use Grid sampler
    sampler = optuna.samplers.GridSampler(search_space)
    n_trials = total_combinations
    
    # Define objective function
    def objective(trial):
        params = {}
        for param_name, param_config in param_ranges.items():
            if isinstance(param_config, dict):
                param_type = param_config.get('type', 'int')
                min_val, max_val = param_config['range']
                
                if param_type == 'float':
                    params[param_name] = trial.suggest_float(param_name, min_val, max_val)
                else:
                    params[param_name] = trial.suggest_int(param_name, int(min_val), int(max_val))
            else:
                min_val, max_val = param_config
                params[param_name] = trial.suggest_int(param_name, min_val, max_val)
        
        # Replace parameters in code
        code = code_template
        for param_name, param_value in params.items():
            code = code.replace(f"{param_name} = ", f"{param_name} = {param_value} #")
        
        # Safe-patch: fix index alignment bug if present in template
        if 'pd.Series(x).index' in code:
            code = code.replace('pd.Series(x).index', 'self.data.index')
        
        # Safe-patch: fix position.entry_price attribute error
        if '.position.entry_price' in code:
            code = code.replace('.position.entry_price', '.trades[0].entry_price')
        
        # Execute strategy code
        local_scope = {
            'Backtest': Backtest,
            'Strategy': Strategy,
            'crossover': crossover,
            'SMA': SMA,
            'pd': pd,
            'np': np,
        }
        
        exec(code, local_scope)
        
        # Find strategy class
        from backtesting import Strategy as BTStrategy
        strategy_class = None
        for name, obj in local_scope.items():
            if inspect.isclass(obj) and issubclass(obj, BTStrategy) and obj is not BTStrategy:
                strategy_class = obj
                break
        
        if not strategy_class:
            raise ValueError('No Strategy class found')
        
        # Run backtest for all dataframes
        win_rates = []
        returns = []
        for ticker, df_data in data_map.items():
            try:
                # Inject current ticker/symbol into the strategy's global scope
                local_scope['symbol'] = ticker
                local_scope['ticker'] = ticker
                
                # Check for institutional data availability (if strategy uses it)
                if 'DailyCumulativeAccumulation' in code_template:
                     from stocks.models import DailyCumulativeAccumulation
                     qs = DailyCumulativeAccumulation.objects.filter(symbol=ticker)
                     count = qs.count()
                     if trial.number == 0:
                         print(f"      📊 Institutional records for {ticker}: {count}")
                         if count > 0:
                             qs_dates = list(qs.values_list('transaction_date', flat=True).distinct())
                             price_dates = [d.date() for d in df_data.index]
                             overlap = set(qs_dates).intersection(set(price_dates))
                             print(f"      🕒 Date overlap (Accumulation vs Price): {len(overlap)} days")
                
                bt = Backtest(df_data, strategy_class, cash=1000000, commission=.002, exclusive_orders=True, finalize_trades=True)
                stats = bt.run()
                
                trades = stats.get('# Trades', 0)
                win_rate = stats.get('Win Rate [%]', 0)
                if win_rate is None or (isinstance(win_rate, float) and win_rate != win_rate):
                    win_rate = 0
                win_rates.append(win_rate)
                
                return_pct = stats.get('Return [%]', 0)
                if return_pct is None or (isinstance(return_pct, float) and return_pct != return_pct):
                    return_pct = 0
                returns.append(return_pct)

                if trial.number == 0:
                    print(f"      📈 Trial 0 Info for {ticker}: Trades={trades}, WinRate={win_rate:.2f}%, Return={return_pct:.2f}%")
            except Exception as e:
                import traceback
                print(f"      ⚠️ Backtest failure for {ticker}: {str(e)[:100]}")
                # Optional: print(traceback.format_exc()) for deep debugging
                continue
        
        if not win_rates:
            return -9999
        
        # Calculate objective based on type
        if objective_type == 'win_rate':
            return sum(win_rates) / len(win_rates)
        elif objective_type == 'profit':
            return sum(returns) / len(returns)
        else:  # 'balanced'
            avg_win_rate = sum(win_rates) / len(win_rates)
            avg_return = sum(returns) / len(returns)
            avg_win_rate = sum(win_rates) / len(win_rates)
            avg_return = sum(returns) / len(returns)
            # Prioritize Win Rate: 
            return avg_win_rate * 1000 + avg_return
    
    # Run optimization
    study = optuna.create_study(direction='maximize', sampler=sampler)
    study.optimize(objective, n_trials=n_trials, show_progress_bar=False)
    
    return {
        'best_params': study.best_params,
        'best_value': study.best_value,
        'n_trials': len(study.trials)
    }

def run_final_backtest(data_map, code_template, params):
    """Run a final backtest to get full stats and plot"""
    # Replace parameters in code
    code = code_template
    for param_name, param_value in params.items():
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
            
        # Use the first dataframe (primary symbol) for the main backtest plot/stats
        symbol = list(data_map.keys())[0]
        local_scope['symbol'] = symbol
        local_scope['ticker'] = symbol
        df = data_map[symbol]
        
        bt = Backtest(df, strategy_class, cash=1000000, commission=.002, exclusive_orders=True, finalize_trades=True)
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
                         stats_dict[k] = float(v)
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

        return None
