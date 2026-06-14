"""Integration tests for stream_chat — mocks run_chat_session, uses real DB.

SDK types (AssistantMessage, TextBlock, etc.) are replaced at the module level
so isinstance() checks in streaming.py work correctly with our fake objects.
"""
import asyncio
import json
from unittest import mock

import pytest

import chat.streaming as _streaming
from chat.models import ChatMessage, ChatSession


# ---------------------------------------------------------------------------
# Fake SDK types — mimic the interface that streaming.py cares about.
# We patch chat.streaming.<ClassName> so isinstance() resolves to our fakes.
# ---------------------------------------------------------------------------

class _TextBlock:
    def __init__(self, text: str):
        self.text = text


class _ThinkingBlock:
    def __init__(self, thinking: str):
        self.thinking = thinking


class _ToolUseBlock:
    def __init__(self, name: str, input: dict, id: str):
        self.name = name
        self.input = input
        self.id = id


class _ToolResultBlock:
    def __init__(self, content, tool_use_id: str, is_error: bool = False):
        self.content = content
        self.tool_use_id = tool_use_id
        self.is_error = is_error


class _AssistantMessage:
    def __init__(self, content, session_id="", parent_tool_use_id="", model="sonnet", usage=None):
        self.content = content
        self.session_id = session_id
        self.parent_tool_use_id = parent_tool_use_id
        self.model = model
        self.usage = usage or {}


class _ResultMessage:
    def __init__(self, session_id="", usage=None, total_cost_usd=0.0, duration_ms=100):
        self.session_id = session_id
        self.usage = usage or {}
        self.total_cost_usd = total_cost_usd
        self.duration_ms = duration_ms


class _UserMessage:
    pass


class _SystemMessage:
    pass


class _StreamEvent:
    """Fake StreamEvent for token-level delta testing.

    streaming.py checks isinstance(msg, StreamEvent) and reads msg.event
    (a dict with "type" and "delta" keys) plus msg.parent_tool_use_id.
    """
    def __init__(self, event: dict, parent_tool_use_id: str = ""):
        self.event = event
        self.parent_tool_use_id = parent_tool_use_id


_SDK_PATCHES = {
    "AssistantMessage": _AssistantMessage,
    "UserMessage": _UserMessage,
    "SystemMessage": _SystemMessage,
    "TextBlock": _TextBlock,
    "ThinkingBlock": _ThinkingBlock,
    "ToolUseBlock": _ToolUseBlock,
    "ToolResultBlock": _ToolResultBlock,
    "ResultMessage": _ResultMessage,
    "StreamEvent": _StreamEvent,
}


def _patch_sdk():
    """Return a context manager that patches all SDK types in streaming.py."""
    return mock.patch.multiple(_streaming, **_SDK_PATCHES)


def _run(coro):
    return asyncio.run(coro)


def _collect_frames(chunks: list[bytes]) -> list[dict]:
    """Parse raw SSE bytes into a list of {event, data} dicts."""
    frames = []
    raw = b"".join(chunks).decode("utf-8")
    for block in raw.split("\n\n"):
        block = block.strip()
        if not block:
            continue
        event = "message"
        data_str = ""
        for line in block.split("\n"):
            if line.startswith("event:"):
                event = line[6:].strip()
            elif line.startswith("data:"):
                data_str = line[5:].strip()
        if data_str:
            frames.append({"event": event, "data": json.loads(data_str)})
    return frames


