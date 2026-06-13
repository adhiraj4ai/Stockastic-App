# SOLID Refactor — Phase 3a: Signal/Notification Monolith Cleanup

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Delete the 10 `_generate_*` methods from `signal_generation_service.py` and the 10 `check_*` functions from `notification_service.py`, which are duplicated in the Phase 1 registry adapters, and update all callers to use the new orchestrators.

**Architecture:** `stocks/services/signals/` holds 10 generator adapters driven by `SignalOrchestrator` (exposed as `signals.default_orchestrator`); `stocks/services/notifications/` holds 10 checker adapters driven by `NotificationOrchestrator` (exposed as `notifications.default_orchestrator`). The monolithic service files must be trimmed to keep only shared helpers (`_persist_signals`, `create_notification`, price utilities) while callers are re-pointed to the orchestrators.

**Tech Stack:** Python 3.11, Django 5.2, pytest, pytest-django

---

## Task 1: Slim `_persist_signals` into ≤30-line helpers

**Files:**
- Modify: `backend/stocks/services/signal_generation_service.py`
- Test: `backend/stocks/tests/test_signal_generation_cleanup.py`

- [ ] **Step 1: Write failing tests**

Create `backend/stocks/tests/test_signal_generation_cleanup.py` with:

```python
import pytest
from unittest.mock import patch, MagicMock
from datetime import date


@pytest.mark.django_db
class TestBuildPriceLevels:
    """_build_price_levels returns correct TP/SL for BUY, SELL, and zero-ltp."""

    def _call(self, sig, ltp):
        from stocks.services.signal_generation_service import SignalGenerationService
        return SignalGenerationService._build_price_levels(sig, ltp)

    def test_buy_no_wac_uses_ltp_sl(self):
        sig = {'signal': 'BUY', 'metadata': {}}
        result = self._call(sig, 100.0)
        assert result == {
            'tp1': 105.0,
            'tp2': 110.0,
            'tp3': 115.0,
            'sl': 95.0,
        }

    def test_buy_wac_below_ltp_uses_wac_sl(self):
        sig = {'signal': 'BUY', 'metadata': {'top_broker_wac': 80.0}}
        result = self._call(sig, 100.0)
        assert result['sl'] == round(80.0 * 0.98, 2)

    def test_buy_wac_above_ltp_uses_ltp_sl(self):
        sig = {'signal': 'BUY', 'metadata': {'top_broker_wac': 120.0}}
        result = self._call(sig, 100.0)
        assert result['sl'] == round(100.0 * 0.95, 2)

    def test_sell_levels(self):
        sig = {'signal': 'SELL', 'metadata': {}}
        result = self._call(sig, 200.0)
        assert result == {
            'tp1': 190.0,
            'tp2': 180.0,
            'tp3': 170.0,
            'sl': 210.0,
        }

    def test_zero_ltp_returns_empty(self):
        sig = {'signal': 'BUY', 'metadata': {}}
        result = self._call(sig, 0.0)
        assert result == {}

    def test_negative_ltp_returns_empty(self):
        sig = {'signal': 'BUY', 'metadata': {}}
        result = self._call(sig, -5.0)
        assert result == {}


@pytest.mark.django_db
class TestPersistOne:
    """_persist_one returns True on success, False on exception."""

    def _call(self, source, sig, today):
        from stocks.services.signal_generation_service import SignalGenerationService
        return SignalGenerationService._persist_one(source, sig, today)

    def test_persist_one_success(self):
        sig = {
            'symbol': 'NABIL',
            'signal': 'BUY',
            'ltp': 1000.0,
            'strength': 80,
            'signal_tier': 'A',
            'rationale': 'test',
            'metadata': {},
        }
        with patch('stocks.services.signal_generation_service.ingest_reading') as mock_ingest, \
             patch('stocks.services.signal_generation_service.engine_reading') as mock_engine:
            mock_engine.return_value = MagicMock()
            result = self._call('SMART_MONEY', sig, date.today())
        assert result is True

    def test_persist_one_exception_returns_false(self):
        sig = {'symbol': 'NABIL', 'signal': 'BUY', 'ltp': 100.0, 'metadata': {}}
        with patch('stocks.services.signal_generation_service.ingest_reading',
                   side_effect=Exception("DB error")):
            result = self._call('SMART_MONEY', sig, date.today())
        assert result is False
```

- [ ] **Step 2: Run tests to verify failure**

```
Run: pytest stocks/tests/test_signal_generation_cleanup.py::TestBuildPriceLevels -v
Expected: FAIL with AttributeError — _build_price_levels does not exist yet
```

- [ ] **Step 3: Write implementation**

In `backend/stocks/services/signal_generation_service.py`, add module-level imports at the top so `ingest_reading` and `engine_reading` are importable at module scope (move them out of the loop body), then add the two new static helpers and slim `_persist_signals`:

