# Market-Relative Risk Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add beta-to-NEPSE, holding correlation, max drawdown, and Value-at-Risk to portfolio risk analysis, surfaced via the risk API, the chat `get_risk_profile` tool, and the frontend risk page, with alerts.

**Architecture:** A new `stocks/services/risk/` package holds a pure-math module (`returns_metrics.py`, no DB), a DB loader (`return_series.py`) that builds a date-aligned daily-return DataFrame from `DailyStockPrice` + the `NEPSE Index` series, and an orchestrator (`market_risk_service.py`). `RiskAnalysisService` composes the orchestrator and merges results into its existing response, replacing the hardcoded `Systemic Risk = 5.0` radar axis with real beta.

**Tech Stack:** Django 5.2, DRF, numpy, pandas (both already in `requirements`), pytest; Next.js 16 / React 19 / Tailwind / shadcn / recharts, Vitest.

## Global Constraints

- No function/method body may exceed 30 lines; extract helpers first.
- No magic numbers/strings — extract to named constants.
- TDD: write the failing test first, every task.
- Tests live in `stocks/tests/` (backend) and co-located `*.test.tsx` (frontend).
- Frontend UI: sentence-case labels, warm sans, no all-caps, no monospace/terminal aesthetic.
- Format API decimals via `lib/numbers` in the frontend — never ad hoc.
- The canonical index name is `NEPSE_INDEX_NAME = 'NEPSE Index'` (`stocks/services/fundamental_calculator.py:26`).
- `RiskAnalysisService.get_risk_analysis` MUST stay callable as `(user, account_id)` — `window` is added as a keyword with a default.
- Frontend changes require a Docker image rebuild + hard refresh to take effect (`localhost:3000` is Docker-built).

---

### Task 1: Pure metrics — beta & correlation

**Files:**
- Create: `backend/stocks/services/risk/__init__.py`
- Create: `backend/stocks/services/risk/returns_metrics.py`
- Test: `backend/stocks/tests/test_returns_metrics.py`

**Interfaces:**
- Consumes: nothing (pure numpy).
- Produces:
  - `beta(stock_returns: np.ndarray, index_returns: np.ndarray) -> float | None`
  - `correlation_matrix(returns_by_ticker: dict[str, np.ndarray]) -> dict` returning
    `{"tickers": list[str], "matrix": list[list[float]], "average_correlation": float | None}`

- [ ] **Step 1: Write the failing test**

```python
# backend/stocks/tests/test_returns_metrics.py
import numpy as np
import pytest
from stocks.services.risk import returns_metrics as rm


def test_beta_of_index_against_itself_is_one():
    idx = np.array([0.01, -0.02, 0.03, -0.01, 0.02])
    assert rm.beta(idx, idx) == pytest.approx(1.0)


def test_beta_doubles_when_stock_moves_twice_the_index():
    idx = np.array([0.01, -0.02, 0.03, -0.01, 0.02])
    stock = idx * 2
    assert rm.beta(stock, idx) == pytest.approx(2.0)


def test_beta_returns_none_when_index_has_no_variance():
    idx = np.array([0.0, 0.0, 0.0])
    stock = np.array([0.01, -0.01, 0.02])
    assert rm.beta(stock, idx) is None


def test_beta_returns_none_for_too_few_points():
    assert rm.beta(np.array([0.01]), np.array([0.01])) is None


def test_correlation_matrix_identical_series_average_is_one():
    r = np.array([0.01, -0.02, 0.03, -0.01, 0.02])
    out = rm.correlation_matrix({"A": r, "B": r})
    assert out["tickers"] == ["A", "B"]
    assert out["average_correlation"] == pytest.approx(1.0)


def test_correlation_matrix_single_ticker_has_no_average():
    out = rm.correlation_matrix({"A": np.array([0.01, 0.02, 0.03])})
    assert out["average_correlation"] is None
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest stocks/tests/test_returns_metrics.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'stocks.services.risk'`

- [ ] **Step 3: Write minimal implementation**

```python
# backend/stocks/services/risk/__init__.py
```

(empty file)

```python
# backend/stocks/services/risk/returns_metrics.py
"""Pure functions over daily-return arrays. No Django, no DB."""
import numpy as np

_MIN_POINTS = 2


def beta(stock_returns, index_returns):
    """Slope of stock vs index returns: cov(s, i) / var(i). None if undefined."""
    if len(stock_returns) < _MIN_POINTS or len(index_returns) < _MIN_POINTS:
        return None
    cov = np.cov(stock_returns, index_returns)
    index_variance = cov[1, 1]
    if index_variance == 0:
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && pytest stocks/tests/test_returns_metrics.py -v`
Expected: PASS (6 passed)

- [ ] **Step 5: Commit**

```bash
git add backend/stocks/services/risk/__init__.py backend/stocks/services/risk/returns_metrics.py backend/stocks/tests/test_returns_metrics.py
git commit -m "feat(risk): add pure beta and correlation metrics"
```

---

### Task 2: Pure metrics — max drawdown & VaR

**Files:**
- Modify: `backend/stocks/services/risk/returns_metrics.py`
- Test: `backend/stocks/tests/test_returns_metrics.py` (append)

**Interfaces:**
- Consumes: nothing (pure numpy).
- Produces:
  - `max_drawdown(portfolio_returns: np.ndarray) -> float | None` — negative fraction (e.g. `-0.28`)
  - `historical_var(portfolio_returns: np.ndarray, confidence: float = 0.95) -> float | None` — positive loss fraction
  - `parametric_var(portfolio_returns: np.ndarray, confidence: float = 0.95) -> float | None` — positive loss fraction

- [ ] **Step 1: Write the failing test**

