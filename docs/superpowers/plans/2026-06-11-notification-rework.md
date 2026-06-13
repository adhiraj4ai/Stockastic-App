# Notification System Rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Backend-assigned severity tiers + a normalized metadata contract feed a single frontend notification registry, one centralized 20s polling provider, and adaptive theme-native popups (quiet line / data card / action panel) that replace sonner's stock toasts.

**Architecture:** Backend adds a `severity` field derived from a per-type map inside `create_notification()`, and normalizes `metadata` payloads across the check functions. Frontend gets `src/lib/notifications/config.ts` (single type registry used by every surface), `NotificationProvider` (one poll loop replacing three), and `NotificationToast` rendered via `toast.custom()` so all visuals come from the app's theme tokens.

**Tech Stack:** Django 5 / DRF / pytest-django (backend, run from `backend/` with `.venv/bin/python -m pytest`), Next.js 16 App Router / Tailwind 4 / sonner / lucide-react / vitest + testing-library (frontend, run from `frontend/` with `npm test`).

**Spec:** `docs/superpowers/specs/2026-06-11-notification-rework-design.md`

**Constraints discovered during planning:**
- `DailyStockPrice` is `managed = False` — tests CANNOT seed prices via ORM. Patch `stocks.services.notification_service.get_latest_price` instead (existing pattern, see `backend/tests/test_daily_plan.py`).
- There is no `frontend/src/app/(authenticated)/layout.tsx` today — pages mount `DashboardLayout` directly. Task 9 creates the route-group layout so the provider survives client-side navigation.
- The API list endpoint returns a plain array (no pagination).
- Known bugs to fix in passing: `check_portfolio_management_alerts` uses `curr_price` before assignment (UnboundLocalError swallowed by broad except — concentration alerts NEVER fire); `check_accumulation_trend_alerts` reads `row.get('ltp')` from a stale loop variable (wrong symbol's price).

---

## Task 1: Backend — `severity` field, `SEVERITY_MAP`, serializer

**Files:**
- Modify: `backend/stocks/models/system.py` (Notification model, after line 91)
- Modify: `backend/stocks/services/notification_service.py` (top of file + `create_notification`, lines 16-65)
- Modify: `backend/stocks/serializers/system.py`
- Create: `backend/stocks/migrations/0037_notification_severity.py` (via makemigrations)
- Test: `backend/tests/test_notifications_api.py`

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/test_notifications_api.py`:

```python
@pytest.mark.django_db
class TestNotificationSeverity:
    def test_create_notification_assigns_mapped_severity(self, create_user):
        from stocks.services.notification_service import create_notification
        user = create_user(username='sev_user', password='password')

        cases = [
            ('STOP_LOSS_HIT', 'critical'),
            ('TARGET_REACHED', 'high'),
            ('DAILY_PLAN_READY', 'high'),
            ('SIGNAL_BUY', 'normal'),
            ('VOLUME_SPIKE', 'normal'),
            ('PORTFOLIO_DIVERSITY', 'low'),
            ('BELOW_WACC', 'low'),
        ]
        for i, (ntype, expected) in enumerate(cases):
            n = create_notification(
                user=user, notification_type=ntype,
                title='t', message='m', ticker=f'TICK{i}',
            )
            assert n.severity == expected, f"{ntype} should be {expected}, got {n.severity}"

    def test_explicit_severity_override_wins(self, create_user):
        from stocks.services.notification_service import create_notification
        user = create_user(username='sev_user2', password='password')
        n = create_notification(
            user=user, notification_type='TARGET_REACHED',
            title='t', message='m', ticker='SUMMARY',
            severity='critical',
        )
        assert n.severity == 'critical'

    def test_realert_updates_severity(self, create_user):
        """Re-alerting an unread notification must refresh severity too."""
        from stocks.services.notification_service import create_notification
        user = create_user(username='sev_user3', password='password')
        first = create_notification(
            user=user, notification_type='TARGET_REACHED',
            title='t', message='m', ticker='NABIL',
        )
        assert first.severity == 'high'
        second = create_notification(
            user=user, notification_type='TARGET_REACHED',
            title='t2', message='m2', ticker='NABIL',
            severity='critical',
        )
        assert second.id == first.id  # re-alert, not a new row
        assert second.severity == 'critical'

    def test_serializer_exposes_severity(self, auth_client):
        from django.contrib.auth.models import User
        user = User.objects.get(username='testuser')
        Notification.objects.create(
            user=user, title='t', message='m', type='STOP_LOSS_HIT',
            severity='critical',
        )
        url = reverse('notifications-list')
        response = auth_client.get(url)
        assert response.status_code == status.HTTP_200_OK
        assert response.data[0]['severity'] == 'critical'
```

- [ ] **Step 2: Run tests to verify they fail**

Run (from `backend/`): `.venv/bin/python -m pytest tests/test_notifications_api.py::TestNotificationSeverity -v`
Expected: FAIL — `TypeError: create_notification() got an unexpected keyword argument 'severity'` / `AttributeError: severity` / `FieldError`.

- [ ] **Step 3: Add the model field**

In `backend/stocks/models/system.py`, inside `class Notification`, after the `NotificationType` choices class (after line 91), add:

```python
    class Severity(models.TextChoices):
        CRITICAL = 'critical', 'Critical'
        HIGH = 'high', 'High'
        NORMAL = 'normal', 'Normal'
        LOW = 'low', 'Low'
```

and after the `type` field (line 96), add:

```python
    severity = models.CharField(
        max_length=10, choices=Severity.choices,
        default=Severity.NORMAL, db_index=True,
        help_text="Display priority; drives popup behavior on the frontend",
    )
```

- [ ] **Step 4: Generate the migration**

Run (from `backend/`): `.venv/bin/python manage.py makemigrations stocks`
Expected: `0037_notification_severity.py` created (name may differ slightly; that's fine).

- [ ] **Step 5: Add SEVERITY_MAP and wire into create_notification**

In `backend/stocks/services/notification_service.py`, after the imports (line 13), add:

```python
# Display priority per notification type. Anything not listed is NORMAL.
# critical/high pop up in the UI; low never pops (bell badge only).
SEVERITY_MAP = {
    'STOP_LOSS_HIT': 'critical',
    'TARGET_REACHED': 'high',
    'TAKE_PROFIT': 'high',
    'SIGNIFICANT_GAIN': 'high',
    'SIGNIFICANT_LOSS': 'high',
    'SIGNAL_STRONG_BUY': 'high',
    'SIGNAL_STRONG_SELL': 'high',
    'WATCHLIST_ENTRY': 'high',
    'WATCHLIST_BREAKOUT': 'high',
    'DAILY_PLAN_READY': 'high',
    'WHALE_ENTRY': 'high',
    'PRICE_ALERT': 'high',
    'PORTFOLIO_DIVERSITY': 'low',
    'BELOW_WACC': 'low',
}
```

Replace the `create_notification` signature (lines 16-17) with:

```python
def create_notification(user, notification_type, title, message, ticker=None, redirect_url=None,
                       portfolio_item_id=None, watchlist_item_id=None, metadata=None, severity=None):
```

Immediately after the docstring, resolve severity:

```python
    resolved_severity = severity or SEVERITY_MAP.get(str(notification_type), 'normal')
```

In the re-alert branch (after `existing_unread.created_at = timezone.now()`), add:

```python
        existing_unread.severity = resolved_severity
```

In the final `Notification.objects.create(...)` call, add the kwarg:

```python
        severity=resolved_severity,
```

- [ ] **Step 6: Expose severity in the serializer**

In `backend/stocks/serializers/system.py`, change the fields list to:

```python
        fields = ['id', 'title', 'message', 'type', 'ticker', 'read', 'created_at',
                  'redirect_url', 'metadata', 'severity']
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `.venv/bin/python -m pytest tests/test_notifications_api.py -v`
Expected: ALL PASS (new severity tests + existing tests).

- [ ] **Step 8: Commit**

```bash
git add backend/stocks/models/system.py backend/stocks/migrations/ backend/stocks/services/notification_service.py backend/stocks/serializers/system.py backend/tests/test_notifications_api.py
git commit -m "feat(notifications): backend-assigned severity tiers on Notification"
```

---

## Task 2: Backend — `?severity=` list filter

**Files:**
- Modify: `backend/stocks/views/notifications.py:38-50` (`get_queryset`)
- Test: `backend/tests/test_notifications_api.py`

- [ ] **Step 1: Write the failing test**

Append inside `TestNotificationsAPI` in `backend/tests/test_notifications_api.py`:

```python
    def test_severity_filter(self, auth_client):
        from django.contrib.auth.models import User
        user = User.objects.get(username='testuser')
        Notification.objects.create(user=user, title='c', message='m', type='STOP_LOSS_HIT', severity='critical')
        Notification.objects.create(user=user, title='n', message='m', type='SIGNAL_BUY', severity='normal')

        url = reverse('notifications-list')
        response = auth_client.get(url, {'severity': 'critical'})
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) == 1
        assert response.data[0]['severity'] == 'critical'
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/bin/python -m pytest tests/test_notifications_api.py::TestNotificationsAPI::test_severity_filter -v`
Expected: FAIL — both notifications returned (`len(response.data) == 2`).

- [ ] **Step 3: Implement the filter**

In `backend/stocks/views/notifications.py`, inside `get_queryset`, after the category block (line 44), add:

```python
        # ?severity=critical|high|normal|low
        severity = self.request.query_params.get('severity')
        if severity in {'critical', 'high', 'normal', 'low'}:
            qs = qs.filter(severity=severity)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `.venv/bin/python -m pytest tests/test_notifications_api.py -v`
Expected: ALL PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/stocks/views/notifications.py backend/tests/test_notifications_api.py
git commit -m "feat(notifications): severity query filter on list endpoint"
```

---

## Task 3: Backend — metadata contract for portfolio + watchlist alerts

The popups render a metrics strip from metadata. Contract for single-ticker level alerts: `price`, `change_pct`, `symbol`, plus `level` + `level_type` (`'stop'`|`'target'`) where a level was crossed. Summary alerts: `symbols`, `count`, `items[]`.

**Files:**
- Modify: `backend/stocks/services/notification_service.py` (`check_portfolio_alerts` lines 156-170, `check_watchlist_alerts` lines 258-272)
- Test: `backend/tests/test_notifications_api.py`

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/test_notifications_api.py`:

```python
@pytest.mark.django_db
class TestMetadataContract:
    """Popups render metrics straight from metadata — these keys are load-bearing."""

    def test_portfolio_stop_loss_metadata(self, create_user):
        from unittest.mock import patch
        from stocks.models import PortfolioItem
        from stocks.services import notification_service

        user = create_user(username='meta_user', password='password')
        PortfolioItem.objects.create(
            user=user, ticker='NABIL', quantity=10,
            buy_price=500, wacc=500, stop_loss_price=480,
        )
        with patch.object(notification_service, 'get_latest_price', return_value=471.1):
            created = notification_service.check_portfolio_alerts(user)

        assert created >= 1
        n = Notification.objects.get(user=user, type='STOP_LOSS_HIT', ticker='NABIL')
        md = n.metadata
        assert md['price'] == 471.1
        assert md['symbol'] == 'NABIL'
        assert md['level'] == 480.0
        assert md['level_type'] == 'stop'
        assert 'change_pct' in md
        assert n.severity == 'critical'

    def test_portfolio_target_metadata(self, create_user):
        from unittest.mock import patch
        from stocks.models import PortfolioItem
        from stocks.services import notification_service

        user = create_user(username='meta_user2', password='password')
        PortfolioItem.objects.create(
            user=user, ticker='NICA', quantity=10,
            buy_price=400, wacc=400, target_price=440,
        )
        with patch.object(notification_service, 'get_latest_price', return_value=445.0):
            notification_service.check_portfolio_alerts(user)

        n = Notification.objects.get(user=user, type='TARGET_REACHED', ticker='NICA')
        assert n.metadata['level'] == 440.0
        assert n.metadata['level_type'] == 'target'

    def test_watchlist_alert_metadata(self, create_user):
        from unittest.mock import patch
        from stocks.models import WatchlistItem
        from stocks.services import notification_service

        user = create_user(username='meta_user3', password='password')
        WatchlistItem.objects.create(
            user=user, ticker='HDHPC', alert_enabled=True, target_price=1100,
        )
        with patch.object(notification_service, 'get_latest_price', return_value=1142.0):
            notification_service.check_watchlist_alerts(user)

        n = Notification.objects.get(user=user, type='TARGET_REACHED', ticker='HDHPC')
        md = n.metadata
        assert md['price'] == 1142.0
        assert md['level'] == 1100.0
        assert md['level_type'] == 'target'
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `.venv/bin/python -m pytest tests/test_notifications_api.py::TestMetadataContract -v`
Expected: FAIL — `KeyError: 'level'` (metadata currently has `target`/`stop` keys, no `level`/`level_type`).

- [ ] **Step 3: Implement portfolio metadata**

In `check_portfolio_alerts`, in the single-hit branch, replace the `metadata={...}` dict (lines 164-169) with:

```python
                level, level_type = None, None
                if n_type == Notification.NotificationType.STOP_LOSS_HIT and item.stop_loss_price:
                    level, level_type = float(item.stop_loss_price), 'stop'
                elif n_type == Notification.NotificationType.TARGET_REACHED:
                    for tp in (item.target_price, item.target_price_2, item.target_price_3):
                        if tp and price >= float(tp):
                            level, level_type = float(tp), 'target'
                            break

                notification = create_notification(
                    user=user,
                    notification_type=n_type,
                    title=title,
                    message=message,
                    ticker=item.ticker,
                    redirect_url='/portfolio?tab=holdings',
                    portfolio_item_id=item.id,
                    metadata={
                        'price': price,
                        'wacc': wacc_curr,
                        'change_pct': price_change_pct,
                        'symbol': item.ticker,
                        'level': level,
                        'level_type': level_type,
                    }
                )
```

(The `level, level_type` block goes right before the existing `notification = create_notification(...)` call, which gains the two new keys.)

- [ ] **Step 4: Implement watchlist metadata**

In `check_watchlist_alerts`, single-hit branch, replace the `metadata={...}` dict (lines 266-271) with:

```python
                if n_type == Notification.NotificationType.TARGET_REACHED:
                    level, level_type = (float(item.target_price), 'target') if item.target_price else (None, None)
                else:
                    level, level_type = (float(item.stop_loss_price), 'stop') if item.stop_loss_price else (None, None)

                notification = create_notification(
                    user=user,
                    notification_type=n_type,
                    title=title,
                    message=message,
                    ticker=item.ticker,
                    redirect_url=f'/ticker/{item.ticker}',
                    watchlist_item_id=item.id,
                    metadata={
                        'price': price,
                        'symbol': item.ticker,
                        'level': level,
                        'level_type': level_type,
                    }
                )
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `.venv/bin/python -m pytest tests/test_notifications_api.py -v`
Expected: ALL PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/stocks/services/notification_service.py backend/tests/test_notifications_api.py
git commit -m "feat(notifications): level/level_type metadata on portfolio and watchlist alerts"
```

---

## Task 4: Backend — zone-entry metadata + portfolio-management `curr_price` bugfix

**Files:**
- Modify: `backend/stocks/services/notification_service.py` (`check_zone_entry_alerts` lines 311-348, `check_portfolio_management_alerts` lines 984-1032)
- Test: `backend/tests/test_notifications_api.py`

- [ ] **Step 1: Write the failing tests**

Append inside `TestMetadataContract`:

```python
    def test_zone_entry_metadata(self, create_user):
        from unittest.mock import patch
        from stocks.models import WatchlistItem, DailyTradingPlan
        from stocks.services import notification_service
        from datetime import date

        user = create_user(username='meta_user4', password='password')
        WatchlistItem.objects.create(user=user, ticker='SHIVM', alert_enabled=True)
        DailyTradingPlan.objects.create(
            date=date(2026, 6, 12),
            payload={'as_of': '2026-06-11', 'entry_statuses': {'SHIVM': 'IN_ZONE'}},
        )
        with patch.object(notification_service, 'get_latest_price', return_value=612.0):
            created = notification_service.check_zone_entry_alerts(user)

        assert created == 1
        n = Notification.objects.get(user=user, type='WATCHLIST_ENTRY', ticker='SHIVM')
        assert n.metadata['price'] == 612.0
        assert n.metadata['symbol'] == 'SHIVM'
        assert n.metadata['plan_date'] == '2026-06-11'
        assert n.severity == 'high'

    def test_portfolio_concentration_fires_with_price(self, create_user):
        """Regression: curr_price was referenced before assignment, so the
        concentration alert raised UnboundLocalError (swallowed) and NEVER fired."""
        from unittest.mock import patch
        from stocks.models import PortfolioItem
        from stocks.services import notification_service

        user = create_user(username='meta_user5', password='password')
        PortfolioItem.objects.create(user=user, ticker='BIG', quantity=100, buy_price=500, wacc=500)
        PortfolioItem.objects.create(user=user, ticker='SMALL', quantity=10, buy_price=100, wacc=100)

        with patch.object(notification_service, 'get_latest_price', return_value=510.0):
            created = notification_service.check_portfolio_management_alerts(user)

        assert created >= 1
        n = Notification.objects.get(user=user, type='PORTFOLIO_DIVERSITY', ticker='BIG')
        assert n.metadata['price'] == 510.0
        assert n.metadata['symbol'] == 'BIG'
        assert 'weight' in n.metadata
        assert n.severity == 'low'
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `.venv/bin/python -m pytest tests/test_notifications_api.py::TestMetadataContract -v`
Expected: zone test FAILS (`KeyError: 'price'` — zone entry creates no metadata today); concentration test FAILS (`Notification.DoesNotExist` — UnboundLocalError swallowed, alert never created).

- [ ] **Step 3: Add zone-entry metadata**

In `check_zone_entry_alerts`, replace the `create_notification(...)` call (lines 332-341) with:

```python
            notification = create_notification(
                user=user,
                notification_type=Notification.NotificationType.WATCHLIST_ENTRY,
                title=f"{item.ticker} is in its entry zone",
                message=(f"{item.ticker} closed inside its canonical entry zone "
                         f"(ATR-based) per the latest plan ({plan.payload.get('as_of')})."),
                ticker=item.ticker,
                redirect_url=f'/ticker/{item.ticker}',
                watchlist_item_id=item.id,
                metadata={
                    'price': get_latest_price(item.ticker),
                    'symbol': item.ticker,
                    'plan_date': plan.payload.get('as_of'),
                },
            )
```

- [ ] **Step 4: Fix the curr_price bug**

In `check_portfolio_management_alerts`, inside the `for item in items:` loop, move the price fetch to the TOP of the loop body. Replace lines 1000-1016 (from `wacc_val = ...` through `curr_price = get_latest_price(item.ticker)`) with:

```python
        for item in items:
            wacc_val = float(item.wacc) if item.wacc else float(item.buy_price)
            curr_price = get_latest_price(item.ticker)
            weight = (item.quantity * wacc_val) / total_value
            if weight > 0.40: # 40% threshold
                if not Notification.objects.filter(user=user, ticker=item.ticker, type=Notification.NotificationType.PORTFOLIO_DIVERSITY, created_at__gte=one_week_ago).exists():
                    create_notification(
                        user=user, ticker=item.ticker, notification_type=Notification.NotificationType.PORTFOLIO_DIVERSITY,
                        title="Concentration Warning",
                        message=f"{item.ticker} now makes up {weight*100:.1f}% of your portfolio. Consider diversifying.",
                        redirect_url="/portfolio",
                        metadata={'weight': weight, 'symbol': item.ticker, 'price': curr_price}
                    )
                    notifications_created += 1

            # 2. Take Profit Alert (Logic: Gain > 30% or Profit over Rs 100k)
            if curr_price:
```

(The rest of the take-profit block stays as-is; it already uses `curr_price`. Also update its metadata dict to add `change_pct`: `metadata={'profit_percent': profit_percent, 'change_pct': profit_percent, 'symbol': item.ticker, 'price': curr_price}`.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `.venv/bin/python -m pytest tests/test_notifications_api.py -v`
Expected: ALL PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/stocks/services/notification_service.py backend/tests/test_notifications_api.py
git commit -m "fix(notifications): zone-entry metadata + concentration alert UnboundLocalError"
```

---

## Task 5: Backend — remaining metadata normalization (active signals, accumulation, technicals)

**Files:**
- Modify: `backend/stocks/services/notification_service.py` (`check_active_signal_alerts` lines 414-430, `check_accumulation_trend_alerts` lines 780-794, `check_technical_alerts` lines 877-911)
- Test: `backend/tests/test_notifications_api.py`

- [ ] **Step 1: Write the failing test (active signal path — managed models only)**

Append inside `TestMetadataContract`:

```python
    def test_active_signal_won_metadata(self, create_user):
        from unittest.mock import patch
        from stocks.models import SignalEpisode
        from stocks.services import notification_service
        from datetime import date

        user = create_user(username='meta_user6', password='password')
        SignalEpisode.objects.create(
            source='STRATEGY', producer_key='k1', symbol='NLIC', direction='BUY',
            start_date=date(2026, 6, 1), last_signal_date=date(2026, 6, 1),
            entry_price=900, target_price=950, stop_loss_price=870, status='ACTIVE',
        )
        with patch.object(notification_service, 'get_latest_price', return_value=955.0):
            notification_service.check_active_signal_alerts(user)

        n = Notification.objects.get(user=user, type='TARGET_REACHED', ticker='NLIC')
        md = n.metadata
        assert md['price'] == 955.0
        assert md['level'] == 950.0
        assert md['level_type'] == 'target'
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/bin/python -m pytest tests/test_notifications_api.py::TestMetadataContract::test_active_signal_won_metadata -v`
Expected: FAIL — `KeyError: 'level'`.

- [ ] **Step 3: Implement active-signal metadata**

In `check_active_signal_alerts`, single-hit branch, replace the `metadata={...}` dict (lines 421-429) with:

```python
                metadata={
                    'signal_id': sig.id,
                    'hit_type': hit_type,
                    'source': sig.source,
                    'price': price,
                    'symbol': sig.symbol,
                    'level': (float(sig.target_price) if hit_type == 'WON' and sig.target_price
                              else float(sig.stop_loss_price) if sig.stop_loss_price else None),
                    'level_type': 'target' if hit_type == 'WON' else 'stop',
                }
```

NOTE: the single-hit branch currently reads `price` from the loop variable left over from step 1's iteration — a latent bug if the notification came from the `closed_today` query. Fix it by adding `price = get_latest_price(sig.symbol)` as the first line of the `if len(signals) == 1:` branch (before `sig = signals[0]` use of price), i.e.:

```python
        if len(signals) == 1:
            # Single hit: stay specific
            sig = signals[0]
            price = get_latest_price(sig.symbol)
```

- [ ] **Step 4: Fix the accumulation stale-row bug (no test — unmanaged raw-SQL tables)**

In `check_accumulation_trend_alerts`, the metadata dict (line 791) uses `row.get('ltp')` where `row` is the stale variable from the earlier `for row in results:` loop. Replace the metadata dict with:

```python
                metadata={
                    'brokers': [b['broker'] for b in brokers],
                    'top_broker': top_broker['broker'] if top_broker else "Unknown",
                    'net_5d': net_5d_val,
                    'price': float(top_broker['ltp']) if top_broker and top_broker.get('ltp') is not None else None,
                    'symbol': symbol
                }
```

This is untestable via ORM (`daily_floorsheet` / `daily_cumulative_accumulation` are raw-SQL, unmanaged); verified by code review + manual trigger_check.

- [ ] **Step 5: Add change_pct to technical alerts (no test — DailyStockPrice unmanaged)**

In `check_technical_alerts`, after `latest_close = df['close'].iloc[-1]` (line 875), add:

```python
            prev_close = float(df['close'].iloc[-2]) if len(df) >= 2 else None
            day_change_pct = (((float(latest_close) - prev_close) / prev_close) * 100
                              if prev_close else None)
```

Then add `'change_pct': day_change_pct,` to each of the four metadata dicts in this function (VOLUME_SPIKE line 885, RSI_OVERSOLD line 897, RSI_OVERBOUGHT line 909, GOLDEN_CROSS line 927).

- [ ] **Step 6: Run the full backend notification suite**

Run: `.venv/bin/python -m pytest tests/test_notifications_api.py -v`
Expected: ALL PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/stocks/services/notification_service.py backend/tests/test_notifications_api.py
git commit -m "feat(notifications): normalize metadata for signal/accumulation/technical alerts"
```

---

## Task 6: Frontend — notification registry (`config.ts`)

Single source of truth: type → icon, tone, category, fallback severity, popup variant, route, quick actions, metrics. Everything else imports from here.

**Files:**
- Create: `frontend/src/lib/notifications/config.ts`
- Test: `frontend/src/__tests__/unit/notificationsConfig.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/__tests__/unit/notificationsConfig.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
    getTypeConfig, getSeverity, getVariant, buildRoute, getMetrics,
    getQuickActions, POPUP_DURATION, type AppNotification,
} from '@/lib/notifications/config';