```python
"""
Signal Generation Service

Orchestrates generation of all signal types and persists them to SignalEpisode via ingest_reading.
Called by the `generate_all_signals` management command, which is triggered via pipeline.
"""

import logging
from datetime import date

from .signal_episode.service import ingest_reading
from .signal_episode.adapters import engine_reading

logger = logging.getLogger(__name__)


class SignalGenerationService:
    """Generates and stores signals from all sources."""

    @staticmethod
    def generate_all(progress_callback=None):
        """Delegate to signals.default_orchestrator."""
        from stocks.services.signals import default_orchestrator
        return default_orchestrator.generate_all(progress_callback)

    @staticmethod
    def _build_price_levels(sig: dict, ltp: float) -> dict:
        """Return tp1/tp2/tp3/sl for a signal given ltp. Returns {} when ltp <= 0."""
        if ltp <= 0:
            return {}
        if sig['signal'] == 'BUY':
            wac = sig.get('metadata', {}).get('top_broker_wac', 0)
            sl = round(wac * 0.98, 2) if (wac > 0 and wac < ltp) else round(ltp * 0.95, 2)
            return {
                'tp1': round(ltp * 1.05, 2),
                'tp2': round(ltp * 1.10, 2),
                'tp3': round(ltp * 1.15, 2),
                'sl': sl,
            }
        if sig['signal'] == 'SELL':
            return {
                'tp1': round(ltp * 0.95, 2),
                'tp2': round(ltp * 0.90, 2),
                'tp3': round(ltp * 0.85, 2),
                'sl': round(ltp * 1.05, 2),
            }
        return {}

    @staticmethod
    def _persist_one(source: str, sig: dict, today: date) -> bool:
        """Persist a single signal dict. Returns True on success, False on failure."""
        try:
            ltp = float(sig.get('ltp', 0))
            metadata = dict(sig.get('metadata', {}))
            levels = SignalGenerationService._build_price_levels(sig, ltp)
            if levels:
                metadata.update(levels)
            ingest_reading(
                source=source,
                strategy=None,
                symbol=sig['symbol'],
                reading=engine_reading(
                    d=sig.get('generated_date', today),
                    signal=sig['signal'],
                    ltp=ltp,
                    strength=sig.get('strength', 0),
                    tier=sig.get('signal_tier', ''),
                    rationale=sig.get('rationale', ''),
                    target=levels.get('tp2', sig.get('target_price')),
                    stop=levels.get('sl', sig.get('stop_loss_price')),
                    metadata=metadata,
                ),
            )
            return True
        except Exception as e:
            logger.error("Failed to save signal for %s: %s", sig.get('symbol'), e)
            return False

    @staticmethod
    def _persist_signals(source: str, signals: list) -> int:
        """Persist a list of signal dicts. Returns count of successfully saved signals."""
        if not signals:
            return 0
        today = date.today()
        return sum(
            1 for sig in signals
            if SignalGenerationService._persist_one(source, sig, today)
        )
```

- [ ] **Step 4: Run tests**

```
Run: pytest stocks/tests/test_signal_generation_cleanup.py::TestBuildPriceLevels stocks/tests/test_signal_generation_cleanup.py::TestPersistOne -v
Expected: 8 passed
```

- [ ] **Step 5: Commit**

```bash
git add backend/stocks/services/signal_generation_service.py \
        backend/stocks/tests/test_signal_generation_cleanup.py
git commit -m "refactor(signals): extract _build_price_levels + _persist_one; slim _persist_signals to ≤30 lines"
```

---

## Task 2: Slim `generate_all` and delete `_generate_*` methods

**Files:**
- Modify: `backend/stocks/services/signal_generation_service.py`
- Test: `backend/stocks/tests/test_signal_generation_cleanup.py`

- [ ] **Step 1: Write failing tests**

Append to `backend/stocks/tests/test_signal_generation_cleanup.py`:

```python
class TestGenerateAllDelegates:
    """generate_all must delegate to signals.default_orchestrator."""

    def test_generate_all_calls_orchestrator(self):
        from stocks.services.signal_generation_service import SignalGenerationService
        with patch(
            'stocks.services.signals.default_orchestrator.generate_all',
            return_value=42,
        ) as mock_ga:
            result = SignalGenerationService.generate_all(None)
        mock_ga.assert_called_once_with(None)
        assert result == 42

    def test_generate_all_forwards_callback(self):
        from stocks.services.signal_generation_service import SignalGenerationService
        cb = MagicMock()
        with patch(
            'stocks.services.signals.default_orchestrator.generate_all',
            return_value=0,
        ) as mock_ga:
            SignalGenerationService.generate_all(cb)
        mock_ga.assert_called_once_with(cb)


class TestOldGeneratorMethodsRemoved:
    """All 10 _generate_* static methods must not exist after cleanup."""

    OLD_METHODS = [
        '_generate_smart_money_signals',
        '_generate_broker_accumulation_signals',
        '_generate_smart_crossover_signals',
        '_generate_ichimoku_signals',
        '_generate_distribution_alert_signals',
        '_generate_below_cost_reversal_signals',
        '_generate_volume_breakout_signals',
        '_generate_concentration_shift_signals',
        '_generate_accumulation_momentum_signals',
        '_generate_institutional_alerts',
    ]

    def test_old_methods_do_not_exist(self):
        from stocks.services.signal_generation_service import SignalGenerationService
        for method_name in self.OLD_METHODS:
            assert not hasattr(SignalGenerationService, method_name), (
                f"SignalGenerationService.{method_name} should have been deleted"
            )
```

- [ ] **Step 2: Run tests to verify failure**

```
Run: pytest stocks/tests/test_signal_generation_cleanup.py::TestOldGeneratorMethodsRemoved -v
Expected: FAIL — methods still exist
```

- [ ] **Step 3: Write implementation**

Delete all lines from 107 to 1086 (everything from `_generate_smart_money_signals` onward) in `backend/stocks/services/signal_generation_service.py`. The file should contain only the module docstring, imports, logger, and the `SignalGenerationService` class with four methods: `generate_all`, `_build_price_levels`, `_persist_one`, and `_persist_signals`.

The final `generate_all` body (already written in Task 1):

```python
    @staticmethod
    def generate_all(progress_callback=None):
        """Delegate to signals.default_orchestrator."""
        from stocks.services.signals import default_orchestrator
        return default_orchestrator.generate_all(progress_callback)
```

- [ ] **Step 4: Run tests**

```
Run: pytest stocks/tests/test_signal_generation_cleanup.py -v
Expected: all tests pass (TestBuildPriceLevels + TestPersistOne + TestGenerateAllDelegates + TestOldGeneratorMethodsRemoved)
```

- [ ] **Step 5: Commit**

```bash
git add backend/stocks/services/signal_generation_service.py \
        backend/stocks/tests/test_signal_generation_cleanup.py
git commit -m "refactor(signals): delete 10 _generate_* methods; generate_all delegates to orchestrator"
```

---

## Task 3: Update signal callers (`tasks.py`, management commands, backtest generators)

**Files:**
- Modify: `backend/stocks/tasks.py`
- Modify: `backend/stocks/management/commands/generate_all_signals.py`
- Modify: `backend/stocks/management/commands/backtest_whale_engines.py`
- Modify: `backend/stocks/services/signals/generators/distribution_alert.py`
- Modify: `backend/stocks/services/signals/generators/below_cost_reversal.py`
- Modify: `backend/stocks/services/signals/generators/volume_breakout.py`
- Modify: `backend/stocks/services/signals/generators/concentration_shift.py`
- Test: `backend/stocks/tests/test_signal_generation_cleanup.py`

- [ ] **Step 1: Write failing tests**

Append to `backend/stocks/tests/test_signal_generation_cleanup.py`:

```python
class TestGenerateAllSignalsTask:
    """generate_all_signals_task must use signals.default_orchestrator, not SignalGenerationService."""

    def test_task_uses_orchestrator(self):
        with patch('stocks.services.signals.default_orchestrator.generate_all', return_value=5) as mock_ga, \
             patch('stocks.services.signal_episode.service.evaluate_active_episodes', return_value=2):
            from stocks.tasks import generate_all_signals_task
            result = generate_all_signals_task()
        mock_ga.assert_called_once()
        assert result['signals_saved'] == 5
        assert result['episodes_closed'] == 2

    def test_task_does_not_import_signal_generation_service(self):
        """The task module must not import SignalGenerationService after cleanup."""
        import ast, inspect
        import stocks.tasks as tasks_mod
        src = inspect.getsource(tasks_mod)
        tree = ast.parse(src)
        imports = [
            node for node in ast.walk(tree)
            if isinstance(node, (ast.Import, ast.ImportFrom))
        ]
        for imp in imports:
            if isinstance(imp, ast.ImportFrom) and imp.module:
                assert 'signal_generation_service' not in imp.module, (
                    "tasks.py must not import signal_generation_service directly"
                )


class TestBacktestGeneratorsHavePublicMethod:
    """The 4 backtest generators must expose generate_for_date()."""

    GENERATOR_CLASSES = [
        ('stocks.services.signals.generators.distribution_alert', 'DistributionAlertGenerator'),
        ('stocks.services.signals.generators.below_cost_reversal', 'BelowCostReversalGenerator'),
        ('stocks.services.signals.generators.volume_breakout', 'VolumeBreakoutGenerator'),
        ('stocks.services.signals.generators.concentration_shift', 'ConcentrationShiftGenerator'),
    ]

    def test_generate_for_date_exists(self):
        import importlib
        for module_path, class_name in self.GENERATOR_CLASSES:
            mod = importlib.import_module(module_path)
            cls = getattr(mod, class_name)
            assert hasattr(cls, 'generate_for_date'), (
                f"{class_name} must have generate_for_date()"
            )

    def test_generate_for_date_calls_run(self):
        from stocks.services.signals.generators.distribution_alert import DistributionAlertGenerator
        gen = DistributionAlertGenerator()
        sentinel = [{'symbol': 'TEST'}]
        with patch.object(gen, '_run', return_value=sentinel) as mock_run:
            result = gen.generate_for_date(target_date=None)
        mock_run.assert_called_once_with(target_date=None)
        assert result is sentinel
```