```python
# append to backend/stocks/tests/test_returns_metrics.py

def test_max_drawdown_captures_peak_to_trough():
    # +10%, then three -10% steps: peak at index 0 of curve, deep trough after
    returns = np.array([0.10, -0.10, -0.10, -0.10])
    dd = rm.max_drawdown(returns)
    assert dd < 0
    assert dd == pytest.approx(-0.271, abs=1e-3)


def test_max_drawdown_is_zero_for_monotonic_gains():
    returns = np.array([0.01, 0.02, 0.03])
    assert rm.max_drawdown(returns) == pytest.approx(0.0, abs=1e-9)


def test_max_drawdown_none_for_too_few_points():
    assert rm.max_drawdown(np.array([0.01])) is None


def test_historical_var_returns_positive_loss_at_95():
    returns = np.array([-0.10, -0.05, -0.02, 0.0, 0.01, 0.02, 0.03, 0.04, 0.05, 0.06])
    var = rm.historical_var(returns, confidence=0.95)
    assert var > 0
    assert var == pytest.approx(0.0955, abs=1e-3)


def test_historical_var_zero_when_no_losses_in_tail():
    returns = np.array([0.01, 0.02, 0.03, 0.04, 0.05])
    assert rm.historical_var(returns, confidence=0.95) == pytest.approx(0.0)


def test_parametric_var_positive_for_volatile_series():
    returns = np.array([-0.05, 0.04, -0.06, 0.05, -0.04, 0.03])
    assert rm.parametric_var(returns, confidence=0.95) > 0
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest stocks/tests/test_returns_metrics.py -k "drawdown or var" -v`
Expected: FAIL with `AttributeError: module ... has no attribute 'max_drawdown'`

- [ ] **Step 3: Write minimal implementation**

```python
# append to backend/stocks/services/risk/returns_metrics.py

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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && pytest stocks/tests/test_returns_metrics.py -v`
Expected: PASS (12 passed)

- [ ] **Step 5: Commit**

```bash
git add backend/stocks/services/risk/returns_metrics.py backend/stocks/tests/test_returns_metrics.py
git commit -m "feat(risk): add pure max-drawdown and VaR metrics"
```

---

### Task 3: Return-series loader

**Files:**
- Create: `backend/stocks/services/risk/return_series.py`
- Test: `backend/stocks/tests/test_return_series.py`

**Interfaces:**
- Consumes: `NEPSE_INDEX_NAME` from `stocks.services.fundamental_calculator`; models `DailyStockPrice`, `DailyIndexValue`.
- Produces:
  - `INDEX_COLUMN = "__INDEX__"` (constant)
  - `confidence_for(sample_count: int) -> str` returning `"full" | "low" | "none"`
  - `build(tickers: list[str], window: int = 180) -> ReturnSeries` where `ReturnSeries` is a
    dataclass with: `.returns` (pandas DataFrame, date index, columns = tickers + `INDEX_COLUMN`,
    values = daily returns, NaN where no trade), `.sample_counts` (`dict[str, int]`),
    `.window` (int).

**Notes:** Fetch `window * LOOKBACK_CALENDAR_MULTIPLIER` calendar days of closes (NEPSE trades
~5 days/week minus holidays), compute per-column `pct_change()`, then keep the most recent
`window` return rows. Daily returns are computed per column independently, so a column is NaN on
days that ticker did not trade — pandas aligns columns on the union of dates automatically.

- [ ] **Step 1: Write the failing test**

```python
# backend/stocks/tests/test_return_series.py
import pytest
from datetime import date, timedelta
from stocks.models.market import DailyStockPrice, DailyIndexValue
from stocks.services.risk import return_series as rs
from stocks.services.fundamental_calculator import NEPSE_INDEX_NAME

pytestmark = pytest.mark.django_db


def _seed_prices(ticker, start, closes):
    for offset, close in enumerate(closes):
        DailyStockPrice.objects.create(
            ticker=ticker, date=start + timedelta(days=offset),
            open=close, high=close, low=close, close=close, volume=1000,
        )


def _seed_index(start, values):
    for offset, value in enumerate(values):
        DailyIndexValue.objects.create(
            index_name=NEPSE_INDEX_NAME, date=start + timedelta(days=offset), value=value,
        )


def test_confidence_tiers():
    assert rs.confidence_for(70) == "full"
    assert rs.confidence_for(40) == "low"
    assert rs.confidence_for(5) == "none"


def test_build_aligns_ticker_and_index_returns():
    start = date(2025, 1, 1)
    closes = [100, 110, 121, 133.1]            # +10% each step
    _seed_prices("AAA", start, closes)
    _seed_index(start, [1000, 1100, 1210, 1331])  # +10% each step
    series = rs.build(["AAA"], window=180)
    assert rs.INDEX_COLUMN in series.returns.columns
    assert "AAA" in series.returns.columns
    assert series.sample_counts["AAA"] == 3       # 4 closes -> 3 returns


def test_build_reports_zero_samples_for_unknown_ticker():
    start = date(2025, 1, 1)
    _seed_index(start, [1000, 1100, 1210])
    series = rs.build(["ZZZ"], window=180)
    assert series.sample_counts["ZZZ"] == 0
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest stocks/tests/test_return_series.py -v`
Expected: FAIL with `ImportError` / `AttributeError: module ... has no attribute 'confidence_for'`

- [ ] **Step 3: Write minimal implementation**

```python
# backend/stocks/services/risk/return_series.py
"""Build a date-aligned daily-return matrix for holdings plus the NEPSE index."""
from dataclasses import dataclass
from datetime import timedelta

import pandas as pd
from django.utils import timezone

from stocks.models.market import DailyStockPrice, DailyIndexValue
from stocks.services.fundamental_calculator import NEPSE_INDEX_NAME

INDEX_COLUMN = "__INDEX__"
LOOKBACK_CALENDAR_MULTIPLIER = 2
_MIN_FULL_CONFIDENCE = 60
_MIN_COMPUTE = 20


@dataclass
class ReturnSeries:
    returns: pd.DataFrame
    sample_counts: dict
    window: int


def confidence_for(sample_count):
    """Map aligned-sample count to a confidence tier."""
    if sample_count >= _MIN_FULL_CONFIDENCE:
        return "full"
    if sample_count >= _MIN_COMPUTE:
        return "low"
    return "none"


def build(tickers, window=180):
    """Return a ReturnSeries of daily returns for tickers + the NEPSE index."""
    start = timezone.now().date() - timedelta(days=window * LOOKBACK_CALENDAR_MULTIPLIER)
    closes = _close_frame(tickers, start)
    closes[INDEX_COLUMN] = _index_close_series(start)
    returns = closes.sort_index().pct_change().tail(window)
    counts = {t: int(returns[t].count()) if t in returns else 0 for t in tickers}
    return ReturnSeries(returns=returns, sample_counts=counts, window=window)


def _close_frame(tickers, start):
    rows = (
        DailyStockPrice.objects.filter(ticker__in=tickers, date__gte=start)
        .values("ticker", "date", "close").order_by("date")
    )
    frame = pd.DataFrame.from_records(rows)
    if frame.empty:
        return pd.DataFrame(index=pd.Index([], name="date"), columns=tickers, dtype=float)
    pivot = frame.pivot(index="date", columns="ticker", values="close").astype(float)
    return pivot.reindex(columns=tickers)


def _index_close_series(start):
    rows = (
        DailyIndexValue.objects.filter(index_name=NEPSE_INDEX_NAME, date__gte=start)
        .values("date", "value").order_by("date")
    )
    frame = pd.DataFrame.from_records(rows)
    if frame.empty:
        return pd.Series(dtype=float)
    return frame.set_index("date")["value"].astype(float)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && pytest stocks/tests/test_return_series.py -v`
