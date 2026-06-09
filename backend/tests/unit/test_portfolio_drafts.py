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
