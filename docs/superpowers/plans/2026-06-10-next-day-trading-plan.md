# Next-Day Trading Plan ("Tomorrow's Plan") Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A precomputed daily trading plan (regime + confluence picks + catalysts + analogs, with a per-user overlay) served at `/api/stocks/plan/today/` and rendered at `/plan`, generated nightly by celery after signal generation.

**Architecture:** One global `DailyTradingPlan` row per trading day (JSON payload), built by `stocks/services/daily_plan.py` from existing services (`rank_opportunities`, `current_regime`, `SignalEpisode`, sector rotation helpers). New pure-function services for confluence scoring, entry freshness, historical analogs, and catalysts. Per-user overlay (positions near SL/TP, signal flips, watchlist triggers) computed at read time. Spec: `docs/superpowers/specs/2026-06-10-next-day-trading-plan-design.md`.

**Tech Stack:** Django 5 + DRF + celery beat (backend, pytest), Next.js 15 App Router + shadcn/ui + vitest (frontend).

**Conventions used throughout:**
- Backend tests run from `backend/`: `cd /Users/jugalraj/Documents/Projects/Stockastic/backend && python -m pytest tests/<file> -v`
- Frontend tests run from `frontend/`: `cd /Users/jugalraj/Documents/Projects/Stockastic/frontend && npx vitest run src/__tests__/<file>`
- Existing pytest fixtures in `backend/tests/conftest.py`: `api_client`, `create_user`, `auth_client` (authenticates as `testuser`).
- NEPSE trades Sunday–Thursday; Friday and Saturday are non-trading days.
- `DailyStockPrice` fields: `ticker`, `date`, `open/high/low/close` (nullable Decimals), `volume`. `SignalEpisode`: `end_date IS NULL` means ACTIVE; fields `source`, `producer_key`, `symbol`, `direction` (`BUY`/`SELL`), `entry_price`, `target_price`, `stop_loss_price`, `entry_strength`, `last_signal_date`, `metadata` (JSON), `pnl_percent`.

---

## File Structure

**Backend — create:**
| File | Responsibility |
|---|---|
| `backend/stocks/models/plan.py` | `DailyTradingPlan` model |
| `backend/stocks/services/confluence.py` | Confluence component scorers + entry freshness (pure functions) |
| `backend/stocks/services/analogs.py` | Historical analog engine |
| `backend/stocks/services/catalysts.py` | Catalyst calendar queries |
| `backend/stocks/services/daily_plan.py` | Plan builder orchestration + user overlay + next trading date |
| `backend/stocks/views/plan.py` | `GET plan/today/` and `GET plan/` API views |
| `backend/tests/test_confluence.py`, `test_analogs.py`, `test_catalysts.py`, `test_daily_plan.py`, `test_plan_api.py` | Tests |

**Backend — modify:** `stocks/models/__init__.py`, `stocks/models/system.py` (new notification + upload types), `stocks/tasks.py`, `stockastic/settings.py` (beat schedule), `stocks/views/__init__.py`, `stocks/urls.py`, `seed_permissions.py`.

**Frontend — create:** `src/app/(authenticated)/plan/page.tsx`, `src/components/plan/PickCard.tsx`, `src/__tests__/unit/PlanPickCard.test.tsx`.

**Frontend — modify:** `src/middleware.ts`, `src/components/DashboardLayout.tsx` (nav item), `src/components/AlertsDropdown.tsx` (notification mapping).

---

### Task 1: `DailyTradingPlan` model

**Files:**
- Create: `backend/stocks/models/plan.py`
- Modify: `backend/stocks/models/__init__.py`
- Test: `backend/tests/test_daily_plan.py`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_daily_plan.py`:

```python
import pytest
from datetime import date


@pytest.mark.django_db
class TestDailyTradingPlanModel:
    def test_create_and_unique_date(self):
        from stocks.models import DailyTradingPlan
        plan = DailyTradingPlan.objects.create(
            date=date(2026, 6, 11),
            regime="RISK_ON",
            breadth=0.65,
            payload={"picks": [], "exits": [], "catalysts": [], "market_context": {}},
        )
        assert plan.generated_at is not None
        assert plan.payload["picks"] == []
        from django.db import IntegrityError, transaction
        with pytest.raises(IntegrityError):
            with transaction.atomic():
                DailyTradingPlan.objects.create(date=date(2026, 6, 11), regime="NEUTRAL", payload={})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/jugalraj/Documents/Projects/Stockastic/backend && python -m pytest tests/test_daily_plan.py -v`
Expected: FAIL with `ImportError: cannot import name 'DailyTradingPlan'`

- [ ] **Step 3: Create the model**

Create `backend/stocks/models/plan.py`:

```python
from django.db import models


class DailyTradingPlan(models.Model):
    """One precomputed plan per trading day. `date` is the session the plan is FOR
    (the next trading day at generation time), not the generation day."""

    date = models.DateField(unique=True, db_index=True)
    generated_at = models.DateTimeField(auto_now=True)
    regime = models.CharField(max_length=10, default="UNKNOWN")  # RISK_ON | NEUTRAL | RISK_OFF | UNKNOWN
    breadth = models.FloatField(null=True, blank=True)
    payload = models.JSONField(default=dict, blank=True)  # {picks, exits, catalysts, market_context}

    class Meta:
        ordering = ["-date"]

    def __str__(self):
        return f"Plan for {self.date} ({self.regime})"
```

Modify `backend/stocks/models/__init__.py` — add after the signal import line:

```python
from .plan import DailyTradingPlan
```

- [ ] **Step 4: Generate migration**

Run: `cd /Users/jugalraj/Documents/Projects/Stockastic/backend && python manage.py makemigrations stocks --name dailytradingplan`
Expected: creates `stocks/migrations/0035_dailytradingplan.py` (number may differ if other migrations landed; use whatever is generated).

- [ ] **Step 5: Run test to verify it passes**

Run: `python -m pytest tests/test_daily_plan.py -v`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add stocks/models/plan.py stocks/models/__init__.py stocks/migrations/ ../docs/superpowers/plans/2026-06-10-next-day-trading-plan.md tests/test_daily_plan.py
git commit -m "feat(plan): DailyTradingPlan model"
```

---

### Task 2: Confluence component scorers

**Files:**
- Create: `backend/stocks/services/confluence.py`
- Test: `backend/tests/test_confluence.py`

Spec weights: engines 35%, opportunity 35%, accumulation 20%, sector 10%. DIVERGENT opportunity rows are ignored (never feed the score); active SELL/DISTRIBUTION_ALERT episodes subtract from engine agreement.

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_confluence.py`:

```python
import pytest
from stocks.services.confluence import (
    engine_component, opportunity_component, accumulation_component,
    sector_component, confluence_score,
)


class TestEngineComponent:
    def test_three_buy_sources_no_conflict(self):
        assert engine_component({"SMART_MONEY", "ICHIMOKU", "VOLUME_BREAKOUT"}, set()) == 75.0

    def test_conflicting_sell_source_subtracts(self):
        assert engine_component({"SMART_MONEY", "ICHIMOKU"}, {"DISTRIBUTION_ALERT"}) == 25.0

    def test_floor_at_zero_and_cap_at_four(self):
        assert engine_component({"A"}, {"B", "C"}) == 0.0
        assert engine_component({"A", "B", "C", "D", "E"}, set()) == 100.0


class TestOpportunityComponent:
    def test_confirmed_significant(self):
        assert opportunity_component({"trust": "CONFIRMED", "pvalue": 0.02}) == 100.0

    def test_confirmed_not_significant(self):
        assert opportunity_component({"trust": "CONFIRMED", "pvalue": 0.30}) == 80.0

    def test_unconfirmed(self):
        assert opportunity_component({"trust": "UNCONFIRMED", "pvalue": 0.01}) == 60.0
        assert opportunity_component({"trust": "UNCONFIRMED", "pvalue": 0.50}) == 40.0

    def test_absent_or_divergent_is_zero(self):
        assert opportunity_component(None) == 0.0
        assert opportunity_component({"trust": "DIVERGENT", "pvalue": 0.01}) == 0.0


class TestAccumulationComponent:
    def test_below_wac_with_inflow(self):
        eps = [{"inst_net_5d": 150000, "markup_percent": -2.1}]
        assert accumulation_component(eps) == 100.0

    def test_near_wac(self):
        assert accumulation_component([{"inst_net_5d": 50000, "markup_percent": 4.0}]) == 70.0

    def test_inflow_only(self):
        assert accumulation_component([{"inst_net_5d": 50000, "markup_percent": 12.0}]) == 40.0

    def test_no_data_or_outflow(self):
        assert accumulation_component([{}]) == 0.0
        assert accumulation_component([{"inst_net_5d": -10000, "markup_percent": -5}]) == 0.0

    def test_best_across_episodes(self):
        eps = [{"inst_net_5d": 1, "markup_percent": 50}, {"inst_net_5d": 1, "markup_percent": -1}]
        assert accumulation_component(eps) == 100.0


class TestSectorComponent:
    def test_bands(self):
        assert sector_component(12.4) == 100.0
        assert sector_component(-8.0) == 0.0
        assert sector_component(1.0) == 50.0
        assert sector_component(None) == 50.0


class TestConfluenceScore:
    def test_weighted_sum_and_breakdown(self):
        score, components = confluence_score(
            buy_sources={"SMART_MONEY", "ICHIMOKU", "VOLUME_BREAKOUT"},
            sell_sources=set(),
            opportunity_row={"trust": "CONFIRMED", "pvalue": 0.02},
            episode_metadatas=[{"inst_net_5d": 150000, "markup_percent": -2.1}],
            sector_intensity=12.4,
        )
        # 0.35*75 + 0.35*100 + 0.20*100 + 0.10*100 = 26.25 + 35 + 20 + 10 = 91.25 → round 91
        assert score == 91
        assert components["engine_agreement"]["score"] == 75.0
        assert components["opportunity"]["score"] == 100.0
        assert components["accumulation"]["score"] == 100.0
        assert components["sector"]["score"] == 100.0
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/test_confluence.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'stocks.services.confluence'`

- [ ] **Step 3: Implement the scorers**

Create `backend/stocks/services/confluence.py`:

```python
"""Cross-engine confluence scoring for the daily trading plan.

Pure functions over already-fetched data so they are trivially testable.
Weights per spec: engines 35%, opportunity 35%, accumulation 20%, sector 10%.
"""

