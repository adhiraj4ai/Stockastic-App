# Portfolio Manager (Chat) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a chat `portfolio-manager` subagent that proposes itemized portfolio actions (trades, stops/targets, rebalance, trade plans) the user confirms with one tap, executing deterministically against existing backend services.

**Architecture:** A new `PortfolioActionDraft` model persists each proposed action as a self-contained JSON payload. `propose_*` MCP tools (read + compute only) create drafts and emit a `proposal` card. A `confirm_draft` service replays the saved payload through `PortfolioService` / serializers inside a transaction; a thin REST viewset exposes `confirm`/`cancel`. The frontend `ProposalCard` calls those endpoints. The read-only `portfolio-advisor` is untouched.

**Tech Stack:** Django + DRF, Claude Agent SDK (`@tool`, `create_sdk_mcp_server`), pytest (`DJANGO_SETTINGS_MODULE=stockastic.settings`), Next.js + React + Axios (`@/lib/api`), Docker (`stockastic-backend` live-mounted; `stockastic-frontend` baked image).

**Conventions established by the codebase (do not deviate):**
- Tests run inside the container: `docker exec stockastic-backend pytest <path> -v`.
- Test fixtures (in `backend/tests/conftest.py`): `auth_client` (force-authenticated `testuser`), `create_user`, `api_client`, `db`.
- MCP tools live in `backend/chat/tools.py`; register every new tool in the `ALL_TOOLS` list (line ~2189) and expose to a subagent via `tool_id("name")` in `backend/chat/subagents.py`.
- SDK `@tool` arg schemas accept `dict` and `list` types (see existing `draft_strategy`, which takes `{"spec": dict}`).
- Cards are pushed via `push_card(tool_name, {"type": ..., "data": ...})` and rendered by `frontend/src/components/chat/gen-ui/GenUIRegistry.tsx`.
- **Migrations are gitignored** in this repo — every migration must be regenerated with `makemigrations` per environment; it will NOT travel in git. Each model task includes the makemigrations step.
- Fee helpers live in `backend/stocks/utils.py`: `calculate_broker_commission(amount)`, `calculate_sebon_fee(amount)`, `calculate_dp_charge()`, `calculate_cgt(profit, is_long_term=False)`.

**Branch:** Create a feature branch from `main` before starting:
```bash
git checkout main && git pull && git checkout -b feat/portfolio-manager-chat
```

---

## File Structure

**Backend — create:**
- `backend/stocks/services/portfolio_drafts.py` — draft creation + `confirm_draft` executor (all four kinds). Single source of execution truth.
- `backend/chat/prompts/portfolio_manager.yaml` — manager system + initial prompt.
- `backend/tests/unit/test_portfolio_drafts.py` — service-level tests (create + confirm, all kinds, gate invariants).
- `backend/tests/unit/test_propose_tools.py` — propose-tool draft-shape tests.
- `backend/tests/integration/test_portfolio_drafts_api.py` — confirm/cancel endpoint tests.

**Backend — modify:**
- `backend/stocks/models/portfolio.py` — append `PortfolioActionDraft` model.
- `backend/stocks/views/portfolio.py` — append `PortfolioActionDraftViewSet`.
- `backend/stocks/urls.py` — register the viewset.
- `backend/stocks/serializers/portfolio.py` — append `PortfolioActionDraftSerializer`.
- `backend/chat/tools.py` — add `propose_trade`, `propose_exits`, `propose_rebalance`, `propose_trade_plan`, a `_trade_preview` helper, a `_score_candidates` helper; register all four in `ALL_TOOLS`.
- `backend/chat/subagents.py` — add `PORTFOLIO_MANAGER` AgentDefinition; register `"portfolio-manager"` in `AGENTS`.
- `backend/chat/prompts/orchestrator.yaml` — add routing for the manager.

**Frontend — create:**
- `frontend/src/components/chat/gen-ui/ProposalCard.tsx` — confirmable card.

**Frontend — modify:**
- `frontend/src/components/chat/gen-ui/GenUIRegistry.tsx` — register `case 'proposal'`.

---

# PHASE A — Draft/confirm gate + first action (`propose_trade`)

## Task 1: `PortfolioActionDraft` model

**Files:**
- Modify: `backend/stocks/models/portfolio.py` (append at end of file)
- Test: `backend/tests/unit/test_portfolio_drafts.py`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/unit/test_portfolio_drafts.py`:
```python
"""Unit tests for PortfolioActionDraft model + confirm_draft service."""
import pytest
from datetime import timedelta
from decimal import Decimal

from django.utils import timezone

from stocks.models.portfolio import (
    PortfolioActionDraft, PortfolioAccount, PortfolioItem,
    PortfolioTransaction, PortfolioTarget, TransactionType,
)


@pytest.mark.django_db
class TestPortfolioActionDraftModel:
    def test_defaults_to_pending(self, create_user):
        user = create_user(username="u1", password="p")
        d = PortfolioActionDraft.objects.create(
            user=user, kind=PortfolioActionDraft.Kind.TRADE,
            title="Buy 10 NABIL", payload={}, preview={},
            expires_at=timezone.now() + timedelta(hours=1),
        )
        assert d.status == PortfolioActionDraft.Status.PENDING
        assert d.is_expired is False

    def test_is_expired_true_after_expiry(self, create_user):
        user = create_user(username="u2", password="p")
        d = PortfolioActionDraft.objects.create(
            user=user, kind=PortfolioActionDraft.Kind.TRADE,
            title="x", payload={}, preview={},
            expires_at=timezone.now() - timedelta(seconds=1),
        )
        assert d.is_expired is True
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker exec stockastic-backend pytest tests/unit/test_portfolio_drafts.py::TestPortfolioActionDraftModel -v`
Expected: FAIL — `ImportError: cannot import name 'PortfolioActionDraft'`.

- [ ] **Step 3: Append the model**

At the end of `backend/stocks/models/portfolio.py`:
```python
class PortfolioActionDraft(models.Model):
    """A proposed portfolio action awaiting explicit user confirmation.

    Created by the chat portfolio-manager's propose_* tools. `payload` is the
    self-contained, exact execution contract consumed by
    stocks.services.portfolio_drafts.confirm_draft — the executor never
    re-derives anything from the model.
    """

    class Kind(models.TextChoices):
        TRADE = 'TRADE', 'Trade'
        EXITS = 'EXITS', 'Exits'
        REBALANCE = 'REBALANCE', 'Rebalance'
        TRADE_PLAN = 'TRADE_PLAN', 'Trade Plan'

    class Status(models.TextChoices):
        PENDING = 'PENDING', 'Pending'
        CONFIRMED = 'CONFIRMED', 'Confirmed'
        CANCELLED = 'CANCELLED', 'Cancelled'
        EXPIRED = 'EXPIRED', 'Expired'

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='action_drafts')
    account = models.ForeignKey(PortfolioAccount, on_delete=models.SET_NULL, null=True, blank=True)
    kind = models.CharField(max_length=12, choices=Kind.choices)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING)
    title = models.CharField(max_length=255, default='')
    payload = models.JSONField(default=dict)
    preview = models.JSONField(default=dict)
    result = models.JSONField(default=dict, blank=True)
    expires_at = models.DateTimeField()
    created_at = models.DateTimeField(auto_now_add=True)
    confirmed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']

    @property
    def is_expired(self):
        from django.utils import timezone
        return timezone.now() >= self.expires_at

    def __str__(self):
        return f"{self.user.username} - {self.kind} - {self.status}"
