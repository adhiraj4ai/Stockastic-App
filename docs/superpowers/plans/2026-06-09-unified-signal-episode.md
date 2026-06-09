# Unified Signal Episode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the dense-daily `StrategySignal` and overlapping-position `GeneratedSignal` tables with one compressed, episode-based model (`SignalEpisode`), re-derived from price data.

**Architecture:** One row per *directional run* (`start_date`/`end_date`), opened on a rising-edge signal flip and closed by a TP/SL hit or an opposite flip. A pure decision function drives the state machine (DB-free, unit-tested); a thin service applies it; a daily evaluator closes active episodes on price action; a backfill command replays history. ViewSets are re-implemented over the new model but preserve existing JSON keys so the frontend keeps working.

**Tech Stack:** Django 4 + DRF, PostgreSQL (partial unique index), pandas/talib (existing generators), pytest (`backend/pytest.ini`).

**Spec:** `docs/superpowers/specs/2026-06-09-unified-signal-episode-design.md`

---

## File Structure

| File | Responsibility |
|---|---|
| `backend/stocks/models/signal.py` (new) | `SignalEpisode` model + `producer_key` helper |
| `backend/stocks/services/signal_episode/reading.py` (new) | `SignalReading` dataclass — the normalized input contract |
| `backend/stocks/services/signal_episode/state_machine.py` (new) | Pure `decide()` function (no DB) |
| `backend/stocks/services/signal_episode/service.py` (new) | DB wrapper: `ingest_reading`, `evaluate_active_episodes` |
| `backend/stocks/services/signal_episode/backfill.py` (new) | History replay per producer×symbol |
| `backend/stocks/management/commands/rebuild_signal_episodes.py` (new) | Backfill entrypoint |
| `backend/stocks/management/commands/evaluate_signals.py` (modify) | Retarget to `SignalEpisode` |
| `backend/stocks/management/commands/generate_all_signals.py` (modify) | Orchestrate new generation + eval |
| `backend/stocks/services/strategy_service.py` (modify) | Emit readings → `ingest_reading` |
| `backend/stocks/services/signal_generation_service.py` (modify) | Emit readings → `ingest_reading` |
| `backend/stocks/serializers/signal.py` (new) | `SignalEpisodeSerializer` + compat serializers |
| `backend/stocks/views/strategy.py` (modify) | `tracking`/`performance`/etc. over `SignalEpisode` |
| `backend/stocks/admin/strategy.py`, `urls.py`, `models/__init__.py` (modify) | Registration |
| `backend/stocks/tests/test_signal_state_machine.py` (new) | Pure-logic unit tests |
| `backend/stocks/tests/test_signal_episode_service.py` (new) | DB + constraint + evaluation tests |
| `backend/stocks/tests/test_signal_episode_backfill.py` (new) | Replay tests |

**Run tests from `backend/`:** `pytest -q`

---

## Phase 1 — Core model & pure state machine

### Task 1: `SignalReading` normalized input contract

**Files:**
- Create: `backend/stocks/services/signal_episode/__init__.py` (empty)
- Create: `backend/stocks/services/signal_episode/reading.py`
- Test: `backend/stocks/tests/test_signal_state_machine.py`

- [ ] **Step 1: Create the package init**

Create `backend/stocks/services/signal_episode/__init__.py` as an empty file.

- [ ] **Step 2: Write `reading.py`**

```python
# backend/stocks/services/signal_episode/reading.py
from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal
from typing import Optional

BUY, SELL, HOLD, NEUTRAL = "BUY", "SELL", "HOLD", "NEUTRAL"
DIRECTIONAL = {BUY, SELL}


@dataclass
class SignalReading:
    """One producer's read on one symbol for one day, normalized across
    user-strategy and engine producers."""
    date: date
    direction: str                      # BUY | SELL | HOLD | NEUTRAL
    close: Decimal                       # candidate entry/exit price (last close / ltp)
    strength: float = 0.0
    target_price: Optional[Decimal] = None
    stop_loss_price: Optional[Decimal] = None
    signal_tier: str = ""
    rationale: str = ""
    metadata: dict = field(default_factory=dict)

    def __post_init__(self):
        # Strategy producers emit HOLD_SHORT; collapse to HOLD (maintain run).
        if self.direction == "HOLD_SHORT":
            self.direction = HOLD
```

- [ ] **Step 3: Commit**

```bash
git add backend/stocks/services/signal_episode/__init__.py backend/stocks/services/signal_episode/reading.py
git commit -m "feat(signals): add SignalReading normalized input contract"
```

---

### Task 2: Pure decision function (the state machine)

The decision function is DB-free: it takes the current open episode and the most-recent episode as lightweight snapshots and returns an action. This is the core logic from spec §4A.

**Files:**
- Create: `backend/stocks/services/signal_episode/state_machine.py`
- Test: `backend/stocks/tests/test_signal_state_machine.py`

- [ ] **Step 1: Write the failing tests**

```python
# backend/stocks/tests/test_signal_state_machine.py
from datetime import date
from decimal import Decimal

from stocks.services.signal_episode.reading import SignalReading, BUY, SELL, HOLD, NEUTRAL
from stocks.services.signal_episode.state_machine import (
    decide, EpisodeSnapshot, OPEN, EXTEND, FLIP, SUPPRESS, NOOP,
)


def r(d, direction, close=100):
    return SignalReading(date=date(2026, 1, d), direction=direction, close=Decimal(close))


def test_first_directional_signal_opens():
    assert decide(open_ep=None, latest_ep=None, reading=r(1, BUY)).action == OPEN


def test_same_direction_while_open_extends():
    open_ep = EpisodeSnapshot(direction=BUY, exit_reason=None)
    assert decide(open_ep=open_ep, latest_ep=open_ep, reading=r(2, BUY)).action == EXTEND


def test_hold_while_open_is_noop():
    open_ep = EpisodeSnapshot(direction=BUY, exit_reason=None)
    assert decide(open_ep=open_ep, latest_ep=open_ep, reading=r(2, HOLD)).action == NOOP


def test_neutral_while_open_is_noop():
    open_ep = EpisodeSnapshot(direction=BUY, exit_reason=None)
    assert decide(open_ep=open_ep, latest_ep=open_ep, reading=r(2, NEUTRAL)).action == NOOP


def test_opposite_signal_flips():
    open_ep = EpisodeSnapshot(direction=BUY, exit_reason=None)
    d = decide(open_ep=open_ep, latest_ep=open_ep, reading=r(11, SELL))
    assert d.action == FLIP


def test_no_reentry_after_tp_while_same_direction_persists():
    # BUY run was closed by a TARGET hit; signal still BUY, no open episode.
    closed = EpisodeSnapshot(direction=BUY, exit_reason="TARGET")
    assert decide(open_ep=None, latest_ep=closed, reading=r(5, BUY)).action == SUPPRESS


def test_reentry_after_flip_direction():
    # Last episode was a TP-closed SELL; now BUY fires -> new run (rising edge).
    closed = EpisodeSnapshot(direction=SELL, exit_reason="TARGET")
    assert decide(open_ep=None, latest_ep=closed, reading=r(41, BUY)).action == OPEN


def test_hold_with_no_open_episode_is_noop():
    assert decide(open_ep=None, latest_ep=None, reading=r(1, HOLD)).action == NOOP
```