WEIGHTS = {"engines": 0.35, "opportunity": 0.35, "accumulation": 0.20, "sector": 0.10}

# Sector intensity boundaries mirror sector_rotation's accumulating/distributing bands.
SECTOR_ACCUMULATING = 3.0
SECTOR_DISTRIBUTING = -3.0


def engine_component(buy_sources, sell_sources):
    """Distinct ACTIVE BUY sources minus conflicting SELL-side sources, capped at 4 → 0-100."""
    raw = len(set(buy_sources)) - len(set(sell_sources))
    return max(0.0, min(float(raw), 4.0)) / 4.0 * 100.0


def opportunity_component(opp_row):
    """Map the opportunity engine's trust/significance onto 0-100.

    DIVERGENT rows must be filtered out by the caller before symbol selection;
    if one reaches here it scores 0 (defense in depth).
    """
    if not opp_row:
        return 0.0
    trust = opp_row.get("trust")
    significant = (opp_row.get("pvalue") or 1.0) <= 0.05
    if trust == "CONFIRMED":
        return 100.0 if significant else 80.0
    if trust == "UNCONFIRMED":
        return 60.0 if significant else 40.0
    return 0.0


def accumulation_component(episode_metadatas):
    """Best accumulation context across the symbol's active episodes.

    Uses keys the SMART_MONEY engine already writes: inst_net_5d, markup_percent
    (price premium over top-broker WAC). Episodes without these keys contribute 0.
    """
    best = 0.0
    for md in episode_metadatas:
        md = md or {}
        net = md.get("inst_net_5d")
        markup = md.get("markup_percent")
        if net is None or net <= 0:
            continue
        if markup is not None and markup <= 0:
            best = max(best, 100.0)
        elif markup is not None and markup <= 5:
            best = max(best, 70.0)
        else:
            best = max(best, 40.0)
    return best


def sector_component(intensity):
    """Sector accumulation intensity → 0/50/100. None (unknown sector) is neutral."""
    if intensity is None:
        return 50.0
    if intensity > SECTOR_ACCUMULATING:
        return 100.0
    if intensity < SECTOR_DISTRIBUTING:
        return 0.0
    return 50.0


def confluence_score(buy_sources, sell_sources, opportunity_row, episode_metadatas, sector_intensity):
    """Weighted 0-100 score plus a per-component breakdown for the UI."""
    eng = engine_component(buy_sources, sell_sources)
    opp = opportunity_component(opportunity_row)
    acc = accumulation_component(episode_metadatas)
    sec = sector_component(sector_intensity)
    score = (
        WEIGHTS["engines"] * eng
        + WEIGHTS["opportunity"] * opp
        + WEIGHTS["accumulation"] * acc
        + WEIGHTS["sector"] * sec
    )
    components = {
        "engine_agreement": {
            "score": eng,
            "active_buy_sources": sorted(set(buy_sources)),
            "conflicting_sources": sorted(set(sell_sources)),
        },
        "opportunity": {
            "score": opp,
            "trust": (opportunity_row or {}).get("trust"),
            "edge": (opportunity_row or {}).get("edge"),
            "pvalue": (opportunity_row or {}).get("pvalue"),
        },
        "accumulation": {"score": acc},
        "sector": {"score": sec, "acc_intensity": sector_intensity},
    }
    return round(score), components
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/test_confluence.py -v`
Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add stocks/services/confluence.py tests/test_confluence.py
git commit -m "feat(plan): confluence component scorers"
```

---

### Task 3: Entry freshness / validity filter

**Files:**
- Modify: `backend/stocks/services/confluence.py` (append)
- Test: `backend/tests/test_confluence.py` (append)

Rule per spec: actionable iff latest close ∈ `entry ± 1×ATR(14)` AND signal age ≤ 5 trading days. ATR is computed with pandas (no talib dependency in this service).

- [ ] **Step 1: Write the failing tests** (append to `tests/test_confluence.py`)

```python
import pandas as pd
import numpy as np
from stocks.services.confluence import compute_atr, entry_status


def _price_df(closes, spread=2.0):
    n = len(closes)
    idx = pd.bdate_range("2026-05-01", periods=n)  # weekday spacing is irrelevant here
    closes = pd.Series(closes, index=idx, dtype=float)
    return pd.DataFrame({
        "Open": closes, "High": closes + spread, "Low": closes - spread,
        "Close": closes, "Volume": np.full(n, 1000.0),
    }, index=idx)


class TestComputeAtr:
    def test_constant_range_atr(self):
        df = _price_df([100.0] * 20, spread=2.0)
        # TR is high-low = 4.0 every bar → ATR(14) = 4.0
        assert compute_atr(df, period=14) == pytest.approx(4.0)

    def test_insufficient_history_returns_none(self):
        assert compute_atr(_price_df([100.0] * 5), period=14) is None


class TestEntryStatus:
    def test_in_zone(self):
        df = _price_df([100.0] * 30)
        status, lo, hi = entry_status(entry_price=101.0, signal_age_days=1, price_df=df)
        assert status == "IN_ZONE"
        assert lo == pytest.approx(97.0)   # 101 - 4
        assert hi == pytest.approx(105.0)  # 101 + 4

    def test_extended_when_price_left_zone(self):
        df = _price_df([100.0] * 29 + [120.0])
        status, _, _ = entry_status(entry_price=100.0, signal_age_days=1, price_df=df)
        assert status == "EXTENDED"

    def test_stale_when_signal_old(self):
        df = _price_df([100.0] * 30)
        status, _, _ = entry_status(entry_price=100.0, signal_age_days=9, price_df=df)
        assert status == "STALE"

    def test_no_atr_falls_back_to_pct_zone(self):
        df = _price_df([100.0] * 5)  # too short for ATR
        status, lo, hi = entry_status(entry_price=100.0, signal_age_days=1, price_df=df)
        assert status == "IN_ZONE"
        assert lo == pytest.approx(97.0)   # fallback ±3%
        assert hi == pytest.approx(103.0)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/test_confluence.py -v -k "Atr or EntryStatus"`
Expected: FAIL with `ImportError: cannot import name 'compute_atr'`

- [ ] **Step 3: Implement** (append to `stocks/services/confluence.py`)

```python
ATR_PERIOD = 14
ATR_ZONE_MULT = 1.0
MAX_SIGNAL_AGE_DAYS = 5
FALLBACK_ZONE_PCT = 0.03  # when history is too short for ATR


def compute_atr(price_df, period=ATR_PERIOD):
    """Simple-moving-average ATR over an OHLC frame (columns Open/High/Low/Close).

    Returns None when there are fewer than `period + 1` bars.
    """
    if price_df is None or len(price_df) < period + 1:
        return None
    high, low, close = price_df["High"], price_df["Low"], price_df["Close"]
    prev_close = close.shift(1)
    import pandas as pd
    tr = pd.concat(
        [(high - low), (high - prev_close).abs(), (low - prev_close).abs()], axis=1
    ).max(axis=1)
    atr = tr.rolling(period).mean().iloc[-1]
    return None if atr != atr else float(atr)  # NaN check


def entry_status(entry_price, signal_age_days, price_df):
    """('IN_ZONE'|'EXTENDED'|'STALE', zone_low, zone_high).

    STALE: last confirming signal older than MAX_SIGNAL_AGE_DAYS trading days.
    EXTENDED: fresh signal but latest close outside entry ± 1×ATR(14).
    """
    entry = float(entry_price)
    atr = compute_atr(price_df)
    if atr is None:
        zone_low, zone_high = entry * (1 - FALLBACK_ZONE_PCT), entry * (1 + FALLBACK_ZONE_PCT)
    else:
        zone_low, zone_high = entry - ATR_ZONE_MULT * atr, entry + ATR_ZONE_MULT * atr
    if signal_age_days > MAX_SIGNAL_AGE_DAYS:
        return "STALE", zone_low, zone_high
    latest_close = float(price_df["Close"].iloc[-1])
    if zone_low <= latest_close <= zone_high:
        return "IN_ZONE", zone_low, zone_high
    return "EXTENDED", zone_low, zone_high
```

- [ ] **Step 4: Run the full test file**

Run: `python -m pytest tests/test_confluence.py -v`
Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add stocks/services/confluence.py tests/test_confluence.py
git commit -m "feat(plan): ATR entry-zone freshness filter"
```

---

### Task 4: Historical analog engine

**Files:**
- Create: `backend/stocks/services/analogs.py`
- Test: `backend/tests/test_analogs.py`

Fingerprint = (accumulation-intensity bucket, RSI band, regime proxy). Regime proxy per historical day = NEPSE index close vs its own 200-day SMA (cheap, one `DailyIndexValue` series); if index history is insufficient the regime dimension is dropped from matching. Suppress output when n < 5.

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_analogs.py`:

