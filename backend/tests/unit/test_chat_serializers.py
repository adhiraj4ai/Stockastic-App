"""Unit tests for chat.serializers — DB required for instance round-trips."""
import pytest

from chat.models import ChatMessage, ChatSession
from chat.serializers import ChatMessageSerializer, ChatSessionSerializer


@pytest.mark.django_db
class TestChatSessionSerializer:
    def test_read_only_fields_rejected_on_write(self, create_user):
        user = create_user(username="alice", password="pw")
        data = {
            "id": "00000000-0000-0000-0000-000000000000",
            "title": "My Session",
            "created_at": "2024-01-01T00:00:00Z",
            "message_count": 99,
        }
        serializer = ChatSessionSerializer(data=data)
        assert serializer.is_valid()
        # id / created_at / message_count are read-only — they should be absent
        assert "id" not in serializer.validated_data
        assert "message_count" not in serializer.validated_data

    def test_title_is_writable(self):
        serializer = ChatSessionSerializer(data={"title": "NEPSE Analysis"})
        assert serializer.is_valid()
        assert serializer.validated_data["title"] == "NEPSE Analysis"

    def test_serialized_output_includes_message_count(self, create_user):
        user = create_user(username="bob", password="pw")
        session = ChatSession.objects.create(user=user, title="Session")
        ChatMessage.objects.create(session=session, role="user", text="Hi")
        ChatMessage.objects.create(session=session, role="assistant", text="Hello")

        data = ChatSessionSerializer(session).data
        assert data["message_count"] == 2

    def test_empty_session_message_count_is_zero(self, create_user):
        user = create_user(username="carol", password="pw")
        session = ChatSession.objects.create(user=user, title="Empty")
        data = ChatSessionSerializer(session).data
        assert data["message_count"] == 0

    def test_expected_fields_present(self, create_user):
        user = create_user(username="dan", password="pw")
        session = ChatSession.objects.create(user=user, title="Fields check")
        data = ChatSessionSerializer(session).data
        assert set(data.keys()) == {"id", "title", "created_at", "updated_at", "message_count"}


@pytest.mark.django_db
class TestChatMessageSerializer:
    def test_all_fields_are_read_only(self):
        serializer = ChatMessageSerializer()
        for name, field in serializer.fields.items():
            assert field.read_only, f"'{name}' should be read_only"

    def test_serializes_blocks_json_field(self, create_user):
        user = create_user(username="eve", password="pw")
        session = ChatSession.objects.create(user=user, title="Session")
        blocks = [
            {"kind": "text", "text": "NABIL is up 2%", "subagent": None},
            {"kind": "tool_use", "tool": "get_stock_quote", "input": {"ticker": "NABIL"}, "id": "tu_01"},
        ]
        msg = ChatMessage.objects.create(
            session=session, role="assistant", text="NABIL is up 2%", blocks=blocks
        )
        data = ChatMessageSerializer(msg).data
        assert data["blocks"] == blocks

    def test_token_fields_serialized(self, create_user):
        user = create_user(username="frank", password="pw")
        session = ChatSession.objects.create(user=user, title="Session")
        msg = ChatMessage.objects.create(
            session=session,
            role="assistant",
            text="",
            input_tokens=1000,
            output_tokens=500,
            cache_read_tokens=200,
            cache_creation_tokens=100,
        )
        data = ChatMessageSerializer(msg).data
        assert data["input_tokens"] == 1000
        assert data["output_tokens"] == 500
        assert data["cache_read_tokens"] == 200
        assert data["cache_creation_tokens"] == 100

    def test_expected_fields_present(self, create_user):
        user = create_user(username="grace", password="pw")
        session = ChatSession.objects.create(user=user, title="Session")
        msg = ChatMessage.objects.create(session=session, role="user", text="hello")
        data = ChatMessageSerializer(msg).data
        expected = {"id", "role", "text", "blocks", "input_tokens", "output_tokens",
                    "cache_read_tokens", "cache_creation_tokens", "created_at"}
        assert set(data.keys()) == expected
