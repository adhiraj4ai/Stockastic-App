"""Tests for the broker-intelligence chat tools."""
import asyncio

import pytest

from chat import tools as chat_tools

pytestmark = pytest.mark.django_db(transaction=True)


def _call(tool, args):
    return asyncio.run(tool.handler(args))


def _text(result):
    return result["content"][0]["text"]


NEW_TOOLS = [
    "get_accumulation_flows", "get_smart_money_flows", "get_broker_trends",
    "get_broker_focus_ranking", "get_broker_favorites", "get_navigator_signals",
    "get_below_cost_positions", "get_accumulation_history", "get_share_transfers",
    "get_broker_portfolio", "get_accumulation_forecast",
]


def test_all_new_tools_registered():
    names = {t.name for t in chat_tools.ALL_TOOLS}
    assert set(NEW_TOOLS) <= names


def test_accumulation_flows_happy_path():
    res = _call(chat_tools.get_accumulation_flows, {"range": "1D"})
    assert "content" in res
    assert isinstance(_text(res), str) and _text(res)


def test_broker_favorites_requires_broker_id():
    res = _call(chat_tools.get_broker_favorites, {"range": "3M"})
    assert res.get("is_error") is True
    assert "broker" in _text(res).lower()


def test_share_transfers_requires_all_args():
    res = _call(chat_tools.get_share_transfers, {"symbol": "NABIL"})
    assert res.get("is_error") is True


def test_accumulation_history_requires_broker_and_symbol():
    res = _call(chat_tools.get_accumulation_history, {"symbol": "NABIL"})
    assert res.get("is_error") is True


def test_forecast_requires_symbol():
    res = _call(chat_tools.get_accumulation_forecast, {})
    assert res.get("is_error") is True


def test_navigator_signals_runs_without_args():
    res = _call(chat_tools.get_navigator_signals, {})
    assert "content" in res
