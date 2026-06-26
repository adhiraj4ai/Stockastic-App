# Accumulation Trading Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship an end-to-end "Accumulation Trading" feature that scans NEPSE for the large-player accumulation setup, ranks candidates by a composite strength score, backtests/validates the underlying strategy, and lets the user place paper trades via propose-and-confirm.

**Architecture:** A single `AccumulationScoreService` computes a 0–100 composite score from three factors (broker concentration, sustained accumulation + price coiling, breakout confirmation), with all broker-derived series lagged one bar to kill look-ahead bias. That service feeds (a) a new `AccumulationStrength` Alpha that runs through the existing backtest harness / ScoreCard, and (b) a daily Celery scanner that persists ranked `AccumulationCandidate` rows for a propose-and-confirm UI. Factor weights are calibrated offline with Optuna (scope=ALL, one global set) and gated on an out-of-sample ScoreCard.

**Tech Stack:** Django 5.2 + DRF, PostgreSQL (port 5434), Celery + beat, `backtesting.py`, Optuna, pandas/numpy; Next.js 16 + React 19 + Tailwind + shadcn/ui; pytest (backend), vitest (frontend).

## Global Constraints

- **SOLID + clean code:** every function ≤ 30 lines; one responsibility per module/function; no magic numbers (extract named constants); early returns over nesting; delete dead code.
- **TDD mandatory:** red → green → refactor. No implementation code without a failing test first.
- **1-bar lag:** every broker-derived series MUST be `.shift(1)` before it touches a price bar (backtest and live scan). Price-only series (breakout) may use bar D.
- **`cumulative_net` is a signed running LEVEL** — never difference it into daily flow; read as a level, use slope for "rising".
- **Concentration over net-buyers only:** denominator = sum of strictly-positive `cumulative_net` (avoids signed-share blow-up).
- **Shared liquidity floor:** the same turnover + min-active-brokers gate is applied in BOTH calibration and the live scan.
- **Global (not per-symbol) weights:** calibration uses `scope='ALL'` → one weight/threshold set.
- **Number formatting (frontend):** use `lib/numbers` / `lib/formatters` — never format API decimals ad hoc.
- **UI rules:** sidebar-only nav, full-width, warm sans, sentence-case labels; no all-caps, no monospace/terminal aesthetic.
- **Validation gating:** if the OOS ScoreCard fails, the feature still ships but candidates are marked `research` and the "Place paper trade" action is disabled.
- **DB tests run in Docker:** `docker-compose exec -T backend pytest <path>` (local venv lacks the `postgres` role on 5432). Conftest auto-creates the unmanaged market tables.
- **Branch:** create `feat/accumulation-trading` off `main` before Task 1 (current branch `feat/paper-trading-realism` holds unrelated WIP).

---

### Task 0: Branch setup

**Files:** none (git only)

- [ ] **Step 1: Create the feature branch**

```bash
git checkout main
git pull --ff-only
git checkout -b feat/accumulation-trading
```

- [ ] **Step 2: Verify clean baseline**

Run: `git status`
Expected: on `feat/accumulation-trading`, no unrelated staged changes.

---

### Task 1: Shared broker-flow loader with 1-bar lag

The single place broker accumulation data is loaded, pivoted, top-N selected, and **lagged**. Both the score service and (later) the Alpha consume it. This is where the look-ahead fix lives, once.

**Files:**
- Create: `backend/stocks/services/accumulation/__init__.py`
- Create: `backend/stocks/services/accumulation/flow.py`
- Test: `backend/stocks/tests/test_accumulation_flow.py`

**Interfaces:**
- Produces:
  - `@dataclass BrokerFlow: top_sum: pd.Series; pivot: pd.DataFrame` (both DatetimeIndex-aligned to the passed `dates`, already lagged).
  - `load_broker_flow(symbol: str, dates: pd.DatetimeIndex, top_n: int = 5, lag: int = 1) -> BrokerFlow`
  - `LAG_BARS = 1` (module constant).

- [ ] **Step 1: Write the failing test**

```python
# backend/stocks/tests/test_accumulation_flow.py
import numpy as np
import pandas as pd
import pytest

from stocks.models import DailyCumulativeAccumulation
from stocks.services.accumulation.flow import load_broker_flow, BrokerFlow


def _seed_dca(symbol, dates, per_broker_net):
    """per_broker_net: {entity_id: [net level per date]}."""
    for entity_id, levels in per_broker_net.items():
        for d, net in zip(dates, levels):
            DailyCumulativeAccumulation.objects.create(
                symbol=symbol, transaction_date=d.date(), entity_id=entity_id,
                cumulative_buy=max(net, 0), cumulative_sell=max(-net, 0),
                cumulative_buy_amount=0, cumulative_sell_amount=0, cumulative_net=net,
            )


@pytest.mark.django_db
def test_load_broker_flow_lags_one_bar_and_sums_top_n():
    dates = pd.date_range("2021-01-01", periods=5, freq="D")
    # Broker "1" accumulates hard; "2" mild; "3" net seller.
    _seed_dca("AAA", dates, {"1": [10, 20, 30, 40, 50],
                             "2": [5, 6, 7, 8, 9],
                             "3": [-1, -2, -3, -4, -5]})
    flow = load_broker_flow("AAA", dates, top_n=2, lag=1)
    assert isinstance(flow, BrokerFlow)
    # top-2 by latest level = brokers "1" and "2"; summed level = [15,26,37,48,59]
    # after shift(1): first bar NaN->0, then prior day's value.
    assert list(flow.top_sum.values) == [0.0, 15.0, 26.0, 37.0, 48.0]
    assert list(flow.top_sum.index) == list(dates)


@pytest.mark.django_db
def test_load_broker_flow_empty_symbol_returns_zeros():
    dates = pd.date_range("2021-01-01", periods=3, freq="D")
    flow = load_broker_flow("NOPE", dates, top_n=5)
    assert list(flow.top_sum.values) == [0.0, 0.0, 0.0]
    assert flow.pivot.empty is False  # zero-filled frame aligned to dates
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker-compose exec -T backend pytest stocks/tests/test_accumulation_flow.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'stocks.services.accumulation.flow'`

- [ ] **Step 3: Write minimal implementation**

```python
# backend/stocks/services/accumulation/__init__.py
```

```python
# backend/stocks/services/accumulation/flow.py
"""Shared broker-accumulation loader. Single home for the 1-bar look-ahead lag."""
from dataclasses import dataclass

import numpy as np
import pandas as pd

LAG_BARS = 1


@dataclass
class BrokerFlow:
    """Lagged, date-aligned broker accumulation for one symbol."""
    top_sum: pd.Series   # summed cumulative_net level of the top-N brokers
    pivot: pd.DataFrame  # per-broker cumulative_net level (all brokers)


def _empty_flow(dates):
    return BrokerFlow(
        top_sum=pd.Series(np.zeros(len(dates)), index=dates),
        pivot=pd.DataFrame(0.0, index=dates, columns=[]),
    )


def _aligned_pivot(qs, dates, lag):
    df = pd.DataFrame(list(qs))
    df["transaction_date"] = pd.to_datetime(df["transaction_date"])
    pivot = df.pivot_table(index="transaction_date", columns="entity_id",
                           values="cumulative_net", aggfunc="last").ffill().fillna(0)
    return pivot.reindex(dates).ffill().fillna(0).shift(lag).fillna(0)


def load_broker_flow(symbol, dates, top_n=5, lag=LAG_BARS):
    """Top-N brokers' summed cumulative_net level, lagged `lag` bars onto `dates`."""
    from stocks.models import DailyCumulativeAccumulation
    qs = DailyCumulativeAccumulation.objects.filter(symbol=symbol).values(
        "transaction_date", "entity_id", "cumulative_net")
    if not qs:
        return _empty_flow(dates)
    pivot = _aligned_pivot(qs, dates, lag)
    top = pivot.iloc[-1].sort_values(ascending=False).head(top_n).index
    return BrokerFlow(top_sum=pivot[top].sum(axis=1).astype(float), pivot=pivot)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `docker-compose exec -T backend pytest stocks/tests/test_accumulation_flow.py -v`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/stocks/services/accumulation/__init__.py backend/stocks/services/accumulation/flow.py backend/stocks/tests/test_accumulation_flow.py
git commit -m "feat(accumulation): shared broker-flow loader with 1-bar look-ahead lag"
```

---

### Task 2: AccumulationScoreService — factors and composite score

The single source of truth for the 0–100 score, as a vectorized series aligned to a price index. Each factor is its own ≤30-line function.

**Files:**
- Create: `backend/stocks/services/accumulation/score_service.py`
- Test: `backend/stocks/tests/test_accumulation_score_service.py`

