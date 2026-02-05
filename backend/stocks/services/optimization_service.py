import re
import inspect
import pandas as pd
import numpy as np
import optuna
from backtesting import Backtest, Strategy
from backtesting.lib import crossover
from backtesting.test import SMA
import pandas_ta as ta
from datetime import datetime, timedelta
from django.db.models import Min, Q
from ..models.market import Company, DailyStockPrice
from ..models.strategy import Strategy as StrategyModel, StrategyExperiment, ScopeType
import uuid
import logging
from concurrent.futures import ThreadPoolExecutor

logger = logging.getLogger(__name__)

# --- Wrappers for Robustness ---

class SafeIndicator:
    def __init__(self, obj):
        self.obj = obj
    @property
    def values(self):
        if self.obj is None: return np.array([])
        if hasattr(self.obj, 'values'): return self.obj.values
        return self.obj
    def __len__(self): return len(self.obj) if self.obj is not None else 0
    def __getitem__(self, key):
        if self.obj is None: return None
        return self.obj[key]

class SafeTa:
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

# --- Service Implementation ---

class OptimizationService:
    DEFAULT_COMMISSION = 0.0036

    @staticmethod
    def extract_param_ranges(code):
        """Extracts parameters and their ranges from code comments: # range: [min, max]"""
        ranges = {}
        pattern = r"(\w+)\s*=\s*[\d\.]+\s*#\s*range:\s*\[\s*([\d\.]+)\s*,\s*([\d\.]+)\s*\]"
        matches = re.findall(pattern, code)
        for name, min_val, max_val in matches:
            try:
                if '.' not in min_val and '.' not in max_val:
                    ranges[name] = [int(min_val), int(max_val)]
                else:
                    ranges[name] = [float(min_val), float(max_val)]
            except ValueError:
                continue
        return ranges

    @staticmethod
    def fetch_data(scope_type, scope_val, start_date, end_date):
        """Generalized data fetching for backtesting."""
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
            return {}

        master_df = pd.DataFrame(all_data)
        master_df.rename(columns={'open': 'Open', 'high': 'High', 'low': 'Low', 'close': 'Close', 'volume': 'Volume'}, inplace=True)
        master_df[['Open', 'High', 'Low', 'Close', 'Volume']] = master_df[['Open', 'High', 'Low', 'Close', 'Volume']].astype(float)
        master_df['date'] = pd.to_datetime(master_df['date'])

        data_map = {}
        for ticker, group in master_df.groupby('ticker'):
            sub_df = group.copy()
            sub_df = sub_df[(sub_df['High'] / sub_df['Open'] <= 2.0) & (sub_df['Low'] / sub_df['Open'] >= 0.5) & (sub_df['Close'] > 0)]
            if not sub_df.empty:
                sub_df.set_index('date', inplace=True)
                data_map[ticker] = sub_df
        return data_map

    @staticmethod
    def run_optimization(strategy_model, scope_type, scope_val, start_date, end_date, n_trials, objective_type='win_rate'):
        """Runs Bayesian optimization for a strategy."""
        param_ranges = OptimizationService.extract_param_ranges(strategy_model.code)
        if not param_ranges:
            raise ValueError("No parameter ranges found in strategy code.")

        data_map = OptimizationService.fetch_data(scope_type, scope_val, start_date, end_date)
        if not data_map:
            raise ValueError(f"No valid data for scope {scope_type}:{scope_val}")

        def objective(trial):
            params = {}
            for name, r in param_ranges.items():
                if isinstance(r[0], int) and isinstance(r[1], int):
                    params[name] = trial.suggest_int(name, r[0], r[1])
                else:
                    params[name] = trial.suggest_float(name, r[0], r[1])

            code = strategy_model.code
            for name, val in params.items():
                code = re.sub(rf"({name}\s*=\s*)[\d\.]+", rf"\g<1>{val}", code)

            local_scope = {'Backtest': Backtest, 'Strategy': Strategy, 'crossover': crossover, 'SMA': SMA, 'pd': pd, 'np': np, 'ta': SafeTa(ta)}
            try:
                exec(code, local_scope)
                strat_class = next((obj for obj in local_scope.values() if inspect.isclass(obj) and issubclass(obj, Strategy) and obj is not Strategy), None)
                if not strat_class: return -9999
                
                scores = []
                for ticker, df in data_map.items():
                    bt = Backtest(df, strat_class, cash=100_000, commission=OptimizationService.DEFAULT_COMMISSION, exclusive_orders=True, finalize_trades=True)
                    stats = bt.run()
                    val = stats.get('Win Rate [%]' if objective_type == 'win_rate' else 'Return [%]', 0)
                    scores.append(val or 0)
                return sum(scores) / len(scores) if scores else -9999
            except:
                return -9999

        study = optuna.create_study(direction='maximize')
        study.optimize(objective, n_trials=n_trials)

        batch_id = uuid.uuid4()
        StrategyExperiment.objects.create(
            strategy=strategy_model,
            user=strategy_model.user,
            run_type=StrategyExperiment.RunType.OPTIMIZATION,
            scope_type=scope_type,
            scope_value=scope_val,
            start_date=start_date,
            end_date=end_date,
            parameters=study.best_params,
            metrics={'best_value': study.best_value, 'n_trials': len(study.trials)},
            batch_id=batch_id,
            status=StrategyExperiment.Status.SUCCESS
        )
        return study.best_params, study.best_value

    @staticmethod
    def _calculate_3y_splits(symbol):
        res = DailyStockPrice.objects.filter(ticker=symbol).aggregate(min_date=Min('date'))
        start_date = res['min_date'] or (datetime.now().date() - timedelta(days=365*3))
        end_date = datetime.now().date()
        
        periods = []
        curr_start = start_date
        while curr_start < end_date:
            curr_end = curr_start + timedelta(days=365*3)
            if (end_date - curr_end).days < 180: curr_end = end_date
            periods.append((f"{curr_start.year}-{curr_end.year}", curr_start, curr_end))
            curr_start = curr_end
            if curr_start >= end_date: break
        return periods