- [ ] **Step 2: Run to verify failure**

Run: `pytest backend/stocks/tests/test_signal_state_machine.py -q`
Expected: FAIL — `ModuleNotFoundError: ...state_machine`.

- [ ] **Step 3: Implement `state_machine.py`**

```python
# backend/stocks/services/signal_episode/state_machine.py
from dataclasses import dataclass
from typing import Optional

from .reading import SignalReading, DIRECTIONAL

# Actions
OPEN = "OPEN"          # open a new episode in reading.direction
EXTEND = "EXTEND"      # extend the open episode (re-affirm)
FLIP = "FLIP"          # close open episode (SIGNAL_FLIP) AND open opposite
SUPPRESS = "SUPPRESS"  # same run already consumed by TP/SL -> do nothing
NOOP = "NOOP"          # HOLD/NEUTRAL with nothing actionable

TPSL_REASONS = {"TARGET", "STOP"}


@dataclass
class EpisodeSnapshot:
    """Minimal view of an episode the decision needs — DB-free for testing."""
    direction: str
    exit_reason: Optional[str]


@dataclass
class Decision:
    action: str


def decide(open_ep: Optional[EpisodeSnapshot],
           latest_ep: Optional[EpisodeSnapshot],
           reading: SignalReading) -> Decision:
    """Spec §4A. HOLD/NEUTRAL never act; only BUY/SELL do."""
    d = reading.direction
    if d not in DIRECTIONAL:
        return Decision(NOOP)

    if open_ep is not None:
        if open_ep.direction == d:
            return Decision(EXTEND)
        return Decision(FLIP)

    # No open episode. Suppress only if the SAME direction's run was just
    # consumed by a TP/SL exit (no re-entry until a flip opens a new run).
    if latest_ep is not None and latest_ep.direction == d and latest_ep.exit_reason in TPSL_REASONS:
        return Decision(SUPPRESS)
    return Decision(OPEN)
```

- [ ] **Step 4: Run to verify pass**

Run: `pytest backend/stocks/tests/test_signal_state_machine.py -q`
Expected: PASS (8 passed).

- [ ] **Step 5: Commit**

```bash
git add backend/stocks/services/signal_episode/state_machine.py backend/stocks/tests/test_signal_state_machine.py
git commit -m "feat(signals): pure episode decision function with unit tests"
```

---

### Task 3: `SignalEpisode` model + migration

**Files:**
- Create: `backend/stocks/models/signal.py`
- Modify: `backend/stocks/models/__init__.py`
- Test: `backend/stocks/tests/test_signal_episode_service.py`

- [ ] **Step 1: Write the model**

```python
# backend/stocks/models/signal.py
from django.db import models
from django.db.models import Q
from .strategy import Strategy

USER_STRATEGY = "USER_STRATEGY"


class SignalEpisode(models.Model):
    STATUS_CHOICES = (
        ("ACTIVE", "Active"), ("WON", "Target Reached"), ("LOST", "Stop Loss Hit"),
        ("FLIPPED", "Closed on Opposite Signal"), ("CLOSED_MANUAL", "Closed Manually"),
    )
    EXIT_REASONS = (
        ("TARGET", "Target"), ("STOP", "Stop"), ("SIGNAL_FLIP", "Signal Flip"), ("MANUAL", "Manual"),
    )

    source = models.CharField(max_length=30)
    strategy = models.ForeignKey(Strategy, null=True, blank=True, on_delete=models.CASCADE)
    producer_key = models.CharField(max_length=64, db_index=True)
    symbol = models.CharField(max_length=20, db_index=True)
    direction = models.CharField(max_length=4)  # BUY | SELL

    start_date = models.DateField()
    end_date = models.DateField(null=True, blank=True)        # null == ACTIVE
    last_signal_date = models.DateField()

    entry_price = models.DecimalField(max_digits=10, decimal_places=2)
    target_price = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    stop_loss_price = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    entry_strength = models.FloatField(default=0)
    signal_tier = models.CharField(max_length=50, blank=True, default="")

    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="ACTIVE")
    exit_price = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    exit_reason = models.CharField(max_length=20, choices=EXIT_REASONS, null=True, blank=True)
    pnl_percent = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    peak_strength = models.FloatField(default=0)

    rationale = models.TextField(blank=True, default="")
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "signal_episodes"
        ordering = ["-start_date"]
        constraints = [
            models.UniqueConstraint(
                fields=["producer_key", "symbol"],
                condition=Q(end_date__isnull=True),
                name="one_open_episode_per_producer_symbol",
            ),
        ]
        indexes = [
            models.Index(fields=["source", "start_date"]),
            models.Index(fields=["symbol", "start_date"]),
            models.Index(fields=["producer_key", "symbol"]),
            models.Index(fields=["status"]),
        ]

    @staticmethod
    def make_producer_key(source, strategy_id=None):
        return f"{source}:{strategy_id}" if source == USER_STRATEGY else source

    def __str__(self):
        return f"{self.symbol} {self.source} {self.direction} {self.start_date}->{self.end_date or 'OPEN'}"
```

- [ ] **Step 2: Export from models package**

In `backend/stocks/models/__init__.py`, append after the `system` import line:

```python
from .signal import SignalEpisode, USER_STRATEGY
```

- [ ] **Step 3: Make the migration**

Run: `python manage.py makemigrations stocks` (from `backend/`)
Expected: a new migration creating `signal_episodes` with the partial unique constraint.

- [ ] **Step 4: Write the failing constraint test**