- [ ] **Step 2: Run tests to verify failure**

```
Run: pytest stocks/tests/test_signal_generation_cleanup.py::TestGenerateAllSignalsTask stocks/tests/test_signal_generation_cleanup.py::TestBacktestGeneratorsHavePublicMethod -v
Expected: FAIL
```

- [ ] **Step 3: Write implementation**

**3a. Update `backend/stocks/tasks.py` lines 88–95** — replace the `generate_all_signals_task` body:

```python
@shared_task
def generate_all_signals_task():
    """Daily: run every signal engine, then resolve ACTIVE episodes on TP/SL."""
    from stocks.services.signals import default_orchestrator
    from stocks.services.signal_episode.service import evaluate_active_episodes
    saved = default_orchestrator.generate_all(None)
    closed = evaluate_active_episodes()
    return {"signals_saved": saved, "episodes_closed": closed}
```

**3b. Update `backend/stocks/management/commands/generate_all_signals.py`**:

```python
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = 'Generates all intel signals via the registry orchestrator and stores them in the database.'

    def handle(self, *args, **options):
        from stocks.services.signals import default_orchestrator
        from stocks.services.signal_episode.service import evaluate_active_episodes

        def progress_callback(current, total, source):
            self.stdout.write(f"Processing source {current}/{total}: {source}")

        total_saved = default_orchestrator.generate_all(progress_callback)
        self.stdout.write(self.style.WARNING("Running active signal evaluator across market data..."))
        evaluated = evaluate_active_episodes()
        self.stdout.write(self.style.SUCCESS(
            f"All signal generation complete. Total signals saved: {total_saved}. "
            f"Signals triggered TP/SL: {evaluated}."
        ))
```

**3c. Add `generate_for_date` to each of the 4 backtest generators.**

In `backend/stocks/services/signals/generators/distribution_alert.py`, after the existing `generate(self)` method inside `DistributionAlertGenerator`:

```python
    def generate_for_date(self, target_date=None) -> list[dict]:
        """Public entry-point for historical backtest runs."""
        return self._run(target_date=target_date)
```

Apply identically to:
- `BelowCostReversalGenerator` in `below_cost_reversal.py`
- `VolumeBreakoutGenerator` in `volume_breakout.py`
- `ConcentrationShiftGenerator` in `concentration_shift.py`

**3d. Update `backend/stocks/management/commands/backtest_whale_engines.py`**:

```python
from django.core.management.base import BaseCommand
from django.db import connections
from django.core.management import call_command


class Command(BaseCommand):
    help = 'Backtest whale watch strategies over historical data for the last year.'

    def handle(self, *args, **options):
        from stocks.models import SignalEpisode
        from stocks.services.signal_generation_service import SignalGenerationService
        from stocks.services.signals.generators.distribution_alert import DistributionAlertGenerator
        from stocks.services.signals.generators.below_cost_reversal import BelowCostReversalGenerator
        from stocks.services.signals.generators.volume_breakout import VolumeBreakoutGenerator
        from stocks.services.signals.generators.concentration_shift import ConcentrationShiftGenerator

        dates = self._fetch_dates()
        if not dates:
            self.stdout.write(self.style.ERROR("No historical dates found."))
            return

        self.stdout.write(f"Found {len(dates)} trading dates. Starting backtest...")
        engines = [
            ('DISTRIBUTION_ALERT', DistributionAlertGenerator()),
            ('BELOW_COST_REVERSAL', BelowCostReversalGenerator()),
            ('VOLUME_BREAKOUT', VolumeBreakoutGenerator()),
            ('CONCENTRATION_SHIFT', ConcentrationShiftGenerator()),
        ]
        total = sum(
            self._process_day(i, target_date, engines, len(dates), SignalGenerationService)
            for i, target_date in enumerate(dates)
        )
        self.stdout.write(self.style.SUCCESS(f"Backtest complete! Total signals: {total}"))
        self.stdout.write("Running active signal evaluator for historical PnL...")
        call_command('evaluate_signals')
        self.stdout.write(self.style.SUCCESS("Whale Watch historical backtest fully complete."))

    def _fetch_dates(self):
        query = """
            SELECT DISTINCT transaction_date
            FROM daily_stock_price
            WHERE transaction_date >= CURRENT_DATE - INTERVAL '1 year'
            ORDER BY transaction_date ASC;
        """
        with connections['default'].cursor() as cursor:
            cursor.execute(query)
            return [row[0] for row in cursor.fetchall()]

    def _process_day(self, i, target_date, engines, total_days, SignalGenerationService):
        from stocks.models import SignalEpisode
        if i % 10 == 0:
            self.stdout.write(f"Processing day {i + 1}/{total_days}: {target_date}...")
        day_signals = 0
        for source_key, gen in engines:
            if SignalEpisode.objects.filter(source=source_key, start_date=target_date).exists():
                continue
            try:
                signals = gen.generate_for_date(target_date=target_date)
                day_signals += SignalGenerationService._persist_signals(source_key, signals)
            except Exception as e:
                self.stdout.write(self.style.ERROR(f"[{source_key}] Failed on {target_date}: {e}"))
        return day_signals
```

