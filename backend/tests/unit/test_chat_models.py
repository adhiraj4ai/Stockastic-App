"""Unit tests for chat.models — pure Python, no database required."""
import uuid
from unittest.mock import Mock

import pytest

from chat.models import ChatMessage, ChatSession


class TestChatSession:
    def test_str_combines_username_and_title(self):
        from django.contrib.auth import get_user_model
        User = get_user_model()
        user = User(username="alice")
        session = ChatSession(user=user, title="NEPSE outlook")
        assert str(session) == "alice · NEPSE outlook"

    def test_default_title_is_new_chat(self):
        session = ChatSession()
        assert session.title == "New chat"

    def test_sdk_session_id_defaults_to_empty_string(self):
        session = ChatSession()
        assert session.sdk_session_id == ""

    def test_meta_ordering_by_updated_at_desc(self):
        ordering = ChatSession._meta.ordering
        assert ordering == ["-updated_at"]

    def test_id_field_is_uuid(self):
        # The default factory generates a real UUID before DB save.
        session = ChatSession()
        assert isinstance(session.id, uuid.UUID)


class TestChatMessage:
    def test_str_shows_role_and_text_preview(self):
        msg = ChatMessage(role="user", text="What is NABIL's RSI today?")
        assert str(msg) == "user: What is NABIL's RSI today?"

    def test_str_truncates_text_at_60_chars(self):
        long_text = "a" * 80
        msg = ChatMessage(role="assistant", text=long_text)
        result = str(msg)
        # "assistant: " + 60 chars = 71 chars total
        assert result == f"assistant: {'a' * 60}"

    def test_str_handles_empty_text(self):
        msg = ChatMessage(role="user", text="")
        assert str(msg) == "user: "

    def test_token_counts_default_to_zero(self):
        msg = ChatMessage()
        assert msg.input_tokens == 0
        assert msg.output_tokens == 0
        assert msg.cache_read_tokens == 0
        assert msg.cache_creation_tokens == 0

    def test_blocks_default_is_empty_list(self):
        msg = ChatMessage()
        assert msg.blocks == []

    def test_role_constants(self):
        assert ChatMessage.ROLE_USER == "user"
        assert ChatMessage.ROLE_ASSISTANT == "assistant"

    def test_meta_ordering_by_created_at_asc(self):
        ordering = ChatMessage._meta.ordering
        assert ordering == ["created_at"]

    def test_id_field_is_uuid(self):
        msg = ChatMessage()
        assert isinstance(msg.id, uuid.UUID)