```python
import pytest
import numpy as np
import pandas as pd
from stocks.services.analogs import (
    intensity_bucket, rsi_band, compute_rsi, forward_return_stats, analog_stats,
)


class TestBuckets:
    def test_intensity_bucket(self):
        assert intensity_bucket(15.0) == "STRONG"
        assert intensity_bucket(5.0) == "MILD"
        assert intensity_bucket(0.0) == "FLAT"
        assert intensity_bucket(-7.0) == "NEG"

    def test_rsi_band(self):
        assert rsi_band(25.0) == "OVERSOLD"
        assert rsi_band(45.0) == "LOW"
        assert rsi_band(60.0) == "HIGH"
        assert rsi_band(75.0) == "OVERBOUGHT"


class TestComputeRsi:
    def test_all_gains_is_100(self):
        closes = pd.Series(np.arange(1.0, 31.0))
        rsi = compute_rsi(closes, period=14)
        assert rsi.iloc[-1] == pytest.approx(100.0)


class TestForwardReturnStats:
    def test_medians_and_winrate(self):
        closes = pd.Series([100.0, 102, 104, 106, 108, 110, 112, 114, 116, 118, 120],
                           index=pd.RangeIndex(11))
        # match days at positions 0 and 2
        stats = forward_return_stats(closes, match_positions=[0, 2])
        assert stats["n"] == 2
        assert stats["fwd_1d_median_pct"] == pytest.approx(2.0, abs=0.1)
        assert stats["win_rate_3d"] == 1.0

    def test_none_when_fewer_than_five_matches(self):
        closes = pd.Series([100.0] * 20)
        assert forward_return_stats(closes, match_positions=[1, 2, 3]) is None


@pytest.mark.django_db
class TestAnalogStats:
    def test_returns_none_with_no_history(self):
        assert analog_stats("NOSUCH") is None
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/test_analogs.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'stocks.services.analogs'`

- [ ] **Step 3: Implement**

Create `backend/stocks/services/analogs.py`:

```python
"""Historical analog engine: "the last N times this setup appeared on this symbol".

Fingerprint = (accumulation-intensity bucket, RSI band, regime proxy).
Regime proxy = NEPSE index close vs its 200-day SMA on that day; dropped from the
fingerprint when index history is insufficient. Results with n < 5 are suppressed
(return None) — no fake base rates.
"""
import numpy as np
import pandas as pd

from stocks.services.backtest_harness import load_price_df

MIN_MATCHES = 5
ACC_WINDOW = 10
VOL_WINDOW = 20
RSI_PERIOD = 14
INDEX_SMA = 200


def intensity_bucket(intensity):
    if intensity > 10:
        return "STRONG"
    if intensity > 3:
        return "MILD"
    if intensity >= -3:
        return "FLAT"
    return "NEG"


def rsi_band(rsi):
    if rsi < 30:
        return "OVERSOLD"
    if rsi < 50:
        return "LOW"
    if rsi < 70:
        return "HIGH"
    return "OVERBOUGHT"


def compute_rsi(closes, period=RSI_PERIOD):
    """Wilder RSI as a pandas Series aligned to `closes`."""
    delta = closes.diff()
    gain = delta.clip(lower=0).ewm(alpha=1 / period, min_periods=period).mean()
    loss = (-delta.clip(upper=0)).ewm(alpha=1 / period, min_periods=period).mean()
    rs = gain / loss.replace(0, np.nan)
    rsi = 100 - (100 / (1 + rs))
    return rsi.fillna(100.0).where(loss.notna(), np.nan)


def forward_return_stats(closes, match_positions):
    """Median forward 1/3/5-day returns + 3-day win rate over matched positions.

    `closes` is a Series; `match_positions` are integer positions into it.
    Positions without a full 5-day forward window are dropped. Returns None if
    fewer than MIN_MATCHES survive.
    """
    arr = closes.to_numpy(dtype=float)
    rows = []
    for p in match_positions:
        if p + 5 >= len(arr):
            continue
        base = arr[p]
        if base <= 0:
            continue
        rows.append((
            (arr[p + 1] / base - 1) * 100,
            (arr[p + 3] / base - 1) * 100,
            (arr[p + 5] / base - 1) * 100,
        ))
    if len(rows) < MIN_MATCHES:
        return None
    f1, f3, f5 = (np.array([r[i] for r in rows]) for i in range(3))
    return {
        "n": len(rows),
        "fwd_1d_median_pct": round(float(np.median(f1)), 2),
        "fwd_3d_median_pct": round(float(np.median(f3)), 2),
        "fwd_5d_median_pct": round(float(np.median(f5)), 2),
        "win_rate_3d": round(float((f3 > 0).mean()), 2),
    }


def _daily_total_accumulation(symbol):
    """Total cumulative_net per day (summed across entities) as a date-indexed Series."""
    from django.db.models import Sum
    from stocks.models import DailyCumulativeAccumulation
    rows = (
        DailyCumulativeAccumulation.objects.filter(symbol=symbol)
        .values("transaction_date")
        .annotate(total=Sum("cumulative_net"))
        .order_by("transaction_date")
    )
    if not rows:
        return None
    s = pd.Series({r["transaction_date"]: float(r["total"] or 0) for r in rows})
    s.index = pd.to_datetime(s.index)
    return s


def _index_regime_series():
    """Boolean Series (date → above 200-SMA) for the NEPSE index, or None."""
    from stocks.models import DailyIndexValue
    rows = (
        DailyIndexValue.objects.filter(index_name__iexact="NEPSE")
        .values_list("date", "value").order_by("date")
    )
    if len(rows) < INDEX_SMA + 1:
        return None
    s = pd.Series({d: float(v) for d, v in rows})
    s.index = pd.to_datetime(s.index)
    return s > s.rolling(INDEX_SMA).mean()


def analog_stats(symbol, as_of=None):
    """Forward-return base rates for days matching today's fingerprint, or None."""
    df = load_price_df(symbol)  # corporate-action adjusted; DatetimeIndex, OHLCV
    if df is None or len(df) < 60:
        return None
    if as_of is not None:
        df = df.loc[: pd.Timestamp(as_of)]
        if len(df) < 60:
            return None

    closes, volume = df["Close"], df["Volume"]
    acc = _daily_total_accumulation(symbol)
    if acc is None:
        return None
    acc = acc.reindex(df.index).ffill()
    acc_mom = acc - acc.shift(ACC_WINDOW)
    vol_avg = volume.rolling(VOL_WINDOW).mean()
    intensity = (acc_mom / vol_avg.replace(0, np.nan) * 100).clip(-50, 50)
    rsi = compute_rsi(closes)

    regime = _index_regime_series()
    if regime is not None:
        regime = regime.reindex(df.index).ffill()

    valid = intensity.notna() & rsi.notna()
    if regime is not None:
        valid &= regime.notna()
    if not valid.iloc[-1]:
        return None

    today_fp = (intensity_bucket(float(intensity.iloc[-1])), rsi_band(float(rsi.iloc[-1])),
                bool(regime.iloc[-1]) if regime is not None else None)

    match_positions = []
    n = len(df)
    for i in range(n - 1):  # exclude today itself
        if not valid.iloc[i]:
            continue
        fp = (intensity_bucket(float(intensity.iloc[i])), rsi_band(float(rsi.iloc[i])),
              bool(regime.iloc[i]) if regime is not None else None)
        if fp == today_fp:
            match_positions.append(i)
    return forward_return_stats(closes, match_positions)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/test_analogs.py -v`
Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add stocks/services/analogs.py tests/test_analogs.py
git commit -m "feat(plan): historical analog engine with n<5 suppression"
```

---

### Task 5: Catalyst calendar

**Files:**
- Create: `backend/stocks/services/catalysts.py`
- Test: `backend/tests/test_catalysts.py`

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_catalysts.py`:

```python
import pytest
from datetime import date
from stocks.services.catalysts import upcoming_catalysts


@pytest.mark.django_db
class TestUpcomingCatalysts:
    def test_book_close_within_window(self):
        from stocks.models import Dividend
        Dividend.objects.create(ticker="NABIL", fiscal_year="2082/83",
                                bonus_percent=10, cash_percent=5, total_percent=15,
                                book_close_date=date(2026, 6, 18))
        Dividend.objects.create(ticker="OLD", fiscal_year="2081/82",
                                total_percent=10, book_close_date=date(2026, 1, 1))
        out = upcoming_catalysts(as_of=date(2026, 6, 12), horizon_days=14)
        assert len(out) == 1
        c = out[0]
        assert c["symbol"] == "NABIL"
        assert c["type"] == "BOOK_CLOSE"
        assert c["date"] == "2026-06-18"
        assert c["days_away"] == 6
        assert "10" in c["detail"]  # bonus pct mentioned

    def test_dividend_announcement(self):
        from stocks.models import FinancialReport
        FinancialReport.objects.create(ticker="NICA", fiscal_year="2082/83",
                                       report_type="ANNUAL",
                                       dividend_announced_date=date(2026, 6, 15))
        out = upcoming_catalysts(as_of=date(2026, 6, 12), horizon_days=14)
        assert any(c["symbol"] == "NICA" and c["type"] == "DIVIDEND_ANNOUNCED" for c in out)

    def test_sorted_by_date(self):
        from stocks.models import Dividend
        Dividend.objects.create(ticker="B", fiscal_year="x", total_percent=1,
                                book_close_date=date(2026, 6, 20))
        Dividend.objects.create(ticker="A", fiscal_year="x", total_percent=1,
                                book_close_date=date(2026, 6, 14))
        out = upcoming_catalysts(as_of=date(2026, 6, 12), horizon_days=14)
        assert [c["symbol"] for c in out] == ["A", "B"]
```

Note: if `FinancialReport.objects.create` in the second test fails on additional required fields, check `stocks/models/fundamentals.py` and supply minimal values — most fields are nullable.

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/test_catalysts.py -v`
Expected: FAIL with `ModuleNotFoundError`

- [ ] **Step 3: Implement**

Create `backend/stocks/services/catalysts.py`:

```python
"""Forward-looking catalyst calendar: book closes and dividend announcements."""
from datetime import date, timedelta

HORIZON_DAYS = 14