const base: AppNotification = {
    id: 1, title: 't', message: 'm', type: 'STOP_LOSS_HIT', ticker: 'NABIL',
    read: false, created_at: '2026-06-11T10:00:00Z',
};

describe('notification registry', () => {
    it('maps every known type and falls back for unknown', () => {
        expect(getTypeConfig('STOP_LOSS_HIT').tone).toBe('danger');
        expect(getTypeConfig('TARGET_REACHED').tone).toBe('success');
        expect(getTypeConfig('NOT_A_REAL_TYPE').tone).toBe('info'); // fallback
    });

    it('severity: backend field wins, registry is fallback', () => {
        expect(getSeverity({ ...base, severity: 'low' })).toBe('low');
        expect(getSeverity({ ...base, severity: undefined })).toBe('critical');
    });

    it('variant: registry default, summary escalates to panel', () => {
        expect(getVariant(base)).toBe('card');
        expect(getVariant({ ...base, type: 'SIGNAL_BUY' })).toBe('line');
        expect(getVariant({ ...base, type: 'PORTFOLIO_DIVERSITY' })).toBe('none');
        expect(getVariant({ ...base, ticker: 'SUMMARY' })).toBe('panel');
        expect(getVariant({ ...base, type: 'SIGNAL_BUY', metadata: { symbols: ['A', 'B'] } })).toBe('panel');
        expect(getVariant({ ...base, type: 'DAILY_PLAN_READY' })).toBe('panel');
    });

    it('route: redirect_url first, then ticker page, then notifications', () => {
        expect(buildRoute({ ...base, redirect_url: '/portfolio?tab=holdings' })).toBe('/portfolio?tab=holdings');
        expect(buildRoute({ ...base, redirect_url: undefined })).toBe('/ticker/NABIL');
        expect(buildRoute({ ...base, redirect_url: undefined, ticker: 'SUMMARY' })).toBe('/notifications');
        expect(buildRoute({ ...base, redirect_url: undefined, ticker: null })).toBe('/notifications');
    });

    it('metrics: builds ordered strip from metadata contract keys', () => {
        const metrics = getMetrics({
            ...base,
            metadata: { price: 471.1, level: 480, level_type: 'stop', change_pct: -8.2 },
        });
        expect(metrics).toEqual([
            { label: 'LTP', value: 471.1, kind: 'price' },
            { label: 'Stop', value: 480, kind: 'price' },
            { label: 'Change', value: -8.2, kind: 'percent' },
        ]);
        expect(getMetrics({ ...base, metadata: undefined })).toEqual([]);
    });

    it('quick actions: daily plan gets briefing + plan links', () => {
        const actions = getQuickActions({
            ...base, type: 'DAILY_PLAN_READY', ticker: null, redirect_url: '/chat?session=42',
        });
        expect(actions).toEqual([
            { label: 'Open briefing', href: '/chat?session=42' },
            { label: 'View plan', href: '/plan' },
        ]);
    });

    it('popup durations by severity', () => {
        expect(POPUP_DURATION.critical).toBe(Infinity);
        expect(POPUP_DURATION.high).toBe(10000);
        expect(POPUP_DURATION.normal).toBe(6000);
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run (from `frontend/`): `npm test -- src/__tests__/unit/notificationsConfig.test.ts`
Expected: FAIL — cannot resolve `@/lib/notifications/config`.

- [ ] **Step 3: Implement the registry**

Create `frontend/src/lib/notifications/config.ts`:

```ts
import type { LucideIcon } from 'lucide-react';
import {
    AlertCircle, Bell, CalendarClock, CheckCircle, Eye, Filter, Fish, Info,
    ShieldAlert, Target, TrendingDown, TrendingUp, Zap,
} from 'lucide-react';

export type Severity = 'critical' | 'high' | 'normal' | 'low';
export type PopupVariant = 'panel' | 'card' | 'line' | 'none';
export type Tone = 'danger' | 'success' | 'warning' | 'info' | 'accent';
export type Category = 'portfolio' | 'watchlist' | 'signals' | 'technical' | 'broker' | 'market' | 'system';

export interface AppNotification {
    id: number;
    title: string;
    message: string;
    type: string;
    ticker: string | null;
    read: boolean;
    created_at: string;
    redirect_url?: string | null;
    severity?: Severity;
    metadata?: Record<string, any> | null;
}

export interface Metric {
    label: string;
    value: number;
    kind: 'price' | 'percent' | 'number';
}

interface TypeConfig {
    icon: LucideIcon;
    tone: Tone;
    category: Category;
    severity: Severity;   // fallback only — backend value wins
    variant: PopupVariant;
}

const T = (icon: LucideIcon, tone: Tone, category: Category, severity: Severity, variant: PopupVariant): TypeConfig =>
    ({ icon, tone, category, severity, variant });

export const NOTIFICATION_TYPES: Record<string, TypeConfig> = {
    // Portfolio — money events
    STOP_LOSS_HIT: T(ShieldAlert, 'danger', 'portfolio', 'critical', 'card'),
    TARGET_REACHED: T(Target, 'success', 'portfolio', 'high', 'card'),
    TAKE_PROFIT: T(Target, 'success', 'portfolio', 'high', 'card'),
    SIGNIFICANT_GAIN: T(TrendingUp, 'success', 'portfolio', 'high', 'card'),
    SIGNIFICANT_LOSS: T(TrendingDown, 'danger', 'portfolio', 'high', 'card'),
    BELOW_WACC: T(TrendingDown, 'warning', 'portfolio', 'low', 'none'),
    PORTFOLIO_DIVERSITY: T(Filter, 'warning', 'portfolio', 'low', 'none'),
    // Watchlist
    WATCHLIST_ENTRY: T(Eye, 'accent', 'watchlist', 'high', 'panel'),
    WATCHLIST_BREAKOUT: T(TrendingUp, 'accent', 'watchlist', 'high', 'card'),
    // Signals
    SIGNAL_BUY: T(TrendingUp, 'success', 'signals', 'normal', 'line'),
    SIGNAL_SELL: T(TrendingDown, 'warning', 'signals', 'normal', 'line'),
    SIGNAL_STRONG_BUY: T(TrendingUp, 'success', 'signals', 'high', 'card'),
    SIGNAL_STRONG_SELL: T(TrendingDown, 'danger', 'signals', 'high', 'card'),
    DAILY_PLAN_READY: T(CalendarClock, 'accent', 'system', 'high', 'panel'),
    // Technical
    VOLUME_SPIKE: T(Zap, 'warning', 'technical', 'normal', 'line'),
    RSI_OVERSOLD: T(Target, 'success', 'technical', 'normal', 'line'),
    RSI_OVERBOUGHT: T(AlertCircle, 'warning', 'technical', 'normal', 'line'),
    MACD_BULLISH: T(TrendingUp, 'success', 'technical', 'normal', 'line'),
    MACD_BEARISH: T(TrendingDown, 'warning', 'technical', 'normal', 'line'),
    GOLDEN_CROSS: T(TrendingUp, 'success', 'technical', 'normal', 'line'),
    DEATH_CROSS: T(TrendingDown, 'danger', 'technical', 'normal', 'line'),
    // Broker / smart money
    WHALE_BUY: T(Fish, 'accent', 'broker', 'normal', 'line'),
    WHALE_SELL: T(Fish, 'warning', 'broker', 'normal', 'line'),
    WHALE_ENTRY: T(Fish, 'accent', 'broker', 'high', 'card'),
    TREND_BUY_5D: T(TrendingUp, 'accent', 'broker', 'normal', 'line'),
    CONSISTENT_BUYING: T(TrendingUp, 'success', 'broker', 'normal', 'line'),
    CONSISTENT_SELLING: T(TrendingDown, 'warning', 'broker', 'normal', 'line'),
    // Market
    SECTOR_PUMP: T(TrendingUp, 'accent', 'market', 'normal', 'line'),
    MARKET_BREADTH_SHIFT: T(AlertCircle, 'accent', 'market', 'normal', 'line'),
    // General
    PRICE_ALERT: T(Bell, 'accent', 'system', 'high', 'card'),
    INFO: T(Info, 'info', 'system', 'normal', 'line'),
    SUCCESS: T(CheckCircle, 'success', 'system', 'normal', 'line'),
    WARNING: T(AlertCircle, 'warning', 'system', 'normal', 'line'),
};

const FALLBACK: TypeConfig = T(Info, 'info', 'system', 'normal', 'line');

export function getTypeConfig(type: string): TypeConfig {
    return NOTIFICATION_TYPES[type] ?? FALLBACK;
}

export function getSeverity(n: AppNotification): Severity {
    return n.severity ?? getTypeConfig(n.type).severity;
}

export function getVariant(n: AppNotification): PopupVariant {
    // Multi-symbol summaries always get the action panel — symbol chips need room.
    if (n.ticker === 'SUMMARY' || (n.metadata?.symbols?.length ?? 0) > 1) return 'panel';
    return getTypeConfig(n.type).variant;
}

export function buildRoute(n: AppNotification): string {
    if (n.redirect_url) return n.redirect_url;
    if (n.ticker && n.ticker !== 'SUMMARY') return `/ticker/${n.ticker}`;
    return '/notifications';
}

export function getQuickActions(n: AppNotification): Array<{ label: string; href: string }> {
    if (n.type === 'DAILY_PLAN_READY') {
        return [
            { label: 'Open briefing', href: n.redirect_url || '/plan' },
            { label: 'View plan', href: '/plan' },
        ];
    }
    if (n.ticker === 'SUMMARY' || (n.metadata?.symbols?.length ?? 0) > 1) {
        return [{ label: 'Review all', href: buildRoute(n) }];
    }
    return [];
}

const LEVEL_LABEL: Record<string, string> = { stop: 'Stop', target: 'Target' };

export function getMetrics(n: AppNotification): Metric[] {
    const md = n.metadata;
    if (!md) return [];
    const metrics: Metric[] = [];
    if (typeof md.price === 'number') metrics.push({ label: 'LTP', value: md.price, kind: 'price' });
    if (typeof md.level === 'number') {
        metrics.push({ label: LEVEL_LABEL[md.level_type] ?? 'Level', value: md.level, kind: 'price' });
    }
    if (typeof md.change_pct === 'number') metrics.push({ label: 'Change', value: md.change_pct, kind: 'percent' });
    if (typeof md.rsi === 'number') metrics.push({ label: 'RSI', value: md.rsi, kind: 'number' });
    if (typeof md.vol_multiplier === 'number') metrics.push({ label: 'Vol ×', value: md.vol_multiplier, kind: 'number' });
    return metrics.slice(0, 3);
}

export const POPUP_DURATION: Record<Severity, number> = {
    critical: Infinity,
    high: 10_000,
    normal: 6_000,
    low: 6_000,
};

// Theme-token classes per tone — surfaces stay flat, only the accent varies.
export const TONE_CLASSES: Record<Tone, { icon: string; bar: string; text: string }> = {
    danger:  { icon: 'bg-destructive/10 text-destructive', bar: 'bg-destructive', text: 'text-destructive' },
    success: { icon: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400', bar: 'bg-emerald-500', text: 'text-emerald-600 dark:text-emerald-400' },
    warning: { icon: 'bg-amber-500/10 text-amber-600 dark:text-amber-400', bar: 'bg-amber-500', text: 'text-amber-600 dark:text-amber-400' },
    info:    { icon: 'bg-muted text-muted-foreground', bar: 'bg-muted-foreground', text: 'text-muted-foreground' },
    accent:  { icon: 'bg-primary/10 text-primary', bar: 'bg-primary', text: 'text-primary' },
};

export const SEVERITY_DOT: Record<Severity, string> = {
    critical: 'bg-destructive',
    high: 'bg-amber-500',
    normal: 'bg-primary',
    low: 'bg-muted-foreground',
};

export const CATEGORIES: Array<{ key: Category; label: string; icon: LucideIcon }> = [
    { key: 'portfolio', label: 'Portfolio', icon: Target },
    { key: 'watchlist', label: 'Watchlist', icon: Eye },
    { key: 'signals', label: 'Signals', icon: TrendingUp },
    { key: 'technical', label: 'Technical', icon: Zap },
    { key: 'broker', label: 'Broker Analysis', icon: Fish },
    { key: 'market', label: 'Market Trends', icon: AlertCircle },
    { key: 'system', label: 'System', icon: Info },
];

export function getCategory(type: string): Category {
    return getTypeConfig(type).category;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/__tests__/unit/notificationsConfig.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/notifications/config.ts frontend/src/__tests__/unit/notificationsConfig.test.ts
git commit -m "feat(notifications): shared frontend type registry"
```

---

## Task 7: Frontend — popup queue logic (pure, testable)

Decides which fetched notifications become popups: unseen + unread + variant ≠ none, sorted by severity, max 3 + overflow count.

**Files:**
- Create: `frontend/src/lib/notifications/popupQueue.ts`
- Test: `frontend/src/__tests__/unit/popupQueue.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/__tests__/unit/popupQueue.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { selectPopups } from '@/lib/notifications/popupQueue';
import type { AppNotification } from '@/lib/notifications/config';

const make = (id: number, type: string, severity?: any, ticker: string | null = 'NABIL'): AppNotification => ({
    id, title: `n${id}`, message: 'm', type, ticker, read: false,
    created_at: '2026-06-11T10:00:00Z', severity,
});

describe('selectPopups', () => {
    it('skips seen, read, and variant-none notifications', () => {
        const seen = new Set([1]);
        const { popups, overflow } = selectPopups([
            make(1, 'STOP_LOSS_HIT', 'critical'),           // seen
            { ...make(2, 'TARGET_REACHED', 'high'), read: true }, // read
            make(3, 'PORTFOLIO_DIVERSITY', 'low'),          // variant none
            make(4, 'SIGNAL_BUY', 'normal'),
        ], seen);
        expect(popups.map(p => p.id)).toEqual([4]);
        expect(overflow).toBe(0);
    });

    it('caps at 3, highest severity first, rest counted as overflow', () => {
        const { popups, overflow } = selectPopups([
            make(1, 'SIGNAL_BUY', 'normal'),
            make(2, 'STOP_LOSS_HIT', 'critical'),
            make(3, 'VOLUME_SPIKE', 'normal'),
            make(4, 'TARGET_REACHED', 'high'),
            make(5, 'GOLDEN_CROSS', 'normal'),
        ], new Set());
        expect(popups.map(p => p.id)).toEqual([2, 4, 1]);
        expect(overflow).toBe(2);
    });

    it('falls back to registry severity when backend field missing', () => {
        const { popups } = selectPopups(
            [make(1, 'SIGNAL_BUY', undefined), make(2, 'STOP_LOSS_HIT', undefined)],
            new Set(),
        );
        expect(popups[0].id).toBe(2);
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/__tests__/unit/popupQueue.test.ts`
Expected: FAIL — cannot resolve `@/lib/notifications/popupQueue`.

- [ ] **Step 3: Implement**

Create `frontend/src/lib/notifications/popupQueue.ts`:

```ts
import { type AppNotification, getSeverity, getVariant, type Severity } from './config';

const SEVERITY_ORDER: Record<Severity, number> = { critical: 0, high: 1, normal: 2, low: 3 };
const MAX_POPUPS = 3;

export function selectPopups(
    notifications: AppNotification[],
    seenIds: ReadonlySet<number>,
): { popups: AppNotification[]; overflow: number } {
    const candidates = notifications
        .filter(n => !n.read && !seenIds.has(n.id) && getVariant(n) !== 'none')
        .sort((a, b) => SEVERITY_ORDER[getSeverity(a)] - SEVERITY_ORDER[getSeverity(b)]);
    return {
        popups: candidates.slice(0, MAX_POPUPS),
        overflow: Math.max(0, candidates.length - MAX_POPUPS),
    };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/__tests__/unit/popupQueue.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/notifications/popupQueue.ts frontend/src/__tests__/unit/popupQueue.test.ts
git commit -m "feat(notifications): popup selection queue (severity-sorted, capped)"
```

---

## Task 8: Frontend — `NotificationToast` component (variants A/B/C)

Theme-native toast card rendered via `toast.custom()`. All colors from theme tokens; severity accent bar on the left; tabular numerals on every number.

**Files:**
- Create: `frontend/src/components/notifications/NotificationToast.tsx`
- Test: `frontend/src/__tests__/unit/NotificationToast.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/__tests__/unit/NotificationToast.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NotificationToast } from '@/components/notifications/NotificationToast';
import type { AppNotification } from '@/lib/notifications/config';

const base: AppNotification = {
    id: 1, title: 'Stop loss hit', message: 'Closed below your stop of Rs. 480.',
    type: 'STOP_LOSS_HIT', ticker: 'NABIL', read: false,
    created_at: '2026-06-11T10:00:00Z', severity: 'critical',
    metadata: { price: 471.1, level: 480, level_type: 'stop', change_pct: -8.2 },
};

describe('NotificationToast', () => {
    it('card variant: title, ticker chip, metrics strip, actions', () => {
        render(<NotificationToast notification={base} onDismiss={() => {}} onNavigate={() => {}} />);
        expect(screen.getByText('Stop loss hit')).toBeInTheDocument();
        expect(screen.getByText('NABIL')).toBeInTheDocument();
        expect(screen.getByText('LTP')).toBeInTheDocument();
        expect(screen.getByText('Stop')).toBeInTheDocument();
        expect(screen.getByText('Dismiss')).toBeInTheDocument();
        expect(screen.getByText('View')).toBeInTheDocument();
    });

    it('line variant: compact, no message body, no metrics labels', () => {
        const n: AppNotification = {
            ...base, type: 'SIGNAL_BUY', severity: 'normal',
            title: 'Buy signal', metadata: { price: 612 },
        };
        render(<NotificationToast notification={n} onDismiss={() => {}} onNavigate={() => {}} />);
        expect(screen.getByText('Buy signal')).toBeInTheDocument();
        expect(screen.queryByText('LTP')).not.toBeInTheDocument(); // line shows value, not strip
        expect(screen.queryByText('Dismiss')).not.toBeInTheDocument();
    });

    it('panel variant: symbol chips and quick actions', () => {
        const n: AppNotification = {
            ...base, type: 'DAILY_PLAN_READY', ticker: null, severity: 'high',
            title: "Tomorrow's plan is ready", redirect_url: '/chat?session=42',
            metadata: { symbols: ['SHIVM', 'HDHPC', 'NICA'] },
        };
        render(<NotificationToast notification={n} onDismiss={() => {}} onNavigate={() => {}} />);
        expect(screen.getByText('SHIVM')).toBeInTheDocument();
        expect(screen.getByText('Open briefing')).toBeInTheDocument();
        expect(screen.getByText('View plan')).toBeInTheDocument();
    });

    it('dismiss calls onDismiss, primary action navigates', () => {
        const onDismiss = vi.fn();
        const onNavigate = vi.fn();
        render(<NotificationToast notification={base} onDismiss={onDismiss} onNavigate={onNavigate} />);
        fireEvent.click(screen.getByText('Dismiss'));
        expect(onDismiss).toHaveBeenCalled();
        fireEvent.click(screen.getByText('View'));
        expect(onNavigate).toHaveBeenCalledWith('/ticker/NABIL');
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/__tests__/unit/NotificationToast.test.tsx`
Expected: FAIL — cannot resolve component.

- [ ] **Step 3: Implement the component**

Create `frontend/src/components/notifications/NotificationToast.tsx`:

```tsx
'use client';

import React from 'react';
import { X } from 'lucide-react';
import {
    type AppNotification, getMetrics, getQuickActions, getSeverity, getTypeConfig,
    getVariant, buildRoute, SEVERITY_DOT, TONE_CLASSES,
} from '@/lib/notifications/config';
import { formatNepaliNumber } from '@/lib/formatters';

interface Props {
    notification: AppNotification;
    onDismiss: () => void;
    onNavigate: (href: string) => void;
}

function MetricValue({ value, kind }: { value: number; kind: string }) {
    if (kind === 'percent') {
        const positive = value >= 0;
        return (
            <span className={`tabular-nums font-semibold ${positive ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'}`}>
                {positive ? '+' : ''}{value.toFixed(1)}%
            </span>
        );
    }
    if (kind === 'price') {
        return <span className="tabular-nums font-semibold text-foreground">Rs. {formatNepaliNumber(value)}</span>;
    }
    return <span className="tabular-nums font-semibold text-foreground">{value.toFixed(1)}</span>;
}

export function NotificationToast({ notification: n, onDismiss, onNavigate }: Props) {
    const variant = getVariant(n);
    const severity = getSeverity(n);
    const config = getTypeConfig(n.type);
    const tone = TONE_CLASSES[config.tone];
    const metrics = getMetrics(n);
    const route = buildRoute(n);
    const Icon = config.icon;

    const tickerChip = n.ticker && n.ticker !== 'SUMMARY' && (
        <span className="text-[11px] font-semibold px-1.5 py-px rounded bg-secondary text-secondary-foreground border border-border tabular-nums">
            {n.ticker}
        </span>
    );

    // A — quiet line: one row, click-through anywhere.
    if (variant === 'line') {
        const key = metrics[0];
        return (
            <div
                onClick={() => onNavigate(route)}
                className="relative w-[356px] cursor-pointer overflow-hidden rounded-lg border border-border bg-card px-3.5 py-2.5 text-card-foreground shadow-md"
            >
                <span className={`absolute inset-y-0 left-0 w-[3px] ${SEVERITY_DOT[severity]}`} />
                <div className="flex items-center gap-2 pl-1">
                    <Icon size={14} className={tone.text} />
                    <span className="text-[13px] font-semibold truncate">{n.title}</span>
                    {tickerChip}
                    {key && <MetricValue value={key.value} kind={key.kind} />}
                    <button
                        onClick={(e) => { e.stopPropagation(); onDismiss(); }}
                        className="ml-auto text-muted-foreground/60 hover:text-foreground"
                        aria-label="Close"
                    >
                        <X size={13} />
                    </button>
                </div>
            </div>
        );
    }

    const symbols: string[] = n.metadata?.symbols ?? [];
    const quickActions = getQuickActions(n);

    // B (card) and C (panel) share the shell; panel adds chips + quick actions.
    return (
        <div className="relative w-[356px] overflow-hidden rounded-lg border border-border bg-card p-3.5 text-card-foreground shadow-md">
            <span className={`absolute inset-y-0 left-0 w-[3px] ${SEVERITY_DOT[severity]}`} />
            <button
                onClick={onDismiss}
                className="absolute right-2.5 top-2.5 text-muted-foreground/60 hover:text-foreground"
                aria-label="Close"
            >
                <X size={13} />
            </button>
            <div className="flex items-center gap-2 pl-1 pr-5">
                <span className={`p-1 rounded-md ${tone.icon}`}><Icon size={13} /></span>
                <span className="text-[13px] font-semibold truncate">{n.title}</span>
                {tickerChip}
            </div>
            <p className="mt-1 pl-1 text-xs leading-relaxed text-muted-foreground line-clamp-2">{n.message}</p>

            {variant === 'panel' && symbols.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5 pl-1">
                    {symbols.slice(0, 6).map(s => (
                        <button
                            key={s}
                            onClick={() => onNavigate(`/ticker/${s}`)}
                            className="text-[11px] font-semibold px-1.5 py-px rounded bg-secondary text-secondary-foreground border border-border hover:border-foreground/30 tabular-nums"
                        >
                            {s}
                        </button>
                    ))}
                    {symbols.length > 6 && (
                        <span className="text-[11px] text-muted-foreground">+{symbols.length - 6}</span>
                    )}
                </div>
            )}

            {variant === 'card' && metrics.length > 0 && (
                <div className="mt-2 flex gap-4 border-t border-border/60 pl-1 pt-2">
                    {metrics.map(m => (
                        <div key={m.label}>
                            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{m.label}</div>
                            <div className="text-[13px]"><MetricValue value={m.value} kind={m.kind} /></div>
                        </div>
                    ))}
                </div>
            )}

            <div className="mt-2.5 flex gap-2 pl-1">
                {variant === 'panel' && quickActions.length > 0 ? (
                    quickActions.map((a, i) => (
                        <button
                            key={a.label}
                            onClick={() => onNavigate(a.href)}
                            className={i === 0
                                ? 'rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90'
                                : 'rounded-md border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground'}
                        >
                            {a.label}
                        </button>
                    ))
                ) : (
                    <button
                        onClick={() => onNavigate(route)}
                        className="rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                    >
                        View
                    </button>
                )}
                <button
                    onClick={onDismiss}
                    className="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground"
                >
                    Dismiss
                </button>
            </div>
        </div>
    );
}
```

NOTE: check `frontend/src/lib/formatters.ts` exports `formatNepaliNumber(value: number)` (it's used by `WatchlistAlerts.tsx:9`). If its signature differs, adapt the call, not the helper.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/__tests__/unit/NotificationToast.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/notifications/NotificationToast.tsx frontend/src/__tests__/unit/NotificationToast.test.tsx
git commit -m "feat(notifications): theme-native adaptive toast component"
```

---

## Task 9: Frontend — `NotificationProvider` + route-group layout

One poll loop for the whole authenticated app. Replaces three independent pollers in later tasks.

**Files:**
- Create: `frontend/src/components/notifications/NotificationProvider.tsx`
- Create: `frontend/src/app/(authenticated)/layout.tsx`

- [ ] **Step 1: Implement the provider**

Create `frontend/src/components/notifications/NotificationProvider.tsx`:

```tsx
'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import api from '@/lib/api';
import { type AppNotification, getSeverity, POPUP_DURATION } from '@/lib/notifications/config';
import { selectPopups } from '@/lib/notifications/popupQueue';
import { NotificationToast } from './NotificationToast';

const POLL_MS = 20_000;
const MAX_BACKOFF_MS = 300_000;
const SEEN_KEY = 'stk-seen-notifications';

interface NotificationContextValue {
    notifications: AppNotification[];
    unreadCount: number;
    loading: boolean;
    isStale: boolean;
    refresh: () => Promise<void>;
    markRead: (id: number) => Promise<void>;
    markAllRead: () => Promise<void>;
    deleteRead: () => Promise<void>;
    triggerCheck: () => Promise<void>;
}

const NotificationContext = React.createContext<NotificationContextValue | null>(null);

export function useNotifications(): NotificationContextValue {
    const ctx = React.useContext(NotificationContext);
    if (!ctx) throw new Error('useNotifications must be used within NotificationProvider');
    return ctx;
}

function loadSeen(): Set<number> {
    try {
        return new Set(JSON.parse(sessionStorage.getItem(SEEN_KEY) ?? '[]'));
    } catch {
        return new Set();
    }
}

function persistSeen(seen: Set<number>) {
    try {
        sessionStorage.setItem(SEEN_KEY, JSON.stringify([...seen].slice(-500)));
    } catch { /* storage full or unavailable — popups may repeat after refresh, nothing breaks */ }
}

export function NotificationProvider({ children }: { children: React.ReactNode }) {
    const [notifications, setNotifications] = React.useState<AppNotification[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [isStale, setIsStale] = React.useState(false);
    const seenIds = React.useRef<Set<number>>(new Set());
    const isFirstFetch = React.useRef(true);
    const failures = React.useRef(0);
    const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const router = useRouter();

    const markRead = React.useCallback(async (id: number) => {
        setNotifications(prev => prev.map(n => (n.id === id ? { ...n, read: true } : n)));
        try {
            await api.post(`/api/stocks/notifications/${id}/mark_as_read/`);
        } catch {
            setNotifications(prev => prev.map(n => (n.id === id ? { ...n, read: false } : n)));
            toast.error('Could not mark notification as read');
        }
    }, []);

    const dispatchPopups = React.useCallback((incoming: AppNotification[]) => {
        const { popups, overflow } = selectPopups(incoming, seenIds.current);
        // Everything unread this poll is now "seen" — popped or counted in overflow.
        incoming.filter(n => !n.read).forEach(n => seenIds.current.add(n.id));
        persistSeen(seenIds.current);

        popups.forEach(n => {
            toast.custom(
                (t) => (
                    <NotificationToast
                        notification={n}
                        onDismiss={() => { toast.dismiss(t); markRead(n.id); }}
                        onNavigate={(href) => { toast.dismiss(t); markRead(n.id); router.push(href); }}
                    />
                ),
                { duration: POPUP_DURATION[getSeverity(n)] },
            );
        });
        if (overflow > 0) {
            toast.message(`+${overflow} more alerts`, {
                description: 'Open the bell to review them.',
                duration: 6000,
            });
        }
    }, [markRead, router]);

    const fetchNotifications = React.useCallback(async () => {
        try {
            const res = await api.get('/api/stocks/notifications/');
            const incoming: AppNotification[] = Array.isArray(res.data) ? res.data : [];
            setNotifications(incoming);
            setIsStale(false);
            failures.current = 0;
            if (isFirstFetch.current) {
                // Never toast pre-existing notifications on load.
                seenIds.current = loadSeen();
                incoming.forEach(n => seenIds.current.add(n.id));
                persistSeen(seenIds.current);
                isFirstFetch.current = false;
            } else {
                dispatchPopups(incoming);
            }
        } catch {
            failures.current += 1;
            setIsStale(true);
        } finally {
            setLoading(false);
        }
    }, [dispatchPopups]);

    React.useEffect(() => {
        let cancelled = false;
        const tick = async () => {
            if (cancelled) return;
            if (!document.hidden) await fetchNotifications();
            const backoff = Math.min(POLL_MS * 2 ** failures.current, MAX_BACKOFF_MS);
            timer.current = setTimeout(tick, backoff);
        };
        tick();
        const onVisible = () => { if (!document.hidden) fetchNotifications(); };
        document.addEventListener('visibilitychange', onVisible);
        return () => {
            cancelled = true;
            if (timer.current) clearTimeout(timer.current);
            document.removeEventListener('visibilitychange', onVisible);
        };
    }, [fetchNotifications]);

    const markAllRead = React.useCallback(async () => {
        await api.post('/api/stocks/notifications/mark_all_as_read/');
        setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    }, []);

    const deleteRead = React.useCallback(async () => {
        await api.delete('/api/stocks/notifications/delete_read/');
        setNotifications(prev => prev.filter(n => !n.read));
    }, []);

    const triggerCheck = React.useCallback(async () => {
        try {
            const res = await api.post('/api/stocks/notifications/trigger_check/');
            if (res.data?.status !== 'skipped') await fetchNotifications();
        } catch { /* cooldown or transient failure — next poll covers it */ }
    }, [fetchNotifications]);

    const value: NotificationContextValue = {
        notifications,
        unreadCount: notifications.filter(n => !n.read).length,
        loading,
        isStale,
        refresh: fetchNotifications,
        markRead,
        markAllRead,
        deleteRead,
        triggerCheck,
    };

    return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}
```

- [ ] **Step 2: Mount it in a route-group layout**

Create `frontend/src/app/(authenticated)/layout.tsx`:

```tsx
import { NotificationProvider } from '@/components/notifications/NotificationProvider';

export default function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
    return <NotificationProvider>{children}</NotificationProvider>;
}
```

- [ ] **Step 3: Typecheck + existing tests still green**

Run: `npx tsc --noEmit` (from `frontend/`), then `npm test`
Expected: no type errors; all existing tests pass.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/notifications/NotificationProvider.tsx "frontend/src/app/(authenticated)/layout.tsx"
git commit -m "feat(notifications): centralized polling provider with adaptive popups"
```

---

## Task 10: Frontend — shared `NotificationDetail` component

The dropdown's Dialog and the page's modal currently duplicate detail rendering and both drop metadata (strategies, full metrics). One shared component, fed by the registry.

**Files:**
- Create: `frontend/src/components/notifications/NotificationDetail.tsx`

- [ ] **Step 1: Implement**

Create `frontend/src/components/notifications/NotificationDetail.tsx`:

```tsx
'use client';

import React from 'react';
import { format } from 'date-fns';
import { ExternalLink } from 'lucide-react';
import {
    type AppNotification, buildRoute, getMetrics, getQuickActions,
    getSeverity, getTypeConfig, SEVERITY_DOT, TONE_CLASSES,
} from '@/lib/notifications/config';
import { formatNepaliNumber } from '@/lib/formatters';

interface Props {
    notification: AppNotification;
    onClose: () => void;
    onNavigate: (href: string) => void;
}

export function NotificationDetail({ notification: n, onClose, onNavigate }: Props) {
    const config = getTypeConfig(n.type);
    const tone = TONE_CLASSES[config.tone];
    const severity = getSeverity(n);
    const metrics = getMetrics(n);
    const Icon = config.icon;
    const items: any[] = n.metadata?.items
        ?? (n.metadata?.symbols ?? []).map((s: string) => ({ symbol: s, detail: null, price: null }));
    const strategies: string[] = n.metadata?.strategies ?? [];
    const quickActions = getQuickActions(n);

    return (
        <div className="space-y-5">
            {/* Header */}
            <div className="flex items-start gap-3">
                <span className={`p-2 rounded-md ${tone.icon}`}><Icon size={16} /></span>
                <div className="min-w-0">
                    <div className="flex items-center gap-2">
                        <span className={`h-1.5 w-1.5 rounded-full ${SEVERITY_DOT[severity]}`} />
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                            {n.type.replace(/_/g, ' ')} · {format(new Date(n.created_at), 'dd MMM, HH:mm')}
                        </span>
                    </div>
                    <h3 className="mt-1 text-base font-semibold leading-tight text-foreground">{n.title}</h3>
                </div>
            </div>

            <p className="text-sm leading-relaxed text-muted-foreground">{n.message}</p>

            {/* Metrics strip */}
            {metrics.length > 0 && (
                <div className="flex gap-6 rounded-lg border border-border bg-muted/40 px-4 py-3">
                    {metrics.map(m => (
                        <div key={m.label}>
                            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{m.label}</div>
                            <div className={`text-sm font-semibold tabular-nums ${
                                m.kind === 'percent'
                                    ? m.value >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'
                                    : 'text-foreground'
                            }`}>
                                {m.kind === 'price' && 'Rs. '}
                                {m.kind === 'percent' && m.value >= 0 && '+'}
                                {m.kind === 'price' ? formatNepaliNumber(m.value) : m.value.toFixed(m.kind === 'percent' ? 2 : 1)}
                                {m.kind === 'percent' && '%'}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Strategies (signal alerts) */}
            {strategies.length > 0 && (
                <div>
                    <div className="mb-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">Strategies</div>
                    <div className="flex flex-wrap gap-1.5">
                        {strategies.map(s => (
                            <span key={s} className="rounded border border-border bg-secondary px-1.5 py-0.5 text-[11px] font-medium text-secondary-foreground">
                                {s}
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {/* Symbol breakdown (summaries) */}
            {items.length > 0 && (
                <div className="overflow-hidden rounded-lg border border-border">
                    <div className="max-h-[280px] overflow-y-auto custom-scrollbar">
                        <table className="w-full text-left">
                            <thead className="sticky top-0 border-b border-border bg-muted/60">
                                <tr>
                                    <th className="px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Symbol</th>
                                    <th className="px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Detail</th>
                                    <th className="px-4 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Price</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border/60">
                                {items.map((item, idx) => (
                                    <tr
                                        key={`${item.symbol}-${idx}`}
                                        onClick={() => { onClose(); onNavigate(`/ticker/${item.symbol}`); }}
                                        className="group cursor-pointer transition-colors hover:bg-accent"
                                    >
                                        <td className="px-4 py-2.5">
                                            <span className="flex items-center gap-1.5 text-xs font-semibold text-foreground group-hover:text-primary">
                                                {item.symbol}
                                                <ExternalLink size={10} className="opacity-0 transition-opacity group-hover:opacity-100" />
                                            </span>
                                        </td>
                                        <td className="px-4 py-2.5 text-[11px] text-muted-foreground">{item.detail ?? '—'}</td>
                                        <td className="px-4 py-2.5 text-right text-xs tabular-nums text-foreground">
                                            {item.price != null ? `Rs. ${formatNepaliNumber(item.price)}` : '—'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Footer actions */}
            <div className="flex gap-2 pt-1">
                {(quickActions.length > 0 ? quickActions : [{ label: 'View details', href: buildRoute(n) }]).map((a, i) => (
                    <button
                        key={a.label}
                        onClick={() => { onClose(); onNavigate(a.href); }}
                        className={i === 0
                            ? 'flex-1 rounded-md bg-primary px-4 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90'
                            : 'flex-1 rounded-md border border-border px-4 py-2 text-xs font-medium text-muted-foreground hover:text-foreground'}
                    >
                        {a.label}
                    </button>
                ))}
                <button
                    onClick={onClose}
                    className="flex-1 rounded-md border border-border px-4 py-2 text-xs font-medium text-muted-foreground hover:text-foreground"
                >
                    Dismiss
                </button>
            </div>
        </div>
    );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/notifications/NotificationDetail.tsx
git commit -m "feat(notifications): shared metadata-rich detail component"
```

---

## Task 11: Frontend — refactor `AlertsDropdown` onto provider + registry

Delete its private poller, toast logic, and type maps. Rows get severity dot + ticker chip + key metric. Detail dialog renders `NotificationDetail`.

**Files:**
- Modify: `frontend/src/components/AlertsDropdown.tsx` (full rewrite, currently 460 lines)

- [ ] **Step 1: Rewrite the component**

Replace the entire contents of `frontend/src/components/AlertsDropdown.tsx` with:

```tsx
'use client';

import React from 'react';
import { Bell, RefreshCw } from 'lucide-react';
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { formatDistanceToNow } from 'date-fns';
import { useRouter } from 'next/navigation';
import {
    type AppNotification, type Category, getCategory, getMetrics, getSeverity,
    getTypeConfig, SEVERITY_DOT, TONE_CLASSES,
} from '@/lib/notifications/config';
import { useNotifications } from '@/components/notifications/NotificationProvider';
import { NotificationDetail } from '@/components/notifications/NotificationDetail';
import { formatNepaliNumber } from '@/lib/formatters';

// Dropdown groups the 7 registry categories into 3 tabs.
const TAB_CATEGORIES: Record<string, Category[]> = {
    portfolio: ['portfolio', 'watchlist'],
    signals: ['signals', 'system'],
    market: ['technical', 'broker', 'market'],
};

function AlertRow({ n, onClick }: { n: AppNotification; onClick: () => void }) {
    const config = getTypeConfig(n.type);
    const tone = TONE_CLASSES[config.tone];
    const severity = getSeverity(n);
    const key = getMetrics(n)[0];
    const Icon = config.icon;

    return (
        <div
            onClick={onClick}
            className={`flex cursor-pointer gap-3 border-b border-border/60 px-3.5 py-3 transition-colors hover:bg-accent ${!n.read ? 'bg-primary/[0.04]' : ''}`}
        >
            <span className={`mt-1 p-1.5 rounded-md h-fit ${tone.icon}`}><Icon size={13} /></span>
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${SEVERITY_DOT[severity]}`} />
                    <span className={`truncate text-xs font-semibold ${n.read ? 'text-muted-foreground' : 'text-foreground'}`}>
                        {n.title}
                    </span>
                    <span className="ml-auto shrink-0 text-[10px] tabular-nums text-muted-foreground">
                        {formatDistanceToNow(new Date(n.created_at), { addSuffix: false })}
                    </span>
                </div>
                <p className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">{n.message}</p>
                <div className="mt-1 flex items-center gap-2">
                    {n.ticker && n.ticker !== 'SUMMARY' && (
                        <span className="rounded border border-border bg-secondary px-1.5 text-[10px] font-semibold text-secondary-foreground tabular-nums">
                            {n.ticker}
                        </span>
                    )}
                    {n.ticker === 'SUMMARY' && (
                        <span className="rounded border border-border bg-secondary px-1.5 text-[10px] font-semibold text-secondary-foreground">
                            {n.metadata?.count ?? n.metadata?.symbols?.length ?? 0} assets
                        </span>
                    )}
                    {key && (
                        <span className={`text-[10px] font-semibold tabular-nums ${
                            key.kind === 'percent'
                                ? key.value >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'
                                : 'text-foreground'
                        }`}>
                            {key.kind === 'price' ? `Rs. ${formatNepaliNumber(key.value)}`
                                : key.kind === 'percent' ? `${key.value >= 0 ? '+' : ''}${key.value.toFixed(1)}%`
                                : key.value.toFixed(1)}
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
}

export function AlertsDropdown() {
    const { notifications, unreadCount, isStale, markRead, markAllRead, triggerCheck } = useNotifications();
    const [selected, setSelected] = React.useState<AppNotification | null>(null);
    const router = useRouter();

    const byTab = (tab: string) =>
        notifications.filter(n => TAB_CATEGORIES[tab].includes(getCategory(n.type)));
    const unreadByTab = (tab: string) => byTab(tab).filter(n => !n.read).length;

    const open = (n: AppNotification) => {
        if (!n.read) markRead(n.id);
        setSelected(n);
    };

    const renderList = (tab: string) => {
        const list = byTab(tab);
        if (list.length === 0) {
            return <div className="p-8 text-center text-xs text-muted-foreground">No {tab} alerts</div>;
        }
        return list.map(n => <AlertRow key={n.id} n={n} onClick={() => open(n)} />);
    };

    return (
        <DropdownMenu onOpenChange={(o) => o && triggerCheck()}>
            <DropdownMenuTrigger asChild>
                <button className="relative rounded-full p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground outline-none">
                    <Bell size={18} />
                    {unreadCount > 0 && (
                        <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-semibold text-primary-foreground">
                            {unreadCount > 99 ? '99+' : unreadCount}
                        </span>
                    )}
                    {isStale && <span className="absolute bottom-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-amber-500" />}
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[360px] overflow-hidden rounded-lg border border-border bg-popover p-0 shadow-md">
                <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
                    <DropdownMenuLabel className="flex items-center gap-2 p-0 text-xs font-semibold text-foreground">
                        <Bell size={13} className="text-primary" /> Notifications
                    </DropdownMenuLabel>
                    <button
                        onClick={(e) => { e.stopPropagation(); triggerCheck(); }}
                        className="text-muted-foreground transition-colors hover:text-foreground"
                        aria-label="Check for new alerts"
                    >
                        <RefreshCw size={12} />
                    </button>
                </div>

                <Tabs defaultValue="portfolio" className="w-full">
                    <TabsList className="grid h-9 w-full grid-cols-3 rounded-none border-b border-border bg-muted/50 p-0.5">
                        {Object.keys(TAB_CATEGORIES).map(tab => (
                            <TabsTrigger key={tab} value={tab} className="h-7 text-[11px] font-medium capitalize">
                                {tab}
                                {unreadByTab(tab) > 0 && <span className="ml-1 h-1 w-1 rounded-full bg-primary" />}
                            </TabsTrigger>
                        ))}
                    </TabsList>
                    <div className="max-h-[360px] overflow-y-auto custom-scrollbar">
                        {Object.keys(TAB_CATEGORIES).map(tab => (
                            <TabsContent key={tab} value={tab} className="m-0 focus-visible:ring-0">
                                {renderList(tab)}
                            </TabsContent>
                        ))}
                    </div>
                </Tabs>

                <div className="flex gap-1 border-t border-border bg-muted/40 p-1.5">
                    <button
                        onClick={(e) => { e.stopPropagation(); markAllRead(); }}
                        className="flex-1 rounded-md py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    >
                        Mark all read
                    </button>
                    <button
                        onClick={(e) => { e.stopPropagation(); router.push('/notifications'); }}
                        className="flex-1 rounded-md bg-primary/10 py-1.5 text-[11px] font-medium text-primary transition-colors hover:bg-primary/15"
                    >
                        View all
                    </button>
                </div>
            </DropdownMenuContent>

            <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
                <DialogContent className="sm:max-w-lg">
                    <DialogTitle className="sr-only">{selected?.title ?? 'Notification'}</DialogTitle>
                    {selected && (
                        <NotificationDetail
                            notification={selected}
                            onClose={() => setSelected(null)}
                            onNavigate={(href) => router.push(href)}
                        />
                    )}
                </DialogContent>
            </Dialog>
        </DropdownMenu>
    );
}
```

- [ ] **Step 2: Typecheck and run all frontend tests**

Run: `npx tsc --noEmit && npm test`
Expected: clean typecheck, all tests pass. If `DialogTitle` is not exported from `@/components/ui/dialog`, check the file's exports and import what exists (`DialogHeader`/`DialogTitle` are standard shadcn exports — `AlertsDropdown` previously imported `DialogTitle` successfully, so it exists).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/AlertsDropdown.tsx
git commit -m "refactor(notifications): dropdown consumes provider + registry, enriched rows"
```

---

## Task 12: Frontend — refactor `/notifications` page onto provider + registry

Severity filter uses the real backend field; rows get the enriched treatment; detail modal becomes `NotificationDetail`; local type maps deleted.

**Files:**
- Modify: `frontend/src/app/(authenticated)/notifications/page.tsx` (full rewrite, currently 695 lines)

- [ ] **Step 1: Rewrite the page**

Replace the entire contents of `frontend/src/app/(authenticated)/notifications/page.tsx` with:

```tsx
'use client';

import React, { useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { formatDistanceToNow, format } from 'date-fns';
import { useRouter } from 'next/navigation';
import {
    Bell, AlertCircle, CheckCheck, Filter, Loader2, RefreshCw, Target, Trash2, Info,
} from 'lucide-react';
import {
    type AppNotification, type Category, type Severity, CATEGORIES, getCategory,
    getMetrics, getSeverity, getTypeConfig, SEVERITY_DOT, TONE_CLASSES,
} from '@/lib/notifications/config';
import { useNotifications } from '@/components/notifications/NotificationProvider';
import { NotificationDetail } from '@/components/notifications/NotificationDetail';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { formatNepaliNumber } from '@/lib/formatters';

const SEVERITY_FILTERS: Array<{ key: Severity | 'all'; label: string; icon: React.ReactNode }> = [
    { key: 'all', label: 'All', icon: <Bell size={14} /> },
    { key: 'critical', label: 'Critical', icon: <AlertCircle size={14} /> },
    { key: 'high', label: 'High', icon: <Target size={14} /> },
    { key: 'normal', label: 'Normal', icon: <Info size={14} /> },
    { key: 'low', label: 'Low', icon: <Filter size={14} /> },
];

function groupByDate(list: AppNotification[]): Record<string, AppNotification[]> {
    const grouped: Record<string, AppNotification[]> = {};
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    for (const n of list) {
        const d = new Date(n.created_at);
        const label = d.toDateString() === now.toDateString() ? 'Today'
            : d.toDateString() === yesterday.toDateString() ? 'Yesterday'
            : format(d, 'dd MMM yyyy');
        (grouped[label] ||= []).push(n);
    }
    return grouped;
}

function NotificationRow({ n, onClick }: { n: AppNotification; onClick: () => void }) {
    const config = getTypeConfig(n.type);
    const tone = TONE_CLASSES[config.tone];
    const severity = getSeverity(n);
    const metrics = getMetrics(n);
    const Icon = config.icon;

    return (
        <div
            onClick={onClick}
            className={`relative flex cursor-pointer gap-3.5 rounded-lg border p-4 transition-colors ${
                n.read
                    ? 'border-border bg-card opacity-75 hover:opacity-100'
                    : 'border-primary/20 bg-primary/[0.03] hover:bg-primary/[0.06]'
            }`}
        >
            {!n.read && <span className="absolute right-3.5 top-3.5 h-2 w-2 rounded-full bg-primary" />}
            <span className={`mt-0.5 h-fit rounded-md p-2 ${tone.icon}`}><Icon size={15} /></span>
            <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-start justify-between gap-3 pr-4">
                    <div className="flex items-center gap-2 min-w-0">
                        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${SEVERITY_DOT[severity]}`} />
                        <h4 className={`truncate text-sm font-semibold ${n.read ? 'text-muted-foreground' : 'text-foreground'}`}>
                            {n.title}
                        </h4>
                    </div>
                    <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                        {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                    </span>
                </div>
                <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">{n.message}</p>
                <div className="flex items-center gap-2 pt-0.5">
                    {n.ticker && n.ticker !== 'SUMMARY' && (
                        <span className="rounded border border-border bg-secondary px-1.5 text-[10px] font-semibold text-secondary-foreground tabular-nums">
                            {n.ticker}
                        </span>
                    )}
                    {n.ticker === 'SUMMARY' && (
                        <span className="rounded border border-border bg-secondary px-1.5 text-[10px] font-semibold text-secondary-foreground">
                            {n.metadata?.count ?? n.metadata?.symbols?.length ?? 0} assets
                        </span>
                    )}
                    {metrics.slice(0, 2).map(m => (
                        <span
                            key={m.label}
                            className={`text-[10px] font-semibold tabular-nums ${
                                m.kind === 'percent'
                                    ? m.value >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'
                                    : 'text-muted-foreground'
                            }`}
                        >
                            {m.label}{' '}
                            {m.kind === 'price' ? `Rs. ${formatNepaliNumber(m.value)}`
                                : m.kind === 'percent' ? `${m.value >= 0 ? '+' : ''}${m.value.toFixed(1)}%`
                                : m.value.toFixed(1)}
                        </span>
                    ))}
                    <span className="ml-auto text-[10px] uppercase tracking-wide text-muted-foreground/70">
                        {getCategory(n.type)}
                    </span>
                </div>
            </div>
        </div>
    );
}

export default function AlertsPage() {
    const {
        notifications, loading, markRead, markAllRead, deleteRead, triggerCheck, refresh,
    } = useNotifications();
    const [severity, setSeverity] = useState<Severity | 'all'>('all');
    const [category, setCategory] = useState<Category | 'all'>('all');
    const [unreadOnly, setUnreadOnly] = useState(false);
    const [busy, setBusy] = useState(false);
    const [selected, setSelected] = useState<AppNotification | null>(null);
    const router = useRouter();

    const filtered = notifications.filter(n =>
        (severity === 'all' || getSeverity(n) === severity) &&
        (category === 'all' || getCategory(n.type) === category) &&
        (!unreadOnly || !n.read)
    );
    const unreadCount = filtered.filter(n => !n.read).length;
    const grouped = groupByDate(filtered);

    const run = async (fn: () => Promise<void>) => {
        setBusy(true);
        try { await fn(); } finally { setBusy(false); }
    };

    const open = (n: AppNotification) => {
        if (!n.read) markRead(n.id);
        setSelected(n);
    };

    return (
        <DashboardLayout title="Alerts" subtitle="Position tracking and market monitoring">
            <div className="space-y-5">
                {/* Toolbar */}
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-1 rounded-lg bg-muted p-1">
                        {SEVERITY_FILTERS.map(s => (
                            <button
                                key={s.key}
                                onClick={() => setSeverity(s.key)}
                                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                                    severity === s.key
                                        ? 'bg-card text-foreground shadow-sm'
                                        : 'text-muted-foreground hover:text-foreground'
                                }`}
                            >
                                {s.icon} {s.label}
                                {s.key === 'all' && unreadCount > 0 && (
                                    <span className="rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">
                                        {unreadCount}
                                    </span>
                                )}
                            </button>
                        ))}
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setUnreadOnly(v => !v)}
                            className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                                unreadOnly
                                    ? 'border-primary bg-primary text-primary-foreground'
                                    : 'border-border bg-card text-muted-foreground hover:text-foreground'
                            }`}
                        >
                            <Filter size={12} /> Unread only
                        </button>
                        <button
                            onClick={() => run(async () => { await triggerCheck(); await refresh(); })}
                            disabled={busy}
                            className="flex items-center gap-1.5 rounded-md bg-primary px-3.5 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                        >
                            <RefreshCw size={13} className={busy ? 'animate-spin' : ''} /> Check new alerts
                        </button>
                        {unreadCount > 0 && (
                            <button
                                onClick={() => run(markAllRead)}
                                disabled={busy}
                                className="flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
                            >
                                <CheckCheck size={12} /> Mark all read
                            </button>
                        )}
                        <button
                            onClick={() => run(deleteRead)}
                            disabled={busy}
                            className="flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/5 disabled:opacity-50"
                        >
                            <Trash2 size={12} /> Delete read
                        </button>
                    </div>
                </div>

                {/* Feed + sidebar */}
                <div className="grid grid-cols-1 gap-6 md:grid-cols-12">
                    <div className="space-y-6 md:col-span-8">
                        {loading ? (
                            <div className="flex items-center justify-center py-24">
                                <Loader2 className="animate-spin text-primary" size={26} />
                            </div>
                        ) : filtered.length === 0 ? (
                            <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-border bg-card py-24">
                                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                                    <Bell size={22} className="text-muted-foreground/50" />
                                </div>
                                <p className="text-sm text-muted-foreground">No alerts found</p>
                                {(category !== 'all' || severity !== 'all' || unreadOnly) && (
                                    <button
                                        onClick={() => { setCategory('all'); setSeverity('all'); setUnreadOnly(false); }}
                                        className="text-xs font-medium text-primary hover:underline"
                                    >
                                        Clear all filters
                                    </button>
                                )}
                            </div>
                        ) : (
                            Object.entries(grouped).map(([dateLabel, items]) => (
                                <div key={dateLabel}>
                                    <div className="mb-3 flex items-center gap-3 px-1">
                                        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{dateLabel}</span>
                                        <div className="h-px flex-1 bg-border" />
                                        <span className="text-[10px] tabular-nums text-muted-foreground/60">{items.length}</span>
                                    </div>
                                    <div className="space-y-2">
                                        {items.map(n => <NotificationRow key={n.id} n={n} onClick={() => open(n)} />)}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>

                    <div className="md:col-span-4">
                        <div className="sticky top-5 overflow-hidden rounded-lg border border-border bg-card">
                            <div className="border-b border-border bg-muted/50 px-4 py-2.5">
                                <h3 className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                    <Filter size={12} /> Filter by area
                                </h3>
                            </div>
                            <div className="space-y-0.5 p-2">
                                {[{ key: 'all' as const, label: 'All areas', icon: Bell }, ...CATEGORIES].map(cat => {
                                    const inCat = (n: AppNotification) =>
                                        (cat.key === 'all' || getCategory(n.type) === cat.key) &&
                                        (severity === 'all' || getSeverity(n) === severity);
                                    const count = notifications.filter(inCat).length;
                                    const unread = notifications.filter(n => !n.read && inCat(n)).length;
                                    return (
                                        <button
                                            key={cat.key}
                                            onClick={() => setCategory(cat.key)}
                                            className={`flex w-full items-center justify-between rounded-md p-2 transition-colors ${
                                                category === cat.key
                                                    ? 'bg-primary/10 text-primary'
                                                    : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                                            }`}
                                        >
                                            <span className="flex items-center gap-2.5 text-xs font-medium">
                                                <cat.icon size={14} /> {cat.label}
                                            </span>
                                            <span className="flex items-center gap-1.5">
                                                {unread > 0 && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
                                                <span className="text-[10px] tabular-nums">{count}</span>
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
                <DialogContent className="sm:max-w-lg">
                    <DialogTitle className="sr-only">{selected?.title ?? 'Notification'}</DialogTitle>
                    {selected && (
                        <NotificationDetail
                            notification={selected}
                            onClose={() => setSelected(null)}
                            onNavigate={(href) => router.push(href)}
                        />
                    )}
                </DialogContent>
            </Dialog>
        </DashboardLayout>
    );
}
```

- [ ] **Step 2: Typecheck and run tests**

Run: `npx tsc --noEmit && npm test`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add "frontend/src/app/(authenticated)/notifications/page.tsx"
git commit -m "refactor(notifications): page consumes provider + registry, real severity field"
```

---

## Task 13: Frontend — `WatchlistAlerts` consumes provider

Drop its private 15s notification poll; watchlist prices keep their own fetch.

**Files:**
- Modify: `frontend/src/components/home/WatchlistAlerts.tsx`

- [ ] **Step 1: Refactor**

In `frontend/src/components/home/WatchlistAlerts.tsx`:

1. Add import: `import { useNotifications } from '@/components/notifications/NotificationProvider';`
2. Inside the component, add: `const { notifications, loading: alertsLoading } = useNotifications();` and derive `const alerts = notifications.filter(n => !n.read).slice(0, 5);`
3. Delete the `alerts` useState and the notifications half of the `load()` function — `load` now only fetches `/api/stocks/watchlist/`:

```tsx
    const [watchlist, setWatchlist] = useState<WatchlistRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [failed, setFailed] = useState(false);
    const { notifications } = useNotifications();
    const alerts = notifications.filter(n => !n.read).slice(0, 5);

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            try {
                const res = await api.get('/api/stocks/watchlist/');
                if (cancelled) return;
                setWatchlist(Array.isArray(res.data) ? res.data.slice(0, 8) : []);
                setFailed(false);
            } catch {
                if (!cancelled) setFailed(true);
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        load();
        const interval = setInterval(load, 15000); // watchlist prices stay live
        return () => {
            cancelled = true;
            clearInterval(interval);
        };
    }, []);
```

4. Delete the now-unused `NotificationRow` interface and keep the alert rendering loop as-is (the `alert` objects from the provider have the same shape).

- [ ] **Step 2: Typecheck and run tests**

Run: `npx tsc --noEmit && npm test`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/home/WatchlistAlerts.tsx
git commit -m "refactor(notifications): home card consumes shared provider"
```

---

## Task 14: Full verification + deploy notes

- [ ] **Step 1: Full backend suite**

Run (from `backend/`): `.venv/bin/python -m pytest tests/ -v`
Expected: ALL PASS (including pre-existing suites — `test_chat_briefing.py` and `test_chat_actions_tools.py` touch notification code paths).

- [ ] **Step 2: Full frontend suite + production build**

Run (from `frontend/`): `npm test && npm run build`
Expected: all tests pass; build succeeds with no type errors.

- [ ] **Step 3: Manual smoke test (Docker)**

```bash
docker restart stockastic-backend   # applies migration 0037 on boot
docker restart stockastic-celery
# Frontend changes require an image rebuild (localhost:3000 is Docker-built):
docker compose build frontend && docker compose up -d frontend
```

Then in the browser (hard refresh): seed a test notification and confirm the three popup variants:

```bash
docker exec -it stockastic-backend python manage.py shell -c "
from django.contrib.auth.models import User
from stocks.services.notification_service import create_notification
u = User.objects.filter(is_active=True).first()
create_notification(user=u, notification_type='STOP_LOSS_HIT', title='NABIL Stop-Loss Hit', message='Test popup', ticker='NABIL', metadata={'price': 471.1, 'level': 480.0, 'level_type': 'stop', 'change_pct': -8.2, 'symbol': 'NABIL'})
create_notification(user=u, notification_type='SIGNAL_BUY', title='SHIVM Buy Signal', message='Test line', ticker='SHIVM', metadata={'price': 612.0, 'symbol': 'SHIVM'})
create_notification(user=u, notification_type='DAILY_PLAN_READY', title='Plan ready', message='Test panel', ticker=None, redirect_url='/plan', metadata={'symbols': ['SHIVM','HDHPC','NICA']})
"
```

Verify: card popup with metrics strip (sticky — critical), quiet line (6s), action panel with chips (10s); dismiss marks read (bell badge drops); refresh does not re-toast; `/notifications` severity filter works.

- [ ] **Step 4: Commit any remaining fixes, then final commit**

```bash
git add -A
git commit -m "feat(notifications): rework — severity tiers, metadata contract, adaptive themed popups"
```

---

## Coverage map (spec § → tasks)

| Spec section | Tasks |
|---|---|
| §1 Registry | 6 |
| §2 Severity + metadata contract + API | 1, 2, 3, 4, 5 |
| §3 NotificationProvider | 9, 13 |
| §4 Adaptive popups | 7, 8, 9 |
| §5 Dropdown + page enrichment | 10, 11, 12 |
| §6 Testing | every task (TDD) + 14 |
| §8 Deploy notes | 14 |