@pytest.mark.django_db(transaction=True)
class TestStreamChatFrameEmission:
    def _make_session(self, create_user):
        user = create_user(username="streamtest", password="pw")
        session = ChatSession.objects.create(user=user, title="Stream Test")
        return user, session

    def test_yields_assistant_start_as_first_frame(self, create_user):
        user, session = self._make_session(create_user)

        async def mock_run(*, user, session, prompt):
            return
            yield  # make it an async generator

        async def collect():
            chunks = []
            with _patch_sdk(), mock.patch.object(_streaming, "run_chat_session", mock_run):
                async for chunk in _streaming.stream_chat(user=user, session=session, prompt="hi"):
                    chunks.append(chunk)
            return chunks

        chunks = _run(collect())
        frames = _collect_frames(chunks)
        assert frames[0]["event"] == "assistant_start"

    def test_text_block_emits_text_frame(self, create_user):
        """Text is streamed live via StreamEvent content_block_delta, not AssistantMessage."""
        user, session = self._make_session(create_user)

        async def mock_run(*, user, session, prompt):
            # Emit a StreamEvent delta — this is how the real SDK delivers token-level text.
            yield _StreamEvent({"type": "content_block_delta", "delta": {"type": "text_delta", "text": "NABIL closed at 1250"}})
            # Follow up with the full AssistantMessage (streaming.py persists from here but doesn't re-yield text).
            yield _AssistantMessage(
                content=[_TextBlock("NABIL closed at 1250")],
                session_id="sdk-001",
            )
            yield _ResultMessage(session_id="sdk-001")

        async def collect():
            chunks = []
            with _patch_sdk(), mock.patch.object(_streaming, "run_chat_session", mock_run):
                async for chunk in _streaming.stream_chat(user=user, session=session, prompt="NABIL?"):
                    chunks.append(chunk)
            return chunks

        frames = _collect_frames(_run(collect()))
        text_frames = [f for f in frames if f["event"] == "text"]
        assert len(text_frames) == 1
        assert text_frames[0]["data"]["text"] == "NABIL closed at 1250"

    def test_thinking_block_emits_thinking_frame(self, create_user):
        """Thinking is streamed live via StreamEvent thinking_delta, not AssistantMessage."""
        user, session = self._make_session(create_user)

        async def mock_run(*, user, session, prompt):
            # Emit a StreamEvent thinking delta.
            yield _StreamEvent({"type": "content_block_delta", "delta": {"type": "thinking_delta", "thinking": "Let me analyze the RSI..."}})
            yield _AssistantMessage(
                content=[_ThinkingBlock("Let me analyze the RSI...")],
                session_id="sdk-002",
            )
            yield _ResultMessage(session_id="sdk-002")

        async def collect():
            chunks = []
            with _patch_sdk(), mock.patch.object(_streaming, "run_chat_session", mock_run):
                async for chunk in _streaming.stream_chat(user=user, session=session, prompt="think"):
                    chunks.append(chunk)
            return chunks

        frames = _collect_frames(_run(collect()))
        thinking_frames = [f for f in frames if f["event"] == "thinking"]
        assert len(thinking_frames) == 1
        assert "RSI" in thinking_frames[0]["data"]["text"]

    def test_tool_use_block_emits_tool_use_frame(self, create_user):
        user, session = self._make_session(create_user)

        async def mock_run(*, user, session, prompt):
            yield _AssistantMessage(
                content=[_ToolUseBlock(name="get_stock_quote", input={"ticker": "NABIL"}, id="tu_01")],
                session_id="sdk-003",
            )
            yield _ResultMessage(session_id="sdk-003")

        async def collect():
            chunks = []
            with _patch_sdk(), mock.patch.object(_streaming, "run_chat_session", mock_run):
                async for chunk in _streaming.stream_chat(user=user, session=session, prompt="quote"):
                    chunks.append(chunk)
            return chunks

        frames = _collect_frames(_run(collect()))
        tool_frames = [f for f in frames if f["event"] == "tool_use"]
        assert len(tool_frames) == 1
        assert tool_frames[0]["data"]["tool"] == "get_stock_quote"
        assert tool_frames[0]["data"]["input"]["ticker"] == "NABIL"

    def test_tool_result_block_emits_tool_result_frame(self, create_user):
        user, session = self._make_session(create_user)

        async def mock_run(*, user, session, prompt):
            yield _AssistantMessage(
                content=[
                    _ToolUseBlock("get_stock_quote", {"ticker": "NABIL"}, "tu_01"),
                    _ToolResultBlock(content="LTP: 1250", tool_use_id="tu_01"),
                ],
                session_id="sdk-004",
            )
            yield _ResultMessage(session_id="sdk-004")

        async def collect():
            chunks = []
            with _patch_sdk(), mock.patch.object(_streaming, "run_chat_session", mock_run):
                async for chunk in _streaming.stream_chat(user=user, session=session, prompt="quote"):
                    chunks.append(chunk)
            return chunks

        frames = _collect_frames(_run(collect()))
        result_frames = [f for f in frames if f["event"] == "tool_result"]
        assert len(result_frames) == 1
        assert result_frames[0]["data"]["text"] == "LTP: 1250"
        assert result_frames[0]["data"]["is_error"] is False

    def test_error_tool_result_sets_is_error_true(self, create_user):
        user, session = self._make_session(create_user)

        async def mock_run(*, user, session, prompt):
            yield _AssistantMessage(
                content=[
                    _ToolUseBlock("get_stock_quote", {}, "tu_err"),
                    _ToolResultBlock(content="Symbol not found", tool_use_id="tu_err", is_error=True),
                ],
                session_id="sdk-005",
            )
            yield _ResultMessage(session_id="sdk-005")

        async def collect():
            chunks = []
            with _patch_sdk(), mock.patch.object(_streaming, "run_chat_session", mock_run):
                async for chunk in _streaming.stream_chat(user=user, session=session, prompt="bad"):
                    chunks.append(chunk)
            return chunks

        frames = _collect_frames(_run(collect()))
        result_frames = [f for f in frames if f["event"] == "tool_result"]
        assert result_frames[0]["data"]["is_error"] is True

    def test_subagent_message_emits_subagent_start(self, create_user):
        user, session = self._make_session(create_user)

        async def mock_run(*, user, session, prompt):
            yield _AssistantMessage(
                content=[_TextBlock("Market is bullish")],
                session_id="sdk-006",
                parent_tool_use_id="task_01",
                model="claude-sonnet",
            )
            yield _ResultMessage(session_id="sdk-006")

        async def collect():
            chunks = []
            with _patch_sdk(), mock.patch.object(_streaming, "run_chat_session", mock_run):
                async for chunk in _streaming.stream_chat(user=user, session=session, prompt="subagent"):
                    chunks.append(chunk)
            return chunks

        frames = _collect_frames(_run(collect()))
        subagent_starts = [f for f in frames if f["event"] == "subagent_start"]
        assert len(subagent_starts) == 1
        assert subagent_starts[0]["data"]["parent"] == "task_01"

    def test_usage_frame_emitted_on_result_message(self, create_user):
        user, session = self._make_session(create_user)

        async def mock_run(*, user, session, prompt):
            yield _AssistantMessage(content=[], session_id="sdk-007")
            yield _ResultMessage(
                session_id="sdk-007",
                usage={"input_tokens": 500, "output_tokens": 200,
                       "cache_read_input_tokens": 100, "cache_creation_input_tokens": 50},
                total_cost_usd=0.005,
                duration_ms=1200,
            )

        async def collect():
            chunks = []
            with _patch_sdk(), mock.patch.object(_streaming, "run_chat_session", mock_run):
                async for chunk in _streaming.stream_chat(user=user, session=session, prompt="usage"):
                    chunks.append(chunk)
            return chunks

        frames = _collect_frames(_run(collect()))
        usage_frames = [f for f in frames if f["event"] == "usage"]
        assert len(usage_frames) == 1
        d = usage_frames[0]["data"]
        assert d["input_tokens"] == 500
        assert d["output_tokens"] == 200
        assert d["cost_usd"] == 0.005

    def test_exception_in_run_emits_error_frame(self, create_user):
        user, session = self._make_session(create_user)

        async def mock_run(*, user, session, prompt):
            raise RuntimeError("Claude SDK unavailable")
            yield  # never reached — forces async generator

        async def collect():
            chunks = []
            with _patch_sdk(), mock.patch.object(_streaming, "run_chat_session", mock_run):
                async for chunk in _streaming.stream_chat(user=user, session=session, prompt="boom"):
                    chunks.append(chunk)
            return chunks

        frames = _collect_frames(_run(collect()))
        error_frames = [f for f in frames if f["event"] == "error"]
        assert len(error_frames) == 1
        # Error message is sanitized — original exception text must NOT leak to the client.
        msg = error_frames[0]["data"]["message"]
        assert "Claude SDK unavailable" not in msg
        assert "internal error" in msg.lower()
        # A short ref ID should be present so ops can correlate with server logs.
        assert "ref " in msg

    def test_done_frame_is_last(self, create_user):
        user, session = self._make_session(create_user)

        async def mock_run(*, user, session, prompt):
            yield _AssistantMessage(content=[_TextBlock("ok")], session_id="sdk-end")
            yield _ResultMessage(session_id="sdk-end")

        async def collect():
            chunks = []
            with _patch_sdk(), mock.patch.object(_streaming, "run_chat_session", mock_run):
                async for chunk in _streaming.stream_chat(user=user, session=session, prompt="done?"):
                    chunks.append(chunk)
            return chunks

        frames = _collect_frames(_run(collect()))
        assert frames[-1]["event"] == "done"


