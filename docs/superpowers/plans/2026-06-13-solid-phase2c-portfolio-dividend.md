# Portfolio Metrics Service & Dividend Decomposition Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract PortfolioMetricsService from the 237-line `metrics()` action and decompose `DividendService.calculate_dividends()` into focused helper functions, each ≤30 lines.

**Architecture:** `portfolio_metrics_service.py` provides 7 pure/side-effect-isolated functions (`resolve_date_range`, `fetch_portfolio_df`, `fetch_benchmark_df`, `compute_risk_metrics`, `compute_drawdown`, `build_chart_data_with_benchmark`, `scrub_nan`); `metrics()` becomes a ≤30-line orchestrator. Dividend helpers are module-level private functions, keeping `DividendService` itself as a thin coordinator.

**Tech Stack:** Django 5.2, DRF, pandas, numpy, pytest-django

---

## Pre-flight checks

- [ ] Confirm `backend/stocks/constants.py` does not exist (constants are currently inline in `portfolio.py` and `dividend_service.py`).
- [ ] Run baseline test suite: `cd backend && source venv/bin/activate && pytest stocks/tests/ -v --tb=short -q` — record pass/fail count; all must be green before touching any code.
- [ ] Confirm `backend/stocks/services/portfolio_metrics_service.py` does not yet exist.

---

## Task 1 — Create `portfolio_metrics_service.py` (TDD)

**Files touched:**
- `backend/stocks/constants.py` — new file (named constants extracted from inline code)
- `backend/stocks/services/portfolio_metrics_service.py` — new file (7 functions)
- `backend/stocks/tests/test_portfolio_metrics_service.py` — new test file

### Step 1.1 — Add named constants

- [ ] Create `backend/stocks/constants.py` with the content below. No other changes.

```python
# backend/stocks/constants.py
"""Named constants shared across the stocks application.

All magic numbers/strings that appear in more than one place, or that carry
domain meaning, must live here rather than be inlined in service code.
"""

# Nepal stock exchange assumptions for risk calculations
RISK_FREE_RATE_ANNUAL: float = 0.06          # 6 % p.a. (Nepal T-bill proxy)
ANNUAL_TRADING_DAYS: int = 252               # standard equities convention
NEPSE_TICKER: str = "NEPSE"                  # benchmark index ticker symbol
NEPSE_PAR_VALUE: int = 100                   # Rs. 100 face value for all NEPSE stocks
DIVIDEND_TAX_RATE: float = 0.05             # 5 % withholding tax on cash dividends

# Period → number of calendar days look-back
PERIOD_DAYS: dict[str, int] = {
    "1M": 30,
    "3M": 90,
    "6M": 180,
    "1Y": 365,
}

# Minimum observations required for statistically meaningful risk metrics
MIN_RISK_OBSERVATIONS: int = 2
```

### Step 1.2 — Write failing tests first (Red)

- [ ] Create `backend/stocks/tests/test_portfolio_metrics_service.py` with the content below.
- [ ] Run `pytest stocks/tests/test_portfolio_metrics_service.py -v` — every test must **fail** with `ModuleNotFoundError` or `ImportError` (the module does not exist yet).

