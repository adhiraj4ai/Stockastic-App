"""Tests for the three plan/verdict/catalyst chat tools.

Calling convention follows the existing unit tests in tests/unit/test_propose_tools.py:
    asyncio.run(tool.handler(args_dict))
in sync (non-async) test functions.  The @tool decorator returns an SdkMcpTool;
its .handler attribute is the underlying async function.
"""
import asyncio
from datetime import date, timedelta
from decimal import Decimal
from unittest.mock import patch

import pytest

from chat import _user_context


# ─────────────────────────────────────────────────────────────────────────────
# Helper
# ─────────────────────────────────────────────────────────────────────────────

def _call(tool, args):
    """Invoke a @tool-decorated async function synchronously.

    Our plan/verdict tools do not touch the current user so we only need to
    reset the card buffer.
    """
    _user_context.reset_cards()
    return asyncio.run(tool.handler(args))


# ─────────────────────────────────────────────────────────────────────────────
# get_tomorrows_plan
# ─────────────────────────────────────────────────────────────────────────────


def _nabil_pick() -> dict:
    """Return a single NABIL pick dict for use in plan payloads."""
    return {
        "symbol": "NABIL", "confluence_score": 81, "direction": "BUY", "catalyst": None,
        "entry": {"price": 610.0, "zone_low": 598.4, "zone_high": 625.6,
                  "status": "IN_ZONE", "last_signal_age_days": 1, "latest_close": 610.0},
        "targets": {"tp1": 640.0, "sl": 585.0},
        "analog": {"n": 14, "fwd_1d_median_pct": 0.8, "fwd_3d_median_pct": 2.1,
                   "fwd_5d_median_pct": 3.2, "win_rate_3d": 0.64},
    }


def _nabil_pick_payload() -> dict:
    """Return a DailyTradingPlan payload with a single NABIL pick."""
    return {
        "picks": [_nabil_pick()],
        "watch": [], "exits": [], "catalysts": [], "market_context": {},
        "entry_statuses": {"NABIL": "IN_ZONE"},
    }


@pytest.mark.django_db(transaction=True)
def test_get_tomorrows_plan_with_picks():
    """Plan with one pick: prose must contain the symbol and confluence score."""
    from chat.tools import get_tomorrows_plan
    from stocks.models import DailyTradingPlan

    DailyTradingPlan.objects.create(
        date=date(2026, 6, 15),
        regime="RISK_ON",
        breadth=0.58,
        payload=_nabil_pick_payload(),
    )

    result = _call(get_tomorrows_plan, {})

    assert result["is_error"] is False
    text = result["content"][0]["text"]
    assert "NABIL" in text
    assert "81" in text
    assert "2026-06-15" in text
    assert "RISK_ON" in text


@pytest.mark.django_db(transaction=True)
def test_get_tomorrows_plan_no_plan():
    """When no DailyTradingPlan exists the tool returns a friendly no-plan message."""
    from chat.tools import get_tomorrows_plan

    result = _call(get_tomorrows_plan, {})

    assert result["is_error"] is False
    text = result["content"][0]["text"]
    assert "No trading plan" in text


@pytest.mark.django_db(transaction=True)
def test_get_tomorrows_plan_empty_picks():
    """Picks list is empty → 'No qualifying setups' line in prose."""
    from chat.tools import get_tomorrows_plan
    from stocks.models import DailyTradingPlan

    DailyTradingPlan.objects.create(
        date=date(2026, 6, 16),
        regime="RISK_OFF",
        breadth=0.22,
        payload={"picks": [], "watch": [], "exits": [], "catalysts": [], "market_context": {}},
    )

    result = _call(get_tomorrows_plan, {})

    assert result["is_error"] is False
    text = result["content"][0]["text"]
    assert "No qualifying setups" in text


# ─────────────────────────────────────────────────────────────────────────────
# get_ticker_verdict
# ─────────────────────────────────────────────────────────────────────────────


def _nabil_fake_verdict() -> dict:
    """Return a fully-populated fake verdict for NABIL."""
    return {
        "symbol": "NABIL",
        "as_of": "2026-06-11",
        "confluence_score": 81,
        "components": {
            "agreeing_engines": ["SMART_MONEY", "ICHIMOKU", "VOLUME_BREAKOUT"],
            "conflicting_engines": [],
            "opportunity": {"trust": "CONFIRMED", "pvalue": 0.02},
            "accumulation": {"signal": "strong"},
            "sector": {"intensity": 12.4},
        },
        "entry": {
            "price": 610.0,
            "zone_low": 598.4,
            "zone_high": 625.6,
            "status": "IN_ZONE",
            "last_signal_age_days": 1,
            "latest_close": 610.0,
        },
        "targets": {"tp1": 640.0, "sl": 585.0},
        "episodes": [],
        "analog": {"n": 14, "fwd_3d_median_pct": 2.1, "win_rate_3d": 0.64},
        "catalyst": {"type": "BOOK_CLOSE", "date": "2026-06-18", "days_away": 6, "detail": "test"},
    }


