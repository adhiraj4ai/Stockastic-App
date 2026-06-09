"""Unit tests for chat._user_context — ContextVar-based per-turn state."""
import asyncio
from unittest.mock import Mock

import pytest

from chat import _user_context


def _reset():
    """Clear context vars between tests."""
    _user_context._current_user.set(None)
    _user_context._card_buffer.set(None)


class TestUserManagement:
    def setup_method(self):
        _reset()

    def test_set_and_get_authenticated_user(self):
        user = Mock()
        user.is_authenticated = True
        _user_context.set_user(user)
        assert _user_context.get_user() is user

    def test_get_user_raises_when_not_set(self):
        with pytest.raises(RuntimeError, match="No authenticated user"):
            _user_context.get_user()

    def test_get_user_raises_for_unauthenticated_user(self):
        user = Mock()
        user.is_authenticated = False
        _user_context.set_user(user)
        with pytest.raises(RuntimeError, match="No authenticated user"):
            _user_context.get_user()

    def test_set_user_replaces_previous(self):
        user_a = Mock()
        user_a.is_authenticated = True
        user_b = Mock()
        user_b.is_authenticated = True
        _user_context.set_user(user_a)
        _user_context.set_user(user_b)
        assert _user_context.get_user() is user_b


class TestCardBuffer:
    def setup_method(self):
        _reset()

    def test_reset_cards_initializes_empty_buffer(self):
        _user_context.reset_cards()
        assert _user_context.take_cards() == []

    def test_push_and_take_cards(self):
        _user_context.reset_cards()
        _user_context.push_card("get_stock_quote", {"type": "stock_card", "data": {"ticker": "NABIL"}})
        cards = _user_context.take_cards()
        assert len(cards) == 1
        assert cards[0]["tool"] == "get_stock_quote"
        assert cards[0]["type"] == "stock_card"

    def test_push_multiple_cards_in_order(self):
        _user_context.reset_cards()
        _user_context.push_card("tool_a", {"type": "ta", "data": {}})
        _user_context.push_card("tool_b", {"type": "tb", "data": {}})
        _user_context.push_card("tool_c", {"type": "tc", "data": {}})
        cards = _user_context.take_cards()
        assert [c["tool"] for c in cards] == ["tool_a", "tool_b", "tool_c"]

    def test_take_cards_drains_buffer(self):
        _user_context.reset_cards()
        _user_context.push_card("tool", {"type": "x", "data": {}})
        _user_context.take_cards()  # first drain
        assert _user_context.take_cards() == []  # second drain should be empty

    def test_push_card_silently_drops_when_no_buffer(self):
        # Buffer is None (reset_cards not called yet)
        _user_context.push_card("tool", {"type": "x", "data": {}})  # must not raise

    def test_take_cards_returns_empty_when_no_buffer(self):
        assert _user_context.take_cards() == []

    def test_card_includes_tool_name_as_key(self):
        _user_context.reset_cards()
        _user_context.push_card("get_technicals", {"type": "technicals_card", "data": {"rsi": 45}})
        card = _user_context.take_cards()[0]
        assert card["tool"] == "get_technicals"
        assert card["type"] == "technicals_card"
        assert card["data"]["rsi"] == 45

    @pytest.mark.anyio
    async def test_context_isolated_between_concurrent_async_tasks(self):
        """ContextVars are per-task — two concurrent tasks have separate card buffers."""
        results: dict = {}

        async def task_a():
            _user_context.reset_cards()
            _user_context.push_card("tool_a", {"type": "a", "data": {}})
            await asyncio.sleep(0)  # yield to let task_b run
            results["a"] = _user_context.take_cards()

        async def task_b():
            _user_context.reset_cards()
            # push nothing — should not see task_a's card
            await asyncio.sleep(0)
            results["b"] = _user_context.take_cards()

        await asyncio.gather(task_a(), task_b())

        assert len(results["a"]) == 1
        assert results["b"] == []