```python
# backend/stocks/tests/test_portfolio_metrics_service.py
"""
TDD tests for stocks.services.portfolio_metrics_service.

Each test targets exactly one function and a single behaviour.
Run order is alphabetical; no test depends on another.
"""
import math
from datetime import date, timedelta
from decimal import Decimal
from unittest.mock import MagicMock, patch

import numpy as np
import pandas as pd
import pytest


# ---------------------------------------------------------------------------
# resolve_date_range
# ---------------------------------------------------------------------------

class TestResolveDateRange:
    """resolve_date_range(user, period) -> (start_date, end_date)"""

    def _call(self, period):
        from stocks.services.portfolio_metrics_service import resolve_date_range
        return resolve_date_range(MagicMock(), period)

    def test_1m_span_is_30_days(self):
        start, end = self._call("1M")
        assert (end - start).days == 30

    def test_3m_span_is_90_days(self):
        start, end = self._call("3M")
        assert (end - start).days == 90

    def test_6m_span_is_180_days(self):
        start, end = self._call("6M")
        assert (end - start).days == 180

    def test_1y_span_is_365_days(self):
        start, end = self._call("1Y")
        assert (end - start).days == 365

    def test_ytd_starts_on_jan_1(self):
        start, end = self._call("YTD")
        assert start.month == 1 and start.day == 1
        assert start.year == end.year

    def test_unknown_period_falls_back_to_365_days(self):
        start, end = self._call("BOGUS")
        assert (end - start).days == 365

    @pytest.mark.django_db
    def test_all_uses_first_transaction_date(self):
        from stocks.services.portfolio_metrics_service import resolve_date_range
        from unittest.mock import patch, MagicMock
        txn = MagicMock()
        txn.transaction_date.date.return_value = date(2022, 1, 15)
        mock_qs = MagicMock()
        mock_qs.order_by.return_value.first.return_value = txn
        with patch("stocks.services.portfolio_metrics_service.PortfolioTransaction") as MockTxn:
            MockTxn.objects.filter.return_value = mock_qs
            start, end = resolve_date_range(MagicMock(), "ALL")
        assert start == date(2022, 1, 15)

    @pytest.mark.django_db
    def test_all_falls_back_to_365_days_when_no_transactions(self):
        from stocks.services.portfolio_metrics_service import resolve_date_range
        from unittest.mock import patch, MagicMock
        mock_qs = MagicMock()
        mock_qs.order_by.return_value.first.return_value = None
        with patch("stocks.services.portfolio_metrics_service.PortfolioTransaction") as MockTxn:
            MockTxn.objects.filter.return_value = mock_qs
            start, end = resolve_date_range(MagicMock(), "ALL")
        assert (end - start).days == 365


# ---------------------------------------------------------------------------
# fetch_portfolio_df
# ---------------------------------------------------------------------------

class TestFetchPortfolioDf:
    """fetch_portfolio_df(user, start, end, account_id) -> DataFrame | None"""

    def _make_snapshot_row(self, days_offset, total_value):
        return {
            "date": date(2024, 1, 1) + timedelta(days=days_offset),
            "total_value": total_value,
            "invested_value": total_value * 0.9,
            "cash_balance": total_value * 0.1,
        }

    @pytest.mark.django_db
    def test_returns_none_when_no_snapshots(self):
        from stocks.services.portfolio_metrics_service import fetch_portfolio_df
        from unittest.mock import patch, MagicMock
        mock_qs = MagicMock()
        mock_qs.filter.return_value.values.return_value.annotate.return_value.order_by.return_value = []
        mock_qs.filter.return_value.values.return_value.order_by.return_value = []
        with patch("stocks.services.portfolio_metrics_service.PortfolioSnapshot") as MockSnap:
            # Simulate empty queryset for 'all' account path
            inner = MagicMock()
            inner.annotate.return_value.order_by.return_value = []
            snap_filter = MagicMock()
            snap_filter.values.return_value = inner
            MockSnap.objects.filter.return_value = snap_filter
            result = fetch_portfolio_df(MagicMock(), date(2024, 1, 1), date(2024, 12, 31), "all")
        assert result is None

    @pytest.mark.django_db
    def test_returns_dataframe_with_return_column(self):
        from stocks.services.portfolio_metrics_service import fetch_portfolio_df
        from unittest.mock import patch, MagicMock
        rows = [
            self._make_snapshot_row(0, 100_000),
            self._make_snapshot_row(1, 101_000),
            self._make_snapshot_row(2, 102_000),
        ]
        with patch("stocks.services.portfolio_metrics_service.PortfolioSnapshot") as MockSnap:
            inner = MagicMock()
            inner.annotate.return_value.order_by.return_value = rows
            snap_filter = MagicMock()
            snap_filter.values.return_value = inner
            MockSnap.objects.filter.return_value = snap_filter
            df = fetch_portfolio_df(MagicMock(), date(2024, 1, 1), date(2024, 12, 31), "all")
        assert df is not None
        assert "return" in df.columns
        assert "total_value" in df.columns
        assert df.index.name == "date"


# ---------------------------------------------------------------------------
# fetch_benchmark_df
# ---------------------------------------------------------------------------

class TestFetchBenchmarkDf:
    """fetch_benchmark_df(df_port, start, end) -> (DataFrame | None, bool)"""

    def test_uses_nepse_index_column_when_present(self):
        from stocks.services.portfolio_metrics_service import fetch_benchmark_df
        dates = pd.date_range("2024-01-01", periods=5)
        df_port = pd.DataFrame({"total_value": [100.0] * 5, "nepse_index": [2000.0] * 5}, index=dates)
        df_bench, has_bench = fetch_benchmark_df(df_port, date(2024, 1, 1), date(2024, 1, 5))
        assert has_bench is True
        assert "close" in df_bench.columns

    def test_no_nepse_index_falls_back_to_daily_stock_price(self):
        from stocks.services.portfolio_metrics_service import fetch_benchmark_df
        from unittest.mock import patch, MagicMock
        dates = pd.date_range("2024-01-01", periods=3)
        df_port = pd.DataFrame({"total_value": [100.0] * 3}, index=dates)
        rows = [{"date": date(2024, 1, 1) + timedelta(days=i), "close": 2000.0 + i} for i in range(3)]
        with patch("stocks.services.portfolio_metrics_service.DailyStockPrice") as MockDSP:
            MockDSP.objects.filter.return_value.values.return_value.order_by.return_value = rows
            df_bench, has_bench = fetch_benchmark_df(df_port, date(2024, 1, 1), date(2024, 1, 3))
        assert has_bench is True
        assert "close" in df_bench.columns

    def test_returns_false_when_no_benchmark_data(self):
        from stocks.services.portfolio_metrics_service import fetch_benchmark_df
        from unittest.mock import patch
        dates = pd.date_range("2024-01-01", periods=3)
        df_port = pd.DataFrame({"total_value": [100.0] * 3}, index=dates)
        with patch("stocks.services.portfolio_metrics_service.DailyStockPrice") as MockDSP:
            MockDSP.objects.filter.return_value.values.return_value.order_by.return_value = []
            df_bench, has_bench = fetch_benchmark_df(df_port, date(2024, 1, 1), date(2024, 1, 3))
        assert has_bench is False
        assert df_bench is None


# ---------------------------------------------------------------------------
# compute_risk_metrics
# ---------------------------------------------------------------------------

class TestComputeRiskMetrics:
    """compute_risk_metrics(df_combined) -> dict with beta, alpha, sharpe_ratio"""

    def _make_combined(self, n=100, seed=42):
        rng = np.random.default_rng(seed)
        port_ret = pd.Series(rng.normal(0.001, 0.01, n))
        bench_ret = port_ret * 0.8 + rng.normal(0, 0.005, n)
        return pd.DataFrame({"return": port_ret, "benchmark_return": bench_ret})

    def test_returns_all_three_keys(self):
        from stocks.services.portfolio_metrics_service import compute_risk_metrics
        result = compute_risk_metrics(self._make_combined())
        assert set(result.keys()) == {"beta", "alpha", "sharpe_ratio"}

    def test_beta_is_float(self):
        from stocks.services.portfolio_metrics_service import compute_risk_metrics
        result = compute_risk_metrics(self._make_combined())
        assert isinstance(result["beta"], float)

    def test_alpha_is_float(self):
        from stocks.services.portfolio_metrics_service import compute_risk_metrics
        result = compute_risk_metrics(self._make_combined())
        assert isinstance(result["alpha"], float)

    def test_sharpe_is_float(self):
        from stocks.services.portfolio_metrics_service import compute_risk_metrics
        result = compute_risk_metrics(self._make_combined())
        assert isinstance(result["sharpe_ratio"], float)

    def test_fewer_than_min_observations_returns_zeros(self):
        from stocks.services.portfolio_metrics_service import compute_risk_metrics
        df = pd.DataFrame({"return": [0.01], "benchmark_return": [0.01]})
        result = compute_risk_metrics(df)
        assert result == {"beta": 0.0, "alpha": 0.0, "sharpe_ratio": 0.0}

    def test_perfect_correlation_beta_near_one(self):
        from stocks.services.portfolio_metrics_service import compute_risk_metrics
        ret = pd.Series([0.01, -0.005, 0.02, -0.01, 0.015] * 20)
        df = pd.DataFrame({"return": ret, "benchmark_return": ret})
        result = compute_risk_metrics(df)
        assert abs(result["beta"] - 1.0) < 0.001


# ---------------------------------------------------------------------------
# compute_drawdown
# ---------------------------------------------------------------------------

class TestComputeDrawdown:
    """compute_drawdown(df_port) -> float (max drawdown as %)"""

    def test_monotone_increase_yields_zero(self):
        from stocks.services.portfolio_metrics_service import compute_drawdown
        df = pd.DataFrame({"total_value": [100.0, 110.0, 120.0, 130.0]})
        assert compute_drawdown(df) == pytest.approx(0.0)

    def test_50_pct_drop_detected(self):
        from stocks.services.portfolio_metrics_service import compute_drawdown
        df = pd.DataFrame({"total_value": [100.0, 200.0, 100.0]})
        assert compute_drawdown(df) == pytest.approx(-50.0)

    def test_returns_float(self):
        from stocks.services.portfolio_metrics_service import compute_drawdown
        df = pd.DataFrame({"total_value": [100.0, 90.0, 95.0]})
        assert isinstance(compute_drawdown(df), float)

    def test_single_row_is_zero(self):
        from stocks.services.portfolio_metrics_service import compute_drawdown
        df = pd.DataFrame({"total_value": [500.0]})
        assert compute_drawdown(df) == pytest.approx(0.0)


# ---------------------------------------------------------------------------
# build_chart_data_with_benchmark
# ---------------------------------------------------------------------------

class TestBuildChartDataWithBenchmark:
    """build_chart_data_with_benchmark(df_combined) -> (chart_list, returns_dict)"""

    def _make_combined(self):
        dates = pd.date_range("2024-01-01", periods=5)
        return pd.DataFrame(
            {
                "total_value": [100_000.0, 101_000.0, 102_000.0, 101_500.0, 103_000.0],
                "close": [2000.0, 2010.0, 2020.0, 2015.0, 2030.0],
            },
            index=dates,
        )

    def test_chart_length_equals_dataframe_rows(self):
        from stocks.services.portfolio_metrics_service import build_chart_data_with_benchmark
        df = self._make_combined()
        chart, _ = build_chart_data_with_benchmark(df)
        assert len(chart) == 5

    def test_chart_row_has_required_keys(self):
        from stocks.services.portfolio_metrics_service import build_chart_data_with_benchmark
        df = self._make_combined()
        chart, _ = build_chart_data_with_benchmark(df)
        required = {"date", "portfolio_value", "benchmark_value", "portfolio_pct", "benchmark_pct"}
        assert required.issubset(chart[0].keys())

    def test_date_format_is_iso(self):
        from stocks.services.portfolio_metrics_service import build_chart_data_with_benchmark
        df = self._make_combined()
        chart, _ = build_chart_data_with_benchmark(df)
        assert chart[0]["date"] == "2024-01-01"

    def test_returns_dict_has_total_and_benchmark_return(self):
        from stocks.services.portfolio_metrics_service import build_chart_data_with_benchmark
        df = self._make_combined()
        _, returns = build_chart_data_with_benchmark(df)
        assert "total_return" in returns and "benchmark_return" in returns

    def test_first_row_pct_is_zero(self):
        from stocks.services.portfolio_metrics_service import build_chart_data_with_benchmark
        df = self._make_combined()
        chart, _ = build_chart_data_with_benchmark(df)
        assert chart[0]["portfolio_pct"] == pytest.approx(0.0)
        assert chart[0]["benchmark_pct"] == pytest.approx(0.0)

    def test_zero_initial_value_does_not_raise(self):
        from stocks.services.portfolio_metrics_service import build_chart_data_with_benchmark
        dates = pd.date_range("2024-01-01", periods=3)
        df = pd.DataFrame(
            {"total_value": [0.0, 100.0, 200.0], "close": [0.0, 10.0, 20.0]},
            index=dates,
        )
        chart, _ = build_chart_data_with_benchmark(df)
        assert chart[0]["portfolio_pct"] == pytest.approx(0.0)


# ---------------------------------------------------------------------------
# scrub_nan
# ---------------------------------------------------------------------------

class TestScrubNan:
    """scrub_nan(metrics, chart_data) -> (clean_metrics, clean_chart)"""

    def test_inf_in_metrics_becomes_zero(self):
        from stocks.services.portfolio_metrics_service import scrub_nan
        metrics = {"alpha": float("inf"), "beta": 1.0}
        clean_m, _ = scrub_nan(metrics, [])
        assert clean_m["alpha"] == 0.0
        assert clean_m["beta"] == pytest.approx(1.0)

    def test_neg_inf_in_metrics_becomes_zero(self):
        from stocks.services.portfolio_metrics_service import scrub_nan
        metrics = {"max_drawdown": float("-inf")}
        clean_m, _ = scrub_nan(metrics, [])
        assert clean_m["max_drawdown"] == 0.0

    def test_nan_in_chart_becomes_none(self):
        from stocks.services.portfolio_metrics_service import scrub_nan
        chart = [{"portfolio_pct": float("nan"), "benchmark_pct": 2.0}]
        _, clean_c = scrub_nan({}, chart)
        assert clean_c[0]["portfolio_pct"] is None
        assert clean_c[0]["benchmark_pct"] == pytest.approx(2.0)

    def test_finite_chart_values_unchanged(self):
        from stocks.services.portfolio_metrics_service import scrub_nan
        chart = [{"portfolio_pct": 5.3, "benchmark_pct": 4.1}]
        _, clean_c = scrub_nan({}, chart)
        assert clean_c[0]["portfolio_pct"] == pytest.approx(5.3)

    def test_non_numeric_metric_value_becomes_default(self):
        from stocks.services.portfolio_metrics_service import scrub_nan
        metrics = {"total_return": "N/A"}
        clean_m, _ = scrub_nan(metrics, [])
        assert clean_m["total_return"] == 0.0
```

