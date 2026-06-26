"""Pure functions over daily-return arrays. No Django, no DB."""
import numpy as np

_MIN_POINTS = 2
_VARIANCE_EPSILON = 1e-10


def beta(stock_returns, index_returns):
    """Slope of stock vs index returns: cov(s, i) / var(i). None if undefined."""
    if len(stock_returns) < _MIN_POINTS or len(index_returns) < _MIN_POINTS:
        return None
    cov = np.cov(stock_returns, index_returns)
    index_variance = cov[1, 1]
    if index_variance < _VARIANCE_EPSILON:
        return None
    return float(cov[0, 1] / index_variance)


def correlation_matrix(returns_by_ticker):
    """Pairwise correlation matrix + average off-diagonal correlation."""
    tickers = list(returns_by_ticker.keys())
    if len(tickers) < 2:
        return {"tickers": tickers, "matrix": [[1.0]] if tickers else [], "average_correlation": None}
    data = np.vstack([returns_by_ticker[t] for t in tickers])
    corr = np.corrcoef(data)
    average = _average_off_diagonal(corr, len(tickers))
    return {
        "tickers": tickers,
        "matrix": np.round(corr, 3).tolist(),
        "average_correlation": average,
    }


def _average_off_diagonal(matrix, n):
    off = [matrix[i, j] for i in range(n) for j in range(n) if i != j]
    return round(float(np.mean(off)), 3) if off else None


_Z_SCORES = {0.95: 1.645, 0.99: 2.326}


def max_drawdown(portfolio_returns):
    """Largest peak-to-trough decline of the cumulative return curve. Negative fraction."""
    if len(portfolio_returns) < _MIN_POINTS:
        return None
    curve = np.cumprod(1 + np.asarray(portfolio_returns, dtype=float))
    running_max = np.maximum.accumulate(curve)
    drawdowns = curve / running_max - 1
    return float(drawdowns.min())


def historical_var(portfolio_returns, confidence=0.95):
    """Historical VaR: positive loss fraction at the (1-confidence) percentile."""
    if len(portfolio_returns) < _MIN_POINTS:
        return None
    percentile = (1 - confidence) * 100
    quantile = float(np.percentile(portfolio_returns, percentile))
    return abs(quantile) if quantile < 0 else 0.0


def parametric_var(portfolio_returns, confidence=0.95):
    """Variance-covariance VaR fallback: positive loss fraction from mean/sigma."""
    if len(portfolio_returns) < _MIN_POINTS:
        return None
    z = _Z_SCORES.get(confidence, _Z_SCORES[0.95])
    mean = float(np.mean(portfolio_returns))
    sigma = float(np.std(portfolio_returns, ddof=1))
    loss = -(mean - z * sigma)
    return loss if loss > 0 else 0.0