def _nosl_fake_verdict() -> dict:
    """Return a minimal fake verdict for NOSL (no tp1, sl only)."""
    return {
        "symbol": "NOSL",
        "as_of": "2026-06-11",
        "confluence_score": 55,
        "components": {
            "agreeing_engines": ["SMART_MONEY"],
            "conflicting_engines": [],
            "opportunity": {"trust": "UNCONFIRMED", "pvalue": None},
            "accumulation": {"signal": "weak"},
            "sector": {"intensity": None},
        },
        "entry": {
            "price": 600.0,
            "zone_low": 590.0,
            "zone_high": 615.0,
            "status": "IN_ZONE",
            "last_signal_age_days": 2,
            "latest_close": 600.0,
        },
        "targets": {"tp1": None, "sl": 585.0},
        "episodes": [],
        "analog": None,
        "catalyst": None,
    }


@pytest.mark.django_db(transaction=True)
def test_get_ticker_verdict_from_cache():
    """Pre-seeding the Django cache with a fake verdict bypasses build_verdict
    entirely and exercises the prose-rendering branch."""
    from django.core.cache import cache
    from chat.tools import get_ticker_verdict

    cache.set("ticker_verdict:NABIL", _nabil_fake_verdict(), 900)
    try:
        result = _call(get_ticker_verdict, {"symbol": "NABIL"})
    finally:
        cache.delete("ticker_verdict:NABIL")

    assert result["is_error"] is False
    text = result["content"][0]["text"]
    assert "NABIL" in text
    assert "81" in text
    assert "IN_ZONE" in text
    assert "CONFIRMED" in text


@pytest.mark.django_db(transaction=True)
def test_get_ticker_verdict_sl_without_tp():
    """When tp1 is None but sl is set the prose must still render the stop-loss value."""
    from django.core.cache import cache
    from chat.tools import get_ticker_verdict

    cache.set("ticker_verdict:NOSL", _nosl_fake_verdict(), 900)
    try:
        result = _call(get_ticker_verdict, {"symbol": "NOSL"})
    finally:
        cache.delete("ticker_verdict:NOSL")

    assert result["is_error"] is False
    text = result["content"][0]["text"]
    assert "585" in text


@pytest.mark.django_db(transaction=True)
def test_get_ticker_verdict_no_symbol():
    """Missing symbol returns an error result."""
    from chat.tools import get_ticker_verdict

    result = _call(get_ticker_verdict, {})

    assert result["is_error"] is True
    assert "symbol" in result["content"][0]["text"].lower()


@pytest.mark.django_db(transaction=True)
def test_get_ticker_verdict_build_failure():
    """When build_verdict raises, the tool returns a graceful error."""
    from django.core.cache import cache
    from chat.tools import get_ticker_verdict

    cache.delete("ticker_verdict:ERRSYM")

    with patch("stocks.services.ticker_verdict.build_verdict", side_effect=RuntimeError("no data")):
        result = _call(get_ticker_verdict, {"symbol": "ERRSYM"})

    assert result["is_error"] is True
    assert "ERRSYM" in result["content"][0]["text"]


# ─────────────────────────────────────────────────────────────────────────────
# get_upcoming_catalysts
# ─────────────────────────────────────────────────────────────────────────────


@pytest.mark.django_db(transaction=True)
def test_get_upcoming_catalysts_seeded_dividend():
    """A seeded Dividend with a book_close_date within 14d appears in the output."""
    from stocks.models.fundamentals import Dividend
    from chat.tools import get_upcoming_catalysts

    today = date.today()
    close_date = today + timedelta(days=6)
    Dividend.objects.create(
        ticker="NABIL",
        fiscal_year="2081/82",
        bonus_percent=Decimal("10.00"),
        cash_percent=Decimal("5.00"),
        book_close_date=close_date,
    )

    result = _call(get_upcoming_catalysts, {})

    assert result["is_error"] is False
    text = result["content"][0]["text"]
    assert "NABIL" in text


@pytest.mark.django_db(transaction=True)
def test_get_upcoming_catalysts_symbol_filter():
    """Symbol filter returns only that symbol's catalysts."""
    from stocks.models.fundamentals import Dividend
    from chat.tools import get_upcoming_catalysts

    today = date.today()
    for sym, days in [("NICA", 5), ("SCB", 8)]:
        Dividend.objects.create(
            ticker=sym,
            fiscal_year="2081/82",
            bonus_percent=Decimal("5.00"),
            cash_percent=Decimal("2.00"),
            book_close_date=today + timedelta(days=days),
        )

    result = _call(get_upcoming_catalysts, {"symbol": "NICA"})
    text = result["content"][0]["text"]
    assert "NICA" in text
    assert "SCB" not in text


@pytest.mark.django_db(transaction=True)
def test_get_upcoming_catalysts_empty():
    """No catalysts within the window → friendly empty message."""
    from chat.tools import get_upcoming_catalysts

    result = _call(get_upcoming_catalysts, {"days": 1})
    text = result["content"][0]["text"]
    assert "No " in text


@pytest.mark.django_db(transaction=True)
def test_get_upcoming_catalysts_days_clamping():
    """Days outside [1,60] are clamped silently; calls must not error."""
    from chat.tools import get_upcoming_catalysts

    r1 = _call(get_upcoming_catalysts, {"days": 0})
    r2 = _call(get_upcoming_catalysts, {"days": 200})
    assert r1["is_error"] is False
    assert r2["is_error"] is False