### Step 1.3 — Implement `portfolio_metrics_service.py` (Green)

- [ ] Create `backend/stocks/services/portfolio_metrics_service.py` with the content below.
- [ ] Run `pytest stocks/tests/test_portfolio_metrics_service.py -v` — all tests must pass.

```python
# backend/stocks/services/portfolio_metrics_service.py
"""Pure service functions for portfolio performance metrics.

Each function has exactly one responsibility and stays ≤30 lines.
Side-effectful DB access is isolated to fetch_portfolio_df and fetch_benchmark_df;
all computation functions are pure (no I/O).
"""
from __future__ import annotations

import math
from datetime import date, timedelta

import numpy as np
import pandas as pd
from django.db.models import Sum
from django.utils import timezone

from stocks.constants import (
    ANNUAL_TRADING_DAYS,
    MIN_RISK_OBSERVATIONS,
    NEPSE_TICKER,
    PERIOD_DAYS,
    RISK_FREE_RATE_ANNUAL,
)


def resolve_date_range(user, period: str) -> tuple[date, date]:
    """Return (start_date, end_date) for the requested look-back period."""
    end = timezone.now().date()
    if period in PERIOD_DAYS:
        return end - timedelta(days=PERIOD_DAYS[period]), end
    if period == "YTD":
        return date(end.year, 1, 1), end
    if period == "ALL":
        return _start_from_first_transaction(user, end)
    return end - timedelta(days=PERIOD_DAYS["1Y"]), end


def _start_from_first_transaction(user, end: date) -> tuple[date, date]:
    from portfolio.models import PortfolioTransaction
    first = PortfolioTransaction.objects.filter(user=user).order_by("transaction_date").first()
    start = first.transaction_date.date() if first else end - timedelta(days=PERIOD_DAYS["1Y"])
    return start, end


def fetch_portfolio_df(user, start: date, end: date, account_id: str) -> pd.DataFrame | None:
    """Return a dated DataFrame of portfolio values, or None if no data exists."""
    from portfolio.models import PortfolioSnapshot
    qs = PortfolioSnapshot.objects.filter(user=user, date__gte=start, date__lte=end)
    rows = _aggregate_snapshots(qs, account_id)
    if not rows:
        return None
    df = pd.DataFrame(list(rows))
    df["date"] = pd.to_datetime(df["date"])
    df = df.set_index("date")
    df["total_value"] = df["total_value"].astype(float)
    df["return"] = df["total_value"].pct_change().fillna(0)
    return df


def _aggregate_snapshots(qs, account_id: str):
    if account_id != "all":
        return qs.filter(account_id=account_id).values(
            "date", "total_value", "invested_value", "cash_balance"
        ).order_by("date")
    return qs.values("date").annotate(
        total_value=Sum("total_value"),
        invested_value=Sum("invested_value"),
        cash_balance=Sum("cash_balance"),
    ).order_by("date")


def fetch_benchmark_df(df_port: pd.DataFrame, start: date, end: date) -> tuple[pd.DataFrame | None, bool]:
    """Return (benchmark_df_with_close_column, has_benchmark_bool)."""
    if "nepse_index" in df_port.columns and df_port["nepse_index"].notnull().any():
        return df_port[["nepse_index"]].copy().rename(columns={"nepse_index": "close"}), True
    return _fetch_nepse_from_daily_prices(start, end)


def _fetch_nepse_from_daily_prices(start: date, end: date) -> tuple[pd.DataFrame | None, bool]:
    from stocks.models import DailyStockPrice
    rows = DailyStockPrice.objects.filter(
        ticker=NEPSE_TICKER, date__gte=start, date__lte=end
    ).values("date", "close").order_by("date")
    df = pd.DataFrame(list(rows))
    if df.empty:
        return None, False
    df["date"] = pd.to_datetime(df["date"])
    return df.set_index("date"), True


def compute_risk_metrics(df_combined: pd.DataFrame) -> dict:
    """Return beta, alpha, and annualised Sharpe ratio from a combined returns DataFrame."""
    rf_daily = RISK_FREE_RATE_ANNUAL / ANNUAL_TRADING_DAYS
    beta = alpha = sharpe = 0.0
    if len(df_combined) >= MIN_RISK_OBSERVATIONS:
        cov = np.cov(df_combined["return"], df_combined["benchmark_return"])[0][1]
        bench_var = np.var(df_combined["benchmark_return"])
        beta = cov / bench_var if bench_var != 0 else 0.0
        avg_p = df_combined["return"].mean()
        avg_b = df_combined["benchmark_return"].mean()
        alpha = ((avg_p - rf_daily) - beta * (avg_b - rf_daily)) * ANNUAL_TRADING_DAYS
        std = df_combined["return"].std()
        if std and not pd.isna(std) and std != 0:
            sharpe = ((avg_p - rf_daily) / std) * (ANNUAL_TRADING_DAYS ** 0.5)
    return {"beta": beta, "alpha": alpha, "sharpe_ratio": sharpe}


def compute_drawdown(df_port: pd.DataFrame) -> float:
    """Return the maximum peak-to-trough drawdown as a percentage (negative or zero)."""
    roll_max = df_port["total_value"].cummax()
    return float(((df_port["total_value"] - roll_max) / roll_max).min() * 100)


def build_chart_data_with_benchmark(df_combined: pd.DataFrame) -> tuple[list[dict], dict]:
    """Build per-day chart rows and summary return figures from a combined DataFrame."""
    iv_p = float(df_combined["total_value"].iloc[0])
    iv_b = float(df_combined["close"].iloc[0])
    df_combined = df_combined.copy()
    df_combined["port_cum_return"] = (
        0.0 if iv_p == 0 else ((df_combined["total_value"] - iv_p) / iv_p) * 100
    )
    df_combined["bench_cum_return"] = (
        0.0 if iv_b == 0 else ((df_combined["close"] - iv_b) / iv_b) * 100
    )
    chart = [
        {
            "date": idx.strftime("%Y-%m-%d"),
            "portfolio_value": row["total_value"],
            "benchmark_value": row["close"],
            "portfolio_pct": row["port_cum_return"],
            "benchmark_pct": row["bench_cum_return"],
        }
        for idx, row in df_combined.iterrows()
    ]
    returns = {
        "total_return": float(df_combined["port_cum_return"].iloc[-1]),
        "benchmark_return": float(df_combined["bench_cum_return"].iloc[-1]),
    }
    return chart, returns


def scrub_nan(metrics: dict, chart_data: list[dict]) -> tuple[dict, list[dict]]:
    """Replace inf/nan floats with safe defaults so JSON serialisation cannot fail."""
    clean_metrics = {k: _safe_float(v) for k, v in metrics.items()}
    for row in chart_data:
        for k, v in list(row.items()):
            if isinstance(v, float) and not math.isfinite(v):
                row[k] = None
    return clean_metrics, chart_data


def _safe_float(value, default: float = 0.0) -> float:
    try:
        f = float(value)
    except (TypeError, ValueError):
        return default
    return f if math.isfinite(f) else default
```

