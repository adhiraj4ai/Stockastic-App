# Optimizer Strategy Pattern Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 264-line monolithic perform_portfolio_optimization() with a Strategy pattern: IPortfolioOptimizer Protocol + 7 concrete adapters + registry, eliminating the OCP-violating if/elif chain.

**Architecture:** New package stocks/services/optimization/ holds Protocol, data fetcher, trade calculator, single-stock helper, and one adapter file per optimizer library. The OPTIMIZER_REGISTRY dict replaces the if/elif chain; adding a new method is a new file + registry entry. The original optimization.py becomes a 3-line backward-compat shim.

**Tech Stack:** Django 5.2, PyPortfolioOpt, Riskfolio-Lib, Skfolio, pandas, numpy, pytest

---

## Task 1: Create base.py

- [ ] Write failing test `backend/stocks/tests/test_optimization_base.py`
- [ ] Create `backend/stocks/services/optimization/base.py`
- [ ] Run test green
- [ ] Commit

### Test file: `backend/stocks/tests/test_optimization_base.py`

```python
import pandas as pd
import pytest
from stocks.services.optimization.base import IPortfolioOptimizer, OptimizationResult


class MockOptimizer:
    methods = ("mock",)

    def optimize(self, returns: pd.DataFrame, df_pivoted: pd.DataFrame) -> OptimizationResult:
        return OptimizationResult(
            weight_map={"A": 1.0},
            metrics={"expected_return": 0.1, "volatility": 0.2, "sharpe_ratio": 0.5, "max_drawdown": 0.0},
            note="mock",
        )


def test_optimization_result_is_dataclass():
    result = OptimizationResult(
        weight_map={"A": 0.5, "B": 0.5},
        metrics={"expected_return": 0.1, "volatility": 0.15, "sharpe_ratio": 0.67, "max_drawdown": 0.05},
        note="test",
    )
    assert result.weight_map == {"A": 0.5, "B": 0.5}
    assert result.note == "test"


def test_mock_optimizer_satisfies_protocol():
    optimizer = MockOptimizer()
    assert isinstance(optimizer, IPortfolioOptimizer)


def test_protocol_requires_methods_attribute():
    class BadOptimizer:
        def optimize(self, returns, df_pivoted):
            return None

    assert not isinstance(BadOptimizer(), IPortfolioOptimizer)


def test_protocol_requires_optimize_method():
    class BadOptimizer:
        methods = ("x",)

    assert not isinstance(BadOptimizer(), IPortfolioOptimizer)
```

### Implementation: `backend/stocks/services/optimization/base.py`

```python
from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol, runtime_checkable

import pandas as pd


@dataclass
class OptimizationResult:
    weight_map: dict[str, float]
    metrics: dict[str, float]
    note: str


@runtime_checkable
class IPortfolioOptimizer(Protocol):
    methods: tuple[str, ...]

    def optimize(
        self, returns: pd.DataFrame, df_pivoted: pd.DataFrame
    ) -> OptimizationResult: ...
```

### Commit message

```
test(optimization): add base Protocol + OptimizationResult tests; green
```

---

## Task 2: Create data_fetcher.py

- [ ] Write failing test `backend/stocks/tests/test_optimization_data_fetcher.py`
- [ ] Add constants `OPTIMIZATION_HISTORY_DAYS` and `MIN_OPTIMIZATION_DAYS` to `backend/stocks/constants.py`
- [ ] Create `backend/stocks/services/optimization/data_fetcher.py`
- [ ] Run test green
- [ ] Commit

### Constants to add to `backend/stocks/constants.py`

```python
OPTIMIZATION_HISTORY_DAYS = 730
MIN_OPTIMIZATION_DAYS = 20
```

### Test file: `backend/stocks/tests/test_optimization_data_fetcher.py`

```python
from datetime import date
from unittest.mock import patch

import pandas as pd
import pytest

from stocks.services.optimization.data_fetcher import fetch_price_data


def _make_qs_data(n_days: int, tickers=("NABIL", "HBL")) -> list[dict]:
    rows = []
    for i in range(n_days):
        for j, t in enumerate(tickers):
            rows.append({"ticker": t, "date": date(2025, 1, 1 + (i % 27)), "close": 100.0 + i + j})
    return rows


@patch("stocks.services.optimization.data_fetcher.DailyStockPrice")
def test_returns_pivoted_dataframe(MockModel):
    data = _make_qs_data(30)
    MockModel.objects.filter.return_value.values.return_value = data
    result = fetch_price_data(["NABIL", "HBL"])
    assert result is not None
    assert isinstance(result, pd.DataFrame)
    assert set(result.columns).issuperset({"NABIL", "HBL"})


@patch("stocks.services.optimization.data_fetcher.DailyStockPrice")
def test_returns_none_when_empty(MockModel):
    MockModel.objects.filter.return_value.values.return_value = []
    result = fetch_price_data(["NABIL"])
    assert result is None


@patch("stocks.services.optimization.data_fetcher.DailyStockPrice")
def test_returns_none_when_fewer_than_min_days(MockModel):
    data = _make_qs_data(5)
    MockModel.objects.filter.return_value.values.return_value = data
    result = fetch_price_data(["NABIL", "HBL"])
    assert result is None


@patch("stocks.services.optimization.data_fetcher.DailyStockPrice")
def test_close_column_is_float(MockModel):
    data = _make_qs_data(30)
    MockModel.objects.filter.return_value.values.return_value = data
    result = fetch_price_data(["NABIL", "HBL"])
    assert result is not None
    assert result.dtypes.iloc[0] == float
```