def upcoming_catalysts(as_of=None, horizon_days=HORIZON_DAYS):
    """Catalysts in (as_of, as_of + horizon_days], sorted by date.

    Each item: {symbol, type: BOOK_CLOSE|DIVIDEND_ANNOUNCED, date: iso, days_away, detail}.
    """
    from stocks.models import Dividend, FinancialReport

    as_of = as_of or date.today()
    end = as_of + timedelta(days=horizon_days)
    out = []

    for d in Dividend.objects.filter(book_close_date__gt=as_of, book_close_date__lte=end):
        out.append({
            "symbol": d.ticker,
            "type": "BOOK_CLOSE",
            "date": d.book_close_date.isoformat(),
            "days_away": (d.book_close_date - as_of).days,
            "detail": f"{d.fiscal_year}: bonus {d.bonus_percent}% + cash {d.cash_percent}%",
        })

    for r in FinancialReport.objects.filter(
        dividend_announced_date__gt=as_of, dividend_announced_date__lte=end
    ):
        out.append({
            "symbol": r.ticker,
            "type": "DIVIDEND_ANNOUNCED",
            "date": r.dividend_announced_date.isoformat(),
            "days_away": (r.dividend_announced_date - as_of).days,
            "detail": f"{r.fiscal_year} dividend announcement",
        })

    out.sort(key=lambda c: (c["date"], c["symbol"]))
    return out
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/test_catalysts.py -v`
Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add stocks/services/catalysts.py tests/test_catalysts.py
git commit -m "feat(plan): upcoming catalyst calendar"
```

---

### Task 6: Plan builder orchestration

**Files:**
- Create: `backend/stocks/services/daily_plan.py`
- Test: `backend/tests/test_daily_plan.py` (append)

The builder wires everything: regime, active BUY episodes grouped per symbol, DIVERGENT-filtered opportunity rows, sector intensities (reusing `_compute_current_acc_signals` from `stocks/views/sector_rotation.py` — deliberate reuse; relocating it is out of scope), freshness, analogs (top picks only), catalysts. Upserts one `DailyTradingPlan` keyed on the **next trading date** (skip Friday/Saturday).

- [ ] **Step 1: Write the failing tests** (append to `tests/test_daily_plan.py`)

```python
from datetime import date as date_cls
from decimal import Decimal
from unittest.mock import patch


def _seed_prices(ticker, closes, start=date_cls(2026, 4, 1)):
    """Seed consecutive weekday DailyStockPrice rows."""
    from datetime import timedelta
    from stocks.models import DailyStockPrice
    d = start
    for c in closes:
        while d.weekday() in (4, 5):  # skip Fri/Sat (NEPSE closed)
            d += timedelta(days=1)
        DailyStockPrice.objects.create(
            ticker=ticker, date=d,
            open=Decimal(str(c)), high=Decimal(str(c + 2)),
            low=Decimal(str(c - 2)), close=Decimal(str(c)), volume=Decimal("1000"),
        )
        d += timedelta(days=1)


class TestNextTradingDate:
    def test_skips_friday_and_saturday(self):
        from stocks.services.daily_plan import next_trading_date
        assert next_trading_date(date_cls(2026, 6, 11)) == date_cls(2026, 6, 14)  # Thu → Sun
        assert next_trading_date(date_cls(2026, 6, 14)) == date_cls(2026, 6, 15)  # Sun → Mon


@pytest.mark.django_db
class TestBuildDailyPlan:
    @patch("stocks.services.daily_plan.analog_stats", return_value=None)
    @patch("stocks.services.daily_plan.upcoming_catalysts", return_value=[])
    @patch("stocks.services.daily_plan._sector_intensities", return_value={})
    @patch("stocks.services.daily_plan.rank_opportunities")
    @patch("stocks.services.daily_plan.current_regime")
    def test_builds_picks_sorted_by_confluence(self, mock_regime, mock_opps, *_):
        from stocks.models import SignalEpisode, DailyTradingPlan
        from stocks.services.daily_plan import build_daily_plan

        mock_regime.return_value = {"regime": "RISK_ON", "breadth": 0.65, "as_of": "2026-06-10"}
        mock_opps.return_value = {
            "opportunities": [
                {"symbol": "NABIL", "trust": "CONFIRMED", "pvalue": 0.02, "edge": 0.15,
                 "producer": "SMART_MONEY", "close": 100.0, "score": 0.1},
                {"symbol": "BADCO", "trust": "DIVERGENT", "pvalue": 0.01, "edge": 0.30,
                 "producer": "ICHIMOKU", "close": 50.0, "score": -1.0},
            ],
            "exits": [], "skipped": 0,
        }
        latest = date_cls(2026, 6, 10)
        _seed_prices("NABIL", [100.0] * 30)
        _seed_prices("WEAK", [100.0] * 30)
        for src in ("SMART_MONEY", "ICHIMOKU", "VOLUME_BREAKOUT"):
            SignalEpisode.objects.create(
                source=src, producer_key=src, symbol="NABIL", direction="BUY",
                start_date=latest, last_signal_date=latest,
                entry_price=Decimal("100"), target_price=Decimal("120"),
                stop_loss_price=Decimal("90"), entry_strength=80,
                metadata={"inst_net_5d": 150000, "markup_percent": -2.0},
            )
        SignalEpisode.objects.create(
            source="ICHIMOKU", producer_key="ICHIMOKU", symbol="WEAK", direction="BUY",
            start_date=latest, last_signal_date=latest,
            entry_price=Decimal("100"), entry_strength=40, metadata={},
        )

        plan = build_daily_plan(as_of=latest)

        assert isinstance(plan, DailyTradingPlan)
        assert plan.date == date_cls(2026, 6, 11)  # Wed → Thu
        assert plan.regime == "RISK_ON"
        symbols = [p["symbol"] for p in plan.payload["picks"]]
        assert symbols[0] == "NABIL"          # higher confluence first
        assert "BADCO" not in symbols          # DIVERGENT row never creates a pick
        nabil = plan.payload["picks"][0]
        assert nabil["entry"]["status"] == "IN_ZONE"
        assert nabil["confluence_score"] > plan.payload["picks"][1]["confluence_score"]
        assert nabil["targets"]["sl"] == 90.0

    @patch("stocks.services.daily_plan.analog_stats", return_value=None)
    @patch("stocks.services.daily_plan.upcoming_catalysts", return_value=[])
    @patch("stocks.services.daily_plan._sector_intensities", return_value={})
    @patch("stocks.services.daily_plan.rank_opportunities",
           return_value={"opportunities": [], "exits": [], "skipped": 0})
    @patch("stocks.services.daily_plan.current_regime",
           return_value={"regime": "RISK_OFF", "breadth": 0.31, "as_of": "2026-06-10"})
    def test_idempotent_upsert(self, *_):
        from stocks.models import DailyTradingPlan
        from stocks.services.daily_plan import build_daily_plan
        _seed_prices("ANY", [100.0] * 30)
        build_daily_plan(as_of=date_cls(2026, 6, 10))
        build_daily_plan(as_of=date_cls(2026, 6, 10))
        assert DailyTradingPlan.objects.count() == 1
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/test_daily_plan.py -v`
Expected: new tests FAIL with `ImportError` (model test from Task 1 still passes)

- [ ] **Step 3: Implement**

Create `backend/stocks/services/daily_plan.py`:

```python
"""Builds the precomputed Next-Day Trading Plan and the per-user overlay.

Global plan: one DailyTradingPlan row per next trading date, generated nightly
after signal generation. Overlay: cheap read-time queries per user.
"""
import logging
from datetime import date, timedelta
from collections import defaultdict

import pandas as pd

from stocks.services.market_regime import current_regime
from stocks.services.opportunity_engine import rank_opportunities
from stocks.services.confluence import confluence_score, entry_status
from stocks.services.analogs import analog_stats
from stocks.services.catalysts import upcoming_catalysts
from stocks.services.backtest_harness import load_price_df

logger = logging.getLogger(__name__)

MAX_PICKS = 5
SELL_SIDE_SOURCES = {"DISTRIBUTION_ALERT"}  # SELL-direction episodes also count as conflicts


def next_trading_date(after):
    """Next NEPSE session strictly after `after` (NEPSE closed Friday & Saturday)."""
    d = after + timedelta(days=1)
    while d.weekday() in (4, 5):  # Fri=4, Sat=5
        d += timedelta(days=1)
    return d


def _sector_intensities():
    """symbol → sector acc_intensity, via the sector-rotation helper."""
    from stocks.models import Company
    from stocks.views.sector_rotation import _compute_current_acc_signals
    mapping = defaultdict(list)
    for symbol, sector in Company.objects.exclude(sector="").values_list("symbol", "sector"):
        mapping[sector].append(symbol)
    try:
        per_sector = _compute_current_acc_signals(dict(mapping))
    except Exception:
        logger.exception("sector intensity computation failed; using neutral")
        return {}
    out = {}
    for sector, info in per_sector.items():
        for symbol in mapping.get(sector, []):
            out[symbol] = info.get("acc_intensity")
    return out


def _signal_age_trading_days(price_df, last_signal_date):
    """Trading days elapsed since the signal, measured on the symbol's own bars."""
    ts = pd.Timestamp(last_signal_date)
    return int((price_df.index > ts).sum())


def _market_context(as_of):
    from stocks.models import DailyMarketSummary
    summary = DailyMarketSummary.objects.filter(date__lte=as_of).order_by("-date").first()
    if not summary:
        return {}
    return {
        "as_of": summary.date.isoformat(),
        "total_turnover": float(summary.total_turnover or 0),
        "total_volume": float(summary.total_volume or 0),
    }


def build_daily_plan(as_of=None):
    """Build and upsert the plan. `as_of` = latest completed session (default: latest price date)."""
    from stocks.models import DailyStockPrice, DailyTradingPlan, SignalEpisode

    if as_of is None:
        latest = DailyStockPrice.objects.order_by("-date").values_list("date", flat=True).first()
        if latest is None:
            raise ValueError("no price data; cannot build plan")
        as_of = latest

    regime_info = current_regime(as_of=as_of)
    opp_result = rank_opportunities(limit=50)
    opp_by_symbol = {}
    for row in opp_result.get("opportunities", []):
        if row.get("trust") == "DIVERGENT":
            continue  # spec: DIVERGENT never feeds a pick
        # keep the best-scoring non-divergent row per symbol
        cur = opp_by_symbol.get(row["symbol"])
        if cur is None or (row.get("score") or 0) > (cur.get("score") or 0):
            opp_by_symbol[row["symbol"]] = row

    active = SignalEpisode.objects.filter(end_date__isnull=True)
    buy_eps, sell_sources = defaultdict(list), defaultdict(set)
    for ep in active:
        if ep.direction == "BUY" and ep.source not in SELL_SIDE_SOURCES:
            buy_eps[ep.symbol].append(ep)
        else:
            sell_sources[ep.symbol].add(ep.source)

    sector_by_symbol = _sector_intensities()

    candidates = []
    for symbol, eps in buy_eps.items():
        price_df = load_price_df(symbol)
        if price_df is None or price_df.empty:
            continue
        price_df = price_df.loc[: pd.Timestamp(as_of)]
        if price_df.empty:
            continue
        score, components = confluence_score(
            buy_sources={e.source for e in eps},
            sell_sources=sell_sources.get(symbol, set()),
            opportunity_row=opp_by_symbol.get(symbol),
            episode_metadatas=[e.metadata for e in eps],
            sector_intensity=sector_by_symbol.get(symbol),
        )
        anchor = max(eps, key=lambda e: e.last_signal_date)  # freshest episode anchors the entry
        age = _signal_age_trading_days(price_df, anchor.last_signal_date)
        status, zone_low, zone_high = entry_status(anchor.entry_price, age, price_df)
        candidates.append({
            "symbol": symbol,
            "direction": "BUY",
            "confluence_score": score,
            "components": components,
            "entry": {
                "price": float(anchor.entry_price),
                "zone_low": round(zone_low, 2),
                "zone_high": round(zone_high, 2),
                "status": status,
                "last_signal_age_days": age,
                "latest_close": float(price_df["Close"].iloc[-1]),
            },
            "targets": {
                "tp1": float(anchor.target_price) if anchor.target_price else None,
                "sl": float(anchor.stop_loss_price) if anchor.stop_loss_price else None,
            },
            "analog": None,
            "catalyst": None,
        })

    candidates.sort(key=lambda c: -c["confluence_score"])
    in_zone = [c for c in candidates if c["entry"]["status"] == "IN_ZONE"]
    picks = in_zone[:MAX_PICKS]
    others = [c for c in candidates if c not in picks]

    catalysts = upcoming_catalysts(as_of=as_of)
    catalyst_by_symbol = {c["symbol"]: c for c in catalysts}
    for pick in picks:
        pick["analog"] = analog_stats(pick["symbol"], as_of=as_of)
        pick["catalyst"] = catalyst_by_symbol.get(pick["symbol"])

    exits = [
        {"symbol": row["symbol"], "producer": row.get("producer"), "close": row.get("close")}
        for row in opp_result.get("exits", [])
    ]

    plan_date = next_trading_date(as_of)
    plan, _created = DailyTradingPlan.objects.update_or_create(
        date=plan_date,
        defaults={
            "regime": regime_info.get("regime", "UNKNOWN"),
            "breadth": regime_info.get("breadth"),
            "payload": {
                "as_of": as_of.isoformat(),
                "picks": picks,
                "watch": others[:10],  # near-misses, labeled EXTENDED/STALE in entry.status
                "exits": exits,
                "catalysts": catalysts,
                "market_context": _market_context(as_of),
            },
        },
    )
    return plan
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/test_daily_plan.py -v`
Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add stocks/services/daily_plan.py tests/test_daily_plan.py
git commit -m "feat(plan): daily plan builder with confluence ranking"
```

---

### Task 7: Per-user overlay

**Files:**
- Modify: `backend/stocks/services/daily_plan.py` (append)
- Test: `backend/tests/test_daily_plan.py` (append)

Three read-time queries: positions within 2% of SL or any TP tier; ACTIVE SELL episodes on held tickers; watchlist levels crossed or within 2%.

- [ ] **Step 1: Write the failing tests** (append to `tests/test_daily_plan.py`)

```python
@pytest.mark.django_db
class TestUserOverlay:
    def _latest(self, ticker, close):
        from stocks.models import DailyStockPrice
        DailyStockPrice.objects.create(ticker=ticker, date=date_cls(2026, 6, 10),
                                       close=Decimal(str(close)))

    def test_position_near_stop_and_target(self, create_user):
        from stocks.models import PortfolioItem
        from stocks.services.daily_plan import user_overlay
        user = create_user(username="u1", password="x")
        self._latest("NABIL", 101.0)
        self._latest("SAFE", 150.0)
        PortfolioItem.objects.create(user=user, ticker="NABIL", quantity=10,
                                     buy_price=Decimal("110"),
                                     stop_loss_price=Decimal("100"),
                                     target_price=Decimal("130"))
        PortfolioItem.objects.create(user=user, ticker="SAFE", quantity=10,
                                     buy_price=Decimal("100"),
                                     stop_loss_price=Decimal("80"),
                                     target_price=Decimal("200"))
        overlay = user_overlay(user)
        tickers = [p["ticker"] for p in overlay["positions_near_action"]]
        assert "NABIL" in tickers and "SAFE" not in tickers
        nabil = next(p for p in overlay["positions_near_action"] if p["ticker"] == "NABIL")
        assert nabil["near"] == "STOP_LOSS"

    def test_signal_flip_against_holding(self, create_user):
        from stocks.models import PortfolioItem, SignalEpisode
        from stocks.services.daily_plan import user_overlay
        user = create_user(username="u2", password="x")
        self._latest("NICA", 500.0)
        PortfolioItem.objects.create(user=user, ticker="NICA", quantity=5,
                                     buy_price=Decimal("450"))
        SignalEpisode.objects.create(source="DISTRIBUTION_ALERT", producer_key="DISTRIBUTION_ALERT",
                                     symbol="NICA", direction="SELL",
                                     start_date=date_cls(2026, 6, 10),
                                     last_signal_date=date_cls(2026, 6, 10),
                                     entry_price=Decimal("500"))
        overlay = user_overlay(user)
        assert overlay["signal_flips"][0]["symbol"] == "NICA"
        assert overlay["signal_flips"][0]["source"] == "DISTRIBUTION_ALERT"

    def test_watchlist_trigger(self, create_user):
        from stocks.models import WatchlistItem
        from stocks.services.daily_plan import user_overlay
        user = create_user(username="u3", password="x")
        self._latest("SCB", 99.0)
        WatchlistItem.objects.create(user=user, ticker="SCB", target_price=Decimal("100"))
        overlay = user_overlay(user)
        assert overlay["watchlist_triggers"][0]["ticker"] == "SCB"

    def test_empty_for_user_with_nothing(self, create_user):
        from stocks.services.daily_plan import user_overlay
        user = create_user(username="u4", password="x")
        overlay = user_overlay(user)
        assert overlay == {"positions_near_action": [], "signal_flips": [], "watchlist_triggers": []}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/test_daily_plan.py -v -k Overlay`
Expected: FAIL with `ImportError: cannot import name 'user_overlay'`

- [ ] **Step 3: Implement** (append to `stocks/services/daily_plan.py`)

```python
NEAR_PCT = 0.02  # "within 2%" per spec


def _latest_closes(tickers):
    """ticker → latest close (float) for the given tickers."""
    from stocks.models import DailyStockPrice
    out = {}
    for t in set(tickers):
        row = (DailyStockPrice.objects.filter(ticker=t, close__isnull=False)
               .order_by("-date").values_list("close", flat=True).first())
        if row is not None:
            out[t] = float(row)
    return out


def _near(close, level):
    return level is not None and float(level) > 0 and abs(close - float(level)) / float(level) <= NEAR_PCT


def user_overlay(user):
    """Per-user actions for tomorrow. Cheap indexed queries; safe for read-time use."""
    from stocks.models import PortfolioItem, SignalEpisode, WatchlistItem

    items = list(PortfolioItem.objects.filter(user=user))
    watch = list(WatchlistItem.objects.filter(user=user))
    closes = _latest_closes([i.ticker for i in items] + [w.ticker for w in watch])

    positions = []
    for item in items:
        close = closes.get(item.ticker)
        if close is None:
            continue
        near = None
        if _near(close, item.stop_loss_price) or (
            item.stop_loss_price is not None and close <= float(item.stop_loss_price)
        ):
            near = "STOP_LOSS"
        else:
            for level, label in ((item.target_price, "TP1"), (item.target_price_2, "TP2"),
                                 (item.target_price_3, "TP3")):
                if _near(close, level) or (level is not None and close >= float(level)):
                    near = label
                    break
        if near:
            positions.append({"ticker": item.ticker, "near": near, "close": close,
                              "stop_loss_price": float(item.stop_loss_price) if item.stop_loss_price else None,
                              "target_price": float(item.target_price) if item.target_price else None})

    held = {i.ticker for i in items}
    flips = [
        {"symbol": ep.symbol, "source": ep.source, "since": ep.start_date.isoformat(),
         "strength": ep.entry_strength}
        for ep in SignalEpisode.objects.filter(
            end_date__isnull=True, direction="SELL", symbol__in=held)
    ]

    triggers = []
    for w in watch:
        close = closes.get(w.ticker)
        if close is None:
            continue
        if (_near(close, w.target_price) or _near(close, w.stop_loss_price)
                or (w.target_price is not None and close <= float(w.target_price))):
            triggers.append({"ticker": w.ticker, "close": close,
                             "target_price": float(w.target_price) if w.target_price else None,
                             "stop_loss_price": float(w.stop_loss_price) if w.stop_loss_price else None})

    return {"positions_near_action": positions, "signal_flips": flips,
            "watchlist_triggers": triggers}