- [ ] **Step 4: Run tests**

```
Run: pytest stocks/tests/test_signal_generation_cleanup.py -v
Expected: all tests pass
```

- [ ] **Step 5: Commit**

```bash
git add backend/stocks/tasks.py \
        backend/stocks/management/commands/generate_all_signals.py \
        backend/stocks/management/commands/backtest_whale_engines.py \
        backend/stocks/services/signals/generators/distribution_alert.py \
        backend/stocks/services/signals/generators/below_cost_reversal.py \
        backend/stocks/services/signals/generators/volume_breakout.py \
        backend/stocks/services/signals/generators/concentration_shift.py \
        backend/stocks/tests/test_signal_generation_cleanup.py
git commit -m "refactor(signals): update all callers to use orchestrator; add generate_for_date to 4 backtest generators"
```

---

## Task 4: Slim `create_notification` in `notification_service.py`

**Files:**
- Modify: `backend/stocks/services/notification_service.py`
- Test: `backend/stocks/tests/test_notification_service_cleanup.py`

- [ ] **Step 1: Write failing tests**

Create `backend/stocks/tests/test_notification_service_cleanup.py`:

```python
import pytest
from unittest.mock import patch, MagicMock
from datetime import timedelta
from django.utils import timezone


@pytest.mark.django_db
class TestFindExistingUnread:
    """_find_existing_unread returns the first matching unread Notification or None."""

    def test_returns_none_when_no_match(self, django_user_model):
        from stocks.services.notification_service import _find_existing_unread
        user = django_user_model.objects.create_user(username='u1', password='pw')
        result = _find_existing_unread(user, 'STOP_LOSS_HIT', 'NABIL')
        assert result is None

    def test_returns_existing_unread_notification(self, django_user_model):
        from stocks.services.notification_service import _find_existing_unread
        from stocks.models import Notification
        user = django_user_model.objects.create_user(username='u2', password='pw')
        notif = Notification.objects.create(
            user=user,
            type='STOP_LOSS_HIT',
            ticker='NABIL',
            title='Test',
            message='Test msg',
            read=False,
            severity='critical',
        )
        result = _find_existing_unread(user, 'STOP_LOSS_HIT', 'NABIL')
        assert result == notif

    def test_ignores_read_notifications(self, django_user_model):
        from stocks.services.notification_service import _find_existing_unread
        from stocks.models import Notification
        user = django_user_model.objects.create_user(username='u3', password='pw')
        Notification.objects.create(
            user=user, type='STOP_LOSS_HIT', ticker='NABIL',
            title='T', message='M', read=True, severity='critical',
        )
        result = _find_existing_unread(user, 'STOP_LOSS_HIT', 'NABIL')
        assert result is None


@pytest.mark.django_db
class TestCheckRecentDuplicate:
    """_check_recent_duplicate returns True when a notification of same type/ticker was created within 1 hour."""

    def test_returns_false_when_no_recent(self, django_user_model):
        from stocks.services.notification_service import _check_recent_duplicate
        user = django_user_model.objects.create_user(username='u4', password='pw')
        assert _check_recent_duplicate(user, 'STOP_LOSS_HIT', 'NABIL') is False

    def test_returns_true_within_one_hour(self, django_user_model):
        from stocks.services.notification_service import _check_recent_duplicate
        from stocks.models import Notification
        user = django_user_model.objects.create_user(username='u5', password='pw')
        notif = Notification.objects.create(
            user=user, type='STOP_LOSS_HIT', ticker='NABIL',
            title='T', message='M', read=True, severity='critical',
        )
        # Manually set created_at to 30 minutes ago
        Notification.objects.filter(pk=notif.pk).update(
            created_at=timezone.now() - timedelta(minutes=30)
        )
        assert _check_recent_duplicate(user, 'STOP_LOSS_HIT', 'NABIL') is True

    def test_returns_false_older_than_one_hour(self, django_user_model):
        from stocks.services.notification_service import _check_recent_duplicate
        from stocks.models import Notification
        user = django_user_model.objects.create_user(username='u6', password='pw')
        notif = Notification.objects.create(
            user=user, type='STOP_LOSS_HIT', ticker='NABIL',
            title='T', message='M', read=True, severity='critical',
        )
        Notification.objects.filter(pk=notif.pk).update(
            created_at=timezone.now() - timedelta(hours=2)
        )
        assert _check_recent_duplicate(user, 'STOP_LOSS_HIT', 'NABIL') is False


@pytest.mark.django_db
class TestCreateNotificationBodyLength:
    """create_notification body must be ≤30 lines."""

    def test_body_line_count(self):
        import inspect, ast
        from stocks.services import notification_service
        src = inspect.getsource(notification_service.create_notification)
        # Strip decorator and def line; count only the body
        lines = src.splitlines()
        body_lines = [l for l in lines if l.strip() and not l.strip().startswith('def ')]
        assert len(body_lines) <= 30, (
            f"create_notification body has {len(body_lines)} lines (limit: 30)"
        )
```

