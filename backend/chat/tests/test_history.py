import pytest
from django.contrib.auth import get_user_model

from chat.models import ChatSession, ChatMessage
from chat.history import (
    Exchange,
    recent_exchanges,
    format_exchanges,
    HISTORY_HOPS,
    MAX_REPLY_CHARS_IN_HISTORY,
)

User = get_user_model()


@pytest.fixture
def session(db):
    user = User.objects.create(username="alice")
    return ChatSession.objects.create(user=user, title="t")


def _add(session, role, text):
    return ChatMessage.objects.create(session=session, role=role, text=text)


def test_pairs_user_with_following_assistant(session):
    _add(session, ChatMessage.ROLE_USER, "q1")
    _add(session, ChatMessage.ROLE_ASSISTANT, "a1")
    result = recent_exchanges(session)
    assert result == [Exchange(user_text="q1", assistant_text="a1")]


def test_returns_only_last_n_hops(session):
    for i in range(5):
        _add(session, ChatMessage.ROLE_USER, f"q{i}")
        _add(session, ChatMessage.ROLE_ASSISTANT, f"a{i}")
    result = recent_exchanges(session)
    assert len(result) == HISTORY_HOPS
    assert [e.user_text for e in result] == ["q2", "q3", "q4"]


def test_dangling_current_user_message_is_excluded(session):
    _add(session, ChatMessage.ROLE_USER, "q1")
    _add(session, ChatMessage.ROLE_ASSISTANT, "a1")
    _add(session, ChatMessage.ROLE_USER, "current-unanswered")
    result = recent_exchanges(session)
    assert result == [Exchange(user_text="q1", assistant_text="a1")]


def test_format_truncates_long_replies():
    long_reply = "x" * (MAX_REPLY_CHARS_IN_HISTORY + 50)
    text = format_exchanges([Exchange(user_text="q", assistant_text=long_reply)])
    assert "User: q" in text
    assert text.endswith("…")
    assert len(text) <= MAX_REPLY_CHARS_IN_HISTORY + len("User: q\nAssistant: ") + 1


def test_format_empty_returns_empty_string():
    assert format_exchanges([]) == ""
