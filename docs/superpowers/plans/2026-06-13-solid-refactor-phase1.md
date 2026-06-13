# SOLID Refactor — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the four highest-impact architectural violations into deep, SOLID-compliant modules with full unit test coverage.

**Architecture:** Each refactor follows the same pattern — introduce an `IXxx` Protocol at a seam, extract each concrete responsibility into its own adapter module, replace the monolith with a thin orchestrator that iterates a registry. The orchestrator's interface stays identical to what callers already expect, so nothing breaks.

**Tech Stack:** Python 3.11, Django 5.2, pytest, `typing.Protocol` (runtime-checkable), dataclasses

---

## File Map

### Refactor 1 — NotificationService → alert-checker registry

| Action | Path |
|--------|------|
| Create | `backend/stocks/services/notifications/__init__.py` |
| Create | `backend/stocks/services/notifications/base.py` |
| Create | `backend/stocks/services/notifications/orchestrator.py` |
| Create | `backend/stocks/services/notifications/checkers/__init__.py` |
| Create | `backend/stocks/services/notifications/checkers/portfolio.py` |
| Create | `backend/stocks/services/notifications/checkers/watchlist.py` |
| Create | `backend/stocks/services/notifications/checkers/signals.py` |
| Create | `backend/stocks/services/notifications/checkers/whale_watch.py` |
| Create | `backend/stocks/services/notifications/checkers/zone_entry.py` |
| Create | `backend/stocks/services/notifications/checkers/active_signal.py` |
| Create | `backend/stocks/services/notifications/checkers/accumulation_trend.py` |
| Create | `backend/stocks/services/notifications/checkers/technical.py` |
| Create | `backend/stocks/services/notifications/checkers/broker_discovery.py` |
| Create | `backend/stocks/services/notifications/checkers/portfolio_management.py` |
| Modify | `backend/stocks/services/notification_service.py` (re-export shim) |
| Modify | `backend/stocks/tasks.py` |
| Create | `backend/stocks/tests/test_notification_checkers.py` |

### Refactor 2 — SignalGenerationService → generator registry

| Action | Path |
|--------|------|
| Create | `backend/stocks/services/signals/__init__.py` |
| Create | `backend/stocks/services/signals/base.py` |
| Create | `backend/stocks/services/signals/orchestrator.py` |
| Create | `backend/stocks/services/signals/generators/__init__.py` |
| Create | `backend/stocks/services/signals/generators/smart_money.py` |
| Create | `backend/stocks/services/signals/generators/broker_accumulation.py` |
| Create | `backend/stocks/services/signals/generators/smart_crossover.py` |
| Create | `backend/stocks/services/signals/generators/ichimoku.py` |
| Create | `backend/stocks/services/signals/generators/distribution_alert.py` |
| Create | `backend/stocks/services/signals/generators/below_cost_reversal.py` |
| Create | `backend/stocks/services/signals/generators/volume_breakout.py` |
| Create | `backend/stocks/services/signals/generators/concentration_shift.py` |
| Create | `backend/stocks/services/signals/generators/accumulation_momentum.py` |
| Create | `backend/stocks/services/signals/generators/institutional_alerts.py` |
| Modify | `backend/stocks/services/signal_generation_service.py` (re-export shim) |
| Create | `backend/stocks/tests/test_signal_generators.py` |

### Refactor 3 — stock_summary() → MarketSummaryService

| Action | Path |
|--------|------|
| Create | `backend/stocks/services/market_summary_service.py` |
| Modify | `backend/stocks/views/market.py` (thin view) |
| Create | `backend/stocks/tests/test_market_summary_service.py` |

### Refactor 4 — 18 seed commands → one parameterised loader

| Action | Path |
|--------|------|
| Create | `backend/stocks/services/financial_data_loader.py` |
| Create | `backend/stocks/management/commands/seed_financials.py` |
| Create | `backend/stocks/tests/test_financial_data_loader.py` |
| Delete | `backend/stocks/management/commands/seed_*_financials.py` (18 files) |

---

## Task 1: IAlertChecker Protocol and Alert dataclass

**Files:**
- Create: `backend/stocks/services/notifications/base.py`
- Create: `backend/stocks/tests/test_notification_checkers.py`

- [ ] **Step 1: Write the failing test**

```python
# backend/stocks/tests/test_notification_checkers.py
from dataclasses import dataclass
import pytest


def test_alert_dataclass_has_required_fields():
    from stocks.services.notifications.base import Alert
    alert = Alert(
        notification_type='STOP_LOSS_HIT',
        title='ADBL Stop-Loss Hit',
        message='ADBL hit your stop-loss at Rs. 250.00.',
        ticker='ADBL',
        redirect_url='/portfolio?tab=holdings',
        metadata={'price': 250.0},
    )
    assert alert.notification_type == 'STOP_LOSS_HIT'
    assert alert.ticker == 'ADBL'
    assert alert.metadata == {'price': 250.0}


def test_ialertchecker_protocol_is_runtime_checkable():
    from stocks.services.notifications.base import IAlertChecker

    class FakeChecker:
        def check(self, user):
            return []

    assert isinstance(FakeChecker(), IAlertChecker)


def test_ialertchecker_protocol_rejects_missing_check():
    from stocks.services.notifications.base import IAlertChecker

    class BadChecker:
        pass

    assert not isinstance(BadChecker(), IAlertChecker)
```

- [ ] **Step 2: Run to verify failure**

```bash
cd backend && source venv/bin/activate
pytest stocks/tests/test_notification_checkers.py -v
```
Expected: `ImportError: cannot import name 'Alert' from 'stocks.services.notifications.base'`

- [ ] **Step 3: Create the package and base module**

```bash
mkdir -p backend/stocks/services/notifications/checkers
touch backend/stocks/services/notifications/__init__.py
touch backend/stocks/services/notifications/checkers/__init__.py
```

```python
# backend/stocks/services/notifications/base.py
from dataclasses import dataclass, field
from typing import Protocol, List, runtime_checkable


@dataclass
class Alert:
    notification_type: str
    title: str
    message: str
    redirect_url: str
    ticker: str | None = None
    portfolio_item_id: int | None = None
    watchlist_item_id: int | None = None
    metadata: dict = field(default_factory=dict)
    severity: str | None = None


@runtime_checkable
class IAlertChecker(Protocol):
    def check(self, user) -> List[Alert]:
        ...
```

- [ ] **Step 4: Run to verify green**

```bash
pytest stocks/tests/test_notification_checkers.py -v
```
Expected: 3 passed

- [ ] **Step 5: Commit**

```bash
git add backend/stocks/services/notifications/ backend/stocks/tests/test_notification_checkers.py
git commit -m "feat(notifications): add Alert dataclass and IAlertChecker Protocol"
```

---

## Task 2: PortfolioChecker adapter

**Files:**
- Create: `backend/stocks/services/notifications/checkers/portfolio.py`

- [ ] **Step 1: Write the failing test**