- [ ] **Step 2: Run tests to verify failure**

```
Run: pytest stocks/tests/test_notification_service_cleanup.py::TestFindExistingUnread stocks/tests/test_notification_service_cleanup.py::TestCheckRecentDuplicate -v
Expected: FAIL with ImportError — _find_existing_unread and _check_recent_duplicate do not exist
```

- [ ] **Step 3: Write implementation**

Replace lines 32–85 in `backend/stocks/services/notification_service.py` with:

```python
def _find_existing_unread(user, notification_type, ticker):
    """Return first unread Notification matching type and ticker, or None."""
    return Notification.objects.filter(
        user=user,
        type=notification_type,
        ticker=ticker,
        read=False,
    ).first()


def _check_recent_duplicate(user, notification_type, ticker):
    """Return True if a notification of the same type/ticker was created within the last hour."""
    from datetime import timedelta
    one_hour_ago = timezone.now() - timedelta(hours=1)
    return Notification.objects.filter(
        user=user,
        type=notification_type,
        ticker=ticker,
        created_at__gte=one_hour_ago,
    ).exists()


def create_notification(user, notification_type, title, message, ticker=None, redirect_url=None,
                        portfolio_item_id=None, watchlist_item_id=None, metadata=None, severity=None):
    """
    Create or re-alert a notification.
    Unread duplicates are updated in-place (re-alert). Read duplicates within 1 hour are suppressed.
    """
    resolved_severity = severity or SEVERITY_MAP.get(str(notification_type), 'normal')

    existing_unread = _find_existing_unread(user, notification_type, ticker)
    if existing_unread:
        existing_unread.title = title
        existing_unread.message = message
        existing_unread.created_at = timezone.now()
        existing_unread.severity = resolved_severity
        if metadata:
            existing_unread.metadata = metadata
        existing_unread.save()
        return existing_unread

    if _check_recent_duplicate(user, notification_type, ticker):
        return None

    return Notification.objects.create(
        user=user, type=notification_type, title=title, message=message,
        ticker=ticker, redirect_url=redirect_url,
        portfolio_item_id=portfolio_item_id, watchlist_item_id=watchlist_item_id,
        metadata=metadata or {}, severity=resolved_severity,
    )
```

Also remove the now-redundant `from django.utils import timezone` and `from datetime import timedelta` local imports inside the old function body (they are already imported at module level: `timezone` is imported via `from django.utils import timezone` at the top).

- [ ] **Step 4: Run tests**

```
Run: pytest stocks/tests/test_notification_service_cleanup.py -v
Expected: all tests pass (TestFindExistingUnread + TestCheckRecentDuplicate + TestCreateNotificationBodyLength)
```

- [ ] **Step 5: Commit**

```bash
git add backend/stocks/services/notification_service.py \
        backend/stocks/tests/test_notification_service_cleanup.py
git commit -m "refactor(notifications): extract _find_existing_unread + _check_recent_duplicate; slim create_notification to ≤30 lines"
```

---

## Task 5: Delete old `check_*` functions from `notification_service.py`

**Files:**
- Modify: `backend/stocks/services/notification_service.py`
- Test: `backend/stocks/tests/test_notification_service_cleanup.py`