```

Note on watchlist semantics: a watchlist `target_price` is a desired *entry* level, so `close <= target` (price came down to the level) or proximity both trigger.

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/test_daily_plan.py -v`
Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add stocks/services/daily_plan.py tests/test_daily_plan.py
git commit -m "feat(plan): per-user overlay (positions, flips, watchlist)"
```

---

### Task 8: Celery task, beat schedule, notification + upload types, permission seed

**Files:**
- Modify: `backend/stocks/models/system.py` (two new choice entries)
- Modify: `backend/stocks/tasks.py`
- Modify: `backend/stockastic/settings.py` (beat schedule)
- Modify: `backend/seed_permissions.py`
- Test: `backend/tests/test_daily_plan.py` (append)

- [ ] **Step 1: Write the failing test** (append to `tests/test_daily_plan.py`)

```python
@pytest.mark.django_db
class TestGenerateDailyPlanTask:
    @patch("stocks.services.daily_plan.build_daily_plan")
    def test_task_builds_plan_and_notifies(self, mock_build, create_user):
        from stocks.models import DailyTradingPlan, Notification
        from stocks.tasks import generate_daily_plan_task
        from users.models import TierPermission

        user = create_user(username="planuser", password="x")
        user.profile.subscription_tier = "PRO"
        user.profile.save()
        TierPermission.objects.create(tier="PRO", module_key="daily_plan", is_enabled=True)

        plan = DailyTradingPlan.objects.create(
            date=date_cls(2026, 6, 11), regime="RISK_ON",
            payload={"picks": [{"symbol": "NABIL"}], "catalysts": []},
        )
        mock_build.return_value = plan

        result = generate_daily_plan_task()

        assert result["plan_date"] == "2026-06-11"
        notif = Notification.objects.get(user=user)
        assert notif.type == "DAILY_PLAN_READY"
        assert notif.redirect_url == "/plan"

    @patch("stocks.services.daily_plan.build_daily_plan", side_effect=ValueError("no price data"))
    def test_task_failure_logged_not_raised(self, mock_build):
        from stocks.models import DataUploadLog
        from stocks.tasks import generate_daily_plan_task
        result = generate_daily_plan_task()
        assert result["status"] == "FAILED"
        log = DataUploadLog.objects.latest("created_at")
        assert log.upload_type == "PLAN"
        assert log.status == "FAILED"
```

Note: if `user.profile` doesn't exist automatically, check how other tests create profiles (a `post_save` signal usually creates it); if absent, create via `from users.models import Profile; Profile.objects.create(user=user, subscription_tier="PRO")`.

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_daily_plan.py -v -k Task`
Expected: FAIL with `ImportError: cannot import name 'generate_daily_plan_task'`

- [ ] **Step 3: Add the two choice entries**

In `backend/stocks/models/system.py`:

(a) In `DataUploadLog.UPLOAD_TYPES`, add after `('API_INGEST', 'API Ingestion'),`:

```python
        ('PLAN', 'Daily Plan'),
```

(b) In `Notification.NotificationType`, add after the Signal alerts group (near `SIGNAL_STRONG_SELL`):

```python
        # Daily plan
        DAILY_PLAN_READY = 'DAILY_PLAN_READY', "Tomorrow's Plan Ready"
```

Then generate the choices migration:

Run: `python manage.py makemigrations stocks --name plan_choice_types`
Expected: a new migration altering `datauploadlog.upload_type` and `notification.type`.

- [ ] **Step 4: Add the celery task**

Append to `backend/stocks/tasks.py`:

```python
@shared_task
def generate_daily_plan_task():
    """Nightly: build tomorrow's trading plan, then notify entitled users.

    Runs after generate_all_signals_task (which already evaluates episodes).
    On failure the previous plan keeps serving; we log to DataUploadLog.
    """
    from django.contrib.auth.models import User
    from stocks.models import DataUploadLog
    from stocks.services import daily_plan as daily_plan_service
    from stocks.services.notification_service import create_notification
    from users.models import TierPermission

    try:
        plan = daily_plan_service.build_daily_plan()
    except Exception as exc:
        DataUploadLog.objects.create(
            file_name="daily_plan", upload_type="PLAN", status="FAILED",
            error_message=str(exc),
        )
        return {"status": "FAILED", "error": str(exc)}

    DataUploadLog.objects.create(
        file_name=f"daily_plan_{plan.date.isoformat()}", upload_type="PLAN",
        status="SUCCESS", records_count=len(plan.payload.get("picks", [])),
    )

    enabled_tiers = list(
        TierPermission.objects.filter(module_key="daily_plan", is_enabled=True)
        .values_list("tier", flat=True)
    )
    users = User.objects.filter(is_active=True).filter(
        models.Q(profile__subscription_tier__in=enabled_tiers)
        | models.Q(is_superuser=True)
    ).distinct()
    pick_count = len(plan.payload.get("picks", []))
    notified = 0
    for user in users:
        create_notification(
            user=user,
            notification_type="DAILY_PLAN_READY",
            title=f"Tomorrow's Plan ready — {plan.date.isoformat()}",
            message=(
                f"{pick_count} high-confluence setup(s) for {plan.date.isoformat()} "
                f"(regime: {plan.regime})."
                if pick_count
                else f"No qualifying setups for {plan.date.isoformat()} (regime: {plan.regime})."
            ),
            ticker="SUMMARY",
            redirect_url="/plan",
            metadata={"plan_date": plan.date.isoformat(), "picks": pick_count},
        )
        notified += 1
    return {"plan_date": plan.date.isoformat(), "picks": pick_count, "notified": notified}
```

Also add `from django.db import models` to the imports at the top of `tasks.py` if not already present (used for `models.Q`).

- [ ] **Step 5: Add the beat schedule entry**

In `backend/stockastic/settings.py`, inside `CELERY_BEAT_SCHEDULE`, after the `"generate-signals-daily"` entry:

```python
    # Plan generation 30 min after signals so episodes/evaluation have landed.
    "generate-daily-plan": {
        "task": "stocks.tasks.generate_daily_plan_task",
        "schedule": crontab(hour=17, minute=30),
    },
```

- [ ] **Step 6: Seed the permission key**