**Interfaces:**
- Consumes: `load_broker_flow`, `BrokerFlow` (Task 1).
- Produces:
  - `@dataclass ScoreParams: top_n:int=5; w_concentration:float=1.0; w_coiling:float=1.0; w_breakout:float=1.0; conc_lookback:int=10; coil_lookback:int=20; breakout_lookback:int=20`
  - `concentration_factor(pivot: pd.DataFrame, top_sum: pd.Series, lookback: int) -> pd.Series` (0–1)
  - `coiling_factor(top_sum: pd.Series, price_df: pd.DataFrame, lookback: int) -> pd.Series` (0–1)
  - `breakout_factor(price_df: pd.DataFrame, lookback: int) -> pd.Series` (0–1)
  - `AccumulationScoreService.score_series(symbol: str, price_df: pd.DataFrame, params: ScoreParams|None=None) -> pd.Series` (0–100, aligned to `price_df.index`)
  - `AccumulationScoreService.factor_breakdown(symbol: str, price_df: pd.DataFrame, params: ScoreParams|None=None) -> dict` (latest F1/F2/F3/score floats)
  - `AccumulationScoreService.distribution_flipping(symbol: str, price_df: pd.DataFrame, params: ScoreParams|None=None) -> pd.Series[bool]` (top_sum slope < 0)

- [ ] **Step 1: Write the failing test**

```python
# backend/stocks/tests/test_accumulation_score_service.py
import numpy as np
import pandas as pd
import pytest

from stocks.services.accumulation.score_service import (
    ScoreParams, concentration_factor, coiling_factor, breakout_factor,
)


def _price_df(closes):
    idx = pd.date_range("2021-01-01", periods=len(closes), freq="D")
    c = np.array(closes, dtype=float)
    return pd.DataFrame({"Open": c, "High": c * 1.01, "Low": c * 0.99,
                         "Close": c, "Volume": np.full(len(c), 1000.0)}, index=idx)


def test_concentration_factor_is_top3_share_of_net_buyers_when_rising():
    idx = pd.date_range("2021-01-01", periods=4, freq="D")
    # 3 big buyers (90 of 100 positive net) + a seller (ignored in denominator).
    pivot = pd.DataFrame(
        {"1": [10, 20, 30, 40], "2": [10, 20, 30, 30], "3": [5, 10, 20, 20],
         "4": [1, 1, 1, 1], "5": [-9, -9, -9, -9]}, index=idx)
    top_sum = pivot[["1", "2", "3"]].sum(axis=1)  # strictly rising -> gate open
    f = concentration_factor(pivot, top_sum, lookback=2)
    # last bar: top-3 positive = 40+30+20=90; all positive = 90+1=91 -> ~0.989
    assert f.iloc[-1] == pytest.approx(90 / 91, abs=1e-3)


def test_concentration_factor_zero_when_flow_not_rising():
    idx = pd.date_range("2021-01-01", periods=4, freq="D")
    pivot = pd.DataFrame({"1": [40, 40, 40, 40], "2": [10, 10, 10, 10]}, index=idx)
    top_sum = pivot.sum(axis=1)  # flat -> slope 0, gate closed
    f = concentration_factor(pivot, top_sum, lookback=2)
    assert f.iloc[-1] == 0.0


def test_coiling_factor_high_when_accum_rising_and_price_flat():
    closes = [100.0] * 30  # dead flat -> compressed vol, range-bound
    top_sum = pd.Series(np.arange(30, dtype=float), index=_price_df(closes).index)
    f = coiling_factor(top_sum, _price_df(closes), lookback=20)
    assert f.iloc[-1] > 0.5


def test_breakout_factor_fires_on_new_high():
    closes = [100.0] * 20 + [110.0]  # day 21 breaks the 20-day high
    f = breakout_factor(_price_df(closes), lookback=20)
    assert f.iloc[-1] == 1.0
    assert f.iloc[-2] == 0.0
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker-compose exec -T backend pytest stocks/tests/test_accumulation_score_service.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'stocks.services.accumulation.score_service'`

- [ ] **Step 3: Write minimal implementation**

```python
# backend/stocks/services/accumulation/score_service.py
"""Composite 0-100 accumulation strength score. Single source of truth."""
from dataclasses import dataclass

import numpy as np
import pandas as pd

from stocks.services.accumulation.flow import load_broker_flow

SCORE_MAX = 100.0
TOP_CONCENTRATION_N = 3
SLOPE_WINDOW_MIN = 2


@dataclass
class ScoreParams:
    top_n: int = 5
    w_concentration: float = 1.0
    w_coiling: float = 1.0
    w_breakout: float = 1.0
    conc_lookback: int = 10
    coil_lookback: int = 20
    breakout_lookback: int = 20


def _rising(series, lookback):
    """Boolean series: level higher than `lookback` bars ago (accumulation rising)."""
    return series > series.shift(max(lookback, SLOPE_WINDOW_MIN))


def concentration_factor(pivot, top_sum, lookback):
    """Top-3 share of net-buyers' positive cumulative_net, gated on rising flow."""
    if pivot.empty:
        return pd.Series(0.0, index=top_sum.index)
    positive = pivot.clip(lower=0)
    total_pos = positive.sum(axis=1).replace(0, np.nan)
    top3 = positive.apply(lambda row: row.nlargest(TOP_CONCENTRATION_N).sum(), axis=1)
    share = (top3 / total_pos).fillna(0).clip(0, 1)
    return (share * _rising(top_sum, lookback).astype(float)).fillna(0)


def coiling_factor(top_sum, price_df, lookback):
    """Accumulation rising AND volatility compressed AND price range-bound."""
    close = price_df["Close"]
    vol = close.rolling(lookback).std()
    vol_compressed = (vol <= vol.rolling(lookback).min() * 1.05).astype(float)
    rng = (close.rolling(lookback).max() - close.rolling(lookback).min()) / close
    range_bound = (rng < rng.rolling(lookback).median()).astype(float)
    rising = _rising(top_sum, lookback).astype(float)
    return ((vol_compressed + range_bound + rising) / 3.0).fillna(0)


def breakout_factor(price_df, lookback):
    """1.0 when close crosses above the prior `lookback`-bar high."""
    close = price_df["Close"]
    prior_high = close.shift(1).rolling(lookback).max()
    return (close > prior_high).astype(float).fillna(0)


class AccumulationScoreService:
    """Combines the three factors into a single 0-100 score series."""

    @staticmethod
    def _normalized_weights(p):
        raw = np.array([p.w_concentration, p.w_coiling, p.w_breakout], dtype=float)
        total = raw.sum()
        return raw / total if total > 0 else np.array([1 / 3, 1 / 3, 1 / 3])

    @staticmethod
    def score_series(symbol, price_df, params=None):
        p = params or ScoreParams()
        flow = load_broker_flow(symbol, price_df.index, top_n=p.top_n)
        f1 = concentration_factor(flow.pivot, flow.top_sum, p.conc_lookback)
        f2 = coiling_factor(flow.top_sum, price_df, p.coil_lookback)
        f3 = breakout_factor(price_df, p.breakout_lookback)
        w = AccumulationScoreService._normalized_weights(p)
        composite = w[0] * f1 + w[1] * f2 + w[2] * f3
        return (composite * SCORE_MAX).clip(0, SCORE_MAX).fillna(0)

    @staticmethod
    def factor_breakdown(symbol, price_df, params=None):
        p = params or ScoreParams()
        flow = load_broker_flow(symbol, price_df.index, top_n=p.top_n)
        f1 = concentration_factor(flow.pivot, flow.top_sum, p.conc_lookback)
        f2 = coiling_factor(flow.top_sum, price_df, p.coil_lookback)
        f3 = breakout_factor(price_df, p.breakout_lookback)
        score = AccumulationScoreService.score_series(symbol, price_df, p)
        return {"concentration": float(f1.iloc[-1]), "coiling": float(f2.iloc[-1]),
                "breakout": float(f3.iloc[-1]), "score": float(score.iloc[-1])}

    @staticmethod
    def distribution_flipping(symbol, price_df, params=None):
        p = params or ScoreParams()
        flow = load_broker_flow(symbol, price_df.index, top_n=p.top_n)
        return (flow.top_sum < flow.top_sum.shift(p.conc_lookback)).fillna(False)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `docker-compose exec -T backend pytest stocks/tests/test_accumulation_score_service.py -v`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/stocks/services/accumulation/score_service.py backend/stocks/tests/test_accumulation_score_service.py
git commit -m "feat(accumulation): composite 0-100 score service (concentration/coiling/breakout)"
```

---

### Task 3: Liquidity floor (shared by calibration and scan)

**Files:**
- Create: `backend/stocks/services/accumulation/universe.py`
- Test: `backend/stocks/tests/test_accumulation_universe.py`

