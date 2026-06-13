import json
import pytest
import anyio
from unittest.mock import MagicMock, patch


def _collect_async_gen(agen_factory):
    """Collect all items from an async generator synchronously via anyio."""
    results = []

    async def _drain():
        async for item in agen_factory():
            results.append(item)

    anyio.run(_drain)
    return results


def _run_async(coro_factory):
    """Run an async coroutine synchronously via anyio."""
    result = []

    async def _exec():
        result.append(await coro_factory())

    anyio.run(_exec)
    return result[0]


def test_empty_usage_returns_zero_dict():
    from chat.streaming import _empty_usage
    result = _empty_usage()
    assert result == {
        "input_tokens": 0, "output_tokens": 0,
        "cache_read_input_tokens": 0, "cache_creation_input_tokens": 0,
    }


def test_empty_usage_all_values_are_int():
    from chat.streaming import _empty_usage
    assert all(isinstance(v, int) for v in _empty_usage().values())


def test_accumulate_usage_adds_values():
    from chat.streaming import _accumulate_usage
    total = {"input_tokens": 10, "output_tokens": 5,
             "cache_read_input_tokens": 0, "cache_creation_input_tokens": 0}
    _accumulate_usage(total, {"input_tokens": 3, "output_tokens": 2,
                               "cache_read_input_tokens": 1, "cache_creation_input_tokens": 0})
    assert total["input_tokens"] == 13 and total["output_tokens"] == 7
    assert total["cache_read_input_tokens"] == 1


def test_accumulate_usage_none_is_noop():
    from chat.streaming import _accumulate_usage
    total = {"input_tokens": 5, "output_tokens": 3,
             "cache_read_input_tokens": 0, "cache_creation_input_tokens": 0}
    _accumulate_usage(total, None)
    assert total["input_tokens"] == 5


def test_accumulate_usage_handles_none_values_in_dict():
    from chat.streaming import _accumulate_usage
    total = {"input_tokens": 5, "output_tokens": 0,
             "cache_read_input_tokens": 0, "cache_creation_input_tokens": 0}
    _accumulate_usage(total, {"input_tokens": None, "output_tokens": 2,
                               "cache_read_input_tokens": None, "cache_creation_input_tokens": 0})
    assert total["input_tokens"] == 5 and total["output_tokens"] == 2


def test_handle_stream_event_text_delta():
    from chat.streaming import _handle_stream_event
    msg = MagicMock()
    msg.event = {"type": "content_block_delta", "delta": {"type": "text_delta", "text": "hello"}}
    msg.parent_tool_use_id = None
    blocks: list = []
    seen: set = set()
    frames = _collect_async_gen(lambda: _handle_stream_event(msg, blocks, seen))
    assert len(frames) == 1
    parsed = json.loads(frames[0].decode().split("data: ")[1])
    assert parsed["kind"] == "text" and parsed["text"] == "hello"
    assert parsed["subagent"] is None


def test_handle_stream_event_thinking_delta():
    from chat.streaming import _handle_stream_event
    msg = MagicMock()
    msg.event = {"type": "content_block_delta",
                 "delta": {"type": "thinking_delta", "thinking": "...reasoning..."}}
    msg.parent_tool_use_id = "parent-id"
    blocks: list = []
    seen: set = set()
    frames = _collect_async_gen(lambda: _handle_stream_event(msg, blocks, seen))
    assert len(frames) == 1
    parsed = json.loads(frames[0].decode().split("data: ")[1])
    assert parsed["kind"] == "thinking" and parsed["subagent"] == "subagent"


def test_handle_stream_event_message_start_new_subagent():
    from chat.streaming import _handle_stream_event
    msg = MagicMock()
    msg.event = {"type": "message_start", "message": {"model": "claude-sonnet-4-5"}}
    msg.parent_tool_use_id = "tool-abc"
    blocks: list = []
    seen: set = set()
    frames = _collect_async_gen(lambda: _handle_stream_event(msg, blocks, seen))
    assert len(frames) == 1
    parsed = json.loads(frames[0].decode().split("data: ")[1])
    assert parsed["kind"] == "subagent_start" and "tool-abc" in seen
    assert len(blocks) == 1