```python
# backend/stocks/tests/test_signal_episode_service.py
import pytest
from datetime import date
from decimal import Decimal
from django.db import IntegrityError
from stocks.models import SignalEpisode


def _open_episode(symbol="NABIL", source="SMART_MONEY", direction="BUY", strategy=None):
    return SignalEpisode.objects.create(
        source=source, strategy=strategy,
        producer_key=SignalEpisode.make_producer_key(source, strategy.id if strategy else None),
        symbol=symbol, direction=direction,
        start_date=date(2026, 1, 1), last_signal_date=date(2026, 1, 1),
        entry_price=Decimal("100"),
    )


@pytest.mark.django_db
def test_cannot_have_two_open_episodes_same_producer_symbol():
    _open_episode()
    with pytest.raises(IntegrityError):
        _open_episode()


@pytest.mark.django_db
def test_engine_producers_with_null_strategy_still_constrained():
    # Regression: nullable strategy must NOT defeat the partial unique index.
    _open_episode(source="SMART_MONEY", strategy=None)
    with pytest.raises(IntegrityError):
        _open_episode(source="SMART_MONEY", strategy=None)
```

- [ ] **Step 5: Run migration + tests**

Run: `pytest backend/stocks/tests/test_signal_episode_service.py -q`
Expected: PASS (2 passed). pytest applies migrations to the test DB automatically.

- [ ] **Step 6: Commit**

```bash
git add backend/stocks/models/signal.py backend/stocks/models/__init__.py backend/stocks/migrations/ backend/stocks/tests/test_signal_episode_service.py
git commit -m "feat(signals): add SignalEpisode model with partial-unique open-episode constraint"
```

---

## Phase 2 — Service layer (DB application + evaluation)

### Task 4: `ingest_reading` — apply the decision to the DB

**Files:**
- Create: `backend/stocks/services/signal_episode/service.py`
- Test: `backend/stocks/tests/test_signal_episode_service.py`

- [ ] **Step 1: Add failing tests** (append to existing test file)

```python
from stocks.services.signal_episode.reading import SignalReading
from stocks.services.signal_episode.service import ingest_reading


def _reading(d, direction, close="100", target=None, stop=None, strength=10):
    return SignalReading(
        date=date(2026, 1, d), direction=direction, close=Decimal(close),
        target_price=Decimal(target) if target else None,
        stop_loss_price=Decimal(stop) if stop else None, strength=strength,
    )


def _ingest(d, direction, **kw):
    return ingest_reading(source="SMART_MONEY", strategy=None, symbol="NABIL",
                          reading=_reading(d, direction, **kw))


@pytest.mark.django_db
def test_ten_day_buy_run_is_one_episode():
    for day in range(1, 11):
        _ingest(day, "BUY")
    eps = SignalEpisode.objects.filter(symbol="NABIL")
    assert eps.count() == 1
    ep = eps.first()
    assert ep.start_date == date(2026, 1, 1)
    assert ep.last_signal_date == date(2026, 1, 10)
    assert ep.end_date is None and ep.status == "ACTIVE"


@pytest.mark.django_db
def test_flip_closes_and_opens_opposite():
    _ingest(1, "BUY", close="100")
    _ingest(2, "SELL", close="110")
    buy = SignalEpisode.objects.get(symbol="NABIL", direction="BUY")
    sell = SignalEpisode.objects.get(symbol="NABIL", direction="SELL")
    assert buy.status == "FLIPPED" and buy.exit_reason == "SIGNAL_FLIP"
    assert buy.exit_price == Decimal("110") and buy.end_date == date(2026, 1, 2)
    assert sell.status == "ACTIVE" and sell.start_date == date(2026, 1, 2)


@pytest.mark.django_db
def test_peak_strength_tracks_max():
    _ingest(1, "BUY", strength=20)
    _ingest(2, "BUY", strength=55)
    _ingest(3, "BUY", strength=40)
    assert SignalEpisode.objects.get(symbol="NABIL").peak_strength == 55
```

- [ ] **Step 2: Run to verify failure**

Run: `pytest backend/stocks/tests/test_signal_episode_service.py -q`
Expected: FAIL — cannot import `ingest_reading`.

- [ ] **Step 3: Implement `service.py` (ingest only; evaluation added in Task 5)**

```python
# backend/stocks/services/signal_episode/service.py
import logging
from django.db import transaction
from ...models import SignalEpisode
from .reading import SignalReading
from .state_machine import decide, EpisodeSnapshot, OPEN, EXTEND, FLIP, SUPPRESS, NOOP

logger = logging.getLogger(__name__)


def _snapshot(ep):
    return None if ep is None else EpisodeSnapshot(direction=ep.direction, exit_reason=ep.exit_reason)


def _open(source, strategy, producer_key, symbol, reading: SignalReading):
    SignalEpisode.objects.create(
        source=source, strategy=strategy, producer_key=producer_key, symbol=symbol,
        direction=reading.direction, start_date=reading.date, last_signal_date=reading.date,
        entry_price=reading.close, target_price=reading.target_price,
        stop_loss_price=reading.stop_loss_price, entry_strength=reading.strength,
        peak_strength=reading.strength, signal_tier=reading.signal_tier,
        rationale=reading.rationale, metadata=reading.metadata, status="ACTIVE",
    )


def _close(ep, reading, status, reason):
    ep.end_date = reading.date
    ep.exit_price = reading.close
    ep.exit_reason = reason
    ep.status = status
    if ep.entry_price:
        if ep.direction == "BUY":
            ep.pnl_percent = (reading.close - ep.entry_price) / ep.entry_price * 100
        else:
            ep.pnl_percent = (ep.entry_price - reading.close) / ep.entry_price * 100
    ep.save()


@transaction.atomic
def ingest_reading(source, strategy, symbol, reading: SignalReading):
    """Apply spec §4A for one producer/symbol/day. Returns the action taken."""
    producer_key = SignalEpisode.make_producer_key(source, strategy.id if strategy else None)
    base = SignalEpisode.objects.filter(producer_key=producer_key, symbol=symbol)
    open_ep = base.filter(end_date__isnull=True).first()
    latest_ep = base.order_by("-start_date").first()

    action = decide(_snapshot(open_ep), _snapshot(latest_ep), reading).action

    if action == EXTEND:
        open_ep.last_signal_date = reading.date
        open_ep.peak_strength = max(open_ep.peak_strength, reading.strength)
        open_ep.save(update_fields=["last_signal_date", "peak_strength", "updated_at"])
    elif action == FLIP:
        _close(open_ep, reading, status="FLIPPED", reason="SIGNAL_FLIP")
        _open(source, strategy, producer_key, symbol, reading)
    elif action == OPEN:
        _open(source, strategy, producer_key, symbol, reading)
    # SUPPRESS / NOOP: nothing
    return action
```