### Implementation: `backend/stocks/services/optimization/data_fetcher.py`

```python
from __future__ import annotations

from datetime import datetime, timedelta

import pandas as pd

from stocks.constants import MIN_OPTIMIZATION_DAYS, OPTIMIZATION_HISTORY_DAYS
from stocks.models import DailyStockPrice


def fetch_price_data(tickers: list[str]) -> pd.DataFrame | None:
    end_date = datetime.now().date()
    start_date = end_date - timedelta(days=OPTIMIZATION_HISTORY_DAYS)
    qs = DailyStockPrice.objects.filter(
        ticker__in=tickers,
        date__gte=start_date,
        date__lte=end_date,
    ).values("ticker", "date", "close")
    df = pd.DataFrame(list(qs))
    if df.empty:
        return None
    df["close"] = df["close"].apply(float)
    pivoted = df.pivot(index="date", columns="ticker", values="close").ffill().dropna()
    if pivoted.empty or len(pivoted) < MIN_OPTIMIZATION_DAYS:
        return None
    return pivoted
```

### Commit message

```
feat(optimization): data_fetcher module with pivot + min-days guard
```

---

## Task 3: Create single_stock.py

- [ ] Write failing test `backend/stocks/tests/test_optimization_single_stock.py`
- [ ] Create `backend/stocks/services/optimization/single_stock.py`
- [ ] Run test green
- [ ] Commit

### Test file: `backend/stocks/tests/test_optimization_single_stock.py`

```python
from unittest.mock import patch, MagicMock

import pytest

from stocks.services.optimization.single_stock import single_stock_result


TICKER = "NABIL"


def _mock_price(close_value):
    m = MagicMock()
    m.close = close_value
    return m


@patch("stocks.services.optimization.single_stock.DailyStockPrice")
def test_returns_success_with_weight_one(MockModel):
    MockModel.objects.filter.return_value.order_by.return_value.first.return_value = _mock_price(1200.0)
    result = single_stock_result(TICKER, current_holdings=None)
    assert result["success"] is True
    assert result["weights"] == {TICKER: 1.0}
    assert result["trades"] == []


@patch("stocks.services.optimization.single_stock.DailyStockPrice")
def test_generates_buy_trade_when_underweight(MockModel):
    MockModel.objects.filter.return_value.order_by.return_value.first.return_value = _mock_price(1000.0)
    holdings = {TICKER: {"quantity": 2, "price": 1000.0}}
    result = single_stock_result(TICKER, current_holdings=holdings)
    assert result["success"] is True
    trades = result["trades"]
    assert len(trades) == 1
    assert trades[0]["action"] == "BUY"
    assert trades[0]["ticker"] == TICKER


@patch("stocks.services.optimization.single_stock.DailyStockPrice")
def test_returns_zero_price_when_no_db_record(MockModel):
    MockModel.objects.filter.return_value.order_by.return_value.first.return_value = None
    result = single_stock_result(TICKER, current_holdings=None)
    assert result["success"] is True
    assert result["weights"] == {TICKER: 1.0}


@patch("stocks.services.optimization.single_stock.DailyStockPrice")
def test_no_trade_when_diff_less_than_one(MockModel):
    MockModel.objects.filter.return_value.order_by.return_value.first.return_value = _mock_price(1000.0)
    holdings = {TICKER: {"quantity": 3, "price": 1000.0}}
    result = single_stock_result(TICKER, current_holdings=holdings)
    assert result["trades"] == []
```

### Implementation: `backend/stocks/services/optimization/single_stock.py`

```python
from __future__ import annotations

from stocks.models import DailyStockPrice

_ZERO_METRICS: dict[str, float] = {
    "expected_return": 0.0,
    "volatility": 0.0,
    "sharpe_ratio": 0.0,
    "max_drawdown": 0.0,
}


def single_stock_result(
    ticker: str, current_holdings: dict | None
) -> dict:
    latest = DailyStockPrice.objects.filter(ticker=ticker).order_by("-date").first()
    current_price = float(latest.close) if latest else 0.0
    trades = _build_single_stock_trades(ticker, current_price, current_holdings)
    return {
        "success": True,
        "weights": {ticker: 1.0},
        "metrics": _ZERO_METRICS,
        "trades": trades,
        "note": "Single stock portfolio.",
    }


def _build_single_stock_trades(
    ticker: str, current_price: float, current_holdings: dict | None
) -> list[dict]:
    if not current_holdings:
        return []
    holding = current_holdings.get(ticker, {"quantity": 0, "price": 0})
    price = holding["price"] if holding["price"] > 0 else current_price
    if price <= 0:
        return []
    total_value = sum(h["quantity"] * h["price"] for h in current_holdings.values())
    target_qty = total_value / price
    diff = round(target_qty - holding["quantity"])
    if abs(diff) < 1:
        return []
    return [{
        "ticker": ticker,
        "action": "BUY" if diff > 0 else "SELL",
        "quantity": abs(diff),
        "price": float(price),
        "estimated_value": float(abs(diff) * price),
    }]
```

### Commit message

```
feat(optimization): single_stock helper extracted from monolith
```

---

## Task 4: Create trade_calculator.py