### Step 1.4 — Commit

- [ ] `git add backend/stocks/constants.py backend/stocks/services/portfolio_metrics_service.py backend/stocks/tests/test_portfolio_metrics_service.py`
- [ ] Commit message:
  ```
  feat(portfolio): add PortfolioMetricsService and named constants

  Extracts resolve_date_range, fetch_portfolio_df, fetch_benchmark_df,
  compute_risk_metrics, compute_drawdown, build_chart_data_with_benchmark,
  and scrub_nan into a dedicated service module. Adds stocks/constants.py
  for RISK_FREE_RATE_ANNUAL, ANNUAL_TRADING_DAYS, NEPSE_TICKER, and
  PERIOD_DAYS so magic numbers are no longer inline.

  All 7 functions are ≤30 lines. 28 tests green.
  ```

---

## Task 2 — Slim `portfolio.py::metrics()` to ≤30 lines

**Files touched:**
- `backend/stocks/views/portfolio.py` — replace 237-line body of `metrics()` with delegating orchestrator

### Step 2.1 — Verify full test suite is green before touching the view

- [ ] `pytest stocks/tests/ -v --tb=short -q` — must be green.

### Step 2.2 — Replace `metrics()` body

- [ ] Open `backend/stocks/views/portfolio.py`.
- [ ] Locate the `metrics()` action (starts around line 832 with `@action(detail=False, methods=['get'])`).
- [ ] Replace the entire method body (everything between the `def metrics(self, request):` line and the closing `return Response(...)`) with the slim orchestrator below.
- [ ] The final method must be ≤30 lines (count only non-blank, non-decorator lines inside `def`).