**Interfaces:**
- Produces:
  - Constants `MIN_MEDIAN_TURNOVER = 500_000.0`, `MIN_ACTIVE_BROKERS = 5`, `TURNOVER_LOOKBACK_DAYS = 30`.
  - `passes_liquidity_floor(symbol: str, as_of: date, min_turnover: float=MIN_MEDIAN_TURNOVER, min_brokers: int=MIN_ACTIVE_BROKERS) -> bool`
  - `liquid_universe(as_of: date) -> list[str]`

- [ ] **Step 1: Write the failing test**

```python
# backend/stocks/tests/test_accumulation_universe.py
from datetime import date

import pytest

from stocks.models import DailyCumulativeAccumulation
from stocks.models.market import DailyStockPrice
from stocks.services.accumulation.universe import passes_liquidity_floor


def _seed_price(symbol, d, close, volume):
    DailyStockPrice.objects.create(ticker=symbol, date=d, open=close, high=close,
                                   low=close, close=close, volume=volume)


@pytest.mark.django_db
def test_illiquid_symbol_fails_floor():
    d = date(2021, 1, 4)
    _seed_price("THIN", d, close=100, volume=10)  # turnover 1000 << floor
    DailyCumulativeAccumulation.objects.create(
        symbol="THIN", transaction_date=d, entity_id="1",
        cumulative_buy=1, cumulative_sell=0, cumulative_buy_amount=0,
        cumulative_sell_amount=0, cumulative_net=1)
    assert passes_liquidity_floor("THIN", d) is False


@pytest.mark.django_db
def test_liquid_symbol_with_enough_brokers_passes():
    d = date(2021, 1, 4)
    _seed_price("FAT", d, close=1000, volume=100_000)  # turnover 100M
    for i in range(6):
        DailyCumulativeAccumulation.objects.create(
            symbol="FAT", transaction_date=d, entity_id=str(i),
            cumulative_buy=1, cumulative_sell=0, cumulative_buy_amount=0,
            cumulative_sell_amount=0, cumulative_net=1)
    assert passes_liquidity_floor("FAT", d) is True
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker-compose exec -T backend pytest stocks/tests/test_accumulation_universe.py -v`
Expected: FAIL with `ModuleNotFoundError`

- [ ] **Step 3: Write minimal implementation**

```python
# backend/stocks/services/accumulation/universe.py
"""Shared liquidity floor — identical gate for calibration and live scan."""
from datetime import timedelta

import numpy as np

from django.db.models import Count

MIN_MEDIAN_TURNOVER = 500_000.0
MIN_ACTIVE_BROKERS = 5
TURNOVER_LOOKBACK_DAYS = 30


def _median_turnover(symbol, as_of):
    from stocks.models.market import DailyStockPrice
    start = as_of - timedelta(days=TURNOVER_LOOKBACK_DAYS)
    rows = DailyStockPrice.objects.filter(
        ticker=symbol, date__range=[start, as_of]).values_list("close", "volume")
    turnovers = [float(c) * float(v) for c, v in rows if c and v]
    return float(np.median(turnovers)) if turnovers else 0.0


def _active_broker_count(symbol, as_of):
    from stocks.models import DailyCumulativeAccumulation
    return (DailyCumulativeAccumulation.objects
            .filter(symbol=symbol, transaction_date=as_of)
            .values("entity_id").distinct().count())


def passes_liquidity_floor(symbol, as_of, min_turnover=MIN_MEDIAN_TURNOVER,
                           min_brokers=MIN_ACTIVE_BROKERS):
    if _median_turnover(symbol, as_of) < min_turnover:
        return False
    return _active_broker_count(symbol, as_of) >= min_brokers


def liquid_universe(as_of):
    from stocks.models import DailyCumulativeAccumulation
    symbols = (DailyCumulativeAccumulation.objects
               .filter(transaction_date=as_of).values_list("symbol", flat=True).distinct())
    return [s for s in symbols if passes_liquidity_floor(s, as_of)]
```

- [ ] **Step 4: Run test to verify it passes**

Run: `docker-compose exec -T backend pytest stocks/tests/test_accumulation_universe.py -v`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/stocks/services/accumulation/universe.py backend/stocks/tests/test_accumulation_universe.py
git commit -m "feat(accumulation): shared liquidity floor (turnover + active-broker gate)"
```

---

### Task 4: AccumulationStrength Alpha + registry registration

Wraps the score service as a backtestable Alpha so it flows through the existing harness unchanged. Entry = score ≥ threshold; exit = distribution flip.

**Files:**
- Modify: `backend/stocks/services/strategy_framework/library.py` (append the class near the other accumulation alphas, ~line 205)
- Modify: `backend/stocks/services/strategy_framework/registry.py` (add `_reg(...)` near line 177, after AccumulationMaCross)
- Test: `backend/stocks/tests/test_accumulation_alpha.py`

**Interfaces:**
- Consumes: `AccumulationScoreService.score_series`, `.distribution_flipping` (Task 2); `build_strategy`, `Alpha`, `stops.AtrTrail` (existing framework).
- Produces: `library.AccumulationStrength(symbol, top_n=5, entry_threshold=70, w_concentration=1.0, w_coiling=1.0, w_breakout=1.0, conc_lookback=10, coil_lookback=20, breakout_lookback=20)` registered under `REGISTRY["AccumulationStrength"]`.

- [ ] **Step 1: Write the failing test**

```python
# backend/stocks/tests/test_accumulation_alpha.py
import numpy as np
import pandas as pd
import pytest
from backtesting import Backtest

from stocks.models import DailyCumulativeAccumulation
from stocks.services.strategy_framework import build_strategy
from stocks.services.strategy_framework import library as L
from stocks.services.strategy_framework.registry import REGISTRY


def _seed_breakout_setup(symbol, dates):
    # Strong, rising concentration in one broker; price coils then breaks out.
    for i, d in enumerate(dates):
        DailyCumulativeAccumulation.objects.create(
            symbol=symbol, transaction_date=d.date(), entity_id="1",
            cumulative_buy=i + 1, cumulative_sell=0, cumulative_buy_amount=0,
            cumulative_sell_amount=0, cumulative_net=i + 1)


def _coiling_then_breakout_df(n=60):
    idx = pd.date_range("2021-01-01", periods=n, freq="D")
    closes = np.concatenate([np.full(n - 5, 100.0), np.linspace(101, 140, 5)])
    return pd.DataFrame({"Open": closes, "High": closes * 1.01, "Low": closes * 0.99,
                         "Close": closes, "Volume": np.full(n, 5000.0)}, index=idx)


@pytest.mark.django_db
def test_accumulation_strength_alpha_trades_on_setup():
    df = _coiling_then_breakout_df()
    _seed_breakout_setup("AAA", df.index)
    strat = build_strategy(alpha=L.AccumulationStrength(symbol="AAA", entry_threshold=30),
                           name="AccTest")
    stats = Backtest(df, strat, cash=1_000_000, commission=.002,
                     exclusive_orders=True).run()
    assert stats["# Trades"] > 0


def test_accumulation_strength_is_registered():
    assert "AccumulationStrength" in REGISTRY
    assert REGISTRY["AccumulationStrength"]["needs_symbol"] is True
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker-compose exec -T backend pytest stocks/tests/test_accumulation_alpha.py -v`
Expected: FAIL with `AttributeError: module 'stocks...library' has no attribute 'AccumulationStrength'`

- [ ] **Step 3a: Add the Alpha to library.py** (after `AccumulationMaCross`, ~line 205)

```python
class AccumulationStrength(Alpha):
    """Composite accumulation-strength alpha: enter when the 0-100 score clears a
    threshold; exit when the top brokers start distributing (flow slope turns down)."""

    def __init__(self, symbol, top_n=5, entry_threshold=70,
                 w_concentration=1.0, w_coiling=1.0, w_breakout=1.0,
                 conc_lookback=10, coil_lookback=20, breakout_lookback=20):
        self.symbol, self.entry_threshold = symbol, entry_threshold
        self._params = dict(top_n=top_n, w_concentration=w_concentration,
                            w_coiling=w_coiling, w_breakout=w_breakout,
                            conc_lookback=conc_lookback, coil_lookback=coil_lookback,
                            breakout_lookback=breakout_lookback)

    def register(self, strat):
        from stocks.services.accumulation.score_service import (
            AccumulationScoreService, ScoreParams)
        price_df = pd.DataFrame({"Open": strat.data.Open, "High": strat.data.High,
                                 "Low": strat.data.Low, "Close": strat.data.Close,
                                 "Volume": strat.data.Volume}, index=strat.data.index)
        params = ScoreParams(**self._params)
        score = AccumulationScoreService.score_series(self.symbol, price_df, params)
        flip = AccumulationScoreService.distribution_flipping(self.symbol, price_df, params)
        self._put(strat, score=strat.I(lambda: score.values),
                  flip=strat.I(lambda: flip.astype(float).values))

    def entry(self, strat):
        return self._get(strat, "score")[-1] >= self.entry_threshold

    def exit(self, strat):
        return self._get(strat, "flip")[-1] > 0.5
