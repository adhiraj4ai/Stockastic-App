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