```

- [ ] **Step 4: Make and apply the migration**

Run:
```bash
docker exec stockastic-backend python manage.py makemigrations stocks
docker exec stockastic-backend python manage.py migrate stocks
```
Expected: a new migration `00NN_portfolioactiondraft.py` created and applied. (It is gitignored — do not attempt to `git add` it.)

- [ ] **Step 5: Run test to verify it passes**

Run: `docker exec stockastic-backend pytest tests/unit/test_portfolio_drafts.py::TestPortfolioActionDraftModel -v`
Expected: PASS (2 passed).

- [ ] **Step 6: Commit**

```bash
git add backend/stocks/models/portfolio.py backend/tests/unit/test_portfolio_drafts.py
git commit -m "feat(portfolio): PortfolioActionDraft model for chat propose-then-confirm"
```

---

## Task 2: `confirm_draft` service — TRADE kind + gate invariants

**Files:**
- Create: `backend/stocks/services/portfolio_drafts.py`
- Test: `backend/tests/unit/test_portfolio_drafts.py` (append)

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/unit/test_portfolio_drafts.py`:
```python
from stocks.services.portfolio_drafts import (
    confirm_draft, create_draft, default_expiry, DraftError,
)


def _paper_account(user):
    return PortfolioAccount.objects.create(
        user=user, name="Paper", account_type="PAPER", balance=Decimal("1000000.00"),
    )


@pytest.mark.django_db
class TestConfirmTrade:
    def test_buy_executes_and_records_transaction(self, create_user):
        user = create_user(username="b1", password="p")
        acct = _paper_account(user)
        draft = create_draft(
            user=user, account=acct, kind=PortfolioActionDraft.Kind.TRADE,
            title="Buy 10 NABIL @ 500",
            payload={"trades": [{"ticker": "NABIL", "txn_type": "BUY", "quantity": 10, "rate": 500.0}]},
            preview={},
        )
        result = confirm_draft(draft)
        draft.refresh_from_db()
        assert draft.status == PortfolioActionDraft.Status.CONFIRMED
        assert len(result["transaction_ids"]) == 1
        assert PortfolioTransaction.objects.filter(user=user, ticker="NABIL").count() == 1
        assert PortfolioItem.objects.get(user=user, ticker="NABIL", account=acct).quantity == 10

    def test_confirm_is_idempotent(self, create_user):
        user = create_user(username="b2", password="p")
        acct = _paper_account(user)
        draft = create_draft(
            user=user, account=acct, kind=PortfolioActionDraft.Kind.TRADE,
            title="Buy 10 NABIL",
            payload={"trades": [{"ticker": "NABIL", "txn_type": "BUY", "quantity": 10, "rate": 500.0}]},
            preview={},
        )
        first = confirm_draft(draft)
        second = confirm_draft(draft)
        assert first == second
        assert PortfolioTransaction.objects.filter(user=user, ticker="NABIL").count() == 1

    def test_expired_draft_rejected(self, create_user):
        user = create_user(username="b3", password="p")
        draft = create_draft(
            user=user, account=None, kind=PortfolioActionDraft.Kind.TRADE,
            title="x", payload={"trades": []}, preview={},
        )
        draft.expires_at = timezone.now() - timedelta(seconds=1)
        draft.save(update_fields=["expires_at"])
        with pytest.raises(DraftError):
            confirm_draft(draft)
        draft.refresh_from_db()
        assert draft.status == PortfolioActionDraft.Status.EXPIRED

    def test_cancelled_draft_cannot_confirm(self, create_user):
        user = create_user(username="b4", password="p")
        draft = create_draft(
            user=user, account=None, kind=PortfolioActionDraft.Kind.TRADE,
            title="x", payload={"trades": []}, preview={},
        )
        draft.status = PortfolioActionDraft.Status.CANCELLED
        draft.save(update_fields=["status"])
        with pytest.raises(DraftError):
            confirm_draft(draft)

    def test_insufficient_quantity_raises(self, create_user):
        user = create_user(username="b5", password="p")
        acct = _paper_account(user)
        draft = create_draft(
            user=user, account=acct, kind=PortfolioActionDraft.Kind.TRADE,
            title="Sell 5 NABIL (none held)",
            payload={"trades": [{"ticker": "NABIL", "txn_type": "SELL", "quantity": 5, "rate": 500.0}]},
            preview={},
        )
        with pytest.raises(ValueError):
            confirm_draft(draft)
        draft.refresh_from_db()
        assert draft.status == PortfolioActionDraft.Status.PENDING  # rolled back, still pending
```

- [ ] **Step 2: Run to verify it fails**

Run: `docker exec stockastic-backend pytest tests/unit/test_portfolio_drafts.py::TestConfirmTrade -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'stocks.services.portfolio_drafts'`.

- [ ] **Step 3: Create the service**

Create `backend/stocks/services/portfolio_drafts.py`:
```python
"""Create and deterministically execute PortfolioActionDraft rows.

The chat portfolio-manager's propose_* tools build drafts here; the REST
confirm endpoint calls confirm_draft. confirm_draft is the ONLY place a draft's
payload is turned into real portfolio writes, so it is the single execution
source of truth and is fully unit-tested without HTTP.
"""

from __future__ import annotations

from datetime import timedelta
from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from stocks.models.portfolio import (
    PortfolioActionDraft,
    PortfolioItem,
    PortfolioTarget,
    PortfolioTransaction,
)
from stocks.services.portfolio_service import PortfolioService

DRAFT_TTL_HOURS = 18


class DraftError(Exception):
    """Raised when a draft cannot be confirmed (expired / wrong status / bad kind)."""


def default_expiry():
    return timezone.now() + timedelta(hours=DRAFT_TTL_HOURS)


def create_draft(*, user, kind, title, payload, preview, account=None):
    return PortfolioActionDraft.objects.create(
        user=user,
        account=account,
        kind=kind,
        title=title,
        payload=payload,
        preview=preview,
        expires_at=default_expiry(),
    )


def _execute_trades(user, account, trades):
    """Run each trade through process_transaction and record a PortfolioTransaction.

    Mirrors stocks.views.portfolio.PortfolioTransactionViewSet.perform_create:
    process_transaction mutates the holding and returns the fee metrics; the
    PortfolioTransaction row is then created with those metrics.
    """
    txn_ids = []
    messages = []
    for t in trades:
        metrics = PortfolioService.process_transaction(
            user=user,
            ticker=t["ticker"],
            txn_type=t["txn_type"],
            quantity=int(t["quantity"]),
            rate=Decimal(str(t["rate"])),
            account=account,
        )
        txn = PortfolioTransaction.objects.create(
            user=user,
            account=account,
            ticker=t["ticker"],
            transaction_type=t["txn_type"],
            quantity=int(t["quantity"]),
            rate=Decimal(str(t["rate"])),
            amount=metrics["amount"],
            commission=metrics["commission"],
            sebon_fee=metrics["sebon_fee"],
            dp_charge=metrics["dp_charge"],
            cgt=metrics["cgt"],
            receivable_amount=metrics["receivable_amount"],
            transaction_date=timezone.now(),
        )
        txn_ids.append(txn.id)
        messages.append(f"{t['txn_type']} {int(t['quantity'])} {t['ticker']} @ Rs {float(t['rate']):,.2f}")
    return txn_ids, messages


def _execute_exits(user, payload):
    updated = []
    for it in payload.get("items", []):
        item = PortfolioItem.objects.filter(user=user, id=it["item_id"]).first()
        if not item:
            continue
        fields = []
        if it.get("stop_loss_price") is not None:
            item.stop_loss_price = Decimal(str(it["stop_loss_price"]))
            fields.append("stop_loss_price")
        if it.get("target_price") is not None:
            item.target_price = Decimal(str(it["target_price"]))
            fields.append("target_price")
        if fields:
            item.save(update_fields=fields)
            updated.append(item.ticker)
    return {"updated_tickers": updated,
            "message": f"Set exits on {', '.join(updated) or 'no holdings'}."}


def _execute_rebalance(user, account, payload):
    targets = payload.get("targets", [])
    for tgt in targets:
        PortfolioTarget.objects.update_or_create(
            user=user,
            account=account,
            target_type=tgt["target_type"],
            category_name=tgt["category_name"],
            defaults={"target_percentage": Decimal(str(tgt["target_percentage"]))},
        )
    txn_ids, _ = _execute_trades(user, account, payload.get("trades", []))
    return {"transaction_ids": txn_ids, "targets_set": len(targets),
            "message": f"Rebalanced: {len(txn_ids)} trade(s), {len(targets)} target(s) set."}


def _execute_trade_plan(user, payload):
    from stocks.serializers.portfolio import TradePlanSerializer
    ser = TradePlanSerializer(data=payload)
    ser.is_valid(raise_exception=True)
    plan = ser.save(user=user)
    return {"trade_plan_id": plan.id,
            "message": f"Created trade plan for {plan.ticker} with {plan.legs.count()} leg(s)."}


def confirm_draft(draft):
    """Execute a PENDING draft. Idempotent on CONFIRMED. Raises DraftError otherwise."""
    if draft.status == PortfolioActionDraft.Status.CONFIRMED:
        return draft.result
    if draft.status != PortfolioActionDraft.Status.PENDING:
        raise DraftError(f"Draft is {draft.status} and cannot be confirmed.")
    if draft.is_expired:
        draft.status = PortfolioActionDraft.Status.EXPIRED
        draft.save(update_fields=["status"])
        raise DraftError("Draft has expired — ask the manager to re-draft at current prices.")

    user, account, payload, kind = draft.user, draft.account, draft.payload, draft.kind

    with transaction.atomic():
        if kind == PortfolioActionDraft.Kind.TRADE:
            txn_ids, messages = _execute_trades(user, account, payload["trades"])
            result = {"transaction_ids": txn_ids, "message": "; ".join(messages)}
        elif kind == PortfolioActionDraft.Kind.EXITS:
            result = _execute_exits(user, payload)
        elif kind == PortfolioActionDraft.Kind.REBALANCE:
            result = _execute_rebalance(user, account, payload)
        elif kind == PortfolioActionDraft.Kind.TRADE_PLAN:
            result = _execute_trade_plan(user, payload)
        else:
            raise DraftError(f"Unknown draft kind {kind}")

        draft.status = PortfolioActionDraft.Status.CONFIRMED
        draft.confirmed_at = timezone.now()
        draft.result = result
        draft.save(update_fields=["status", "confirmed_at", "result"])

    return result
```

Note: `ValueError` from `process_transaction` (insufficient qty/balance) propagates out of `transaction.atomic()`, rolling back, leaving status PENDING — matching `test_insufficient_quantity_raises`.

- [ ] **Step 4: Run to verify it passes**

Run: `docker exec stockastic-backend pytest tests/unit/test_portfolio_drafts.py::TestConfirmTrade -v`
Expected: PASS (5 passed).

- [ ] **Step 5: Commit**

```bash
git add backend/stocks/services/portfolio_drafts.py backend/tests/unit/test_portfolio_drafts.py
git commit -m "feat(portfolio): confirm_draft service — TRADE kind + gate invariants"
```

---

## Task 3: Draft serializer + REST viewset (`confirm` / `cancel` / list / detail)

**Files:**
- Modify: `backend/stocks/serializers/portfolio.py` (append)
- Modify: `backend/stocks/views/portfolio.py` (append viewset)
- Modify: `backend/stocks/urls.py` (register)
- Test: `backend/tests/integration/test_portfolio_drafts_api.py`

- [ ] **Step 1: Write the failing integration tests**

