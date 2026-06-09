# Portfolio: Multi-Leg Trade Plans Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persisted multi-leg trade planning tool — create a staged entry plan for a ticker, save it to the database, and execute each leg as a real PortfolioTransaction when the price is reached.

**Architecture:** Two new Django models (`TradePlan` + `TradePlanLeg`) in the existing `stocks` app alongside existing portfolio models. A `TradePlanViewSet` with `execute_leg` and `skip_leg` custom actions wires into the existing `PortfolioService.process_transaction()` so execution is consistent with manual transactions. A new Next.js page at `/portfolio/plans` renders plans in a table with a detail drawer for leg management.

**Tech Stack:** Django REST Framework (ModelViewSet + nested serializer write), pytest-django (TestCase), Next.js 14 App Router, shadcn/ui (Sheet, Dialog, Table, Badge), TailwindCSS, existing `api` axios instance.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `backend/stocks/models/portfolio.py` | Modify | Add `TradePlan`, `TradePlanLeg` models |
| `backend/stocks/models/__init__.py` | Modify | Export new models |
| `backend/stocks/migrations/0025_tradeplan_tradeplanleg.py` | Create (auto) | Migration |
| `backend/stocks/serializers/portfolio.py` | Modify | Add `TradePlanLegSerializer`, `TradePlanSerializer` |
| `backend/stocks/serializers/__init__.py` | Modify | Export new serializers |
| `backend/stocks/views/portfolio.py` | Modify | Add `TradePlanViewSet` + `_check_and_close_plan` helper |
| `backend/stocks/urls.py` | Modify | Register `trade-plans` router |
| `backend/stocks/signals.py` | Modify | Add `pre_delete` signal: reset leg on transaction deletion |
| `backend/tests/unit/test_trade_plans.py` | Create | All unit tests |
| `frontend/src/app/(authenticated)/portfolio/plans/page.tsx` | Create | Plans list page |
| `frontend/src/components/TradePlanDrawer.tsx` | Create | Plan detail drawer + execute/skip modals |
| `frontend/src/components/CreateTradePlanForm.tsx` | Create | Create plan dialog with legs builder |

---

## Task 1: Models — TradePlan + TradePlanLeg

**Files:**
- Modify: `backend/stocks/models/portfolio.py`
- Modify: `backend/stocks/models/__init__.py`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/unit/test_trade_plans.py`:

```python
"""Unit tests for TradePlan + TradePlanLeg models and serializer validation."""
from decimal import Decimal
from django.test import TestCase
from django.contrib.auth.models import User
from stocks.models.portfolio import (
    TradePlan, TradePlanLeg, PortfolioAccount, AccountType,
)


class TradePlanModelTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user('trader', password='pass')
        self.account = PortfolioAccount.objects.create(
            user=self.user, name='Paper', account_type=AccountType.PAPER,
            balance=Decimal('1000000'),
        )

    def test_plan_default_status_is_open(self):
        plan = TradePlan.objects.create(
            user=self.user, ticker='NABIL', risk_budget_pct=Decimal('2.00'),
        )
        assert plan.status == TradePlan.PlanStatus.OPEN

    def test_leg_default_status_is_pending(self):
        plan = TradePlan.objects.create(
            user=self.user, ticker='NABIL', risk_budget_pct=Decimal('2.00'),
        )
        leg = TradePlanLeg.objects.create(
            plan=plan, leg_number=1,
            price_target=Decimal('1200.00'),
            allocation_pct=Decimal('100.00'),
            stop_loss_price=Decimal('1140.00'),
        )
        assert leg.status == TradePlanLeg.LegStatus.PENDING

    def test_legs_ordered_by_leg_number(self):
        plan = TradePlan.objects.create(
            user=self.user, ticker='NABIL', risk_budget_pct=Decimal('2.00'),
        )
        TradePlanLeg.objects.create(plan=plan, leg_number=2, price_target=Decimal('1150.00'), allocation_pct=Decimal('40.00'), stop_loss_price=Decimal('1095.00'))
        TradePlanLeg.objects.create(plan=plan, leg_number=1, price_target=Decimal('1200.00'), allocation_pct=Decimal('60.00'), stop_loss_price=Decimal('1140.00'))
        legs = list(plan.legs.all())
        assert legs[0].leg_number == 1
        assert legs[1].leg_number == 2
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && source .venv/bin/activate
pytest tests/unit/test_trade_plans.py -v
```

Expected: `ImportError: cannot import name 'TradePlan' from 'stocks.models.portfolio'`

- [ ] **Step 3: Add TradePlan and TradePlanLeg to portfolio.py**

Append to the end of `backend/stocks/models/portfolio.py` (after the existing `PortfolioTarget` class):

```python
class TradePlan(models.Model):
    class PlanStatus(models.TextChoices):
        OPEN = 'OPEN', 'Open'
        CLOSED = 'CLOSED', 'Closed'
        CANCELLED = 'CANCELLED', 'Cancelled'

    user = models.ForeignKey(User, on_delete=models.CASCADE)
    account = models.ForeignKey(
        PortfolioAccount, on_delete=models.SET_NULL, null=True, blank=True
    )
    ticker = models.CharField(max_length=10)
    thesis = models.TextField(blank=True, null=True)
    risk_budget_pct = models.DecimalField(max_digits=4, decimal_places=2, default=2.00)
    target_price = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    status = models.CharField(
        max_length=10, choices=PlanStatus.choices, default=PlanStatus.OPEN
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.user.username} - {self.ticker} ({self.status})"


class TradePlanLeg(models.Model):
    class LegStatus(models.TextChoices):
        PENDING = 'PENDING', 'Pending'
        EXECUTED = 'EXECUTED', 'Executed'
        SKIPPED = 'SKIPPED', 'Skipped'

    plan = models.ForeignKey(TradePlan, on_delete=models.CASCADE, related_name='legs')
    leg_number = models.IntegerField()
    price_target = models.DecimalField(max_digits=10, decimal_places=2)
    allocation_pct = models.DecimalField(max_digits=5, decimal_places=2)
    stop_loss_price = models.DecimalField(max_digits=10, decimal_places=2)
    status = models.CharField(
        max_length=10, choices=LegStatus.choices, default=LegStatus.PENDING
    )
    transaction = models.OneToOneField(
        PortfolioTransaction, on_delete=models.SET_NULL, null=True, blank=True
    )
    notes = models.TextField(blank=True, null=True)

    class Meta:
        unique_together = ('plan', 'leg_number')
        ordering = ['leg_number']

    def __str__(self):
        return f"Plan {self.plan_id} Leg {self.leg_number} ({self.status})"