- [ ] **Step 4: Run to verify pass**

Run: `pytest backend/stocks/tests/test_signal_episode_service.py -q`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/stocks/services/signal_episode/service.py backend/stocks/tests/test_signal_episode_service.py
git commit -m "feat(signals): ingest_reading applies episode state machine to DB"
```

---

### Task 5: `evaluate_active_episodes` — close on TP/SL (spec §4B)

**Files:**
- Modify: `backend/stocks/services/signal_episode/service.py`
- Test: `backend/stocks/tests/test_signal_episode_service.py`

- [ ] **Step 1: Add failing tests**

```python
from stocks.models import DailyStockPrice
from stocks.services.signal_episode.service import evaluate_active_episodes


def _price(d, high, low, close):
    return DailyStockPrice.objects.create(
        ticker="NABIL", date=date(2026, 1, d),
        open=Decimal(close), high=Decimal(high), low=Decimal(low),
        close=Decimal(close), volume=Decimal("1000"),
    )


@pytest.mark.django_db
def test_buy_episode_hits_target_marks_won():
    _ingest(1, "BUY", close="100", target="110", stop="95")
    _price(1, high="101", low="99", close="100")   # entry day — must NOT trigger
    _price(2, high="112", low="100", close="111")  # target hit
    evaluate_active_episodes()
    ep = SignalEpisode.objects.get(symbol="NABIL")
    assert ep.status == "WON" and ep.exit_reason == "TARGET"
    assert ep.exit_price == Decimal("110") and ep.end_date == date(2026, 1, 2)
    assert ep.pnl_percent == Decimal("10.00")


@pytest.mark.django_db
def test_entry_day_is_not_evaluated():
    _ingest(1, "BUY", close="100", target="100.5", stop="95")
    _price(1, high="200", low="100", close="100")  # huge high on entry day
    evaluate_active_episodes()
    assert SignalEpisode.objects.get(symbol="NABIL").status == "ACTIVE"


@pytest.mark.django_db
def test_episode_without_plan_is_skipped():
    _ingest(1, "BUY", close="100")  # no target/stop (user-strategy case)
    _price(2, high="500", low="1", close="250")
    evaluate_active_episodes()
    assert SignalEpisode.objects.get(symbol="NABIL").status == "ACTIVE"
```

- [ ] **Step 2: Run to verify failure**

Run: `pytest backend/stocks/tests/test_signal_episode_service.py -q`
Expected: FAIL — cannot import `evaluate_active_episodes`.

- [ ] **Step 3: Implement evaluation (append to `service.py`)**

```python
from decimal import Decimal
from ...models import DailyStockPrice


def _check_hit(direction, target, stop, high, low):
    """Return (status, reason, exit_price) for first TP/SL hit, else None."""
    if direction == "BUY":
        if target is not None and high >= target:
            return "WON", "TARGET", target
        if stop is not None and low <= stop:
            return "LOST", "STOP", stop
    else:  # SELL
        if target is not None and low <= target:
            return "WON", "TARGET", target
        if stop is not None and high >= stop:
            return "LOST", "STOP", stop
    return None


def evaluate_active_episodes():
    """Spec §4B. Walk prices AFTER start_date; first TP/SL hit closes the episode.
    Episodes without a target AND stop are skipped. Returns count closed."""
    closed = 0
    actives = SignalEpisode.objects.filter(status="ACTIVE")
    for ep in actives:
        if ep.target_price is None and ep.stop_loss_price is None:
            continue
        prices = (DailyStockPrice.objects
                  .filter(ticker=ep.symbol, date__gt=ep.start_date)
                  .order_by("date")
                  .values("date", "high", "low"))
        for p in prices:
            high, low = Decimal(str(p["high"])), Decimal(str(p["low"]))
            hit = _check_hit(ep.direction, ep.target_price, ep.stop_loss_price, high, low)
            if hit:
                status, reason, exit_price = hit
                ep.end_date = p["date"]
                ep.exit_price = exit_price
                ep.exit_reason = reason
                ep.status = status
                if ep.entry_price:
                    if ep.direction == "BUY":
                        ep.pnl_percent = (exit_price - ep.entry_price) / ep.entry_price * 100
                    else:
                        ep.pnl_percent = (ep.entry_price - exit_price) / ep.entry_price * 100
                ep.save()
                closed += 1
                break
    return closed
```

- [ ] **Step 4: Run to verify pass**

Run: `pytest backend/stocks/tests/test_signal_episode_service.py -q`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/stocks/services/signal_episode/service.py backend/stocks/tests/test_signal_episode_service.py
git commit -m "feat(signals): evaluate_active_episodes closes episodes on TP/SL"
```

---

### Task 6: `days_held` helper (trading days)

**Files:**
- Modify: `backend/stocks/models/signal.py`
- Test: `backend/stocks/tests/test_signal_episode_service.py`

- [ ] **Step 1: Add failing test**

```python
@pytest.mark.django_db
def test_days_held_counts_trading_days_only():
    ep = _open_episode(symbol="HELD")
    ep.last_signal_date = date(2026, 1, 9)
    ep.save()
    # Only 3 trading rows in the window despite the 9-day calendar span.
    for d in (1, 5, 9):
        DailyStockPrice.objects.create(
            ticker="HELD", date=date(2026, 1, d), open=Decimal("1"),
            high=Decimal("1"), low=Decimal("1"), close=Decimal("1"), volume=Decimal("1"),
        )
    assert ep.days_held() == 3
```

- [ ] **Step 2: Run to verify failure**

Run: `pytest backend/stocks/tests/test_signal_episode_service.py::test_days_held_counts_trading_days_only -q`
Expected: FAIL — `SignalEpisode` has no `days_held`.

- [ ] **Step 3: Implement** (add method to `SignalEpisode`, and import `date` at top of `signal.py`)

```python
# at top of backend/stocks/models/signal.py
from datetime import date as date_cls

# method on SignalEpisode:
    def days_held(self):
        from .market import DailyStockPrice
        end = self.end_date or date_cls.today()
        return DailyStockPrice.objects.filter(
            ticker=self.symbol, date__gte=self.start_date, date__lte=end
        ).count()
```

- [ ] **Step 4: Run to verify pass**