Expected: PASS (4 passed)

- [ ] **Step 5: Commit**

```bash
git add backend/stocks/services/risk/return_series.py backend/stocks/tests/test_return_series.py
git commit -m "feat(risk): add NEPSE return-series loader with confidence tiers"
```

---

### Task 4: Market-risk orchestrator + alerts

**Files:**
- Create: `backend/stocks/services/risk/market_risk_service.py`
- Test: `backend/stocks/tests/test_market_risk_service.py`

**Interfaces:**
- Consumes: `returns_metrics` (Tasks 1-2), `return_series.build/INDEX_COLUMN/confidence_for` (Task 3).
- Produces: `MarketRiskService.compute(holdings: list[dict], window: int = 180) -> dict`.
  Each holding dict has at least `ticker` (str) and `weight` (float percent, set by
  `RiskAnalysisService._score_concentration`). Returns:
  ```python
  {
    "market_risk": {
      "window": int,
      "portfolio_beta": float | None,
      "beta_confidence": "full" | "low" | "none",
      "value_at_risk": {"var_95_1d": float|None, "var_99_1d": float|None, "var_95_1w": float|None},
      "max_drawdown": float | None,
      "correlation": {"tickers": [...], "matrix": [[...]], "average_correlation": float|None},
      "per_holding": [{"ticker": str, "beta": float|None, "confidence": str}],
    },
    "alerts": [ {"type": str, "level": "HIGH"|"MEDIUM", "message": str}, ... ],
  }
  ```

**Notes:** Portfolio synthetic return series uses **current weights** × each holding's returns,
with missing (NaN) returns treated as 0 for that day (a non-trading day contributes no return).
1-week VaR ≈ 1-day 95% VaR × √5. Use `historical_var` when the portfolio sample is full,
`parametric_var` otherwise.

- [ ] **Step 1: Write the failing test**

```python
# backend/stocks/tests/test_market_risk_service.py
import numpy as np
import pandas as pd
import pytest
from stocks.services.risk import market_risk_service as mrs
from stocks.services.risk import return_series as rs


class _FakeSeries:
    def __init__(self, returns, counts, window=180):
        self.returns = returns
        self.sample_counts = counts
        self.window = window


def _patch_build(monkeypatch, frame, counts):
    monkeypatch.setattr(rs, "build", lambda tickers, window=180: _FakeSeries(frame, counts, window))
    monkeypatch.setattr(mrs, "build", rs.build)


def test_high_beta_portfolio_emits_market_sensitivity_alert(monkeypatch):
    idx = np.array([0.01, -0.02, 0.03, -0.01, 0.02] * 14)        # 70 points
    frame = pd.DataFrame({"AAA": idx * 2, rs.INDEX_COLUMN: idx})
    _patch_build(monkeypatch, frame, {"AAA": 70})
    out = mrs.MarketRiskService.compute([{"ticker": "AAA", "weight": 100.0}], window=180)
    assert out["market_risk"]["portfolio_beta"] == pytest.approx(2.0, abs=0.01)
    assert any(a["type"] == "MARKET_BETA" and a["level"] == "HIGH" for a in out["alerts"])


def test_correlated_pair_emits_hidden_concentration_alert(monkeypatch):
    base = np.array([0.01, -0.02, 0.03, -0.01, 0.02] * 14)
    frame = pd.DataFrame({"AAA": base, "BBB": base, rs.INDEX_COLUMN: base})
    _patch_build(monkeypatch, frame, {"AAA": 70, "BBB": 70})
    holdings = [{"ticker": "AAA", "weight": 50.0}, {"ticker": "BBB", "weight": 50.0}]
    out = mrs.MarketRiskService.compute(holdings, window=180)
    assert any(a["type"] == "CORRELATION" for a in out["alerts"])


def test_empty_holdings_returns_null_metrics_no_crash(monkeypatch):
    _patch_build(monkeypatch, pd.DataFrame(), {})
    out = mrs.MarketRiskService.compute([], window=180)
    assert out["market_risk"]["portfolio_beta"] is None
    assert out["alerts"] == []
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest stocks/tests/test_market_risk_service.py -v`
Expected: FAIL with `ImportError` / `AttributeError`

- [ ] **Step 3: Write minimal implementation**

