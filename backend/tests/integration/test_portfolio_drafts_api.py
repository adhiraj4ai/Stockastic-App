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
        assert len(res.data) == 1
        assert res.data[0]["user"] == user.id

    def test_cancel_confirmed_returns_409(self, auth_client, django_user_model):
        user = django_user_model.objects.get(username="testuser")
        draft = _draft_for(user)
        draft.status = PortfolioActionDraft.Status.CONFIRMED
        draft.save(update_fields=["status"])
        res = auth_client.post(reverse("portfolio-action-drafts-cancel", args=[draft.id]))
        assert res.status_code == status.HTTP_409_CONFLICT

    def test_status_filter_returns_only_matching(self, auth_client, django_user_model):
        user = django_user_model.objects.get(username="testuser")
        pending = _draft_for(user)
        confirmed = _draft_for(user)
        confirmed.status = PortfolioActionDraft.Status.CONFIRMED
        confirmed.save(update_fields=["status"])
        res = auth_client.get(reverse("portfolio-action-drafts-list") + "?status=pending")
        assert res.status_code == status.HTTP_200_OK
        ids = [row["id"] for row in res.data]
        assert pending.id in ids
        assert confirmed.id not in ids