Run: `pytest backend/stocks/tests/test_signal_episode_service.py::test_days_held_counts_trading_days_only -q`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/stocks/models/signal.py backend/stocks/tests/test_signal_episode_service.py
git commit -m "feat(signals): days_held counts trading days"
```

---

## Phase 3 — Backfill (re-derive history)

### Task 7: Backfill replay engine

The backfill turns a per-day reading sequence into compressed episodes by running ingest + evaluate per day in order. Reuse it for both producers.

**Files:**
- Create: `backend/stocks/services/signal_episode/backfill.py`
- Test: `backend/stocks/tests/test_signal_episode_backfill.py`

- [ ] **Step 1: Write failing test**

```python
# backend/stocks/tests/test_signal_episode_backfill.py
import pytest
from datetime import date
from decimal import Decimal
from stocks.models import SignalEpisode, DailyStockPrice
from stocks.services.signal_episode.reading import SignalReading
from stocks.services.signal_episode.backfill import replay_producer_symbol


def _reading(d, direction, close="100", target=None, stop=None):
    return SignalReading(
        date=date(2026, 1, d), direction=direction, close=Decimal(close),
        target_price=Decimal(target) if target else None,
        stop_loss_price=Decimal(stop) if stop else None,
    )


@pytest.mark.django_db
def test_replay_buy_then_sell_run_yields_two_episodes():
    for d in range(1, 11):
        DailyStockPrice.objects.create(
            ticker="NABIL", date=date(2026, 1, d), open=Decimal("100"),
            high=Decimal("101"), low=Decimal("99"), close=Decimal("100"), volume=Decimal("1"),
        )
    readings = [_reading(d, "BUY") for d in range(1, 6)] + [_reading(d, "SELL") for d in range(6, 11)]
    replay_producer_symbol(source="SMART_MONEY", strategy=None, symbol="NABIL", readings=readings)
    eps = list(SignalEpisode.objects.filter(symbol="NABIL").order_by("start_date"))
    assert len(eps) == 2
    assert eps[0].direction == "BUY" and eps[0].status == "FLIPPED" and eps[0].end_date == date(2026, 1, 6)
    assert eps[1].direction == "SELL" and eps[1].status == "ACTIVE"


@pytest.mark.django_db
def test_replay_tp_hit_then_no_reentry():
    for d in range(1, 8):
        DailyStockPrice.objects.create(
            ticker="NABIL", date=date(2026, 1, d), open=Decimal("100"),
            high=Decimal("120") if d >= 3 else Decimal("101"),
            low=Decimal("99"), close=Decimal("100"), volume=Decimal("1"),
        )
    readings = [_reading(d, "BUY", target="110", stop="95") for d in range(1, 8)]
    replay_producer_symbol(source="SMART_MONEY", strategy=None, symbol="NABIL", readings=readings)
    eps = list(SignalEpisode.objects.filter(symbol="NABIL"))
    assert len(eps) == 1                       # no re-entry while BUY persists
    assert eps[0].status == "WON" and eps[0].end_date == date(2026, 1, 3)
```

- [ ] **Step 2: Run to verify failure**

Run: `pytest backend/stocks/tests/test_signal_episode_backfill.py -q`
Expected: FAIL — cannot import `replay_producer_symbol`.

- [ ] **Step 3: Implement `backfill.py`**

```python
# backend/stocks/services/signal_episode/backfill.py
from .service import ingest_reading, evaluate_active_episodes


def replay_producer_symbol(source, strategy, symbol, readings):
    """Replay a chronologically-sorted list of SignalReading for one producer/symbol.
    Per spec §4: ingest the day's reading first, then evaluate TP/SL (which only looks
    at prices strictly after each episode's start_date, so same-day entry is safe)."""
    for reading in sorted(readings, key=lambda r: r.date):
        ingest_reading(source=source, strategy=strategy, symbol=symbol, reading=reading)
        evaluate_active_episodes()
```

- [ ] **Step 4: Run to verify pass**

Run: `pytest backend/stocks/tests/test_signal_episode_backfill.py -q`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/stocks/services/signal_episode/backfill.py backend/stocks/tests/test_signal_episode_backfill.py
git commit -m "feat(signals): backfill replay engine for episode re-derivation"
```

---

### Task 8: Reading adapters — convert existing generator output to `SignalReading`

The strategy service and engines already produce per-day dicts (see spec/data shapes). Add adapters so generators feed `ingest_reading` without rewriting their logic.

**Files:**
- Create: `backend/stocks/services/signal_episode/adapters.py`
- Test: `backend/stocks/tests/test_signal_episode_backfill.py`

- [ ] **Step 1: Write failing test**

```python
from stocks.services.signal_episode.adapters import strategy_reading, engine_reading


def test_strategy_reading_maps_hold_short_to_hold():
    r = strategy_reading(d=date(2026, 1, 1), signal="HOLD_SHORT", last_close=100,
                         metadata={"orders": 0})
    assert r.direction == "HOLD" and r.target_price is None


def test_engine_reading_carries_plan_and_tier():
    r = engine_reading(d=date(2026, 1, 1), signal="BUY", ltp=100, strength=42,
                       tier="Strong Bullish", rationale="x",
                       target=110, stop=95, metadata={"rsi": 55})
    assert r.direction == "BUY" and r.target_price == Decimal("110")
    assert r.stop_loss_price == Decimal("95") and r.signal_tier == "Strong Bullish"
```

(These two tests need no DB; place them above the `@pytest.mark.django_db` tests.)

- [ ] **Step 2: Run to verify failure**

Run: `pytest backend/stocks/tests/test_signal_episode_backfill.py -q`
Expected: FAIL — cannot import adapters.

- [ ] **Step 3: Implement `adapters.py`**

```python
# backend/stocks/services/signal_episode/adapters.py
from decimal import Decimal
from .reading import SignalReading


def _dec(v):
    return None if v is None else Decimal(str(v))


def strategy_reading(d, signal, last_close, metadata=None):
    """User-strategy producers: no target/stop (closes only on flip)."""
    return SignalReading(
        date=d, direction=signal, close=_dec(last_close) or Decimal("0"),
        metadata=metadata or {},
    )


def engine_reading(d, signal, ltp, strength=0, tier="", rationale="",
                   target=None, stop=None, metadata=None):
    """Engine producers: carry the TP/SL plan computed by the engine pipeline."""
    return SignalReading(
        date=d, direction=signal, close=_dec(ltp) or Decimal("0"), strength=strength or 0,
        target_price=_dec(target), stop_loss_price=_dec(stop), signal_tier=tier,
        rationale=rationale, metadata=metadata or {},
    )
```

- [ ] **Step 4: Run to verify pass**