```python
# backend/stocks/services/risk/market_risk_service.py
"""Orchestrate return-series + pure metrics into a market-risk block with alerts."""
import math

import numpy as np

from stocks.services.risk import returns_metrics as rm
from stocks.services.risk.return_series import build, INDEX_COLUMN, confidence_for

_BETA_ALERT_MEDIUM = 1.3
_BETA_ALERT_HIGH = 1.6
_CORRELATION_ALERT = 0.8
_DRAWDOWN_ALERT = -0.30
_WEEK_SCALE = math.sqrt(5)
_CONFIDENCE_RANK = {"full": 0, "low": 1, "none": 2}    # higher rank = worse confidence


class MarketRiskService:
    @staticmethod
    def compute(holdings, window=180):
        series = build([h["ticker"] for h in holdings], window=window)
        per_holding = _per_holding_betas(holdings, series)
        portfolio_beta, beta_conf = _portfolio_beta(per_holding, holdings)
        port_returns = _portfolio_returns(holdings, series)
        var = _value_at_risk(port_returns, series)
        drawdown = rm.max_drawdown(port_returns) if port_returns.size else None
        correlation = _correlation(holdings, series)
        block = {
            "window": window, "portfolio_beta": portfolio_beta, "beta_confidence": beta_conf,
            "value_at_risk": var, "max_drawdown": drawdown, "correlation": correlation,
            "per_holding": per_holding,
        }
        alerts = _build_alerts(portfolio_beta, correlation, drawdown)
        return {"market_risk": block, "alerts": alerts}


def _per_holding_betas(holdings, series):
    out = []
    for h in holdings:
        ticker = h["ticker"]
        beta, conf = _single_beta(ticker, series)
        out.append({"ticker": ticker, "beta": beta, "confidence": conf})
    return out


def _single_beta(ticker, series):
    if ticker not in series.returns or INDEX_COLUMN not in series.returns:
        return None, "none"
    pair = series.returns[[ticker, INDEX_COLUMN]].dropna()
    conf = confidence_for(series.sample_counts.get(ticker, 0))
    if conf == "none":
        return None, conf
    return rm.beta(pair[ticker].to_numpy(), pair[INDEX_COLUMN].to_numpy()), conf


def _portfolio_beta(per_holding, holdings):
    weights = {h["ticker"]: h.get("weight", 0) / 100 for h in holdings}
    usable = [p for p in per_holding if p["beta"] is not None]
    if not usable:
        return None, "none"
    total = sum(p["beta"] * weights.get(p["ticker"], 0) for p in usable)
    worst = max(usable, key=lambda p: _CONFIDENCE_RANK.get(p["confidence"], 2))["confidence"]
    return round(total, 3), worst


def _portfolio_returns(holdings, series):
    if series.returns.empty:
        return np.array([])
    weighted = np.zeros(len(series.returns))
    for h in holdings:
        if h["ticker"] in series.returns:
            col = series.returns[h["ticker"]].fillna(0).to_numpy()
            weighted = weighted + col * (h.get("weight", 0) / 100)
    return weighted


def _value_at_risk(port_returns, series):
    if port_returns.size < 2:
        return {"var_95_1d": None, "var_99_1d": None, "var_95_1w": None}
    full = min(series.sample_counts.values(), default=0) >= 60
    estimator = rm.historical_var if full else rm.parametric_var
    var95 = estimator(port_returns, 0.95)
    var99 = estimator(port_returns, 0.99)
    week = round(var95 * _WEEK_SCALE, 4) if var95 is not None else None
    return {"var_95_1d": _r(var95), "var_99_1d": _r(var99), "var_95_1w": week}


def _correlation(holdings, series):
    tickers = [h["ticker"] for h in holdings if h["ticker"] in series.returns]
    if len(tickers) < 2:
        return rm.correlation_matrix(
            {t: series.returns[t].dropna().to_numpy() for t in tickers}
        )
    aligned = series.returns[tickers].dropna()        # rows where ALL holdings traded — date-aligned
    return rm.correlation_matrix({t: aligned[t].to_numpy() for t in tickers})


def _build_alerts(portfolio_beta, correlation, drawdown):
    alerts = []
    _append_beta_alert(alerts, portfolio_beta)
    _append_correlation_alert(alerts, correlation)
    _append_drawdown_alert(alerts, drawdown)
    return alerts


def _append_beta_alert(alerts, beta):
    if beta is None or beta <= _BETA_ALERT_MEDIUM:
        return
    level = "HIGH" if beta > _BETA_ALERT_HIGH else "MEDIUM"
    alerts.append({"type": "MARKET_BETA", "level": level,
                   "message": f"High market sensitivity: portfolio beta is {beta}."})


def _append_correlation_alert(alerts, correlation):
    tickers, matrix = correlation["tickers"], correlation["matrix"]
    for i in range(len(tickers)):
        for j in range(i + 1, len(tickers)):
            if matrix[i][j] > _CORRELATION_ALERT:
                alerts.append({"type": "CORRELATION", "level": "MEDIUM",
                               "message": f"Hidden concentration: {tickers[i]} and {tickers[j]} "
                                          f"move together (correlation {matrix[i][j]})."})


def _append_drawdown_alert(alerts, drawdown):
    if drawdown is not None and drawdown < _DRAWDOWN_ALERT:
        pct = round(abs(drawdown) * 100, 1)
        alerts.append({"type": "DRAWDOWN", "level": "MEDIUM",
                       "message": f"Portfolio fell {pct}% peak-to-trough in this window."})


def _r(value):
    return round(value, 4) if value is not None else None
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && pytest stocks/tests/test_market_risk_service.py -v`
Expected: PASS (3 passed)

- [ ] **Step 5: Commit**

```bash
git add backend/stocks/services/risk/market_risk_service.py backend/stocks/tests/test_market_risk_service.py
git commit -m "feat(risk): orchestrate market-risk metrics with alerts"
```

---

### Task 5: Integrate into RiskAnalysisService

**Files:**
- Modify: `backend/stocks/services/risk_service.py`
- Test: `backend/stocks/tests/test_risk_service_market_risk.py`

**Interfaces:**
- Consumes: `MarketRiskService.compute` (Task 4).
- Produces: `RiskAnalysisService.get_risk_analysis(user, account_id=None, window=180)` now returns,
  in addition to today's keys, a top-level `market_risk` block; the radar `Systemic Risk` axis
  value derives from `portfolio_beta` via `clamp(beta * 5, 1, 10)`; market-risk alerts are
  appended to `alerts`.

**Notes:** `_build_response` currently hardcodes `Systemic Risk = 5.0` (`risk_service.py:196`) and
takes `(holdings, total_value, c_score, l_score, v_score, alerts)`. Add a `systemic_score` and
`market_risk` parameter, threading the beta-derived score and block through. Keep
`get_risk_analysis` callable as `(user, account_id)`.

- [ ] **Step 1: Write the failing test**