```python
# append to backend/stocks/tests/test_notification_checkers.py

def test_portfolio_checker_implements_ialertchecker():
    from stocks.services.notifications.base import IAlertChecker
    from stocks.services.notifications.checkers.portfolio import PortfolioChecker
    assert isinstance(PortfolioChecker(), IAlertChecker)


def test_portfolio_checker_returns_list():
    from stocks.services.notifications.checkers.portfolio import PortfolioChecker
    from unittest.mock import patch, MagicMock

    user = MagicMock()
    checker = PortfolioChecker()

    with patch('stocks.services.notifications.checkers.portfolio.PortfolioItem') as MockItem:
        MockItem.objects.filter.return_value = []
        result = checker.check(user)

    assert isinstance(result, list)


def test_portfolio_checker_stop_loss_produces_alert():
    from stocks.services.notifications.checkers.portfolio import PortfolioChecker
    from unittest.mock import patch, MagicMock

    item = MagicMock()
    item.ticker = 'ADBL'
    item.stop_loss_price = 240.0
    item.target_price = None
    item.target_price_2 = None
    item.target_price_3 = None
    item.wacc = 260.0
    item.buy_price = 260.0
    item.id = 1

    user = MagicMock()
    checker = PortfolioChecker()

    with patch('stocks.services.notifications.checkers.portfolio.PortfolioItem') as MockItem, \
         patch('stocks.services.notifications.checkers.portfolio.get_latest_price', return_value=235.0):
        MockItem.objects.filter.return_value = [item]
        alerts = checker.check(user)

    stop_loss_alerts = [a for a in alerts if a.notification_type == 'STOP_LOSS_HIT']
    assert len(stop_loss_alerts) == 1
    assert stop_loss_alerts[0].ticker == 'ADBL'
```

- [ ] **Step 2: Run to verify failure**

```bash
pytest stocks/tests/test_notification_checkers.py::test_portfolio_checker_implements_ialertchecker -v
```
Expected: `ImportError: cannot import name 'PortfolioChecker'`

- [ ] **Step 3: Extract PortfolioChecker from notification_service.py**

```python
# backend/stocks/services/notifications/checkers/portfolio.py
from typing import List
from ..base import Alert, IAlertChecker
from ...notification_service import get_latest_price, create_notification
from ....models import PortfolioItem, Notification


class PortfolioChecker:
    """Checks portfolio items for stop-loss, target, WACC, and gain/loss alerts."""

    def check(self, user) -> List[Alert]:
        hits = self._collect_hits(user)
        return self._build_alerts(hits)

    def _collect_hits(self, user) -> dict:
        hits = {t: [] for t in [
            Notification.NotificationType.STOP_LOSS_HIT,
            Notification.NotificationType.TARGET_REACHED,
            Notification.NotificationType.BELOW_WACC,
            Notification.NotificationType.SIGNIFICANT_GAIN,
            Notification.NotificationType.SIGNIFICANT_LOSS,
        ]}
        for item in PortfolioItem.objects.filter(user=user):
            price = get_latest_price(item.ticker)
            if not price:
                continue
            self._classify_item(item, price, hits)
        return hits

    def _classify_item(self, item, price: float, hits: dict) -> None:
        wacc = float(item.wacc) if item.wacc else float(item.buy_price)
        change_pct = ((price - wacc) / wacc * 100) if wacc > 0 else 0
        n = Notification.NotificationType

        if item.stop_loss_price and price <= float(item.stop_loss_price):
            hits[n.STOP_LOSS_HIT].append(item)
        if self._any_target_hit(item, price):
            hits[n.TARGET_REACHED].append(item)
        if price < wacc:
            hits[n.BELOW_WACC].append(item)
        if change_pct >= 10.0:
            hits[n.SIGNIFICANT_GAIN].append(item)
        elif change_pct <= -10.0:
            hits[n.SIGNIFICANT_LOSS].append(item)

    def _any_target_hit(self, item, price: float) -> bool:
        return any(
            tp and price >= float(tp)
            for tp in (item.target_price, item.target_price_2, item.target_price_3)
        )

    def _build_alerts(self, hits: dict) -> List[Alert]:
        alerts = []
        for n_type, items in hits.items():
            if not items:
                continue
            alert = self._single_alert(n_type, items[0]) if len(items) == 1 \
                else self._aggregate_alert(n_type, items)
            if alert:
                alerts.append(alert)
        return alerts

    def _single_alert(self, n_type, item) -> Alert | None:
        price = get_latest_price(item.ticker)
        if not price:
            return None
        wacc = float(item.wacc) if item.wacc else float(item.buy_price)
        change_pct = ((price - wacc) / wacc * 100) if wacc > 0 else 0
        title, message = self._label_for_type(n_type, item.ticker, price, wacc)
        return Alert(
            notification_type=n_type,
            title=title,
            message=message,
            ticker=item.ticker,
            redirect_url='/portfolio?tab=holdings',
            portfolio_item_id=item.id,
            metadata={'price': price, 'wacc': wacc, 'change_pct': change_pct},
        )

    def _aggregate_alert(self, n_type, items) -> Alert:
        symbols = [i.ticker for i in items]
        label = n_type.lower().replace('_', ' ').title()
        return Alert(
            notification_type=n_type,
            title=f"{len(items)} Assets: {label}",
            message=(f"{len(items)} assets ({', '.join(symbols[:2])}"
                     f"{'...' if len(symbols) > 2 else ''}) triggered {label}."),
            ticker='SUMMARY',
            redirect_url='/portfolio?tab=holdings',
            metadata={'symbols': symbols, 'count': len(items)},
        )

    def _label_for_type(self, n_type, ticker: str, price: float, wacc: float):
        n = Notification.NotificationType
        labels = {
            n.STOP_LOSS_HIT: (f"{ticker} Stop-Loss Hit",
                              f"{ticker} hit your stop-loss at Rs. {price:.2f}."),
            n.TARGET_REACHED: (f"{ticker} Target Reached",
                               f"{ticker} reached your profit target at Rs. {price:.2f}."),
            n.BELOW_WACC: (f"{ticker} Below Cost",
                           f"{ticker} dropped below your average cost of Rs. {wacc:.2f}."),
            n.SIGNIFICANT_GAIN: (f"{ticker} Up 10%+",
                                 f"{ticker} gained over 10% from your cost price."),
            n.SIGNIFICANT_LOSS: (f"{ticker} Down 10%+",
                                 f"{ticker} dropped over 10% from your cost price."),
        }
        return labels.get(n_type, (ticker, ''))
```

- [ ] **Step 4: Run tests**

```bash
pytest stocks/tests/test_notification_checkers.py -v
```
Expected: 6 passed

- [ ] **Step 5: Commit**

```bash
git add backend/stocks/services/notifications/checkers/portfolio.py \
        backend/stocks/tests/test_notification_checkers.py
git commit -m "feat(notifications): extract PortfolioChecker adapter"
```

---

## Task 3: WatchlistChecker adapter

**Files:**
- Create: `backend/stocks/services/notifications/checkers/watchlist.py`

- [ ] **Step 1: Write the failing test**