Run: `pytest backend/stocks/tests/test_signal_episode_backfill.py -q`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/stocks/services/signal_episode/adapters.py backend/stocks/tests/test_signal_episode_backfill.py
git commit -m "feat(signals): reading adapters for strategy and engine producers"
```

---

## Phase 4 — Wire generation to episodes & rebuild command

### Task 9: `signal_generation_service` emits episodes

Replace the `update_or_create(GeneratedSignal...)` write in `_persist_signals` with `ingest_reading`, keeping the existing TP/SL plan computation.

**Files:**
- Modify: `backend/stocks/services/signal_generation_service.py`

- [ ] **Step 1: Update `_persist_signals`**

In `_persist_signals` (currently ~lines 58-114), keep the `tp2`/`sl` computation block unchanged. Replace the `GeneratedSignal.objects.update_or_create(...)` call with:

```python
            from .signal_episode.service import ingest_reading
            from .signal_episode.adapters import engine_reading
            from ..models.signal import SignalEpisode  # noqa (used elsewhere)

            ingest_reading(
                source=source, strategy=None, symbol=sig['symbol'],
                reading=engine_reading(
                    d=sig.get('generated_date', today), signal=sig['signal'], ltp=ltp,
                    strength=sig.get('strength', 0), tier=sig.get('signal_tier', ''),
                    rationale=sig.get('rationale', ''), target=tp2, stop=sl, metadata=metadata,
                ),
            )
            saved += 1
```

Remove the `from ..models import GeneratedSignal` import at the top of the method.

- [ ] **Step 2: Run existing signal tests + the service tests**

Run: `pytest backend/stocks/tests/ -q`
Expected: PASS (no import errors; episode tests still green).

- [ ] **Step 3: Commit**

```bash
git add backend/stocks/services/signal_generation_service.py
git commit -m "refactor(signals): engine pipeline emits SignalEpisode via ingest_reading"
```

---

### Task 10: `strategy_service` emits episodes

**Files:**
- Modify: `backend/stocks/services/strategy_service.py`

- [ ] **Step 1: Replace the persist call in `generate_signals_for_symbol`**

Replace the `StrategySignal.objects.update_or_create(...)` block (currently ~lines 127-130) with:

```python
            from .signal_episode.service import ingest_reading
            from .signal_episode.adapters import strategy_reading
            from ..models.signal import USER_STRATEGY

            ingest_reading(
                source=USER_STRATEGY, strategy=s, symbol=symbol,
                reading=strategy_reading(d=last_date, signal=final_signal,
                                         last_close=last_close, metadata=meta),
            )
```

Remove the now-unused `StrategySignal` import at the top of the file.

- [ ] **Step 2: Run tests**

Run: `pytest backend/stocks/tests/ -q`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add backend/stocks/services/strategy_service.py
git commit -m "refactor(signals): user strategies emit SignalEpisode via ingest_reading"
```

---

### Task 11: `rebuild_signal_episodes` management command + `evaluate_signals` retarget

**Files:**
- Create: `backend/stocks/management/commands/rebuild_signal_episodes.py`
- Modify: `backend/stocks/management/commands/evaluate_signals.py`
- Modify: `backend/stocks/management/commands/generate_all_signals.py`

- [ ] **Step 1: Write `rebuild_signal_episodes.py`**

```python
# backend/stocks/management/commands/rebuild_signal_episodes.py
from django.core.management.base import BaseCommand
from stocks.models import SignalEpisode, DailyStockPrice
from stocks.services.signal_episode.backfill import replay_producer_symbol
from stocks.services.signal_episode.adapters import engine_reading
from stocks.views.recommendations import BrokerAccumulationRecommendationEngine


class Command(BaseCommand):
    help = "Wipe and re-derive SignalEpisode rows from historical price/engine data."

    def add_arguments(self, parser):
        parser.add_argument("--symbol", type=str, default=None)
        parser.add_argument("--days", type=int, default=365)

    def handle(self, *args, **opts):
        SignalEpisode.objects.all().delete()
        self.stdout.write("Cleared existing episodes.")

        symbols = ([opts["symbol"]] if opts["symbol"]
                   else list(DailyStockPrice.objects.values_list("ticker", flat=True).distinct()))

        # Engine producers: BrokerAccumulation shown; repeat the block per engine that
        # exposes a per-date history (see engine execute_history methods).
        engine = BrokerAccumulationRecommendationEngine()
        for i, symbol in enumerate(symbols, 1):
            history = engine.compute_history_rows(symbol, days=opts["days"])  # see Step 2
            readings = [engine_reading(
                d=row["date"], signal=row["signal"], ltp=row["close"],
                strength=row.get("strength", 0), tier=row.get("trend_direction", ""),
                rationale=row.get("reason", ""), target=row.get("target"),
                stop=row.get("stop"), metadata=row.get("metadata", {}),
            ) for row in history]
            replay_producer_symbol(source="BROKER_ACCUMULATION", strategy=None,
                                   symbol=symbol, readings=readings)
            if i % 50 == 0:
                self.stdout.write(f"Replayed {i}/{len(symbols)} symbols...")

        self.stdout.write(self.style.SUCCESS(f"Backfill complete: {SignalEpisode.objects.count()} episodes."))
```

- [ ] **Step 2: Expose a pure history-rows method on the engine**

The existing `execute_history` writes rows to the DB. Add a sibling that *returns* per-date dicts without persisting, so backfill can adapt them. In `backend/stocks/views/recommendations.py`, add to `BrokerAccumulationRecommendationEngine`:

```python
    def compute_history_rows(self, symbol, days=365):
        """Return per-date signal dicts (no DB writes) for episode backfill.
        Mirrors execute_history's computation but yields rows instead of saving."""
        rows = []
        market_signals = self._compute_market_signals(symbol, days)  # existing internal frame
        if market_signals is None:
            return rows
        for dt, row in market_signals.iterrows():
            signal_type = row["signal_type"]
            if signal_type == "NEUTRAL":
                continue
            rows.append({
                "date": dt.date(),
                "signal": "BUY" if "BUY" in signal_type else "SELL",
                "close": float(row["close"]),
                "strength": abs(row["confidence_score"]),
                "reason": self._generate_reason(row),
                "trend_direction": row.get("trend_direction", ""),
                "target": None, "stop": None,   # plan added by pipeline; null in pure history
                "metadata": {"rsi": row.get("rsi_14"), "macd": row.get("macd")},
            })
        return rows
```

> Note: if `execute_history` builds its frame inline rather than via a helper, extract the frame-building portion into `_compute_market_signals(symbol, days)` and have both `execute_history` and `compute_history_rows` call it (DRY).

- [ ] **Step 3: Retarget `evaluate_signals.py`**

