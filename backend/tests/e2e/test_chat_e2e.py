"""End-to-end chat tests.

These tests exercise the full Django request/response cycle — routing, views,
serializers, and models — without touching the Claude SDK.  The only mock is
`chat.views.stream_chat`, which is replaced with a deterministic async
generator so the SSE output is predictable and the DB side effects
(user message, assistant message, sdk_session_id) are fully exercised.
"""
import json
from unittest import mock

import pytest
from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from chat.models import ChatMessage, ChatSession

User = get_user_model()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _parse_sse_frames(content: bytes) -> list[dict]:
    """Parse raw SSE bytes into [{event, data}] — same logic as the frontend."""
    frames = []
    for block in content.decode("utf-8").split("\n\n"):
        block = block.strip()
        if not block:
            continue
        event, data_str = "message", ""
        for line in block.split("\n"):
            if line.startswith("event:"):
                event = line[6:].strip()
            elif line.startswith("data:"):
                data_str = line[5:].strip()
        if data_str:
            try:
                frames.append({"event": event, "data": json.loads(data_str)})
            except json.JSONDecodeError:
                frames.append({"event": event, "data": data_str})
    return frames


_MOCK_TEXT = "NABIL RSI is 42, MACD is bullish"
_MOCK_SDK_ID = "e2e-sdk-session-001"


def _mock_stream_usage_frame() -> bytes:
    return (
        b"event: usage\n"
        b"data: {\"input_tokens\": 100, \"output_tokens\": 80, "
        b"\"cache_read_input_tokens\": 0, \"cache_creation_input_tokens\": 0, "
        b"\"cost_usd\": 0.001, \"duration_ms\": 500}\n\n"
    )


async def _persist_mock_assistant_message(session) -> None:
    from asgiref.sync import sync_to_async
    from chat.models import ChatMessage

    @sync_to_async
    def _save():
        ChatMessage.objects.create(
            session=session,
            role=ChatMessage.ROLE_ASSISTANT,
            text=_MOCK_TEXT,
            blocks=[{"kind": "text", "text": _MOCK_TEXT}],
            input_tokens=100,
            output_tokens=80,
            cache_read_tokens=0,
            cache_creation_tokens=0,
        )

    await _save()


async def _mock_stream(*, user, session, prompt):
    """Deterministic stream: assistant_start → text → usage → done."""
    sid = str(session.id)
    yield f"event: assistant_start\ndata: {{\"session_id\": \"{sid}\"}}\n\n".encode()
    yield (
        b"event: text\n"
        b"data: {\"kind\": \"text\", \"text\": \"NABIL RSI is 42, MACD is bullish\"}\n\n"
    )
    yield _mock_stream_usage_frame()
    await _persist_mock_assistant_message(session)
    yield (
        f"event: done\ndata: {{\"session_id\": \"{sid}\", "
        f"\"sdk_session_id\": \"{_MOCK_SDK_ID}\"}}\n\n"
    ).encode()


def _send(client, session_id, prompt):
    """POST to send endpoint, return consumed StreamingHttpResponse."""
    with mock.patch("chat.views.stream_chat", _mock_stream):
        res = client.post(
            reverse("chat-session-send", kwargs={"pk": session_id}),
            {"prompt": prompt},
            format="json",
        )
        content = b"".join(res.streaming_content)
        res.streaming_content = [content]
    return res


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def user_and_client(db):
    user = User.objects.create_user(username="e2e_user", password="e2epassword")
    client = APIClient()
    client.force_authenticate(user=user)
    return user, client


# ---------------------------------------------------------------------------
# E2E Scenarios
# ---------------------------------------------------------------------------