```

- [ ] **Step 3b: Register it in registry.py** (after the AccumulationMaCross `_reg`, ~line 182)

```python
_reg(L.AccumulationStrength, "alpha", "Accumulation Strength", "Broker flow", [
    _p("top_brokers", "int", 5, 1, 30, 1, "Top brokers tracked", arg="top_n"),
    _p("entry_threshold", "int", 70, 40, 90, 1, "Entry score threshold"),
    _p("w_concentration", "float", 1.0, 0.0, 3.0, 0.1, "Concentration weight"),
    _p("w_coiling", "float", 1.0, 0.0, 3.0, 0.1, "Coiling weight"),
    _p("w_breakout", "float", 1.0, 0.0, 3.0, 0.1, "Breakout weight"),
    _p("conc_lookback", "int", 10, 5, 30, 1, "Concentration lookback"),
    _p("coil_lookback", "int", 20, 10, 40, 1, "Coiling lookback")],
    "Composite broker-accumulation strength score with distribution-flip exit.",
    needs_symbol=True)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `docker-compose exec -T backend pytest stocks/tests/test_accumulation_alpha.py -v`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/stocks/services/strategy_framework/library.py backend/stocks/services/strategy_framework/registry.py backend/stocks/tests/test_accumulation_alpha.py
git commit -m "feat(accumulation): AccumulationStrength alpha + registry registration"
```

---

### Task 5: Sortino objective + calibration command

Two deliverables that ship together: (a) add a `'sortino'` objective to the optimizer (the spec's calibration objective; the existing optimizer only had `win_rate`/`return`), and (b) a `calibrate_accumulation_strategy` command that builds the strategy code, optimizes globally (scope=ALL), validates OOS via the ScoreCard, and persists the `Strategy` row with a `validation_state`.

**Files:**
- Modify: `backend/stocks/services/optimization_service.py` (objective mapping ~line 565)
- Create: `backend/stocks/services/accumulation/calibration.py`
- Create: `backend/stocks/management/commands/calibrate_accumulation_strategy.py`
- Test: `backend/stocks/tests/test_accumulation_calibration.py`

**Interfaces:**
- Consumes: `OptimizationService.run_optimization`, `evaluate_over_basket`, `Strategy` model.
- Produces:
  - `ACCUMULATION_STRATEGY_NAME = "Accumulation Strength"` and `build_accumulation_code(params: dict) -> str` (the optimizable Strategy code with `# range:` comments).
  - `decide_validation_state(card) -> str` returning `"validated"` or `"research"`.
  - `OptimizationService` objective mapping accepts `'sortino'` → `"Sortino Ratio"`.

- [ ] **Step 1: Write the failing test**

```python
# backend/stocks/tests/test_accumulation_calibration.py
import pytest

from stocks.services.accumulation.calibration import (
    build_accumulation_code, decide_validation_state, ACCUMULATION_STRATEGY_NAME)
from stocks.services.optimization_service import OptimizationService


def test_build_code_emits_optimizable_ranges():
    code = build_accumulation_code({"top_n": 5, "entry_threshold": 70})
    ranges = OptimizationService.extract_param_ranges(code)
    assert "entry_threshold" in ranges
    assert "w_concentration" in ranges
    assert ranges["entry_threshold"] == [40, 90]


def test_build_code_references_symbol_and_alpha():
    code = build_accumulation_code({})
    assert "AccumulationStrength" in code
    assert "symbol=symbol" in code  # symbol injected by strategy exec scope


class _Card:
    def __init__(self, passed):
        self.passed = passed


def test_validation_state_maps_scorecard():
    assert decide_validation_state(_Card(True)) == "validated"
    assert decide_validation_state(_Card(False)) == "research"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker-compose exec -T backend pytest stocks/tests/test_accumulation_calibration.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'stocks.services.accumulation.calibration'`

- [ ] **Step 3a: Add the `'sortino'` objective branch in optimization_service.py**

Locate the objective→stat mapping (~line 565, where `objective_type` maps to `"Win Rate [%]"` / `"Return [%]"`). Add the sortino case. Example (match the existing dict/branch shape exactly):

```python
_OBJECTIVE_STAT = {
    "win_rate": "Win Rate [%]",
    "return": "Return [%]",
    "sortino": "Sortino Ratio",  # added for accumulation calibration
}
```

(If it is an if/elif rather than a dict, add `elif objective_type == "sortino": return stats["Sortino Ratio"]` in the same place.)

- [ ] **Step 3b: Create calibration.py**

```python
# backend/stocks/services/accumulation/calibration.py
"""Build + gate the calibrated AccumulationStrength strategy."""

ACCUMULATION_STRATEGY_NAME = "Accumulation Strength"

_CODE_TEMPLATE = """from stocks.services.strategy_framework import build_strategy, alphas, stops
top_n = {top_n}  # range: [1, 15]
entry_threshold = {entry_threshold}  # range: [40, 90]
w_concentration = {w_concentration}  # range: [0, 3]
w_coiling = {w_coiling}  # range: [0, 3]
w_breakout = {w_breakout}  # range: [0, 3]
conc_lookback = {conc_lookback}  # range: [5, 30]
coil_lookback = {coil_lookback}  # range: [10, 40]
Strategy = build_strategy(
    alpha=alphas.AccumulationStrength(
        symbol=symbol, top_n=top_n, entry_threshold=entry_threshold,
        w_concentration=w_concentration, w_coiling=w_coiling, w_breakout=w_breakout,
        conc_lookback=conc_lookback, coil_lookback=coil_lookback),
    stop=stops.AtrTrail(multiplier=3.0),
    name="AccumulationStrength")
"""

_DEFAULTS = dict(top_n=5, entry_threshold=70, w_concentration=1.0, w_coiling=1.0,
                 w_breakout=1.0, conc_lookback=10, coil_lookback=20)


def build_accumulation_code(params):
    merged = {**_DEFAULTS, **(params or {})}
    return _CODE_TEMPLATE.format(**merged)


def decide_validation_state(card):
    """The OOS ScoreCard is the ship/no-ship arbiter for the trade button."""
    return "validated" if getattr(card, "passed", False) else "research"
```

- [ ] **Step 3c: Create the management command**

```python
# backend/stocks/management/commands/calibrate_accumulation_strategy.py
from datetime import date

from django.core.management.base import BaseCommand

from stocks.models import Strategy
from stocks.services.accumulation.calibration import (
    ACCUMULATION_STRATEGY_NAME, build_accumulation_code, decide_validation_state)
from stocks.services.backtest_harness.evaluate import evaluate_over_basket
from stocks.services.optimization_service import OptimizationService

DEFAULT_TRIALS = 40
OOS_FRACTION = 0.3


class Command(BaseCommand):
    help = "Calibrate the AccumulationStrength strategy globally and gate it on OOS."

    def add_arguments(self, parser):
        parser.add_argument("--trials", type=int, default=DEFAULT_TRIALS)
        parser.add_argument("--start", type=str, default="2021-01-01")
        parser.add_argument("--end", type=str, default=str(date.today()))

    def _seed_strategy(self):
        strat, _ = Strategy.objects.get_or_create(
            name=ACCUMULATION_STRATEGY_NAME,
            defaults={"code": build_accumulation_code({})})
        if not strat.code:
            strat.code = build_accumulation_code({})
            strat.save(update_fields=["code"])
        return strat

    def handle(self, *args, **opts):
        strat = self._seed_strategy()
        self.stdout.write("Optimizing (scope=ALL, objective=sortino)...")
        best_params, best_value = OptimizationService.run_optimization(
            strat, "ALL", "ALL", opts["start"], opts["end"], opts["trials"],
            objective_type="sortino")
        strat.code = build_accumulation_code(best_params)
        strat.save(update_fields=["code"])
        self.stdout.write("Validating on OOS basket...")
        card = evaluate_over_basket(strat, list(_basket()), oos_fraction=OOS_FRACTION,
                                    strategy_name=strat.name)
        state = decide_validation_state(card)
        strat.spec = {**(strat.spec or {}), "validation_state": state,
                      "best_params": best_params, "oos_passed": card.passed}
        strat.save(update_fields=["spec"])
        verdict = self.style.SUCCESS("VALIDATED") if card.passed else self.style.WARNING("RESEARCH")
        self.stdout.write(f"[{verdict}] best={best_params} oos_passed={card.passed}")


def _basket():
    from stocks.services.accumulation.universe import liquid_universe
    return liquid_universe(date.today())
```