```python
# backend/stocks/tests/test_risk_service_market_risk.py
import pytest
from django.contrib.auth import get_user_model
from stocks.models.portfolio import PortfolioItem
from stocks.services.risk_service import RiskAnalysisService
from stocks.services.risk import market_risk_service as mrs

pytestmark = pytest.mark.django_db
User = get_user_model()


def _fake_market(beta):
    block = {"window": 180, "portfolio_beta": beta, "beta_confidence": "full",
             "value_at_risk": {"var_95_1d": 0.03, "var_99_1d": 0.05, "var_95_1w": 0.067},
             "max_drawdown": -0.2, "correlation": {"tickers": [], "matrix": [], "average_correlation": None},
             "per_holding": []}
    return {"market_risk": block, "alerts": [{"type": "MARKET_BETA", "level": "HIGH", "message": "x"}]}


def test_systemic_axis_derives_from_beta(monkeypatch):
    user = User.objects.create_user(username="u1", password="p")
    PortfolioItem.objects.create(user=user, ticker="AAA", quantity=10, buy_price=100)
    monkeypatch.setattr(mrs.MarketRiskService, "compute", staticmethod(lambda h, window=180: _fake_market(1.0)))
    result = RiskAnalysisService.get_risk_analysis(user)
    systemic = next(d for d in result["radar_data"] if d["axis"] == "Systemic Risk")
    assert systemic["value"] == pytest.approx(5.0)        # beta 1.0 -> 5.0
    assert "market_risk" in result
    assert any(a["type"] == "MARKET_BETA" for a in result["alerts"])


def test_high_beta_pushes_systemic_axis_up(monkeypatch):
    user = User.objects.create_user(username="u2", password="p")
    PortfolioItem.objects.create(user=user, ticker="AAA", quantity=10, buy_price=100)
    monkeypatch.setattr(mrs.MarketRiskService, "compute", staticmethod(lambda h, window=180: _fake_market(2.0)))
    result = RiskAnalysisService.get_risk_analysis(user)
    systemic = next(d for d in result["radar_data"] if d["axis"] == "Systemic Risk")
    assert systemic["value"] == pytest.approx(10.0)       # clamp(2.0*5, 1, 10)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest stocks/tests/test_risk_service_market_risk.py -v`
Expected: FAIL — `Systemic Risk` value is `5.0` regardless of beta, and `market_risk` key absent.

- [ ] **Step 3: Write minimal implementation**

In `backend/stocks/services/risk_service.py`, add the import and a constant near the top:

```python
from stocks.services.risk.market_risk_service import MarketRiskService

_SYSTEMIC_BETA_SCALE = 5
_SYSTEMIC_MIN = 1.0
_SYSTEMIC_MAX = 10.0
_DEFAULT_WINDOW = 180
```

Change the signature and body of `get_risk_analysis` to thread market risk through:

```python
    @staticmethod
    def get_risk_analysis(user, account_id=None, window=_DEFAULT_WINDOW):
        """Calculates concentrations, liquidity, market-relative risk, and radar scores."""
        items_qs = PortfolioItem.objects.filter(user=user)
        if account_id and account_id != 'all':
            items_qs = items_qs.filter(account_id=account_id)
        if not items_qs.exists():
            return RiskAnalysisService._empty_response()

        tickers = list(items_qs.values_list('ticker', flat=True).distinct())
        price_map = RiskAnalysisService._fetch_price_map(tickers)
        sector_map = RiskAnalysisService._fetch_sector_map(tickers)
        holdings, total_value, sector_values = RiskAnalysisService._build_holdings(
            items_qs, price_map, sector_map
        )
        if total_value == 0:
            return RiskAnalysisService._empty_response()

        c_score, _, c_alerts = RiskAnalysisService._score_concentration(
            holdings, total_value, sector_values
        )
        l_score, l_alerts = RiskAnalysisService._score_liquidity(holdings, tickers)
        v_score = RiskAnalysisService._score_volatility(holdings, tickers)
        market = MarketRiskService.compute(holdings, window=window)
        systemic = RiskAnalysisService._systemic_score(market["market_risk"]["portfolio_beta"])
        alerts = c_alerts + l_alerts + market["alerts"]
        return RiskAnalysisService._build_response(
            holdings, total_value, c_score, l_score, v_score, systemic, alerts,
            market["market_risk"],
        )

    @staticmethod
    def _systemic_score(portfolio_beta):
        if portfolio_beta is None:
            return 5.0
        scaled = portfolio_beta * _SYSTEMIC_BETA_SCALE
        return float(min(_SYSTEMIC_MAX, max(_SYSTEMIC_MIN, scaled)))
```

Update `_build_response` to accept the systemic score and market block:

```python
    @staticmethod
    def _build_response(holdings, total_value, c_score, l_score, v_score, systemic_score, alerts, market_risk):
        risk_level = (
            'HIGH' if (c_score > 7 or l_score > 7)
            else 'MEDIUM' if (c_score > 4 or l_score > 4)
            else 'LOW'
        )
        return {
            'radar_data': [
                {'axis': 'Concentration', 'value': round(c_score, 1), 'fullMark': 10},
                {'axis': 'Liquidity', 'value': round(l_score, 1), 'fullMark': 10},
                {'axis': 'Volatility', 'value': round(v_score, 1), 'fullMark': 10},
                {'axis': 'Sector Diversification', 'value': round(max(1, 10 - c_score), 1), 'fullMark': 10},
                {'axis': 'Systemic Risk', 'value': round(systemic_score, 1), 'fullMark': 10},
            ],
            'alerts': alerts,
            'holdings_metrics': holdings,
            'market_risk': market_risk,
            'summary': {
                'total_value': float(total_value),
                'risk_level': risk_level,
            },
        }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && pytest stocks/tests/test_risk_service_market_risk.py stocks/tests/test_risk_service_refactor.py -v`
Expected: PASS — new tests pass; the existing refactor tests still pass (adjust only if they
asserted the old hardcoded `Systemic Risk = 5.0`; if so, update those assertions to expect the
beta-derived value, since the placeholder is intentionally replaced).

- [ ] **Step 5: Commit**

```bash
git add backend/stocks/services/risk_service.py backend/stocks/tests/test_risk_service_market_risk.py
git commit -m "feat(risk): feed real beta into radar and expose market_risk block"
```

---

### Task 6: API window param + chat tool prose

**Files:**
- Modify: `backend/stocks/views/risk.py:10-20`
- Modify: `backend/chat/tools/portfolio.py:169-191`
- Test: `backend/stocks/tests/test_risk_view_window.py`
- Test: `backend/chat/tests/test_risk_profile_tool.py`

**Interfaces:**
- Consumes: `RiskAnalysisService.get_risk_analysis(user, account_id, window)` (Task 5).
- Produces: `GET /api/stocks/portfolio/risk-radar/analysis/?window=90|180|250` validated; chat
  `get_risk_profile` prose includes beta / VaR / drawdown lines.