```python
# append to backend/stocks/tests/test_notification_checkers.py

def test_watchlist_checker_implements_ialertchecker():
    from stocks.services.notifications.base import IAlertChecker
    from stocks.services.notifications.checkers.watchlist import WatchlistChecker
    assert isinstance(WatchlistChecker(), IAlertChecker)


def test_watchlist_checker_target_hit_produces_alert():
    from stocks.services.notifications.checkers.watchlist import WatchlistChecker
    from unittest.mock import patch, MagicMock

    item = MagicMock()
    item.ticker = 'NABIL'
    item.target_price = 1000.0
    item.stop_loss_price = None
    item.id = 5

    user = MagicMock()
    checker = WatchlistChecker()

    with patch('stocks.services.notifications.checkers.watchlist.WatchlistItem') as MockWL, \
         patch('stocks.services.notifications.checkers.watchlist.get_latest_price', return_value=1050.0):
        MockWL.objects.filter.return_value = [item]
        alerts = checker.check(user)

    target_alerts = [a for a in alerts if a.notification_type == 'TARGET_REACHED']
    assert len(target_alerts) == 1
    assert target_alerts[0].ticker == 'NABIL'
```

- [ ] **Step 2: Run to verify failure**

```bash
pytest stocks/tests/test_notification_checkers.py::test_watchlist_checker_implements_ialertchecker -v
```
Expected: `ImportError`

- [ ] **Step 3: Create WatchlistChecker**

```python
# backend/stocks/services/notifications/checkers/watchlist.py
from typing import List
from ..base import Alert, IAlertChecker
from ...notification_service import get_latest_price
from ....models import WatchlistItem, Notification


class WatchlistChecker:
    """Checks watchlist items with alert_enabled=True for target and stop-loss hits."""

    def check(self, user) -> List[Alert]:
        hits = self._collect_hits(user)
        return self._build_alerts(hits)

    def _collect_hits(self, user) -> dict:
        n = Notification.NotificationType
        hits = {n.TARGET_REACHED: [], n.STOP_LOSS_HIT: []}
        for item in WatchlistItem.objects.filter(user=user, alert_enabled=True):
            price = get_latest_price(item.ticker)
            if not price:
                continue
            if item.target_price and price >= float(item.target_price):
                hits[n.TARGET_REACHED].append(item)
            if item.stop_loss_price and price <= float(item.stop_loss_price):
                hits[n.STOP_LOSS_HIT].append(item)
        return hits

    def _build_alerts(self, hits: dict) -> List[Alert]:
        alerts = []
        for n_type, items in hits.items():
            if not items:
                continue
            alert = self._single_alert(n_type, items[0]) if len(items) == 1 \
                else self._aggregate_alert(n_type, items)
            if alert:
                alerts.append(alert)
        return alerts

    def _single_alert(self, n_type, item) -> Alert | None:
        price = get_latest_price(item.ticker)
        if not price:
            return None
        n = Notification.NotificationType
        title = f"{item.ticker} Target Reached" if n_type == n.TARGET_REACHED \
            else f"{item.ticker} Below Stop Price"
        return Alert(
            notification_type=n_type,
            title=title,
            message=f"{item.ticker} is at Rs. {price:.2f}, hitting your watchlist alert.",
            ticker=item.ticker,
            redirect_url=f'/ticker/{item.ticker}',
            watchlist_item_id=item.id,
            metadata={'price': price, 'symbol': item.ticker},
        )

    def _aggregate_alert(self, n_type, items) -> Alert:
        symbols = [i.ticker for i in items]
        n = Notification.NotificationType
        label = "Targets Reached" if n_type == n.TARGET_REACHED else "Stop Prices Hit"
        return Alert(
            notification_type=n_type,
            title=f"{len(items)} Watchlist: {label}",
            message=(f"{len(items)} watchlist items ({', '.join(symbols[:2])}"
                     f"{'...' if len(symbols) > 2 else ''}) hit their alert levels."),
            ticker='SUMMARY',
            redirect_url='/watchlist',
            metadata={'symbols': symbols, 'count': len(items)},
        )
```

- [ ] **Step 4: Run tests**

```bash
pytest stocks/tests/test_notification_checkers.py -v
```
Expected: all pass

- [ ] **Step 5: Commit**

```bash
git add backend/stocks/services/notifications/checkers/watchlist.py \
        backend/stocks/tests/test_notification_checkers.py
git commit -m "feat(notifications): extract WatchlistChecker adapter"
```

---

## Task 4: Remaining checkers (zone_entry, active_signal, signals, whale_watch, accumulation_trend, technical, broker_discovery, portfolio_management)

**Files:**
- Create: `backend/stocks/services/notifications/checkers/zone_entry.py`
- Create: `backend/stocks/services/notifications/checkers/active_signal.py`
- Create: `backend/stocks/services/notifications/checkers/signals.py`
- Create: `backend/stocks/services/notifications/checkers/whale_watch.py`
- Create: `backend/stocks/services/notifications/checkers/accumulation_trend.py`
- Create: `backend/stocks/services/notifications/checkers/technical.py`
- Create: `backend/stocks/services/notifications/checkers/broker_discovery.py`
- Create: `backend/stocks/services/notifications/checkers/portfolio_management.py`

For each checker, follow the same pattern as Tasks 2–3:
1. Class named after checker type (e.g. `ZoneEntryChecker`)
2. Single `check(self, user) -> List[Alert]` public method
3. Private helper methods, each ≤30 lines
4. Body extracted verbatim from the corresponding `check_*` function in `notification_service.py`
5. Returns `List[Alert]` (not an integer count — the orchestrator will call `create_notification`)

- [ ] **Step 1: Write tests for all 8 remaining checkers**

```python
# append to backend/stocks/tests/test_notification_checkers.py
import pytest

@pytest.mark.parametrize("checker_path,cls_name", [
    ("stocks.services.notifications.checkers.zone_entry", "ZoneEntryChecker"),
    ("stocks.services.notifications.checkers.active_signal", "ActiveSignalChecker"),
    ("stocks.services.notifications.checkers.signals", "SignalsChecker"),
    ("stocks.services.notifications.checkers.whale_watch", "WhaleWatchChecker"),
    ("stocks.services.notifications.checkers.accumulation_trend", "AccumulationTrendChecker"),
    ("stocks.services.notifications.checkers.technical", "TechnicalChecker"),
    ("stocks.services.notifications.checkers.broker_discovery", "BrokerDiscoveryChecker"),
    ("stocks.services.notifications.checkers.portfolio_management", "PortfolioManagementChecker"),
])
def test_checker_implements_protocol(checker_path, cls_name):
    import importlib
    from stocks.services.notifications.base import IAlertChecker
    mod = importlib.import_module(checker_path)
    cls = getattr(mod, cls_name)
    assert isinstance(cls(), IAlertChecker)
```

- [ ] **Step 2: Run to verify failure**

```bash
pytest stocks/tests/test_notification_checkers.py::test_checker_implements_protocol -v
```
Expected: 8 FAILED with ImportError

- [ ] **Step 3: Create each checker file**

For each of the 8 checkers, create the file and move the body of the corresponding `check_*` function from `notification_service.py` into a `check(self, user) -> List[Alert]` method, breaking the body into private helpers so no method exceeds 30 lines. Return `List[Alert]` objects instead of calling `create_notification` directly.