- [ ] **Step 4: Run test to verify it passes**

Run: `docker-compose exec -T backend pytest stocks/tests/test_accumulation_calibration.py -v`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/stocks/services/optimization_service.py backend/stocks/services/accumulation/calibration.py backend/stocks/management/commands/calibrate_accumulation_strategy.py backend/stocks/tests/test_accumulation_calibration.py
git commit -m "feat(accumulation): sortino objective + global calibration command with OOS gating"
```

---

### Task 6: AccumulationCandidate model + migration

**Files:**
- Modify: `backend/stocks/models/portfolio.py` (append model)
- Modify: `backend/stocks/models/__init__.py` (export)
- Create: `backend/stocks/migrations/0044_accumulationcandidate.py`
- Test: `backend/stocks/tests/test_accumulation_candidate_model.py`

**Interfaces:**
- Produces: `AccumulationCandidate` with fields `symbol, scan_date, score, factors(JSON), suggested_entry, suggested_stop, suggested_target, validation_state, status` and a unique `(symbol, scan_date)`.
- `Status` choices: `ACTIVE="ACTIVE"`, `EXPIRED="EXPIRED"`.

- [ ] **Step 1: Write the failing test**

```python
# backend/stocks/tests/test_accumulation_candidate_model.py
from datetime import date
from decimal import Decimal

import pytest
from django.db import IntegrityError

from stocks.models import AccumulationCandidate


@pytest.mark.django_db
def test_candidate_unique_per_symbol_and_scan_date():
    AccumulationCandidate.objects.create(
        symbol="NABIL", scan_date=date(2026, 6, 26), score=Decimal("82.5"),
        factors={"concentration": 0.9}, suggested_entry=Decimal("520"),
        suggested_stop=Decimal("500"), suggested_target=Decimal("560"),
        validation_state="validated", status=AccumulationCandidate.Status.ACTIVE)
    with pytest.raises(IntegrityError):
        AccumulationCandidate.objects.create(
            symbol="NABIL", scan_date=date(2026, 6, 26), score=Decimal("70"),
            factors={}, suggested_entry=Decimal("1"), suggested_stop=Decimal("1"),
            suggested_target=Decimal("1"), validation_state="research",
            status=AccumulationCandidate.Status.ACTIVE)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker-compose exec -T backend pytest stocks/tests/test_accumulation_candidate_model.py -v`
Expected: FAIL with `ImportError: cannot import name 'AccumulationCandidate'`

- [ ] **Step 3a: Add the model to portfolio.py**

```python
class AccumulationCandidate(models.Model):
    """A ranked accumulation setup surfaced by the daily scanner."""

    class Status(models.TextChoices):
        ACTIVE = "ACTIVE", "Active"
        EXPIRED = "EXPIRED", "Expired"

    symbol = models.CharField(max_length=20, db_index=True)
    scan_date = models.DateField(db_index=True)
    score = models.DecimalField(max_digits=6, decimal_places=2)
    factors = models.JSONField(default=dict, blank=True)
    suggested_entry = models.DecimalField(max_digits=12, decimal_places=2)
    suggested_stop = models.DecimalField(max_digits=12, decimal_places=2)
    suggested_target = models.DecimalField(max_digits=12, decimal_places=2)
    validation_state = models.CharField(max_length=12, default="research")
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.ACTIVE)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "accumulation_candidates"
        ordering = ["-scan_date", "-score"]
        constraints = [
            models.UniqueConstraint(fields=["symbol", "scan_date"],
                                    name="one_candidate_per_symbol_per_scan"),
        ]
        indexes = [models.Index(fields=["scan_date", "status"])]
```

- [ ] **Step 3b: Export in models/__init__.py**

Add to the portfolio import line:

```python
from .portfolio import (  # noqa: F401  (extend the existing import list)
    AccumulationCandidate,
)
```

- [ ] **Step 3c: Generate the migration**

Run: `docker-compose exec -T backend python manage.py makemigrations stocks`
Expected: creates `stocks/migrations/0044_accumulationcandidate.py`. Then apply:
Run: `docker-compose exec -T backend python manage.py migrate stocks`

- [ ] **Step 4: Run test to verify it passes**

Run: `docker-compose exec -T backend pytest stocks/tests/test_accumulation_candidate_model.py -v`
Expected: PASS (1 test)

- [ ] **Step 5: Commit**

```bash
git add backend/stocks/models/portfolio.py backend/stocks/models/__init__.py backend/stocks/migrations/0044_accumulationcandidate.py backend/stocks/tests/test_accumulation_candidate_model.py
git commit -m "feat(accumulation): AccumulationCandidate model + migration"
```

---

### Task 7: Daily scanner service

**Files:**
- Create: `backend/stocks/services/accumulation/scanner.py`
- Test: `backend/stocks/tests/test_accumulation_scanner.py`

**Interfaces:**
- Consumes: `liquid_universe`, `AccumulationScoreService`, `load_price_df` (harness), the calibrated `Strategy` row, `AccumulationCandidate`.
- Produces:
  - Constants `ENTRY_SCORE_THRESHOLD_DEFAULT = 70.0`, `STOP_ATR_MULT = 3.0`, `TARGET_RR = 2.0`, `ATR_PERIOD = 14`.
  - `AccumulationScanner.scan_and_save_candidates(as_of: date|None=None) -> int` (returns candidates written; expires the rest).
  - `suggested_levels(price_df) -> tuple[Decimal, Decimal, Decimal]` (entry, stop, target).

- [ ] **Step 1: Write the failing test**

```python
# backend/stocks/tests/test_accumulation_scanner.py
from datetime import date
from decimal import Decimal

import numpy as np
import pandas as pd
import pytest

from stocks.models import AccumulationCandidate
from stocks.services.accumulation.scanner import AccumulationScanner, suggested_levels


def _df():
    idx = pd.date_range("2021-01-01", periods=30, freq="D")
    c = np.linspace(100, 130, 30)
    return pd.DataFrame({"Open": c, "High": c * 1.02, "Low": c * 0.98,
                         "Close": c, "Volume": np.full(30, 1000.0)}, index=idx)


def test_suggested_levels_orders_stop_below_entry_below_target():
    entry, stop, target = suggested_levels(_df())
    assert stop < entry < target


@pytest.mark.django_db
def test_scan_expires_previous_active_candidates(monkeypatch):
    AccumulationCandidate.objects.create(
        symbol="OLD", scan_date=date(2026, 6, 25), score=Decimal("80"),
        factors={}, suggested_entry=Decimal("1"), suggested_stop=Decimal("1"),
        suggested_target=Decimal("1"), validation_state="validated",
        status=AccumulationCandidate.Status.ACTIVE)
    monkeypatch.setattr("stocks.services.accumulation.scanner.liquid_universe",
                        lambda as_of: [])
    AccumulationScanner.scan_and_save_candidates(as_of=date(2026, 6, 26))
    assert AccumulationCandidate.objects.get(symbol="OLD").status == \
        AccumulationCandidate.Status.EXPIRED
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker-compose exec -T backend pytest stocks/tests/test_accumulation_scanner.py -v`
Expected: FAIL with `ModuleNotFoundError`

- [ ] **Step 3: Write minimal implementation**

```python
# backend/stocks/services/accumulation/scanner.py
"""Daily scanner: score the liquid universe, persist ranked candidates."""
from datetime import date
from decimal import Decimal

import numpy as np

from stocks.models import AccumulationCandidate, Strategy
from stocks.services.accumulation.calibration import ACCUMULATION_STRATEGY_NAME
from stocks.services.accumulation.score_service import AccumulationScoreService, ScoreParams
from stocks.services.accumulation.universe import liquid_universe
from stocks.services.backtest_harness.runner import load_price_df

ENTRY_SCORE_THRESHOLD_DEFAULT = 70.0
STOP_ATR_MULT = 3.0
TARGET_RR = 2.0
ATR_PERIOD = 14


def _atr(price_df, period=ATR_PERIOD):
    high, low, close = price_df["High"], price_df["Low"], price_df["Close"]
    tr = np.maximum(high - low, np.abs(high - close.shift(1))).fillna(high - low)
    return float(tr.rolling(period).mean().iloc[-1])


def suggested_levels(price_df):
    entry = float(price_df["Close"].iloc[-1])
    atr = _atr(price_df) or entry * 0.02
    stop = entry - STOP_ATR_MULT * atr
    target = entry + TARGET_RR * (entry - stop)
    return Decimal(str(round(entry, 2))), Decimal(str(round(stop, 2))), \
        Decimal(str(round(target, 2)))