Create `backend/tests/integration/test_portfolio_drafts_api.py`:
```python
"""Integration tests for the PortfolioActionDraft confirm/cancel endpoints."""
import pytest
from decimal import Decimal

from django.urls import reverse
from rest_framework import status

from stocks.models.portfolio import (
    PortfolioActionDraft, PortfolioAccount, PortfolioItem, PortfolioTransaction,
)
from stocks.services.portfolio_drafts import create_draft


def _draft_for(user, account=None):
    return create_draft(
        user=user, account=account, kind=PortfolioActionDraft.Kind.TRADE,
        title="Buy 10 NABIL @ 500",
        payload={"trades": [{"ticker": "NABIL", "txn_type": "BUY", "quantity": 10, "rate": 500.0}]},
        preview={"lines": ["BUY 10 NABIL @ Rs 500"]},
    )


@pytest.mark.django_db
class TestDraftConfirmAPI:
    def test_confirm_executes_and_returns_result(self, auth_client, django_user_model):
        user = django_user_model.objects.get(username="testuser")
        acct = PortfolioAccount.objects.create(user=user, name="Paper", account_type="PAPER", balance=Decimal("1000000"))
        draft = _draft_for(user, acct)
        url = reverse("portfolio-action-drafts-confirm", args=[draft.id])
        res = auth_client.post(url)
        assert res.status_code == status.HTTP_200_OK
        assert res.data["status"] == "CONFIRMED"
        assert PortfolioTransaction.objects.filter(user=user, ticker="NABIL").count() == 1

    def test_cancel_sets_status(self, auth_client, django_user_model):
        user = django_user_model.objects.get(username="testuser")
        draft = _draft_for(user)
        url = reverse("portfolio-action-drafts-cancel", args=[draft.id])
        res = auth_client.post(url)
        assert res.status_code == status.HTTP_200_OK
        draft.refresh_from_db()
        assert draft.status == "CANCELLED"

    def test_cannot_confirm_another_users_draft(self, auth_client, create_user):
        other = create_user(username="intruder", password="p")
        draft = _draft_for(other)
        url = reverse("portfolio-action-drafts-confirm", args=[draft.id])
        res = auth_client.post(url)
        assert res.status_code == status.HTTP_404_NOT_FOUND

    def test_confirm_cancelled_returns_409(self, auth_client, django_user_model):
        user = django_user_model.objects.get(username="testuser")
        draft = _draft_for(user)
        draft.status = PortfolioActionDraft.Status.CANCELLED
        draft.save(update_fields=["status"])
        url = reverse("portfolio-action-drafts-confirm", args=[draft.id])
        res = auth_client.post(url)
        assert res.status_code == status.HTTP_409_CONFLICT

    def test_list_only_returns_own_drafts(self, auth_client, django_user_model, create_user):
        user = django_user_model.objects.get(username="testuser")
        other = create_user(username="someone", password="p")
        _draft_for(user)
        _draft_for(other)
        res = auth_client.get(reverse("portfolio-action-drafts-list"))
        assert res.status_code == status.HTTP_200_OK
        assert all(row["user"] == user.id for row in res.data) if res.data and "user" in res.data[0] else len(res.data) == 1
```

- [ ] **Step 2: Run to verify it fails**

Run: `docker exec stockastic-backend pytest tests/integration/test_portfolio_drafts_api.py -v`
Expected: FAIL — `NoReverseMatch: Reverse for 'portfolio-action-drafts-confirm' not found`.

- [ ] **Step 3: Add the serializer**

Append to `backend/stocks/serializers/portfolio.py`:
```python
class PortfolioActionDraftSerializer(serializers.ModelSerializer):
    class Meta:
        model = PortfolioActionDraft
        fields = [
            'id', 'user', 'account', 'kind', 'status', 'title',
            'payload', 'preview', 'result', 'expires_at', 'created_at', 'confirmed_at',
        ]
        read_only_fields = fields
```
Add `PortfolioActionDraft` to the model import at the top of the file (it imports from `stocks.models.portfolio` — add the name to that import list).

- [ ] **Step 4: Add the viewset**

Append to `backend/stocks/views/portfolio.py` (ensure imports at top include `PortfolioActionDraft`, the serializer `PortfolioActionDraftSerializer`, and `from stocks.services.portfolio_drafts import confirm_draft, DraftError`):
```python
class PortfolioActionDraftViewSet(viewsets.ReadOnlyModelViewSet):
    """List/detail a user's proposed portfolio actions; confirm or cancel them.

    Drafts are created by the chat portfolio-manager tools, not via POST here.
    """
    permission_classes = [IsAuthenticated]
    serializer_class = PortfolioActionDraftSerializer

    def get_queryset(self):
        qs = PortfolioActionDraft.objects.filter(user=self.request.user)
        status_filter = self.request.query_params.get('status')
        if status_filter:
            qs = qs.filter(status=status_filter.upper())
        return qs

    @action(detail=True, methods=['post'])
    def confirm(self, request, pk=None):
        draft = self.get_object()  # 404s if not this user's draft
        try:
            result = confirm_draft(draft)
        except DraftError as e:
            return Response({"error": str(e)}, status=status.HTTP_409_CONFLICT)
        except ValueError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        draft.refresh_from_db()
        return Response({"status": draft.status, "kind": draft.kind, "result": result})

    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        draft = self.get_object()
        if draft.status == PortfolioActionDraft.Status.PENDING:
            draft.status = PortfolioActionDraft.Status.CANCELLED
            draft.save(update_fields=['status'])
        return Response({"status": draft.status})
```

- [ ] **Step 5: Register the route**

In `backend/stocks/urls.py`, after the `trade-plans` registration (line ~14):
```python
router.register(r'portfolio-action-drafts', portfolio.PortfolioActionDraftViewSet, basename='portfolio-action-drafts')
```
This yields `reverse("portfolio-action-drafts-confirm", args=[id])` → `/api/stocks/portfolio-action-drafts/{id}/confirm/`.

- [ ] **Step 6: Run to verify it passes**

Run: `docker exec stockastic-backend pytest tests/integration/test_portfolio_drafts_api.py -v`
Expected: PASS (5 passed).

- [ ] **Step 7: Commit**

```bash
git add backend/stocks/serializers/portfolio.py backend/stocks/views/portfolio.py backend/stocks/urls.py backend/tests/integration/test_portfolio_drafts_api.py
git commit -m "feat(portfolio): draft confirm/cancel REST endpoints"
```

---

## Task 4: `propose_trade` MCP tool + `_trade_preview` helper

**Files:**
- Modify: `backend/chat/tools.py` (add helper + tool, register in `ALL_TOOLS`)
- Test: `backend/tests/unit/test_propose_tools.py`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/unit/test_propose_tools.py`:
```python
"""Unit tests for the chat portfolio-manager propose_* tools.

Each propose tool must create a PENDING PortfolioActionDraft with a
self-contained payload and NOT mutate portfolio state at propose time.
"""
import asyncio
from decimal import Decimal

import pytest

from chat import _user_context
from chat.tools import propose_trade
from stocks.models.portfolio import (
    PortfolioActionDraft, PortfolioAccount, PortfolioItem, PortfolioTransaction,
)


def _call(tool, args, user):
    _user_context.set_user(user)
    _user_context.reset_cards()
    # An SDK @tool object is an SdkMcpTool; .handler is the underlying async fn
    # (confirmed: dir(get_holdings) → name, handler, input_schema, description).
    return asyncio.get_event_loop().run_until_complete(tool.handler(args))


@pytest.mark.django_db
class TestProposeTrade:
    def test_creates_pending_draft_without_executing(self, create_user):
        user = create_user(username="pt1", password="p")
        acct = PortfolioAccount.objects.create(user=user, name="Paper", account_type="PAPER", balance=Decimal("1000000"))
        res = _call(propose_trade, {"ticker": "NABIL", "action": "BUY", "quantity": 10, "rate": 500.0, "account_id": acct.id}, user)
        assert res["is_error"] is False
        draft = PortfolioActionDraft.objects.get(user=user)
        assert draft.status == PortfolioActionDraft.Status.PENDING
        assert draft.kind == PortfolioActionDraft.Kind.TRADE
        assert draft.payload["trades"][0]["ticker"] == "NABIL"
        assert draft.payload["trades"][0]["txn_type"] == "BUY"
        # No execution happened at propose time:
        assert PortfolioTransaction.objects.filter(user=user).count() == 0
        assert not PortfolioItem.objects.filter(user=user, ticker="NABIL").exists()

    def test_card_carries_draft_id(self, create_user):
        user = create_user(username="pt2", password="p")
        _call(propose_trade, {"ticker": "NABIL", "action": "BUY", "quantity": 5, "rate": 400.0}, user)
        cards = _user_context.take_cards()
        assert len(cards) == 1
        assert cards[0]["type"] == "proposal"
        assert "draft_id" in cards[0]["data"]
