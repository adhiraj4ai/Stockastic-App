"""Unit tests for PortfolioActionDraft model + confirm_draft service."""
import pytest
from datetime import timedelta
from decimal import Decimal

from django.utils import timezone

from stocks.models.portfolio import (
    PortfolioActionDraft, PortfolioAccount, PortfolioItem,
    PortfolioTransaction, PortfolioTarget, TransactionType,
)
from stocks.services.portfolio_drafts import (
    confirm_draft, create_draft, default_expiry, DraftError,
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