def test_handle_stream_event_message_start_duplicate_subagent():
    from chat.streaming import _handle_stream_event
    msg = MagicMock()
    msg.event = {"type": "message_start", "message": {"model": "claude-sonnet-4-5"}}
    msg.parent_tool_use_id = "tool-abc"
    blocks: list = []
    seen = {"tool-abc"}
    frames = _collect_async_gen(lambda: _handle_stream_event(msg, blocks, seen))
    assert frames == [] and len(blocks) == 0


def test_handle_tool_result_blocks_emits_tool_result_frame():
    from chat.streaming import _handle_tool_result_blocks
    block = MagicMock()
    block.tool_use_id = "tool-1"
    block.content = "result text"
    block.is_error = False
    blocks: list = []
    with patch("chat.streaming._user_context") as mock_ctx:
        mock_ctx.take_cards.return_value = []
        frames = _collect_async_gen(
            lambda: _handle_tool_result_blocks([block], blocks, subagent_marker=None)
        )
    assert len(frames) == 1
    parsed = json.loads(frames[0].decode().split("data: ")[1])
    assert parsed["kind"] == "tool_result" and parsed["id"] == "tool-1"
    assert parsed["is_error"] is False


def test_handle_tool_result_blocks_emits_card_frames():
    from chat.streaming import _handle_tool_result_blocks
    block = MagicMock()
    block.tool_use_id = "tool-2"
    block.content = "ok"
    block.is_error = False
    blocks: list = []
    card = {"type": "portfolio_snapshot", "data": {"x": 1}, "tool": "get_portfolio"}
    with patch("chat.streaming._user_context") as mock_ctx:
        mock_ctx.take_cards.return_value = [card]
        frames = _collect_async_gen(
            lambda: _handle_tool_result_blocks([block], blocks, subagent_marker=None)
        )
    assert len(frames) == 2
    card_parsed = json.loads(frames[1].decode().split("data: ")[1])
    assert card_parsed["kind"] == "card" and card_parsed["type"] == "portfolio_snapshot"


def test_handle_result_message_yields_usage_frame():
    from chat.streaming import _handle_result_message, _empty_usage
    msg = MagicMock()
    msg.session_id = "sdk-session-xyz"
    msg.usage = {"input_tokens": 100, "output_tokens": 50,
                 "cache_read_input_tokens": 10, "cache_creation_input_tokens": 5}
    msg.total_cost_usd = 0.002
    msg.duration_ms = 1234
    usage_total = _empty_usage()
    frame, new_session_id = _run_async(
        lambda: _handle_result_message(msg, usage_total, "old-session")
    )
    parsed = json.loads(frame.decode().split("data: ")[1])
    assert parsed["input_tokens"] == 100 and parsed["cost_usd"] == 0.002
    assert new_session_id == "sdk-session-xyz"


def test_handle_result_message_preserves_old_session_id_if_none():
    from chat.streaming import _handle_result_message, _empty_usage
    msg = MagicMock()
    msg.session_id = None
    msg.usage = None
    msg.total_cost_usd = 0.0
    msg.duration_ms = 0
    usage_total = _empty_usage()
    _frame, new_session_id = _run_async(
        lambda: _handle_result_message(msg, usage_total, "old-session")
    )
    assert new_session_id == "old-session"


@pytest.mark.django_db(transaction=True)
def test_persist_turn_creates_chat_message():
    from chat.streaming import _persist_turn
    from chat.models import ChatSession
    from django.contrib.auth.models import User

    async def _test():
        user = await User.objects.acreate(username="stream_test_user", password="pw")
        session = await ChatSession.objects.acreate(user=user, title="test")
        blocks = [{"kind": "text", "text": "Hello world", "subagent": None}]
        usage_total = {"input_tokens": 10, "output_tokens": 5,
                       "cache_read_input_tokens": 0, "cache_creation_input_tokens": 0}
        msg_id = await _persist_turn(session, blocks, usage_total, final_session_id="sdk-123")
        assert msg_id is not None
        await session.arefresh_from_db()
        assert session.sdk_session_id == "sdk-123"

    anyio.run(_test)