- [ ] **Step 1: Write the failing tests**

```python
# backend/stocks/tests/test_risk_view_window.py
import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from stocks.models.portfolio import PortfolioItem

pytestmark = pytest.mark.django_db
User = get_user_model()
_URL = "/api/stocks/portfolio/risk-radar/analysis/"


def test_window_defaults_to_180_when_absent():
    user = User.objects.create_user(username="w1", password="p")
    PortfolioItem.objects.create(user=user, ticker="AAA", quantity=10, buy_price=100)
    client = APIClient(); client.force_authenticate(user)
    resp = client.get(_URL)
    assert resp.status_code == 200
    assert resp.data["market_risk"]["window"] == 180


def test_invalid_window_falls_back_to_default():
    user = User.objects.create_user(username="w2", password="p")
    PortfolioItem.objects.create(user=user, ticker="AAA", quantity=10, buy_price=100)
    client = APIClient(); client.force_authenticate(user)
    resp = client.get(_URL, {"window": "abc"})
    assert resp.status_code == 200
    assert resp.data["market_risk"]["window"] == 180
```

```python
# backend/chat/tests/test_risk_profile_tool.py
import pytest
from django.contrib.auth import get_user_model
from chat.tools import portfolio as ptools
from chat import _user_context

pytestmark = pytest.mark.django_db
User = get_user_model()


def test_risk_profile_prose_includes_market_metrics(monkeypatch):
    user = User.objects.create_user(username="rp", password="p")
    fake = {
        "radar_data": [{"axis": "Systemic Risk", "value": 6.0, "fullMark": 10}],
        "alerts": [], "holdings_metrics": [],
        "summary": {"total_value": 100000, "risk_level": "MEDIUM"},
        "market_risk": {"window": 180, "portfolio_beta": 1.2, "beta_confidence": "full",
                        "value_at_risk": {"var_95_1d": 0.03, "var_99_1d": 0.05, "var_95_1w": 0.067},
                        "max_drawdown": -0.18, "correlation": {"tickers": [], "matrix": [], "average_correlation": None},
                        "per_holding": []},
    }
    monkeypatch.setattr(ptools.RiskAnalysisService, "get_risk_analysis",
                        staticmethod(lambda u, account_id=None: fake))
    _user_context.set_user(user)
    try:
        import anyio
        result = anyio.run(ptools.get_risk_profile, {"account_id": None})
    finally:
        _user_context.reset_cards()
    text = result["content"][0]["text"]
    assert "beta 1.2" in text
    assert "18.0%" in text          # max drawdown
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && pytest stocks/tests/test_risk_view_window.py chat/tests/test_risk_profile_tool.py -v`
Expected: FAIL — window not honored (no `window` param passed through) and prose lacks beta/drawdown lines.

- [ ] **Step 3: Write minimal implementation**

In `backend/stocks/views/risk.py`, parse and validate the window:

```python
_ALLOWED_WINDOWS = {90, 180, 250}
_DEFAULT_WINDOW = 180


class RiskRadarView(viewsets.ViewSet):
    permission_classes = [IsAuthenticated]

    @action(detail=False, methods=['get'])
    def analysis(self, request):
        """Main endpoint for Risk Radar analytics."""
        account_id = request.query_params.get('account')
        window = self._parse_window(request.query_params.get('window'))
        try:
            data = RiskAnalysisService.get_risk_analysis(request.user, account_id, window=window)
            return Response(data)
        except Exception as e:
            import traceback
            traceback.print_exc()
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @staticmethod
    def _parse_window(raw):
        try:
            value = int(raw)
        except (TypeError, ValueError):
            return _DEFAULT_WINDOW
        return value if value in _ALLOWED_WINDOWS else _DEFAULT_WINDOW
```

In `backend/chat/tools/portfolio.py`, extend the prose builder inside `get_risk_profile._run`:

```python
    @sync_to_async
    def _run():
        result = RiskAnalysisService.get_risk_analysis(user, account_id=account_id)
        if not result.get("radar_data"):
            return _result("No risk data — portfolio is empty.", is_error=True)
        summary = result["summary"]
        prose_lines = [f"Portfolio risk: {summary['risk_level']} (value Rs {summary['total_value']:,.0f})."]
        prose_lines.extend(_market_risk_lines(result.get("market_risk")))
        for a in result["alerts"][:5]:
            prose_lines.append(f"  [{a['level']}] {a['message']}")
        return _result("\n".join(prose_lines), card={"type": "risk", "data": result})
```

Add a module-level helper in the same file:

```python
def _market_risk_lines(market_risk):
    if not market_risk:
        return []
    lines = []
    beta = market_risk.get("portfolio_beta")
    if beta is not None:
        lines.append(f"  Market beta {beta} ({market_risk.get('beta_confidence')} confidence).")
    var = (market_risk.get("value_at_risk") or {}).get("var_95_1d")
    if var is not None:
        lines.append(f"  1-day 95% VaR: {var * 100:.1f}% of portfolio value.")
    dd = market_risk.get("max_drawdown")
    if dd is not None:
        lines.append(f"  Max drawdown over window: {abs(dd) * 100:.1f}%.")
    return lines
```

Note: the chat-tool test asserts the substring `beta 1.2`; ensure the line reads
`Market beta 1.2 (full confidence).` — adjust the test substring to `beta 1.2` already matches.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && pytest stocks/tests/test_risk_view_window.py chat/tests/test_risk_profile_tool.py -v`
Expected: PASS (4 passed)

- [ ] **Step 5: Commit**

```bash
git add backend/stocks/views/risk.py backend/chat/tools/portfolio.py backend/stocks/tests/test_risk_view_window.py backend/chat/tests/test_risk_profile_tool.py
git commit -m "feat(risk): window param on API and market metrics in chat risk prose"
```

---

### Task 7: Frontend types + market-risk stat cards

**Files:**
- Modify: `frontend/src/components/RiskRadar.tsx`
- Test: `frontend/src/__tests__/unit/MarketRiskCards.test.tsx`

**Interfaces:**
- Consumes: the `market_risk` block on the risk API response (Task 5).
- Produces: extended `RiskAnalysis` interface with `market_risk?: MarketRisk`; a
  `MarketRiskCards` component exported from `RiskRadar.tsx` that renders beta, 1-day 95% VaR,
  and max drawdown using `lib/numbers` formatting.

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/src/__tests__/unit/MarketRiskCards.test.tsx
import { render, screen } from '@testing-library/react';
import { MarketRiskCards } from '@/components/RiskRadar';

const marketRisk = {
  window: 180,
  portfolio_beta: 1.24,
  beta_confidence: 'full' as const,
  value_at_risk: { var_95_1d: 0.032, var_99_1d: 0.051, var_95_1w: 0.072 },
  max_drawdown: -0.28,
  correlation: { tickers: [], matrix: [], average_correlation: null },
  per_holding: [],
};

test('renders beta, VaR and drawdown', () => {
  render(<MarketRiskCards data={marketRisk} />);
  expect(screen.getByText(/1.24/)).toBeInTheDocument();
  expect(screen.getByText(/3.2%/)).toBeInTheDocument();      // VaR 95% 1d
  expect(screen.getByText(/28.0%/)).toBeInTheDocument();     // max drawdown
});

test('shows placeholder when beta is null', () => {
  render(<MarketRiskCards data={{ ...marketRisk, portfolio_beta: null }} />);
  expect(screen.getByText(/not enough history/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm run test -- MarketRiskCards`