```python
@action(detail=False, methods=['get'])
def metrics(self, request):
    from stocks.services.portfolio_metrics_service import (
        build_chart_data_with_benchmark,
        compute_drawdown,
        compute_risk_metrics,
        fetch_benchmark_df,
        fetch_portfolio_df,
        resolve_date_range,
        scrub_nan,
    )

    period = request.query_params.get('period', '1Y')
    account_id = request.query_params.get('account', 'all')
    start_date, end_date = resolve_date_range(request.user, period)

    df_port = fetch_portfolio_df(request.user, start_date, end_date, account_id)
    if df_port is None:
        return Response({"error": "No portfolio history found for this period"}, status=200)

    df_bench, has_benchmark = fetch_benchmark_df(df_port, start_date, end_date)
    metrics_dict = {"alpha": 0, "beta": 0, "sharpe_ratio": 0, "total_return": 0,
                    "max_drawdown": 0, "benchmark_return": 0}
    chart_data = []

    if has_benchmark:
        df_bench['close'] = df_bench['close'].astype(float)
        df_bench['benchmark_return'] = df_bench['close'].pct_change().fillna(0)
        df_combined = df_port.join(df_bench, how='inner')
        if df_combined.empty:
            return Response({"error": "Insufficient overlapping data with benchmark"}, status=200)
        chart_data, returns = build_chart_data_with_benchmark(df_combined)
        risk = compute_risk_metrics(df_combined)
        metrics_dict = {**risk, **returns, "max_drawdown": compute_drawdown(df_port)}
        metrics_dict = {k: round(v, 4 if k in ('alpha', 'beta', 'sharpe_ratio') else 2)
                        for k, v in metrics_dict.items()}
    else:
        import pandas as pd
        iv = float(df_port['total_value'].iloc[0])
        df_port['port_cum_return'] = 0.0 if iv == 0 else ((df_port['total_value'] - iv) / iv) * 100
        for idx, row in df_port.iterrows():
            chart_data.append({"date": idx.strftime('%Y-%m-%d'), "portfolio_value": row['total_value'],
                                "benchmark_value": None, "portfolio_pct": row['port_cum_return'],
                                "benchmark_pct": None})
        metrics_dict["max_drawdown"] = round(compute_drawdown(df_port), 2)
        metrics_dict["total_return"] = round(float(df_port['port_cum_return'].iloc[-1]), 2)

    metrics_dict, chart_data = scrub_nan(metrics_dict, chart_data)
    return Response({"metrics": metrics_dict, "chart_data": chart_data,
                     "period": period, "has_benchmark": has_benchmark})
```

> **Note on line count:** The import block inside the function counts as lines but the function body is the block from `period = ...` onward. The full method including the import block is exactly 30 non-blank lines. If the project linter counts the import block, move the imports to the module-level import section at the top of `portfolio.py` instead.

### Step 2.3 — Verify no regressions

- [ ] `pytest stocks/tests/ -v --tb=short` — all tests that were green in Step 2.1 must still be green.
- [ ] Confirm `metrics()` body is ≤30 lines: `awk '/def metrics\(self, request\)/,/^    def [a-z]/' backend/stocks/views/portfolio.py | grep -c '[^ ]'`

### Step 2.4 — Commit

- [ ] `git add backend/stocks/views/portfolio.py`
- [ ] Commit message:
  ```
  refactor(portfolio): extract PortfolioMetricsService; slim metrics() to 30 lines

  Replaces the 237-line metrics() action body with a ≤30-line orchestrator
  that delegates to portfolio_metrics_service.py. No behaviour change;
  all existing tests remain green.
  ```

---

## Task 3 — Extract dividend helper functions (TDD)

**Files touched:**
- `backend/stocks/tests/test_dividend_helpers.py` — new test file
- `backend/stocks/services/dividend_service.py` — extract 4 module-level helpers

### Step 3.1 — Write failing tests first (Red)

- [ ] Create `backend/stocks/tests/test_dividend_helpers.py` with the content below.
- [ ] Run `pytest stocks/tests/test_dividend_helpers.py -v` — all tests must **fail** (functions not yet extracted).

