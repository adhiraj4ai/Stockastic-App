"""Build, calibrate, and gate the AccumulationStrength strategy via the harness.

Calibration runs through ``run_backtest``/``evaluate_over_basket`` (not the global
optimizer) because the alpha is symbol-bound: only the harness scope injects
``symbol`` per ticker. The in-sample objective tunes on the head of each series
and the OOS scorecard validates on the unseen tail.
"""
import statistics

import optuna

ACCUMULATION_STRATEGY_NAME = "Accumulation Strength"
LOW_SENTINEL = -1e9

_CODE_TEMPLATE = """from stocks.services.strategy_framework import build_strategy, alphas, stops
top_n = {top_n}  # range: [1, 15]
entry_threshold = {entry_threshold}  # range: [40, 90]
w_concentration = {w_concentration}  # range: [0.0, 3.0]
w_coiling = {w_coiling}  # range: [0.0, 3.0]
w_breakout = {w_breakout}  # range: [0.0, 3.0]
conc_lookback = {conc_lookback}  # range: [5, 30]
coil_lookback = {coil_lookback}  # range: [10, 40]
Strategy = build_strategy(
    alpha=alphas.AccumulationStrength(
        symbol=symbol, top_n=top_n, entry_threshold=entry_threshold,
        w_concentration=w_concentration, w_coiling=w_coiling, w_breakout=w_breakout,
        conc_lookback=conc_lookback, coil_lookback=coil_lookback),
    stop=stops.AtrTrail(multiplier=3.0),
    name="AccumulationStrength")
"""

_DEFAULTS = dict(
    top_n=5,
    entry_threshold=70,
    w_concentration=1.0,
    w_coiling=1.0,
    w_breakout=1.0,
    conc_lookback=10,
    coil_lookback=20,
)


def build_accumulation_code(params):
    """Return strategy code with # range: comments for optimizer param discovery."""
    merged = {**_DEFAULTS, **(params or {})}
    return _CODE_TEMPLATE.format(**merged)


def decide_validation_state(card):
    """Map OOS ScoreCard result to a validation_state string."""
    return "validated" if getattr(card, "passed", False) else "research"


def param_ranges():
    """Single source of truth for the search space — parsed from the # range: comments."""
    from stocks.services.optimization_service import OptimizationService
    return OptimizationService.extract_param_ranges(build_accumulation_code({}))


def _is_df(code, symbol, oos_fraction):
    """In-sample backtest result for one symbol (head slice keeps OOS tail unseen)."""
    from stocks.services.backtest_harness.runner import load_price_df, run_backtest
    df = load_price_df(symbol)
    if df is None or df.empty:
        return None
    cut = int(len(df) * (1 - oos_fraction))
    return run_backtest(code, symbol, df=df.iloc[:cut])


def in_sample_median_sortino(code, basket, oos_fraction):
    """Median in-sample sortino across the basket, or LOW_SENTINEL if nothing runs."""
    sortinos = []
    for symbol in basket:
        result = _is_df(code, symbol, oos_fraction)
        if result is not None and result.ok:
            sortinos.append(result.metrics["sortino"])
    return statistics.median(sortinos) if sortinos else LOW_SENTINEL


def _suggest(trial, name, bounds):
    """Suggest one param as int or float depending on its declared range bounds."""
    low, high = bounds
    if isinstance(low, int) and isinstance(high, int):
        return trial.suggest_int(name, low, high)
    return trial.suggest_float(name, float(low), float(high))


def _make_objective(ranges, basket, oos_fraction):
    """Build the optuna objective: sample params, build code, score in-sample."""
    def objective(trial):
        params = {name: _suggest(trial, name, bounds) for name, bounds in ranges.items()}
        return in_sample_median_sortino(build_accumulation_code(params), basket, oos_fraction)
    return objective


def calibrate(basket, oos_fraction, n_trials):
    """Tune in-sample via optuna, then score the best params on the OOS tail.

    Returns ``(best_params, oos_scorecard)``.
    """
    from stocks.services.backtest_harness.evaluate import evaluate_over_basket
    optuna.logging.set_verbosity(optuna.logging.WARNING)
    study = optuna.create_study(direction="maximize")
    study.optimize(_make_objective(param_ranges(), basket, oos_fraction), n_trials=n_trials)
    best_code = build_accumulation_code(study.best_params)
    card = evaluate_over_basket(best_code, basket, oos_fraction=oos_fraction,
                                strategy_name=ACCUMULATION_STRATEGY_NAME)
    return study.best_params, card