Pattern for each file (example: `zone_entry.py`):

```python
# backend/stocks/services/notifications/checkers/zone_entry.py
from typing import List
from ..base import Alert, IAlertChecker
from ...notification_service import get_latest_price
from ....models import DailyTradingPlan, Notification, WatchlistItem


class ZoneEntryChecker:
    """Notifies when an alert-enabled watchlist symbol is IN_ZONE per the latest plan."""

    def check(self, user) -> List[Alert]:
        plan, statuses = self._load_plan()
        if not statuses:
            return []
        return self._build_alerts(user, plan, statuses)

    def _load_plan(self):
        plan = DailyTradingPlan.objects.order_by('-date').first()
        statuses = (plan.payload.get('entry_statuses') or {}) if plan else {}
        return plan, statuses

    def _build_alerts(self, user, plan, statuses: dict) -> List[Alert]:
        alerts = []
        items = WatchlistItem.objects.filter(user=user, alert_enabled=True)
        for item in items:
            if statuses.get(item.ticker) != 'IN_ZONE':
                continue
            alerts.append(Alert(
                notification_type=Notification.NotificationType.WATCHLIST_ENTRY,
                title=f"{item.ticker} is in its entry zone",
                message=(f"{item.ticker} closed inside its entry zone "
                         f"per the latest plan ({plan.payload.get('as_of')})."),
                ticker=item.ticker,
                redirect_url=f'/ticker/{item.ticker}',
                watchlist_item_id=item.id,
                metadata={
                    'price': get_latest_price(item.ticker),
                    'symbol': item.ticker,
                    'plan_date': plan.payload.get('as_of'),
                },
            ))
        return alerts
```

Apply identical structure to the remaining 7 checkers, extracting the body of each `check_*` function from `notification_service.py`.

- [ ] **Step 4: Run tests**

```bash
pytest stocks/tests/test_notification_checkers.py -v
```
Expected: all tests pass

- [ ] **Step 5: Commit**

```bash
git add backend/stocks/services/notifications/checkers/
git commit -m "feat(notifications): extract remaining 8 alert checker adapters"
```

---

## Task 5: NotificationOrchestrator and tasks.py update

**Files:**
- Create: `backend/stocks/services/notifications/orchestrator.py`
- Modify: `backend/stocks/services/notifications/__init__.py`
- Modify: `backend/stocks/services/notification_service.py`
- Modify: `backend/stocks/tasks.py`

- [ ] **Step 1: Write the failing test**

```python
# append to backend/stocks/tests/test_notification_checkers.py

def test_orchestrator_calls_all_registered_checkers():
    from stocks.services.notifications.orchestrator import NotificationOrchestrator
    from stocks.services.notifications.base import Alert, IAlertChecker
    from unittest.mock import MagicMock

    calls = []

    class CountingChecker:
        def check(self, user) -> list:
            calls.append(user)
            return [Alert(
                notification_type='TEST',
                title='T', message='M',
                redirect_url='/', ticker='X',
            )]

    user = MagicMock()
    orchestrator = NotificationOrchestrator(checkers=[CountingChecker(), CountingChecker()])
    count = orchestrator.run(user)

    assert len(calls) == 2
    assert count == 2


def test_orchestrator_tolerates_checker_exception():
    from stocks.services.notifications.orchestrator import NotificationOrchestrator
    from unittest.mock import MagicMock

    class BrokenChecker:
        def check(self, user):
            raise RuntimeError("db gone")

    user = MagicMock()
    orchestrator = NotificationOrchestrator(checkers=[BrokenChecker()])
    count = orchestrator.run(user)  # must not raise
    assert count == 0
```

- [ ] **Step 2: Run to verify failure**

```bash
pytest stocks/tests/test_notification_checkers.py::test_orchestrator_calls_all_registered_checkers -v
```
Expected: `ImportError`

- [ ] **Step 3: Create orchestrator**

```python
# backend/stocks/services/notifications/orchestrator.py
import logging
from typing import List
from .base import Alert, IAlertChecker
from ..notification_service import create_notification

logger = logging.getLogger(__name__)


class NotificationOrchestrator:
    """Iterates registered checkers and persists any Alerts they produce."""

    def __init__(self, checkers: List[IAlertChecker]):
        self._checkers = checkers

    def run(self, user) -> int:
        total = 0
        for checker in self._checkers:
            total += self._run_one(checker, user)
        return total

    def _run_one(self, checker: IAlertChecker, user) -> int:
        try:
            alerts = checker.check(user)
            return sum(1 for a in alerts if self._persist(a, user))
        except Exception as exc:
            logger.error(f"{checker.__class__.__name__} failed for {user}: {exc}")
            return 0

    def _persist(self, alert: Alert, user) -> bool:
        result = create_notification(
            user=user,
            notification_type=alert.notification_type,
            title=alert.title,
            message=alert.message,
            ticker=alert.ticker,
            redirect_url=alert.redirect_url,
            portfolio_item_id=alert.portfolio_item_id,
            watchlist_item_id=alert.watchlist_item_id,
            metadata=alert.metadata,
            severity=alert.severity,
        )
        return result is not None
```

- [ ] **Step 4: Wire the default registry in `__init__.py`**

```python
# backend/stocks/services/notifications/__init__.py
from .checkers.portfolio import PortfolioChecker
from .checkers.watchlist import WatchlistChecker
from .checkers.zone_entry import ZoneEntryChecker
from .checkers.active_signal import ActiveSignalChecker
from .checkers.signals import SignalsChecker
from .checkers.whale_watch import WhaleWatchChecker
from .checkers.accumulation_trend import AccumulationTrendChecker
from .checkers.technical import TechnicalChecker
from .checkers.broker_discovery import BrokerDiscoveryChecker
from .checkers.portfolio_management import PortfolioManagementChecker
from .orchestrator import NotificationOrchestrator

DEFAULT_CHECKERS = [
    PortfolioChecker(),
    WatchlistChecker(),
    ZoneEntryChecker(),
    ActiveSignalChecker(),
    SignalsChecker(),
    WhaleWatchChecker(),
    AccumulationTrendChecker(),
    TechnicalChecker(),
    BrokerDiscoveryChecker(),
    PortfolioManagementChecker(),
]

default_orchestrator = NotificationOrchestrator(checkers=DEFAULT_CHECKERS)
```

- [ ] **Step 5: Update notification_service.py to re-export for backward compat**

At the bottom of `backend/stocks/services/notification_service.py`, add:

```python
# ---------------------------------------------------------------------------
# Backward-compat shims — callers should migrate to NotificationOrchestrator
# ---------------------------------------------------------------------------
from .notifications import default_orchestrator as _orchestrator


def check_all_users():
    """Legacy entry-point. Prefer NotificationOrchestrator.run(user) per user."""
    from django.contrib.auth.models import User
    total = 0
    for user in User.objects.filter(is_active=True):
        total += _orchestrator.run(user)
    return total
```

- [ ] **Step 6: Update tasks.py to use the orchestrator directly**

Replace the existing `check_all_user_notifications` task body in `backend/stocks/tasks.py`:

```python
@shared_task(bind=True, name='stocks.check_notifications')
def check_all_user_notifications(self):
    from stocks.services.notifications import default_orchestrator
    from django.contrib.auth.models import User

    total = 0
    for user in User.objects.filter(is_active=True):
        try:
            total += default_orchestrator.run(user)
        except Exception as exc:
            self.retry(exc=exc, countdown=60, max_retries=2)
    return total
```

- [ ] **Step 7: Run full notification test suite**

```bash
pytest stocks/tests/test_notification_checkers.py -v
```
Expected: all tests pass

- [ ] **Step 8: Commit**

```bash
git add backend/stocks/services/notifications/ \
        backend/stocks/services/notification_service.py \
        backend/stocks/tasks.py \
        backend/stocks/tests/test_notification_checkers.py
git commit -m "feat(notifications): wire NotificationOrchestrator; update tasks.py"
```

---

## Task 6: ISignalGenerator Protocol and SignalOrchestrator

**Files:**
- Create: `backend/stocks/services/signals/base.py`
- Create: `backend/stocks/services/signals/orchestrator.py`
- Create: `backend/stocks/tests/test_signal_generators.py`

- [ ] **Step 1: Write the failing test**

```python
# backend/stocks/tests/test_signal_generators.py
import pytest


def test_isignal_generator_protocol_is_runtime_checkable():
    from stocks.services.signals.base import ISignalGenerator

    class FakeGenerator:
        source_key = 'FAKE'
        def generate(self):
            return []

    assert isinstance(FakeGenerator(), ISignalGenerator)


def test_isignal_generator_rejects_missing_generate():
    from stocks.services.signals.base import ISignalGenerator

    class Bad:
        source_key = 'X'

    assert not isinstance(Bad(), ISignalGenerator)


def test_orchestrator_calls_all_generators_and_returns_total():
    from stocks.services.signals.orchestrator import SignalOrchestrator

    class FakeGen:
        source_key = 'FAKE'
        def generate(self):
            return [{'symbol': 'X', 'signal': 'BUY'}]

    orch = SignalOrchestrator(generators=[FakeGen(), FakeGen()])

    with __import__('unittest.mock', fromlist=['patch']).patch(
        'stocks.services.signals.orchestrator.SignalOrchestrator._persist',
        return_value=1
    ):
        total = orch.generate_all()

    assert total == 2


def test_orchestrator_tolerates_generator_exception():
    from stocks.services.signals.orchestrator import SignalOrchestrator

    class BrokenGen:
        source_key = 'BROKEN'
        def generate(self):
            raise RuntimeError("sql gone")

    orch = SignalOrchestrator(generators=[BrokenGen()])
    total = orch.generate_all()
    assert total == 0
```

- [ ] **Step 2: Run to verify failure**

```bash
pytest stocks/tests/test_signal_generators.py -v
```
Expected: `ImportError`

- [ ] **Step 3: Create base.py and orchestrator.py**

```bash
mkdir -p backend/stocks/services/signals/generators
touch backend/stocks/services/signals/__init__.py
touch backend/stocks/services/signals/generators/__init__.py
```

```python
# backend/stocks/services/signals/base.py
from typing import Protocol, List, runtime_checkable


@runtime_checkable
class ISignalGenerator(Protocol):
    source_key: str

    def generate(self) -> List[dict]:
        ...
```

```python
# backend/stocks/services/signals/orchestrator.py
import logging
from typing import List
from .base import ISignalGenerator
from ..signal_generation_service import SignalGenerationService

logger = logging.getLogger(__name__)


class SignalOrchestrator:
    """Iterates registered generators and persists all signals."""

    def __init__(self, generators: List[ISignalGenerator]):
        self._generators = generators

    def generate_all(self, progress_callback=None) -> int:
        total = 0
        for i, gen in enumerate(self._generators):
            if progress_callback:
                progress_callback(i + 1, len(self._generators), gen.source_key)
            total += self._run_one(gen)
        return total

    def _run_one(self, gen: ISignalGenerator) -> int:
        try:
            signals = gen.generate()
            return self._persist(gen.source_key, signals)
        except Exception as exc:
            logger.error(f"[{gen.source_key}] generation failed: {exc}")
            return 0

    def _persist(self, source_key: str, signals: list) -> int:
        return SignalGenerationService._persist_signals(source_key, signals)
```

- [ ] **Step 4: Run tests**

```bash
pytest stocks/tests/test_signal_generators.py -v
```
Expected: all pass

- [ ] **Step 5: Commit**

```bash
git add backend/stocks/services/signals/ backend/stocks/tests/test_signal_generators.py
git commit -m "feat(signals): add ISignalGenerator Protocol and SignalOrchestrator"
```

---

## Task 7: Extract each signal generator into its own adapter

**Files:**
- Create: `backend/stocks/services/signals/generators/smart_money.py` (and 9 others)

- [ ] **Step 1: Write the protocol-compliance test**

```python
# append to backend/stocks/tests/test_signal_generators.py
import pytest

@pytest.mark.parametrize("mod_path,cls_name", [
    ("stocks.services.signals.generators.smart_money", "SmartMoneyGenerator"),
    ("stocks.services.signals.generators.broker_accumulation", "BrokerAccumulationGenerator"),
    ("stocks.services.signals.generators.smart_crossover", "SmartCrossoverGenerator"),
    ("stocks.services.signals.generators.ichimoku", "IchimokuGenerator"),
    ("stocks.services.signals.generators.distribution_alert", "DistributionAlertGenerator"),
    ("stocks.services.signals.generators.below_cost_reversal", "BelowCostReversalGenerator"),
    ("stocks.services.signals.generators.volume_breakout", "VolumeBreakoutGenerator"),
    ("stocks.services.signals.generators.concentration_shift", "ConcentrationShiftGenerator"),
    ("stocks.services.signals.generators.accumulation_momentum", "AccumulationMomentumGenerator"),
    ("stocks.services.signals.generators.institutional_alerts", "InstitutionalAlertsGenerator"),
])
def test_generator_implements_protocol(mod_path, cls_name):
    import importlib
    from stocks.services.signals.base import ISignalGenerator
    mod = importlib.import_module(mod_path)
    cls = getattr(mod, cls_name)
    assert isinstance(cls(), ISignalGenerator)
```

- [ ] **Step 2: Run to verify failure**

```bash
pytest stocks/tests/test_signal_generators.py::test_generator_implements_protocol -v
```
Expected: 10 FAILED with ImportError

- [ ] **Step 3: Create each generator adapter**

For each generator, create one file. Move the body of the corresponding `_generate_*` static method from `SignalGenerationService` into a `generate(self) -> List[dict]` method. Break the body into private helpers so no method exceeds 30 lines.

Pattern (example: `smart_money.py`):

