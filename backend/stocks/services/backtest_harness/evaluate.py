"""Basket-level scorecard: does a strategy beat buy-and-hold, risk-adjusted?

Encodes the agreed acceptance bar. A strategy PASSES the basket iff:
  1. it runs cleanly on EVERY basket symbol (no exceptions);
  2. it trades on >= 60% of symbols with median #trades >= 5 (not degenerate);
  3. median excess return (strategy - buy&hold) > 0;
  4. median Sharpe >= median buy-and-hold Sharpe;
  5. median return/|max-drawdown| >= the buy-and-hold equivalent.
The full per-symbol table and the five sub-verdicts are retained so failures are
diagnosable rather than a bare boolean.
"""

from dataclasses import dataclass, field
from statistics import median
from typing import List, Optional

from .expectancy import expectancy_stats
from .runner import run_backtest, load_price_df, BacktestResult
from .statistics import wilson_interval, bootstrap_pvalue, winrate_is_reportable

__all__ = ["evaluate_over_basket", "score_results", "ScoreCard"]

MIN_TRADE_SYMBOL_FRACTION = 0.60
# A "not degenerate" floor: slow trend strategies (e.g. a 50/200 golden cross) may
# legitimately trade only a handful of times over a multi-year window. 3 still rejects
# the truly inactive (e.g. a 1-trade run) without penalizing sound slow strategies.
MIN_MEDIAN_TRADES = 3


def _ret_over_dd(metrics):
    """Return / |max drawdown|. Drawdown is reported negative by backtesting.py."""
    dd = abs(metrics.get("max_drawdown_pct", 0.0))
    if dd < 1e-9:
        # No drawdown: treat positive return as strongly favourable, else neutral.
        return metrics.get("return_pct", 0.0)
    return metrics.get("return_pct", 0.0) / dd


@dataclass
class ScoreCard:
    strategy_name: str
    results: List[BacktestResult] = field(default_factory=list)
    passed: bool = False
    verdicts: dict = field(default_factory=dict)
    aggregates: dict = field(default_factory=dict)
    confidence: dict = field(default_factory=dict)

    @property
    def ok_results(self):
        return [r for r in self.results if r.ok]

    @property
    def errors(self):
        return [(r.symbol, r.error) for r in self.results if not r.ok]

    def to_dict(self):
        return {
            "strategy_name": self.strategy_name,
            "passed": self.passed,
            "verdicts": self.verdicts,
            "aggregates": self.aggregates,
            "confidence": self.confidence,
            "symbols": [
                {"symbol": r.symbol, "ok": r.ok, "error": r.error,
                 "beats_bh": (r.metrics.get("return_pct", 0.0) > r.metrics.get("buy_hold_return_pct", 0.0)),
                 **r.metrics}
                for r in self.results
            ],
        }


def _evaluate_one(strategy_or_code, symbol, oos_fraction):
    """Run one symbol, optionally on the out-of-sample tail only."""
    if not oos_fraction:
        return run_backtest(strategy_or_code, symbol)
    df = load_price_df(symbol)
    if df is None or len(df) == 0:
        return run_backtest(strategy_or_code, symbol, df=df)
    cut = int(len(df) * (1 - oos_fraction))
    oos_df = df.iloc[cut:]
    return run_backtest(strategy_or_code, symbol, df=oos_df)


def evaluate_over_basket(strategy_or_code, basket, oos_fraction=None, strategy_name=None):
    """Backtest a strategy across the basket and compute the acceptance scorecard.

    ``oos_fraction`` (e.g. 0.3) evaluates only the last fraction of each series —
    the seam Phase 1 uses for out-of-sample acceptance after in-sample tuning.
    """
    name = strategy_name or getattr(strategy_or_code, "name", "strategy")
    results = [_evaluate_one(strategy_or_code, sym, oos_fraction) for sym in basket]
    return score_results(name, results)


def _bh_ret_over_dd(r):
    """Buy-and-hold return / |max drawdown| for one BacktestResult."""
    dd = abs(r.metrics["max_drawdown_pct"])
    if dd > 1e-9:
        return r.metrics["buy_hold_return_pct"] / dd
    return r.metrics["buy_hold_return_pct"]