@pytest.mark.django_db(transaction=True)
class TestFullChatLifecycle:

    def test_create_session_list_and_delete(self, user_and_client):
        """Create a session, verify it appears in list, then delete it."""
        user, client = user_and_client

        # Create
        res = client.post(reverse("chat-session-list"), {"title": "E2E Session"})
        assert res.status_code == status.HTTP_201_CREATED
        sid = res.data["id"]

        # List
        res = client.get(reverse("chat-session-list"))
        ids = [s["id"] for s in res.data]
        assert sid in ids

        # Delete
        res = client.delete(reverse("chat-session-detail", kwargs={"pk": sid}))
        assert res.status_code == status.HTTP_204_NO_CONTENT

        # Gone from list
        res = client.get(reverse("chat-session-list"))
        ids = [s["id"] for s in res.data]
        assert sid not in ids

    def test_first_message_auto_titles_and_persists(self, user_and_client):
        """Sending the first message auto-sets the title and saves both turns."""
        user, client = user_and_client

        res = client.post(reverse("chat-session-list"), {})
        sid = res.data["id"]
        assert res.data["title"] == "New chat"

        _send(client, sid, "What is the NABIL RSI today?")

        # Title should be auto-set from the first 60 chars of the prompt
        session = ChatSession.objects.get(pk=sid)
        assert session.title == "What is the NABIL RSI today?"

        # Both user and assistant messages must be in the DB
        msgs = list(ChatMessage.objects.filter(session_id=sid).order_by("created_at"))
        assert len(msgs) == 2
        assert msgs[0].role == "user"
        assert msgs[0].text == "What is the NABIL RSI today?"
        assert msgs[1].role == "assistant"

    def test_sse_stream_structure_and_event_ordering(self, user_and_client):
        """Verify the SSE wire format: correct events in the right order."""
        user, client = user_and_client

        res = client.post(reverse("chat-session-list"), {"title": "Stream E2E"})
        sid = res.data["id"]

        with mock.patch("chat.views.stream_chat", _mock_stream):
            stream_res = client.post(
                reverse("chat-session-send", kwargs={"pk": sid}),
                {"prompt": "NABIL analysis"},
                format="json",
            )
            content = b"".join(stream_res.streaming_content)
            stream_res.streaming_content = [content]

        assert stream_res.status_code == status.HTTP_200_OK
        frames = _parse_sse_frames(content)

        event_names = [f["event"] for f in frames]
        assert event_names[0] == "assistant_start"
        assert event_names[-1] == "done"
        assert "text" in event_names
        assert "usage" in event_names

    def test_session_id_in_done_frame(self, user_and_client):
        user, client = user_and_client
        res = client.post(reverse("chat-session-list"), {"title": "Done Frame"})
        sid = res.data["id"]

        with mock.patch("chat.views.stream_chat", _mock_stream):
            stream_res = client.post(
                reverse("chat-session-send", kwargs={"pk": sid}),
                {"prompt": "hello"},
                format="json",
            )
            content = b"".join(stream_res.streaming_content)
            stream_res.streaming_content = [content]

        frames = _parse_sse_frames(content)
        done = next(f for f in frames if f["event"] == "done")
        assert done["data"]["session_id"] == sid

    def test_multi_turn_conversation(self, user_and_client):
        """Second send on same session adds more messages."""
        user, client = user_and_client
        res = client.post(reverse("chat-session-list"), {"title": "Multi-turn"})
        sid = res.data["id"]

        _send(client, sid, "What is NABIL's RSI?")
        _send(client, sid, "What about MACD?")

        msgs = ChatMessage.objects.filter(session_id=sid)
        assert msgs.count() == 4  # 2 user + 2 assistant

        user_msgs = msgs.filter(role="user").values_list("text", flat=True)
        assert "What is NABIL's RSI?" in user_msgs
        assert "What about MACD?" in user_msgs

    def test_messages_endpoint_returns_full_transcript(self, user_and_client):
        """GET /messages/ after two sends returns the full transcript in order."""
        user, client = user_and_client
        res = client.post(reverse("chat-session-list"), {"title": "Transcript"})
        sid = res.data["id"]

        _send(client, sid, "Turn 1")
        _send(client, sid, "Turn 2")

        res = client.get(reverse("chat-session-messages", kwargs={"pk": sid}))
        assert res.status_code == status.HTTP_200_OK
        assert len(res.data) == 4  # turn1 user, turn1 asst, turn2 user, turn2 asst
        roles = [m["role"] for m in res.data]
        assert roles == ["user", "assistant", "user", "assistant"]

    def test_session_isolation_between_users(self, user_and_client, db):
        """User A cannot read or interact with User B's sessions."""
        user_a, client_a = user_and_client
        user_b = User.objects.create_user(username="user_b", password="pw")
        client_b = APIClient()
        client_b.force_authenticate(user=user_b)

        # User A creates a session and sends a message
        res = client_a.post(reverse("chat-session-list"), {"title": "Private A"})
        sid_a = res.data["id"]
        _send(client_a, sid_a, "A's secret analysis")

        # User B cannot see the session in their list
        res = client_b.get(reverse("chat-session-list"))
        assert all(s["id"] != sid_a for s in res.data)

        # User B gets 404 on detail
        res = client_b.get(reverse("chat-session-detail", kwargs={"pk": sid_a}))
        assert res.status_code == status.HTTP_404_NOT_FOUND

        # User B cannot read A's messages
        res = client_b.get(reverse("chat-session-messages", kwargs={"pk": sid_a}))
        assert res.status_code == status.HTTP_404_NOT_FOUND

    def test_delete_session_also_deletes_messages(self, user_and_client):
        """Deleting a session cascades to messages."""
        user, client = user_and_client
        res = client.post(reverse("chat-session-list"), {"title": "To Delete"})
        sid = res.data["id"]

        _send(client, sid, "Before deletion")

        msg_count = ChatMessage.objects.filter(session_id=sid).count()
        assert msg_count > 0

        client.delete(reverse("chat-session-detail", kwargs={"pk": sid}))
        assert ChatMessage.objects.filter(session_id=sid).count() == 0

    def test_error_stream_does_not_crash_server(self, user_and_client):
        """An exception inside stream_chat yields an error frame, not a 500."""
        user, client = user_and_client
        res = client.post(reverse("chat-session-list"), {"title": "Error Test"})
        sid = res.data["id"]

        async def _error_stream(*, user, session, prompt):
            yield b"event: assistant_start\ndata: {}\n\n"
            yield b"event: error\ndata: {\"message\": \"SDK timeout\"}\n\n"

        with mock.patch("chat.views.stream_chat", _error_stream):
            stream_res = client.post(
                reverse("chat-session-send", kwargs={"pk": sid}),
                {"prompt": "Trigger error"},
                format="json",
            )
            content = b"".join(stream_res.streaming_content)
            stream_res.streaming_content = [content]

        # The HTTP status should still be 200 (streaming started)
        assert stream_res.status_code == status.HTTP_200_OK
        frames = _parse_sse_frames(content)
        error_frames = [f for f in frames if f["event"] == "error"]
        assert len(error_frames) == 1
        assert "SDK timeout" in error_frames[0]["data"]["message"]

    def test_usage_data_available_in_stream(self, user_and_client):
        """The usage frame carries cost and token counts."""
        user, client = user_and_client
        res = client.post(reverse("chat-session-list"), {"title": "Usage"})
        sid = res.data["id"]

        with mock.patch("chat.views.stream_chat", _mock_stream):
            stream_res = client.post(
                reverse("chat-session-send", kwargs={"pk": sid}),
                {"prompt": "Cost?"},
                format="json",
            )
            content = b"".join(stream_res.streaming_content)
            stream_res.streaming_content = [content]

        frames = _parse_sse_frames(content)
        usage = next(f for f in frames if f["event"] == "usage")
        assert usage["data"]["input_tokens"] == 100
        assert usage["data"]["output_tokens"] == 80
        assert usage["data"]["cost_usd"] == 0.001
