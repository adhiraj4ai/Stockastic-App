# Plan 2: Statistical Rigor Layer — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Stop the harness from blessing lucky strategies. Add win-rate confidence intervals + sample gates, permutation significance for excess return, walk-forward (in-sample-tune / out-of-sample-validate) optimization, and multiple-testing-aware family ranking — so a "pass" becomes a defensible edge, not a backtest artifact.

**Architecture:** A new pure-stats module (`backtest_harness/statistics.py`, NumPy only, no Django) holds Wilson intervals, bootstrap/permutation p-values, and Benjamini–Hochberg adjustment — all unit-testable standalone. `normalize_metrics` is extended to capture per-trade outcomes (from `stats['_trades']`) that these need. The economic 5-verdict `score_results` pass/fail is left UNCHANGED (Plan 1's 21/41 semantics stay intact); statistics are added as a reported `confidence` block and consumed by ranking, not folded into `.passed`. Optimization gains an anchored train/test split.

**Tech Stack:** Django, backtesting.py 0.6.5 (`stats['_trades']` has `PnL` + `ReturnPct` columns), Optuna, NumPy, pytest. Run ALL tests/commands in Docker from repo root: `docker-compose exec -T backend pytest <args>` / `... python manage.py <args>` (talib + DB live in the container; `./backend` is bind-mounted).

**Branch:** `git checkout strategy-upgrade-phase0 && git checkout -b strategy-upgrade-phase2-stat-rigor`

**Already done (do NOT redo):** The "fix 6 SafeTa indicator gaps" roadmap item is COMPLETE — `optimization_service.SafeTa` already implements supertrend, psar, aroon, coppock, cmf, kc, efi (verified; the 6 strategies run clean in the Plan-1 re-baseline).

**Pre-existing failing test (ignore throughout):** `stocks/tests/test_position_sizing.py::test_aggressive_risk` fails on the base commit — not in scope.

---

## Design decisions (read before Task 1)

- **Statistics are reported, not gating.** `score_results`'s `.passed = all(verdicts.values())` over the 5 economic verdicts stays exactly as-is — Plan 1's 21/41 must not shift from this plan. Confidence/significance live in a new `card.confidence` dict and in new metric keys, and drive RANKING and DISPLAY. This keeps the economic acceptance bar (the user's decision) separate from statistical confidence, and keeps all existing scorecard tests green.
- **Two p-values, two purposes.** (a) Per-strategy: bootstrap/permutation on pooled per-trade returns → "is this strategy's edge distinguishable from zero?" (b) Family-level: Benjamini–Hochberg across all 41 per-strategy p-values → "which passes survive multiple testing?" Both reported; family ranking gates on the adjusted q-value.
- **Win-rate honesty.** A win rate is only "reportable" when the pooled trade count ≥ `MIN_TRADES_FOR_WINRATE` (default 30); below that, surface the Wilson interval width and a `low_confidence` flag instead of a bare number.
- **Walk-forward = anchored split.** Tune Optuna on the first `1 - OOS_FRACTION` of each symbol's series; report/store metrics on the held-out tail (reusing the existing `evaluate_over_basket(oos_fraction=)` seam). `best_params` is selected by in-sample objective but ACCEPTED only if it also clears the bar OOS; both metric sets are persisted.

## File structure

| File | Status | Responsibility |
|---|---|---|
| `backend/stocks/services/backtest_harness/statistics.py` | Create | Pure stats: `wilson_interval`, `bootstrap_pvalue`, `benjamini_hochberg`, `winrate_is_reportable` |
| `backend/stocks/services/backtest_harness/runner.py` | Modify | `normalize_metrics` captures `wins`/`losses`/`trade_returns` from `_trades` |
| `backend/stocks/services/backtest_harness/evaluate.py` | Modify | `score_results` adds a `confidence` block (Wilson CI + bootstrap p-value); per-symbol verdict logging |
| `backend/stocks/services/optimization_service.py` | Modify | Anchored in-sample/OOS split; persist both metric sets + OOS acceptance |
| `backend/stocks/services/strategy_scan.py` | Modify | Rank with BH-adjusted significance + sample-gated win rate |
| `backend/stocks/management/commands/rank_strategies.py` | Create | Family ranking: per-strategy p-values → BH q-values → ranked, multiple-testing-aware table |
| `backend/stocks/tests/test_statistics.py` | Create | Pure-stats unit tests |
| `backend/stocks/tests/test_confidence_scorecard.py` | Create | Per-trade capture + confidence-block tests |
| `backend/stocks/tests/test_walk_forward.py` | Create | Optimization split + OOS persistence tests |

---

### Task 1: Per-trade outcome capture in `normalize_metrics`

**Files:**
- Modify: `backend/stocks/services/backtest_harness/runner.py` (`normalize_metrics`, ~lines 95-113)
- Test: `backend/stocks/tests/test_confidence_scorecard.py`

The Wilson interval and bootstrap need per-trade win/loss counts and the trade-return series. backtesting.py exposes `stats['_trades']` (a DataFrame with `PnL` and `ReturnPct`). `normalize_metrics` currently takes only the stats Series; extend it to also read `_trades` when present.

- [ ] **Step 1: Write failing tests**

```python
# backend/stocks/tests/test_confidence_scorecard.py
"""Per-trade capture and scorecard confidence block."""
import pandas as pd

from stocks.services.backtest_harness.runner import run_backtest

_CROSS_CODE = """
from backtesting import Strategy
from backtesting.lib import crossover
from backtesting.test import SMA

class Cross(Strategy):
    def init(self):
        self.f = self.I(SMA, self.data.Close, 5)
        self.s = self.I(SMA, self.data.Close, 20)
    def next(self):
        if crossover(self.f, self.s):
            self.buy()
        elif crossover(self.s, self.f):
            self.position.close()
"""


def _wave_df(n=200):
    import numpy as np
    idx = pd.date_range("2024-01-01", periods=n, freq="D")
    base = 100 + 20 * np.sin(np.linspace(0, 12, n))  # repeated swings → many closed trades
    return pd.DataFrame(
        {"Open": base, "High": base + 1, "Low": base - 1, "Close": base,
         "Volume": 10_000.0}, index=idx,
    )


def test_metrics_capture_per_trade_outcomes():
    res = run_backtest(_CROSS_CODE, "TEST", df=_wave_df(), commission=0.0, spread=0.0)
    assert res.ok, res.error
    m = res.metrics
    # New fields
    assert "wins" in m and "losses" in m and "trade_returns" in m
    assert m["wins"] + m["losses"] == m["num_trades"]
    assert isinstance(m["trade_returns"], list)
    assert len(m["trade_returns"]) == m["num_trades"]


def test_zero_trade_run_has_empty_trade_fields():
    flat = pd.DataFrame(
        {"Open": 100.0, "High": 100.0, "Low": 100.0, "Close": 100.0, "Volume": 1000.0},
        index=pd.date_range("2024-01-01", periods=30, freq="D"),
    )
    never_code = "from backtesting import Strategy\nclass N(Strategy):\n    def init(self): pass\n    def next(self): pass\n"
    res = run_backtest(never_code, "TEST", df=flat, commission=0.0, spread=0.0)
    assert res.ok, res.error
    assert res.metrics["wins"] == 0 and res.metrics["losses"] == 0
    assert res.metrics["trade_returns"] == []
```

- [ ] **Step 2: Run to verify failure**

`docker-compose exec -T backend pytest stocks/tests/test_confidence_scorecard.py -v`
Expected: FAIL — `wins`/`losses`/`trade_returns` not in metrics.

- [ ] **Step 3: Extend `normalize_metrics`**

In `runner.py`, change `normalize_metrics(stats)` to also pull per-trade data. Replace the function with:

```python
def normalize_metrics(stats):
    """Flatten a backtesting.py stats Series into a JSON-serializable dict.

    NaN/inf (which backtesting.py emits for zero-trade runs) are coerced to 0.0.
    Per-trade outcomes are captured from ``stats['_trades']`` when present so the
    statistics layer can compute win-rate intervals and bootstrap significance.
    """
    metrics = {
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
    trades = None
    try:
        trades = stats["_trades"]
    except (KeyError, TypeError):
        trades = None
    if trades is not None and len(trades) and "ReturnPct" in trades:
        rets = [float(x) for x in trades["ReturnPct"].tolist()]
        metrics["trade_returns"] = rets
        metrics["wins"] = int(sum(1 for r in rets if r > 0))
        metrics["losses"] = int(len(rets) - metrics["wins"])
    else:
        metrics["trade_returns"] = []
        metrics["wins"] = 0
        metrics["losses"] = 0
    return metrics
```

- [ ] **Step 4: Run the tests**

`docker-compose exec -T backend pytest stocks/tests/test_confidence_scorecard.py -v`
Expected: 2 PASS.

- [ ] **Step 5: Regression — existing harness tests still green**

`docker-compose exec -T backend pytest stocks/tests/test_backtest_harness.py stocks/tests/test_backtest_fees.py -v`
Expected: PASS (the normalize_metrics key-mapping tests still hold; new keys are additive).

- [ ] **Step 6: Commit**

```bash
git add stocks/services/backtest_harness/runner.py stocks/tests/test_confidence_scorecard.py
git commit -m "feat(stats): capture per-trade wins/losses/returns in normalize_metrics"
```

---

### Task 2: Pure statistics module (Wilson, bootstrap, Benjamini–Hochberg)

**Files:**
- Create: `backend/stocks/services/backtest_harness/statistics.py`
- Test: `backend/stocks/tests/test_statistics.py`

- [ ] **Step 1: Write failing tests**

```python
# backend/stocks/tests/test_statistics.py
"""Pure statistical helpers for the harness."""
import pytest

from stocks.services.backtest_harness.statistics import (
    wilson_interval,
    bootstrap_pvalue,
    benjamini_hochberg,
    winrate_is_reportable,
    MIN_TRADES_FOR_WINRATE,
)


def test_wilson_interval_basic():
    lo, hi = wilson_interval(wins=60, n=100)
    assert 0.0 <= lo < 0.60 < hi <= 1.0
    assert hi - lo < 0.25  # 100 samples → reasonably tight


def test_wilson_interval_widens_with_small_n():
    wide_lo, wide_hi = wilson_interval(7, 10)
    tight_lo, tight_hi = wilson_interval(70, 100)
    assert (wide_hi - wide_lo) > (tight_hi - tight_lo)


def test_wilson_interval_zero_n_is_full_uncertainty():
    lo, hi = wilson_interval(0, 0)
    assert lo == 0.0 and hi == 1.0


def test_bootstrap_pvalue_strong_edge_is_significant():
    # Consistently positive trade returns → low p-value for "mean > 0".
    rets = [0.05, 0.04, 0.06, 0.03, 0.05, 0.04, 0.05, 0.06, 0.04, 0.05] * 5
    p = bootstrap_pvalue(rets, n_resamples=2000, seed=1)
    assert p < 0.05


def test_bootstrap_pvalue_noise_is_not_significant():
    rets = [0.05, -0.05, 0.04, -0.06, 0.01, -0.02, 0.03, -0.03, 0.0, -0.01] * 3
    p = bootstrap_pvalue(rets, n_resamples=2000, seed=1)
    assert p > 0.10


def test_bootstrap_pvalue_empty_is_one():
    assert bootstrap_pvalue([], n_resamples=100, seed=1) == 1.0


def test_benjamini_hochberg_orders_and_thresholds():
    pvals = [0.001, 0.04, 0.20, 0.50, 0.9]
    rejected, qvals = benjamini_hochberg(pvals, alpha=0.05)
    assert rejected[0] is True          # smallest survives
    assert rejected[-1] is False        # largest does not
    assert len(qvals) == len(pvals)
    assert all(0.0 <= q <= 1.0 for q in qvals)


def test_benjamini_hochberg_empty():
    rejected, qvals = benjamini_hochberg([], alpha=0.05)
    assert rejected == [] and qvals == []


def test_winrate_reportable_gate():
    assert winrate_is_reportable(MIN_TRADES_FOR_WINRATE) is True
    assert winrate_is_reportable(MIN_TRADES_FOR_WINRATE - 1) is False
    assert winrate_is_reportable(0) is False
```

- [ ] **Step 2: Run to verify failure**

`docker-compose exec -T backend pytest stocks/tests/test_statistics.py -v`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement the module**

```python
# backend/stocks/services/backtest_harness/statistics.py
"""Pure statistical helpers (NumPy only, no Django) for honest reporting.

- wilson_interval: confidence interval for a win rate (proportion).
- bootstrap_pvalue: one-sided p-value that a return series' mean exceeds 0.
- benjamini_hochberg: multiple-testing correction across a strategy family.
- winrate_is_reportable: sample-size gate before a win rate is shown as a number.
"""
import numpy as np

__all__ = [
    "wilson_interval", "bootstrap_pvalue", "benjamini_hochberg",
    "winrate_is_reportable", "MIN_TRADES_FOR_WINRATE",
]

# Below this many pooled trades, a win rate is noise — report the interval, not the point.
MIN_TRADES_FOR_WINRATE = 30

# z for a 95% two-sided interval.
_Z95 = 1.959963984540054


def wilson_interval(wins, n, z=_Z95):
    """Wilson score interval for a binomial proportion. Returns (lo, hi) in [0,1].

    n == 0 → (0.0, 1.0): no evidence, full uncertainty.
    """
    n = int(n)
    if n <= 0:
        return 0.0, 1.0
    p = wins / n
    z2 = z * z
    denom = 1.0 + z2 / n
    center = (p + z2 / (2 * n)) / denom
    margin = (z * np.sqrt(p * (1 - p) / n + z2 / (4 * n * n))) / denom
    return max(0.0, center - margin), min(1.0, center + margin)


def bootstrap_pvalue(returns, n_resamples=5000, seed=0):
    """One-sided p-value for H0: mean(returns) <= 0 via a sign-flip permutation.

    Each resample randomly flips the sign of each return (the null of a
    zero-edge, symmetric P&L) and counts how often the resampled mean meets or
    exceeds the observed mean. Empty input → 1.0 (no evidence of an edge).
    """
    r = np.asarray(returns, dtype=float)
    if r.size == 0:
        return 1.0
    observed = r.mean()
    if observed <= 0:
        return 1.0
    rng = np.random.default_rng(seed)
    signs = rng.choice([-1.0, 1.0], size=(n_resamples, r.size))
    resampled_means = (signs * r).mean(axis=1)
    # +1 smoothing so a p-value is never exactly 0.
    return float((np.sum(resampled_means >= observed) + 1) / (n_resamples + 1))


def benjamini_hochberg(pvalues, alpha=0.05):
    """Benjamini–Hochberg FDR control. Returns (rejected: list[bool], qvalues: list[float]).

    ``rejected[i]`` is True when hypothesis i survives at FDR ``alpha``. Order of
    inputs is preserved in both outputs.
    """
    m = len(pvalues)
    if m == 0:
        return [], []
    order = sorted(range(m), key=lambda i: pvalues[i])
    qvals = [0.0] * m
    rejected = [False] * m
    # Monotone q-values from largest rank down.
    prev_q = 1.0
    for rank in range(m, 0, -1):
        i = order[rank - 1]
        q = min(prev_q, pvalues[i] * m / rank)
        qvals[i] = q
        prev_q = q
    # Largest k with p_(k) <= (k/m)*alpha → reject all up to k.
    max_k = 0
    for k in range(1, m + 1):
        if pvalues[order[k - 1]] <= (k / m) * alpha:
            max_k = k
    for k in range(1, max_k + 1):
        rejected[order[k - 1]] = True
    return rejected, qvals


def winrate_is_reportable(num_trades):
    """True when the trade count is large enough to quote a win rate as a number."""
    return int(num_trades) >= MIN_TRADES_FOR_WINRATE
```

- [ ] **Step 4: Run the tests**

`docker-compose exec -T backend pytest stocks/tests/test_statistics.py -v`
Expected: 9 PASS.

- [ ] **Step 5: Commit**

```bash
git add stocks/services/backtest_harness/statistics.py stocks/tests/test_statistics.py
git commit -m "feat(stats): Wilson interval, bootstrap p-value, Benjamini-Hochberg helpers"
```

---

### Task 3: Confidence block + per-symbol verdicts in the scorecard

**Files:**
- Modify: `backend/stocks/services/backtest_harness/evaluate.py` (`score_results`)
- Test: `backend/stocks/tests/test_confidence_scorecard.py` (append)

Add a `card.confidence` dict (pooled across the basket) and per-symbol verdict diagnostics. **Do NOT change `card.passed` or the 5 `verdicts`** — existing tests and the 21/41 economic bar must be untouched.

- [ ] **Step 1: Append failing tests**

```python
# append to backend/stocks/tests/test_confidence_scorecard.py
from stocks.services.backtest_harness.evaluate import score_results
from stocks.services.backtest_harness.runner import BacktestResult


def _result(symbol, ret, bh, sortino, dd, trades, wins=None, trade_returns=None):
    wins = trades // 2 if wins is None else wins
    if trade_returns is None:
        trade_returns = [0.02] * wins + [-0.02] * (trades - wins)
    return BacktestResult(symbol=symbol, ok=True, metrics={
        "return_pct": ret, "buy_hold_return_pct": bh, "sortino": sortino,
        "max_drawdown_pct": dd, "num_trades": trades, "win_rate_pct": 100.0 * wins / trades if trades else 0.0,
        "wins": wins, "losses": trades - wins, "trade_returns": trade_returns,
    })


def test_confidence_block_present_and_pooled():
    results = [_result(f"S{i}", ret=40, bh=20, sortino=1.5, dd=-10, trades=20) for i in range(10)]
    card = score_results("edge", results)
    c = card.confidence
    assert "win_rate_ci" in c and len(c["win_rate_ci"]) == 2
    assert "win_rate_reportable" in c          # 10*20 = 200 pooled trades → True
    assert c["win_rate_reportable"] is True
    assert "excess_pvalue" in c and 0.0 <= c["excess_pvalue"] <= 1.0
    assert "total_trades" in c and c["total_trades"] == 200


def test_low_sample_flagged_not_reportable():
    results = [_result(f"S{i}", ret=40, bh=20, sortino=1.5, dd=-10, trades=2) for i in range(5)]
    card = score_results("thin", results)
    assert card.confidence["total_trades"] == 10
    assert card.confidence["win_rate_reportable"] is False


def test_passed_still_only_depends_on_economic_verdicts():
    # A strategy that clears the 5 economic verdicts still passes, regardless of
    # the new confidence block — the economic bar is unchanged.
    results = [_result(f"S{i}", ret=40, bh=20, sortino=1.5, dd=-10, trades=20) for i in range(10)]
    card = score_results("edge", results)
    assert card.passed is True
    assert set(card.verdicts.keys()) == {
        "runs_clean", "active", "beats_bh_return",
        "positive_risk_adjusted", "beats_bh_drawdown_adjusted",
    }


def test_per_symbol_verdicts_recorded():
    results = [_result(f"S{i}", ret=40, bh=20, sortino=1.5, dd=-10, trades=20) for i in range(10)]
    card = score_results("edge", results)
    d = card.to_dict()
    assert "symbols" in d and len(d["symbols"]) == 10
    # each symbol row carries a beats_bh flag for weak-alpha-vs-bad-data triage
    assert "beats_bh" in d["symbols"][0]
```

- [ ] **Step 2: Run to verify failure**

`docker-compose exec -T backend pytest stocks/tests/test_confidence_scorecard.py -v -k "confidence or low_sample or per_symbol or economic"`
Expected: FAIL — `card.confidence` missing; `beats_bh` not in symbol rows.

- [ ] **Step 3: Extend `score_results`**

In `evaluate.py`, add imports at top:

```python
from .statistics import wilson_interval, bootstrap_pvalue, winrate_is_reportable
```

Add a `confidence: dict = field(default_factory=dict)` field to the `ScoreCard` dataclass, and include it in `to_dict()` (add `"confidence": self.confidence,` to the returned dict, and add `"beats_bh": (r.metrics.get("return_pct", 0.0) > r.metrics.get("buy_hold_return_pct", 0.0))` to each symbol row).

In `score_results`, AFTER the existing `card.aggregates = {...}` block and BEFORE `return card`, add:

```python
    # --- Statistical confidence (reported; does NOT gate card.passed) ---
    total_wins = sum(int(r.metrics.get("wins", 0)) for r in ok)
    total_trades = sum(int(r.metrics.get("num_trades", 0)) for r in ok)
    pooled_returns = [x for r in ok for x in r.metrics.get("trade_returns", [])]
    ci_lo, ci_hi = wilson_interval(total_wins, total_trades)
    card.confidence = {
        "total_trades": total_trades,
        "total_wins": total_wins,
        "pooled_win_rate": round(100.0 * total_wins / total_trades, 2) if total_trades else 0.0,
        "win_rate_ci": [round(ci_lo, 4), round(ci_hi, 4)],
        "win_rate_reportable": winrate_is_reportable(total_trades),
        "excess_pvalue": round(bootstrap_pvalue(pooled_returns), 4),
    }
```

(The empty-results early-return branch near the top keeps `confidence` as its default `{}` — fine.)

- [ ] **Step 4: Run the tests**

`docker-compose exec -T backend pytest stocks/tests/test_confidence_scorecard.py -v`
Expected: all PASS.

- [ ] **Step 5: Regression — scorecard tests unchanged**

`docker-compose exec -T backend pytest stocks/tests/test_backtest_harness.py -v -k scorecard`
Expected: PASS (the 5-verdict / `.passed` tests are untouched).

- [ ] **Step 6: Commit**

```bash
git add stocks/services/backtest_harness/evaluate.py stocks/tests/test_confidence_scorecard.py
git commit -m "feat(stats): scorecard reports win-rate CI + bootstrap p-value + per-symbol verdicts"
```

---

### Task 4: Walk-forward optimization (in-sample tune, OOS validate)

**Files:**
- Modify: `backend/stocks/services/optimization_service.py` (`run_optimization`)
- Test: `backend/stocks/tests/test_walk_forward.py`

Today Optuna tunes and reports on one contiguous window (in-sample overfit). Split each symbol's series with an anchored cut: tune on the first `1 - OOS_FRACTION`, then evaluate the chosen params on the held-out tail; persist BOTH metric sets and an `oos_accepted` flag in `StrategyExperiment.metrics`.

- [ ] **Step 1: Read the current code**

Read `optimization_service.py` `run_optimization` (~lines 439-597), `fetch_data` (~409-436), and the `StrategyExperiment.objects.create(...)` call. Note the objective closure and how `data_map` (`{ticker: DataFrame}`) is built and sliced.

- [ ] **Step 2: Write failing tests**

```python
# backend/stocks/tests/test_walk_forward.py
"""Anchored in-sample/out-of-sample split in optimization."""
import numpy as np
import pandas as pd

from stocks.services.optimization_service import OptimizationService, OOS_FRACTION


def _series(n=400):
    idx = pd.date_range("2023-01-01", periods=n, freq="D")
    base = 100 + 15 * np.sin(np.linspace(0, 16, n)) + np.linspace(0, 10, n)
    return pd.DataFrame(
        {"open": base, "high": base + 1, "low": base - 1, "close": base, "volume": 1000.0},
        index=idx,
    )


def test_anchored_split_helper_partitions_by_fraction():
    df = _series(400)
    is_df, oos_df = OptimizationService.anchored_split(df, OOS_FRACTION)
    # Contiguous, non-overlapping, in-sample first.
    assert len(is_df) + len(oos_df) == len(df)
    assert is_df.index.max() < oos_df.index.min()
    assert abs(len(oos_df) / len(df) - OOS_FRACTION) < 0.02


def test_oos_fraction_is_sane_default():
    assert 0.2 <= OOS_FRACTION <= 0.4
```

- [ ] **Step 3: Add the split helper + OOS evaluation**

In `optimization_service.py`, add near the top (module level):

```python
OOS_FRACTION = 0.30  # held-out tail fraction for out-of-sample validation
```

Add a static method to `OptimizationService`:

```python
    @staticmethod
    def anchored_split(df, oos_fraction=OOS_FRACTION):
        """Split a date-ordered price frame into (in_sample, out_of_sample) by tail fraction."""
        cut = int(len(df) * (1 - oos_fraction))
        return df.iloc[:cut], df.iloc[cut:]
```

In `run_optimization`: build an in-sample `data_map` (apply `anchored_split(...)[0]` to each symbol's frame) and tune Optuna on THAT. After `study.optimize(...)`, run the winning `study.best_params` once over the OOS tail of each symbol (the `[1]` split) to compute an out-of-sample average of the SAME objective metric. Replace the `metrics={...}` in the `StrategyExperiment.objects.create(...)` with:

```python
            metrics={
                "best_value": study.best_value,           # in-sample
                "oos_value": oos_value,                   # out-of-sample (same objective)
                "oos_fraction": OOS_FRACTION,
                "oos_accepted": bool(oos_value is not None and oos_value >= 0.5 * study.best_value),
                "n_trials": len(study.trials),
            },
```

where `oos_value` is the average objective metric from the OOS re-run (compute it with the existing per-symbol execution path, just over the OOS slice; if no OOS data, set `oos_value=None`). The `oos_accepted` rule (OOS retains ≥ 50% of in-sample objective) flags overfit params without hard-blocking — the user still sees both numbers.

Keep `return study.best_params, study.best_value` unchanged so callers don't break.

- [ ] **Step 4: Run the tests**

`docker-compose exec -T backend pytest stocks/tests/test_walk_forward.py -v`
Expected: 2 PASS.

- [ ] **Step 5: Smoke-test a real optimization run (in Docker)**

```bash
docker-compose exec -T backend python manage.py shell -c "
from stocks.models import Strategy
from stocks.services.optimization_service import OptimizationService
s = Strategy.objects.filter(spec__isnull=False).first() or Strategy.objects.first()
svc = OptimizationService()
import datetime as dt
bp, bv = svc.run_optimization(s, 'SYMBOL', 'NABIL', dt.date(2021,1,1), dt.date(2026,1,1), n_trials=5, objective_type='win_rate')
from stocks.models import StrategyExperiment
e = StrategyExperiment.objects.filter(strategy=s).order_by('-created_at').first()
print('best_params:', bp); print('metrics:', e.metrics)
" 2>&1 | grep -iv "warn\|Backtest.run\|trial" | tail -6
```
Expected: `metrics` dict shows both `best_value` and `oos_value` (+ `oos_accepted`). Report the values.

- [ ] **Step 6: Regression + commit**

`docker-compose exec -T backend pytest stocks/tests/ -q` (expect only the known pre-existing failure)

```bash
git add stocks/services/optimization_service.py stocks/tests/test_walk_forward.py
git commit -m "feat(stats): anchored walk-forward split — tune in-sample, validate + persist OOS"
```

---

### Task 5: Family ranking with multiple-testing correction

**Files:**
- Create: `backend/stocks/management/commands/rank_strategies.py`
- Test: covered via the command's `--help` + a dry computation; core math already unit-tested in Task 2.

Produce a single ranked view of the 41-strategy family that is honest about multiple testing: per-strategy bootstrap p-value (from the basket confidence block) → Benjamini–Hochberg q-values → rank, with a `survives_fdr` flag and sample-gated win rate.

- [ ] **Step 1: Write the command**

```python
# backend/stocks/management/commands/rank_strategies.py
"""Rank every strategy on the basket with multiple-testing-aware significance.

For each strategy: economic pass (5-verdict scorecard) + pooled win-rate CI +
bootstrap p-value that its edge differs from zero. Benjamini-Hochberg across the
whole family yields q-values; ``survives_fdr`` marks strategies whose edge holds
up after correcting for having tried many. Output ranks by (survives_fdr,
economic pass, median excess return).

Usage: python manage.py rank_strategies [--alpha 0.05] [--out <dir>]
"""
import json
import os

from django.core.management.base import BaseCommand

from stocks.models import Strategy
from stocks.services.backtest_harness import load_basket, evaluate_over_basket
from stocks.services.backtest_harness.statistics import benjamini_hochberg


class Command(BaseCommand):
    help = "Rank strategies on the basket with FDR-corrected significance."

    def add_arguments(self, parser):
        parser.add_argument("--alpha", type=float, default=0.05)
        parser.add_argument("--out", type=str, default=None)

    def handle(self, *args, **opts):
        basket, dropped = load_basket()
        if dropped:
            self.stdout.write(self.style.WARNING(
                f"Dropped {len(dropped)} thin tickers: " + ", ".join(t for t, _ in dropped)
            ))
        strategies = list(Strategy.objects.all().order_by("id"))
        rows = []
        for s in strategies:
            card = evaluate_over_basket(s, basket, strategy_name=s.name)
            c = card.confidence or {}
            rows.append({
                "name": s.name,
                "passed": card.passed,
                "median_excess_return_pct": card.aggregates.get("median_excess_return_pct"),
                "pooled_win_rate": c.get("pooled_win_rate"),
                "win_rate_ci": c.get("win_rate_ci"),
                "win_rate_reportable": c.get("win_rate_reportable"),
                "pvalue": c.get("excess_pvalue", 1.0),
                "total_trades": c.get("total_trades", 0),
            })

        rejected, qvals = benjamini_hochberg([r["pvalue"] for r in rows], alpha=opts["alpha"])
        for r, rej, q in zip(rows, rejected, qvals):
            r["survives_fdr"] = bool(rej)
            r["qvalue"] = round(q, 4)

        rows.sort(key=lambda r: (
            not r["survives_fdr"], not r["passed"],
            -(r["median_excess_return_pct"] or -1e9),
        ))

        self.stdout.write(f"\n{'Strategy':<34} pass fdr  medExc%   winRate(CI)         q")
        for r in rows:
            wr = (f"{r['pooled_win_rate']:.0f}% "
                  f"[{r['win_rate_ci'][0]*100:.0f}-{r['win_rate_ci'][1]*100:.0f}]"
                  if r["win_rate_reportable"] else "(low-n)")
            self.stdout.write(
                f"{r['name'][:33]:<34} "
                f"{'Y' if r['passed'] else '.'}    "
                f"{'Y' if r['survives_fdr'] else '.'}   "
                f"{(r['median_excess_return_pct'] or 0):>7.1f}  {wr:<18} {r['qvalue']}"
            )
        survivors = sum(1 for r in rows if r["survives_fdr"])
        self.stdout.write(self.style.SUCCESS(
            f"\n{survivors}/{len(rows)} survive FDR@{opts['alpha']}; "
            f"{sum(1 for r in rows if r['passed'])}/{len(rows)} pass the economic bar."
        ))

        if opts["out"]:
            os.makedirs(opts["out"], exist_ok=True)
            with open(os.path.join(opts["out"], "ranking.json"), "w") as f:
                json.dump(rows, f, indent=2)
            self.stdout.write(f"Wrote {opts['out']}/ranking.json")
```

- [ ] **Step 2: Verify it loads**

`docker-compose exec -T backend python manage.py rank_strategies --help`
Expected: usage text with `--alpha` and `--out`.

- [ ] **Step 3: Run it for real (in Docker)**

`docker-compose exec -T backend python manage.py rank_strategies --out backtest_reports/phase2_ranking 2>&1 | grep -iv "warn\|Backtest.run" | tail -50`
Expected: a ranked table; a line `"N/41 survive FDR; M/41 pass the economic bar."` Report both counts. Spot-check that strategies with very few trades show `(low-n)` rather than a win-rate number, and that economic passes with weak/noisy edges can still fail FDR.

- [ ] **Step 4: Commit (code + report)**

```bash
git add stocks/management/commands/rank_strategies.py
git add -f backtest_reports/phase2_ranking/
git commit -m "feat(stats): FDR-corrected family ranking command (rank_strategies)"
```

---

### Task 6: Sample-gated, significance-aware single-symbol scan ranking

**Files:**
- Modify: `backend/stocks/services/strategy_scan.py` (`_row`, ranking in `scan_symbol`)
- Test: `backend/stocks/tests/test_confidence_scorecard.py` (append a focused test) OR a new `test_strategy_scan_ranking.py`

The scan currently ranks by raw `return_pct` and shows a bare `win_rate_pct`. Add the Wilson CI + sample gate to each row and stop a tiny-sample high win rate from outranking a well-sampled one.

- [ ] **Step 1: Read `strategy_scan.py`** `_row` (~lines 28-45) and `scan_symbol` ranking (~lines 120-124) to confirm field names and the `m` metrics dict (now carries `wins`/`num_trades`/`trade_returns` from Task 1).

- [ ] **Step 2: Write failing test**

```python
# backend/stocks/tests/test_strategy_scan_ranking.py
"""Scan rows carry sample-gated win-rate confidence."""
from stocks.services.strategy_scan import _row_confidence


def test_row_confidence_gates_small_samples():
    hi_small = _row_confidence(win_rate_pct=80.0, wins=4, num_trades=5)
    assert hi_small["win_rate_reportable"] is False
    assert hi_small["win_rate_ci"][1] - hi_small["win_rate_ci"][0] > 0.3  # wide

    well = _row_confidence(win_rate_pct=60.0, wins=60, num_trades=100)
    assert well["win_rate_reportable"] is True
    assert well["win_rate_ci"][1] - well["win_rate_ci"][0] < 0.25
```

- [ ] **Step 3: Add `_row_confidence` and use it**

In `strategy_scan.py`, add:

```python
from stocks.services.backtest_harness.statistics import wilson_interval, winrate_is_reportable


def _row_confidence(win_rate_pct, wins, num_trades):
    lo, hi = wilson_interval(wins, num_trades)
    return {
        "win_rate_ci": [round(lo, 4), round(hi, 4)],
        "win_rate_reportable": winrate_is_reportable(num_trades),
    }
```

In `_row(...)`, merge `_row_confidence(m["win_rate_pct"], m.get("wins", 0), m["num_trades"])` into the returned dict. In `scan_symbol`'s ranking, leave the primary `return_pct` sort but break ties / demote non-reportable win rates: when selecting `best_risk_adjusted`, prefer rows where `win_rate_reportable` is True (a tiny-sample fluke shouldn't win the risk-adjusted slot). Keep changes minimal and additive.

- [ ] **Step 4: Run tests + regression**

`docker-compose exec -T backend pytest stocks/tests/test_strategy_scan_ranking.py stocks/tests/test_confidence_scorecard.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add stocks/services/strategy_scan.py stocks/tests/test_strategy_scan_ranking.py
git commit -m "feat(stats): scan rows carry sample-gated win-rate confidence intervals"
```

---

### Task 7: Phase-2 summary report + memory update

**Files:**
- Create: `backend/backtest_reports/phase2_ranking/SUMMARY.md`
- Update: project memory

- [ ] **Step 1: Write the summary** from the Task 5 ranking run: how many of the 41 survive FDR vs pass the economic bar, which economic-passers fail significance (the overfit suspects), and which have non-reportable win rates. Tie back to the research-engine goal: the FDR survivors are the defensible-edge shortlist that Plan 3 should rank as "opportunities."

- [ ] **Step 2: Commit the report**, then update `memory/project_strategy_upgrade.md` with a Plan-2 paragraph (Wilson CI + bootstrap + BH live in `statistics.py`; scorecard reports a `confidence` block without changing the economic pass; optimization is walk-forward with persisted OOS; `rank_strategies` gives the FDR-aware family view; record the FDR-survivor count as the new "trustworthy shortlist" number).

---

## Self-review checklist (done at planning time)

- **Roadmap coverage:** Wilson CI + sample gates (Tasks 2,3,6); walk-forward OOS (Task 4); permutation/bootstrap significance (Tasks 2,3); multiple-testing family ranking (Tasks 2,5); per-symbol verdict logging (Task 3). SafeTa gap-fix item intentionally dropped (already done — noted at top).
- **No regressions by design:** the economic 5-verdict `.passed` is explicitly unchanged (Task 3 + its `test_passed_still_only_depends_on_economic_verdicts`); new metric keys are additive; `run_optimization` keeps its return signature.
- **Type consistency:** `normalize_metrics` adds `wins`/`losses`/`trade_returns` (Task 1) consumed by `score_results` confidence block (Task 3), `rank_strategies` (Task 5), and `_row_confidence` (Task 6); `benjamini_hochberg` returns `(rejected, qvalues)` consumed identically in Task 5; `wilson_interval` returns `(lo, hi)` floats used in Tasks 3 and 6.
- **No placeholders:** every code step has complete code; every run step has a Docker command + expected result.
- **Known risk:** Task 4 is the largest edit (touches the Optuna objective wiring) — Step 1 mandates reading the current closure before editing, and Step 5 smoke-tests a real run before commit.