class AccumulationScanner:

    @staticmethod
    def _config():
        strat = Strategy.objects.filter(name=ACCUMULATION_STRATEGY_NAME).first()
        spec = (strat.spec if strat else None) or {}
        bp = spec.get("best_params", {})
        params = ScoreParams(**{k: v for k, v in bp.items()
                                if k in ScoreParams.__dataclass_fields__})
        state = spec.get("validation_state", "research")
        threshold = float(bp.get("entry_threshold", ENTRY_SCORE_THRESHOLD_DEFAULT))
        return params, state, threshold

    @staticmethod
    def _build_candidate(symbol, as_of, params, state, threshold):
        df = load_price_df(symbol)
        if df is None or df.empty:
            return None
        score = AccumulationScoreService.score_series(symbol, df, params)
        if float(score.iloc[-1]) < threshold:
            return None
        entry, stop, target = suggested_levels(df)
        return dict(symbol=symbol, scan_date=as_of, score=Decimal(str(round(float(score.iloc[-1]), 2))),
                    factors=AccumulationScoreService.factor_breakdown(symbol, df, params),
                    suggested_entry=entry, suggested_stop=stop, suggested_target=target,
                    validation_state=state, status=AccumulationCandidate.Status.ACTIVE)

    @staticmethod
    def scan_and_save_candidates(as_of=None):
        as_of = as_of or date.today()
        AccumulationCandidate.objects.filter(
            status=AccumulationCandidate.Status.ACTIVE).update(
            status=AccumulationCandidate.Status.EXPIRED)
        params, state, threshold = AccumulationScanner._config()
        written = 0
        for symbol in liquid_universe(as_of):
            row = AccumulationScanner._build_candidate(symbol, as_of, params, state, threshold)
            if row:
                AccumulationCandidate.objects.update_or_create(
                    symbol=symbol, scan_date=as_of, defaults=row)
                written += 1
        return written
```

- [ ] **Step 4: Run test to verify it passes**

Run: `docker-compose exec -T backend pytest stocks/tests/test_accumulation_scanner.py -v`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/stocks/services/accumulation/scanner.py backend/stocks/tests/test_accumulation_scanner.py
git commit -m "feat(accumulation): daily scanner — score universe, rank, persist candidates"
```

---

### Task 8: Celery task + beat schedule

**Files:**
- Modify: `backend/stocks/tasks.py` (append task)
- Modify: `backend/stockastic/settings.py` (`CELERY_BEAT_SCHEDULE`, ~line 291)
- Test: `backend/stocks/tests/test_accumulation_task.py`

**Interfaces:**
- Produces: `stocks.tasks.scan_accumulation_candidates_task` (name `stocks.scan_accumulation_candidates`).

- [ ] **Step 1: Write the failing test**

```python
# backend/stocks/tests/test_accumulation_task.py
import pytest

from stocks import tasks


@pytest.mark.django_db
def test_scan_task_delegates_to_scanner(monkeypatch):
    monkeypatch.setattr(
        "stocks.services.accumulation.scanner.AccumulationScanner.scan_and_save_candidates",
        staticmethod(lambda as_of=None: 7))
    result = tasks.scan_accumulation_candidates_task()
    assert result == {"candidates_identified": 7}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker-compose exec -T backend pytest stocks/tests/test_accumulation_task.py -v`
Expected: FAIL with `AttributeError: module 'stocks.tasks' has no attribute 'scan_accumulation_candidates_task'`

- [ ] **Step 3a: Add the task to tasks.py**

```python
@shared_task(bind=True, name="stocks.scan_accumulation_candidates")
def scan_accumulation_candidates_task(self):
    """Daily: rank accumulation candidates after broker analysis lands."""
    from stocks.services.accumulation.scanner import AccumulationScanner
    return {"candidates_identified": AccumulationScanner.scan_and_save_candidates()}
```