```

(The SDK `@tool` object is an `SdkMcpTool` exposing `.handler` (async), `.name`, `.input_schema`, `.description` — verified — so `tool.handler(args)` is the correct call.)

- [ ] **Step 2: Run to verify it fails**

Run: `docker exec stockastic-backend pytest tests/unit/test_propose_tools.py::TestProposeTrade -v`
Expected: FAIL — `ImportError: cannot import name 'propose_trade'`.

- [ ] **Step 3: Add the helper + tool**

In `backend/chat/tools.py`, add imports near the top (with the other `stocks` imports):
```python
from django.utils import timezone
from stocks.models.portfolio import PortfolioActionDraft
from stocks.services.portfolio_drafts import create_draft
from stocks.utils import (
    calculate_broker_commission, calculate_sebon_fee, calculate_dp_charge, calculate_cgt,
)
```

Add the preview helper (in the Portfolio section of the file):
```python
def _trade_preview(user, account, ticker, txn_type, quantity, rate):
    """Estimate fees/CGT/net for a single trade WITHOUT mutating anything.

    Uses the same stocks.utils fee helpers as PortfolioService.process_transaction.
    CGT on SELL is estimated against the holding's current WACC.
    """
    quantity = int(quantity)
    rate = Decimal(str(rate))
    amount = Decimal(quantity) * rate
    commission = calculate_broker_commission(amount)
    sebon_fee = calculate_sebon_fee(amount)
    dp_charge = calculate_dp_charge()
    cgt = Decimal("0.00")
    warnings = []
    if txn_type == "SELL":
        item = PortfolioItem.objects.filter(user=user, ticker=ticker, account=account).first()
        wacc = Decimal(str(item.wacc)) if item and item.wacc else None
        if item is None:
            warnings.append(f"No {ticker} holding found in this account.")
        elif item.quantity < quantity:
            warnings.append(f"Only {item.quantity} {ticker} held; cannot sell {quantity}.")
        if wacc is not None:
            profit = (rate - wacc) * Decimal(quantity)
            if profit > 0:
                cgt = calculate_cgt(profit, is_long_term=False)
        net = amount - commission - sebon_fee - dp_charge - cgt
    else:  # BUY
        net = amount + commission + sebon_fee + dp_charge
        if account and getattr(account, "account_type", None) == "PAPER" and account.balance < net:
            warnings.append(f"Insufficient paper balance (need Rs {float(net):,.0f}, have Rs {float(account.balance):,.0f}).")
    return {
        "amount": float(amount),
        "commission": float(commission),
        "sebon_fee": float(sebon_fee),
        "dp_charge": float(dp_charge),
        "cgt": float(cgt),
        "net": float(net),
        "warnings": warnings,
    }
```

Add the tool (in the Portfolio section, before `ALL_TOOLS`):
```python
@tool(
    "propose_trade",
    "Draft a BUY or SELL of a NEPSE ticker for the user to CONFIRM before it is recorded. "
    "Computes fees + CGT and creates a pending proposal card. Does NOT execute — the user "
    "confirms it. action='BUY'|'SELL'. Pass account_id to scope to one account.",
    {"ticker": str, "action": str, "quantity": int, "rate": float, "account_id": str},
)
async def propose_trade(args: dict) -> dict:
    ticker = (args.get("ticker") or "").upper().strip()
    action = (args.get("action") or "").upper().strip()
    quantity = int(args.get("quantity") or 0)
    rate = args.get("rate")
    account_id = args.get("account_id")
    if not ticker or action not in ("BUY", "SELL") or quantity <= 0 or rate is None:
        return _result("Provide ticker, action (BUY/SELL), positive quantity, and rate.", is_error=True)

    user = get_user()

    @sync_to_async
    def _run():
        account = _resolve_account(user, account_id)
        preview = _trade_preview(user, account, ticker, action, quantity, float(rate))
        title = f"{action} {quantity} {ticker} @ Rs {float(rate):,.2f}"
        payload = {
            "account_id": account.id if account else None,
            "trades": [{"ticker": ticker, "txn_type": action, "quantity": quantity, "rate": float(rate)}],
        }
        card_preview = {
            "title": title,
            "lines": [{
                "ticker": ticker, "action": action, "quantity": quantity, "rate": float(rate),
                "fees": {"commission": preview["commission"], "sebon_fee": preview["sebon_fee"],
                         "dp_charge": preview["dp_charge"], "cgt": preview["cgt"]},
                "net": preview["net"],
            }],
            "warnings": preview["warnings"],
        }
        draft = create_draft(
            user=user, account=account, kind=PortfolioActionDraft.Kind.TRADE,
            title=title, payload=payload, preview=card_preview,
        )
        warn = f" ⚠️ {'; '.join(preview['warnings'])}" if preview["warnings"] else ""
        prose = (f"Drafted: {title}. Net Rs {preview['net']:,.0f} "
                 f"(fees Rs {preview['commission'] + preview['sebon_fee'] + preview['dp_charge']:,.0f}, "
                 f"CGT Rs {preview['cgt']:,.0f}). Awaiting your confirmation.{warn}")
        return _result(prose, card={
            "type": "proposal",
            "data": {"draft_id": draft.id, "kind": "TRADE", "title": title,
                     "status": "PENDING", "preview": card_preview},
        }, _tool_name="propose_trade")

    return await _run()
```

Register in `ALL_TOOLS` — add a `# Portfolio Manager (propose)` section before the closing `]`:
```python
    # Portfolio Manager (propose-then-confirm)
    propose_trade,
```

- [ ] **Step 4: Run to verify it passes**

Run: `docker exec stockastic-backend pytest tests/unit/test_propose_tools.py::TestProposeTrade -v`
Expected: PASS (2 passed).

- [ ] **Step 5: Commit**

```bash
git add backend/chat/tools.py backend/tests/unit/test_propose_tools.py
git commit -m "feat(chat): propose_trade tool — drafts a confirmable trade"
```

---

## Task 5: `portfolio-manager` subagent + prompt + orchestrator routing

**Files:**
- Create: `backend/chat/prompts/portfolio_manager.yaml`
- Modify: `backend/chat/subagents.py`
- Modify: `backend/chat/prompts/orchestrator.yaml`
- Test: `backend/tests/unit/test_portfolio_manager_agent.py`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/unit/test_portfolio_manager_agent.py`:
```python
"""The portfolio-manager subagent is registered and wired to its tools."""
from chat.subagents import AGENTS
from chat.tools import tool_id, ALL_TOOLS


def test_portfolio_manager_registered():
    assert "portfolio-manager" in AGENTS


def test_portfolio_manager_has_propose_trade():
    agent = AGENTS["portfolio-manager"]
    assert tool_id("propose_trade") in agent.tools


def test_propose_trade_is_in_mcp_server():
    names = {getattr(t, "name", None) for t in ALL_TOOLS}
    assert "propose_trade" in names
```

- [ ] **Step 2: Run to verify it fails**

Run: `docker exec stockastic-backend pytest tests/unit/test_portfolio_manager_agent.py -v`
Expected: FAIL — `KeyError: 'portfolio-manager'`.

- [ ] **Step 3: Create the prompt**

Create `backend/chat/prompts/portfolio_manager.yaml`:
```yaml
system: |
  You are the Stockastic Portfolio Manager — you actively manage the
  authenticated user's NEPSE portfolio, optimizing for HIGH WIN RATE and
  HIGH RETURNS with disciplined risk management.

  You PROPOSE actions; you NEVER execute. Every action you decide on becomes a
  confirmable proposal card the user taps to approve. Recording trades, setting
  stops/targets, rebalancing, and building trade plans ALL go through your
  propose_* tools — there is no other way to change the user's portfolio.

  ## Your propose tools (each creates a confirmable proposal — no direct writes)

  - `propose_trade` — draft a BUY or SELL (with fees + CGT preview)
  - `propose_exits` — draft stop-loss + target prices for a holding
  - `propose_rebalance` — draft an optimized target allocation + the trades to reach it
  - `propose_trade_plan` — draft a staged multi-leg entry/exit plan

  You also have read tools: get_portfolio_overview, get_holdings, get_watchlist,
  get_risk_profile, get_sector_allocation, get_rebalance_targets, get_realized_pnl,
  get_portfolio_accounts, get_signals_for_ticker, get_signal_track_record,
  get_strategy_performance, calc_position_size, get_stock_quote.

  ## Manager Scorecard — how you decide

  Score every candidate action on three axes, then act:

  1. RETURN — upside to target, momentum, and (for rebalancing) the optimizer's
     allocation. Prefer high-expected-return positions.
  2. WIN RATE — weight each ticker by the win rate / track record of the
     strategies and signals backing it (get_signals_for_ticker,
     get_signal_track_record, get_strategy_performance). High-win-rate, well-
     scoped strategies raise conviction; weak or contra-signal names lower it.
  3. RISK — penalize concentration (single name > 25%, sector > 50%), low health
     scores (< 40), and large drawdowns.

  Decision policy:
  - TRIM/SELL over-concentrated names, holdings with active SELL signals or
    deteriorating health, and positions far above their target allocation.
  - ADD/SIZE high-conviction, high-win-rate setups — ALWAYS position-sized to a
    risk % via calc_position_size, and ALWAYS paired with a protective stop
    (propose_exits). Risk management is what protects the win rate.

  ## Hard rules

  - Never propose more than 5% single-trade account risk without a prominent ⚠️.
  - Every BUY proposal must be sized and must have a stop.
  - NEPSE conventions: lot size 10, broker commission ≈ 0.36%, SEBON 0.015%,
    DP Rs 25/txn, CGT 5% (individual, short-term). T+1 settlement.
  - Never invent prices, signals, or win rates — read them. If data is missing,
    say so and propose nothing on that name.
  - Do not over-claim realized P/L (the realized figure is an approximation).

  ## Output

  Lead with the recommendation and the WHY (return × win-rate × risk in one or
  two sentences). Then call the relevant propose_* tool(s) so the user gets
  confirmable cards. Close with what would invalidate the thesis. Use Rs notation
  and two-decimal percentages.

user: |
  Manage the user's portfolio toward high win rate and high returns. Read the
  current holdings, risk, and the signals/track records backing each name, apply
  the Manager Scorecard, and propose the highest-conviction, risk-managed actions
  as confirmable proposals. Size every buy and attach a stop.
