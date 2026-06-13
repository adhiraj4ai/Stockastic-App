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
import talib

# Use the full SafeTa implementation (returns proper pandas Series/DataFrames)
from .services.optimization_service import SafeTa, SafeIndicator

# Default Risk values for optimization
DEFAULT_SL_ATR_MULT = 2.0
DEFAULT_TP_ATR_MULT = 3.0
DEFAULT_COMMISSION = 0.0036  # 0.36% NEPSE average brokerage


def _resolve_end_date(end_date):
    """Parse end_date string to date, or default to today."""
    if not end_date:
        return datetime.now().date()
    return datetime.strptime(end_date, '%Y-%m-%d').date()


def _earliest_ticker_date(symbol, DailyStockPrice, fallback_end):
    """Return the earliest price date for symbol, or 3Y before fallback_end."""
    from django.db.models import Min
    res = DailyStockPrice.objects.filter(ticker=symbol).aggregate(min_date=Min('date'))
    return res['min_date'] or (fallback_end - timedelta(days=365 * 3))


def _build_3y_period_list(start_date, end_date):
    """Return list of (name, start_str, end_str) tuples for consecutive 3Y windows."""
    periods = []
    curr = start_date
    while curr < end_date:
        curr_end = curr + timedelta(days=365 * 3)
        if (end_date - curr_end).days < 180:
            curr_end = end_date
        periods.append((
            f"{curr.year}-{curr_end.year} (3Y)",
            curr.strftime('%Y-%m-%d'),
            curr_end.strftime('%Y-%m-%d'),
        ))
        curr = curr_end
        if curr >= end_date:
            break
    return periods


def calculate_3y_splits(symbol, DailyStockPrice, end_date=None):
    """Calculate chronological 3Y date ranges from earliest available data for the symbol."""
    end = _resolve_end_date(end_date)
    start = _earliest_ticker_date(symbol, DailyStockPrice, end)
    return _build_3y_period_list(start, end)


_OHLCV_RENAME = {'open': 'Open', 'high': 'High', 'low': 'Low', 'close': 'Close', 'volume': 'Volume'}
_NUMERIC_COLS = ['Open', 'High', 'Low', 'Close', 'Volume']


def _filter_valid_ohlc(df):
    """Drop rows where OHLC ratios are out of expected bounds or close is zero."""
    return df[
        (df['High'] / df['Open'] <= 2.0) &
        (df['Low'] / df['Open'] >= 0.5) &
        (df['Close'] > 0)
    ].copy()


def _fetch_single_symbol(symbol, period_start, period_end, DailyStockPrice):
    """Return (data_map, error) for a single-ticker period query."""
    rows = list(
        DailyStockPrice.objects.filter(ticker=symbol, date__range=[period_start, period_end])
        .order_by('date').values('date', 'open', 'high', 'low', 'close', 'volume')
    )
    if not rows:
        return None, 'No data found for symbol/dates'
    df = pd.DataFrame(rows).rename(columns=_OHLCV_RENAME)
    df[_NUMERIC_COLS] = df[_NUMERIC_COLS].astype(float)
    df = _filter_valid_ohlc(df)
    if df.empty:
        return None, 'No valid data after filtering'
    df['date'] = pd.to_datetime(df['date'])
    df.set_index('date', inplace=True)
    return {symbol: df}, None


def _fetch_multi_ticker_rows(tickers, period_start, period_end, DailyStockPrice):
    """Return raw list of rows for a set of tickers within the date range."""
    return list(
        DailyStockPrice.objects.filter(ticker__in=tickers, date__range=[period_start, period_end])
        .order_by('date').values('ticker', 'date', 'open', 'high', 'low', 'close', 'volume')
    )


def _build_multi_ticker_map(all_data):
    """Convert a flat list of OHLCV rows into {ticker: df} map with valid rows only."""
    if not all_data:
        return None, 'No data found'
    master = pd.DataFrame(all_data).rename(columns=_OHLCV_RENAME)
    master[_NUMERIC_COLS] = master[_NUMERIC_COLS].astype(float)
    master['date'] = pd.to_datetime(master['date'])
    data_map = {}
    for ticker, grp in master.groupby('ticker'):
        sub = _filter_valid_ohlc(grp.copy())
        if not sub.empty:
            sub.set_index('date', inplace=True)
            data_map[ticker] = sub
    return (data_map, None) if data_map else (None, 'No valid data found')


def _resolve_ticker_list(symbol, sector, Company):
    """Return the list of ticker symbols to fetch given symbol/sector params."""
    if symbol == 'ALL' or (sector and sector.upper() == 'ALL'):
        return list(Company.objects.all().values_list('symbol', flat=True)), None
    if sector:
        tickers = list(Company.objects.filter(sector__iexact=sector).values_list('symbol', flat=True))
        if not tickers:
            return None, f'No active companies in sector: {sector}'
        return tickers, None
    return None, None  # single-symbol path