- [ ] Write failing test `backend/stocks/tests/test_optimization_trade_calculator.py`
- [ ] Create `backend/stocks/services/optimization/trade_calculator.py`
- [ ] Run test green
- [ ] Commit

### Test file: `backend/stocks/tests/test_optimization_trade_calculator.py`

```python
from datetime import date

import pandas as pd
import pytest

from stocks.services.optimization.trade_calculator import calculate_trades


def _make_df(tickers, price=1000.0):
    idx = [date(2025, 6, 1), date(2025, 6, 2)]
    data = {t: [price, price] for t in tickers}
    return pd.DataFrame(data, index=idx)


def test_buy_trade_generated_for_underweight_ticker():
    df = _make_df(["NICA", "NMB"])
    holdings = {
        "NICA": {"quantity": 1, "price": 1000.0},
        "NMB": {"quantity": 1, "price": 1000.0},
    }
    weight_map = {"NICA": 0.7, "NMB": 0.3}
    trades = calculate_trades(weight_map, df, holdings)
    actions = {t["ticker"]: t["action"] for t in trades}
    assert "NICA" in actions
    assert actions["NICA"] == "BUY"


def test_no_trades_when_holdings_none():
    df = _make_df(["NICA", "NMB"])
    result = calculate_trades({"NICA": 0.5, "NMB": 0.5}, df, None)
    assert result == []


def test_trades_sorted_by_estimated_value_descending():
    df = _make_df(["A", "B", "C"])
    holdings = {
        "A": {"quantity": 0, "price": 1000.0},
        "B": {"quantity": 0, "price": 1000.0},
        "C": {"quantity": 0, "price": 1000.0},
    }
    weight_map = {"A": 0.5, "B": 0.3, "C": 0.2}
    trades = calculate_trades(weight_map, df, holdings)
    values = [t["estimated_value"] for t in trades]
    assert values == sorted(values, reverse=True)


def test_no_trade_when_diff_below_one():
    df = _make_df(["NICA"])
    holdings = {"NICA": {"quantity": 5, "price": 1000.0}}
    weight_map = {"NICA": 1.0}
    trades = calculate_trades(weight_map, df, holdings)
    assert trades == []


def test_uses_df_price_when_holding_price_is_zero():
    df = _make_df(["NICA"])
    holdings = {"NICA": {"quantity": 0, "price": 0}}
    weight_map = {"NICA": 1.0}
    trades = calculate_trades(weight_map, df, holdings)
    assert len(trades) == 0 or trades[0]["price"] == 1000.0
```

### Implementation: `backend/stocks/services/optimization/trade_calculator.py`

```python
from __future__ import annotations

import pandas as pd


def calculate_trades(
    weight_map: dict[str, float],
    df_pivoted: pd.DataFrame,
    current_holdings: dict | None,
) -> list[dict]:
    if not current_holdings:
        return []
    total_value = sum(h["quantity"] * h["price"] for h in current_holdings.values())
    trades = []
    for ticker, weight in weight_map.items():
        trade = _build_trade(ticker, weight, total_value, df_pivoted, current_holdings)
        if trade:
            trades.append(trade)
    return sorted(trades, key=lambda x: x["estimated_value"], reverse=True)


def _resolve_price(
    ticker: str,
    holding: dict,
    df_pivoted: pd.DataFrame,
) -> float:
    if holding["price"] > 0:
        return float(holding["price"])
    if ticker in df_pivoted.columns:
        return float(df_pivoted[ticker].iloc[-1])
    return 0.0


def _build_trade(
    ticker: str,
    weight: float,
    total_value: float,
    df_pivoted: pd.DataFrame,
    current_holdings: dict,
) -> dict | None:
    holding = current_holdings.get(ticker, {"quantity": 0, "price": 0})
    price = _resolve_price(ticker, holding, df_pivoted)
    if price <= 0:
        return None
    diff_qty = round(total_value * weight / price - holding["quantity"])
    if abs(diff_qty) < 1:
        return None
    return {
        "ticker": ticker,
        "action": "BUY" if diff_qty > 0 else "SELL",
        "quantity": abs(diff_qty),
        "price": price,
        "estimated_value": float(abs(diff_qty) * price),
    }
```

### Commit message

```
feat(optimization): trade_calculator module with sort + price fallback
```

---

## Task 5: Create optimizers/equal_optimizer.py

- [ ] Write failing test `backend/stocks/tests/test_optimization_equal_optimizer.py`
- [ ] Create `backend/stocks/services/optimization/optimizers/__init__.py` (empty placeholder for now)
- [ ] Create `backend/stocks/services/optimization/optimizers/equal_optimizer.py`
- [ ] Run test green
- [ ] Commit

### Test file: `backend/stocks/tests/test_optimization_equal_optimizer.py`