def _build_series(ok):
    """Derive all per-symbol series needed for verdict and aggregate computation."""
    return {
        "strat_returns": [r.metrics["return_pct"] for r in ok],
        "excess": [r.excess_return for r in ok],
        "strat_sortino": [r.metrics["sortino"] for r in ok],
        "strat_rdd": [_ret_over_dd(r.metrics) for r in ok],
        "bh_rdd": [_bh_ret_over_dd(r) for r in ok],
        "trade_counts": [r.metrics["num_trades"] for r in ok],
        "n_traded": sum(1 for r in ok if r.metrics["num_trades"] > 0),
    }


def _compute_verdicts(ok, n_total, series):
    """Return the five pass/fail verdicts dict."""
    med_excess = median(series["excess"])
    med_strat_sortino = median(series["strat_sortino"])
    med_strat_rdd = median(series["strat_rdd"])
    med_bh_rdd = median(series["bh_rdd"])
    med_trades = median(series["trade_counts"])
    n_traded = series["n_traded"]
    return {
        "runs_clean": len(ok) == n_total,
        "active": (n_traded / n_total >= MIN_TRADE_SYMBOL_FRACTION) and (med_trades >= MIN_MEDIAN_TRADES),
        "beats_bh_return": med_excess > 0,
        "positive_risk_adjusted": med_strat_sortino > 0,
        "beats_bh_drawdown_adjusted": med_strat_rdd >= med_bh_rdd,
    }


def _compute_aggregates(ok, n_total, series):
    """Return the aggregates dict for a ScoreCard."""
    med_excess = median(series["excess"])
    med_strat_sortino = median(series["strat_sortino"])
    med_strat_rdd = median(series["strat_rdd"])
    med_bh_rdd = median(series["bh_rdd"])
    return {
        "symbols_total": n_total,
        "symbols_ok": len(ok),
        "symbols_traded": series["n_traded"],
        "median_return_pct": round(median(series["strat_returns"]), 2),
        "median_excess_return_pct": round(med_excess, 2),
        "median_strategy_sortino": round(med_strat_sortino, 3),
        "median_strategy_return_over_dd": round(med_strat_rdd, 3),
        "median_buyhold_return_over_dd": round(med_bh_rdd, 3),
        "median_trades": median(series["trade_counts"]),
    }


def _compute_confidence(ok, excess):
    """Return the statistical confidence dict for a ScoreCard."""
    total_wins = sum(int(r.metrics.get("wins", 0)) for r in ok)
    total_trades = sum(int(r.metrics.get("num_trades", 0)) for r in ok)
    ci_lo, ci_hi = wilson_interval(total_wins, total_trades)
    confidence = {
        "total_trades": total_trades,
        "total_wins": total_wins,
        "pooled_win_rate": round(100.0 * total_wins / total_trades, 2) if total_trades else 0.0,
        "win_rate_ci": [float(round(ci_lo, 4)), float(round(ci_hi, 4))],
        "win_rate_reportable": winrate_is_reportable(total_trades),
        "excess_pvalue": round(bootstrap_pvalue(excess), 4),
    }
    pooled_trade_returns = [x for r in ok for x in r.metrics.get("trade_returns", [])]
    exp = expectancy_stats(pooled_trade_returns)
    confidence["expectancy"] = round(exp["expectancy"], 5)
    confidence["avg_win"] = round(exp["avg_win"], 5)
    confidence["avg_loss"] = round(exp["avg_loss"], 5)
    confidence["payoff_ratio"] = round(exp["payoff_ratio"], 3)
    return confidence


def score_results(strategy_name, results):
    """Pure scorecard computation over a list of BacktestResult (no DB/backtest).

    Separated from evaluate_over_basket so the acceptance rule is unit-testable.
    """
    card = ScoreCard(strategy_name=strategy_name, results=results)
    ok = card.ok_results
    n_total = len(results)
    if not ok:
        card.passed = False
        card.verdicts = {"runs_clean": False}
        card.aggregates = {"symbols_total": n_total, "symbols_ok": 0}
        return card
    series = _build_series(ok)
    card.verdicts = _compute_verdicts(ok, n_total, series)
    card.passed = all(card.verdicts.values())
    card.aggregates = _compute_aggregates(ok, n_total, series)
    card.confidence = _compute_confidence(ok, series["excess"])
    return card