def fetch_period_data(symbol, sector, period_start, period_end, DailyStockPrice, Company):
    """Fetch and prepare data for a specific period."""
    tickers, err = _resolve_ticker_list(symbol, sector, Company)
    if err:
        return None, err
    if tickers is None:
        return _fetch_single_symbol(symbol, period_start, period_end, DailyStockPrice)
    rows = _fetch_multi_ticker_rows(tickers, period_start, period_end, DailyStockPrice)
    return _build_multi_ticker_map(rows)


class CrossValidationObjective:
    """Picklable objective class for Optuna multi-processing"""
    def __init__(self, data_maps, code_template, param_ranges, objective_type):
        self.data_maps = data_maps
        self.code_template = code_template
        self.objective_type = objective_type
        # param_ranges already has SL/TP injected by run_single_objective_optimization
        self.param_ranges = param_ranges

    def _suggest_params(self, trial):
        """Sample all trial parameters from the configured ranges."""
        params = {}
        for name, cfg in self.param_ranges.items():
            if isinstance(cfg, dict):
                lo, hi = cfg['range']
                if cfg.get('type') == 'float':
                    params[name] = trial.suggest_float(name, lo, hi)
                else:
                    params[name] = trial.suggest_int(name, int(lo), int(hi))
            else:
                lo, hi = cfg
                params[name] = trial.suggest_int(name, int(lo), int(hi))
        return params

    @staticmethod
    def _inject_params(code_template, params):
        """Return code with strategy class-level parameters replaced by trial values."""
        import re
        code = code_template
        for name, value in params.items():
            code = re.sub(rf"^\s*{name}\s*=\s*.*", f"    {name} = {value} ", code, flags=re.MULTILINE)
        code = code.replace('pd.Series(x).index', 'self.data.index')
        code = code.replace('.position.entry_price', '.trades[0].entry_price')
        return code

    @staticmethod
    def _exec_strategy(code):
        """Execute strategy code and return the Strategy subclass, or None."""
        import sys as _sys
        ta_adapter = SafeTa(talib)
        _sys.modules['pandas_ta'] = ta_adapter  # type: ignore[assignment]
        scope = {
            'Backtest': Backtest, 'Strategy': Strategy, 'crossover': crossover,
            'SMA': SMA, 'pd': pd, 'np': np, 'ta': ta_adapter, 'talib': talib,
        }
        try:
            exec(code, scope)
        except Exception:
            return None
        return next(
            (v for v in scope.values() if inspect.isclass(v) and issubclass(v, Strategy) and v is not Strategy),
            None,
        )

    @staticmethod
    def _run_bt_one(strategy_class, df_data):
        """Run a single backtest; return (win_rate, return_pct) or None on failure."""
        try:
            bt = Backtest(df_data, strategy_class, cash=1000000, commission=DEFAULT_COMMISSION,
                          exclusive_orders=True, finalize_trades=True)
            stats = bt.run()
            wr = stats.get('Win Rate [%]', 0) or 0
            rp = stats.get('Return [%]', 0) or 0
            return (float(wr) if wr == wr else 0, float(rp) if rp == rp else 0)
        except Exception:
            return None

    def _score_folds(self, strategy_class):
        """Return (avg_win_rate, avg_return) across all folds, or None if no valid results."""
        from concurrent.futures import ThreadPoolExecutor
        all_wr, all_ret = [], []
        for fold in self.data_maps:
            with ThreadPoolExecutor(max_workers=4) as ex:
                fold_results = [ex.submit(self._run_bt_one, strategy_class, df).result()
                                for df in fold.values()]
            valid = [r for r in fold_results if r is not None]
            if valid:
                all_wr.append(sum(r[0] for r in valid) / len(valid))
                all_ret.append(sum(r[1] for r in valid) / len(valid))
        if not all_wr:
            return None
        return sum(all_wr) / len(all_wr), sum(all_ret) / len(all_ret)

    def _score(self, avg_win_rate, avg_return):
        if self.objective_type == 'win_rate':
            return avg_win_rate
        if self.objective_type == 'profit':
            return avg_return
        return (avg_win_rate * 2) + (avg_return / 10)

    def __call__(self, trial):
        params = self._suggest_params(trial)
        code = self._inject_params(self.code_template, params)
        strategy_class = self._exec_strategy(code)
        if strategy_class is None:
            return -9999
        fold_scores = self._score_folds(strategy_class)
        if fold_scores is None:
            return -9999
        return self._score(*fold_scores)