@pytest.mark.django_db(transaction=True)
class TestStreamChatPersistence:
    def _make_session(self, create_user, username="persist"):
        user = create_user(username=username, password="pw")
        session = ChatSession.objects.create(user=user, title="Persist")
        return user, session

    def test_assistant_message_persisted_after_stream(self, create_user):
        user, session = self._make_session(create_user)

        async def mock_run(*, user, session, prompt):
            yield _AssistantMessage(content=[_TextBlock("Hello world")], session_id="sdk-p1")
            yield _ResultMessage(session_id="sdk-p1")

        async def run_it():
            with _patch_sdk(), mock.patch.object(_streaming, "run_chat_session", mock_run):
                async for _ in _streaming.stream_chat(user=user, session=session, prompt="hi"):
                    pass

        _run(run_it())
        msgs = ChatMessage.objects.filter(session=session, role="assistant")
        assert msgs.count() == 1
        assert msgs.first().text == "Hello world"

    def test_sdk_session_id_saved_to_session(self, create_user):
        user, session = self._make_session(create_user, username="persist2")

        async def mock_run(*, user, session, prompt):
            yield _AssistantMessage(content=[], session_id="sdk-new-xyz")
            yield _ResultMessage(session_id="sdk-new-xyz")

        async def run_it():
            with _patch_sdk(), mock.patch.object(_streaming, "run_chat_session", mock_run):
                async for _ in _streaming.stream_chat(user=user, session=session, prompt="hi"):
                    pass

        _run(run_it())
        session.refresh_from_db()
        assert session.sdk_session_id == "sdk-new-xyz"

    def test_blocks_stored_with_correct_structure(self, create_user):
        user, session = self._make_session(create_user, username="persist3")

        async def mock_run(*, user, session, prompt):
            yield _AssistantMessage(
                content=[
                    _TextBlock("First chunk"),
                    _ToolUseBlock("get_stock_quote", {"ticker": "NTC"}, "tu_01"),
                    _ToolResultBlock("LTP: 700", "tu_01"),
                ],
                session_id="sdk-p3",
            )
            yield _ResultMessage(session_id="sdk-p3")

        async def run_it():
            with _patch_sdk(), mock.patch.object(_streaming, "run_chat_session", mock_run):
                async for _ in _streaming.stream_chat(user=user, session=session, prompt="NTC?"):
                    pass

        _run(run_it())
        msg = ChatMessage.objects.get(session=session, role="assistant")
        kinds = [b["kind"] for b in msg.blocks]
        assert "text" in kinds
        assert "tool_use" in kinds
        assert "tool_result" in kinds

    def test_cards_in_buffer_emitted_after_tool_result(self, create_user):
        user, session = self._make_session(create_user, username="persist4")
        from chat import _user_context

        async def mock_run(*, user, session, prompt):
            # 1. Yield the tool use
            yield _AssistantMessage(
                content=[_ToolUseBlock("get_stock_quote", {"ticker": "NABIL"}, "tu_card")],
                session_id="sdk-card",
            )
            # 2. Simulate the tool execution pushing the card
            _user_context.push_card("get_stock_quote", {"type": "stock_card", "data": {"ticker": "NABIL"}})
            # 3. Yield the tool result
            yield _AssistantMessage(
                content=[_ToolResultBlock("LTP: 1250", "tu_card")],
                session_id="sdk-card",
            )
            yield _ResultMessage(session_id="sdk-card")

        async def collect():
            chunks = []
            with _patch_sdk(), mock.patch.object(_streaming, "run_chat_session", mock_run):
                async for chunk in _streaming.stream_chat(user=user, session=session, prompt="card"):
                    chunks.append(chunk)
            return chunks

        frames = _collect_frames(_run(collect()))
        card_frames = [f for f in frames if f["event"] == "card"]
        assert len(card_frames) == 1
        assert card_frames[0]["data"]["type"] == "stock_card"