In `backend/seed_permissions.py`, find the module-keys collection (it contains `'home'`, `'chat'`, `'market_overview'`, …) and add `'daily_plan'` alongside the global keys (same list/dict structure as `'home'` — match the file's existing format exactly, including which tiers get it enabled; enable for BASIC/PRO/ULTRA like `home`).

- [ ] **Step 7: Run tests**

Run: `python -m pytest tests/test_daily_plan.py -v`
Expected: all PASS

- [ ] **Step 8: Commit**

```bash
git add stocks/models/system.py stocks/migrations/ stocks/tasks.py ../backend/stockastic/settings.py seed_permissions.py tests/test_daily_plan.py
git commit -m "feat(plan): nightly generation task, DAILY_PLAN_READY notification, beat schedule"
```

(Adjust the settings.py path in `git add` if running from `backend/`: it is `stockastic/settings.py`.)

---

### Task 9: API endpoints

**Files:**
- Create: `backend/stocks/views/plan.py`
- Modify: `backend/stocks/views/__init__.py`, `backend/stocks/urls.py`
- Test: `backend/tests/test_plan_api.py`

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_plan_api.py`:

```python
import pytest
from datetime import date
from decimal import Decimal


@pytest.mark.django_db
class TestPlanAPI:
    def _make_plan(self, plan_date=date(2026, 6, 11)):
        from stocks.models import DailyTradingPlan
        return DailyTradingPlan.objects.create(
            date=plan_date, regime="RISK_ON", breadth=0.65,
            payload={"picks": [{"symbol": "NABIL", "confluence_score": 91}],
                     "watch": [], "exits": [], "catalysts": [], "market_context": {}},
        )

    def test_today_returns_latest_plan_with_overlay(self, auth_client):
        self._make_plan()
        resp = auth_client.get("/api/stocks/plan/today/")
        assert resp.status_code == 200
        data = resp.json()
        assert data["date"] == "2026-06-11"
        assert data["regime"] == "RISK_ON"
        assert data["payload"]["picks"][0]["symbol"] == "NABIL"
        assert set(data["overlay"].keys()) == {
            "positions_near_action", "signal_flips", "watchlist_triggers"}

    def test_today_404_when_no_plan(self, auth_client):
        resp = auth_client.get("/api/stocks/plan/today/")
        assert resp.status_code == 404

    def test_history_by_date_no_overlay(self, auth_client):
        self._make_plan(date(2026, 6, 8))
        self._make_plan(date(2026, 6, 11))
        resp = auth_client.get("/api/stocks/plan/?date=2026-06-08")
        assert resp.status_code == 200
        data = resp.json()
        assert data["date"] == "2026-06-08"
        assert "overlay" not in data

    def test_history_invalid_date(self, auth_client):
        resp = auth_client.get("/api/stocks/plan/?date=not-a-date")
        assert resp.status_code == 400

    def test_requires_auth(self, api_client):
        resp = api_client.get("/api/stocks/plan/today/")
        assert resp.status_code in (401, 403)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/test_plan_api.py -v`
Expected: FAIL with 404s (route not registered)

- [ ] **Step 3: Implement the views**

Create `backend/stocks/views/plan.py`:

```python
from datetime import datetime

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework import status

from ..models import DailyTradingPlan
from ..services.daily_plan import user_overlay


def _serialize(plan):
    return {
        "date": plan.date.isoformat(),
        "generated_at": plan.generated_at.isoformat(),
        "regime": plan.regime,
        "breadth": plan.breadth,
        "payload": plan.payload,
    }


class PlanTodayView(APIView):
    """Latest plan + the requesting user's overlay."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        plan = DailyTradingPlan.objects.order_by("-date").first()
        if plan is None:
            return Response({"detail": "No plan generated yet."},
                            status=status.HTTP_404_NOT_FOUND)
        data = _serialize(plan)
        data["overlay"] = user_overlay(request.user)
        return Response(data)


class PlanHistoryView(APIView):
    """Historical plan by ?date=YYYY-MM-DD (global payload only, no overlay)."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        date_str = request.GET.get("date")
        if not date_str:
            return Response({"detail": "date query param required"},
                            status=status.HTTP_400_BAD_REQUEST)
        try:
            plan_date = datetime.strptime(date_str, "%Y-%m-%d").date()
        except ValueError:
            return Response({"detail": "invalid date"}, status=status.HTTP_400_BAD_REQUEST)
        plan = DailyTradingPlan.objects.filter(date=plan_date).first()
        if plan is None:
            return Response({"detail": "No plan for that date."},
                            status=status.HTTP_404_NOT_FOUND)
        return Response(_serialize(plan))
```

Modify `backend/stocks/views/__init__.py` — add:

```python
from . import plan
```

Modify `backend/stocks/urls.py` — add near the opportunities route:

```python
# Daily trading plan
path('plan/today/', plan.PlanTodayView.as_view(), name='plan_today'),
path('plan/', plan.PlanHistoryView.as_view(), name='plan_history'),
```

(`plan` is available via the `views` package import; match the import style at the top of `urls.py` — other modules are imported like `from .views import opportunity`, so add `plan` to that import list.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/test_plan_api.py -v`
Expected: all PASS

- [ ] **Step 5: Run the whole backend suite for regressions**

Run: `python -m pytest tests/ -v --timeout=300 -x -q`
Expected: all PASS (pre-existing failures, if any, must be noted as pre-existing)

- [ ] **Step 6: Commit**

```bash
git add stocks/views/plan.py stocks/views/__init__.py stocks/urls.py tests/test_plan_api.py
git commit -m "feat(plan): plan/today and plan history API endpoints"
```

---

### Task 10: Frontend plumbing (middleware, nav, notification mapping)

**Files:**
- Modify: `frontend/src/middleware.ts`
- Modify: `frontend/src/components/DashboardLayout.tsx`
- Modify: `frontend/src/components/AlertsDropdown.tsx`

- [ ] **Step 1: Protect the route**

In `frontend/src/middleware.ts`, add `'/plan',` to the `protectedRoutes` array, and add the corresponding entry to the `config.matcher` array (follow the exact pattern of the existing `/market` entries, e.g. `'/plan/:path*'`).

- [ ] **Step 2: Add the nav item**

In `frontend/src/components/DashboardLayout.tsx`, in `navItems`, insert directly after the Home item (`{ name: 'Home', href: '/', ... }`):

```typescript
    { name: "Tomorrow's Plan", href: '/plan', icon: CalendarClock, permission: 'daily_plan', color: 'text-orange-500' },
```

Add `CalendarClock` to the existing `lucide-react` import list in the same file.

- [ ] **Step 3: Map the notification type**

In `frontend/src/components/AlertsDropdown.tsx`:

(a) Add `'DAILY_PLAN_READY'` to the `signals` array in `CATEGORIES`.

(b) In `getNotificationIcon`, add before the final `return`:

```typescript
    if (type === 'DAILY_PLAN_READY') return <CalendarClock size={14} className="stroke-[2.5]" />;
```

Add `CalendarClock` to the file's `lucide-react` import.

- [ ] **Step 4: Typecheck**

Run: `cd /Users/jugalraj/Documents/Projects/Stockastic/frontend && npx tsc --noEmit 2>&1 | grep -v __tests__`
Expected: no errors in the modified files (pre-existing `__tests__` mock-typing errors are excluded).

- [ ] **Step 5: Commit**

```bash
git add src/middleware.ts src/components/DashboardLayout.tsx src/components/AlertsDropdown.tsx
git commit -m "feat(plan): /plan route protection, nav entry, notification mapping"
```

---

### Task 11: `PickCard` component (TDD)

**Files:**
- Create: `frontend/src/components/plan/PickCard.tsx`
- Test: `frontend/src/__tests__/unit/PlanPickCard.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/__tests__/unit/PlanPickCard.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { PickCard, type PlanPick } from '@/components/plan/PickCard';

const basePick: PlanPick = {
    symbol: 'NABIL',
    direction: 'BUY',
    confluence_score: 91,
    components: {
        engine_agreement: { score: 75, active_buy_sources: ['SMART_MONEY', 'ICHIMOKU', 'VOLUME_BREAKOUT'], conflicting_sources: [] },
        opportunity: { score: 100, trust: 'CONFIRMED', edge: 0.15, pvalue: 0.02 },
        accumulation: { score: 100 },
        sector: { score: 100, acc_intensity: 12.4 },
    },
    entry: { price: 612, zone_low: 598.4, zone_high: 625.6, status: 'IN_ZONE', last_signal_age_days: 1, latest_close: 610 },
    targets: { tp1: 640, sl: 585 },
    analog: { n: 14, fwd_1d_median_pct: 0.8, fwd_3d_median_pct: 2.1, fwd_5d_median_pct: 2.9, win_rate_3d: 0.64 },
    catalyst: { type: 'BOOK_CLOSE', date: '2026-06-18', days_away: 6, detail: 'bonus 10%' },
};

describe('PickCard', () => {
    it('renders symbol, score, entry status, trust and analog base rate', () => {
        render(<PickCard pick={basePick} />);
        expect(screen.getByText('NABIL')).toBeInTheDocument();
        expect(screen.getByText('91')).toBeInTheDocument();
        expect(screen.getByText(/in zone/i)).toBeInTheDocument();
        expect(screen.getByText(/CONFIRMED/)).toBeInTheDocument();
        expect(screen.getByText(/\+2\.1%/)).toBeInTheDocument();   // 3d median
        expect(screen.getByText(/n=14/)).toBeInTheDocument();
        expect(screen.getByText(/book close/i)).toBeInTheDocument();
    });

    it('hides analog section when null and shows extended badge', () => {
        render(<PickCard pick={{ ...basePick, analog: null, entry: { ...basePick.entry, status: 'EXTENDED' } }} />);
        expect(screen.queryByText(/n=/)).not.toBeInTheDocument();
        expect(screen.getByText(/extended/i)).toBeInTheDocument();
    });

    it('links to the ticker page', () => {
        render(<PickCard pick={basePick} />);
        const link = screen.getByRole('link');
        expect(link).toHaveAttribute('href', '/ticker/NABIL');
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/jugalraj/Documents/Projects/Stockastic/frontend && npx vitest run src/__tests__/unit/PlanPickCard.test.tsx`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement**

Create `frontend/src/components/plan/PickCard.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, CalendarClock, Layers } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface PlanPick {
    symbol: string;
    direction: string;
    confluence_score: number;
    components: {
        engine_agreement: { score: number; active_buy_sources: string[]; conflicting_sources: string[] };
        opportunity: { score: number; trust: string | null; edge: number | null; pvalue: number | null };
        accumulation: { score: number };
        sector: { score: number; acc_intensity: number | null };
    };
    entry: { price: number; zone_low: number; zone_high: number; status: string; last_signal_age_days: number; latest_close: number };
    targets: { tp1: number | null; sl: number | null };
    analog: { n: number; fwd_1d_median_pct: number; fwd_3d_median_pct: number; fwd_5d_median_pct: number; win_rate_3d: number } | null;
    catalyst: { type: string; date: string; days_away: number; detail: string } | null;
}

const STATUS_STYLES: Record<string, string> = {
    IN_ZONE: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
    EXTENDED: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    STALE: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
};

const fmtPct = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`;

export function PickCard({ pick }: { pick: PlanPick }) {
    const { components, entry, targets, analog, catalyst } = pick;
    return (
        <Card className="overflow-hidden">
            <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                    <Link href={`/ticker/${pick.symbol}`} className="text-base font-bold hover:underline">
                        {pick.symbol}
                    </Link>
                    <div className="flex items-center gap-2">
                        <Badge className={cn('text-[10px] font-bold uppercase', STATUS_STYLES[entry.status] || '')}>
                            {entry.status.replace('_', ' ')}
                        </Badge>
                        <span className="text-2xl font-black tabular-nums">{pick.confluence_score}</span>
                    </div>
                </div>

                <div className="flex flex-wrap gap-1.5 text-[10px] font-semibold">
                    <Badge variant="outline" className="gap-1">
                        <Layers size={10} /> {components.engine_agreement.active_buy_sources.length} engines
                    </Badge>
                    {components.opportunity.trust && (
                        <Badge variant="outline">{components.opportunity.trust}</Badge>
                    )}
                    {catalyst && (
                        <Badge variant="outline" className="gap-1 text-orange-600 dark:text-orange-400">
                            <CalendarClock size={10} /> {catalyst.type.replace('_', ' ').toLowerCase()} in {catalyst.days_away}d
                        </Badge>
                    )}
                </div>

                <div className="grid grid-cols-3 gap-2 text-xs">
                    <div>
                        <p className="text-muted-foreground">Entry zone</p>
                        <p className="font-semibold tabular-nums">{entry.zone_low.toFixed(1)}–{entry.zone_high.toFixed(1)}</p>
                    </div>
                    <div>
                        <p className="text-muted-foreground">Last close</p>
                        <p className="font-semibold tabular-nums">{entry.latest_close.toFixed(1)}</p>
                    </div>
                    <div>
                        <p className="text-muted-foreground">TP / SL</p>
                        <p className="font-semibold tabular-nums">
                            {targets.tp1 ?? '—'} / {targets.sl ?? '—'}
                        </p>
                    </div>
                </div>

                {analog && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground border-t pt-2">
                        <TrendingUp size={12} className="text-emerald-500 shrink-0" />
                        <span>
                            Similar setups (n={analog.n}): {fmtPct(analog.fwd_3d_median_pct)} median over 3d,{' '}
                            {Math.round(analog.win_rate_3d * 100)}% win rate
                        </span>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/unit/PlanPickCard.test.tsx`
Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/plan/PickCard.tsx src/__tests__/unit/PlanPickCard.test.tsx
git commit -m "feat(plan): PickCard component"
```

---

### Task 12: `/plan` page

**Files:**
- Create: `frontend/src/app/(authenticated)/plan/page.tsx`

- [ ] **Step 1: Implement the page**

Create `frontend/src/app/(authenticated)/plan/page.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { PickCard, type PlanPick } from '@/components/plan/PickCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PageLoader } from '@/components/ui/StockLoader';
import api from '@/lib/api';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { ShieldAlert, Eye, CalendarClock, TrendingDown } from 'lucide-react';

interface Overlay {
    positions_near_action: { ticker: string; near: string; close: number; stop_loss_price: number | null; target_price: number | null }[];
    signal_flips: { symbol: string; source: string; since: string; strength: number }[];
    watchlist_triggers: { ticker: string; close: number; target_price: number | null; stop_loss_price: number | null }[];
}

interface Plan {
    date: string;
    generated_at: string;
    regime: string;
    breadth: number | null;
    payload: {
        as_of?: string;
        picks: PlanPick[];
        watch?: PlanPick[];
        exits?: { symbol: string; producer: string; close: number | null }[];
        catalysts: { symbol: string; type: string; date: string; days_away: number; detail: string }[];
        market_context?: Record<string, unknown>;
    };
    overlay?: Overlay;
}

const REGIME_STYLES: Record<string, string> = {
    RISK_ON: 'bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-900/20 dark:border-emerald-800 dark:text-emerald-300',
    NEUTRAL: 'bg-slate-50 border-slate-200 text-slate-700 dark:bg-slate-900/40 dark:border-slate-800 dark:text-slate-300',
    RISK_OFF: 'bg-rose-50 border-rose-200 text-rose-800 dark:bg-rose-900/20 dark:border-rose-800 dark:text-rose-300',
};

export default function PlanPage() {
    const [plan, setPlan] = useState<Plan | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        api.get('/api/stocks/plan/today/')
            .then(res => setPlan(res.data))
            .catch(err => setError(err?.response?.status === 404
                ? 'No plan has been generated yet. The plan is built every evening after market data lands.'
                : 'Could not load the plan.'))
            .finally(() => setLoading(false));
    }, []);

    if (loading) {
        return (
            <DashboardLayout title="Tomorrow's Plan" subtitle="Your next-session brief">
                <div className="flex items-center justify-center min-h-[50vh]">
                    <PageLoader text="Loading plan..." />
                </div>
            </DashboardLayout>
        );
    }

    if (error || !plan) {
        return (
            <DashboardLayout title="Tomorrow's Plan" subtitle="Your next-session brief">
                <div className="flex items-center justify-center min-h-[50vh] text-sm text-muted-foreground">
                    {error}
                </div>
            </DashboardLayout>
        );
    }

    const { payload, overlay } = plan;
    const breadthPct = plan.breadth != null ? Math.round(plan.breadth * 100) : null;
    const hasUserActions = overlay && (
        overlay.positions_near_action.length > 0 ||
        overlay.signal_flips.length > 0 ||
        overlay.watchlist_triggers.length > 0
    );

    return (
        <DashboardLayout title="Tomorrow's Plan" subtitle={`Session: ${format(new Date(plan.date), 'eeee, MMM dd')}`}>
            <div className="space-y-6 max-w-6xl">
                {/* Regime banner */}
                <div className={cn('rounded-xl border px-4 py-3 flex items-center justify-between', REGIME_STYLES[plan.regime] || REGIME_STYLES.NEUTRAL)}>
                    <div>
                        <p className="text-sm font-bold">{plan.regime.replace('_', ' ')}</p>
                        {breadthPct != null && (
                            <p className="text-xs opacity-80">{breadthPct}% of the universe is above its 200-day average.</p>
                        )}
                    </div>
                    <p className="text-xs opacity-70">Generated {format(new Date(plan.generated_at), 'MMM dd, HH:mm')}</p>
                </div>

                {/* Picks */}
                <section>
                    <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3">
                        Top setups for tomorrow
                    </h2>
                    {payload.picks.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                            {payload.picks.map(p => <PickCard key={p.symbol} pick={p} />)}
                        </div>
                    ) : (
                        <Card>
                            <CardContent className="py-10 text-center text-sm text-muted-foreground">
                                No high-trust setups for tomorrow
                                {breadthPct != null ? ` — breadth is ${breadthPct}%` : ''}. Consider sitting out.
                            </CardContent>
                        </Card>
                    )}
                </section>

                {/* Your actions */}
                {hasUserActions && overlay && (
                    <section>
                        <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3">Your actions</h2>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            {overlay.positions_near_action.length > 0 && (
                                <Card>
                                    <CardHeader className="pb-2"><CardTitle className="text-xs flex items-center gap-1.5"><ShieldAlert size={13} className="text-rose-500" /> Positions near action</CardTitle></CardHeader>
                                    <CardContent className="space-y-1.5 text-xs">
                                        {overlay.positions_near_action.map(p => (
                                            <div key={p.ticker} className="flex justify-between">
                                                <span className="font-semibold">{p.ticker}</span>
                                                <Badge variant="outline" className="text-[10px]">{p.near.replace('_', ' ')}</Badge>
                                            </div>
                                        ))}
                                    </CardContent>
                                </Card>
                            )}
                            {overlay.signal_flips.length > 0 && (
                                <Card>
                                    <CardHeader className="pb-2"><CardTitle className="text-xs flex items-center gap-1.5"><TrendingDown size={13} className="text-amber-500" /> Signals against holdings</CardTitle></CardHeader>
                                    <CardContent className="space-y-1.5 text-xs">
                                        {overlay.signal_flips.map(f => (
                                            <div key={`${f.symbol}-${f.source}`} className="flex justify-between">
                                                <span className="font-semibold">{f.symbol}</span>
                                                <span className="text-muted-foreground">{f.source.replace(/_/g, ' ').toLowerCase()}</span>
                                            </div>
                                        ))}
                                    </CardContent>
                                </Card>
                            )}
                            {overlay.watchlist_triggers.length > 0 && (
                                <Card>
                                    <CardHeader className="pb-2"><CardTitle className="text-xs flex items-center gap-1.5"><Eye size={13} className="text-blue-500" /> Watchlist triggers</CardTitle></CardHeader>
                                    <CardContent className="space-y-1.5 text-xs">
                                        {overlay.watchlist_triggers.map(w => (
                                            <div key={w.ticker} className="flex justify-between">
                                                <span className="font-semibold">{w.ticker}</span>
                                                <span className="tabular-nums text-muted-foreground">{w.close.toFixed(1)}</span>
                                            </div>
                                        ))}
                                    </CardContent>
                                </Card>
                            )}
                        </div>
                    </section>
                )}

                {/* Catalysts */}
                {payload.catalysts.length > 0 && (
                    <section>
                        <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
                            <CalendarClock size={13} /> Upcoming catalysts (14d)
                        </h2>
                        <div className="flex flex-wrap gap-2">
                            {payload.catalysts.map(c => (
                                <Badge key={`${c.symbol}-${c.type}-${c.date}`} variant="outline" className="text-xs gap-1.5 py-1.5 px-3">
                                    <span className="font-bold">{c.symbol}</span>
                                    <span className="text-muted-foreground">{c.type.replace('_', ' ').toLowerCase()} · {format(new Date(c.date), 'MMM dd')}</span>
                                </Badge>
                            ))}
                        </div>
                    </section>
                )}
            </div>
        </DashboardLayout>
    );
}
```

Note: check the actual loader export in `@/components/ui/StockLoader` (DashboardLayout imports `FullPageLoader`; `market/page.tsx` uses `PageLoader`). Use whichever exists — if only `FullPageLoader` exists, swap the import and usage.

- [ ] **Step 2: Typecheck and run all frontend tests**

Run: `npx tsc --noEmit 2>&1 | grep -v __tests__` → no errors in new files.
Run: `npx vitest run` → all PASS.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(authenticated)/plan/page.tsx"
git commit -m "feat(plan): /plan page with regime banner, picks, overlay, catalysts"
```

---

### Task 13: Full verification

- [ ] **Step 1: Backend suite**

Run: `cd /Users/jugalraj/Documents/Projects/Stockastic/backend && python -m pytest tests/ -q`
Expected: all PASS (note pre-existing failures separately if any).

- [ ] **Step 2: Frontend suite + typecheck**

Run: `cd /Users/jugalraj/Documents/Projects/Stockastic/frontend && npx vitest run && npx tsc --noEmit 2>&1 | grep -v __tests__`
Expected: tests PASS; no new type errors.

- [ ] **Step 3: Migration check**

Run: `cd /Users/jugalraj/Documents/Projects/Stockastic/backend && python manage.py makemigrations --check --dry-run`
Expected: "No changes detected" (all model changes captured in committed migrations).

- [ ] **Step 4: Smoke-test plan generation end-to-end (optional, needs DB with data)**

Run: `python manage.py shell -c "from stocks.services.daily_plan import build_daily_plan; p = build_daily_plan(); print(p.date, p.regime, len(p.payload['picks']))"`
Expected: prints a date, regime, and pick count without raising.

- [ ] **Step 5: Note for deployment**

localhost:3000 is Docker-built — the frontend image must be rebuilt and hard-refreshed to see `/plan`. The backend needs `seed_permissions.py` re-run (or equivalent) so `daily_plan` module keys exist, and celery beat restarted to pick up the new schedule entry.

---

## Self-Review Notes

- **Spec coverage:** model (T1), confluence (T2), freshness (T3), analogs (T4), catalysts (T5), builder + honest empty payload (T6), overlay (T7), task/notification/beat/permission (T8), API (T9), frontend plumbing (T10), PickCard (T11), page incl. empty state + 404 handling (T12), verification (T13). Stale-banner-on-failed-generation is covered by serving the latest plan row (T9) — the page shows the plan's own date, which lags when generation fails; an explicit stale banner was deliberately simplified to date display.
- **Type consistency:** `confluence_score` returns `(int, dict)`; builder stores `components` verbatim; `PlanPick` TS interface mirrors the payload keys produced in T6. `entry_status(entry_price, signal_age_days, price_df)` signature consistent between T3 and T6.
- **Known judgment calls:** `_compute_current_acc_signals` imported from views (documented as deliberate reuse); watchlist target treated as buy-entry level (documented in T7); regime proxy for analogs uses NEPSE index 200-SMA rather than full historical breadth (documented in T4).
```
