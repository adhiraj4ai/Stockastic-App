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


def _process_one_trade(user, account, t):
    """Process a single trade dict: run PortfolioService, create PortfolioTransaction row."""
    qty = int(t["quantity"])
    rate = Decimal(str(t["rate"]))
    metrics = PortfolioService.process_transaction(
        user=user, ticker=t["ticker"], txn_type=t["txn_type"],
        quantity=qty, rate=rate, account=account,
    )
    txn = PortfolioTransaction.objects.create(
        user=user, account=account, ticker=t["ticker"],
        transaction_type=t["txn_type"], quantity=qty, rate=rate,
        amount=metrics["amount"], commission=metrics["commission"],
        sebon_fee=metrics["sebon_fee"], dp_charge=metrics["dp_charge"],
        cgt=metrics["cgt"], receivable_amount=metrics["receivable_amount"],
        transaction_date=timezone.now(),
    )
    msg = f"{t['txn_type']} {qty} {t['ticker']} @ Rs {rate:,.2f}"
    return txn.id, msg


def _execute_trades(user, account, trades):
    """Run each trade through process_transaction and record a PortfolioTransaction."""
    txn_ids, messages = [], []
    for t in trades:
        txn_id, msg = _process_one_trade(user, account, t)
        txn_ids.append(txn_id)
        messages.append(msg)
    return txn_ids, messages


def _execute_exits(user, payload):
    updated = []
    skipped = []
    for it in payload.get("items", []):
        item = PortfolioItem.objects.filter(user=user, id=it["item_id"]).first()
        if not item:
            skipped.append(it["item_id"])
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
    message = f"Set exits on {', '.join(updated) or 'no holdings'}."
    if skipped:
        message += f" Skipped {len(skipped)} holding(s) no longer found."
    return {"updated_tickers": updated, "skipped_item_ids": skipped, "message": message}


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


def _guard_draft_status(draft):
    """Pre-lock validation: raise DraftError or return early if already confirmed."""
    if draft.status == PortfolioActionDraft.Status.CONFIRMED:
        return draft.result
    if draft.status != PortfolioActionDraft.Status.PENDING:
        raise DraftError(f"Draft is {draft.status} and cannot be confirmed.")
    if draft.is_expired:
        draft.status = PortfolioActionDraft.Status.EXPIRED
        draft.save(update_fields=["status"])
        raise DraftError("Draft has expired — ask the manager to re-draft at current prices.")
    return None


def _dispatch_kind(locked):
    """Dispatch execution to the appropriate handler based on draft kind."""
    user, account, payload, kind = locked.user, locked.account, locked.payload, locked.kind
    if kind == PortfolioActionDraft.Kind.TRADE:
        txn_ids, messages = _execute_trades(user, account, payload["trades"])
        return {"transaction_ids": txn_ids, "message": "; ".join(messages)}
    if kind == PortfolioActionDraft.Kind.EXITS:
        return _execute_exits(user, payload)
    if kind == PortfolioActionDraft.Kind.REBALANCE:
        return _execute_rebalance(user, account, payload)
    if kind == PortfolioActionDraft.Kind.TRADE_PLAN:
        return _execute_trade_plan(user, payload)
    raise DraftError(f"Unknown draft kind {kind}")


def _commit_draft(locked, draft, result):
    """Persist CONFIRMED status and sync the caller's draft instance."""
    locked.status = PortfolioActionDraft.Status.CONFIRMED
    locked.confirmed_at = timezone.now()
    locked.result = result
    locked.save(update_fields=["status", "confirmed_at", "result"])
    draft.status = locked.status
    draft.confirmed_at = locked.confirmed_at
    draft.result = locked.result


def confirm_draft(draft):
    """Execute a PENDING draft. Idempotent on CONFIRMED. Raises DraftError otherwise.

    The PENDING→CONFIRMED execution path takes a row lock (select_for_update) and
    re-checks status under the lock, so concurrent/double confirms cannot
    double-execute: the second caller blocks, then sees CONFIRMED and returns the
    same result. Terminal-state and expiry checks happen before the lock (an
    expired draft is marked EXPIRED in its own committed save, then rejected).
    """
    early = _guard_draft_status(draft)
    if early is not None:
        return early

    with transaction.atomic():
        locked = PortfolioActionDraft.objects.select_for_update().get(pk=draft.pk)
        if locked.status == PortfolioActionDraft.Status.CONFIRMED:
            return locked.result
        if locked.status != PortfolioActionDraft.Status.PENDING:
            raise DraftError(f"Draft is {locked.status} and cannot be confirmed.")
        result = _dispatch_kind(locked)
        _commit_draft(locked, draft, result)

    return result