```python
# backend/stocks/services/signals/generators/smart_money.py
from typing import List
from ..base import ISignalGenerator
from django.db import connections
import logging
from datetime import date

logger = logging.getLogger(__name__)


class SmartMoneyGenerator:
    source_key = 'SMART_MONEY'

    def generate(self) -> List[dict]:
        signals = []
        try:
            rows = self._fetch_rows()
            for row in rows:
                sig = self._build_signal(row)
                if sig:
                    signals.append(sig)
        except Exception as e:
            logger.error(f"Smart Money signal generation error: {e}")
        return signals

    def _fetch_rows(self) -> list:
        # Move the SQL query from SignalGenerationService._generate_smart_money_signals
        # into this method. Return raw cursor.fetchall() rows as dicts.
        query = self._sql()
        with connections['default'].cursor() as cursor:
            cursor.execute(query)
            cols = [c.description[0] for c in cursor.description]
            return [dict(zip(cols, row)) for row in cursor.fetchall()]

    def _sql(self) -> str:
        # Return the SQL string verbatim from the original static method.
        # (paste the multi-line WITH ... SELECT ... query here)
        raise NotImplementedError("paste SQL from SignalGenerationService._generate_smart_money_signals")

    def _build_signal(self, row: dict) -> dict | None:
        # Move the signal-building loop body from the original method here.
        raise NotImplementedError("paste signal-building logic from original method")
```

Repeat this pattern for all 10 generators. The `InstitutionalAlertsGenerator` is special — it returns a dict keyed by sub-source. Keep that behaviour in its `generate()` but update the orchestrator's `_run_one` to handle it:

```python
# in orchestrator.py _run_one, detect multi-source generators:
def _run_one(self, gen: ISignalGenerator) -> int:
    try:
        result = gen.generate()
        if isinstance(result, dict):
            return sum(self._persist(k, v) for k, v in result.items())
        return self._persist(gen.source_key, result)
    except Exception as exc:
        logger.error(f"[{gen.source_key}] generation failed: {exc}")
        return 0
```

- [ ] **Step 4: Wire the default registry**

```python
# backend/stocks/services/signals/__init__.py
from .generators.smart_money import SmartMoneyGenerator
from .generators.broker_accumulation import BrokerAccumulationGenerator
from .generators.smart_crossover import SmartCrossoverGenerator
from .generators.ichimoku import IchimokuGenerator
from .generators.distribution_alert import DistributionAlertGenerator
from .generators.below_cost_reversal import BelowCostReversalGenerator
from .generators.volume_breakout import VolumeBreakoutGenerator
from .generators.concentration_shift import ConcentrationShiftGenerator
from .generators.accumulation_momentum import AccumulationMomentumGenerator
from .generators.institutional_alerts import InstitutionalAlertsGenerator
from .orchestrator import SignalOrchestrator

DEFAULT_GENERATORS = [
    SmartMoneyGenerator(),
    BrokerAccumulationGenerator(),
    SmartCrossoverGenerator(),
    IchimokuGenerator(),
    DistributionAlertGenerator(),
    BelowCostReversalGenerator(),
    VolumeBreakoutGenerator(),
    ConcentrationShiftGenerator(),
    AccumulationMomentumGenerator(),
    InstitutionalAlertsGenerator(),
]

default_orchestrator = SignalOrchestrator(generators=DEFAULT_GENERATORS)
```

- [ ] **Step 5: Update signal_generation_service.py shim**

Add to the bottom of `backend/stocks/services/signal_generation_service.py`:

```python
# Backward-compat shim — new code should use signals.default_orchestrator
def generate_all_signals(progress_callback=None):
    from .signals import default_orchestrator
    return default_orchestrator.generate_all(progress_callback=progress_callback)
```

- [ ] **Step 6: Run all signal tests**

```bash
pytest stocks/tests/test_signal_generators.py -v
```
Expected: all pass

- [ ] **Step 7: Commit**

```bash
git add backend/stocks/services/signals/ \
        backend/stocks/services/signal_generation_service.py \
        backend/stocks/tests/test_signal_generators.py
git commit -m "feat(signals): extract 10 generator adapters; wire default registry"
```

---

## Task 8: Extract MarketSummaryService from stock_summary view

**Files:**
- Create: `backend/stocks/services/market_summary_service.py`
- Modify: `backend/stocks/views/market.py`
- Create: `backend/stocks/tests/test_market_summary_service.py`

- [ ] **Step 1: Write the failing tests**

```python
# backend/stocks/tests/test_market_summary_service.py
import pytest
from unittest.mock import patch, MagicMock
import datetime


def test_fetch_latest_date_returns_none_when_no_data():
    from stocks.services.market_summary_service import fetch_latest_date

    with patch('stocks.services.market_summary_service.DailyStockPrice') as MockPrice:
        MockPrice.objects.values.return_value.annotate.return_value \
            .filter.return_value.order_by.return_value.first.return_value = None
        result = fetch_latest_date()

    assert result is None


def test_fetch_latest_date_returns_date_when_data_present():
    from stocks.services.market_summary_service import fetch_latest_date

    expected = datetime.date(2026, 6, 13)
    mock_qs_result = {'date': expected}

    with patch('stocks.services.market_summary_service.DailyStockPrice') as MockPrice:
        MockPrice.objects.values.return_value.annotate.return_value \
            .filter.return_value.order_by.return_value.first.return_value = mock_qs_result
        result = fetch_latest_date()

    assert result == expected


def test_resolve_ref_date_returns_none_for_daily():
    from stocks.services.market_summary_service import resolve_ref_date
    result = resolve_ref_date('daily', datetime.date(2026, 6, 13))
    assert result is None


def test_aggregate_sectors_groups_by_sector():
    from stocks.services.market_summary_service import aggregate_sectors

    prices = [
        MagicMock(ticker='ADBL', close=250, volume=10000, turnover=2500000,
                  high=255, low=248),
        MagicMock(ticker='NABIL', close=1000, volume=5000, turnover=5000000,
                  high=1010, low=990),
    ]
    sector_map = {'ADBL': 'Commercial Banks', 'NABIL': 'Commercial Banks'}

    result = aggregate_sectors(prices, sector_map)

    assert 'Commercial Banks' in result
    assert result['Commercial Banks']['count'] == 2
```

- [ ] **Step 2: Run to verify failure**

```bash
pytest stocks/tests/test_market_summary_service.py -v
```
Expected: `ImportError`

- [ ] **Step 3: Create MarketSummaryService module**