```

- [ ] **Step 4: Add the AgentDefinition**

In `backend/chat/subagents.py`, after `PORTFOLIO_ADVISOR` and before the `AGENTS` dict:
```python
PORTFOLIO_MANAGER = AgentDefinition(
    description=(
        "Actively MANAGES the user's portfolio: proposes confirmable actions — "
        "record buy/sell trades, set stops/targets, optimize allocation + rebalance, "
        "and build staged multi-leg trade plans — optimizing for win rate and returns "
        "with risk discipline. Every action is a proposal the user confirms; nothing "
        "executes automatically. Use when the user wants to ACT on their portfolio: "
        "'rebalance me', 'trim my losers', 'set stops', 'buy/sell N of X', "
        "'optimize my portfolio', 'build me a plan'. For pure analysis with no action, "
        "use portfolio-advisor instead."
    ),
    prompt=_system("portfolio_manager"),
    initialPrompt=_initial("portfolio_manager"),
    tools=[
        tool_id("propose_trade"),
        tool_id("propose_exits"),
        tool_id("propose_rebalance"),
        tool_id("propose_trade_plan"),
        tool_id("get_portfolio_overview"),
        tool_id("get_holdings"),
        tool_id("get_watchlist"),
        tool_id("get_risk_profile"),
        tool_id("get_sector_allocation"),
        tool_id("get_rebalance_targets"),
        tool_id("get_realized_pnl"),
        tool_id("get_portfolio_accounts"),
        tool_id("get_signals_for_ticker"),
        tool_id("get_signal_track_record"),
        tool_id("get_strategy_performance"),
        tool_id("calc_position_size"),
        tool_id("get_stock_quote"),
    ],
    model="opus",
    effort="high",
    maxTurns=8,
)
```
Then add to the `AGENTS` dict:
```python
    "portfolio-manager": PORTFOLIO_MANAGER,
```

> Note: Phase A only ships `propose_trade`. `tool_id("propose_exits")` etc. reference tools added in Phases B/C. The SDK resolves tool ids at call time, so listing them now is harmless, but to keep Phase A self-contained and green you MAY temporarily list only `propose_trade` and add the other three in their tasks. Recommended: list only `propose_trade` here in Task 5, and append the others in Tasks 7/8/9.

For Phase A, use this `tools` list (replace the propose block above):
```python
        tool_id("propose_trade"),
```
(keep all the read tools).

- [ ] **Step 5: Add orchestrator routing**

In `backend/chat/prompts/orchestrator.yaml`, under "## Your Team", add after the portfolio-advisor entry:
```yaml
  - **portfolio-manager** — ACTS on the user's portfolio: proposes confirmable
    trades, stops/targets, rebalancing, and trade plans, optimizing for win rate
    and returns. Use when the user wants to DO something to their portfolio
    ("rebalance me", "trim my losers", "set stops on X", "buy/sell N of X",
    "optimize my portfolio", "build me a plan"). Pure analysis → portfolio-advisor.
```
And under "Routing rules", add:
```yaml
  - Portfolio ACTION (record a trade, set stops, rebalance, optimize, build a
    plan) → **portfolio-manager**. Portfolio analysis only → **portfolio-advisor**.
```

- [ ] **Step 6: Run to verify it passes**

Run: `docker exec stockastic-backend pytest tests/unit/test_portfolio_manager_agent.py -v`
Expected: PASS (3 passed).

- [ ] **Step 7: Commit**

```bash
git add backend/chat/prompts/portfolio_manager.yaml backend/chat/subagents.py backend/chat/prompts/orchestrator.yaml backend/tests/unit/test_portfolio_manager_agent.py
git commit -m "feat(chat): portfolio-manager subagent + orchestrator routing"
```

---

## Task 6: Frontend `ProposalCard` + registry

**Files:**
- Create: `frontend/src/components/chat/gen-ui/ProposalCard.tsx`
- Modify: `frontend/src/components/chat/gen-ui/GenUIRegistry.tsx`

There is no FE unit-test harness in this repo, so this task verifies in the running app. The card is a pure component that calls `@/lib/api`.

- [ ] **Step 1: Create the component**

Create `frontend/src/components/chat/gen-ui/ProposalCard.tsx`:
```tsx
'use client';

import React, { useState } from 'react';
import api from '@/lib/api';

interface ProposalLine {
    ticker?: string;
    action?: string;
    quantity?: number;
    rate?: number;
    net?: number;
    fees?: { commission: number; sebon_fee: number; dp_charge: number; cgt: number };
    label?: string;
}

interface ProposalPreview {
    title: string;
    lines: ProposalLine[];
    warnings?: string[];
}

interface ProposalCardProps {
    draft_id: number;
    kind: string;
    title: string;
    status: string;
    preview: ProposalPreview;
}

const KIND_LABEL: Record<string, string> = {
    TRADE: 'Trade', EXITS: 'Stops & Targets', REBALANCE: 'Rebalance', TRADE_PLAN: 'Trade Plan',
};

const ProposalCard: React.FC<ProposalCardProps> = ({ draft_id, kind, title, status: initialStatus, preview }) => {
    const [status, setStatus] = useState(initialStatus || 'PENDING');
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const act = async (verb: 'confirm' | 'cancel') => {
        setBusy(true);
        setError(null);
        try {
            const res = await api.post(`/api/stocks/portfolio-action-drafts/${draft_id}/${verb}/`);
            setStatus(res.data.status);
            if (res.data.result?.message) setMessage(res.data.result.message);
        } catch (e: any) {
            setError(e?.response?.data?.error || 'Action failed.');
        } finally {
            setBusy(false);
        }
    };

    const terminal = status === 'CONFIRMED' || status === 'CANCELLED' || status === 'EXPIRED';

    return (
        <div className="rounded-lg border border-border bg-card p-4 text-sm">
            <div className="flex items-center justify-between mb-2">
                <span className="font-medium">{title}</span>
                <span className="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground">
                    {KIND_LABEL[kind] || kind}
                </span>
            </div>

            <div className="space-y-1">
                {preview.lines?.map((l, i) => (
                    <div key={i} className="flex justify-between text-xs">
                        <span>
                            {l.label ?? `${l.action ?? ''} ${l.quantity ?? ''} ${l.ticker ?? ''}`.trim()}
                            {l.rate != null && ` @ Rs ${l.rate.toLocaleString()}`}
                        </span>
                        {l.net != null && <span className="tabular-nums">Net Rs {Math.round(l.net).toLocaleString()}</span>}
                    </div>
                ))}
            </div>

            {preview.lines?.[0]?.fees && (
                <div className="mt-2 text-[11px] text-muted-foreground">
                    Fees Rs {Math.round(
                        preview.lines[0].fees.commission + preview.lines[0].fees.sebon_fee + preview.lines[0].fees.dp_charge
                    ).toLocaleString()} · CGT Rs {Math.round(preview.lines[0].fees.cgt).toLocaleString()}
                </div>
            )}

            {preview.warnings?.length ? (
                <div className="mt-2 text-[11px] text-amber-600">⚠️ {preview.warnings.join('; ')}</div>
            ) : null}

            {error && <div className="mt-2 text-[11px] text-red-600">{error}</div>}

            <div className="mt-3 flex gap-2">
                {!terminal ? (
                    <>
                        <button
                            disabled={busy}
                            onClick={() => act('confirm')}
                            className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium disabled:opacity-50"
                        >
                            {busy ? 'Working…' : 'Confirm'}
                        </button>
                        <button
                            disabled={busy}
                            onClick={() => act('cancel')}
                            className="px-3 py-1.5 rounded-md border border-border text-xs disabled:opacity-50"
                        >
                            Cancel
                        </button>
                    </>
                ) : (
                    <span className={`text-xs font-medium ${status === 'CONFIRMED' ? 'text-green-600' : 'text-muted-foreground'}`}>
                        {status === 'CONFIRMED' ? `✓ ${message || 'Confirmed'}` : status === 'CANCELLED' ? 'Cancelled' : 'Expired'}
                    </span>
                )}
            </div>
        </div>
    );
};

export default ProposalCard;
```

- [ ] **Step 2: Register in the GenUI registry**

In `frontend/src/components/chat/gen-ui/GenUIRegistry.tsx`:

Add the dynamic import near the others (after line ~28):
```tsx
const ProposalCard = dynamic(() => import('./ProposalCard'), { loading: () => LOADER('h-40') });
```
Add the case in the `switch` (before `default:`):
```tsx
        case 'proposal':
            return <ProposalCard {...data} />;
```

- [ ] **Step 3: Rebuild the frontend (baked image) and verify in-app**

Run:
```bash
docker compose build frontend && docker compose up -d frontend
```
Then in the chat UI, send: *"Record a buy of 10 NABIL at 500 in my paper account"*. Verify a Trade proposal card appears with Confirm/Cancel; click Confirm; verify it flips to a green ✓ with the result message and that a transaction now exists (check `/portfolio` transactions or `GET /api/stocks/transactions/`).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/chat/gen-ui/ProposalCard.tsx frontend/src/components/chat/gen-ui/GenUIRegistry.tsx
git commit -m "feat(chat-ui): ProposalCard for confirmable portfolio actions"
```

**Phase A is now shippable: full propose → confirm loop for trades.**

---

# PHASE B — Protection (`propose_exits`) + rebalance (`propose_rebalance`)

## Task 7: `propose_exits` — stops & targets

**Files:**
- Modify: `backend/chat/tools.py` (add tool, register in `ALL_TOOLS`)
- Modify: `backend/chat/subagents.py` (add `tool_id("propose_exits")` to manager)
- Test: `backend/tests/unit/test_portfolio_drafts.py` (append EXITS confirm test), `backend/tests/unit/test_propose_tools.py` (append)

- [ ] **Step 1: Write the failing confirm test**

