"""TDD tests for total-return surfaces in get_portfolio_overview and get_holdings."""
import asyncio
from decimal import Decimal
from types import SimpleNamespace

import pytest
from django.contrib.auth import get_user_model

from chat import _user_context
from chat.tools import portfolio as ptools

pytestmark = pytest.mark.django_db
User = get_user_model()

_FAKE_SUMMARY = {
    "total_invested": 50000.0,
    "total_unrealized": 5000.0,
    "total_cash_dividends": 4000.0,
    "total_realized_pnl": 0.0,
    "portfolio_total_return": 9000.0,
    "portfolio_total_return_pct": 18.0,
}

_FAKE_TR_HOLDINGS = [
    {"ticker": "NABIL", "total_return_abs": 9000.0, "total_return_pct": 18.0},
]


def _run(coro):
    return asyncio.run(coro)


def _make_metric_item(ticker, qty=100, wacc=500, current_price=550):
    """Create a fake portfolio item with computed metric attributes attached."""
    item = SimpleNamespace(
        ticker=ticker,
        quantity=qty,
        wacc=Decimal(str(wacc)),
        buy_price=Decimal(str(wacc)),
        current_price=Decimal(str(current_price)),
        investment_value=Decimal(str(qty * wacc)),
        current_value=Decimal(str(qty * current_price)),
        gain_loss=Decimal(str(qty * (current_price - wacc))),
        gain_loss_percent=Decimal(str((current_price - wacc) / wacc * 100)),
        day_gain_loss=Decimal("0"),
        sector="Banking",
        signals=None,
        health_score=None,
    )
    return item


def _patch_portfolio_service(monkeypatch, items):
    """Patch PortfolioService.get_portfolio_metrics to return fake items."""
    monkeypatch.setattr(
        ptools.PortfolioService, "get_portfolio_metrics",
        staticmethod(lambda qs: items),
    )


def _fake_compute_overview(u, account_id=None):
    return {"holdings": [], "summary": _FAKE_SUMMARY}


def _fake_compute_holdings(u, account_id=None):
    return {"holdings": _FAKE_TR_HOLDINGS, "summary": {}}


# ── Task 2: get_portfolio_overview ────────────────────────────────────────────


def test_overview_prose_includes_total_return(monkeypatch):
    """Prose must contain 'Total return', formatted value, and pct."""
    user = User.objects.create_user(username="o1", password="p")
    nabil = _make_metric_item("NABIL")
    _patch_portfolio_service(monkeypatch, [nabil])
    monkeypatch.setattr(
        ptools.TotalReturnService, "compute",
        staticmethod(_fake_compute_overview),
    )
    _user_context.set_user(user)
    _user_context.reset_cards()
    result = _run(ptools.get_portfolio_overview.handler({"account_id": None}))
    text = result["content"][0]["text"]
    assert "Total return" in text
    assert "9,000" in text
    assert "18.0" in text


def test_overview_card_contains_total_return_summary(monkeypatch):
    """Card data must carry the full summary dict under 'total_return'."""
    user = User.objects.create_user(username="o2", password="p")
    nabil = _make_metric_item("NABIL")
    _patch_portfolio_service(monkeypatch, [nabil])
    monkeypatch.setattr(
        ptools.TotalReturnService, "compute",
        staticmethod(_fake_compute_overview),
    )
    _user_context.set_user(user)
    _user_context.reset_cards()
    _run(ptools.get_portfolio_overview.handler({"account_id": None}))
    cards = _user_context.take_cards()
    assert cards, "No card was pushed by get_portfolio_overview"
    card = cards[0]
    assert card["data"]["total_return"]["portfolio_total_return"] == 9000.0
    assert card["data"]["total_return"]["portfolio_total_return_pct"] == 18.0


# ── Task 3: get_holdings ──────────────────────────────────────────────────────


def test_holdings_prose_contains_holdings(monkeypatch):
    """Prose must mention holdings count."""
    user = User.objects.create_user(username="h1", password="p")
    nabil = _make_metric_item("NABIL")
    _patch_portfolio_service(monkeypatch, [nabil])
    monkeypatch.setattr(
        ptools.TotalReturnService, "compute",
        staticmethod(_fake_compute_holdings),
    )
    _user_context.set_user(user)
    _user_context.reset_cards()
    result = _run(ptools.get_holdings.handler({"account_id": None}))
    text = result["content"][0]["text"]
    assert "holdings" in text.lower()


def test_holdings_card_rows_include_total_return(monkeypatch):
    """Each row in card data must carry total_return_abs and total_return_pct."""
    user = User.objects.create_user(username="h2", password="p")
    nabil = _make_metric_item("NABIL")
    _patch_portfolio_service(monkeypatch, [nabil])
    monkeypatch.setattr(
        ptools.TotalReturnService, "compute",
        staticmethod(_fake_compute_holdings),
    )
    _user_context.set_user(user)
    _user_context.reset_cards()
    _run(ptools.get_holdings.handler({"account_id": None}))
    cards = _user_context.take_cards()
    assert cards, "No card was pushed by get_holdings"
    card = cards[0]
    holdings = card["data"]["holdings"]
    nabil_row = next((r for r in holdings if r["ticker"] == "NABIL"), None)
    assert nabil_row is not None, "NABIL row missing from holdings card"
    assert nabil_row["total_return_abs"] == 9000.0
    assert nabil_row["total_return_pct"] == 18.0


def test_holdings_unknown_ticker_defaults_to_zero(monkeypatch):
    """A holding not in TotalReturnService result must default total_return to 0.0."""
    user = User.objects.create_user(username="h3", password="p")
    nabil = _make_metric_item("NABIL")
    _patch_portfolio_service(monkeypatch, [nabil])
    # Return empty holdings list — NABIL absent from total-return service
    monkeypatch.setattr(
        ptools.TotalReturnService, "compute",
        staticmethod(lambda u, account_id=None: {"holdings": [], "summary": {}}),
    )
    _user_context.set_user(user)
    _user_context.reset_cards()
    _run(ptools.get_holdings.handler({"account_id": None}))
    cards = _user_context.take_cards()
    card = cards[0]
    nabil_row = next(r for r in card["data"]["holdings"] if r["ticker"] == "NABIL")
    assert nabil_row["total_return_abs"] == 0.0
    assert nabil_row["total_return_pct"] == 0.0
