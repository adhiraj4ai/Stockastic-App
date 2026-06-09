"""Unit tests for the chat portfolio-manager propose_* tools.

Each propose tool must create a PENDING PortfolioActionDraft with a
self-contained payload and NOT mutate portfolio state at propose time.
"""
import asyncio
from decimal import Decimal
from unittest.mock import patch

import pytest

from chat import _user_context
from chat.tools import propose_trade, propose_exits, propose_rebalance
from stocks.models.portfolio import (
    PortfolioActionDraft, PortfolioAccount, PortfolioItem, PortfolioTransaction,
)


def _call(tool, args, user):
    _user_context.set_user(user)
    _user_context.reset_cards()
    # An SDK @tool object is an SdkMcpTool; .handler is the underlying async fn
    # (confirmed: dir(get_holdings) -> name, handler, input_schema, description).
    return asyncio.run(tool.handler(args))


@pytest.mark.django_db(transaction=True)
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


@pytest.mark.django_db(transaction=True)
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


@pytest.mark.django_db(transaction=True)
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