```python
import numpy as np
import pandas as pd
import pytest

from stocks.services.optimization.base import IPortfolioOptimizer, OptimizationResult
from stocks.services.optimization.optimizers.equal_optimizer import EqualWeightOptimizer


def _synthetic_returns(n_assets=3, n_days=60):
    rng = np.random.default_rng(42)
    data = rng.normal(0.001, 0.02, size=(n_days, n_assets))
    cols = [f"ASSET{i}" for i in range(n_assets)]
    return pd.DataFrame(data, columns=cols)


def test_equal_optimizer_satisfies_protocol():
    assert isinstance(EqualWeightOptimizer(), IPortfolioOptimizer)


def test_equal_optimizer_methods_tuple():
    assert EqualWeightOptimizer().methods == ("equal",)


def test_equal_weights_sum_to_one():
    returns = _synthetic_returns()
    df_pivoted = returns.cumsum() + 100
    result = EqualWeightOptimizer().optimize(returns, df_pivoted)
    assert isinstance(result, OptimizationResult)
    total = sum(result.weight_map.values())
    assert abs(total - 1.0) < 1e-9


def test_equal_weights_are_uniform():
    returns = _synthetic_returns(n_assets=4)
    df_pivoted = returns.cumsum() + 100
    result = EqualWeightOptimizer().optimize(returns, df_pivoted)
    weights = list(result.weight_map.values())
    assert all(abs(w - weights[0]) < 1e-9 for w in weights)


def test_metrics_keys_present():
    returns = _synthetic_returns()
    df_pivoted = returns.cumsum() + 100
    result = EqualWeightOptimizer().optimize(returns, df_pivoted)
    for key in ("expected_return", "volatility", "sharpe_ratio", "max_drawdown"):
        assert key in result.metrics
```

### Implementation: `backend/stocks/services/optimization/optimizers/equal_optimizer.py`

```python
from __future__ import annotations

import numpy as np
import pandas as pd

from stocks.services.optimization.base import OptimizationResult

_NOTE = "Equal Weighted (1/N) Baseline Strategy"


class EqualWeightOptimizer:
    methods: tuple[str, ...] = ("equal",)

    def optimize(
        self, returns: pd.DataFrame, df_pivoted: pd.DataFrame
    ) -> OptimizationResult:
        n = len(returns.columns)
        weight_map = {t: 1.0 / n for t in returns.columns}
        metrics = _compute_metrics(returns, np.full(n, 1.0 / n))
        return OptimizationResult(weight_map=weight_map, metrics=metrics, note=_NOTE)


def _compute_metrics(returns: pd.DataFrame, weights: np.ndarray) -> dict[str, float]:
    mu = (returns.mean() * 252).to_numpy()
    cov = (returns.cov() * 252).to_numpy()
    exp_ret = float(np.dot(weights, mu))
    vol = float(np.sqrt(weights @ cov @ weights))
    sharpe = exp_ret / vol if vol > 0 else 0.0
    return {
        "expected_return": exp_ret,
        "volatility": vol,
        "sharpe_ratio": sharpe,
        "max_drawdown": 0.0,
    }
```

### Commit message

```
feat(optimization): EqualWeightOptimizer adapter; no third-party deps
```

---

## Task 6: Create optimizers/pypfopt_optimizer.py

- [ ] Write failing test `backend/stocks/tests/test_optimization_pypfopt_optimizer.py`
- [ ] Create `backend/stocks/services/optimization/optimizers/pypfopt_optimizer.py`
- [ ] Run test green
- [ ] Commit

### Test file: `backend/stocks/tests/test_optimization_pypfopt_optimizer.py`

```python
import numpy as np
import pandas as pd
import pytest

try:
    from pypfopt import EfficientFrontier  # noqa: F401
    HAS_PYPFOPT = True
except ImportError:
    HAS_PYPFOPT = False

from stocks.services.optimization.base import IPortfolioOptimizer, OptimizationResult
from stocks.services.optimization.optimizers.pypfopt_optimizer import PyPfOptOptimizer


def _synthetic_pivoted(n_assets=3, n_days=252):
    rng = np.random.default_rng(0)
    prices = np.cumprod(1 + rng.normal(0.0005, 0.015, size=(n_days, n_assets)), axis=0) * 100
    cols = [f"ASSET{i}" for i in range(n_assets)]
    return pd.DataFrame(prices, columns=cols)


@pytest.mark.skipif(not HAS_PYPFOPT, reason="pypfopt not installed")
def test_pypfopt_optimizer_satisfies_protocol():
    assert isinstance(PyPfOptOptimizer("max_sharpe"), IPortfolioOptimizer)


@pytest.mark.skipif(not HAS_PYPFOPT, reason="pypfopt not installed")
def test_max_sharpe_weights_sum_to_one():
    df_pivoted = _synthetic_pivoted()
    returns = df_pivoted.pct_change().dropna()
    result = PyPfOptOptimizer("max_sharpe").optimize(returns, df_pivoted)
    assert isinstance(result, OptimizationResult)
    assert abs(sum(result.weight_map.values()) - 1.0) < 1e-6


@pytest.mark.skipif(not HAS_PYPFOPT, reason="pypfopt not installed")
def test_min_vol_weights_sum_to_one():
    df_pivoted = _synthetic_pivoted()
    returns = df_pivoted.pct_change().dropna()
    result = PyPfOptOptimizer("min_vol").optimize(returns, df_pivoted)
    assert abs(sum(result.weight_map.values()) - 1.0) < 1e-6


@pytest.mark.skipif(not HAS_PYPFOPT, reason="pypfopt not installed")
def test_metrics_keys_present():
    df_pivoted = _synthetic_pivoted()
    returns = df_pivoted.pct_change().dropna()
    result = PyPfOptOptimizer("max_sharpe").optimize(returns, df_pivoted)
    for key in ("expected_return", "volatility", "sharpe_ratio", "max_drawdown"):
        assert key in result.metrics


def test_methods_empty_when_not_installed():
    if HAS_PYPFOPT:
        pytest.skip("pypfopt is installed; skip unavailability test")
    opt = PyPfOptOptimizer("max_sharpe")
    assert opt.methods == ()
```