def _inject_atr_ranges(param_ranges):
    """Return param_ranges with sl_atr_mult and tp_atr_mult defaults added if absent."""
    ranges = param_ranges.copy()
    ranges.setdefault('sl_atr_mult', {'type': 'float', 'range': [1.0, 3.5]})
    ranges.setdefault('tp_atr_mult', {'type': 'float', 'range': [1.5, 6.0]})
    return ranges


def _count_search_space(param_ranges):
    """Estimate the total grid-search size for logging purposes."""
    total = 1
    for cfg in param_ranges.values():
        if isinstance(cfg, dict):
            lo, hi = cfg['range']
            total *= 5 if cfg.get('type') == 'float' else (int(hi) - int(lo) + 1)
        else:
            lo, hi = cfg
            total *= int(hi) - int(lo) + 1
    return total


def _run_optuna_study(objective_func, actual_n_trials, objective_type, n_jobs):
    """Create, run, and clean up a temporary SQLite-backed Optuna study."""
    import os
    import tempfile
    db_fd, db_path = tempfile.mkstemp(suffix='.db')
    os.close(db_fd)
    try:
        study = optuna.create_study(
            direction='maximize',
            sampler=optuna.samplers.TPESampler(seed=42, n_startup_trials=10),
            pruner=optuna.pruners.MedianPruner(n_startup_trials=5, n_warmup_steps=2),
            storage=f"sqlite:///{db_path}",
            study_name=f"opt_{objective_type}_{datetime.now().timestamp()}",
        )
        study.optimize(objective_func, n_trials=actual_n_trials, n_jobs=n_jobs)
        return {'best_params': study.best_params, 'best_value': study.best_value, 'n_trials': len(study.trials)}
    finally:
        if os.path.exists(db_path):
            try:
                os.unlink(db_path)
            except Exception:
                pass


def run_single_objective_optimization(data_maps, code_template, param_ranges, objective_type, n_trials, n_jobs=4):
    """Run optimization for a single objective using smart Bayesian sampling (TPE)."""
    param_ranges = _inject_atr_ranges(param_ranges)
    total_combinations = _count_search_space(param_ranges)
    actual_n_trials = min(n_trials, 100) if n_trials > 0 else min(total_combinations, 100)
    print(f"      Smart Search (TPE): {actual_n_trials} trials (vs {total_combinations} grid combinations) across {len(data_maps)} folds (Jobs: {n_jobs})")
    objective_func = CrossValidationObjective(data_maps, code_template, param_ranges, objective_type)
    return _run_optuna_study(objective_func, actual_n_trials, objective_type, n_jobs)

def _render_plot_html(bt):
    """Generate the backtesting plot to a temp file and return its HTML content, or None."""
    import os
    import tempfile
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix='.html') as tmp:
            path = tmp.name
        bt.plot(filename=path, open_browser=False)
        with open(path, 'r', encoding='utf-8') as f:
            html = f.read()
        os.unlink(path)
        return html
    except Exception as e:
        print(f"Plot generation failed: {e}")
        return None


def _stats_to_dict(stats):
    """Flatten backtesting stats to a plain dict, dropping private keys."""
    result = {}
    for k, v in stats.items():
        if k in ('_equity_curve', '_trades'):
            continue
        try:
            if isinstance(v, (int, float, np.integer, np.floating)):
                val = float(v)
                result[k] = 0.0 if (np.isnan(val) or np.isinf(val)) else val
            else:
                result[k] = str(v)
        except Exception:
            result[k] = str(v)
    return result


def _get_val(stats_dict, key, default=0.0):
    """Parse a stats_dict value to float, stripping currency/percent symbols."""
    val = stats_dict.get(key, default)
    try:
        return float(val) if not isinstance(val, str) else float(
            val.replace('$', '').replace(',', '').replace('%', '')
        )
    except Exception:
        return float(default)


def _performance_metrics(sd, g):
    return {
        'Start Balance': f"${g('Start Value', 100000):,.2f}",
        'End Balance': f"${g('Equity Final [$]'):,.2f}",
        'Net Profit [$]': f"${(g('Equity Final [$]') - g('Start Value', 100000)):,.2f}",
        'Return [%]': f"{g('Return [%]'):.2f}%",
        'Buy & Hold Return [%]': f"{g('Buy & Hold Return [%]'):.2f}%",
        'Sharpe Ratio': f"{g('Sharpe Ratio'):.2f}",
        'Sortino Ratio': f"{g('Sortino Ratio'):.2f}",
        'Calmar Ratio': f"{g('Calmar Ratio'):.2f}",
        'SQN': f"{g('SQN'):.2f}",
    }