- [ ] **Step 1: Write failing tests**

Append to `backend/stocks/tests/test_notification_service_cleanup.py`:

```python
class TestOldCheckFunctionsRemoved:
    """All 10 check_* functions and check_all_users must not exist in notification_service."""

    OLD_FUNCTIONS = [
        'check_portfolio_alerts',
        'check_watchlist_alerts',
        'check_zone_entry_alerts',
        'check_active_signal_alerts',
        'check_whale_watch_alerts',
        'check_signal_alerts',
        'check_accumulation_trend_alerts',
        'check_all_users',
        'check_technical_alerts',
        'check_broker_discovery_alerts',
        'check_portfolio_management_alerts',
    ]

    def test_old_check_functions_do_not_exist(self):
        import stocks.services.notification_service as ns
        for fn_name in self.OLD_FUNCTIONS:
            assert not hasattr(ns, fn_name), (
                f"notification_service.{fn_name} should have been deleted"
            )

    def test_module_only_exports_expected_names(self):
        import stocks.services.notification_service as ns
        expected_public = {
            'SEVERITY_MAP',
            'create_notification',
            'get_latest_price',
            'get_latest_day_change',
        }
        actual_public = {
            name for name in dir(ns)
            if not name.startswith('_')
            and not name[0].isupper()  # exclude imported classes (User, Notification, etc.)
            or name in expected_public
        }
        unexpected = actual_public - expected_public - {
            # Allow module-level Django imports that aren't functions
            'connections',
        }
        # Filter to only functions/non-class names actually defined in this module
        import inspect
        defined_here = {
            name for name in dir(ns)
            if not name.startswith('_')
            and inspect.isfunction(getattr(ns, name, None))
            and getattr(getattr(ns, name, None), '__module__', '') == ns.__name__
        }
        unexpected_fns = defined_here - {'create_notification', 'get_latest_price',
                                          'get_latest_day_change', '_find_existing_unread',
                                          '_check_recent_duplicate'}
        assert not unexpected_fns, (
            f"Unexpected functions still in notification_service: {unexpected_fns}"
        )
```

- [ ] **Step 2: Run tests to verify failure**

```
Run: pytest stocks/tests/test_notification_service_cleanup.py::TestOldCheckFunctionsRemoved -v
Expected: FAIL — old check_* functions still exist
```

- [ ] **Step 3: Write implementation**

Delete everything from line 107 (`def check_portfolio_alerts`) onward to the end of `backend/stocks/services/notification_service.py`. This removes:

- `check_portfolio_alerts` (line 107)
- `check_watchlist_alerts` (line 259)
- `check_zone_entry_alerts` (line 356)
- `check_active_signal_alerts` (line 401)
- `check_whale_watch_alerts` (line 530)
- `check_signal_alerts` (line 618)
- `check_accumulation_trend_alerts` (line 713)
- `check_all_users` (line 861)
- `check_technical_alerts` (line 870)
- `check_broker_discovery_alerts` (line 983)
- `check_portfolio_management_alerts` (line 1032)

Also remove the now-unused imports from the module header that were only referenced by those functions: `connections`, `Sum`, `F`, `Q`, `Avg`, and the model imports `DailyCumulativeAccumulation`, `DailyFloorsheet` (keep `Notification`, `PortfolioItem`, `WatchlistItem`, `DailyStockPrice`, `Company` — verify usage by the retained helpers before removing each).

After deletion, the file should contain only:
1. The 6 import lines (trimmed)
2. `SEVERITY_MAP`
3. `_find_existing_unread`
4. `_check_recent_duplicate`
5. `create_notification`
6. `get_latest_price`
7. `get_latest_day_change`

- [ ] **Step 4: Run tests**

```
Run: pytest stocks/tests/test_notification_service_cleanup.py -v
Expected: all tests pass
```

- [ ] **Step 5: Commit**

```bash
git add backend/stocks/services/notification_service.py \
        backend/stocks/tests/test_notification_service_cleanup.py
git commit -m "refactor(notifications): delete 11 check_* functions from notification_service; module is now helpers-only"
```

---

## Task 6: Update `trigger_check` view to use `default_orchestrator`

**Files:**
- Modify: `backend/stocks/views/notifications.py`
- Test: `backend/stocks/tests/test_notification_service_cleanup.py`

- [ ] **Step 1: Write failing tests**

Append to `backend/stocks/tests/test_notification_service_cleanup.py`:

```python
@pytest.mark.django_db
class TestTriggerCheckUsesOrchestrator:
    """trigger_check must use notifications.default_orchestrator.run(user), not individual check_* functions."""

    def _get_view_source(self):
        import inspect
        from stocks.views.notifications import NotificationViewSet
        return inspect.getsource(NotificationViewSet.trigger_check)

    def test_does_not_import_old_check_functions(self):
        src = self._get_view_source()
        banned = [
            'check_portfolio_alerts', 'check_watchlist_alerts',
            'check_signal_alerts', 'check_whale_watch_alerts',
            'check_active_signal_alerts', 'check_zone_entry_alerts',
        ]
        for name in banned:
            assert name not in src, (
                f"trigger_check must not reference {name}"
            )

    def test_imports_default_orchestrator(self):
        src = self._get_view_source()
        assert 'default_orchestrator' in src

    def test_trigger_check_response_shape(self, django_user_model, rf):
        """trigger_check returns status + total_notifications (no per-category counts)."""
        from stocks.views.notifications import NotificationViewSet
        from rest_framework.test import APIRequestFactory
        from unittest.mock import patch

        user = django_user_model.objects.create_user(username='tu1', password='pw')
        factory = APIRequestFactory()
        request = factory.post('/notifications/trigger_check/')
        request.user = user

        with patch('django.core.cache.cache.get', return_value=None), \
             patch('django.core.cache.cache.set'), \
             patch(
                 'stocks.services.notifications.default_orchestrator.run',
                 return_value=7,
             ):
            view = NotificationViewSet.as_view({'post': 'trigger_check'})
            response = view(request)

        assert response.status_code == 200
        assert response.data['status'] == 'check complete'
        assert response.data['total_notifications'] == 7
        # Must NOT have per-category keys
        assert 'portfolio_notifications' not in response.data
        assert 'watchlist_notifications' not in response.data

    def test_trigger_check_cooldown_still_works(self, django_user_model, rf):
        from stocks.views.notifications import NotificationViewSet
        from rest_framework.test import APIRequestFactory
        from unittest.mock import patch

        user = django_user_model.objects.create_user(username='tu2', password='pw')
        factory = APIRequestFactory()
        request = factory.post('/notifications/trigger_check/')
        request.user = user

        with patch('django.core.cache.cache.get', return_value=True):
            view = NotificationViewSet.as_view({'post': 'trigger_check'})
            response = view(request)

        assert response.status_code == 200
        assert response.data['status'] == 'skipped'
        assert response.data['cooldown_active'] is True
```

- [ ] **Step 2: Run tests to verify failure**

```
Run: pytest stocks/tests/test_notification_service_cleanup.py::TestTriggerCheckUsesOrchestrator -v
Expected: FAIL — trigger_check still imports and calls old check_* functions
```

- [ ] **Step 3: Write implementation**

Replace the `trigger_check` action body in `backend/stocks/views/notifications.py` (lines 75–116):

```python
    @action(detail=False, methods=['POST'])
    def trigger_check(self, request):
        """
        Manually trigger notification checks for all sources.
        Includes a 10-minute cooldown to prevent redundant heavy scans.
        """
        from django.core.cache import cache
        from ..services.notifications import default_orchestrator

        cache_key = f"notif_check_cooldown_{request.user.id}"
        if cache.get(cache_key):
            return Response({
                'status': 'skipped',
                'message': 'Notification check recently performed. Please wait a few minutes.',
                'cooldown_active': True,
            })

        total = default_orchestrator.run(request.user)
        cache.set(cache_key, True, 600)
        return Response({'status': 'check complete', 'total_notifications': total})
```

Also remove the now-unused `CATEGORY_TYPES` constant at the top of the file if it is no longer referenced by any other method in `NotificationViewSet`. Verify by grepping: if `CATEGORY_TYPES` appears only in `get_queryset` it must be kept; if it was only used by `trigger_check` it can be removed. (It is used by `get_queryset` on line 43 — keep it.)

- [ ] **Step 4: Run tests**

```
Run: pytest stocks/tests/test_notification_service_cleanup.py -v
Expected: all tests pass

Run: pytest stocks/tests/ -v --tb=short
Expected: full suite green — no regressions
```

- [ ] **Step 5: Commit**

```bash
git add backend/stocks/views/notifications.py \
        backend/stocks/tests/test_notification_service_cleanup.py
git commit -m "refactor(notifications): replace 6 individual check_* calls in trigger_check with default_orchestrator.run()"
```

---

## Final verification

After all 6 tasks are complete, run the full backend test suite:

```bash
cd /Users/jugalraj/Documents/Projects/Stockastic/backend
source .venv/bin/activate
pytest stocks/tests/ -v --tb=short
```

Expected outcome:
- `test_signal_generation_cleanup.py` — all tests pass
- `test_notification_service_cleanup.py` — all tests pass
- No regressions in existing `stocks/tests/` tests
- `signal_generation_service.py` has ≤ 60 lines total (4 methods, no `_generate_*`)
- `notification_service.py` has ≤ 80 lines total (7 top-level names, no `check_*`)