Replace its body with a thin call to the service:

```python
# backend/stocks/management/commands/evaluate_signals.py
from django.core.management.base import BaseCommand
from stocks.services.signal_episode.service import evaluate_active_episodes


class Command(BaseCommand):
    help = "Evaluate ACTIVE SignalEpisodes against price action; close on TP/SL."

    def handle(self, *args, **options):
        closed = evaluate_active_episodes()
        self.stdout.write(self.style.SUCCESS(f"Evaluation complete: {closed} episodes closed."))
```

- [ ] **Step 4: Update `generate_all_signals.py`**

Its `SignalEvaluationService.evaluate_active_signals()` call should now call the episode evaluator. Replace that line with:

```python
        from stocks.services.signal_episode.service import evaluate_active_episodes
        evaluated = evaluate_active_episodes()
```

- [ ] **Step 5: Smoke-run the command against the dev DB**

Run: `python manage.py rebuild_signal_episodes --symbol NABIL --days 365`
Expected: "Backfill complete: N episodes." with N small (a handful of runs, not hundreds).

- [ ] **Step 6: Commit**

```bash
git add backend/stocks/management/commands/rebuild_signal_episodes.py backend/stocks/management/commands/evaluate_signals.py backend/stocks/management/commands/generate_all_signals.py backend/stocks/views/recommendations.py
git commit -m "feat(signals): rebuild_signal_episodes backfill + retargeted evaluate_signals"
```

> **Scope note:** Step 1 shows the BROKER_ACCUMULATION producer. Repeat the engine block for each `_generate_*` source that has per-date history. Sources without a history method can be backfilled "today only" by running `generate_all_signals` going forward — log which sources are forward-only so coverage gaps are explicit, not silent.

---

## Phase 5 — API, admin, URLs (preserve frontend contract)

### Task 12: `SignalEpisodeSerializer` + compatibility shapes

**Files:**
- Create: `backend/stocks/serializers/signal.py`
- Test: `backend/stocks/tests/test_signal_episode_service.py`

- [ ] **Step 1: Write failing test**

```python
from stocks.serializers.signal import SignalEpisodeSerializer


@pytest.mark.django_db
def test_serializer_exposes_compat_keys():
    ep = _open_episode()
    data = SignalEpisodeSerializer(ep).data
    for key in ("symbol", "source", "signal", "status", "generated_date", "ltp",
                "target_price", "stop_loss_price", "days_held", "start_date"):
        assert key in data
    assert data["signal"] == "BUY"           # direction surfaced as `signal`
    assert data["generated_date"] == "2026-01-01"   # start_date surfaced as `generated_date`
```

- [ ] **Step 2: Run to verify failure**

Run: `pytest backend/stocks/tests/test_signal_episode_service.py::test_serializer_exposes_compat_keys -q`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement `serializers/signal.py`**

```python
# backend/stocks/serializers/signal.py
from rest_framework import serializers
from ..models import SignalEpisode


class SignalEpisodeSerializer(serializers.ModelSerializer):
    # Backward-compatible aliases so existing frontend keys keep working.
    signal = serializers.CharField(source="direction", read_only=True)
    generated_date = serializers.DateField(source="start_date", read_only=True)
    ltp = serializers.DecimalField(source="entry_price", max_digits=10, decimal_places=2, read_only=True)
    strength = serializers.FloatField(source="entry_strength", read_only=True)
    days_held = serializers.SerializerMethodField()

    class Meta:
        model = SignalEpisode
        fields = [
            "id", "source", "strategy", "symbol", "signal", "direction", "signal_tier",
            "status", "ltp", "entry_price", "target_price", "stop_loss_price",
            "exit_price", "exit_reason", "pnl_percent", "strength", "peak_strength",
            "start_date", "end_date", "last_signal_date", "generated_date",
            "days_held", "rationale", "metadata", "created_at",
        ]

    def get_days_held(self, obj):
        return obj.days_held()
```

- [ ] **Step 4: Run to verify pass**

Run: `pytest backend/stocks/tests/test_signal_episode_service.py::test_serializer_exposes_compat_keys -q`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/stocks/serializers/signal.py backend/stocks/tests/test_signal_episode_service.py
git commit -m "feat(signals): SignalEpisodeSerializer with frontend-compatible keys"
```

---

### Task 13: Rewrite ViewSets over `SignalEpisode`

**Files:**
- Modify: `backend/stocks/views/strategy.py`
- Modify: `backend/stocks/serializers/strategy.py`, `backend/stocks/serializers/system.py`
- Test: `backend/stocks/tests/test_signal_episode_service.py`

- [ ] **Step 1: Write failing API tests**

```python
@pytest.mark.django_db
def test_tracking_endpoint_uses_episodes(auth_client):
    _ingest(1, "BUY", close="100", target="110", stop="95")     # active
    resp = auth_client.get("/api/stocks/signals/tracking/")
    assert resp.status_code == 200
    body = resp.json()
    assert body["summary"]["total_active"] == 1
    assert body["active_positions"][0]["symbol"] == "NABIL"


@pytest.mark.django_db
def test_performance_groups_by_source(auth_client):
    # one WON BUY episode
    ep = _open_episode(symbol="AAA")
    ep.status, ep.end_date, ep.exit_reason, ep.pnl_percent = "WON", date(2026, 1, 5), "TARGET", Decimal("10")
    ep.save()
    resp = auth_client.get("/api/stocks/generated-signals/performance/")
    assert resp.status_code == 200
```

- [ ] **Step 2: Run to verify failure**

Run: `pytest backend/stocks/tests/test_signal_episode_service.py -k "tracking_endpoint or performance_groups" -q`
Expected: FAIL (old `tracking()` reconstructs from `StrategySignal`, now gone / mismatched).

- [ ] **Step 3: Replace `tracking()` in `views/strategy.py`**

Replace the entire `tracking` action body with:

```python
    @action(detail=False, methods=['get'])
    def tracking(self, request):
        from ..models import SignalEpisode
        from ..serializers.signal import SignalEpisodeSerializer

        active_qs = SignalEpisode.objects.filter(status='ACTIVE').order_by('start_date')
        closed_qs = SignalEpisode.objects.exclude(status='ACTIVE').order_by('-end_date')

        def pos(ep, closed):
            data = SignalEpisodeSerializer(ep).data
            data['days_held'] = ep.days_held()
            data['return_pct'] = float(ep.pnl_percent) if ep.pnl_percent is not None else 0.0
            return data

        active = [pos(e, False) for e in active_qs]
        closed = [pos(e, True) for e in closed_qs]
        returns = [p['return_pct'] for p in active + closed]
        held = [p['days_held'] for p in closed]
        return Response({
            'active_positions': sorted(active, key=lambda x: x['days_held'], reverse=True),
            'closed_positions': closed,
            'summary': {
                'total_active': len(active),
                'total_closed': len(closed),
                'avg_return': round(sum(returns) / len(returns), 2) if returns else 0,
                'avg_holding_period': round(sum(held) / len(held), 1) if held else 0,
            },
        })
