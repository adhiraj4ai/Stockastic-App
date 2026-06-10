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


def bootstrap_pvalue(values, n_resamples=5000, seed=0):
    """One-sided bootstrap p-value for H0: mean(values) <= 0.

    Uses a one-sample bootstrap of the MEAN against a mean-shifted null
    (Efron): resample the zero-centered values with replacement and count how
    often a resampled mean reaches the observed mean. Unlike a sign-flip
    permutation, this makes NO symmetry assumption, so it stays calibrated for
    the asymmetric, bounded-below distributions typical of trade/excess returns
    (a sign-flip null is anti-conservative for left-skewed P&L). Pass the
    natural independent unit (e.g. per-symbol excess returns), not pooled
    correlated trades. Empty input → 1.0 (no evidence of an edge).
    """
    x = np.asarray(values, dtype=float)
    if x.size == 0:
        return 1.0
    observed = x.mean()
    if observed <= 0:
        return 1.0
    rng = np.random.default_rng(seed)
    shifted = x - observed  # null distribution: mean 0, original shape/skew preserved
    idx = rng.integers(0, x.size, size=(n_resamples, x.size))
    resampled_means = shifted[idx].mean(axis=1)
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
    prev_q = 1.0
    for rank in range(m, 0, -1):
        i = order[rank - 1]
        q = min(prev_q, pvalues[i] * m / rank)
        qvals[i] = q
        prev_q = q
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
