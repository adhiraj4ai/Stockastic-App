"""Run a strategy's code over a symbol's price history and normalize the result."""

from dataclasses import dataclass, field
from typing import Optional

import numpy as np
import pandas as pd
from backtesting import Backtest

from .scope import build_strategy_scope, extract_strategy_class, resolve_code

__all__ = ["load_price_df", "run_backtest", "normalize_metrics", "BacktestResult"]

MIN_BARS = 20


def load_price_df(ticker, start=None, end=None):
    """Load OHLCV for a ticker as a backtesting.py-ready DataFrame.

    Same shape/columns the existing call sites build: a DatetimeIndex and float
    ``Open/High/Low/Close/Volume`` columns. Returns an empty DataFrame if no data.
    """
    from stocks.models import DailyStockPrice

    qs = DailyStockPrice.objects.filter(ticker=ticker)
    if start:
        qs = qs.filter(date__gte=start)
    if end:
        qs = qs.filter(date__lte=end)
    ticks = list(qs.order_by("date").values("date", "open", "high", "low", "close", "volume"))
    if not ticks:
        return pd.DataFrame()

    df = pd.DataFrame(ticks)
    df.rename(
        columns={"open": "Open", "high": "High", "low": "Low", "close": "Close", "volume": "Volume"},
        inplace=True,
    )
    df["date"] = pd.to_datetime(df["date"])
    df.set_index("date", inplace=True)
    df[["Open", "High", "Low", "Close", "Volume"]] = df[
        ["Open", "High", "Low", "Close", "Volume"]
    ].astype(float)
    return df


@dataclass
class BacktestResult:
    """Outcome of a single (strategy, symbol) backtest."""

    symbol: str
    ok: bool
    error: Optional[str] = None
    metrics: dict = field(default_factory=dict)

    @property
    def excess_return(self):
        """Strategy return minus buy-and-hold return, in percentage points."""
        if not self.ok:
            return None
        return self.metrics.get("return_pct", 0.0) - self.metrics.get("buy_hold_return_pct", 0.0)


def _safe(stats, key, default=0.0):
    try:
        val = stats[key]
    except (KeyError, TypeError):
        return default
    if val is None or (isinstance(val, float) and (np.isnan(val) or np.isinf(val))):
        return default
    return float(val)


def normalize_metrics(stats):
    """Flatten a backtesting.py stats Series into a JSON-serializable dict.

    NaN/inf (which backtesting.py emits for zero-trade runs) are coerced to 0.0
    so downstream aggregation and JSON serialization stay clean.
    """
    return {
        "return_pct": _safe(stats, "Return [%]"),
        "buy_hold_return_pct": _safe(stats, "Buy & Hold Return [%]"),
        "sharpe": _safe(stats, "Sharpe Ratio"),
        "sortino": _safe(stats, "Sortino Ratio"),
        "calmar": _safe(stats, "Calmar Ratio"),
        "max_drawdown_pct": _safe(stats, "Max. Drawdown [%]"),
        "win_rate_pct": _safe(stats, "Win Rate [%]"),
        "num_trades": int(_safe(stats, "# Trades")),
        "exposure_pct": _safe(stats, "Exposure Time [%]"),
        "profit_factor": _safe(stats, "Profit Factor"),
        "ann_return_pct": _safe(stats, "Return (Ann.) [%]"),
    }


def run_backtest(strategy_or_code, ticker, params=None, start=None, end=None,
                 cash=1_000_000, commission=0.002, df=None):
    """Execute a strategy over one symbol and return a BacktestResult.

    ``strategy_or_code`` may be a Strategy model instance, a raw code string, or
    a special token (see scope.resolve_code). Exceptions are captured into the
    result rather than raised, so a broken strategy is a recorded failure.
    """
    code = getattr(strategy_or_code, "code", strategy_or_code)
    code = resolve_code(code)

    if df is None:
        df = load_price_df(ticker, start=start, end=end)
    if df is None or len(df) < MIN_BARS:
        return BacktestResult(symbol=ticker, ok=False,
                              error=f"Insufficient data (have {0 if df is None else len(df)}, need {MIN_BARS})")

    try:
        scope = build_strategy_scope(ticker, params=params)
        exec(code, scope)
        strategy_class = extract_strategy_class(scope)
        if strategy_class is None:
            return BacktestResult(symbol=ticker, ok=False, error="No Strategy subclass found in code")

        bt = Backtest(df, strategy_class, cash=cash, commission=commission, exclusive_orders=True)
        run_params = {k: v for k, v in (params or {}).items() if hasattr(strategy_class, k)}
        stats = bt.run(**run_params)
        return BacktestResult(symbol=ticker, ok=True, metrics=normalize_metrics(stats))
    except Exception as e:  # noqa: BLE001 — any strategy error becomes a recorded failure
        msg = str(e)
        if len(msg) > 200:
            msg = msg[:200] + "..."
        return BacktestResult(symbol=ticker, ok=False, error=f"{type(e).__name__}: {msg}")