```

- [ ] **Step 4: Export new models from `backend/stocks/models/__init__.py`**

Add `TradePlan, TradePlanLeg` to the portfolio import line:

```python
from .portfolio import (
    PortfolioAccount, PortfolioItem, TransactionType,
    PortfolioTransaction, WatchlistItem, PortfolioSnapshot, PortfolioTarget,
    TradePlan, TradePlanLeg,
)
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
pytest tests/unit/test_trade_plans.py::TradePlanModelTests -v
```

Expected: 3 tests PASS

- [ ] **Step 6: Generate and apply migration**

```bash
python manage.py makemigrations stocks --name tradeplan_tradeplanleg
python manage.py migrate
```

Expected: `Migrations for 'stocks': stocks/migrations/0025_tradeplan_tradeplanleg.py`

- [ ] **Step 7: Commit**

```bash
git add backend/stocks/models/portfolio.py backend/stocks/models/__init__.py backend/stocks/migrations/0025_tradeplan_tradeplanleg.py backend/tests/unit/test_trade_plans.py
git commit -m "feat(models): add TradePlan + TradePlanLeg models"
```

---

## Task 2: Serializers — Nested Write + Validation

**Files:**
- Modify: `backend/stocks/serializers/portfolio.py`
- Modify: `backend/stocks/serializers/__init__.py`

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/unit/test_trade_plans.py`:

```python
from stocks.serializers.portfolio import TradePlanSerializer


class TradePlanSerializerTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user('trader2', password='pass')
        self.account = PortfolioAccount.objects.create(
            user=self.user, name='Paper', account_type=AccountType.PAPER,
            balance=Decimal('1000000'),
        )
        self.valid_data = {
            'ticker': 'NABIL',
            'account': self.account.id,
            'risk_budget_pct': '2.00',
            'legs': [
                {'leg_number': 1, 'price_target': '1200.00', 'allocation_pct': '60.00', 'stop_loss_price': '1140.00'},
                {'leg_number': 2, 'price_target': '1150.00', 'allocation_pct': '40.00', 'stop_loss_price': '1095.00'},
            ],
        }

    def test_valid_data_creates_plan_with_two_legs(self):
        s = TradePlanSerializer(data=self.valid_data)
        assert s.is_valid(), s.errors
        plan = s.save(user=self.user)
        assert TradePlan.objects.filter(id=plan.id).exists()
        assert TradePlanLeg.objects.filter(plan=plan).count() == 2

    def test_allocation_not_100_is_invalid(self):
        data = {**self.valid_data, 'legs': [
            {'leg_number': 1, 'price_target': '1200.00', 'allocation_pct': '50.00', 'stop_loss_price': '1140.00'},
            {'leg_number': 2, 'price_target': '1150.00', 'allocation_pct': '30.00', 'stop_loss_price': '1095.00'},
        ]}
        s = TradePlanSerializer(data=data)
        assert not s.is_valid()
        assert 'legs' in s.errors

    def test_empty_legs_is_invalid(self):
        data = {**self.valid_data, 'legs': []}
        s = TradePlanSerializer(data=data)
        assert not s.is_valid()
        assert 'legs' in s.errors

    def test_stop_loss_above_price_target_is_invalid(self):
        data = {**self.valid_data, 'legs': [
            {'leg_number': 1, 'price_target': '1200.00', 'allocation_pct': '100.00', 'stop_loss_price': '1300.00'},
        ]}
        s = TradePlanSerializer(data=data)
        assert not s.is_valid()

    def test_computed_fields_present_on_retrieve(self):
        s = TradePlanSerializer(data=self.valid_data)
        s.is_valid()
        plan = s.save(user=self.user)
        out = TradePlanSerializer(plan).data
        assert out['total_allocated_pct'] == 100.0
        assert out['total_legs'] == 2
        assert out['executed_legs'] == 0
        assert out['per_leg_risk_pct'] == 1.0  # 2.00 / 2
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pytest tests/unit/test_trade_plans.py::TradePlanSerializerTests -v
```

Expected: `ImportError: cannot import name 'TradePlanSerializer'`

- [ ] **Step 3: Add serializers to `backend/stocks/serializers/portfolio.py`**

Add at the top, extend the existing imports:

```python
from ..models.portfolio import (
    PortfolioAccount, PortfolioItem, PortfolioTransaction,
    WatchlistItem, PortfolioTarget, TradePlan, TradePlanLeg,
)
```

Then append after `PortfolioTargetSerializer`:

```python
class TradePlanLegSerializer(serializers.ModelSerializer):
    class Meta:
        model = TradePlanLeg
        fields = [
            'id', 'leg_number', 'price_target', 'allocation_pct',
            'stop_loss_price', 'status', 'transaction', 'notes',
        ]
        read_only_fields = ['id', 'status', 'transaction']

    def validate(self, data):
        price = data.get('price_target') or (self.instance.price_target if self.instance else None)
        stop = data.get('stop_loss_price') or (self.instance.stop_loss_price if self.instance else None)
        if price and stop and stop >= price:
            raise serializers.ValidationError(
                {'stop_loss_price': 'stop_loss_price must be less than price_target.'}
            )
        return data


class TradePlanSerializer(serializers.ModelSerializer):
    legs = TradePlanLegSerializer(many=True)
    total_allocated_pct = serializers.SerializerMethodField()
    executed_legs = serializers.SerializerMethodField()
    total_legs = serializers.SerializerMethodField()
    per_leg_risk_pct = serializers.SerializerMethodField()

    class Meta:
        model = TradePlan
        fields = [
            'id', 'account', 'ticker', 'thesis', 'risk_budget_pct', 'target_price',
            'status', 'created_at', 'legs',
            'total_allocated_pct', 'executed_legs', 'total_legs', 'per_leg_risk_pct',
        ]
        read_only_fields = ['id', 'status', 'created_at']

    def get_total_allocated_pct(self, obj):
        return float(sum(leg.allocation_pct for leg in obj.legs.all()))

    def get_executed_legs(self, obj):
        return obj.legs.filter(status=TradePlanLeg.LegStatus.EXECUTED).count()

    def get_total_legs(self, obj):
        return obj.legs.count()

    def get_per_leg_risk_pct(self, obj):
        total = obj.legs.count()
        return round(float(obj.risk_budget_pct) / total, 2) if total else 0.0

    def validate(self, data):
        legs_data = data.get('legs', [])
        if not legs_data:
            raise serializers.ValidationError({'legs': 'At least one leg is required.'})
        total_pct = sum(float(leg['allocation_pct']) for leg in legs_data)
        if round(total_pct, 2) != 100.00:
            raise serializers.ValidationError(
                {'legs': f'Leg allocation_pct must sum to 100. Got {total_pct:.2f}.'}
            )
        return data

    def create(self, validated_data):
        legs_data = validated_data.pop('legs')
        plan = TradePlan.objects.create(**validated_data)
        for leg_data in legs_data:
            TradePlanLeg.objects.create(plan=plan, **leg_data)
        return plan
```