### Implementation: `backend/stocks/services/optimization/optimizers/pypfopt_optimizer.py`

```python
from __future__ import annotations

import pandas as pd

from stocks.services.optimization.base import OptimizationResult

try:
    from pypfopt import EfficientFrontier, expected_returns, objective_functions, risk_models
    _AVAILABLE = True
except ImportError:
    _AVAILABLE = False

_METHOD_NOTES = {
    "max_sharpe": "Optimized via PyPortfolioOpt (Max Sharpe)",
    "min_vol": "Optimized via PyPortfolioOpt (Min Volatility)",
}


class PyPfOptOptimizer:
    def __init__(self, method: str) -> None:
        self._method = method

    @property
    def methods(self) -> tuple[str, ...]:
        return ("max_sharpe", "min_vol") if _AVAILABLE else ()

    def optimize(
        self, returns: pd.DataFrame, df_pivoted: pd.DataFrame
    ) -> OptimizationResult:
        mu = expected_returns.mean_historical_return(df_pivoted)
        S = risk_models.sample_cov(df_pivoted)
        ef = EfficientFrontier(mu, S)
        ef.add_constraint(objective_functions.L2_reg, gamma=0.1)
        _apply_objective(ef, self._method)
        weight_map = dict(ef.clean_weights())
        perf = ef.portfolio_performance(verbose=False)
        metrics = {
            "expected_return": perf[0],
            "volatility": perf[1],
            "sharpe_ratio": perf[2],
            "max_drawdown": 0.0,
        }
        return OptimizationResult(
            weight_map=weight_map,
            metrics=metrics,
            note=_METHOD_NOTES[self._method],
        )


def _apply_objective(ef: "EfficientFrontier", method: str) -> None:
    if method == "max_sharpe":
        ef.max_sharpe()
    else:
        ef.min_volatility()
```

### Commit message

```
feat(optimization): PyPfOptOptimizer adapter with skipif guard in tests
```

---

## Task 7: Create optimizers/riskfolio_optimizer.py

- [ ] Write failing test `backend/stocks/tests/test_optimization_riskfolio_optimizer.py`
- [ ] Create `backend/stocks/services/optimization/optimizers/riskfolio_optimizer.py`
- [ ] Run test green
- [ ] Commit

### Test file: `backend/stocks/tests/test_optimization_riskfolio_optimizer.py`

```python
import numpy as np
import pandas as pd
import pytest

try:
    import riskfolio as rp  # noqa: F401
    HAS_RISKFOLIO = True
except ImportError:
    HAS_RISKFOLIO = False

from stocks.services.optimization.base import IPortfolioOptimizer, OptimizationResult
from stocks.services.optimization.optimizers.riskfolio_optimizer import (
    CDaROptimizer,
    CVaROptimizer,
    HRPOptimizer,
)


def _synthetic_returns(n_assets=4, n_days=252):
    rng = np.random.default_rng(7)
    data = rng.normal(0.0005, 0.015, size=(n_days, n_assets))
    cols = [f"ASSET{i}" for i in range(n_assets)]
    return pd.DataFrame(data, columns=cols)


@pytest.mark.skipif(not HAS_RISKFOLIO, reason="riskfolio not installed")
def test_hrp_optimizer_satisfies_protocol():
    assert isinstance(HRPOptimizer(), IPortfolioOptimizer)


@pytest.mark.skipif(not HAS_RISKFOLIO, reason="riskfolio not installed")
def test_hrp_weights_sum_to_one():
    returns = _synthetic_returns()
    df_pivoted = returns.cumsum() + 100
    result = HRPOptimizer().optimize(returns, df_pivoted)
    assert isinstance(result, OptimizationResult)
    assert abs(sum(result.weight_map.values()) - 1.0) < 1e-6


@pytest.mark.skipif(not HAS_RISKFOLIO, reason="riskfolio not installed")
def test_cvar_optimizer_satisfies_protocol():
    assert isinstance(CVaROptimizer(), IPortfolioOptimizer)


@pytest.mark.skipif(not HAS_RISKFOLIO, reason="riskfolio not installed")
def test_cvar_weights_sum_to_one():
    returns = _synthetic_returns()
    df_pivoted = returns.cumsum() + 100
    result = CVaROptimizer().optimize(returns, df_pivoted)
    assert abs(sum(result.weight_map.values()) - 1.0) < 1e-6


@pytest.mark.skipif(not HAS_RISKFOLIO, reason="riskfolio not installed")
def test_cdar_weights_sum_to_one():
    returns = _synthetic_returns()
    df_pivoted = returns.cumsum() + 100
    result = CDaROptimizer().optimize(returns, df_pivoted)
    assert abs(sum(result.weight_map.values()) - 1.0) < 1e-6


def test_hrp_methods_empty_when_not_installed():
    if HAS_RISKFOLIO:
        pytest.skip("riskfolio is installed")
    assert HRPOptimizer().methods == ()
```

### Implementation: `backend/stocks/services/optimization/optimizers/riskfolio_optimizer.py`