```

- [ ] **Step 4: Point both ViewSets at `SignalEpisode`**

Change `StrategySignalViewSet` and `GeneratedSignalViewSet` querysets to `SignalEpisode.objects.all()` and `serializer_class = SignalEpisodeSerializer`. Update `filterset_fields` to valid episode fields: `['symbol', 'source', 'status', 'direction', 'strategy']`. For `GeneratedSignalViewSet.performance` / `track_record` / `summary`, replace `GeneratedSignal` references with `SignalEpisode` and group by `source` + `status` (WON/LOST/ACTIVE counts; `pnl_percent` for returns).

- [ ] **Step 5: Drop the dead serializers' model refs**

In `serializers/strategy.py` and `serializers/system.py`, delete `StrategySignalSerializer` / `GeneratedSignalSerializer` and any imports of the removed models. Update `views/strategy.py` imports accordingly (import `SignalEpisodeSerializer`).

- [ ] **Step 6: Run tests**

Run: `pytest backend/stocks/tests/ -q`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/stocks/views/strategy.py backend/stocks/serializers/strategy.py backend/stocks/serializers/system.py backend/stocks/tests/test_signal_episode_service.py
git commit -m "refactor(signals): ViewSets + tracking/performance over SignalEpisode"
```

---

### Task 14: Drop old models, admin, finalize URLs

**Files:**
- Modify: `backend/stocks/models/strategy.py`, `backend/stocks/models/system.py`, `backend/stocks/models/__init__.py`
- Modify: `backend/stocks/admin/strategy.py`
- Modify: `backend/stocks/urls.py`

- [ ] **Step 1: Remove the old models**

Delete the `StrategySignal` class from `models/strategy.py` and the `GeneratedSignal` class from `models/system.py`. Remove them from `models/__init__.py` exports. Grep for stragglers:

Run: `grep -rn "StrategySignal\|GeneratedSignal" backend/stocks --include=*.py`
Expected: only migration files reference them. Fix any remaining app-code references.

- [ ] **Step 2: Update admin**

In `admin/strategy.py`, remove the `StrategySignal` import and its `@admin.register` block; add:

```python
from ..models import SignalEpisode

@admin.register(SignalEpisode)
class SignalEpisodeAdmin(admin.ModelAdmin):
    list_display = ('symbol', 'source', 'direction', 'status', 'start_date', 'end_date', 'pnl_percent')
    list_filter = ('source', 'status', 'direction')
    search_fields = ('symbol', 'strategy__name')
```

- [ ] **Step 3: Make the drop migration**

Run: `python manage.py makemigrations stocks`
Expected: a migration deleting `StrategySignal` and `GeneratedSignal`.

- [ ] **Step 4: Apply migrations + full test run**

Run: `python manage.py migrate && pytest backend/stocks/tests/ backend/tests/ -q`
Expected: PASS. (The orphaned `Notification.strategy_signal_id` column is left as-is; it is never read/written.)

- [ ] **Step 5: Verify URL routes still resolve**

The router basenames (`signals`, `generated-signals`) stay; they now map to episode-backed ViewSets. Confirm:

Run: `python manage.py show_urls 2>/dev/null | grep -E "signals|generated-signals"` *(or)* start the server and curl `/api/stocks/signals/tracking/`.
Expected: routes resolve, 200 with episode JSON.

- [ ] **Step 6: Commit**

```bash
git add backend/stocks/models/ backend/stocks/admin/strategy.py backend/stocks/migrations/ backend/stocks/urls.py
git commit -m "refactor(signals): drop StrategySignal/GeneratedSignal; admin for SignalEpisode"
```

---

## Phase 6 — Frontend verification

### Task 15: Verify the 7 consumers against the compat shape

The serializer preserves `signal`, `generated_date`, `ltp`, `strength`, `status`, `target_price`, `stop_loss_price`, plus adds `days_held`. Most consumers should work unchanged; verify each and patch field names only where a removed field was used.

**Files (verify, patch only if broken):**
- `frontend/src/app/(authenticated)/signals/IntelHubClient.tsx`
- `frontend/src/app/(authenticated)/signals/SignalsPageClient.tsx`
- `frontend/src/app/(authenticated)/signals/track-record/TrackRecordClient.tsx`
- `frontend/src/app/(authenticated)/ticker/[ticker]/page.tsx`
- `frontend/src/app/(authenticated)/market/pa-screener/page.tsx`
- `frontend/src/components/signals/DailySignalStatus.tsx`
- `frontend/src/components/ticker/TickerSignals.tsx`

- [ ] **Step 1: Start backend + frontend, exercise each page**

Run the app (use the `/run` skill or project dev commands). Visit: Signals hub, Signals tracking, Track Record, a ticker page, PA screener. Watch the browser network tab + console for 4xx/5xx or undefined-field render errors.

- [ ] **Step 2: Patch only broken field reads**

For any consumer reading a field that no longer exists (e.g. `last_close` → use `ltp`/`entry_price`; `closed_date` → `end_date`), update the field name. Do not restructure components.

- [ ] **Step 3: Commit (if any patches)**

```bash
git add frontend/src/...
git commit -m "fix(frontend): align signal consumers with SignalEpisode response shape"
```

---

## Self-Review notes

- **Spec coverage:** model (T3) ✓, partial-unique incl. null-strategy (T3) ✓, state machine §4A (T2/T4) ✓, no-re-entry (T2/T7) ✓, evaluation §4B + entry-day guard (T5) ✓, trading-day `days_held` (T6) ✓, backfill/re-derive (T7/T11) ✓, generation rewrite (T9/T10) ✓, API/tracking rewrite (T13) ✓, drop+cutover (T14) ✓, derive-on-demand daily series — **not yet built** (no current consumer needs it; deferred per YAGNI, flagged here so it's explicit).
- **Forward-only sources:** engines lacking a per-date history method are backfilled going-forward only (T11 scope note) — logged, not silent.
- **Producer-key consistency:** `make_producer_key(source, strategy_id)` is the single identity source, used in model, service, and tests.