(Note: the test calls it without Celery's `self`; `shared_task(bind=True)` still allows direct call as `scan_accumulation_candidates_task()` because the binding is supplied by Celery only when invoked as a task. If the direct call fails on `self`, call `.run()` in the test instead — adjust the test to `tasks.scan_accumulation_candidates_task.run()`.)

- [ ] **Step 3b: Add the beat entry in settings.py** (inside `CELERY_BEAT_SCHEDULE`)

```python
    # Accumulation scan: after broker analysis + signals have landed (17:00).
    "scan-accumulation-candidates-daily": {
        "task": "stocks.scan_accumulation_candidates",
        "schedule": crontab(hour=17, minute=15),
    },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `docker-compose exec -T backend pytest stocks/tests/test_accumulation_task.py -v`
Expected: PASS (1 test)

- [ ] **Step 5: Commit**

```bash
git add backend/stocks/tasks.py backend/stockastic/settings.py backend/stocks/tests/test_accumulation_task.py
git commit -m "feat(accumulation): daily celery scan task + beat schedule"
```

---

### Task 9: DRF serializer + viewset + route (with per-account sizing)

**Files:**
- Create: `backend/stocks/serializers/accumulation_candidate.py`
- Create: `backend/stocks/views/accumulation_candidate_viewset.py`
- Modify: `backend/stocks/urls.py` (router register)
- Test: `backend/stocks/tests/test_accumulation_candidate_api.py`

**Interfaces:**
- Consumes: `AccumulationCandidate`, `PortfolioAccount`.
- Produces:
  - `GET /api/stocks/accumulation-candidates/` → active candidates (newest scan), each with `suggested_qty` when `?account=<id>` is supplied.
  - `GET /api/stocks/accumulation-candidates/{symbol}/` → latest candidate for a symbol.
  - `suggested_quantity(account, entry, stop) -> int` helper.

- [ ] **Step 1: Write the failing test**

```python
# backend/stocks/tests/test_accumulation_candidate_api.py
from datetime import date
from decimal import Decimal

import pytest
from django.contrib.auth.models import User
from rest_framework.test import APIClient

from stocks.models import AccumulationCandidate, PortfolioAccount
from stocks.models.portfolio import AccountType
from stocks.views.accumulation_candidate_viewset import suggested_quantity


def test_suggested_quantity_uses_risk_and_stop_distance():
    acct = PortfolioAccount(balance=Decimal("100000"), default_risk_percentage=Decimal("2"))
    # risk budget = 2000; per-share risk = 20 -> 100 shares
    assert suggested_quantity(acct, Decimal("520"), Decimal("500")) == 100


@pytest.mark.django_db
def test_list_returns_active_candidates():
    user = User.objects.create_user("u1", password="x")
    AccumulationCandidate.objects.create(
        symbol="NABIL", scan_date=date(2026, 6, 26), score=Decimal("82"),
        factors={"score": 82.0}, suggested_entry=Decimal("520"),
        suggested_stop=Decimal("500"), suggested_target=Decimal("560"),
        validation_state="validated", status=AccumulationCandidate.Status.ACTIVE)
    client = APIClient()
    client.force_authenticate(user=user)
    resp = client.get("/api/stocks/accumulation-candidates/")
    assert resp.status_code == 200
    assert resp.data[0]["symbol"] == "NABIL"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker-compose exec -T backend pytest stocks/tests/test_accumulation_candidate_api.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'stocks.views.accumulation_candidate_viewset'`

- [ ] **Step 3a: Serializer**

```python
# backend/stocks/serializers/accumulation_candidate.py
from rest_framework import serializers

from ..models import AccumulationCandidate


class AccumulationCandidateSerializer(serializers.ModelSerializer):
    suggested_qty = serializers.SerializerMethodField()

    class Meta:
        model = AccumulationCandidate
        fields = ["id", "symbol", "scan_date", "score", "factors", "suggested_entry",
                  "suggested_stop", "suggested_target", "validation_state", "status",
                  "suggested_qty"]

    def get_suggested_qty(self, obj):
        return self.context.get("qty_by_symbol", {}).get(obj.symbol)
```

- [ ] **Step 3b: ViewSet + sizing helper**

```python
# backend/stocks/views/accumulation_candidate_viewset.py
from decimal import Decimal

from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated

from ..models import AccumulationCandidate, PortfolioAccount
from ..serializers.accumulation_candidate import AccumulationCandidateSerializer

DEFAULT_RISK_PCT = Decimal("1")


def suggested_quantity(account, entry, stop):
    """Risk-based size: (balance * risk%) / per-share risk, floored to whole shares."""
    per_share_risk = entry - stop
    if per_share_risk <= 0:
        return 0
    risk_pct = account.default_risk_percentage or DEFAULT_RISK_PCT
    budget = (account.balance or Decimal("0")) * risk_pct / Decimal("100")
    qty = int(budget / per_share_risk)
    affordable = int((account.balance or Decimal("0")) / entry) if entry > 0 else 0
    return max(min(qty, affordable), 0)


class AccumulationCandidateViewSet(viewsets.ReadOnlyModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = AccumulationCandidateSerializer
    lookup_field = "symbol"

    def get_queryset(self):
        return AccumulationCandidate.objects.filter(
            status=AccumulationCandidate.Status.ACTIVE).order_by("-score")

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        account_id = self.request.query_params.get("account")
        if account_id:
            account = PortfolioAccount.objects.filter(
                id=account_id, user=self.request.user).first()
            if account:
                ctx["qty_by_symbol"] = {
                    c.symbol: suggested_quantity(account, c.suggested_entry, c.suggested_stop)
                    for c in self.get_queryset()}
        return ctx
```

- [ ] **Step 3c: Register the route in urls.py** (with the other `router.register` calls)

```python
from .views.accumulation_candidate_viewset import AccumulationCandidateViewSet
router.register(r'accumulation-candidates', AccumulationCandidateViewSet,
                basename='accumulation-candidates')
```

- [ ] **Step 4: Run test to verify it passes**

Run: `docker-compose exec -T backend pytest stocks/tests/test_accumulation_candidate_api.py -v`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/stocks/serializers/accumulation_candidate.py backend/stocks/views/accumulation_candidate_viewset.py backend/stocks/urls.py backend/stocks/tests/test_accumulation_candidate_api.py
git commit -m "feat(accumulation): candidates API (list/detail) with risk-based sizing"
```

---

### Task 10: Frontend API client + types

**Files:**
- Modify: `frontend/src/lib/api.ts` (append `accumulationApi`)
- Create: `frontend/src/types/accumulation-trading.ts`
- Test: `frontend/src/__tests__/unit/accumulationApi.test.ts`

**Interfaces:**
- Produces:
  - `interface AccumulationCandidate { id:number; symbol:string; scan_date:string; score:string; factors:{concentration:number;coiling:number;breakout:number;score:number}; suggested_entry:string; suggested_stop:string; suggested_target:string; validation_state:'validated'|'research'; status:string; suggested_qty:number|null }`
  - `accumulationApi.listCandidates(params?)`, `accumulationApi.getCandidate(symbol)`.

- [ ] **Step 1: Write the failing test**

```typescript
// frontend/src/__tests__/unit/accumulationApi.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import api, { accumulationApi } from '@/lib/api';

vi.mock('@/lib/api', async (orig) => {
    const mod = await (orig as () => Promise<typeof import('@/lib/api')>)();
    return { ...mod };
});

describe('accumulationApi', () => {
    afterEach(() => vi.restoreAllMocks());

    it('lists candidates with the account query param', () => {
        const spy = vi.spyOn(api, 'get').mockResolvedValue({ data: [] } as never);
        accumulationApi.listCandidates({ account: '3' });
        expect(spy).toHaveBeenCalledWith('/api/stocks/accumulation-candidates/?account=3');
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/__tests__/unit/accumulationApi.test.ts`
Expected: FAIL with export `accumulationApi` not found.

- [ ] **Step 3a: Types file**

```typescript
// frontend/src/types/accumulation-trading.ts
export interface AccumulationFactors {
    concentration: number;
    coiling: number;
    breakout: number;
    score: number;
}

export interface AccumulationCandidate {
    id: number;
    symbol: string;
    scan_date: string;
    score: string;
    factors: AccumulationFactors;
    suggested_entry: string;
    suggested_stop: string;
    suggested_target: string;
    validation_state: 'validated' | 'research';
    status: string;
    suggested_qty: number | null;
}
```

- [ ] **Step 3b: API client (append to api.ts, before `export default api`)**

```typescript
import type { AccumulationCandidate } from '@/types/accumulation-trading';

export const accumulationApi = {
    listCandidates: (params: Record<string, string> = {}) => {
        const qs = new URLSearchParams(params).toString();
        return api.get<AccumulationCandidate[]>(
            `/api/stocks/accumulation-candidates/${qs ? `?${qs}` : ''}`);
    },
    getCandidate: (symbol: string) =>
        api.get<AccumulationCandidate>(`/api/stocks/accumulation-candidates/${symbol}/`),
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/__tests__/unit/accumulationApi.test.ts`
Expected: PASS (1 test)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/api.ts frontend/src/types/accumulation-trading.ts frontend/src/__tests__/unit/accumulationApi.test.ts
git commit -m "feat(accumulation): frontend api client + candidate types"
```

---

### Task 11: Candidate table component + place-trade gating

**Files:**
- Create: `frontend/src/components/accumulation/CandidateTable.tsx`
- Test: `frontend/src/__tests__/unit/CandidateTable.test.tsx`

**Interfaces:**
- Consumes: `AccumulationCandidate` type (Task 10), shadcn `Table`, `lib/numbers`.
- Produces: `<CandidateTable candidates={AccumulationCandidate[]} onPlaceTrade={(c)=>void} />`. The "Place paper trade" button is **disabled** when `validation_state !== 'validated'`.

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/src/__tests__/unit/CandidateTable.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { CandidateTable } from '@/components/accumulation/CandidateTable';
import type { AccumulationCandidate } from '@/types/accumulation-trading';

const base: AccumulationCandidate = {
    id: 1, symbol: 'NABIL', scan_date: '2026-06-26', score: '82.00',
    factors: { concentration: 0.9, coiling: 0.7, breakout: 1, score: 82 },
    suggested_entry: '520.00', suggested_stop: '500.00', suggested_target: '560.00',
    validation_state: 'validated', status: 'ACTIVE', suggested_qty: 100,
};

describe('CandidateTable', () => {
    it('enables the trade button for validated candidates', () => {
        render(<CandidateTable candidates={[base]} onPlaceTrade={vi.fn()} />);
        expect(screen.getByRole('button', { name: /place paper trade/i })).toBeEnabled();
    });

    it('disables the trade button for research-only candidates', () => {
        render(<CandidateTable candidates={[{ ...base, validation_state: 'research' }]}
                               onPlaceTrade={vi.fn()} />);
        expect(screen.getByRole('button', { name: /place paper trade/i })).toBeDisabled();
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/__tests__/unit/CandidateTable.test.tsx`
Expected: FAIL — component module not found.

- [ ] **Step 3: Write minimal implementation**

```tsx
// frontend/src/components/accumulation/CandidateTable.tsx
'use client';

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow }
    from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { fixed } from '@/lib/numbers';
import type { AccumulationCandidate } from '@/types/accumulation-trading';

interface Props {
    candidates: AccumulationCandidate[];
    onPlaceTrade: (candidate: AccumulationCandidate) => void;
}

export function CandidateTable({ candidates, onPlaceTrade }: Props) {
    return (
        <Table>
            <TableHeader>
                <TableRow>
                    <TableHead>Symbol</TableHead>
                    <TableHead>Score</TableHead>
                    <TableHead>Entry</TableHead>
                    <TableHead>Stop</TableHead>
                    <TableHead>Target</TableHead>
                    <TableHead>Qty</TableHead>
                    <TableHead></TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {candidates.map((c) => (
                    <TableRow key={c.id}>
                        <TableCell className="font-semibold">{c.symbol}</TableCell>
                        <TableCell>{fixed(c.score, 1)}</TableCell>
                        <TableCell>{fixed(c.suggested_entry, 2)}</TableCell>
                        <TableCell>{fixed(c.suggested_stop, 2)}</TableCell>
                        <TableCell>{fixed(c.suggested_target, 2)}</TableCell>
                        <TableCell>{c.suggested_qty ?? '—'}</TableCell>
                        <TableCell>
                            <Button
                                onClick={() => onPlaceTrade(c)}
                                disabled={c.validation_state !== 'validated'}
                                title={c.validation_state !== 'validated'
                                    ? 'Strategy not validated against buy-and-hold'
                                    : undefined}>
                                Place paper trade
                            </Button>
                        </TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/__tests__/unit/CandidateTable.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/accumulation/CandidateTable.tsx frontend/src/__tests__/unit/CandidateTable.test.tsx
git commit -m "feat(accumulation): candidate table with validation-gated trade action"
```

---

### Task 12: Accumulation Trading page + sidebar entry

Wires the table into a page on the existing `/accumulation` area, with an account selector and a confirm dialog that posts the paper BUY through the reused transactions endpoint.

**Files:**
- Create: `frontend/src/app/(authenticated)/accumulation/trading/page.tsx`
- Modify: `frontend/src/app/(authenticated)/accumulation/layout.tsx` (add title mapping)
- Modify: the sidebar nav config (locate the accumulation group; add a "Trading" link to `/accumulation/trading`)
- Test: `frontend/src/__tests__/unit/AccumulationTradingPage.test.tsx`

**Interfaces:**
- Consumes: `accumulationApi.listCandidates` (Task 10), `CandidateTable` (Task 11), the existing account list endpoint, `api.post('/api/stocks/transactions/', ...)` for the BUY.

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/src/__tests__/unit/AccumulationTradingPage.test.tsx
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import AccumulationTradingPage from '@/app/(authenticated)/accumulation/trading/page';
import { accumulationApi } from '@/lib/api';

vi.mock('@/lib/api', () => ({
    __esModule: true,
    default: { get: vi.fn().mockResolvedValue({ data: [] }) },
    accumulationApi: { listCandidates: vi.fn() },
}));

describe('AccumulationTradingPage', () => {
    afterEach(() => vi.clearAllMocks());

    it('renders the ranked candidates returned by the api', async () => {
        (accumulationApi.listCandidates as ReturnType<typeof vi.fn>).mockResolvedValue({
            data: [{
                id: 1, symbol: 'NABIL', scan_date: '2026-06-26', score: '82.00',
                factors: { concentration: 0.9, coiling: 0.7, breakout: 1, score: 82 },
                suggested_entry: '520.00', suggested_stop: '500.00',
                suggested_target: '560.00', validation_state: 'validated',
                status: 'ACTIVE', suggested_qty: 100,
            }],
        });
        render(<AccumulationTradingPage />);
        await waitFor(() => expect(screen.getByText('NABIL')).toBeInTheDocument());
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/__tests__/unit/AccumulationTradingPage.test.tsx`
Expected: FAIL — page module not found.

- [ ] **Step 3a: Page component**

```tsx
// frontend/src/app/(authenticated)/accumulation/trading/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { accumulationApi } from '@/lib/api';
import { CandidateTable } from '@/components/accumulation/CandidateTable';
import { PageLoader } from '@/components/ui/StockLoader';
import type { AccumulationCandidate } from '@/types/accumulation-trading';

export default function AccumulationTradingPage() {
    const [candidates, setCandidates] = useState<AccumulationCandidate[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        accumulationApi.listCandidates()
            .then((r) => setCandidates(r.data))
            .finally(() => setLoading(false));
    }, []);

    if (loading) return <PageLoader />;

    return (
        <div className="space-y-6">
            <p className="text-sm text-muted-foreground">
                Stocks where a few large brokers are accumulating. Validated setups can be
                traded into your paper account; research-only setups are for review.
            </p>
            <CandidateTable
                candidates={candidates}
                onPlaceTrade={(c) => console.info('place trade', c.symbol)} />
        </div>
    );
}
```

(Note: the confirm dialog + actual POST to `/api/stocks/transactions/` is wired in Step 3c; Step 3a keeps the page test green with a stub handler first.)

- [ ] **Step 3b: Add the layout title mapping**

In `accumulation/layout.tsx`, add to the `titles` map:

```tsx
    '/accumulation/trading': 'Accumulation trading',
```

- [ ] **Step 3c: Wire the confirm-and-POST handler**

Replace the `onPlaceTrade` stub with a confirm dialog that collects the account and posts the BUY. Use the existing `Dialog` component and `api.post`:

```tsx
// inside the page, replacing the console.info handler
const placeTrade = async (c: AccumulationCandidate, accountId: number) => {
    await api.post('/api/stocks/transactions/', {
        ticker: c.symbol, transaction_type: 'BUY', quantity: c.suggested_qty,
        rate: c.suggested_entry, account: accountId,
    });
};
```

(Add `import api from '@/lib/api';` and a shadcn `Dialog` that surfaces account selection + the suggested levels before calling `placeTrade`. Keep each handler ≤30 lines; extract a `PlaceTradeDialog` component if it grows.)

- [ ] **Step 3d: Add the sidebar link**

Locate the sidebar nav config (the single navigation surface; search for the existing `/accumulation/dashboard` entry). Add a sibling entry:

```tsx
{ label: 'Trading', href: '/accumulation/trading' }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/__tests__/unit/AccumulationTradingPage.test.tsx`
Expected: PASS (1 test)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/\(authenticated\)/accumulation/trading/page.tsx frontend/src/app/\(authenticated\)/accumulation/layout.tsx frontend/src/__tests__/unit/AccumulationTradingPage.test.tsx
git commit -m "feat(accumulation): trading page (ranked candidates + confirm paper trade)"
```

---

### Task 13: End-to-end verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full backend accumulation test suite**

Run: `docker-compose exec -T backend pytest stocks/tests/test_accumulation_flow.py stocks/tests/test_accumulation_score_service.py stocks/tests/test_accumulation_universe.py stocks/tests/test_accumulation_alpha.py stocks/tests/test_accumulation_calibration.py stocks/tests/test_accumulation_candidate_model.py stocks/tests/test_accumulation_scanner.py stocks/tests/test_accumulation_task.py stocks/tests/test_accumulation_candidate_api.py -v`
Expected: all PASS.

- [ ] **Step 2: Run the strategy framework regression suite** (ensure the new alpha/registry didn't break existing strategies)

Run: `docker-compose exec -T backend pytest stocks/tests/test_strategy_framework.py -v`
Expected: all PASS.

- [ ] **Step 3: Run the frontend accumulation tests + lint**

Run: `cd frontend && npx vitest run src/__tests__/unit/accumulationApi.test.ts src/__tests__/unit/CandidateTable.test.tsx src/__tests__/unit/AccumulationTradingPage.test.tsx && npm run lint`
Expected: tests PASS, lint clean.

- [ ] **Step 4: Smoke-test calibration end-to-end** (small trial count)

Run: `docker-compose exec -T backend python manage.py calibrate_accumulation_strategy --trials 5 --start 2022-01-01 --end 2024-12-31`
Expected: prints `[VALIDATED]` or `[RESEARCH]` with best params; a `Strategy` row named "Accumulation Strength" exists with `spec.validation_state` set.

- [ ] **Step 5: Smoke-test the scanner**

Run: `docker-compose exec -T backend python manage.py shell -c "from stocks.services.accumulation.scanner import AccumulationScanner; print(AccumulationScanner.scan_and_save_candidates())"`
Expected: prints an integer count; `AccumulationCandidate` rows exist with `status=ACTIVE`.

- [ ] **Step 6: Final commit (if any verification fixes were needed)**

```bash
git add -A && git commit -m "test(accumulation): end-to-end verification fixes" || echo "nothing to commit"
```

---

## Self-Review

**1. Spec coverage** — every spec section maps to a task:
- 3 factors + composite score → Task 2 (concentration net-buyer fix, coiling, breakout). ✅
- 1-bar look-ahead lag → Task 1 (`load_broker_flow` with `.shift(1)`), consumed everywhere. ✅
- `AccumulationStrength` Alpha + hybrid exit (AtrTrail stop + distribution-flip) → Task 4 (alpha) + Task 5 (AtrTrail in the code template). ✅
- Two-stage calibration (Optuna scope=ALL → OOS ScoreCard gate), Sortino objective → Task 5. ✅
- Shared liquidity floor (calibration + scan) → Task 3, consumed by Task 5 (`_basket`) and Task 7 (`liquid_universe`). ✅
- Daily scanner + Celery + beat → Task 7 + Task 8. ✅
- `AccumulationCandidate` state → Task 6. ✅
- Risk-based sizing → Task 9 (`suggested_quantity`). ✅
- API (list/detail) → Task 9. ✅
- Page + propose-and-confirm + reused transactions endpoint → Task 12. ✅
- "validated vs research" gating → Task 5 (`decide_validation_state`), Task 7 (persists state), Task 11 (button disabled). ✅
- GBM/RL future work → spec only, not built (correct — non-goals). ✅

**2. Placeholder scan** — no "TBD/TODO/handle edge cases"; every code step has real code. The Task 12 confirm-dialog is split into staged steps (3a stub keeps the test green, 3c wires the POST) with explicit code — acceptable, not a placeholder.

**3. Type consistency** — `ScoreParams` field names match between Task 2, Task 4 (`self._params`), and Task 5 (code template kwargs). `BrokerFlow.top_sum`/`.pivot` consistent across Tasks 1/2/4. `AccumulationCandidate` field names consistent across Tasks 6/7/9. `validation_state` values `'validated'`/`'research'` consistent across Tasks 5/9/11. `suggested_quantity` signature consistent between Task 9 impl and test.

**Known integration risks flagged for the implementer:**
- Task 5 Step 3a: the optimizer's objective mapping shape (dict vs if/elif) must be matched to the actual code at `optimization_service.py` ~line 565 — adapt the branch accordingly.
- Task 8 Step 3a: `shared_task(bind=True)` direct-call vs `.run()` — the note says to switch the test to `.run()` if the direct call trips on `self`.
- Task 5: how `run_optimization` feeds `best_params` back into the strategy code (regex literal substitution vs scope injection) is existing machinery; the `# range:` comment idiom matches the other 41 strategies, so it is the supported path.