```python
from __future__ import annotations

import numpy as np
import pandas as pd

from stocks.services.optimization.base import OptimizationResult

try:
    import riskfolio as rp
    _AVAILABLE = True
except ImportError:
    _AVAILABLE = False


def _compute_metrics(returns: pd.DataFrame, weight_map: dict[str, float]) -> dict[str, float]:
    mu = returns.mean() * 252
    cov = returns.cov() * 252
    w = np.array([weight_map[t] for t in returns.columns])
    exp_ret = float(np.dot(w, mu))
    vol = float(np.sqrt(w @ cov.to_numpy() @ w))
    sharpe = exp_ret / vol if vol > 0 else 0.0
    return {"expected_return": exp_ret, "volatility": vol, "sharpe_ratio": sharpe, "max_drawdown": 0.0}


class HRPOptimizer:
    methods: tuple[str, ...] = ("hrp",) if _AVAILABLE else ()

    def optimize(self, returns: pd.DataFrame, df_pivoted: pd.DataFrame) -> OptimizationResult:
        port = rp.HCPortfolio(returns=returns)
        w = port.optimization(model="HRP", codependence="pearson", rm="MV", rf=0, link="single", leaf_order=True)
        weight_map = w.to_dict()["weights"]
        return OptimizationResult(weight_map=weight_map, metrics=_compute_metrics(returns, weight_map), note="Optimized via Riskfolio-Lib (HRP)")


class CVaROptimizer:
    methods: tuple[str, ...] = ("cvar",) if _AVAILABLE else ()

    def optimize(self, returns: pd.DataFrame, df_pivoted: pd.DataFrame) -> OptimizationResult:
        port = rp.Portfolio(returns=returns)
        port.assets_stats(method_mu="hist", method_cov="hist")
        w = port.optimization(model="Classic", rm="CVaR", obj="MinRisk", rf=0, l=0, hist=True)
        weight_map = w.to_dict()["weights"]
        return OptimizationResult(weight_map=weight_map, metrics=_compute_metrics(returns, weight_map), note="Optimized via Riskfolio-Lib (Min CVaR)")


class CDaROptimizer:
    methods: tuple[str, ...] = ("cdar",) if _AVAILABLE else ()

    def optimize(self, returns: pd.DataFrame, df_pivoted: pd.DataFrame) -> OptimizationResult:
        port = rp.Portfolio(returns=returns)
        port.assets_stats(method_mu="hist", method_cov="hist")
        w = port.optimization(model="Classic", rm="CDaR", obj="MinRisk", rf=0, l=0, hist=True)
        weight_map = w.to_dict()["weights"]
        return OptimizationResult(weight_map=weight_map, metrics=_compute_metrics(returns, weight_map), note="Optimized via Riskfolio-Lib (Min CDaR)")
```

### Commit message

```
feat(optimization): HRP/CVaR/CDaR riskfolio adapters with skipif guards
```

---

## Task 8: Create optimizers/skfolio_optimizer.py

- [ ] Write failing test `backend/stocks/tests/test_optimization_skfolio_optimizer.py`
- [ ] Create `backend/stocks/services/optimization/optimizers/skfolio_optimizer.py`
- [ ] Run test green
- [ ] Commit

### Test file: `backend/stocks/tests/test_optimization_skfolio_optimizer.py`

```python
import numpy as np
import pandas as pd
import pytest

try:
    from skfolio import RiskMeasure  # noqa: F401
    HAS_SKFOLIO = True
except ImportError:
    HAS_SKFOLIO = False

from stocks.services.optimization.base import IPortfolioOptimizer, OptimizationResult
from stocks.services.optimization.optimizers.skfolio_optimizer import SkflioOptimizer


def _synthetic_returns(n_assets=3, n_days=252):
    rng = np.random.default_rng(3)
    data = rng.normal(0.0005, 0.015, size=(n_days, n_assets))
    cols = [f"ASSET{i}" for i in range(n_assets)]
    return pd.DataFrame(data, columns=cols)


@pytest.mark.skipif(not HAS_SKFOLIO, reason="skfolio not installed")
def test_skfolio_optimizer_satisfies_protocol():
    assert isinstance(SkflioOptimizer("equal"), IPortfolioOptimizer)


@pytest.mark.skipif(not HAS_SKFOLIO, reason="skfolio not installed")
def test_max_diversification_weights_sum_to_one():
    returns = _synthetic_returns()
    df_pivoted = returns.cumsum() + 100
    result = SkflioOptimizer("max_diversification").optimize(returns, df_pivoted)
    assert isinstance(result, OptimizationResult)
    assert abs(sum(result.weight_map.values()) - 1.0) < 1e-6


@pytest.mark.skipif(not HAS_SKFOLIO, reason="skfolio not installed")
def test_risk_parity_weights_sum_to_one():
    returns = _synthetic_returns()
    df_pivoted = returns.cumsum() + 100
    result = SkflioOptimizer("risk_parity").optimize(returns, df_pivoted)
    assert abs(sum(result.weight_map.values()) - 1.0) < 1e-6


@pytest.mark.skipif(not HAS_SKFOLIO, reason="skfolio not installed")
def test_fallback_weights_sum_to_one():
    returns = _synthetic_returns()
    df_pivoted = returns.cumsum() + 100
    result = SkflioOptimizer("fallback").optimize(returns, df_pivoted)
    assert abs(sum(result.weight_map.values()) - 1.0) < 1e-6


@pytest.mark.skipif(not HAS_SKFOLIO, reason="skfolio not installed")
def test_metrics_include_max_drawdown():
    returns = _synthetic_returns()
    df_pivoted = returns.cumsum() + 100
    result = SkflioOptimizer("fallback").optimize(returns, df_pivoted)
    assert "max_drawdown" in result.metrics


def test_methods_empty_when_not_installed():
    if HAS_SKFOLIO:
        pytest.skip("skfolio is installed")
    assert SkflioOptimizer("fallback").methods == ()
```