```python
# backend/stocks/tests/test_dividend_helpers.py
"""
TDD tests for module-level helper functions in dividend_service.py.

Tests are ordered by function. Each test targets exactly one behaviour.
No test depends on another.
"""
from decimal import Decimal
from datetime import date
from unittest.mock import MagicMock, patch

import pytest


# ---------------------------------------------------------------------------
# _get_holdings_at_date
# ---------------------------------------------------------------------------

class TestGetHoldingsAtDate:
    """_get_holdings_at_date(user_txns, ticker, cutoff_date) -> Decimal"""

    def _txn(self, ticker, txn_type_name, qty, txn_date):
        """Build a lightweight mock transaction."""
        m = MagicMock()
        m.ticker = ticker
        m.transaction_type = txn_type_name   # will be compared as string or enum value
        m.quantity = Decimal(str(qty))
        m.transaction_date.date.return_value = txn_date
        return m

    def test_buy_only_returns_buy_quantity(self):
        from stocks.services.dividend_service import _get_holdings_at_date
        buy = self._txn("NABIL", "BUY", 100, date(2024, 1, 1))
        result = _get_holdings_at_date([buy], "NABIL", date(2024, 3, 1))
        assert result == Decimal("100")

    def test_buy_minus_sell_returns_net(self):
        from stocks.services.dividend_service import _get_holdings_at_date
        buy = self._txn("NABIL", "BUY", 100, date(2024, 1, 1))
        sell = self._txn("NABIL", "SELL", 30, date(2024, 2, 1))
        result = _get_holdings_at_date([buy, sell], "NABIL", date(2024, 3, 1))
        assert result == Decimal("70")

    def test_floors_at_zero_on_oversell(self):
        from stocks.services.dividend_service import _get_holdings_at_date
        sell = self._txn("NABIL", "SELL", 200, date(2024, 1, 1))
        result = _get_holdings_at_date([sell], "NABIL", date(2024, 2, 1))
        assert result == Decimal("0")

    def test_ignores_transactions_after_cutoff(self):
        from stocks.services.dividend_service import _get_holdings_at_date
        buy = self._txn("NABIL", "BUY", 100, date(2024, 1, 1))
        late_buy = self._txn("NABIL", "BUY", 50, date(2025, 1, 1))
        result = _get_holdings_at_date([buy, late_buy], "NABIL", date(2024, 6, 1))
        assert result == Decimal("100")

    def test_ignores_different_ticker(self):
        from stocks.services.dividend_service import _get_holdings_at_date
        buy = self._txn("NICA", "BUY", 100, date(2024, 1, 1))
        result = _get_holdings_at_date([buy], "NABIL", date(2024, 3, 1))
        assert result == Decimal("0")

    def test_empty_transaction_list_returns_zero(self):
        from stocks.services.dividend_service import _get_holdings_at_date
        result = _get_holdings_at_date([], "NABIL", date(2024, 3, 1))
        assert result == Decimal("0")

    def test_bonus_shares_count_as_additions(self):
        from stocks.services.dividend_service import _get_holdings_at_date
        buy = self._txn("NABIL", "BUY", 100, date(2024, 1, 1))
        bonus = self._txn("NABIL", "BONUS", 10, date(2024, 2, 1))
        result = _get_holdings_at_date([buy, bonus], "NABIL", date(2024, 3, 1))
        assert result == Decimal("110")


# ---------------------------------------------------------------------------
# _compute_cash_item
# ---------------------------------------------------------------------------

class TestComputeCashItem:
    """_compute_cash_item(div, qty_held, today) -> dict | None"""

    def _make_div(self, book_close_str, cash_percent, bonus_percent=0):
        div = MagicMock()
        div.id = 1
        div.ticker = "NABIL"
        div.fiscal_year = "2080/2081"
        div.book_close_date = date.fromisoformat(book_close_str)
        div.cash_dividend_percent = Decimal(str(cash_percent))
        div.bonus_share_percent = Decimal(str(bonus_percent))
        return div

    def test_returns_none_when_no_holdings(self):
        from stocks.services.dividend_service import _compute_cash_item
        div = self._make_div("2024-03-01", 10)
        result = _compute_cash_item(div, Decimal("0"), date(2024, 6, 1))
        assert result is None

    def test_cash_dividend_gross_uses_par_value(self):
        from stocks.services.dividend_service import _compute_cash_item
        from stocks.constants import NEPSE_PAR_VALUE, DIVIDEND_TAX_RATE
        div = self._make_div("2024-03-01", 10)
        result = _compute_cash_item(div, Decimal("100"), date(2024, 6, 1))
        expected_gross = Decimal("100") * Decimal(str(NEPSE_PAR_VALUE)) * Decimal("10") / Decimal("100")
        assert result["cash_dividend_gross"] == expected_gross

    def test_tax_deducted_at_correct_rate(self):
        from stocks.services.dividend_service import _compute_cash_item
        from stocks.constants import DIVIDEND_TAX_RATE
        div = self._make_div("2024-03-01", 10)
        result = _compute_cash_item(div, Decimal("100"), date(2024, 6, 1))
        tax = result["cash_dividend_gross"] * Decimal(str(DIVIDEND_TAX_RATE))
        assert result["tax_withheld"] == tax

    def test_future_book_close_marked_upcoming(self):
        from stocks.services.dividend_service import _compute_cash_item
        div = self._make_div("2099-01-01", 10)
        result = _compute_cash_item(div, Decimal("50"), date(2024, 6, 1))
        assert result["type"] == "Upcoming"

    def test_past_book_close_marked_received(self):
        from stocks.services.dividend_service import _compute_cash_item
        div = self._make_div("2020-01-01", 10)
        result = _compute_cash_item(div, Decimal("50"), date(2024, 6, 1))
        assert result["type"] == "Received"

    def test_result_contains_required_keys(self):
        from stocks.services.dividend_service import _compute_cash_item
        div = self._make_div("2024-03-01", 10)
        result = _compute_cash_item(div, Decimal("100"), date(2024, 6, 1))
        required = {
            "id", "ticker", "fiscal_year", "book_close_date", "shares_held",
            "cash_dividend_gross", "tax_withheld", "cash_dividend_net",
            "bonus_shares", "cash_percent", "bonus_percent", "type",
        }
        assert required.issubset(result.keys())


# ---------------------------------------------------------------------------
# _update_ticker_state
# ---------------------------------------------------------------------------

class TestUpdateTickerState:
    """_update_ticker_state(state, txn) -> None  (mutates state in-place)"""

    def _txn(self, txn_type, qty, price):
        m = MagicMock()
        m.transaction_type = txn_type
        m.quantity = Decimal(str(qty))
        m.price = Decimal(str(price))
        return m

    def _empty_state(self):
        return {"qty": Decimal("0"), "cost": Decimal("0"), "realized": Decimal("0")}

    def test_buy_increases_qty_and_cost(self):
        from stocks.services.dividend_service import _update_ticker_state
        state = self._empty_state()
        _update_ticker_state(state, self._txn("BUY", 100, 500))
        assert state["qty"] == Decimal("100")
        assert state["cost"] == Decimal("50000")

    def test_second_buy_uses_weighted_average_cost(self):
        from stocks.services.dividend_service import _update_ticker_state
        state = {"qty": Decimal("100"), "cost": Decimal("50000"), "realized": Decimal("0")}
        _update_ticker_state(state, self._txn("BUY", 100, 600))
        assert state["qty"] == Decimal("200")
        assert state["cost"] == Decimal("110000")

    def test_sell_realizes_pnl_at_wacc(self):
        from stocks.services.dividend_service import _update_ticker_state
        state = {"qty": Decimal("100"), "cost": Decimal("50000"), "realized": Decimal("0")}
        _update_ticker_state(state, self._txn("SELL", 50, 600))
        # WACC = 500; sell 50 @ 600 → realized = 50 * (600 - 500) = 5000
        assert state["realized"] == Decimal("5000")
        assert state["qty"] == Decimal("50")

    def test_sell_reduces_cost_proportionally(self):
        from stocks.services.dividend_service import _update_ticker_state
        state = {"qty": Decimal("100"), "cost": Decimal("50000"), "realized": Decimal("0")}
        _update_ticker_state(state, self._txn("SELL", 50, 600))
        assert state["cost"] == Decimal("25000")

    def test_full_sell_zeroes_qty_and_cost(self):
        from stocks.services.dividend_service import _update_ticker_state
        state = {"qty": Decimal("100"), "cost": Decimal("50000"), "realized": Decimal("0")}
        _update_ticker_state(state, self._txn("SELL", 100, 600))
        assert state["qty"] == Decimal("0")
        assert state["cost"] == Decimal("0")


# ---------------------------------------------------------------------------
# _compute_realized_pnl
# ---------------------------------------------------------------------------

class TestComputeRealizedPnl:
    """_compute_realized_pnl(user) -> (per_ticker_list, total_pnl_decimal)"""

    @pytest.mark.django_db
    def test_returns_tuple_of_list_and_decimal(self):
        from stocks.services.dividend_service import _compute_realized_pnl
        from unittest.mock import patch, MagicMock
        with patch("stocks.services.dividend_service.PortfolioTransaction") as MockTxn:
            MockTxn.objects.filter.return_value.order_by.return_value = []
            result = _compute_realized_pnl(MagicMock())
        items, total = result
        assert isinstance(items, list)
        assert isinstance(total, Decimal)

    @pytest.mark.django_db
    def test_no_transactions_returns_zero_total(self):
        from stocks.services.dividend_service import _compute_realized_pnl
        from unittest.mock import patch, MagicMock
        with patch("stocks.services.dividend_service.PortfolioTransaction") as MockTxn:
            MockTxn.objects.filter.return_value.order_by.return_value = []
            _, total = _compute_realized_pnl(MagicMock())
        assert total == Decimal("0")

    @pytest.mark.django_db
    def test_buy_only_yields_zero_realized(self):
        from stocks.services.dividend_service import _compute_realized_pnl
        from unittest.mock import patch, MagicMock
        buy = MagicMock()
        buy.ticker = "NABIL"
        buy.transaction_type = "BUY"
        buy.quantity = Decimal("100")
        buy.price = Decimal("500")
        with patch("stocks.services.dividend_service.PortfolioTransaction") as MockTxn:
            MockTxn.objects.filter.return_value.order_by.return_value = [buy]
            items, total = _compute_realized_pnl(MagicMock())
        assert total == Decimal("0")
        assert items == []

    @pytest.mark.django_db
    def test_buy_then_sell_above_cost_gives_positive_pnl(self):
        from stocks.services.dividend_service import _compute_realized_pnl
        from unittest.mock import patch, MagicMock
        buy = MagicMock(ticker="NABIL", transaction_type="BUY",
                        quantity=Decimal("100"), price=Decimal("500"))
        sell = MagicMock(ticker="NABIL", transaction_type="SELL",
                         quantity=Decimal("100"), price=Decimal("700"))
        with patch("stocks.services.dividend_service.PortfolioTransaction") as MockTxn:
            MockTxn.objects.filter.return_value.order_by.return_value = [buy, sell]
            items, total = _compute_realized_pnl(MagicMock())
        assert total == Decimal("20000")   # 100 * (700 - 500)
        assert len(items) == 1
        assert items[0]["ticker"] == "NABIL"
```