Expected: FAIL — `MarketRiskCards` is not exported.

- [ ] **Step 3: Write minimal implementation**

Add the interface near the other exports in `frontend/src/components/RiskRadar.tsx`:

```tsx
export interface MarketRisk {
    window: number;
    portfolio_beta: number | null;
    beta_confidence: 'full' | 'low' | 'none';
    value_at_risk: { var_95_1d: number | null; var_99_1d: number | null; var_95_1w: number | null };
    max_drawdown: number | null;
    correlation: { tickers: string[]; matrix: number[][]; average_correlation: number | null };
    per_holding: { ticker: string; beta: number | null; confidence: string }[];
}
```

Extend `RiskAnalysis`:

```tsx
export interface RiskAnalysis {
    radar_data: RadarData[];
    alerts: RiskAlert[];
    market_risk?: MarketRisk;
    summary: {
        total_value: number;
        risk_level: 'HIGH' | 'MEDIUM' | 'LOW';
    };
}
```

Add the component (uses existing shadcn `Card`; format percents inline as `(x*100).toFixed(1)`):

```tsx
function StatCard({ label, value }: { label: string; value: string }) {
    return (
        <Card>
            <CardContent className="pt-4">
                <p className="text-sm text-muted-foreground">{label}</p>
                <p className="text-2xl font-semibold">{value}</p>
            </CardContent>
        </Card>
    );
}

export function MarketRiskCards({ data }: { data: MarketRisk }) {
    if (data.portfolio_beta === null) {
        return <p className="text-sm text-muted-foreground">Market risk: not enough history yet.</p>;
    }
    const var95 = data.value_at_risk.var_95_1d;
    const dd = data.max_drawdown;
    return (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <StatCard label="Market beta" value={data.portfolio_beta.toFixed(2)} />
            <StatCard label="1-day value at risk (95%)" value={var95 !== null ? `${(var95 * 100).toFixed(1)}%` : '—'} />
            <StatCard label="Max drawdown" value={dd !== null ? `${(Math.abs(dd) * 100).toFixed(1)}%` : '—'} />
        </div>
    );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npm run test -- MarketRiskCards`
Expected: PASS

- [ ] **Step 5: Render `MarketRiskCards` on the portfolio risk page**

In `frontend/src/app/(authenticated)/portfolio/page.tsx` (near `<RiskRadarChart state={riskState} />`, line ~753), render the cards when data is present:

```tsx
{riskState.data?.market_risk && <MarketRiskCards data={riskState.data.market_risk} />}
```

Add `MarketRiskCards` to the existing import from `@/components/RiskRadar` at line ~22.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/RiskRadar.tsx "frontend/src/app/(authenticated)/portfolio/page.tsx" frontend/src/__tests__/unit/MarketRiskCards.test.tsx
git commit -m "feat(risk): market-risk stat cards on portfolio risk page"
```

---

### Task 8: Correlation heatmap

**Files:**
- Create: `frontend/src/components/CorrelationHeatmap.tsx`
- Test: `frontend/src/__tests__/unit/CorrelationHeatmap.test.tsx`

**Interfaces:**
- Consumes: `market_risk.correlation` (`{tickers, matrix, average_correlation}`).
- Produces: `CorrelationHeatmap` default export rendering an N×N colored grid; renders nothing
  when fewer than 2 tickers.

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/src/__tests__/unit/CorrelationHeatmap.test.tsx
import { render, screen } from '@testing-library/react';
import CorrelationHeatmap from '@/components/CorrelationHeatmap';

test('renders a cell per ticker pair', () => {
    render(<CorrelationHeatmap tickers={['AAA', 'BBB']} matrix={[[1, 0.82], [0.82, 1]]} />);
    expect(screen.getAllByText('AAA').length).toBeGreaterThan(0);
    expect(screen.getByText('0.82')).toBeInTheDocument();
});

test('renders nothing for a single ticker', () => {
    const { container } = render(<CorrelationHeatmap tickers={['AAA']} matrix={[[1]]} />);
    expect(container).toBeEmptyDOMElement();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm run test -- CorrelationHeatmap`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Write minimal implementation**

```tsx
// frontend/src/components/CorrelationHeatmap.tsx
import React from 'react';

interface Props {
    tickers: string[];
    matrix: number[][];
}

function cellColor(value: number): string {
    const intensity = Math.min(1, Math.abs(value));
    const hue = value >= 0 ? 0 : 210;            // warm red for positive, cool blue for negative
    return `hsl(${hue}, 70%, ${90 - intensity * 45}%)`;
}

export default function CorrelationHeatmap({ tickers, matrix }: Props) {
    if (tickers.length < 2) return null;
    return (
        <div className="overflow-x-auto">
            <table className="border-collapse text-xs">
                <tbody>
                    {tickers.map((rowTicker, i) => (
                        <tr key={rowTicker}>
                            <th className="pr-2 text-right font-medium">{rowTicker}</th>
                            {tickers.map((colTicker, j) => (
                                <td key={colTicker} className="h-9 w-12 text-center"
                                    style={{ backgroundColor: cellColor(matrix[i][j]) }}>
                                    {matrix[i][j].toFixed(2)}
                                </td>
                            ))}
                        </tr>
                    ))}
                    <tr>
                        <th />
                        {tickers.map((t) => <th key={t} className="pt-1 font-medium">{t}</th>)}
                    </tr>
                </tbody>
            </table>
        </div>
    );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npm run test -- CorrelationHeatmap`