Append to `backend/tests/unit/test_portfolio_drafts.py`:
```python
@pytest.mark.django_db
class TestConfirmExits:
    def test_sets_stop_and_target_on_owned_item(self, create_user):
        user = create_user(username="ex1", password="p")
        item = PortfolioItem.objects.create(user=user, ticker="SHL", quantity=20, buy_price=Decimal("500"), wacc=Decimal("500"))
        draft = create_draft(
            user=user, account=None, kind=PortfolioActionDraft.Kind.EXITS,
            title="Set exits on SHL",
            payload={"items": [{"item_id": item.id, "ticker": "SHL", "stop_loss_price": 480.0, "target_price": 560.0}]},
            preview={},
        )
        confirm_draft(draft)
        item.refresh_from_db()
        assert float(item.stop_loss_price) == 480.0
        assert float(item.target_price) == 560.0

    def test_ignores_item_not_owned_by_user(self, create_user):
        user = create_user(username="ex2", password="p")
        other = create_user(username="ex2b", password="p")
        foreign = PortfolioItem.objects.create(user=other, ticker="SHL", quantity=20, buy_price=Decimal("500"), wacc=Decimal("500"))
        draft = create_draft(
            user=user, account=None, kind=PortfolioActionDraft.Kind.EXITS,
            title="x", payload={"items": [{"item_id": foreign.id, "stop_loss_price": 1.0}]}, preview={},
        )
        result = confirm_draft(draft)
        foreign.refresh_from_db()
        assert foreign.stop_loss_price is None
        assert result["updated_tickers"] == []
```

- [ ] **Step 2: Run to verify it fails**