```python
# backend/stocks/services/market_summary_service.py
import datetime
from typing import Optional
from django.db.models import Count, Sum, Max, Min
from ..models import DailyStockPrice, Company


def fetch_latest_date() -> Optional[datetime.date]:
    """Return the most recent date that has >10 price entries."""
    row = (
        DailyStockPrice.objects
        .values('date')
        .annotate(count=Count('ticker'))
        .filter(count__gt=10)
        .order_by('-date')
        .first()
    )
    return row['date'] if row else None


def fetch_previous_date(latest: datetime.date) -> Optional[datetime.date]:
    """Return the trading day immediately before latest."""
    row = (
        DailyStockPrice.objects
        .filter(date__lt=latest)
        .values('date')
        .annotate(count=Count('ticker'))
        .filter(count__gt=10)
        .order_by('-date')
        .first()
    )
    return row['date'] if row else None


def resolve_ref_date(range_type: str, latest: datetime.date) -> Optional[datetime.date]:
    """Return the reference date for weekly/monthly ranges, or None for daily."""
    if range_type == 'daily':
        return None
    offsets = {'weekly': 7, 'monthly': 30}
    delta = offsets.get(range_type)
    if not delta:
        return None
    target = latest - datetime.timedelta(days=delta)
    row = (
        DailyStockPrice.objects
        .filter(date__lte=target)
        .values('date')
        .annotate(count=Count('ticker'))
        .filter(count__gt=10)
        .order_by('-date')
        .first()
    )
    return row['date'] if row else None


def build_sector_map() -> dict:
    """Return {symbol: sector} for all companies."""
    return {c.symbol: c.sector for c in Company.objects.all()}


def fetch_ref_aggregates(ref_date: datetime.date, latest: datetime.date) -> dict:
    """Return per-ticker volume/turnover/high/low aggregates between ref and latest."""
    aggs = (
        DailyStockPrice.objects
        .filter(date__gt=ref_date, date__lte=latest)
        .values('ticker')
        .annotate(
            total_vol=Sum('volume'),
            total_turn=Sum('turnover'),
            max_high=Max('high'),
            min_low=Min('low'),
        )
    )
    return {a['ticker']: a for a in aggs}


def aggregate_sectors(prices, sector_map: dict) -> dict:
    """Group prices by sector and compute aggregate stats."""
    sectors: dict = {}
    for p in prices:
        sector = sector_map.get(p.ticker, 'Unknown')
        if sector not in sectors:
            sectors[sector] = {'count': 0, 'volume': 0, 'turnover': 0}
        sectors[sector]['count'] += 1
        sectors[sector]['volume'] += int(p.volume or 0)
        sectors[sector]['turnover'] += float(p.turnover or 0)
    return sectors


def build_market_status(latest: datetime.date) -> dict:
    """Return lightweight market status dict."""
    is_today = latest == datetime.date.today()
    return {
        'date': latest,
        'status': 'OPEN' if is_today else 'CLOSED',
        'is_active': is_today,
    }
```

- [ ] **Step 4: Run tests**

```bash
pytest stocks/tests/test_market_summary_service.py -v
```
Expected: all pass

- [ ] **Step 5: Refactor stock_summary view to delegate**

In `backend/stocks/views/market.py`, replace the body of `stock_summary` so the function body is ≤30 lines:

```python
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def stock_summary(request):
    from ..services.market_summary_service import (
        fetch_latest_date, fetch_previous_date, resolve_ref_date,
        build_sector_map, fetch_ref_aggregates, aggregate_sectors,
        build_market_status,
    )
    latest = fetch_latest_date()
    if not latest:
        return Response({})

    if request.GET.get('mode') == 'status':
        return Response(build_market_status(latest))

    range_type = request.GET.get('range', 'daily')
    ref_date = resolve_ref_date(range_type, latest)
    prev_date = fetch_previous_date(latest)
    is_daily = ref_date is None

    latest_prices = DailyStockPrice.objects.filter(date=latest)
    sector_map = build_sector_map()
    ref_prices_map = {}
    aggregates_map = {}

    if not is_daily:
        ref_prices_map = {p.ticker: p.close for p in DailyStockPrice.objects.filter(date=ref_date)}
        aggregates_map = fetch_ref_aggregates(ref_date, latest)

    sectors = aggregate_sectors(latest_prices, sector_map)
    # (remainder of serialisation logic follows — each block stays ≤30 lines)
    return _build_response(latest_prices, sectors, ref_prices_map, aggregates_map, is_daily, prev_date)
```

Split any remaining serialisation logic in `stock_summary` into private helper functions (`_build_response`, `_format_ticker`, etc.), each ≤30 lines.

- [ ] **Step 6: Run existing market tests**

```bash
pytest stocks/tests/ -k "market" -v
```
Expected: all pass (or no test file exists yet — that is acceptable at this step)

- [ ] **Step 7: Commit**

```bash
git add backend/stocks/services/market_summary_service.py \
        backend/stocks/views/market.py \
        backend/stocks/tests/test_market_summary_service.py
git commit -m "feat(market): extract MarketSummaryService; slim stock_summary view"
```

---

## Task 9: Replace 18 seed commands with a single parameterised loader

**Files:**
- Create: `backend/stocks/services/financial_data_loader.py`
- Create: `backend/stocks/management/commands/seed_financials.py`
- Create: `backend/stocks/tests/test_financial_data_loader.py`
- Delete: `backend/stocks/management/commands/seed_*_financials.py` (18 files)

- [ ] **Step 1: Write the failing tests**

```python
# backend/stocks/tests/test_financial_data_loader.py
import pytest
import json
from unittest.mock import patch, MagicMock


def test_loader_raises_on_missing_fixture(tmp_path):
    from stocks.services.financial_data_loader import FinancialDataLoader
    loader = FinancialDataLoader(fixtures_dir=str(tmp_path))
    with pytest.raises(FileNotFoundError):
        loader.load('ADBL')


def test_loader_creates_company_if_missing(tmp_path):
    fixture = {
        'ticker': 'TEST',
        'company': {
            'name': 'Test Corp',
            'sector': 'Banking',
            'instrument_type': 'Equity',
        },
        'reports': [],
    }
    (tmp_path / 'TEST.json').write_text(json.dumps(fixture))

    from stocks.services.financial_data_loader import FinancialDataLoader

    with patch('stocks.services.financial_data_loader.Company') as MockCompany, \
         patch('stocks.services.financial_data_loader.FinancialReport') as MockReport, \
         patch('stocks.services.financial_data_loader.sync_dividends_from_financials'):
        MockCompany.objects.get_or_create.return_value = (MagicMock(), True)
        loader = FinancialDataLoader(fixtures_dir=str(tmp_path))
        loader.load('TEST')

    MockCompany.objects.get_or_create.assert_called_once_with(
        symbol='TEST',
        defaults={'name': 'Test Corp', 'sector': 'Banking', 'instrument_type': 'Equity'},
    )


def test_loader_skips_empty_reports(tmp_path):
    fixture = {
        'ticker': 'TEST',
        'company': {'name': 'Test Corp', 'sector': 'Banking', 'instrument_type': 'Equity'},
        'reports': [],
    }
    (tmp_path / 'TEST.json').write_text(json.dumps(fixture))

    from stocks.services.financial_data_loader import FinancialDataLoader

    with patch('stocks.services.financial_data_loader.Company') as MockCompany, \
         patch('stocks.services.financial_data_loader.FinancialReport') as MockReport, \
         patch('stocks.services.financial_data_loader.sync_dividends_from_financials'):
        MockCompany.objects.get_or_create.return_value = (MagicMock(), False)
        loader = FinancialDataLoader(fixtures_dir=str(tmp_path))
        result = loader.load('TEST')

    assert result == 0
    MockReport.objects.update_or_create.assert_not_called()
```

- [ ] **Step 2: Run to verify failure**

```bash
pytest stocks/tests/test_financial_data_loader.py -v
```
Expected: `ImportError`

- [ ] **Step 3: Create FinancialDataLoader**