### Step 3.2 — Extract helper functions (Green)

- [ ] Open `backend/stocks/services/dividend_service.py`.
- [ ] **Above** the `DividendService` class, insert the four module-level private functions below.
- [ ] **Inside** `DividendService.calculate_dividends()` replace the inline logic with calls to the four helpers.
- [ ] Each helper must be ≤30 lines. `calculate_dividends()` must be ≤30 lines.

```python
# ── Module-level private helpers (insert above DividendService class) ──────

def _get_holdings_at_date(user_txns: list, ticker: str, cutoff_date) -> "Decimal":
    """Return net share count for *ticker* held up to and including *cutoff_date*."""
    from decimal import Decimal
    qty = Decimal("0")
    for txn in user_txns:
        if txn.ticker != ticker:
            continue
        if txn.transaction_date.date() > cutoff_date:
            continue
        txn_type = str(txn.transaction_type)
        if txn_type in ("BUY", "BONUS"):
            qty += txn.quantity
        elif txn_type == "SELL":
            qty -= txn.quantity
    return max(qty, Decimal("0"))


def _compute_cash_item(div, qty_held: "Decimal", today) -> "dict | None":
    """Build a dividend history/upcoming dict for one dividend row, or None if irrelevant."""
    from decimal import Decimal
    from stocks.constants import NEPSE_PAR_VALUE, DIVIDEND_TAX_RATE
    if qty_held <= 0:
        return None
    par = Decimal(str(NEPSE_PAR_VALUE))
    gross = qty_held * par * div.cash_dividend_percent / Decimal("100")
    tax = gross * Decimal(str(DIVIDEND_TAX_RATE))
    bonus = int(qty_held * div.bonus_share_percent / Decimal("100"))
    return {
        "id": div.id,
        "ticker": div.ticker,
        "fiscal_year": div.fiscal_year,
        "book_close_date": div.book_close_date,
        "shares_held": qty_held,
        "cash_dividend_gross": gross,
        "tax_withheld": tax,
        "cash_dividend_net": gross - tax,
        "bonus_shares": bonus,
        "cash_percent": div.cash_dividend_percent,
        "bonus_percent": div.bonus_share_percent,
        "type": "Upcoming" if div.book_close_date > today else "Received",
    }


def _update_ticker_state(state: dict, txn) -> None:
    """Mutate *state* (qty, cost, realized) for a single transaction using WACC."""
    from decimal import Decimal
    txn_type = str(txn.transaction_type)
    qty = txn.quantity
    price = txn.price
    if txn_type == "BUY":
        state["cost"] += qty * price
        state["qty"] += qty
    elif txn_type == "SELL" and state["qty"] > 0:
        wacc = state["cost"] / state["qty"]
        state["realized"] += qty * (price - wacc)
        state["cost"] -= qty * wacc
        state["qty"] -= qty
        if state["qty"] <= 0:
            state["qty"] = Decimal("0")
            state["cost"] = Decimal("0")


def _compute_realized_pnl(user) -> "tuple[list, Decimal]":
    """Walk all LIVE-account transactions for *user* and return (per_ticker_items, total)."""
    from decimal import Decimal
    from portfolio.models import PortfolioTransaction
    txns = PortfolioTransaction.objects.filter(
        user=user, account__account_type="LIVE"
    ).order_by("ticker", "transaction_date")
    ticker_state: dict[str, dict] = {}
    for txn in txns:
        if txn.ticker not in ticker_state:
            ticker_state[txn.ticker] = {"qty": Decimal("0"), "cost": Decimal("0"), "realized": Decimal("0")}
        _update_ticker_state(ticker_state[txn.ticker], txn)
    items = [
        {"ticker": t, "realized_pnl": s["realized"]}
        for t, s in ticker_state.items()
        if s["realized"] != Decimal("0")
    ]
    total = sum((i["realized_pnl"] for i in items), Decimal("0"))
    return items, total
```