Expected: PASS

- [ ] **Step 5: Wire the heatmap onto the risk page**

In `frontend/src/app/(authenticated)/portfolio/page.tsx`, below `MarketRiskCards`:

```tsx
{riskState.data?.market_risk && riskState.data.market_risk.correlation.tickers.length > 1 && (
    <CorrelationHeatmap
        tickers={riskState.data.market_risk.correlation.tickers}
        matrix={riskState.data.market_risk.correlation.matrix}
    />
)}
```

Add `import CorrelationHeatmap from '@/components/CorrelationHeatmap';` near the other imports.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/CorrelationHeatmap.tsx "frontend/src/app/(authenticated)/portfolio/page.tsx" frontend/src/__tests__/unit/CorrelationHeatmap.test.tsx
git commit -m "feat(risk): correlation heatmap on portfolio risk page"
```

---

### Task 9: Chat RiskCard gen-ui shows market risk

**Files:**
- Modify: `frontend/src/components/chat/gen-ui/RiskCard.tsx`
- Test: `frontend/src/__tests__/unit/RiskCard.test.tsx`

**Interfaces:**
- Consumes: the `{type: "risk", data: <RiskAnalysis>}` card emitted by `get_risk_profile`.
- Produces: `RiskCard` renders `MarketRiskCards` (Task 7) when `data.market_risk` is present.

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/src/__tests__/unit/RiskCard.test.tsx
import { render, screen } from '@testing-library/react';
import RiskCard from '@/components/chat/gen-ui/RiskCard';

const data = {
    radar_data: [], alerts: [],
    summary: { total_value: 100000, risk_level: 'MEDIUM' as const },
    market_risk: {
        window: 180, portfolio_beta: 1.1, beta_confidence: 'full' as const,
        value_at_risk: { var_95_1d: 0.03, var_99_1d: 0.05, var_95_1w: 0.067 },
        max_drawdown: -0.15,
        correlation: { tickers: [], matrix: [], average_correlation: null }, per_holding: [],
    },
};

test('chat risk card shows market beta', () => {
    render(<RiskCard data={data} />);
    expect(screen.getByText(/1.10/)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm run test -- RiskCard`
Expected: FAIL — beta not rendered (and possibly a prop/type mismatch).

- [ ] **Step 3: Write minimal implementation**

Read the current `RiskCard.tsx` first to match its prop shape and styling. Then import and render
the shared cards where the card body is built:

```tsx
import { MarketRiskCards, RiskAnalysis } from '@/components/RiskRadar';

// inside the component body, where `data` (typed as RiskAnalysis) is rendered:
{data.market_risk && (
    <div className="mt-3">
        <MarketRiskCards data={data.market_risk} />
    </div>
)}
```

If `RiskCard` does not already type its prop as `RiskAnalysis`, change its prop type to
`{ data: RiskAnalysis }` so the `market_risk` field is available.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npm run test -- RiskCard`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/chat/gen-ui/RiskCard.tsx frontend/src/__tests__/unit/RiskCard.test.tsx
git commit -m "feat(risk): show market-risk metrics in chat risk card"
```

---

### Task 10: Full suite + deploy verification

**Files:** none (verification only).

- [ ] **Step 1: Run the backend risk suite**

Run: `cd backend && pytest stocks/tests/test_returns_metrics.py stocks/tests/test_return_series.py stocks/tests/test_market_risk_service.py stocks/tests/test_risk_service_market_risk.py stocks/tests/test_risk_view_window.py chat/tests/test_risk_profile_tool.py -v`
Expected: all PASS.

- [ ] **Step 2: Run the existing risk regression tests**

Run: `cd backend && pytest stocks/tests/test_risk_service_refactor.py stocks/tests/test_optimization_riskfolio_optimizer.py -v`
Expected: all PASS (confirms the integration didn't break existing behavior).

- [ ] **Step 3: Run the frontend risk tests**

Run: `cd frontend && npm run test -- Risk Correlation MarketRisk`
Expected: all PASS.

- [ ] **Step 4: Rebuild the frontend Docker image and hard refresh**

Run: `docker-compose up -d --build frontend`
Then hard-refresh `localhost:3000`, open the portfolio risk page, and confirm the beta/VaR/
drawdown cards and correlation heatmap render with real data. (No backend migration is needed —
no model changes.)

- [ ] **Step 5: Final commit (if any verification fixes were needed)**

```bash
git add -A
git commit -m "test(risk): verify market-relative risk end to end"
```

---

## Self-Review

**Spec coverage:**
- Beta to NEPSE → Tasks 1, 4, 5. ✓
- Holding correlation → Tasks 1, 4, 8, 9. ✓
- Max drawdown → Tasks 2, 4, 7. ✓
- VaR (historical + parametric fallback) → Tasks 2, 4. ✓
- Configurable window (90/180/250, default 180) → Tasks 3, 5, 6. ✓
- Confidence tiers (≥60 full / 20–59 low / <20 none) → Task 3. ✓
- Radar `Systemic Risk` from beta (`clamp(beta×5,1,10)`) → Task 5. ✓
- Alerts (beta>1.3/1.6, correlation>0.8, drawdown<−30%) → Task 4. ✓
- API `?window=` → Task 6. ✓
- Chat `get_risk_profile` prose + card → Task 6 (prose), Task 9 (card). ✓
- Frontend cards + heatmap → Tasks 7, 8. ✓
- Tests for every unit → all tasks. ✓
- Deploy notes (no migration; Docker frontend rebuild) → Task 10. ✓

**Placeholder scan:** No TBD/TODO; every code step contains complete code. ✓

**Type consistency:** `market_risk` block shape is identical across Task 4 (produced),
Task 5 (threaded), Task 6 (`_market_risk_lines`), and Tasks 7/9 (`MarketRisk` TS interface).
`MarketRiskService.compute(holdings, window=180)`, `return_series.build(tickers, window=180)`,
`get_risk_analysis(user, account_id=None, window=180)`, and `confidence_for(int)` names match
across all consuming tasks. ✓