```python
# backend/stocks/services/financial_data_loader.py
import json
import os
from pathlib import Path
from ..models import Company, FinancialReport
from .dividend_service import sync_dividends_from_financials

DEFAULT_FIXTURES_DIR = Path(__file__).resolve().parent.parent / 'fixtures' / 'financials'


class FinancialDataLoader:
    """Loads financial report data from a JSON fixture file into the database."""

    def __init__(self, fixtures_dir: str | None = None):
        self._dir = Path(fixtures_dir) if fixtures_dir else DEFAULT_FIXTURES_DIR

    def load(self, ticker: str) -> int:
        data = self._read_fixture(ticker)
        company = self._ensure_company(ticker, data['company'])
        count = self._upsert_reports(company, data.get('reports', []))
        if count:
            sync_dividends_from_financials(company)
        return count

    def _read_fixture(self, ticker: str) -> dict:
        path = self._dir / f'{ticker}.json'
        if not path.exists():
            raise FileNotFoundError(f"No fixture for {ticker} at {path}")
        return json.loads(path.read_text())

    def _ensure_company(self, ticker: str, meta: dict):
        company, _ = Company.objects.get_or_create(
            symbol=ticker,
            defaults={
                'name': meta['name'],
                'sector': meta['sector'],
                'instrument_type': meta.get('instrument_type', 'Equity'),
            },
        )
        return company

    def _upsert_reports(self, company, reports: list) -> int:
        count = 0
        for report in reports:
            FinancialReport.objects.update_or_create(
                company=company,
                fiscal_year=report['fiscal_year'],
                defaults=report,
            )
            count += 1
        return count
```

- [ ] **Step 4: Run tests**

```bash
pytest stocks/tests/test_financial_data_loader.py -v
```
Expected: all pass

- [ ] **Step 5: Create the management command**

```python
# backend/stocks/management/commands/seed_financials.py
from django.core.management.base import BaseCommand, CommandError
from stocks.services.financial_data_loader import FinancialDataLoader


class Command(BaseCommand):
    help = 'Seed financial reports for one or all tickers from JSON fixtures'

    def add_arguments(self, parser):
        parser.add_argument('--ticker', type=str, help='Single ticker to seed (e.g. ADBL)')
        parser.add_argument('--all', action='store_true', help='Seed all available fixtures')

    def handle(self, *args, **options):
        loader = FinancialDataLoader()
        tickers = self._resolve_tickers(loader, options)
        total = 0
        for ticker in tickers:
            count = self._seed_one(loader, ticker)
            total += count
        self.stdout.write(self.style.SUCCESS(f'Seeded {total} reports across {len(tickers)} tickers.'))

    def _resolve_tickers(self, loader, options) -> list:
        if options.get('ticker'):
            return [options['ticker'].upper()]
        if options.get('all'):
            return loader.available_tickers()
        raise CommandError('Pass --ticker SYMBOL or --all')

    def _seed_one(self, loader, ticker: str) -> int:
        try:
            count = loader.load(ticker)
            self.stdout.write(f'  {ticker}: {count} reports')
            return count
        except FileNotFoundError:
            self.stdout.write(self.style.WARNING(f'  {ticker}: no fixture found, skipping'))
            return 0
```

Add `available_tickers()` to `FinancialDataLoader`:

```python
def available_tickers(self) -> list:
    return [p.stem for p in self._dir.glob('*.json')]
```

- [ ] **Step 6: Migrate fixture data for one ticker (verify end-to-end)**

Extract the data dict from `seed_adbl_financials.py` into `backend/stocks/fixtures/financials/ADBL.json`:

```bash
mkdir -p backend/stocks/fixtures/financials
```

The JSON structure mirrors the Python dict in the seed command:

```json
{
  "ticker": "ADBL",
  "company": {
    "name": "Agricultural Development Bank Limited",
    "sector": "Commercial Banks",
    "instrument_type": "Equity"
  },
  "reports": [
    {
      "fiscal_year": "072/073",
      "assets": { "cash_equivalent": 13689269833, "...": "..." }
    }
  ]
}
```

Run end-to-end:

```bash
cd backend && python manage.py seed_financials --ticker ADBL
```
Expected: `ADBL: N reports`

- [ ] **Step 7: Migrate all remaining seed command data to JSON fixtures**

For each of the 17 remaining `seed_*_financials.py` files, extract the `financial_data` dict to `backend/stocks/fixtures/financials/<TICKER>.json` in the same format, then delete the seed command file.

```bash
# Verify all fixtures load cleanly
python manage.py seed_financials --all
```

- [ ] **Step 8: Delete old seed command files**

```bash
cd backend
git rm stocks/management/commands/seed_*_financials.py
```

- [ ] **Step 9: Run full test suite**

```bash
pytest stocks/tests/ -v --tb=short
```
Expected: all existing tests pass; new tests pass

- [ ] **Step 10: Commit**

```bash
git add backend/stocks/services/financial_data_loader.py \
        backend/stocks/management/commands/seed_financials.py \
        backend/stocks/fixtures/financials/ \
        backend/stocks/tests/test_financial_data_loader.py
git commit -m "feat(seed): replace 18 seed commands with FinancialDataLoader + seed_financials command"
```

---

## Task 10: Final verification and PR

- [ ] **Step 1: Run the complete test suite**

```bash
cd backend && source venv/bin/activate
pytest stocks/tests/ -v --tb=short
```
Expected: all tests pass, no regressions

- [ ] **Step 2: Check no function exceeds 30 lines**

```bash
python - << 'EOF'
import ast, sys
from pathlib import Path

violations = []
for path in Path('stocks/services').rglob('*.py'):
    tree = ast.parse(path.read_text())
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            lines = node.end_lineno - node.lineno + 1
            if lines > 30:
                violations.append(f"{path}:{node.lineno} {node.name}() = {lines} lines")

if violations:
    print("VIOLATIONS:")
    for v in violations: print(f"  {v}")
    sys.exit(1)
else:
    print("All functions ≤30 lines. ✓")
EOF
```
Expected: `All functions ≤30 lines. ✓`

Fix any violations before proceeding.

- [ ] **Step 3: Verify Celery task still works**

```bash
python manage.py shell -c "
from stocks.tasks import check_all_user_notifications
print('Task importable:', check_all_user_notifications)
"
```
Expected: no import errors

- [ ] **Step 4: Final commit**

```bash
git add -p  # stage any remaining fixes
git commit -m "refactor: SOLID Phase 1 complete — checkers, generators, MarketSummaryService, FinancialDataLoader"
```

---

## Phase 2 — separate plans (not in scope here)

The following candidates from the architecture review are independent and each warrants its own plan:

- **`2026-06-13-solid-refactor-phase2-portfolio.md`** — PortfolioService split (Candidate 5)
- **`2026-06-13-solid-refactor-phase2-frontend.md`** — ChatInterface/NotebookInterface hooks (Candidate 6)
- **`2026-06-13-solid-refactor-phase2-strategy.md`** — StrategyComposer seam (Candidate 7)
- **`2026-06-13-solid-refactor-phase2-optimization.md`** — IOptimizationStrategy registry (Candidate 8)
