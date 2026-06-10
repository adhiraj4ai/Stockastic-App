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
    assert hi - lo < 0.25


def test_wilson_interval_widens_with_small_n():
    wide_lo, wide_hi = wilson_interval(7, 10)
    tight_lo, tight_hi = wilson_interval(70, 100)
    assert (wide_hi - wide_lo) > (tight_hi - tight_lo)


def test_wilson_interval_zero_n_is_full_uncertainty():
    lo, hi = wilson_interval(0, 0)
    assert lo == 0.0 and hi == 1.0


def test_bootstrap_pvalue_strong_edge_is_significant():
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
    assert rejected[0] is True
    assert rejected[-1] is False
    assert len(qvals) == len(pvals)
    assert all(0.0 <= q <= 1.0 for q in qvals)


def test_benjamini_hochberg_empty():
    rejected, qvals = benjamini_hochberg([], alpha=0.05)
    assert rejected == [] and qvals == []


def test_winrate_reportable_gate():
    assert winrate_is_reportable(MIN_TRADES_FOR_WINRATE) is True
    assert winrate_is_reportable(MIN_TRADES_FOR_WINRATE - 1) is False
    assert winrate_is_reportable(0) is False
