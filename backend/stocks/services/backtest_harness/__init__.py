"""Backtest harness — single source of truth for running strategy code and scoring it.

This package consolidates backtest execution that was previously triplicated across
``verify_all_strategies.py``, ``stocks/views/strategy.py`` and
``stocks/services/strategy_service.py``. It also implements the basket-level,
buy-and-hold-relative acceptance scorecard used to decide whether a strategy is
"good enough" (the Phase 0 deliverable).

Public surface:
    build_strategy_scope, extract_strategy_class, resolve_code   (scope)
    load_price_df, run_backtest, normalize_metrics, BacktestResult (runner)
    DEFAULT_BASKET, load_basket                                   (basket)
    evaluate_over_basket, ScoreCard                               (evaluate)
    write_report                                                  (report)
"""

try:
    from .scope import build_strategy_scope, extract_strategy_class, resolve_code
    from .runner import load_price_df, run_backtest, normalize_metrics, BacktestResult
    from .basket import DEFAULT_BASKET, load_basket
    from .evaluate import evaluate_over_basket, score_results, ScoreCard
    from .report import write_report
except ImportError:
    # talib and backtesting.py may not be installed in all environments (e.g.
    # lightweight CI that only runs fee/math tests). Sub-modules that do not
    # depend on those heavy libraries (e.g. fees.py) remain importable.
    pass

__all__ = [
    "build_strategy_scope",
    "extract_strategy_class",
    "resolve_code",
    "load_price_df",
    "run_backtest",
    "normalize_metrics",
    "BacktestResult",
    "DEFAULT_BASKET",
    "load_basket",
    "evaluate_over_basket",
    "score_results",
    "ScoreCard",
    "write_report",
]