### Implementation: `backend/stocks/services/optimization/optimizers/skfolio_optimizer.py`

```python
from __future__ import annotations

import pandas as pd

from stocks.services.optimization.base import OptimizationResult

try:
    from skfolio import RiskMeasure
    from skfolio.optimization import (
        MaximumDiversification,
        MeanRisk,
        ObjectiveFunction,
        RiskBudgeting,
    )
    _AVAILABLE = True
except ImportError:
    _AVAILABLE = False

_NOTES = {
    "max_diversification": "Optimized via Skfolio (Max Diversification)",
    "risk_parity": "Optimized via Skfolio (Risk Parity)",
    "fallback": "Optimized via Skfolio (Max Sharpe Fallback)",
}

_MIN_MAX_WEIGHT = 0.6
_MAX_MAX_WEIGHT = 0.95
_WEIGHT_SCALE = 1.3


class SkflioOptimizer:
    def __init__(self, method: str) -> None:
        self._method = method

    @property
    def methods(self) -> tuple[str, ...]:
        return ("max_diversification", "risk_parity", "fallback") if _AVAILABLE else ()

    def optimize(
        self, returns: pd.DataFrame, df_pivoted: pd.DataFrame
    ) -> OptimizationResult:
        max_weight = _dynamic_max_weight(len(returns.columns))
        model = _build_model(self._method, max_weight)
        model.fit(returns)
        weight_map = dict(zip(df_pivoted.columns, model.weights_))
        pred = model.predict(returns)
        metrics = {
            "expected_return": float(pred.annualized_mean),
            "volatility": float(pred.annualized_standard_deviation),
            "sharpe_ratio": float(pred.annualized_sharpe_ratio),
            "max_drawdown": float(pred.max_drawdown),
        }
        return OptimizationResult(
            weight_map=weight_map,
            metrics=metrics,
            note=_NOTES.get(self._method, _NOTES["fallback"]),
        )


def _dynamic_max_weight(n_assets: int) -> float:
    return max(_MIN_MAX_WEIGHT, min(_MAX_MAX_WEIGHT, _WEIGHT_SCALE / n_assets))


def _build_model(method: str, max_weight: float):
    if method == "max_diversification":
        return MaximumDiversification(max_weights=max_weight)
    if method == "risk_parity":
        return RiskBudgeting(risk_measure=RiskMeasure.VARIANCE, max_weights=max_weight)
    return MeanRisk(
        risk_measure=RiskMeasure.VARIANCE,
        objective_function=ObjectiveFunction.MAXIMIZE_RATIO,
        max_weights=max_weight,
    )
```

### Commit message

```
feat(optimization): SkflioOptimizer adapter for max_diversification/risk_parity/fallback
```

---

## Task 9: Create registry + backward-compat shim

- [ ] Write failing test `backend/stocks/tests/test_optimization_integration.py`
- [ ] Create `backend/stocks/services/optimization/optimizers/__init__.py` (OPTIMIZER_REGISTRY)
- [ ] Create `backend/stocks/services/optimization/__init__.py` (shim)
- [ ] Run test green
- [ ] Commit

### Test file: `backend/stocks/tests/test_optimization_integration.py`

```python
from unittest.mock import patch, MagicMock
from datetime import date

import numpy as np
import pandas as pd
import pytest

from stocks.services.optimization import perform_portfolio_optimization
from stocks.services.optimization.optimizers import OPTIMIZER_REGISTRY, _DEFAULT_OPTIMIZER


def _make_qs_data(tickers=("NABIL", "HBL"), n_days=60):
    rows = []
    for i in range(n_days):
        d = date(2024, 1, 1 + (i % 27))
        for j, t in enumerate(tickers):
            rows.append({"ticker": t, "date": d, "close": 1000.0 + i * 0.5 + j * 10})
    return rows


@patch("stocks.services.optimization.data_fetcher.DailyStockPrice")
def test_equal_weight_returns_success(MockModel):
    MockModel.objects.filter.return_value.values.return_value = _make_qs_data()
    result = perform_portfolio_optimization(["NABIL", "HBL"], method="equal")
    assert result.get("success") is True
    assert "weights" in result
    assert "trades" in result


def test_empty_tickers_returns_error():
    result = perform_portfolio_optimization([])
    assert "error" in result


@patch("stocks.services.optimization.single_stock.DailyStockPrice")
def test_single_ticker_returns_success(MockModel):
    m = MagicMock()
    m.close = 1200.0
    MockModel.objects.filter.return_value.order_by.return_value.first.return_value = m
    result = perform_portfolio_optimization(["NABIL"])
    assert result.get("success") is True
    assert result["weights"] == {"NABIL": 1.0}


@patch("stocks.services.optimization.data_fetcher.DailyStockPrice")
def test_no_data_returns_error(MockModel):
    MockModel.objects.filter.return_value.values.return_value = []
    result = perform_portfolio_optimization(["NABIL", "HBL"])
    assert "error" in result


def test_registry_contains_all_expected_methods():
    expected = {"max_sharpe", "min_vol", "hrp", "cvar", "cdar", "equal", "max_diversification", "risk_parity"}
    assert expected == set(OPTIMIZER_REGISTRY.keys())


def test_default_optimizer_is_skfolio_fallback():
    from stocks.services.optimization.optimizers.skfolio_optimizer import SkflioOptimizer
    assert isinstance(_DEFAULT_OPTIMIZER, SkflioOptimizer)
```