def _risk_metrics(sd, g):
    return {
        'Max Drawdown [%]': f"{g('Max. Drawdown [%]'):.2f}%",
        'Avg. Drawdown [%]': f"{g('Avg. Drawdown [%]'):.2f}%",
        'Max Drawdown Duration': str(sd.get('Max. Drawdown Duration', 'N/A')),
        'Avg. Drawdown Duration': str(sd.get('Avg. Drawdown Duration', 'N/A')),
        'Volatility (Ann.) [%]': f"{g('Volatility (Ann.) [%]'):.2f}%",
    }


def _trade_metrics(sd, g):
    return {
        'Total Trades': int(g('# Trades')),
        'Win Rate [%]': f"{g('Win Rate [%]'):.2f}%",
        'Best Trade [%]': f"{g('Best Trade [%]'):.2f}%",
        'Worst Trade [%]': f"{g('Worst Trade [%]'):.2f}%",
        'Avg. Trade [%]': f"{g('Avg. Trade [%]'):.2f}%",
        'Max Trade Duration': str(sd.get('Max. Trade Duration', 'N/A')),
        'Avg. Trade Duration': str(sd.get('Avg. Trade Duration', 'N/A')),
        'Profit Factor': f"{g('Profit Factor'):.2f}",
        'Expectancy [%]': f"{g('Expectancy [%]'):.2f}%",
    }


def _categorize_stats(sd):
    """Return the `categorized` sub-dict expected by the frontend MetricsDisplay."""
    g = lambda k, d=0.0: _get_val(sd, k, d)
    return {
        'Performance Metrics': _performance_metrics(sd, g),
        'Risk Metrics': _risk_metrics(sd, g),
        'Trade Metrics': _trade_metrics(sd, g),
    }


def _load_strategy_from_code(code_template, params):
    """Inject params, exec the code, and return the Strategy subclass or None."""
    import re
    import sys as _sys
    code = code_template
    for name, val in params.items():
        code = re.sub(rf"^\s*{name}\s*=\s*.*", f"    {name} = {val} ", code, flags=re.MULTILINE)
    code = code.replace('pd.Series(x).index', 'self.data.index')
    code = code.replace('.position.entry_price', '.trades[0].entry_price')
    ta_adapter = SafeTa(talib)
    _sys.modules['pandas_ta'] = ta_adapter  # type: ignore[assignment]
    scope = {'Backtest': Backtest, 'Strategy': Strategy, 'crossover': crossover,
             'SMA': SMA, 'pd': pd, 'np': np, 'ta': ta_adapter, 'talib': talib}
    try:
        exec(code, scope)
    except Exception:
        return None
    return next(
        (v for v in scope.values() if inspect.isclass(v) and issubclass(v, Strategy) and v is not Strategy),
        None,
    )


def run_final_backtest(data_map, code_template, params):
    """Run a final backtest to get full stats and plot."""
    try:
        strategy_class = _load_strategy_from_code(code_template, params)
        if not strategy_class:
            return None, None, None
        symbol = list(data_map.keys())[0]
        bt = Backtest(data_map[symbol], strategy_class, cash=1000000,
                      commission=DEFAULT_COMMISSION, exclusive_orders=True, finalize_trades=True)
        stats = bt.run()
        plot_html = _render_plot_html(bt)
        stats_dict = _stats_to_dict(stats)
        stats_dict['categorized'] = _categorize_stats(stats_dict)
        return stats_dict, bt, plot_html
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"Final backtest failed: {e}")
        return None, None, None

def _parse_stat_val(v):
    """Convert a formatted stat value (percent/dollar string or number) to float."""
    if isinstance(v, (int, float)):
        return float(v)
    try:
        return float(str(v).replace('%', '').replace('$', '').replace(',', ''))
    except Exception:
        return 0.0


def _avg_stat(all_stats, category, key):
    return np.mean([_parse_stat_val(s['categorized'][category][key]) for s in all_stats])


def calculate_avg_cv_stats(data_maps, code_template, params):
    """Run backtests across all data maps and return averaged performance metrics."""
    all_stats = [
        sd for sd, _bt, _html in (run_final_backtest(dm, code_template, params) for dm in data_maps)
        if sd
    ]
    if not all_stats:
        return {}
    trades = [_parse_stat_val(s['categorized']['Trade Metrics']['Total Trades']) for s in all_stats]
    return {
        'win_rate': _avg_stat(all_stats, 'Trade Metrics', 'Win Rate [%]'),
        'return_pct': _avg_stat(all_stats, 'Performance Metrics', 'Return [%]'),
        'profit_factor': _avg_stat(all_stats, 'Trade Metrics', 'Profit Factor'),
        'sharpe': _avg_stat(all_stats, 'Performance Metrics', 'Sharpe Ratio'),
        'max_drawdown': _avg_stat(all_stats, 'Risk Metrics', 'Max Drawdown [%]'),
        'total_trades': float(np.sum(trades)),
        'avg_trades_per_fold': float(np.mean(trades)),
    }