- [ ] **Step 4: Export from `backend/stocks/serializers/__init__.py`**

Add `TradePlanSerializer` to the portfolio import line:

```python
from .portfolio import (
    PortfolioAccountSerializer, PortfolioItemSerializer,
    PortfolioTransactionSerializer, WatchlistItemSerializer,
    PortfolioTargetSerializer, TradePlanSerializer,
)
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
pytest tests/unit/test_trade_plans.py::TradePlanSerializerTests -v
```

Expected: 5 tests PASS

- [ ] **Step 6: Commit**

```bash
git add backend/stocks/serializers/portfolio.py backend/stocks/serializers/__init__.py backend/tests/unit/test_trade_plans.py
git commit -m "feat(serializers): TradePlan + TradePlanLeg serializers with nested write validation"
```

---

## Task 3: ViewSet + URL Registration

**Files:**
- Modify: `backend/stocks/views/portfolio.py`
- Modify: `backend/stocks/urls.py`

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/unit/test_trade_plans.py`:

```python
from rest_framework.test import APIClient
from django.urls import reverse
from stocks.models.portfolio import PortfolioTransaction


class TradePlanViewSetTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user('viewuser', password='pass')
        self.client.force_authenticate(user=self.user)
        self.account = PortfolioAccount.objects.create(
            user=self.user, name='Paper', account_type=AccountType.PAPER,
            balance=Decimal('2000000'),
        )
        self.plan = TradePlan.objects.create(
            user=self.user, account=self.account, ticker='NABIL',
            risk_budget_pct=Decimal('2.00'), status=TradePlan.PlanStatus.OPEN,
        )
        self.leg1 = TradePlanLeg.objects.create(
            plan=self.plan, leg_number=1,
            price_target=Decimal('1200.00'), allocation_pct=Decimal('60.00'),
            stop_loss_price=Decimal('1140.00'),
        )
        self.leg2 = TradePlanLeg.objects.create(
            plan=self.plan, leg_number=2,
            price_target=Decimal('1150.00'), allocation_pct=Decimal('40.00'),
            stop_loss_price=Decimal('1095.00'),
        )

    def test_list_returns_user_plans(self):
        res = self.client.get('/api/stocks/trade-plans/')
        assert res.status_code == 200
        assert len(res.data) == 1

    def test_list_filter_by_status(self):
        self.plan.status = TradePlan.PlanStatus.CLOSED
        self.plan.save()
        res = self.client.get('/api/stocks/trade-plans/?status=OPEN')
        assert res.status_code == 200
        assert len(res.data) == 0

    def test_delete_cancels_plan_not_hard_delete(self):
        res = self.client.delete(f'/api/stocks/trade-plans/{self.plan.id}/')
        assert res.status_code == 204
        self.plan.refresh_from_db()
        assert self.plan.status == TradePlan.PlanStatus.CANCELLED

    def test_execute_leg_creates_transaction_and_updates_leg(self):
        res = self.client.post(
            f'/api/stocks/trade-plans/{self.plan.id}/execute_leg/',
            {'leg_id': self.leg1.id, 'rate': '1200.00', 'quantity': 50},
            format='json',
        )
        assert res.status_code == 200
        self.leg1.refresh_from_db()
        assert self.leg1.status == TradePlanLeg.LegStatus.EXECUTED
        assert self.leg1.transaction is not None

    def test_execute_leg_auto_closes_plan_when_all_legs_resolved(self):
        self.client.post(
            f'/api/stocks/trade-plans/{self.plan.id}/execute_leg/',
            {'leg_id': self.leg1.id, 'rate': '1200.00', 'quantity': 50},
            format='json',
        )
        self.client.post(
            f'/api/stocks/trade-plans/{self.plan.id}/skip_leg/',
            {'leg_id': self.leg2.id},
            format='json',
        )
        self.plan.refresh_from_db()
        assert self.plan.status == TradePlan.PlanStatus.CLOSED

    def test_execute_leg_on_closed_plan_returns_400(self):
        self.plan.status = TradePlan.PlanStatus.CLOSED
        self.plan.save()
        res = self.client.post(
            f'/api/stocks/trade-plans/{self.plan.id}/execute_leg/',
            {'leg_id': self.leg1.id, 'rate': '1200.00', 'quantity': 50},
            format='json',
        )
        assert res.status_code == 400

    def test_execute_leg_insufficient_balance_returns_400(self):
        self.account.balance = Decimal('100.00')
        self.account.save()
        res = self.client.post(
            f'/api/stocks/trade-plans/{self.plan.id}/execute_leg/',
            {'leg_id': self.leg1.id, 'rate': '1200.00', 'quantity': 50},
            format='json',
        )
        assert res.status_code == 400

    def test_skip_leg_sets_skipped_status(self):
        res = self.client.post(
            f'/api/stocks/trade-plans/{self.plan.id}/skip_leg/',
            {'leg_id': self.leg1.id},
            format='json',
        )
        assert res.status_code == 200
        self.leg1.refresh_from_db()
        assert self.leg1.status == TradePlanLeg.LegStatus.SKIPPED

    def test_unauthenticated_request_returns_401(self):
        unauth_client = APIClient()
        res = unauth_client.get('/api/stocks/trade-plans/')
        assert res.status_code == 401
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pytest tests/unit/test_trade_plans.py::TradePlanViewSetTests -v
```

Expected: `FAIL` — `Connection refused` or 404, URL not registered yet.

- [ ] **Step 3: Add TradePlanViewSet to `backend/stocks/views/portfolio.py`**

Add these imports at the top of the file (alongside existing imports):

```python
from ..models import (
    PortfolioAccount, PortfolioItem, PortfolioTransaction, PortfolioSnapshot,
    DailyStockPrice, Company, StrategySignal, FinancialReport, TransactionType,
    PortfolioTarget, TradePlan, TradePlanLeg,
)
from ..serializers import (
    PortfolioAccountSerializer, PortfolioItemSerializer,
    PortfolioTransactionSerializer, PortfolioTargetSerializer, TradePlanSerializer,
)
```

Append the following after the `PortfolioPerformanceView` class (at the end of the file):

```python
def _check_and_close_plan(plan):
    """Auto-close the plan if all legs are EXECUTED or SKIPPED."""
    if plan.legs.filter(status=TradePlanLeg.LegStatus.PENDING).count() == 0:
        plan.status = TradePlan.PlanStatus.CLOSED
        plan.save()


class TradePlanViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = TradePlanSerializer
    http_method_names = ['get', 'post', 'patch', 'delete', 'head', 'options']

    def get_queryset(self):
        qs = TradePlan.objects.filter(user=self.request.user).prefetch_related('legs')
        status = self.request.query_params.get('status')
        if status:
            qs = qs.filter(status=status)
        return qs

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    def perform_destroy(self, instance):
        instance.status = TradePlan.PlanStatus.CANCELLED
        instance.save()

    @action(detail=True, methods=['post'])
    def execute_leg(self, request, pk=None):
        from ..services.portfolio_service import PortfolioService
        plan = self.get_object()
        if plan.status != TradePlan.PlanStatus.OPEN:
            return Response(
                {'error': 'Can only execute legs on an OPEN plan.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        leg_id = request.data.get('leg_id')
        rate = request.data.get('rate')
        quantity = request.data.get('quantity')

        if not all([leg_id, rate, quantity]):
            return Response(
                {'error': 'leg_id, rate, and quantity are required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            leg = plan.legs.get(id=leg_id)
        except TradePlanLeg.DoesNotExist:
            return Response({'error': 'Leg not found on this plan.'}, status=status.HTTP_404_NOT_FOUND)

        if leg.status != TradePlanLeg.LegStatus.PENDING:
            return Response(
                {'error': f'Leg is already {leg.status}.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            metrics = PortfolioService.process_transaction(
                user=request.user,
                ticker=plan.ticker,
                txn_type=TransactionType.BUY,
                quantity=int(quantity),
                rate=Decimal(str(rate)),
                account=plan.account,
            )
        except ValueError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

        txn = PortfolioTransaction.objects.create(
            user=request.user,
            account=plan.account,
            ticker=plan.ticker,
            transaction_type=TransactionType.BUY,
            quantity=int(quantity),
            rate=Decimal(str(rate)),
            transaction_date=timezone.now(),
            amount=metrics['amount'],
            commission=metrics['commission'],
            sebon_fee=metrics['sebon_fee'],
            dp_charge=metrics['dp_charge'],
            cgt=metrics['cgt'],
            receivable_amount=metrics['receivable_amount'],
        )

        leg.transaction = txn
        leg.status = TradePlanLeg.LegStatus.EXECUTED
        leg.save()

        _check_and_close_plan(plan)

        rate_deviation = abs(float(rate) - float(leg.price_target)) / float(leg.price_target)
        plan.refresh_from_db()
        response_data = self.get_serializer(plan).data
        if rate_deviation > 0.10:
            response_data['rate_deviation_warning'] = True
        return Response(response_data)

    @action(detail=True, methods=['post'])
    def skip_leg(self, request, pk=None):
        plan = self.get_object()
        if plan.status != TradePlan.PlanStatus.OPEN:
            return Response(
                {'error': 'Can only skip legs on an OPEN plan.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        leg_id = request.data.get('leg_id')
        if not leg_id:
            return Response({'error': 'leg_id is required.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            leg = plan.legs.get(id=leg_id)
        except TradePlanLeg.DoesNotExist:
            return Response({'error': 'Leg not found on this plan.'}, status=status.HTTP_404_NOT_FOUND)

        if leg.status != TradePlanLeg.LegStatus.PENDING:
            return Response(
                {'error': f'Leg is already {leg.status}.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        leg.status = TradePlanLeg.LegStatus.SKIPPED
        leg.save()

        _check_and_close_plan(plan)

        plan.refresh_from_db()
        return Response(self.get_serializer(plan).data)
```

- [ ] **Step 4: Register the viewset in `backend/stocks/urls.py`**

Add the import at the top (inside the existing portfolio import):

```python
from .views import (
    market, portfolio, strategy, broker, pipeline, watchlist,
    notifications, recommendations, chart, fibonacci, floorsheet,
    dividends, risk, sector_rotation, price_forecast, price_action,
    volume_profile, signal_alerts,
)
```

Add to the router registrations (after the existing `portfolio-targets` line):

```python
router.register(r'trade-plans', portfolio.TradePlanViewSet, basename='trade-plans')
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
pytest tests/unit/test_trade_plans.py::TradePlanViewSetTests -v
```

Expected: 9 tests PASS

- [ ] **Step 6: Commit**

```bash
git add backend/stocks/views/portfolio.py backend/stocks/urls.py backend/tests/unit/test_trade_plans.py
git commit -m "feat(api): TradePlanViewSet with execute_leg and skip_leg actions"
```

---

## Task 4: Post-Delete Signal — Reset Leg on Transaction Deletion

**Files:**
- Modify: `backend/stocks/signals.py`

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/unit/test_trade_plans.py`:

```python
class TradePlanSignalTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user('siguser', password='pass')
        self.account = PortfolioAccount.objects.create(
            user=self.user, name='Paper', account_type=AccountType.PAPER,
            balance=Decimal('2000000'),
        )
        self.plan = TradePlan.objects.create(
            user=self.user, account=self.account, ticker='NABIL',
            risk_budget_pct=Decimal('2.00'), status=TradePlan.PlanStatus.OPEN,
        )
        self.leg = TradePlanLeg.objects.create(
            plan=self.plan, leg_number=1,
            price_target=Decimal('1200.00'), allocation_pct=Decimal('100.00'),
            stop_loss_price=Decimal('1140.00'),
        )
        self.txn = PortfolioTransaction.objects.create(
            user=self.user, account=self.account, ticker='NABIL',
            transaction_type='BUY', quantity=50,
            rate=Decimal('1200.00'), transaction_date='2026-06-09T00:00:00Z',
            amount=Decimal('60000.00'), commission=Decimal('300.00'),
            sebon_fee=Decimal('60.00'), dp_charge=Decimal('25.00'),
            cgt=Decimal('0.00'), receivable_amount=Decimal('60385.00'),
        )
        self.leg.transaction = self.txn
        self.leg.status = TradePlanLeg.LegStatus.EXECUTED
        self.leg.save()

    def test_deleting_transaction_resets_leg_to_pending(self):
        self.txn.delete()
        self.leg.refresh_from_db()
        assert self.leg.status == TradePlanLeg.LegStatus.PENDING
        assert self.leg.transaction is None
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pytest tests/unit/test_trade_plans.py::TradePlanSignalTests -v
```

Expected: FAIL — `AssertionError: assert 'EXECUTED' == 'PENDING'`

- [ ] **Step 3: Add the pre_delete signal to `backend/stocks/signals.py`**

Replace the top import block and add the new signal. The full updated file:

```python
from django.db.models.signals import post_save, pre_delete
from django.dispatch import receiver
from .models import FinancialReport, StockFundamental, DailyStockPrice, PortfolioTransaction, TradePlanLeg
from django.db.models import Max
import logging

logger = logging.getLogger(__name__)


@receiver(post_save, sender=FinancialReport)
def sync_financials_to_fundamental(sender, instance, created, **kwargs):
    """
    Signal to update StockFundamental whenever a FinancialReport is saved.
    It checks if the saved report is the LATEST one for the ticker.
    If so, it propagates key metrics (EPS, BV, ROE) to the StockFundamental model.
    """
    ticker = instance.ticker
    logger.info(f"FinancialReport saved for {ticker}. Checking for sync...")

    latest_report = FinancialReport.objects.filter(
        ticker=ticker,
        report_type='ANNUAL'
    ).order_by('-fiscal_year').first()

    if not latest_report:
        return

    try:
        fundamental, _ = StockFundamental.objects.get_or_create(ticker=ticker, defaults={
            'company_name': ticker,
            'sector': 'Unknown'
        })

        has_changes = False

        if latest_report.eps is not None:
            fundamental.eps = latest_report.eps
            has_changes = True

        if latest_report.book_value is not None:
            fundamental.book_value = latest_report.book_value
            has_changes = True

        if latest_report.return_on_equity is not None:
            fundamental.ro_equity = latest_report.return_on_equity
            has_changes = True

        if fundamental.eps and fundamental.eps > 0:
            latest_price = DailyStockPrice.objects.filter(ticker=ticker).order_by('-date').first()
            if latest_price and latest_price.close:
                new_pe = float(latest_price.close) / float(fundamental.eps)
                fundamental.pe_ratio = round(new_pe, 2)
                has_changes = True

        if has_changes:
            fundamental.save()
            logger.info(f"Successfully synced StockFundamental for {ticker} from latest FinancialReport ({latest_report.fiscal_year} Q{latest_report.quarter}).")

    except Exception as e:
        logger.error(f"Error syncing StockFundamental for {ticker}: {e}")


@receiver(pre_delete, sender=PortfolioTransaction)
def reset_trade_plan_leg_on_txn_delete(sender, instance, **kwargs):
    """Before a PortfolioTransaction is deleted, reset any linked TradePlanLeg to PENDING."""
    try:
        leg = TradePlanLeg.objects.get(transaction=instance)
        leg.transaction = None
        leg.status = TradePlanLeg.LegStatus.PENDING
        leg.save()
    except TradePlanLeg.DoesNotExist:
        pass
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pytest tests/unit/test_trade_plans.py::TradePlanSignalTests -v
```

Expected: 1 test PASS

- [ ] **Step 5: Run all trade plan tests together**

```bash
pytest tests/unit/test_trade_plans.py -v
```

Expected: All tests PASS (no regressions from signal change)

- [ ] **Step 6: Commit**

```bash
git add backend/stocks/signals.py backend/tests/unit/test_trade_plans.py
git commit -m "feat(signals): reset TradePlanLeg to PENDING when linked transaction is deleted"
```

---

## Task 5: Frontend — Plans List Page

**Files:**
- Create: `frontend/src/app/(authenticated)/portfolio/plans/page.tsx`

- [ ] **Step 1: Create the plans page**

Create `frontend/src/app/(authenticated)/portfolio/plans/page.tsx`:

```tsx
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, ChevronRight, X, Layers } from 'lucide-react';
import api from '@/lib/api';
import { CreateTradePlanForm } from '@/components/CreateTradePlanForm';
import { TradePlanDrawer } from '@/components/TradePlanDrawer';

export const dynamic = 'force-dynamic';

export type LegStatus = 'PENDING' | 'EXECUTED' | 'SKIPPED';
export type PlanStatus = 'OPEN' | 'CLOSED' | 'CANCELLED';

export interface TradePlanLeg {
  id: number;
  leg_number: number;
  price_target: string;
  allocation_pct: string;
  stop_loss_price: string;
  status: LegStatus;
  transaction: number | null;
  notes: string | null;
}

export interface TradePlan {
  id: number;
  ticker: string;
  account: number | null;
  thesis: string | null;
  risk_budget_pct: string;
  target_price: string | null;
  status: PlanStatus;
  created_at: string;
  legs: TradePlanLeg[];
  total_allocated_pct: number;
  executed_legs: number;
  total_legs: number;
  per_leg_risk_pct: number;
}

const STATUS_COLORS: Record<PlanStatus, string> = {
  OPEN: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
  CLOSED: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400',
  CANCELLED: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
};

export default function TradePlansPage() {
  const [plans, setPlans] = useState<TradePlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('OPEN');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<TradePlan | null>(null);

  const fetchPlans = useCallback(async () => {
    try {
      const params = statusFilter !== 'ALL' ? `?status=${statusFilter}` : '';
      const res = await api.get(`/api/stocks/trade-plans/${params}`);
      setPlans(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { fetchPlans(); }, [fetchPlans]);

  const handleCancel = async (plan: TradePlan) => {
    if (!confirm(`Cancel the plan for ${plan.ticker}?`)) return;
    await api.delete(`/api/stocks/trade-plans/${plan.id}/`);
    fetchPlans();
  };

  const handlePlanUpdated = (updated: TradePlan) => {
    setPlans(prev => prev.map(p => p.id === updated.id ? updated : p));
    setSelectedPlan(updated);
  };

  return (
    <DashboardLayout title="Trade Plans" subtitle="Multi-leg staged entry planning">
      <div className="space-y-6">
        {/* Header bar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-slate-950 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center gap-2">
            {(['OPEN', 'CLOSED', 'CANCELLED', 'ALL'] as const).map(s => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wide transition-colors ${
                  statusFilter === s
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
          <Button onClick={() => setShowCreateForm(true)} className="flex items-center gap-2">
            <Plus className="h-4 w-4" />
            New Trade Plan
          </Button>
        </div>

        {/* Plans table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              {statusFilter === 'ALL' ? 'All Plans' : `${statusFilter} Plans`} — {plans.length} total
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-12 text-slate-400 text-sm">Loading plans…</div>
            ) : plans.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                <Layers className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">No {statusFilter.toLowerCase()} trade plans yet.</p>
                <p className="text-xs mt-1">Create one to plan a staged entry.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs uppercase tracking-wide text-slate-500 border-b border-slate-200 dark:border-slate-800">
                      <th className="text-left py-3 pr-4 font-semibold">Ticker</th>
                      <th className="text-left py-3 pr-4 font-semibold">Progress</th>
                      <th className="text-left py-3 pr-4 font-semibold">Risk budget</th>
                      <th className="text-left py-3 pr-4 font-semibold">Status</th>
                      <th className="text-left py-3 pr-4 font-semibold">Thesis</th>
                      <th className="text-left py-3 pr-4 font-semibold">Created</th>
                      <th className="text-right py-3 font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plans.map(plan => (
                      <tr
                        key={plan.id}
                        className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900/50 cursor-pointer"
                        onClick={() => setSelectedPlan(plan)}
                      >
                        <td className="py-3 pr-4 font-bold text-slate-900 dark:text-slate-100">
                          {plan.ticker}
                        </td>
                        <td className="py-3 pr-4 text-slate-600 dark:text-slate-400">
                          {plan.executed_legs} / {plan.total_legs} legs
                        </td>
                        <td className="py-3 pr-4 text-slate-600 dark:text-slate-400">
                          {plan.risk_budget_pct}%
                        </td>
                        <td className="py-3 pr-4">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_COLORS[plan.status]}`}>
                            {plan.status}
                          </span>
                        </td>
                        <td className="py-3 pr-4 text-slate-500 max-w-[200px] truncate">
                          {plan.thesis || '—'}
                        </td>
                        <td className="py-3 pr-4 text-slate-500 text-xs">
                          {new Date(plan.created_at).toLocaleDateString()}
                        </td>
                        <td className="py-3 text-right">
                          <div className="flex items-center justify-end gap-2" onClick={e => e.stopPropagation()}>
                            <Button variant="ghost" size="sm" onClick={() => setSelectedPlan(plan)}>
                              <ChevronRight className="h-4 w-4" />
                            </Button>
                            {plan.status === 'OPEN' && (
                              <Button variant="ghost" size="sm" onClick={() => handleCancel(plan)}
                                className="text-red-500 hover:text-red-700">
                                <X className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {showCreateForm && (
        <CreateTradePlanForm
          onClose={() => setShowCreateForm(false)}
          onCreated={() => { setShowCreateForm(false); fetchPlans(); }}
        />
      )}

      {selectedPlan && (
        <TradePlanDrawer
          plan={selectedPlan}
          onClose={() => setSelectedPlan(null)}
          onUpdated={handlePlanUpdated}
        />
      )}
    </DashboardLayout>
  );
}
```

- [ ] **Step 2: Start the dev server and verify the page loads**

```bash
cd frontend && npm run dev
```

Navigate to `http://localhost:3000/portfolio/plans`. Expected: page loads with empty state ("No open trade plans yet"), no console errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/\(authenticated\)/portfolio/plans/page.tsx
git commit -m "feat(frontend): trade plans list page with status filter"
```

---

## Task 6: Frontend — Plan Detail Drawer

**Files:**
- Create: `frontend/src/components/TradePlanDrawer.tsx`

- [ ] **Step 1: Create the drawer component**

Create `frontend/src/components/TradePlanDrawer.tsx`:

```tsx
'use client';

import React, { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { AlertTriangle, Play, SkipForward } from 'lucide-react';
import api from '@/lib/api';
import { TradePlan, TradePlanLeg, LegStatus } from '@/app/(authenticated)/portfolio/plans/page';

interface Props {
  plan: TradePlan;
  onClose: () => void;
  onUpdated: (plan: TradePlan) => void;
}

const LEG_BADGE: Record<LegStatus, string> = {
  PENDING: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  EXECUTED: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
  SKIPPED: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
};

function calcRR(leg: TradePlanLeg, targetPrice: string | null): string {
  if (!targetPrice) return '—';
  const entry = parseFloat(leg.price_target);
  const stop = parseFloat(leg.stop_loss_price);
  const target = parseFloat(targetPrice);
  if (entry <= stop || target <= entry) return '—';
  const ratio = (target - entry) / (entry - stop);
  return `1:${ratio.toFixed(1)}`;
}

export function TradePlanDrawer({ plan, onClose, onUpdated }: Props) {
  const [executingLeg, setExecutingLeg] = useState<TradePlanLeg | null>(null);
  const [execRate, setExecRate] = useState('');
  const [execQty, setExecQty] = useState('');
  const [execLoading, setExecLoading] = useState(false);
  const [execError, setExecError] = useState('');
  const [skipLoading, setSkipLoading] = useState<number | null>(null);

  const openExecuteModal = (leg: TradePlanLeg) => {
    setExecutingLeg(leg);
    setExecRate(leg.price_target);
    // Suggested quantity: can't compute without account balance here; leave blank for user to fill
    setExecQty('');
    setExecError('');
  };

  const handleExecute = async () => {
    if (!executingLeg) return;
    setExecLoading(true);
    setExecError('');
    try {
      const res = await api.post(`/api/stocks/trade-plans/${plan.id}/execute_leg/`, {
        leg_id: executingLeg.id,
        rate: parseFloat(execRate),
        quantity: parseInt(execQty),
      });
      onUpdated(res.data);
      setExecutingLeg(null);
    } catch (err: any) {
      setExecError(err.response?.data?.error || 'Execution failed.');
    } finally {
      setExecLoading(false);
    }
  };

  const handleSkip = async (leg: TradePlanLeg) => {
    setSkipLoading(leg.id);
    try {
      const res = await api.post(`/api/stocks/trade-plans/${plan.id}/skip_leg/`, { leg_id: leg.id });
      onUpdated(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setSkipLoading(null);
    }
  };

  const totalCommitted = plan.legs
    .filter(l => l.status === 'EXECUTED')
    .reduce((sum, l) => sum + parseFloat(l.price_target) * (parseFloat(l.allocation_pct) / 100), 0);

  return (
    <>
      <Sheet open onOpenChange={open => !open && onClose()}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader className="mb-6">
            <SheetTitle className="text-xl font-bold">
              {plan.ticker}
              <span className="ml-3 text-sm font-normal text-slate-500">Trade Plan</span>
            </SheetTitle>
            {plan.thesis && (
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">{plan.thesis}</p>
            )}
            <div className="flex gap-4 text-xs text-slate-500 mt-2">
              <span>Risk budget: <strong className="text-slate-800 dark:text-slate-200">{plan.risk_budget_pct}%</strong></span>
              {plan.target_price && <span>Target: <strong className="text-emerald-600">Rs. {parseFloat(plan.target_price).toLocaleString()}</strong></span>}
              <span>Progress: <strong className="text-slate-800 dark:text-slate-200">{plan.executed_legs} / {plan.total_legs} executed</strong></span>
            </div>
          </SheetHeader>

          {/* Legs table */}
          <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-900">
                <tr className="text-xs uppercase tracking-wide text-slate-500">
                  <th className="text-left p-3 font-semibold">Leg</th>
                  <th className="text-right p-3 font-semibold">Entry target</th>
                  <th className="text-right p-3 font-semibold">Allocation</th>
                  <th className="text-right p-3 font-semibold">Stop loss</th>
                  <th className="text-right p-3 font-semibold">R/R</th>
                  <th className="text-center p-3 font-semibold">Status</th>
                  <th className="text-right p-3 font-semibold">Action</th>
                </tr>
              </thead>
              <tbody>
                {plan.legs.map(leg => (
                  <tr key={leg.id} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="p-3 font-semibold text-slate-700 dark:text-slate-300">#{leg.leg_number}</td>
                    <td className="p-3 text-right font-mono text-slate-800 dark:text-slate-200">
                      Rs. {parseFloat(leg.price_target).toLocaleString()}
                    </td>
                    <td className="p-3 text-right text-slate-600 dark:text-slate-400">{leg.allocation_pct}%</td>
                    <td className="p-3 text-right text-red-600 font-mono text-xs">
                      Rs. {parseFloat(leg.stop_loss_price).toLocaleString()}
                    </td>
                    <td className="p-3 text-right text-slate-500 text-xs">{calcRR(leg, plan.target_price)}</td>
                    <td className="p-3 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${LEG_BADGE[leg.status]}`}>
                        {leg.status}
                      </span>
                    </td>
                    <td className="p-3 text-right">
                      {leg.status === 'PENDING' && plan.status === 'OPEN' && (
                        <div className="flex items-center justify-end gap-1">
                          <Button size="sm" variant="outline" className="h-7 text-xs gap-1"
                            onClick={() => openExecuteModal(leg)}>
                            <Play className="h-3 w-3" /> Execute
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 text-xs gap-1 text-slate-400"
                            disabled={skipLoading === leg.id}
                            onClick={() => handleSkip(leg)}>
                            <SkipForward className="h-3 w-3" /> Skip
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Summary bar */}
          <div className="mt-4 p-4 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm flex gap-6">
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wide">Committed value</p>
              <p className="font-bold text-slate-800 dark:text-slate-200">Rs. {totalCommitted.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wide">Remaining legs</p>
              <p className="font-bold text-slate-800 dark:text-slate-200">
                {plan.legs.filter(l => l.status === 'PENDING').length}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wide">Per-leg risk</p>
              <p className="font-bold text-slate-800 dark:text-slate-200">{plan.per_leg_risk_pct}%</p>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Execute leg modal */}
      {executingLeg && (
        <Dialog open onOpenChange={open => !open && setExecutingLeg(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Execute Leg #{executingLeg.leg_number} — {plan.ticker}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1">
                  Execution rate (Rs.)
                </label>
                <Input
                  type="number"
                  value={execRate}
                  onChange={e => setExecRate(e.target.value)}
                  placeholder={executingLeg.price_target}
                />
                {execRate && Math.abs(parseFloat(execRate) - parseFloat(executingLeg.price_target)) / parseFloat(executingLeg.price_target) > 0.10 && (
                  <p className="text-xs text-amber-600 flex items-center gap-1 mt-1">
                    <AlertTriangle className="h-3 w-3" />
                    Rate deviates &gt;10% from planned target ({executingLeg.price_target})
                  </p>
                )}
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1">
                  Quantity (shares)
                </label>
                <Input
                  type="number"
                  value={execQty}
                  onChange={e => setExecQty(e.target.value)}
                  placeholder="e.g. 50"
                />
              </div>
              {execError && (
                <p className="text-sm text-red-600 bg-red-50 dark:bg-red-900/20 p-2 rounded">{execError}</p>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setExecutingLeg(null)}>Cancel</Button>
              <Button
                onClick={handleExecute}
                disabled={execLoading || !execRate || !execQty}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {execLoading ? 'Executing…' : 'Confirm execution'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
```

- [ ] **Step 2: Verify the drawer opens and legs display correctly**

In the browser at `http://localhost:3000/portfolio/plans`: click a plan row. Drawer should open showing the legs table. If no plans exist, create one via the API directly:

```bash
curl -X POST http://localhost:8000/api/stocks/trade-plans/ \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <your-token>" \
  -d '{"ticker":"NABIL","risk_budget_pct":"2.00","legs":[{"leg_number":1,"price_target":"1200.00","allocation_pct":"60.00","stop_loss_price":"1140.00"},{"leg_number":2,"price_target":"1150.00","allocation_pct":"40.00","stop_loss_price":"1095.00"}]}'
```

Expected: Drawer opens, legs table renders with Execute and Skip buttons on PENDING legs.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/TradePlanDrawer.tsx
git commit -m "feat(frontend): TradePlanDrawer with legs table and execute/skip modals"
```

---

## Task 7: Frontend — Create Trade Plan Form

**Files:**
- Create: `frontend/src/components/CreateTradePlanForm.tsx`

- [ ] **Step 1: Create the component**

Create `frontend/src/components/CreateTradePlanForm.tsx`:

```tsx
'use client';

import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Trash2, AlertCircle } from 'lucide-react';
import api from '@/lib/api';
import { CompanySelect } from '@/components/CompanySelect';

interface LegInput {
  leg_number: number;
  price_target: string;
  allocation_pct: string;
  stop_loss_price: string;
}

interface Props {
  onClose: () => void;
  onCreated: () => void;
}

export function CreateTradePlanForm({ onClose, onCreated }: Props) {
  const [ticker, setTicker] = useState('');
  const [accountId, setAccountId] = useState<string>('');
  const [riskBudget, setRiskBudget] = useState('2.00');
  const [targetPrice, setTargetPrice] = useState('');
  const [thesis, setThesis] = useState('');
  const [legs, setLegs] = useState<LegInput[]>([
    { leg_number: 1, price_target: '', allocation_pct: '', stop_loss_price: '' },
  ]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/api/stocks/accounts/').then(r => setAccounts(r.data)).catch(() => {});
  }, []);

  const totalAllocation = legs.reduce((sum, l) => sum + (parseFloat(l.allocation_pct) || 0), 0);
  const allocationValid = Math.abs(totalAllocation - 100) < 0.01;

  const addLeg = () => {
    if (legs.length >= 5) return;
    setLegs(prev => [...prev, { leg_number: prev.length + 1, price_target: '', allocation_pct: '', stop_loss_price: '' }]);
  };

  const removeLeg = (index: number) => {
    setLegs(prev => prev.filter((_, i) => i !== index).map((l, i) => ({ ...l, leg_number: i + 1 })));
  };

  const updateLeg = (index: number, field: keyof LegInput, value: string) => {
    setLegs(prev => prev.map((l, i) => i === index ? { ...l, [field]: value } : l));
  };

  const handleSubmit = async () => {
    setError('');
    if (!ticker) { setError('Ticker is required.'); return; }
    if (!allocationValid) { setError(`Leg allocations must sum to 100%. Current total: ${totalAllocation.toFixed(2)}%`); return; }

    const hasInvalidStopLoss = legs.some(l =>
      l.stop_loss_price && l.price_target && parseFloat(l.stop_loss_price) >= parseFloat(l.price_target)
    );
    if (hasInvalidStopLoss) { setError('Stop loss must be below price target for each leg.'); return; }

    setLoading(true);
    try {
      await api.post('/api/stocks/trade-plans/', {
        ticker,
        account: accountId || null,
        risk_budget_pct: riskBudget,
        target_price: targetPrice || null,
        thesis: thesis || null,
        legs: legs.map(l => ({
          leg_number: l.leg_number,
          price_target: l.price_target,
          allocation_pct: l.allocation_pct,
          stop_loss_price: l.stop_loss_price,
        })),
      });
      onCreated();
    } catch (err: any) {
      const data = err.response?.data;
      if (data?.legs) setError(Array.isArray(data.legs) ? data.legs[0] : JSON.stringify(data.legs));
      else if (data?.error) setError(data.error);
      else setError('Failed to create plan. Please check your inputs.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open onOpenChange={open => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New Trade Plan</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Ticker + Account row */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1">Ticker *</label>
              <CompanySelect value={ticker} onChange={setTicker} placeholder="Search symbol…" />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1">Account</label>
              <select
                value={accountId}
                onChange={e => setAccountId(e.target.value)}
                className="w-full bg-white dark:bg-card border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              >
                <option value="">No account</option>
                {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
          </div>

          {/* Risk budget + Target price row */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1">Risk budget (%)</label>
              <Input type="number" step="0.1" value={riskBudget} onChange={e => setRiskBudget(e.target.value)} placeholder="2.00" />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1">Target price (optional, for R/R)</label>
              <Input type="number" value={targetPrice} onChange={e => setTargetPrice(e.target.value)} placeholder="e.g. 1400" />
            </div>
          </div>

          {/* Thesis */}
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1">Thesis (optional)</label>
            <textarea
              value={thesis}
              onChange={e => setThesis(e.target.value)}
              rows={2}
              placeholder="Why are you entering this trade?"
              className="w-full bg-white dark:bg-card border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 resize-none"
            />
          </div>

          {/* Legs */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Legs
                <span className={`ml-2 text-xs font-bold ${allocationValid ? 'text-emerald-600' : 'text-amber-600'}`}>
                  {totalAllocation.toFixed(1)}% / 100%
                </span>
              </label>
              {legs.length < 5 && (
                <Button variant="outline" size="sm" onClick={addLeg} className="h-7 text-xs gap-1">
                  <Plus className="h-3 w-3" /> Add leg
                </Button>
              )}
            </div>

            <div className="space-y-2">
              <div className="grid grid-cols-[32px_1fr_1fr_1fr_32px] gap-2 text-xs text-slate-400 uppercase tracking-wide px-2">
                <span>#</span><span>Entry price</span><span>Allocation %</span><span>Stop loss</span><span />
              </div>
              {legs.map((leg, i) => (
                <div key={i} className="grid grid-cols-[32px_1fr_1fr_1fr_32px] gap-2 items-center">
                  <span className="text-xs text-slate-500 font-bold text-center">{leg.leg_number}</span>
                  <Input type="number" value={leg.price_target} onChange={e => updateLeg(i, 'price_target', e.target.value)} placeholder="1200.00" />
                  <Input type="number" value={leg.allocation_pct} onChange={e => updateLeg(i, 'allocation_pct', e.target.value)} placeholder="40" />
                  <Input type="number" value={leg.stop_loss_price} onChange={e => updateLeg(i, 'stop_loss_price', e.target.value)} placeholder="1140.00" />
                  <button onClick={() => removeLeg(i)} disabled={legs.length === 1} className="text-slate-400 hover:text-red-500 disabled:opacity-20">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 dark:bg-red-900/20 p-3 rounded-lg">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={handleSubmit}
            disabled={loading || !ticker || !allocationValid}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {loading ? 'Creating…' : 'Create plan'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Test the create flow end-to-end in the browser**

At `http://localhost:3000/portfolio/plans`:
1. Click "New Trade Plan"
2. Select a ticker (e.g. NABIL)
3. Add two legs: Leg 1 at 1200, 60%, stop 1140 — Leg 2 at 1150, 40%, stop 1095
4. The allocation counter should show "100.0% / 100%"
5. Click "Create plan"
6. Expected: dialog closes, plan appears in the list
7. Test validation: try submitting with allocations summing to 80% → error message shown
8. Test stop loss validation: enter stop loss above entry price → error shown

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/CreateTradePlanForm.tsx
git commit -m "feat(frontend): CreateTradePlanForm with legs builder and live allocation validation"
```

---

## Self-Review Checklist

After all tasks are complete, verify:

- [ ] `pytest backend/tests/unit/test_trade_plans.py -v` — all tests pass
- [ ] `GET /api/stocks/trade-plans/?status=OPEN` returns only OPEN plans
- [ ] `POST /api/stocks/trade-plans/` with legs not summing to 100 returns 400
- [ ] `POST /api/stocks/trade-plans/{id}/execute_leg/` on a PAPER account deducts balance and creates PortfolioTransaction
- [ ] `DELETE /api/stocks/trade-plans/{id}/` sets status=CANCELLED, does not delete the DB row
- [ ] Deleting a PortfolioTransaction that was linked to a leg resets the leg to PENDING
- [ ] Plans list page filters work (OPEN / CLOSED / CANCELLED / ALL)
- [ ] Drawer R/R column shows "—" when no target_price set, shows ratio when set
- [ ] Execute modal pre-fills rate from price_target, shows warning when rate deviates >10%