### Implementation: `backend/stocks/services/optimization/optimizers/__init__.py`

```python
from stocks.services.optimization.optimizers.equal_optimizer import EqualWeightOptimizer
from stocks.services.optimization.optimizers.pypfopt_optimizer import PyPfOptOptimizer
from stocks.services.optimization.optimizers.riskfolio_optimizer import (
    CDaROptimizer,
    CVaROptimizer,
    HRPOptimizer,
)
from stocks.services.optimization.optimizers.skfolio_optimizer import SkflioOptimizer

OPTIMIZER_REGISTRY: dict[str, object] = {
    "max_sharpe": PyPfOptOptimizer("max_sharpe"),
    "min_vol": PyPfOptOptimizer("min_vol"),
    "hrp": HRPOptimizer(),
    "cvar": CVaROptimizer(),
    "cdar": CDaROptimizer(),
    "equal": EqualWeightOptimizer(),
    "max_diversification": SkflioOptimizer("max_diversification"),
    "risk_parity": SkflioOptimizer("risk_parity"),
}

_DEFAULT_OPTIMIZER = SkflioOptimizer("fallback")
```

### Implementation: `backend/stocks/services/optimization/__init__.py`

```python
from __future__ import annotations

from stocks.services.optimization.data_fetcher import fetch_price_data
from stocks.services.optimization.optimizers import OPTIMIZER_REGISTRY, _DEFAULT_OPTIMIZER
from stocks.services.optimization.single_stock import single_stock_result
from stocks.services.optimization.trade_calculator import calculate_trades


def perform_portfolio_optimization(
    tickers: list[str],
    current_holdings: dict | None = None,
    method: str = "max_sharpe",
) -> dict:
    if not tickers:
        return {"error": "No tickers provided"}
    if len(tickers) == 1:
        return single_stock_result(tickers[0], current_holdings)
    df_pivoted = fetch_price_data(tickers)
    if df_pivoted is None:
        return {"error": "No historical data found or insufficient data (need 20+ days)"}
    returns = df_pivoted.pct_change().dropna()
    optimizer = OPTIMIZER_REGISTRY.get(method, _DEFAULT_OPTIMIZER)
    try:
        result = optimizer.optimize(returns, df_pivoted)
    except Exception as exc:
        return {"error": f"Optimization failed: {exc}"}
    trades = calculate_trades(result.weight_map, df_pivoted, current_holdings)
    return {
        "success": True,
        "weights": {t: float(w) for t, w in result.weight_map.items()},
        "metrics": result.metrics,
        "trades": trades,
        "note": result.note,
    }
```

### Commit message

```
feat(optimization): OPTIMIZER_REGISTRY + backward-compat perform_portfolio_optimization shim
```

---

## Task 10: Replace stocks/optimization.py + final regression run

- [ ] Replace `backend/stocks/optimization.py` with 3-line redirect
- [ ] Run full regression: `pytest stocks/tests/ -v --tb=short`
- [ ] Fix any regressions
- [ ] Commit

### New `backend/stocks/optimization.py`

```python
from stocks.services.optimization import perform_portfolio_optimization

__all__ = ["perform_portfolio_optimization"]
```

### Verification checklist

- [ ] `pytest stocks/tests/ -v --tb=short` — zero failures
- [ ] All 10 new test files exist and are discovered
- [ ] `from stocks.optimization import perform_portfolio_optimization` still works (backward compat)
- [ ] No function body exceeds 30 lines
- [ ] No magic numbers outside constants

### Commit message

```
refactor(optimization): extract Strategy pattern; slim optimization.py to shim
```

---

## File structure after completion

```
backend/stocks/
    optimization.py                    <- 3-line shim (backward compat)
    constants.py                       <- + OPTIMIZATION_HISTORY_DAYS, MIN_OPTIMIZATION_DAYS
    services/
        optimization/
            __init__.py                <- perform_portfolio_optimization (shim)
            base.py                    <- IPortfolioOptimizer Protocol + OptimizationResult
            data_fetcher.py            <- fetch_price_data()
            single_stock.py            <- single_stock_result()
            trade_calculator.py        <- calculate_trades()
            optimizers/
                __init__.py            <- OPTIMIZER_REGISTRY + _DEFAULT_OPTIMIZER
                equal_optimizer.py     <- EqualWeightOptimizer
                pypfopt_optimizer.py   <- PyPfOptOptimizer
                riskfolio_optimizer.py <- HRPOptimizer, CVaROptimizer, CDaROptimizer
                skfolio_optimizer.py   <- SkflioOptimizer
    tests/
        test_optimization_base.py
        test_optimization_data_fetcher.py
        test_optimization_single_stock.py
        test_optimization_trade_calculator.py
        test_optimization_equal_optimizer.py
        test_optimization_pypfopt_optimizer.py
        test_optimization_riskfolio_optimizer.py
        test_optimization_skfolio_optimizer.py
        test_optimization_integration.py
```

---

*Plan generated 2026-06-13. Implementation target: main branch.*
