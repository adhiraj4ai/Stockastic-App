"""Run a strategy's code over a symbol's price history and normalize the result."""

from dataclasses import dataclass, field
from typing import Optional

import numpy as np
import pandas as pd
from backtesting import Backtest

from .scope import build_strategy_scope, extract_strategy_class, resolve_code
from .fees import nepse_commission, total_cost_rate, DEFAULT_SPREAD
from .adjustments import apply_adjustments

__all__ = ["load_price_df", "run_backtest", "normalize_metrics", "BacktestResult"]

MIN_BARS = 20


def _fetch_price_rows(ticker, start=None, end=None):
    """Raw OHLCV rows for a ticker (separated for testability)."""
    from stocks.models import DailyStockPrice

    qs = DailyStockPrice.objects.filter(ticker=ticker)
    if start:
        qs = qs.filter(date__gte=start)
    if end:
        qs = qs.filter(date__lte=end)
    return list(qs.order_by("date").values("date", "open", "high", "low", "close", "volume"))


def _fetch_actions(ticker):
    from stocks.models import CorporateAction

    return list(
        CorporateAction.objects.filter(ticker=ticker)
        .values_list("ex_date", "adjustment_factor")
    )


def fetch_actions_map(tickers=None):
    """{ticker: [(ex_date, factor), ...]} for many tickers in one query.

    Used by long-format analytics loaders (apply_adjustments_long) so views
    see the same corporate-action-adjusted prices as the backtest harness.
    """
    from collections import defaultdict

    from stocks.models import CorporateAction

    qs = CorporateAction.objects.all()
    # `tickers` may be a numpy array (e.g. df['ticker'].unique()), whose bare
    # truthiness raises ValueError — test length explicitly.
    if tickers is not None and len(tickers) > 0:
        qs = qs.filter(ticker__in=list(tickers))
    out = defaultdict(list)
    for ticker, ex_date, factor in qs.values_list("ticker", "ex_date", "adjustment_factor"):
        out[ticker].append((ex_date, factor))
    return dict(out)


def load_price_df(ticker, start=None, end=None, adjust=True, actions=None):
    """Load OHLCV for a ticker as a backtesting.py-ready DataFrame.

    ``adjust=True`` (default) applies corporate-action factors so the series
    is continuous across bonus/rights events — required for honest backtests.
    ``actions`` lets callers inject prefetched ``(ex_date, factor)`` pairs.
    Returns an empty DataFrame if no data.
    """
    ticks = _fetch_price_rows(ticker, start=start, end=end)
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

    if adjust:
        df = apply_adjustments(df, _fetch_actions(ticker) if actions is None else actions)
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


def _core_metrics(stats):
    """Extract the primary return and risk metrics from a stats Series."""
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


def _trade_outcome_metrics(stats):
    """Extract per-trade return outcomes from stats['_trades'] when available."""
    try:
        trades = stats["_trades"]
    except (KeyError, TypeError):
        trades = None
    if trades is not None and len(trades) and "ReturnPct" in trades:
        rets = [float(x) for x in trades["ReturnPct"].tolist()]
        return {
            "trade_returns": rets,
            "wins": int(sum(1 for r in rets if r > 0)),
            "losses": int(len(rets) - sum(1 for r in rets if r > 0)),
        }
    return {"trade_returns": [], "wins": 0, "losses": 0}


def normalize_metrics(stats):
    """Flatten a backtesting.py stats Series into a JSON-serializable dict.

    NaN/inf (which backtesting.py emits for zero-trade runs) are coerced to 0.0.
    Per-trade outcomes are captured from ``stats['_trades']`` when present so the
    statistics layer can compute win-rate intervals and bootstrap significance.
    """
    metrics = _core_metrics(stats)
    metrics.update(_trade_outcome_metrics(stats))
    return metrics


def _buy_hold_cost_pct(cash, resolved_commission, resolved_spread):
    """Round-trip transaction cost (in % points) a buy & hold investor also pays.

    backtesting.py reports Buy & Hold Return gross of fees, but a passive holder
    still pays one entry + one exit. To compare strategy-vs-B&H fairly (and not
    dock only the active strategy its cost drag), we net the same round-trip cost
    out of the B&H leg: per-side = the NEPSE cost rate when the real model is in
    effect, else the flat commission fraction; plus spread on each side.
    """
    if callable(resolved_commission):
        per_side_commission = total_cost_rate(cash)
    else:
        per_side_commission = float(resolved_commission)
    per_side = per_side_commission + (resolved_spread or 0.0)
    return 2.0 * per_side * 100.0


def _resolve_strategy_class(code, ticker, params):
    """Exec strategy code and return the extracted Strategy subclass, or None."""
    scope = build_strategy_scope(ticker, params=params)
    exec(code, scope)  # noqa: S102
    return extract_strategy_class(scope)


def _execute_bt(df, strategy_class, cash, resolved_commission, resolved_spread, params):
    """Build and run a Backtest instance; return raw stats."""
    bt = Backtest(
        df,
        strategy_class,
        cash=cash,
        commission=resolved_commission,
        spread=resolved_spread,
        exclusive_orders=True,
    )
    run_params = {k: v for k, v in (params or {}).items() if hasattr(strategy_class, k)}
    return bt.run(**run_params)


def _truncate_error(e):
    msg = str(e)
    if len(msg) > 200:
        msg = msg[:200] + "..."
    return f"{type(e).__name__}: {msg}"


def run_backtest(strategy_or_code, ticker, params=None, start=None, end=None,
                 cash=1_000_000, commission=None, spread=None, df=None):
    """Execute a strategy over one symbol and return a BacktestResult.

    Exceptions are captured into the result rather than raised.
    commission=None uses the real NEPSE tiered cost model (nepse_commission).
    spread=None uses DEFAULT_SPREAD (10 bps) for bid-ask/illiquidity.
    """
    code = resolve_code(getattr(strategy_or_code, "code", strategy_or_code))
    if df is None:
        df = load_price_df(ticker, start=start, end=end)
    if df is None or len(df) < MIN_BARS:
        return BacktestResult(symbol=ticker, ok=False,
                              error=f"Insufficient data (have {0 if df is None else len(df)}, need {MIN_BARS})")
    try:
        strategy_class = _resolve_strategy_class(code, ticker, params)
        if strategy_class is None:
            return BacktestResult(symbol=ticker, ok=False, error="No Strategy subclass found in code")
        resolved_commission = nepse_commission if commission is None else commission
        resolved_spread = DEFAULT_SPREAD if spread is None else spread
        stats = _execute_bt(df, strategy_class, cash, resolved_commission, resolved_spread, params)
        metrics = normalize_metrics(stats)
        metrics["buy_hold_return_pct"] -= _buy_hold_cost_pct(cash, resolved_commission, resolved_spread)
        return BacktestResult(symbol=ticker, ok=True, metrics=metrics)
    except Exception as e:  # noqa: BLE001 — any strategy error becomes a recorded failure
        return BacktestResult(symbol=ticker, ok=False, error=_truncate_error(e))
