# Plan 1: Honest Backtest Foundation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every number the backtest harness produces reflect NEPSE reality — real fees, corporate-action-adjusted prices, validated ingest, and a survivorship registry — then re-baseline all 41 strategies.

**Architecture:** All changes concentrate in `backend/stocks/services/backtest_harness/` (the single shared execution path for verification, optimization, and chat backtests) plus two new managed models (`CorporateAction`, `DelistingRecord`) and validation gates on the two manual ingest endpoints. Pure functions (fee math, adjustment math, row validation) are separated from Django wiring so they're unit-testable without a database.

**Tech Stack:** Django 5.x, backtesting.py 0.6.5 (supports callable `commission` and `spread`), pandas, pytest + pytest-django (config: `backend/pytest.ini`, run from `backend/`).

**Branch note:** Current branch `strategy-upgrade-phase0` has uncommitted changes unrelated to this plan. Create a fresh branch from it: `git checkout -b strategy-upgrade-phase1-honest-harness`.

**Run tests from `backend/`:** all `pytest` commands below assume `cd /Users/jugalraj/Documents/Projects/Stockastic/backend`.

---

## Domain background (read before Task 1)

- **NEPSE trading costs per side** (May 2024 rates, already encoded in `backend/stocks/utils.py` for the portfolio layer but NOT used by the backtester): tiered broker commission — 0.36% (≤ Rs 50K), 0.33% (≤ 500K), 0.31% (≤ 2M), 0.27% (≤ 10M), 0.24% (> 10M) — plus SEBON regulatory fee 0.015% of amount, plus flat Rs 25 DP charge per transaction.
- **Bonus shares** are NEPSE's dominant corporate action. A 20% bonus means 0.2 new shares per share held; on the adjustment date the price drops mechanically by factor `1/(1+0.20)`. Historical prices BEFORE the ex-date must be multiplied by that factor to be comparable with prices after it. Without this, indicators see a phantom crash and multi-year returns are wrong.
- **Rights issues**: `r`% rights at issue price `I` adjust the cum price `P` to theoretical ex-rights price `(P + (r/100)·I) / (1 + r/100)`; factor = that ÷ `P`.
- **backtesting.py 0.6.5 semantics**: with default `trade_on_close=False`, an order placed in `next()` (after seeing bar N's close) fills at bar N+1's **open** — correct for an EOD research system. `commission` may be a callable `(order_size, price) -> absolute_cost`, applied at entry and exit. `spread` models bid-ask cost.
- **Ex-date approximation**: NEPSE adjusts price the trading day after book closure. We use `Dividend.book_close_date` as the ex-date boundary (prices strictly *before* it get adjusted). At daily resolution this is at most one bar of imprecision, which is acceptable and documented.

## File structure

| File | Status | Responsibility |
|---|---|---|
| `backend/stocks/services/backtest_harness/fees.py` | Create | Pure NEPSE fee math for the backtester (float-based callable) |
| `backend/stocks/services/backtest_harness/adjustments.py` | Create | Pure corporate-action factor math + DataFrame adjustment |
| `backend/stocks/services/backtest_harness/runner.py` | Modify | Default to NEPSE fees + spread; adjusted price loading |
| `backend/stocks/services/ingest_validation.py` | Create | Pure price-row validation (shared by both upload endpoints) |
| `backend/stocks/views/pipeline.py` | Modify | Wire validation into `daily_prices` and `fetch_daily_prices_from_github` |
| `backend/stocks/models/fundamentals.py` | Modify | Add `CorporateAction` model |
| `backend/stocks/models/market.py` | Modify | Add `DelistingRecord` model |
| `backend/stocks/models/__init__.py` | Modify | Export new models |
| `backend/stocks/services/universe.py` | Create | As-of-date research universe helper |
| `backend/stocks/management/commands/backfill_corporate_actions.py` | Create | Seed `CorporateAction` from `Dividend` rows |
| `backend/stocks/tests/test_backtest_fees.py` | Create | Fee math + runner wiring tests |
| `backend/stocks/tests/test_fill_realism.py` | Create | Lookahead/fill-realism regression guard |
| `backend/stocks/tests/test_corporate_actions.py` | Create | Adjustment math + adjusted loader tests |
| `backend/stocks/tests/test_ingest_validation.py` | Create | Row validation tests |
| `backend/backtest_reports/phase1_honest/` | Create | Re-baseline output |

---

### Task 1: NEPSE fee model for the backtest harness

**Files:**
- Create: `backend/stocks/services/backtest_harness/fees.py`
- Test: `backend/stocks/tests/test_backtest_fees.py`

The existing `stocks/utils.py` functions are Decimal-based and per-amount; backtesting.py needs a float callable `(order_size, price) -> cost`. We create a harness-local float implementation with the same tier table (and a test pinning it against `stocks/utils.py` so the two can never drift).

- [ ] **Step 1: Write the failing tests**

```python
# backend/stocks/tests/test_backtest_fees.py
"""NEPSE fee model used by the backtest harness."""
from decimal import Decimal

from stocks.services.backtest_harness.fees import nepse_commission, total_cost_rate
from stocks.utils import calculate_broker_commission, calculate_sebon_fee


def test_small_trade_uses_top_tier():
    # 100 shares @ 400 = Rs 40,000 -> 0.36% + 0.015% + Rs 25
    cost = nepse_commission(100, 400.0)
    expected = 40_000 * (0.0036 + 0.00015) + 25.0
    assert abs(cost - expected) < 0.01


def test_large_trade_uses_low_tier():
    # 30,000 shares @ 400 = Rs 12,000,000 -> 0.24% tier
    cost = nepse_commission(30_000, 400.0)
    expected = 12_000_000 * (0.0024 + 0.00015) + 25.0
    assert abs(cost - expected) < 0.01


def test_sell_side_negative_size_same_cost():
    assert nepse_commission(-100, 400.0) == nepse_commission(100, 400.0)


def test_matches_portfolio_layer_math():
    # The harness float math must agree with the Decimal portfolio math
    # (within a paisa) so backtests and real P&L never disagree on fees.
    for amount in (10_000, 50_000, 50_001, 500_000, 2_000_000, 10_000_001):
        size, price = amount / 100.0, 100.0
        harness = nepse_commission(size, price)
        portfolio = float(
            calculate_broker_commission(amount) + calculate_sebon_fee(amount) + Decimal("25")
        )
        assert abs(harness - portfolio) < 0.01, f"drift at amount={amount}"


def test_total_cost_rate_for_reporting():
    # Effective per-side rate on a Rs 100,000 trade: 0.33% + 0.015% + 25/100000
    rate = total_cost_rate(100_000)
    assert abs(rate - (0.0033 + 0.00015 + 0.00025)) < 1e-9
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest stocks/tests/test_backtest_fees.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'stocks.services.backtest_harness.fees'`

- [ ] **Step 3: Write the implementation**

```python
# backend/stocks/services/backtest_harness/fees.py
"""NEPSE trading-cost model for the backtest harness.

Float mirror of the Decimal math in ``stocks/utils.py`` (rates effective
May 14, 2024), shaped as a backtesting.py ``commission`` callable. A unit
test pins the two implementations against each other so they cannot drift.
"""

__all__ = ["nepse_commission", "total_cost_rate", "DEFAULT_SPREAD"]

# Per-side bid-ask/illiquidity cost assumption for NEPSE (10 bps).
DEFAULT_SPREAD = 0.001

_SEBON_RATE = 0.00015  # 0.015% regulatory fee
_DP_CHARGE = 25.0      # flat Rs 25 per transaction

_COMMISSION_TIERS = (  # (max_amount, rate)
    (50_000, 0.0036),
    (500_000, 0.0033),
    (2_000_000, 0.0031),
    (10_000_000, 0.0027),
    (float("inf"), 0.0024),
)


def _commission_rate(amount):
    for ceiling, rate in _COMMISSION_TIERS:
        if amount <= ceiling:
            return rate
    return _COMMISSION_TIERS[-1][1]


def nepse_commission(order_size, price):
    """Absolute cost (Rs) of one fill — backtesting.py ``commission`` callable.

    Applied by backtesting.py at both entry and exit, matching NEPSE charging
    commission + SEBON + DP on each side.
    """
    amount = abs(order_size) * price
    if amount <= 0:
        return 0.0
    return amount * (_commission_rate(amount) + _SEBON_RATE) + _DP_CHARGE


def total_cost_rate(amount):
    """Effective per-side cost rate for an order of ``amount`` Rs (for reporting)."""
    if amount <= 0:
        return 0.0
    return _commission_rate(amount) + _SEBON_RATE + _DP_CHARGE / amount
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest stocks/tests/test_backtest_fees.py -v`
Expected: 5 PASS

- [ ] **Step 5: Commit**

```bash
git add stocks/services/backtest_harness/fees.py stocks/tests/test_backtest_fees.py
git commit -m "feat(backtest): NEPSE tiered fee model (commission+SEBON+DP) for harness"
```

---

### Task 2: Wire real fees and spread into the runner

**Files:**
- Modify: `backend/stocks/services/backtest_harness/runner.py:95-121`
- Test: `backend/stocks/tests/test_backtest_fees.py` (append)

- [ ] **Step 1: Write the failing test**

Append to `backend/stocks/tests/test_backtest_fees.py`:

```python
import numpy as np
import pandas as pd

from stocks.services.backtest_harness.runner import run_backtest

_BH_CODE = """
from backtesting import Strategy

class HoldStrategy(Strategy):
    def init(self):
        pass

    def next(self):
        if not self.position:
            self.buy()
"""


def _flat_df(n=30, price=100.0):
    idx = pd.date_range("2025-01-01", periods=n, freq="D")
    return pd.DataFrame(
        {"Open": price, "High": price, "Low": price, "Close": price,
         "Volume": 10_000.0},
        index=idx,
    )


def test_runner_applies_real_fees_by_default():
    # Flat price: a buy-and-hold strategy's loss == round-trip cost... but the
    # position is still open at the end, so loss == entry-side cost + spread.
    # With the old flat commission=0.002 the loss would be ~0.2%; with the
    # NEPSE model on a ~Rs 1M position it must exceed 0.27% + 0.015%.
    res = run_backtest(_BH_CODE, "TEST", df=_flat_df())
    assert res.ok, res.error
    assert res.metrics["num_trades"] >= 0
    # Equity loss from costs must be at least 0.28% (tiered 0.27% + SEBON).
    assert res.metrics["return_pct"] <= -0.28


def test_runner_accepts_float_commission_override():
    res = run_backtest(_BH_CODE, "TEST", df=_flat_df(), commission=0.0, spread=0.0)
    assert res.ok, res.error
    assert abs(res.metrics["return_pct"]) < 1e-6
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest stocks/tests/test_backtest_fees.py -v -k runner`
Expected: `test_runner_applies_real_fees_by_default` FAILS (old flat 0.002 commission loses only ~0.2%; and `spread` is not an accepted kwarg → TypeError for the second test). Both failures are expected.

- [ ] **Step 3: Modify `run_backtest`**

In `backend/stocks/services/backtest_harness/runner.py`, add the import near the top (after the `.scope` import, line 10):

```python
from .fees import nepse_commission, DEFAULT_SPREAD
```

Replace the signature and the `Backtest(...)` construction (currently lines 95-96 and 119):

```python
def run_backtest(strategy_or_code, ticker, params=None, start=None, end=None,
                 cash=1_000_000, commission=None, spread=None, df=None):
    """Execute a strategy over one symbol and return a BacktestResult.

    ``commission=None`` (default) applies the real NEPSE cost model: tiered
    broker commission + SEBON fee + Rs 25 DP per side (see fees.py). Pass a
    float to override (e.g. 0.0 for a frictionless diagnostic run).
    ``spread=None`` defaults to fees.DEFAULT_SPREAD (10 bps).

    ``strategy_or_code`` may be a Strategy model instance, a raw code string, or
    a special token (see scope.resolve_code). Exceptions are captured into the
    result rather than raised, so a broken strategy is a recorded failure.
    """
```

and inside the `try:` block change the `Backtest(...)` line to:

```python
        bt = Backtest(
            df,
            strategy_class,
            cash=cash,
            commission=nepse_commission if commission is None else commission,
            spread=DEFAULT_SPREAD if spread is None else spread,
            exclusive_orders=True,
        )
```

- [ ] **Step 4: Run the tests**

Run: `pytest stocks/tests/test_backtest_fees.py -v`
Expected: all PASS

- [ ] **Step 5: Run the full existing harness test file to catch regressions**

Run: `pytest stocks/tests/ tests/unit -v -k "backtest or scorecard"`
Expected: PASS. If an existing test pinned exact return values under `commission=0.002`, update that test to pass `commission=0.002, spread=0.0` explicitly (the old behavior is still reachable by parameter).

- [ ] **Step 6: Commit**

```bash
git add stocks/services/backtest_harness/runner.py stocks/tests/test_backtest_fees.py
git commit -m "feat(backtest): runner defaults to real NEPSE fees and 10bps spread"
```

---

### Task 3: Fill-realism regression guard (lookahead test)

**Files:**
- Test: `backend/stocks/tests/test_fill_realism.py`

backtesting.py's default (`trade_on_close=False`) already fills next-bar-open, which is correct for EOD research. This task locks that in with a behavioral test so no future "optimization" (e.g. someone setting `trade_on_close=True`) silently reintroduces same-bar fills. The test is constructed so the two behaviors produce wildly different returns.

- [ ] **Step 1: Write the guard test**

```python
# backend/stocks/tests/test_fill_realism.py
"""Guard: orders decided on bar N's close must fill at bar N+1's open.

If the harness ever fills at the decision bar's close (lookahead), the
synthetic series below yields ~+14% instead of ~0%, and this test fails.
"""
import pandas as pd

from stocks.services.backtest_harness.runner import run_backtest

_PROBE_CODE = """
from backtesting import Strategy

class ProbeStrategy(Strategy):
    def init(self):
        pass

    def next(self):
        if not self.position and self.data.Close[-1] >= 105:
            self.buy()
"""


def _gap_df():
    # Bars 0-9 flat at 100. Bar 10 closes at 105 (signal). Bar 11 gaps open
    # to 120 and the series stays at 120. Honest fill price: 120 (≈0% return
    # net of fees). Lookahead fill price: 105 (≈ +14%).
    rows = []
    for _ in range(10):
        rows.append((100.0, 100.0, 100.0, 100.0))
    rows.append((100.0, 106.0, 99.0, 105.0))   # signal bar
    rows.append((120.0, 121.0, 119.0, 120.0))  # gap bar — honest entry here
    for _ in range(13):
        rows.append((120.0, 120.0, 120.0, 120.0))
    idx = pd.date_range("2025-01-01", periods=len(rows), freq="D")
    df = pd.DataFrame(rows, columns=["Open", "High", "Low", "Close"], index=idx)
    df["Volume"] = 10_000.0
    return df


def test_entry_fills_at_next_open_not_signal_close():
    res = run_backtest(_PROBE_CODE, "TEST", df=_gap_df(), commission=0.0, spread=0.0)
    assert res.ok, res.error
    assert res.metrics["num_trades"] >= 0
    # Honest next-open fill at 120 -> ~0% return. Lookahead fill at 105 -> ~+14%.
    assert res.metrics["return_pct"] < 5.0, (
        "Entry appears to fill at the signal bar's close — lookahead bias!"
    )
```

- [ ] **Step 2: Run it**

Run: `pytest stocks/tests/test_fill_realism.py -v`
Expected: PASS (current runner is honest). If it FAILS, the runner has a real lookahead bug — stop and investigate `Backtest(...)` kwargs before proceeding.

- [ ] **Step 3: Commit**

```bash
git add stocks/tests/test_fill_realism.py
git commit -m "test(backtest): regression guard against same-bar (lookahead) fills"
```

---

### Task 4: CorporateAction model + adjustment math

**Files:**
- Modify: `backend/stocks/models/fundamentals.py` (append after `Dividend`, line 61)
- Modify: `backend/stocks/models/__init__.py` (export)
- Create: `backend/stocks/services/backtest_harness/adjustments.py`
- Test: `backend/stocks/tests/test_corporate_actions.py`

- [ ] **Step 1: Write failing tests for the pure math**

```python
# backend/stocks/tests/test_corporate_actions.py
"""Corporate-action adjustment-factor math and DataFrame application."""
import pandas as pd
import pytest

from stocks.services.backtest_harness.adjustments import (
    apply_adjustments,
    bonus_adjustment_factor,
    rights_adjustment_factor,
)


def test_bonus_factor_20_percent():
    # 20% bonus: price drops to 1/1.2 of cum price.
    assert bonus_adjustment_factor(20) == pytest.approx(1 / 1.2)


def test_bonus_factor_zero_is_identity():
    assert bonus_adjustment_factor(0) == pytest.approx(1.0)


def test_rights_factor():
    # 50% rights at issue price 100, cum close 400:
    # TERP = (400 + 0.5*100) / 1.5 = 300 -> factor 0.75
    assert rights_adjustment_factor(50, 100, 400) == pytest.approx(0.75)


def test_rights_factor_guard_on_bad_close():
    assert rights_adjustment_factor(50, 100, 0) == pytest.approx(1.0)


def _df():
    idx = pd.date_range("2025-01-01", periods=4, freq="D")
    return pd.DataFrame(
        {"Open": [120.0, 120.0, 100.0, 100.0],
         "High": [121.0, 121.0, 101.0, 101.0],
         "Low": [119.0, 119.0, 99.0, 99.0],
         "Close": [120.0, 120.0, 100.0, 100.0],
         "Volume": [1000.0, 1000.0, 1200.0, 1200.0]},
        index=idx,
    )


def test_apply_adjustments_scales_prices_before_ex_date_only():
    # 20% bonus with ex-date 2025-01-03: bars on Jan 1-2 scale by 1/1.2;
    # Jan 3-4 untouched. Volume scales inversely to conserve turnover.
    out = apply_adjustments(_df(), [(pd.Timestamp("2025-01-03").date(), 1 / 1.2)])
    assert out["Close"].iloc[0] == pytest.approx(100.0)
    assert out["Open"].iloc[1] == pytest.approx(100.0)
    assert out["Close"].iloc[2] == pytest.approx(100.0)   # untouched
    assert out["Close"].iloc[3] == pytest.approx(100.0)   # untouched
    assert out["Volume"].iloc[0] == pytest.approx(1200.0)  # 1000 * 1.2
    assert out["Volume"].iloc[2] == pytest.approx(1200.0)  # untouched


def test_apply_adjustments_compounds_multiple_actions():
    out = apply_adjustments(
        _df(),
        [(pd.Timestamp("2025-01-02").date(), 0.5),
         (pd.Timestamp("2025-01-04").date(), 0.5)],
    )
    # Jan 1 is before both ex-dates: 120 * 0.5 * 0.5 = 30.
    assert out["Close"].iloc[0] == pytest.approx(30.0)
    # Jan 3 is before only the second: 100 * 0.5 = 50.
    assert out["Close"].iloc[2] == pytest.approx(50.0)


def test_apply_adjustments_no_actions_is_identity():
    df = _df()
    out = apply_adjustments(df.copy(), [])
    pd.testing.assert_frame_equal(out, df)
```

- [ ] **Step 2: Run to verify failure**

Run: `pytest stocks/tests/test_corporate_actions.py -v`
Expected: FAIL with `ModuleNotFoundError ... adjustments`

- [ ] **Step 3: Implement the pure math module**

```python
# backend/stocks/services/backtest_harness/adjustments.py
"""Corporate-action price adjustment for backtest-ready OHLCV frames.

NEPSE convention: ``ex_date`` is the first date trading at the adjusted
price (approximated by the dividend book-close date — at most one daily bar
of imprecision). All bars strictly BEFORE ex_date are multiplied by the
action's factor; volume is divided so turnover is conserved.
"""
import pandas as pd

__all__ = ["bonus_adjustment_factor", "rights_adjustment_factor", "apply_adjustments"]

_PRICE_COLS = ["Open", "High", "Low", "Close"]


def bonus_adjustment_factor(bonus_percent):
    """Factor for a bonus issue: 20 (%) -> 1/1.2."""
    return 1.0 / (1.0 + float(bonus_percent) / 100.0)


def rights_adjustment_factor(rights_percent, issue_price, cum_close):
    """Theoretical ex-rights factor; identity if the cum close is unusable."""
    cum_close = float(cum_close)
    if cum_close <= 0:
        return 1.0
    r = float(rights_percent) / 100.0
    terp = (cum_close + r * float(issue_price)) / (1.0 + r)
    return terp / cum_close


def apply_adjustments(df, actions):
    """Scale OHLC (and inversely Volume) for each (ex_date, factor) action.

    ``df`` must have a DatetimeIndex and Open/High/Low/Close/Volume columns.
    Factors compound when multiple actions apply to the same bar.
    """
    if df is None or len(df) == 0 or not actions:
        return df
    factor = pd.Series(1.0, index=df.index)
    for ex_date, f in actions:
        factor[df.index < pd.Timestamp(ex_date)] *= float(f)
    df[_PRICE_COLS] = df[_PRICE_COLS].mul(factor, axis=0)
    df["Volume"] = df["Volume"].div(factor)
    return df
```

- [ ] **Step 4: Run the math tests**

Run: `pytest stocks/tests/test_corporate_actions.py -v`
Expected: 7 PASS

- [ ] **Step 5: Add the `CorporateAction` model**

Append to `backend/stocks/models/fundamentals.py` (after the `Dividend` class, line 61):

```python
class CorporateAction(models.Model):
    """A price-affecting corporate action, used to adjust historical OHLCV.

    ``adjustment_factor`` is the multiplier applied to all prices strictly
    BEFORE ``ex_date`` (NEPSE adjusts on the trading day after book closure;
    we use the book-close date as the boundary — one daily bar of tolerance).
    """

    class ActionType(models.TextChoices):
        BONUS = 'BONUS', 'Bonus Share'
        RIGHTS = 'RIGHTS', 'Rights Issue'
        SPLIT = 'SPLIT', 'Stock Split'

    ticker = models.CharField(max_length=20, db_index=True)
    action_type = models.CharField(max_length=10, choices=ActionType.choices)
    ex_date = models.DateField(db_index=True)
    ratio_percent = models.DecimalField(max_digits=8, decimal_places=2)
    rights_issue_price = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    adjustment_factor = models.FloatField()
    source = models.CharField(max_length=30, default='DIVIDEND_BACKFILL')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('ticker', 'ex_date', 'action_type')
        ordering = ['ticker', 'ex_date']

    def __str__(self):
        return f"{self.ticker} {self.action_type} {self.ratio_percent}% @ {self.ex_date}"
```

Add `CorporateAction` to the imports/exports in `backend/stocks/models/__init__.py`, mirroring how `Dividend` is exported there (add it to the same `from .fundamentals import ...` line and to `__all__` if one exists).

- [ ] **Step 6: Make and run the migration**

```bash
python manage.py makemigrations stocks
python manage.py migrate
```
Expected: one new migration adding `CorporateAction`; migrate succeeds.

- [ ] **Step 7: Run the full test suite for regressions, then commit**

Run: `pytest stocks/tests/ -v`
Expected: PASS

```bash
git add stocks/models/fundamentals.py stocks/models/__init__.py stocks/migrations/ \
        stocks/services/backtest_harness/adjustments.py stocks/tests/test_corporate_actions.py
git commit -m "feat(data): CorporateAction model and adjustment-factor math"
```

---

### Task 5: Backfill corporate actions from the Dividend table

**Files:**
- Create: `backend/stocks/management/commands/backfill_corporate_actions.py`

The `Dividend` model (`stocks/models/fundamentals.py:52-58`) already holds `bonus_percent` and `book_close_date` per ticker/fiscal year — that's the bonus-action history. Rights issues aren't in the DB yet; the command supports them later via the model's `RIGHTS` type but only backfills bonuses now.

- [ ] **Step 1: Write the command**

```python
# backend/stocks/management/commands/backfill_corporate_actions.py
"""Seed CorporateAction rows from existing Dividend records (bonus shares).

Idempotent: re-running updates factors in place and never duplicates
(unique on ticker/ex_date/action_type).

Usage: python manage.py backfill_corporate_actions [--ticker NABIL] [--dry-run]
"""
from django.core.management.base import BaseCommand

from stocks.models import CorporateAction, Dividend
from stocks.services.backtest_harness.adjustments import bonus_adjustment_factor


class Command(BaseCommand):
    help = "Backfill CorporateAction (BONUS) rows from Dividend records."

    def add_arguments(self, parser):
        parser.add_argument("--ticker", help="Limit to one ticker")
        parser.add_argument("--dry-run", action="store_true")

    def handle(self, *args, **opts):
        qs = Dividend.objects.filter(
            bonus_percent__gt=0, book_close_date__isnull=False
        ).order_by("ticker", "book_close_date")
        if opts.get("ticker"):
            qs = qs.filter(ticker=opts["ticker"])

        created, updated, skipped = 0, 0, 0
        for div in qs:
            factor = bonus_adjustment_factor(div.bonus_percent)
            if opts["dry_run"]:
                self.stdout.write(
                    f"DRY {div.ticker} BONUS {div.bonus_percent}% "
                    f"ex={div.book_close_date} factor={factor:.6f}"
                )
                skipped += 1
                continue
            _, was_created = CorporateAction.objects.update_or_create(
                ticker=div.ticker,
                ex_date=div.book_close_date,
                action_type=CorporateAction.ActionType.BONUS,
                defaults={
                    "ratio_percent": div.bonus_percent,
                    "adjustment_factor": factor,
                    "source": "DIVIDEND_BACKFILL",
                },
            )
            created += was_created
            updated += not was_created

        self.stdout.write(self.style.SUCCESS(
            f"Done. created={created} updated={updated} dry_run_rows={skipped} "
            f"(source dividends with bonus: {qs.count()})"
        ))
```

- [ ] **Step 2: Dry-run against the real DB**

```bash
python manage.py backfill_corporate_actions --dry-run | head -30
python manage.py backfill_corporate_actions --dry-run | wc -l
```
Expected: a list of `DRY <ticker> BONUS ...` lines, count > 0. Spot-check 2-3 against known NEPSE bonus history (e.g. NABIL fiscal-year bonuses).

- [ ] **Step 3: Run for real and verify**

```bash
python manage.py backfill_corporate_actions
python manage.py shell -c "from stocks.models import CorporateAction; print(CorporateAction.objects.count(), CorporateAction.objects.filter(ticker='NABIL').count())"
```
Expected: created count matches the dry-run row count; NABIL has ≥ 1 action.

- [ ] **Step 4: Commit**

```bash
git add stocks/management/commands/backfill_corporate_actions.py
git commit -m "feat(data): backfill CorporateAction rows from Dividend bonus history"
```

---

### Task 6: Adjusted prices in `load_price_df`

**Files:**
- Modify: `backend/stocks/services/backtest_harness/runner.py:17-44`
- Test: `backend/stocks/tests/test_corporate_actions.py` (append)

Actions are injectable (`actions=` parameter) so the adjustment path is testable without touching the unmanaged `DailyStockPrice` table, and so batch callers can prefetch.

- [ ] **Step 1: Write the failing test**

Append to `backend/stocks/tests/test_corporate_actions.py`:

```python
import datetime as dt
from unittest import mock

from stocks.services.backtest_harness import runner


def _fake_ticks():
    return [
        {"date": dt.date(2025, 1, 1), "open": 120, "high": 121, "low": 119,
         "close": 120, "volume": 1000},
        {"date": dt.date(2025, 1, 2), "open": 100, "high": 101, "low": 99,
         "close": 100, "volume": 1200},
    ]


def test_load_price_df_applies_injected_actions():
    with mock.patch.object(runner, "_fetch_price_rows", return_value=_fake_ticks()):
        df = runner.load_price_df(
            "FAKE", actions=[(dt.date(2025, 1, 2), 1 / 1.2)]
        )
    assert df["Close"].iloc[0] == pytest.approx(100.0)   # 120 / 1.2
    assert df["Close"].iloc[1] == pytest.approx(100.0)   # after ex-date, raw


def test_load_price_df_adjust_false_returns_raw():
    with mock.patch.object(runner, "_fetch_price_rows", return_value=_fake_ticks()):
        df = runner.load_price_df(
            "FAKE", adjust=False, actions=[(dt.date(2025, 1, 2), 1 / 1.2)]
        )
    assert df["Close"].iloc[0] == pytest.approx(120.0)
```

- [ ] **Step 2: Run to verify failure**

Run: `pytest stocks/tests/test_corporate_actions.py -v -k load_price_df`
Expected: FAIL (`_fetch_price_rows` does not exist; `actions` not a kwarg)

- [ ] **Step 3: Refactor `load_price_df`**

In `backend/stocks/services/backtest_harness/runner.py`, add to the imports:

```python
from .adjustments import apply_adjustments
```

Replace `load_price_df` (lines 17-44) with:

```python
def _fetch_price_rows(ticker, start=None, end=None):
    """Raw OHLCV rows for a ticker (separated for testability)."""
    from stocks.models import DailyStockPrice

    qs = DailyStockPrice.objects.filter(ticker=ticker)
    if start:
        qs = qs.filter(date__gte=start)
    if end:
        qs = qs.filter(date__lte=end)
    return list(qs.order_by("date").values("date", "open", "high", "low", "close", "volume"))


def _fetch_actions(ticker):
    from stocks.models import CorporateAction

    return list(
        CorporateAction.objects.filter(ticker=ticker)
        .values_list("ex_date", "adjustment_factor")
    )


def load_price_df(ticker, start=None, end=None, adjust=True, actions=None):
    """Load OHLCV for a ticker as a backtesting.py-ready DataFrame.

    ``adjust=True`` (default) applies corporate-action factors so the series
    is continuous across bonus/rights events — required for honest backtests.
    ``actions`` lets callers inject prefetched ``(ex_date, factor)`` pairs.
    Returns an empty DataFrame if no data.
    """
    ticks = _fetch_price_rows(ticker, start=start, end=end)
    if not ticks:
        return pd.DataFrame()

    df = pd.DataFrame(ticks)
    df.rename(
        columns={"open": "Open", "high": "High", "low": "Low", "close": "Close", "volume": "Volume"},
        inplace=True,
    )
    df["date"] = pd.to_datetime(df["date"])
    df.set_index("date", inplace=True)
    df[["Open", "High", "Low", "Close", "Volume"]] = df[
        ["Open", "High", "Low", "Close", "Volume"]
    ].astype(float)

    if adjust:
        df = apply_adjustments(df, _fetch_actions(ticker) if actions is None else actions)
    return df
```

- [ ] **Step 4: Run the tests**

Run: `pytest stocks/tests/test_corporate_actions.py stocks/tests/test_backtest_fees.py stocks/tests/test_fill_realism.py -v`
Expected: all PASS

- [ ] **Step 5: Sanity-check on real data**

```bash
python manage.py shell -c "
from stocks.services.backtest_harness.runner import load_price_df
raw = load_price_df('NABIL', adjust=False)
adj = load_price_df('NABIL')
print('bars:', len(raw))
print('raw first/last close:', raw['Close'].iloc[0], raw['Close'].iloc[-1])
print('adj first/last close:', adj['Close'].iloc[0], adj['Close'].iloc[-1])
"
```
Expected: same bar count; adjusted early closes are LOWER than raw (bonus factors < 1 compound backward); last close identical in both.

- [ ] **Step 6: Commit**

```bash
git add stocks/services/backtest_harness/runner.py stocks/tests/test_corporate_actions.py
git commit -m "feat(backtest): load_price_df applies corporate-action adjustments by default"
```

---

### Task 7: Ingest validation gates

**Files:**
- Create: `backend/stocks/services/ingest_validation.py`
- Modify: `backend/stocks/views/pipeline.py:291-294` (daily_prices) and `:351-354` (github sync)
- Test: `backend/stocks/tests/test_ingest_validation.py`

Note: source CSVs legitimately contain `0` for missing open/high/low (`p()` maps `'-'` to 0), so the gate requires `close > 0`, no negative fields, and OHLC consistency only when all of O/H/L are present.

- [ ] **Step 1: Write the failing tests**

```python
# backend/stocks/tests/test_ingest_validation.py
"""Ingress validation for manually uploaded daily price rows."""
from stocks.models import DailyStockPrice
from stocks.services.ingest_validation import validate_price_rows


def _row(**kw):
    base = dict(ticker="TEST", date="2025-01-01", open=100, high=105,
                low=98, close=102, volume=500)
    base.update(kw)
    return DailyStockPrice(**base)


def test_clean_row_passes():
    valid, rejected = validate_price_rows([_row()])
    assert len(valid) == 1 and rejected == []


def test_zero_close_rejected():
    valid, rejected = validate_price_rows([_row(close=0)])
    assert valid == [] and rejected[0][1] == "non-positive close"


def test_negative_volume_rejected():
    valid, rejected = validate_price_rows([_row(volume=-5)])
    assert valid == [] and rejected[0][1] == "negative field"


def test_inconsistent_ohlc_rejected():
    # low above close
    valid, rejected = validate_price_rows([_row(low=103)])
    assert valid == [] and rejected[0][1] == "OHLC inconsistent"
    # high below open
    valid, rejected = validate_price_rows([_row(high=99)])
    assert valid == [] and rejected[0][1] == "OHLC inconsistent"


def test_missing_ohl_tolerated_when_close_valid():
    # Source files use 0 for absent open/high/low ('-' in the CSV).
    valid, rejected = validate_price_rows([_row(open=0, high=0, low=0)])
    assert len(valid) == 1 and rejected == []


def test_mixed_batch_partitions():
    valid, rejected = validate_price_rows([_row(), _row(ticker="BAD", close=0)])
    assert len(valid) == 1 and len(rejected) == 1 and rejected[0][0] == "BAD"
```

- [ ] **Step 2: Run to verify failure**

Run: `pytest stocks/tests/test_ingest_validation.py -v`
Expected: FAIL with `ModuleNotFoundError ... ingest_validation`

- [ ] **Step 3: Implement the validator**

```python
# backend/stocks/services/ingest_validation.py
"""Validation gate for manually ingested daily price rows.

The upload sources (CSV / GitHub mirror) map missing numeric cells to 0, so
zero open/high/low is tolerated; a zero close is not (a price row without a
close is unusable everywhere downstream).
"""

__all__ = ["validate_price_rows"]

_EPS = 1e-9


def validate_price_rows(items):
    """Partition unsaved DailyStockPrice instances into (valid, rejected).

    ``rejected`` is a list of ``(ticker, reason)`` for logging.
    """
    valid, rejected = [], []
    for it in items:
        o = float(it.open or 0)
        h = float(it.high or 0)
        low = float(it.low or 0)
        c = float(it.close or 0)
        vol = float(it.volume or 0)

        if c <= 0:
            rejected.append((it.ticker, "non-positive close"))
            continue
        if min(o, h, low, vol) < 0:
            rejected.append((it.ticker, "negative field"))
            continue
        if o > 0 and h > 0 and low > 0:
            if low > min(o, c) + _EPS or h < max(o, c) - _EPS or low > h + _EPS:
                rejected.append((it.ticker, "OHLC inconsistent"))
                continue
        valid.append(it)
    return valid, rejected
```

- [ ] **Step 4: Run the tests**

Run: `pytest stocks/tests/test_ingest_validation.py -v`
Expected: 6 PASS

- [ ] **Step 5: Wire into both upload endpoints**

In `backend/stocks/views/pipeline.py`, add to the imports at the top of the file:

```python
from stocks.services.ingest_validation import validate_price_rows
```

In `daily_prices` (line 291), replace:

```python
            DailyStockPrice.objects.bulk_create(items, ignore_conflicts=True)
            log.status, log.records_count = 'SUCCESS', len(items)
            log.save()
            return Response({'message': f'Successfully loaded {len(items)} price records'})
```

with:

```python
            valid, rejected = validate_price_rows(items)
            DailyStockPrice.objects.bulk_create(valid, ignore_conflicts=True)
            log.status, log.records_count = 'SUCCESS', len(valid)
            if rejected:
                log.error_message = f"rejected {len(rejected)}: " + "; ".join(
                    f"{t} ({r})" for t, r in rejected[:20]
                )
            log.save()
            return Response({
                'message': f'Loaded {len(valid)} price records',
                'rejected': [{'ticker': t, 'reason': r} for t, r in rejected],
            })
```

In `fetch_daily_prices_from_github` (line 351), apply the identical replacement to its trailing block (same four lines, message `'Synced {len(valid)} github price records'`).

- [ ] **Step 6: Run pipeline-related tests**

Run: `pytest stocks/tests/ tests/ -v -k "pipeline or ingest"`
Expected: PASS (new validation tests; any existing pipeline tests still green).

- [ ] **Step 7: Commit**

```bash
git add stocks/services/ingest_validation.py stocks/views/pipeline.py stocks/tests/test_ingest_validation.py
git commit -m "feat(ingest): validation gate on manual price uploads with rejection logging"
```

---

### Task 8: Delisting registry + as-of research universe

**Files:**
- Modify: `backend/stocks/models/market.py` (append after `Company`, line 41)
- Modify: `backend/stocks/models/__init__.py` (export)
- Create: `backend/stocks/services/universe.py`

`Company` is unmanaged (external `companies` table, current-state only) — we cannot add columns to it. A small managed side-table records delistings going forward; the universe helper unions full company history minus as-of delistings. Populating historical delistings is manual (no API), but from today the registry prevents *future* survivorship bias and the helper gives all research code one place to ask "what was tradable on date X?".

- [ ] **Step 1: Add the model**

Append to `backend/stocks/models/market.py` after the `Company` class (line 41):

```python
class DelistingRecord(models.Model):
    """Manually maintained registry of delisted/suspended symbols.

    The external ``companies`` table only knows current status, which makes
    research queries survivorship-biased. This side-table preserves history:
    a symbol delisted on D is still part of the research universe for any
    as-of date before D.
    """
    symbol = models.CharField(max_length=20, unique=True, db_index=True)
    delisted_date = models.DateField()
    reason = models.CharField(max_length=200, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.symbol} delisted {self.delisted_date}"
```

Export `DelistingRecord` from `backend/stocks/models/__init__.py` (same pattern as `Company` on its `from .market import ...` line).

- [ ] **Step 2: Migrate**

```bash
python manage.py makemigrations stocks && python manage.py migrate
```
Expected: one migration; succeeds.

- [ ] **Step 3: Create the universe helper**

```python
# backend/stocks/services/universe.py
"""The research universe: which symbols are valid subjects as of a date.

Uses Company.all_objects (NOT the default EquityManager, which filters to
currently-active and is therefore survivorship-biased) and subtracts
DelistingRecord entries dated on/before the as-of date.
"""

__all__ = ["research_universe", "NON_EQUITY_INSTRUMENTS"]

NON_EQUITY_INSTRUMENTS = [
    'Mutual Funds',
    'Mutual Fund',
    'Non-Convertible Debentures',
    'Corporate Debentures',
    'Debentures',
]


def research_universe(as_of=None):
    """Set of equity symbols researchable as of ``as_of`` (None = today).

    Includes inactive/delisted companies whose delisting postdates ``as_of``
    so backtest universes and event studies don't silently drop losers.
    """
    from django.utils import timezone
    from stocks.models import Company, DelistingRecord

    as_of = as_of or timezone.now().date()
    symbols = set(
        Company.all_objects.exclude(instrument_type__in=NON_EQUITY_INSTRUMENTS)
        .values_list('symbol', flat=True)
    )
    delisted = set(
        DelistingRecord.objects.filter(delisted_date__lte=as_of)
        .values_list('symbol', flat=True)
    )
    return symbols - delisted
```

- [ ] **Step 4: Smoke-test and compare against the biased default**

```bash
python manage.py shell -c "
from stocks.services.universe import research_universe
from stocks.models import Company
u = research_universe()
print('research universe:', len(u))
print('EquityManager (status=A only):', Company.objects.count())
"
```
Expected: research universe count ≥ EquityManager count (it includes non-'A' companies). Record both numbers in the commit message.

- [ ] **Step 5: Commit**

```bash
git add stocks/models/market.py stocks/models/__init__.py stocks/migrations/ stocks/services/universe.py
git commit -m "feat(data): DelistingRecord registry and as-of research_universe helper"
```

---

### Task 9: Re-baseline all 41 strategies under honest settings

**Files:**
- Create: `backend/backtest_reports/phase1_honest/` (command output)
- Create: `backend/backtest_reports/phase1_honest/COMPARISON.md` (hand-written summary)

- [ ] **Step 1: Confirm the full suite is green**

Run: `pytest stocks/tests/ tests/ -v`
Expected: PASS. Do not proceed on a red suite.

- [ ] **Step 2: Verify corporate actions are populated**

```bash
python manage.py shell -c "from stocks.models import CorporateAction; print('actions:', CorporateAction.objects.count())"
```
Expected: > 0 (Task 5 ran). If 0, run `python manage.py backfill_corporate_actions` first.

- [ ] **Step 3: Run the basket evaluation**

`backtest_basket` already routes through `run_backtest`/`load_price_df`, so it now picks up real fees + adjusted prices with no flags:

```bash
python manage.py backtest_basket --all 2>&1 | tee backtest_reports/phase1_honest/run_log.txt
```

If the command writes its own report files, move/copy them into `backtest_reports/phase1_honest/`. (Check `python manage.py backtest_basket --help` for an output-dir option first.)

- [ ] **Step 4: Write the comparison summary**

Create `backend/backtest_reports/phase1_honest/COMPARISON.md` with this structure, filled from the old baseline (`backend/backtest_reports/baseline/summary.md`) and the new run:

```markdown
# Phase 1 Re-baseline: honest fees + adjusted prices

Settings change vs. baseline:
- commission: flat 0.002 -> tiered NEPSE (0.24-0.36%) + 0.015% SEBON + Rs 25 DP/side
- spread: 0 -> 10 bps
- prices: raw -> corporate-action adjusted (N actions backfilled)

| Strategy | Baseline pass? | Honest pass? | Median excess ret (old -> new) | Notes |
|---|---|---|---|---|
| <one row per strategy, from the two run outputs> |

Pass count: 7/41 (baseline) -> X/41 (honest)
Biggest movers and why: <2-5 bullets>
```

Expected outcome (sanity check, not a target): the pass count will likely DROP — high-frequency strategies lose the most to real fees, and bonus-heavy tickers change shape under adjustment. A drop is the system getting *more honest*, not worse. If pass count *rises* sharply, investigate before trusting it.

- [ ] **Step 5: Commit the report**

```bash
git add backtest_reports/phase1_honest/
git commit -m "docs(backtest): phase-1 honest re-baseline report (fees + adjusted prices)"
```

- [ ] **Step 6: Update project memory**

Update `/Users/jugalraj/.claude/projects/-Users-jugalraj-Documents-Projects-Stockastic/memory/project_strategy_upgrade.md`: Phase 0 harness now runs with honest NEPSE fees and adjusted prices; record the new X/41 baseline as the number all future strategy-upgrade work measures against.

---

## Self-review checklist (done at planning time)

- **Spec coverage:** real fees (Tasks 1-2), lookahead guard (Task 3), corporate actions + adjusted prices (Tasks 4-6), ingest validation per the no-API constraint (Task 7), survivorship registry (Task 8), re-baseline (Task 9). Walk-forward optimization intentionally deferred to Plan 2 (roadmap).
- **No placeholders:** every code step contains complete code; every run step has a command and expected result.
- **Type consistency:** `nepse_commission(order_size, price)` matches backtesting.py's callable contract; `apply_adjustments(df, actions)` takes `(ex_date, factor)` pairs and both `_fetch_actions` and tests produce that shape; `validate_price_rows` returns `(valid, rejected)` consumed identically in both pipeline endpoints.
- **Known risk:** existing tests may pin old flat-commission return values (Task 2 Step 5 handles this); `backtest_basket`'s output location is verified at Task 9 Step 3 rather than assumed.