Run: `docker exec stockastic-backend pytest tests/unit/test_portfolio_drafts.py::TestConfirmExits -v`
Expected: PASS already (the EXITS branch was written in Task 2's `_execute_exits`). If PASS, this confirms the executor; proceed to the tool. If it FAILs, fix `_execute_exits` to match.

- [ ] **Step 3: Write the failing propose test**

Append to `backend/tests/unit/test_propose_tools.py`:
```python
from chat.tools import propose_exits


@pytest.mark.django_db
class TestProposeExits:
    def test_creates_exits_draft_for_holding(self, create_user):
        user = create_user(username="pe1", password="p")
        item = PortfolioItem.objects.create(user=user, ticker="SHL", quantity=20, buy_price=Decimal("500"), wacc=Decimal("500"))
        res = _call(propose_exits, {"ticker": "SHL", "stop_loss_price": 480.0, "target_price": 560.0}, user)
        assert res["is_error"] is False
        draft = PortfolioActionDraft.objects.get(user=user, kind=PortfolioActionDraft.Kind.EXITS)
        assert draft.payload["items"][0]["item_id"] == item.id
        item.refresh_from_db()
        assert item.stop_loss_price is None  # not executed at propose time
```

- [ ] **Step 4: Run to verify it fails**

Run: `docker exec stockastic-backend pytest tests/unit/test_propose_tools.py::TestProposeExits -v`
Expected: FAIL — `ImportError: cannot import name 'propose_exits'`.

- [ ] **Step 5: Add the tool**

In `backend/chat/tools.py`, add (in the Portfolio Manager section):
```python
@tool(
    "propose_exits",
    "Draft a stop-loss and/or target price for one of the user's holdings, for them to "
    "CONFIRM. Pass ticker and at least one of stop_loss_price / target_price. Optional "
    "account_id to disambiguate which account's holding. Does NOT execute.",
    {"ticker": str, "stop_loss_price": float, "target_price": float, "account_id": str},
)
async def propose_exits(args: dict) -> dict:
    ticker = (args.get("ticker") or "").upper().strip()
    stop = args.get("stop_loss_price")
    target = args.get("target_price")
    account_id = args.get("account_id")
    if not ticker or (stop is None and target is None):
        return _result("Provide ticker and at least one of stop_loss_price / target_price.", is_error=True)

    user = get_user()

    @sync_to_async
    def _run():
        account = _resolve_account(user, account_id)
        qs = PortfolioItem.objects.filter(user=user, ticker=ticker)
        if account:
            qs = qs.filter(account=account)
        item = qs.first()
        if not item:
            return _result(f"You don't hold {ticker}{' in that account' if account else ''}.", is_error=True)
        title = f"Set exits on {ticker}" + (
            f" — stop Rs {float(stop):,.2f}" if stop is not None else "") + (
            f", target Rs {float(target):,.2f}" if target is not None else "")
        line = {"label": ticker, "ticker": ticker}
        if stop is not None:
            line["stop_loss_price"] = float(stop)
        if target is not None:
            line["target_price"] = float(target)
        payload = {"items": [{
            "item_id": item.id, "ticker": ticker,
            "stop_loss_price": float(stop) if stop is not None else None,
            "target_price": float(target) if target is not None else None,
        }]}
        card_preview = {"title": title, "lines": [line], "warnings": []}
        draft = create_draft(
            user=user, account=account, kind=PortfolioActionDraft.Kind.EXITS,
            title=title, payload=payload, preview=card_preview,
        )
        return _result(f"Drafted: {title}. Awaiting your confirmation.", card={
            "type": "proposal",
            "data": {"draft_id": draft.id, "kind": "EXITS", "title": title,
                     "status": "PENDING", "preview": card_preview},
        }, _tool_name="propose_exits")

    return await _run()
```
Register in `ALL_TOOLS` (Portfolio Manager section): add `propose_exits,`.

In `backend/chat/subagents.py`, add `tool_id("propose_exits"),` to `PORTFOLIO_MANAGER.tools`.

- [ ] **Step 6: Run to verify it passes**

Run: `docker exec stockastic-backend pytest tests/unit/test_propose_tools.py::TestProposeExits tests/unit/test_portfolio_drafts.py::TestConfirmExits -v`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/chat/tools.py backend/chat/subagents.py backend/tests/unit/test_propose_tools.py backend/tests/unit/test_portfolio_drafts.py
git commit -m "feat(chat): propose_exits tool — confirmable stops & targets"
```

---

## Task 8: `propose_rebalance` — optimize + rebalance trades

**Files:**
- Modify: `backend/chat/tools.py` (add tool, register)
- Modify: `backend/chat/subagents.py` (add `tool_id("propose_rebalance")`)
- Test: `backend/tests/unit/test_portfolio_drafts.py` (append REBALANCE confirm test), `backend/tests/unit/test_propose_tools.py` (append)

The REBALANCE executor was written in Task 2 (`_execute_rebalance`): it upserts `PortfolioTarget` rows and runs `_execute_trades`. This task verifies it and adds the propose tool. The propose tool reads current holdings, runs `perform_portfolio_optimization`, and converts the optimizer's target weights into BUY/SELL legs.

- [ ] **Step 1: Write the failing confirm test**

Append to `backend/tests/unit/test_portfolio_drafts.py`:
```python
@pytest.mark.django_db
class TestConfirmRebalance:
    def test_sets_targets_and_executes_trades(self, create_user):
        user = create_user(username="rb1", password="p")
        acct = _paper_account(user)
        # Seed a holding so a SELL leg is executable.
        PortfolioItem.objects.create(user=user, account=acct, ticker="NABIL", quantity=20, buy_price=Decimal("500"), wacc=Decimal("500"))
        draft = create_draft(
            user=user, account=acct, kind=PortfolioActionDraft.Kind.REBALANCE,
            title="Rebalance",
            payload={
                "targets": [{"target_type": "SECTOR", "category_name": "Banking", "target_percentage": 40.0}],
                "trades": [{"ticker": "NABIL", "txn_type": "SELL", "quantity": 5, "rate": 520.0}],
            },
            preview={},
        )
        result = confirm_draft(draft)
        assert result["targets_set"] == 1
        assert len(result["transaction_ids"]) == 1
        assert PortfolioTarget.objects.filter(user=user, category_name="Banking").exists()
        assert PortfolioItem.objects.get(user=user, ticker="NABIL", account=acct).quantity == 15
```

- [ ] **Step 2: Run to verify it passes (executor already exists)**

Run: `docker exec stockastic-backend pytest tests/unit/test_portfolio_drafts.py::TestConfirmRebalance -v`
Expected: PASS. If FAIL, reconcile `_execute_rebalance` with the test.

- [ ] **Step 3: Write the failing propose test**

Append to `backend/tests/unit/test_propose_tools.py`:
```python
from unittest.mock import patch
from chat.tools import propose_rebalance


@pytest.mark.django_db
class TestProposeRebalance:
    def test_builds_rebalance_draft_from_optimizer(self, create_user):
        user = create_user(username="pr1", password="p")
        acct = PortfolioAccount.objects.create(user=user, name="Paper", account_type="PAPER", balance=Decimal("1000000"))
        PortfolioItem.objects.create(user=user, account=acct, ticker="NABIL", quantity=20, buy_price=Decimal("500"), wacc=Decimal("500"))
        PortfolioItem.objects.create(user=user, account=acct, ticker="SHL", quantity=10, buy_price=Decimal("400"), wacc=Decimal("400"))
        fake_opt = {
            "success": True,
            "method": "max_sharpe",
            "optimal_weights": {"NABIL": 0.5, "SHL": 0.5},
            "current_weights": {"NABIL": 0.7, "SHL": 0.3},
            "latest_prices": {"NABIL": 520.0, "SHL": 410.0},
        }
        with patch("chat.tools.perform_portfolio_optimization", return_value=fake_opt):
            res = _call(propose_rebalance, {"account_id": acct.id, "method": "max_sharpe"}, user)
        assert res["is_error"] is False
        draft = PortfolioActionDraft.objects.get(user=user, kind=PortfolioActionDraft.Kind.REBALANCE)
        assert "trades" in draft.payload
        # Nothing executed at propose time:
        assert PortfolioItem.objects.get(user=user, ticker="NABIL").quantity == 20
```

- [ ] **Step 4: Run to verify it fails**

Run: `docker exec stockastic-backend pytest tests/unit/test_propose_tools.py::TestProposeRebalance -v`
Expected: FAIL — `ImportError: cannot import name 'propose_rebalance'`.

- [ ] **Step 5: Add the tool**

In `backend/chat/tools.py` add near the top with the other `stocks` imports (this is the exact path `backend/stocks/views/portfolio.py` imports it from — verified):
```python
from stocks.optimization import perform_portfolio_optimization
```
The propose test patches it at `chat.tools.perform_portfolio_optimization`, so it must be imported into the `chat.tools` namespace (as above), not called via a module path.

Add the tool:
```python
@tool(
    "propose_rebalance",
    "Draft a rebalance toward an optimized allocation for the user to CONFIRM. Runs the "
    "portfolio optimizer (method='max_sharpe'|'min_volatility'|'max_return', default "
    "max_sharpe), compares to current holdings, and drafts the BUY/SELL legs to move "
    "toward the optimal weights. Pass account_id to scope. Does NOT execute.",
    {"account_id": str, "method": str},
)
async def propose_rebalance(args: dict) -> dict:
    account_id = args.get("account_id")
    method = (args.get("method") or "max_sharpe").strip()
    user = get_user()

    @sync_to_async
    def _run():
        account = _resolve_account(user, account_id)
        qs = PortfolioItem.objects.filter(user=user)
        if account:
            qs = qs.filter(account=account)
        items = list(qs)
        if not items:
            return _result("Your portfolio is empty — nothing to rebalance.", is_error=True)

        # Build current holdings map {ticker: {quantity, price}} like the /optimize view.
        holdings = {}
        for it in items:
            px = DailyStockPrice.objects.filter(ticker=it.ticker).order_by("-date").first()
            price = float(px.close) if px and px.close else float(it.wacc or 0)
            h = holdings.setdefault(it.ticker, {"quantity": 0, "price": price})
            h["quantity"] += int(it.quantity)

        tickers = list(holdings.keys())
        opt = perform_portfolio_optimization(tickers, current_holdings=holdings, method=method)
        if not opt.get("success"):
            return _result(f"Optimizer could not produce a result: {opt.get('error', 'unknown')}.", is_error=True)

        weights = opt.get("optimal_weights") or {}
        prices = opt.get("latest_prices") or {t: holdings[t]["price"] for t in tickers}
        total_value = sum(holdings[t]["quantity"] * float(prices.get(t, holdings[t]["price"])) for t in tickers)

        trades = []
        lines = []
        for t in tickers:
            price = float(prices.get(t, holdings[t]["price"]) or 0)
            if price <= 0:
                continue
            target_value = total_value * float(weights.get(t, 0))
            target_qty = int(target_value // price)
            delta = target_qty - holdings[t]["quantity"]
            if delta == 0:
                continue
            txn_type = "BUY" if delta > 0 else "SELL"
            trades.append({"ticker": t, "txn_type": txn_type, "quantity": abs(delta), "rate": price})
            lines.append({"label": f"{txn_type} {abs(delta)} {t}", "ticker": t,
                          "action": txn_type, "quantity": abs(delta), "rate": price})

        if not trades:
            return _result("Your portfolio is already at the optimal allocation — no trades needed.", is_error=True)

        title = f"Rebalance ({method}) — {len(trades)} trade(s)"
        payload = {
            "account_id": account.id if account else None,
            "method": method,
            "targets": [],  # sector/tag targets left to a separate propose; weights are per-ticker here
            "trades": trades,
        }
        card_preview = {"title": title, "lines": lines, "warnings": []}
        draft = create_draft(
            user=user, account=account, kind=PortfolioActionDraft.Kind.REBALANCE,
            title=title, payload=payload, preview=card_preview,
        )
        return _result(
            f"Drafted a {method} rebalance: {len(trades)} trade(s) to reach the optimal allocation. "
            f"Awaiting your confirmation.",
            card={"type": "proposal",
                  "data": {"draft_id": draft.id, "kind": "REBALANCE", "title": title,
                           "status": "PENDING", "preview": card_preview}},
            _tool_name="propose_rebalance")

    return await _run()
```
Register `propose_rebalance,` in `ALL_TOOLS`. Add `tool_id("propose_rebalance"),` to `PORTFOLIO_MANAGER.tools` in `subagents.py`.

- [ ] **Step 6: Run to verify it passes**

Run: `docker exec stockastic-backend pytest tests/unit/test_propose_tools.py::TestProposeRebalance tests/unit/test_portfolio_drafts.py::TestConfirmRebalance -v`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/chat/tools.py backend/chat/subagents.py backend/tests/unit/test_propose_tools.py backend/tests/unit/test_portfolio_drafts.py
git commit -m "feat(chat): propose_rebalance tool — optimizer-driven rebalance proposal"
```

---

# PHASE C — Trade plans (`propose_trade_plan`) + Manager Scorecard

## Task 9: `propose_trade_plan` — staged multi-leg plan

**Files:**
- Modify: `backend/chat/tools.py` (add tool, register)
- Modify: `backend/chat/subagents.py` (add `tool_id("propose_trade_plan")`)
- Test: `backend/tests/unit/test_portfolio_drafts.py` (append TRADE_PLAN confirm test), `backend/tests/unit/test_propose_tools.py` (append)

The TRADE_PLAN executor was written in Task 2 (`_execute_trade_plan`), reusing `TradePlanSerializer` (validates legs sum to 100 and stop < target). This task verifies it and adds the propose tool.

- [ ] **Step 1: Write the failing confirm test**

Append to `backend/tests/unit/test_portfolio_drafts.py`:
```python
@pytest.mark.django_db
class TestConfirmTradePlan:
    def test_creates_trade_plan_with_legs(self, create_user):
        from stocks.models.portfolio import TradePlan
        user = create_user(username="tp1", password="p")
        acct = _paper_account(user)
        draft = create_draft(
            user=user, account=acct, kind=PortfolioActionDraft.Kind.TRADE_PLAN,
            title="Plan: NABIL",
            payload={
                "ticker": "NABIL", "account": acct.id, "thesis": "Banking recovery",
                "risk_budget_pct": "2.00", "target_price": "1350.00",
                "legs": [
                    {"leg_number": 1, "price_target": "1200.00", "allocation_pct": "60.00", "stop_loss_price": "1140.00"},
                    {"leg_number": 2, "price_target": "1150.00", "allocation_pct": "40.00", "stop_loss_price": "1095.00"},
                ],
            },
            preview={},
        )
        result = confirm_draft(draft)
        plan = TradePlan.objects.get(id=result["trade_plan_id"])
        assert plan.ticker == "NABIL"
        assert plan.legs.count() == 2

    def test_invalid_legs_sum_rejected(self, create_user):
        from rest_framework.exceptions import ValidationError
        user = create_user(username="tp2", password="p")
        draft = create_draft(
            user=user, account=None, kind=PortfolioActionDraft.Kind.TRADE_PLAN,
            title="bad",
            payload={"ticker": "NABIL", "risk_budget_pct": "2.00",
                     "legs": [{"leg_number": 1, "price_target": "1200.00", "allocation_pct": "50.00", "stop_loss_price": "1140.00"}]},
            preview={},
        )
        with pytest.raises(ValidationError):
            confirm_draft(draft)
```

- [ ] **Step 2: Run to verify it passes (executor exists)**

Run: `docker exec stockastic-backend pytest tests/unit/test_portfolio_drafts.py::TestConfirmTradePlan -v`
Expected: PASS. If the `ValidationError` rolls back but leaves status PENDING (atomic), that's correct. If FAIL, reconcile `_execute_trade_plan`.

- [ ] **Step 3: Write the failing propose test**

Append to `backend/tests/unit/test_propose_tools.py`:
```python
from chat.tools import propose_trade_plan


@pytest.mark.django_db
class TestProposeTradePlan:
    def test_creates_trade_plan_draft(self, create_user):
        user = create_user(username="ptp1", password="p")
        acct = PortfolioAccount.objects.create(user=user, name="Paper", account_type="PAPER", balance=Decimal("1000000"))
        res = _call(propose_trade_plan, {
            "ticker": "NABIL", "account_id": acct.id, "thesis": "Recovery",
            "risk_budget_pct": 2.0, "target_price": 1350.0,
            "legs": [
                {"leg_number": 1, "price_target": 1200.0, "allocation_pct": 60.0, "stop_loss_price": 1140.0},
                {"leg_number": 2, "price_target": 1150.0, "allocation_pct": 40.0, "stop_loss_price": 1095.0},
            ],
        }, user)
        assert res["is_error"] is False
        draft = PortfolioActionDraft.objects.get(user=user, kind=PortfolioActionDraft.Kind.TRADE_PLAN)
        assert draft.payload["ticker"] == "NABIL"
        assert len(draft.payload["legs"]) == 2

    def test_rejects_legs_not_summing_100(self, create_user):
        user = create_user(username="ptp2", password="p")
        res = _call(propose_trade_plan, {
            "ticker": "NABIL", "risk_budget_pct": 2.0,
            "legs": [{"leg_number": 1, "price_target": 1200.0, "allocation_pct": 50.0, "stop_loss_price": 1140.0}],
        }, user)
        assert res["is_error"] is True
```

- [ ] **Step 4: Run to verify it fails**

Run: `docker exec stockastic-backend pytest tests/unit/test_propose_tools.py::TestProposeTradePlan -v`
Expected: FAIL — `ImportError: cannot import name 'propose_trade_plan'`.

- [ ] **Step 5: Add the tool**

In `backend/chat/tools.py`:
```python
@tool(
    "propose_trade_plan",
    "Draft a staged multi-leg trade plan (up to 5 legs) for the user to CONFIRM. legs is a "
    "list of {leg_number, price_target, allocation_pct, stop_loss_price}; allocation_pct must "
    "sum to 100 and each stop_loss_price must be below its price_target. Pass ticker, "
    "risk_budget_pct, optional account_id, thesis, target_price. Does NOT execute — on confirm "
    "it creates a TradePlan the user works through over time.",
    {"ticker": str, "legs": list, "risk_budget_pct": float, "target_price": float,
     "thesis": str, "account_id": str},
)
async def propose_trade_plan(args: dict) -> dict:
    ticker = (args.get("ticker") or "").upper().strip()
    legs = args.get("legs") or []
    risk_budget_pct = args.get("risk_budget_pct")
    if not ticker or not legs or risk_budget_pct is None:
        return _result("Provide ticker, risk_budget_pct, and at least one leg.", is_error=True)

    total_alloc = sum(float(l.get("allocation_pct") or 0) for l in legs)
    if round(total_alloc, 2) != 100.0:
        return _result(f"Leg allocation_pct must sum to 100 (got {total_alloc:.2f}).", is_error=True)
    for l in legs:
        if float(l.get("stop_loss_price") or 0) >= float(l.get("price_target") or 0):
            return _result(f"Leg {l.get('leg_number')}: stop_loss_price must be below price_target.", is_error=True)

    account_id = args.get("account_id")
    thesis = args.get("thesis") or ""
    target_price = args.get("target_price")
    user = get_user()

    @sync_to_async
    def _run():
        account = _resolve_account(user, account_id)
        # Build the payload in the exact shape TradePlanSerializer expects.
        payload = {
            "ticker": ticker,
            "account": account.id if account else None,
            "thesis": thesis,
            "risk_budget_pct": f"{float(risk_budget_pct):.2f}",
            "target_price": f"{float(target_price):.2f}" if target_price is not None else None,
            "legs": [{
                "leg_number": int(l["leg_number"]),
                "price_target": f"{float(l['price_target']):.2f}",
                "allocation_pct": f"{float(l['allocation_pct']):.2f}",
                "stop_loss_price": f"{float(l['stop_loss_price']):.2f}",
            } for l in legs],
        }
        title = f"Trade plan: {ticker} — {len(legs)} legs"
        lines = [{"label": f"Leg {l['leg_number']}: {float(l['allocation_pct']):.0f}% @ Rs {float(l['price_target']):,.2f}",
                  "ticker": ticker} for l in legs]
        card_preview = {"title": title, "lines": lines, "warnings": []}
        draft = create_draft(
            user=user, account=account, kind=PortfolioActionDraft.Kind.TRADE_PLAN,
            title=title, payload=payload, preview=card_preview,
        )
        return _result(
            f"Drafted a {len(legs)}-leg trade plan for {ticker} (risk budget {float(risk_budget_pct):.1f}%). "
            f"Awaiting your confirmation.",
            card={"type": "proposal",
                  "data": {"draft_id": draft.id, "kind": "TRADE_PLAN", "title": title,
                           "status": "PENDING", "preview": card_preview}},
            _tool_name="propose_trade_plan")

    return await _run()
```
Register `propose_trade_plan,` in `ALL_TOOLS`. Add `tool_id("propose_trade_plan"),` to `PORTFOLIO_MANAGER.tools`.

- [ ] **Step 6: Run to verify it passes**

Run: `docker exec stockastic-backend pytest tests/unit/test_propose_tools.py::TestProposeTradePlan tests/unit/test_portfolio_drafts.py::TestConfirmTradePlan -v`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/chat/tools.py backend/chat/subagents.py backend/tests/unit/test_propose_tools.py backend/tests/unit/test_portfolio_drafts.py
git commit -m "feat(chat): propose_trade_plan tool — confirmable staged plan"
```

---

## Task 10: Manager Scorecard helper

**Files:**
- Modify: `backend/chat/tools.py` (add `_score_candidate` helper)
- Test: `backend/tests/unit/test_scorecard.py`

The scorecard is a pure ranking helper the manager prompt already describes; this task gives it a deterministic, testable implementation the model can lean on (and that documents the policy in code). It does not need its own MCP tool — it is used by the model's reasoning and can be surfaced via the existing read tools. We implement it as a pure function for testability and future reuse.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/unit/test_scorecard.py`:
```python
"""Unit tests for the Manager Scorecard ranking helper."""
from chat.tools import score_candidate


def test_high_winrate_high_return_low_risk_scores_higher():
    strong = score_candidate(expected_return_pct=20.0, win_rate=72.0, concentration_pct=10.0, health_score=80.0)
    weak = score_candidate(expected_return_pct=2.0, win_rate=40.0, concentration_pct=35.0, health_score=30.0)
    assert strong > weak


def test_concentration_penalty_lowers_score():
    base = score_candidate(expected_return_pct=15.0, win_rate=60.0, concentration_pct=10.0, health_score=70.0)
    concentrated = score_candidate(expected_return_pct=15.0, win_rate=60.0, concentration_pct=40.0, health_score=70.0)
    assert concentrated < base


def test_score_is_bounded_0_100():
    s = score_candidate(expected_return_pct=999.0, win_rate=100.0, concentration_pct=0.0, health_score=100.0)
    assert 0.0 <= s <= 100.0
    s2 = score_candidate(expected_return_pct=-999.0, win_rate=0.0, concentration_pct=100.0, health_score=0.0)
    assert 0.0 <= s2 <= 100.0
```

- [ ] **Step 2: Run to verify it fails**

Run: `docker exec stockastic-backend pytest tests/unit/test_scorecard.py -v`
Expected: FAIL — `ImportError: cannot import name 'score_candidate'`.

- [ ] **Step 3: Add the helper**

In `backend/chat/tools.py` (near `_rank_strategy_signals`):
```python
def score_candidate(*, expected_return_pct, win_rate, concentration_pct, health_score):
    """Manager Scorecard: blend return, win rate, and risk into a 0–100 score.

    - return component: expected_return_pct, clamped to [-20, 40] → [0, 1]
    - win-rate component: win_rate (0–100) → [0, 1]
    - risk penalty: concentration above 25% and health below 40 subtract.

    Weights: 45% return, 40% win rate, 15% health; minus a concentration penalty.
    """
    ret = max(-20.0, min(40.0, float(expected_return_pct)))
    ret_norm = (ret + 20.0) / 60.0                      # [0, 1]
    wr_norm = max(0.0, min(100.0, float(win_rate))) / 100.0
    health_norm = max(0.0, min(100.0, float(health_score))) / 100.0

    score = (0.45 * ret_norm + 0.40 * wr_norm + 0.15 * health_norm) * 100.0

    conc = max(0.0, float(concentration_pct))
    if conc > 25.0:
        score -= min(30.0, (conc - 25.0))               # up to -30 for heavy concentration
    return max(0.0, min(100.0, score))
```

- [ ] **Step 4: Run to verify it passes**

Run: `docker exec stockastic-backend pytest tests/unit/test_scorecard.py -v`
Expected: PASS (3 passed).

- [ ] **Step 5: Commit**

```bash
git add backend/chat/tools.py backend/tests/unit/test_scorecard.py
git commit -m "feat(chat): Manager Scorecard ranking helper"
```

---

## Final verification

- [ ] **Run the full new test suite:**

```bash
docker exec stockastic-backend pytest tests/unit/test_portfolio_drafts.py tests/unit/test_propose_tools.py tests/unit/test_portfolio_manager_agent.py tests/unit/test_scorecard.py tests/integration/test_portfolio_drafts_api.py -v
```
Expected: all PASS.

- [ ] **Rebuild frontend and smoke-test each capability in chat:**

```bash
docker compose build frontend && docker compose up -d frontend
```
In the chat UI, verify the manager routes and each proposal confirms end-to-end:
1. "Buy 10 NABIL at 500 in my paper account" → Trade card → Confirm → transaction recorded.
2. "Set a stop at 480 and target 560 on my SHL" → Exits card → Confirm → holding updated.
3. "Optimize and rebalance my portfolio" → Rebalance card → Confirm → trades + targets applied.
4. "Build me a 2-leg plan for NABIL" → Trade Plan card → Confirm → plan appears at /portfolio/plans.

- [ ] **Open a PR** (only when the user asks):

```bash
gh pr create --title "Chat Portfolio Manager — propose-then-confirm" --body "Implements docs/superpowers/specs/2026-06-09-portfolio-manager-chat-design.md"
```

---

## Self-Review notes (already applied)

- **Spec coverage:** Draft/confirm gate (Tasks 1–3), all four capabilities (Tasks 4, 7, 8, 9), agent + routing (Task 5), frontend card (Task 6), scorecard (Task 10), execute-at-drafted-price (no live re-fetch in `_execute_trades`), expiry (`is_expired` + `default_expiry`), idempotency + auth-scoping (Tasks 2–3). All covered.
- **Type consistency:** `payload["trades"]` items use `txn_type` everywhere (executor + propose tools); draft kinds use the `PortfolioActionDraft.Kind` enum throughout; card type is `"proposal"` in both backend tools and the FE registry case; endpoint basename `portfolio-action-drafts` matches `reverse()` calls.
- **Known follow-ups (out of scope, noted for later):** inline draft editing (Edit = Cancel + re-ask in v1); sector/tag target proposals separate from per-ticker rebalance weights; persisted-transcript re-render fetches live draft status via `GET /drafts/{id}/`.