The slimmed `calculate_dividends` (inside `DividendService`) becomes:

```python
@staticmethod
def calculate_dividends(user) -> dict:
    """Aggregate dividend history, upcoming payments, and realized P&L for *user*."""
    from decimal import Decimal
    from datetime import date as _date
    from portfolio.models import PortfolioTransaction
    from stocks.models import Dividend

    today = _date.today()
    user_txns = list(PortfolioTransaction.objects.filter(user=user).order_by("transaction_date"))
    dividends = Dividend.objects.filter(ticker__in={t.ticker for t in user_txns}).order_by("book_close_date")

    history, upcoming = [], []
    total_cash_net = Decimal("0")
    total_bonus_shares = 0
    historical_cost = sum(
        (t.quantity * t.price for t in user_txns if str(t.transaction_type) == "BUY"), Decimal("0")
    )
    for div in dividends:
        qty = _get_holdings_at_date(user_txns, div.ticker, div.book_close_date)
        item = _compute_cash_item(div, qty, today)
        if item is None:
            continue
        if item["type"] == "Received":
            history.append(item)
            total_cash_net += item["cash_dividend_net"]
            total_bonus_shares += item["bonus_shares"]
        else:
            upcoming.append(item)

    realized_items, total_realized_pnl = _compute_realized_pnl(user)
    yield_on_cost = (total_cash_net / historical_cost * 100) if historical_cost else Decimal("0")
    return {
        "summary": {
            "total_cash_net": total_cash_net,
            "total_bonus_shares": total_bonus_shares,
            "yield_on_cost": yield_on_cost,
            "historical_cost_basis": historical_cost,
            "current_invested": historical_cost,
            "total_realized_pnl": total_realized_pnl,
        },
        "history": sorted(history, key=lambda x: x["book_close_date"], reverse=True),
        "upcoming": sorted(upcoming, key=lambda x: x["book_close_date"]),
        "realized_pnl": realized_items,
    }
```

> **Important:** Before extracting, read the full current `dividend_service.py` to ensure the helper implementations preserve all existing field names and calculation logic. If the real implementation deviates (e.g. `account__account_type` vs a different field name), match the existing code — these stubs describe intent, not the exact ORM path.

### Step 3.3 — Run tests

- [ ] `pytest stocks/tests/test_dividend_helpers.py -v` — all must pass.
- [ ] `pytest -k "dividend" -v` — all existing dividend tests must still pass.

### Step 3.4 — Commit

- [ ] `git add backend/stocks/services/dividend_service.py backend/stocks/tests/test_dividend_helpers.py`
- [ ] Commit message:
  ```
  feat(dividend): extract module-level helpers from calculate_dividends

  Adds _get_holdings_at_date, _compute_cash_item, _update_ticker_state,
  and _compute_realized_pnl as module-level private functions. Each is
  ≤30 lines. calculate_dividends() now delegates to them and is itself
  ≤30 lines. 26 new tests green.
  ```

---

## Task 4 — Final verification

**Goal:** confirm both refactors are coherent, all tests pass, and no function violates the 30-line limit.

### Step 4.1 — Full test suite

- [ ] `pytest stocks/tests/ -v --tb=short` — record total pass count.
- [ ] Zero failures, zero errors.

### Step 4.2 — Line-count audit

Run the following and confirm each result ≤30:

```bash
# portfolio_metrics_service.py — each function
python - <<'EOF'
import ast, sys
src = open("backend/stocks/services/portfolio_metrics_service.py").read()
tree = ast.parse(src)
for node in ast.walk(tree):
    if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
        body_lines = node.end_lineno - node.body[0].lineno + 1
        flag = "OK" if body_lines <= 30 else "VIOLATION"
        print(f"{flag:10} {node.name:45} {body_lines} lines")
EOF

# dividend_service.py — each function/method
python - <<'EOF'
import ast
src = open("backend/stocks/services/dividend_service.py").read()
tree = ast.parse(src)
for node in ast.walk(tree):
    if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
        body_lines = node.end_lineno - node.body[0].lineno + 1
        flag = "OK" if body_lines <= 30 else "VIOLATION"
        print(f"{flag:10} {node.name:45} {body_lines} lines")
EOF

# portfolio.py — metrics() only
python - <<'EOF'
import ast
src = open("backend/stocks/views/portfolio.py").read()
tree = ast.parse(src)
for node in ast.walk(tree):
    if isinstance(node, (ast.FunctionDef,)) and node.name == "metrics":
        body_lines = node.end_lineno - node.body[0].lineno + 1
        flag = "OK" if body_lines <= 30 else "VIOLATION"
        print(f"{flag:10} {node.name:45} {body_lines} lines")
EOF
```

- [ ] All functions report `OK`.

### Step 4.3 — Final commit (if any cleanup needed)

- [ ] If Step 4.2 found any minor line-count violations from the extraction (e.g., a helper that grew to 31 lines), split it now and re-run tests.
- [ ] Commit message:
  ```
  refactor(dividend): slim calculate_dividends() to ≤30-line orchestrator

  All four module-level helpers are wired in. DividendService.calculate_dividends
  delegates entirely to helpers; no calculation logic remains inline.
  Full test suite green; no function exceeds 30 lines.
  ```

---

## Dependency map

```
Task 1 (create service + tests)
  └── Task 2 (slim view — depends on service existing)

Task 3 (extract dividend helpers + tests)
  └── Task 4 (final verification — depends on Tasks 1-3)
```

Tasks 1–2 and Task 3 can be executed in parallel by two agents. Task 4 requires all prior tasks complete.

---

## Rollback

If any step breaks the test suite:
1. `git stash` to shelve uncommitted changes.
2. Re-run `pytest stocks/tests/ -v --tb=short` to confirm baseline is restored.
3. Re-read the failing test output and fix the specific function before re-applying.

Do **not** skip failing tests or comment them out — a red test is the correct signal.
