"""Integration tests for the /send/ SSE endpoint — stream_chat is mocked."""
import json
from unittest import mock

import pytest
from django.urls import reverse
from rest_framework import status

from chat.models import ChatMessage, ChatSession


def _make_sse(*events):
    """Build a sequence of SSE byte chunks from (event_name, payload) pairs."""
    chunks = []
    for event, payload in events:
        line = f"event: {event}\ndata: {json.dumps(payload)}\n\n"
        chunks.append(line.encode("utf-8"))
    return chunks


async def _noop_stream(*, user, session, prompt):
    """Minimal mock: yields assistant_start + text + done."""
    sid = str(session.id)
    yield f"event: assistant_start\ndata: {{\"session_id\": \"{sid}\"}}\n\n".encode()
    yield b"event: text\ndata: {\"kind\": \"text\", \"text\": \"NABIL RSI is 42\"}\n\n"
    yield f"event: done\ndata: {{\"session_id\": \"{sid}\", \"sdk_session_id\": null}}\n\n".encode()


@pytest.mark.django_db
class TestSendEndpointValidation:
    def _create_session(self, client):
        res = client.post(reverse("chat-session-list"), {"title": "Test"})
        return res.data["id"]

    def test_empty_prompt_returns_400(self, auth_client):
        sid = self._create_session(auth_client)
        res = auth_client.post(
            reverse("chat-session-send", kwargs={"pk": sid}),
            {"prompt": ""},
            format="json",
        )
        assert res.status_code == status.HTTP_400_BAD_REQUEST
        assert "prompt" in str(res.data).lower() or "detail" in res.data

    def test_missing_prompt_returns_400(self, auth_client):
        sid = self._create_session(auth_client)
        res = auth_client.post(
            reverse("chat-session-send", kwargs={"pk": sid}), {}, format="json"
        )
        assert res.status_code == status.HTTP_400_BAD_REQUEST

    def test_whitespace_only_prompt_returns_400(self, auth_client):
        sid = self._create_session(auth_client)
        res = auth_client.post(
            reverse("chat-session-send", kwargs={"pk": sid}),
            {"prompt": "   \t  "},
            format="json",
        )
        assert res.status_code == status.HTTP_400_BAD_REQUEST

    def test_unauthenticated_returns_401(self, api_client):
        # Create user and session first
        from django.contrib.auth import get_user_model
        User = get_user_model()
        user = User.objects.create_user(username="anon_test", password="pw")
        session = ChatSession.objects.create(user=user, title="Session")

        res = api_client.post(
            reverse("chat-session-send", kwargs={"pk": str(session.id)}),
            {"prompt": "Hello"},
            format="json",
        )
        assert res.status_code in (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN)

    def test_other_users_session_returns_404(self, auth_client, create_user, api_client):
        # session owned by testuser
        sid = self._create_session(auth_client)
        other = create_user(username="other", password="pw")
        api_client.force_authenticate(user=other)
        with mock.patch("chat.views.stream_chat", _noop_stream):
            res = api_client.post(
                reverse("chat-session-send", kwargs={"pk": sid}),
                {"prompt": "Hello"},
                format="json",
            )
        assert res.status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.django_db
class TestSendEndpointStreaming:
    def _create_session(self, client, title="Test"):
        res = client.post(reverse("chat-session-list"), {"title": title})
        return res.data["id"]

    def _get_sse_content(self, response) -> bytes:
        """Consume a StreamingHttpResponse fully."""
        return b"".join(response.streaming_content)

    def test_returns_200_with_event_stream_content_type(self, auth_client):
        sid = self._create_session(auth_client)
        with mock.patch("chat.views.stream_chat", _noop_stream):
            res = auth_client.post(
                reverse("chat-session-send", kwargs={"pk": sid}),
                {"prompt": "What is NABIL's RSI?"},
                format="json",
            )
        assert res.status_code == status.HTTP_200_OK
        assert "text/event-stream" in res.get("Content-Type", "")

    def test_cache_control_no_cache_header(self, auth_client):
        sid = self._create_session(auth_client)
        with mock.patch("chat.views.stream_chat", _noop_stream):
            res = auth_client.post(
                reverse("chat-session-send", kwargs={"pk": sid}),
                {"prompt": "Hello"},
                format="json",
            )
        assert res.get("Cache-Control") == "no-cache"

    def test_sse_frames_contain_assistant_start_and_done(self, auth_client):
        sid = self._create_session(auth_client)
        with mock.patch("chat.views.stream_chat", _noop_stream):
            res = auth_client.post(
                reverse("chat-session-send", kwargs={"pk": sid}),
                {"prompt": "Hello"},
                format="json",
            )
            body = self._get_sse_content(res)
        assert b"event: assistant_start" in body
        assert b"event: done" in body

    def test_sse_frames_contain_text_payload(self, auth_client):
        sid = self._create_session(auth_client)
        with mock.patch("chat.views.stream_chat", _noop_stream):
            res = auth_client.post(
                reverse("chat-session-send", kwargs={"pk": sid}),
                {"prompt": "Hello"},
                format="json",
            )
            body = self._get_sse_content(res)
        assert b"NABIL RSI is 42" in body

    def test_user_message_persisted_before_stream(self, auth_client):
        sid = self._create_session(auth_client)
        with mock.patch("chat.views.stream_chat", _noop_stream):
            auth_client.post(
                reverse("chat-session-send", kwargs={"pk": sid}),
                {"prompt": "Check NABIL"},
                format="json",
            )
        # The user message must be saved (even if stream fails)
        user_msgs = ChatMessage.objects.filter(session_id=sid, role="user")
        assert user_msgs.exists()
        assert user_msgs.first().text == "Check NABIL"

    def test_first_message_auto_titles_session(self, auth_client):
        # Create session with default "New chat" title
        res = auth_client.post(reverse("chat-session-list"), {})
        sid = res.data["id"]
        with mock.patch("chat.views.stream_chat", _noop_stream):
            auth_client.post(
                reverse("chat-session-send", kwargs={"pk": sid}),
                {"prompt": "Analyze the NEPSE market"},
                format="json",
            )
        session = ChatSession.objects.get(pk=sid)
        assert session.title == "Analyze the NEPSE market"

    def test_title_truncated_to_60_chars(self, auth_client):
        res = auth_client.post(reverse("chat-session-list"), {})
        sid = res.data["id"]
        long_prompt = "a" * 100
        with mock.patch("chat.views.stream_chat", _noop_stream):
            auth_client.post(
                reverse("chat-session-send", kwargs={"pk": sid}),
                {"prompt": long_prompt},
                format="json",
            )
        session = ChatSession.objects.get(pk=sid)
        assert len(session.title) == 60

    def test_existing_custom_title_not_overwritten(self, auth_client):
        res = auth_client.post(reverse("chat-session-list"), {"title": "My Custom Title"})
        sid = res.data["id"]
        with mock.patch("chat.views.stream_chat", _noop_stream):
            auth_client.post(
                reverse("chat-session-send", kwargs={"pk": sid}),
                {"prompt": "Hello"},
                format="json",
            )
        session = ChatSession.objects.get(pk=sid)
        assert session.title == "My Custom Title"
