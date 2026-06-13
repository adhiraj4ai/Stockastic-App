import pytest
from django.contrib.auth import get_user_model

from chat.models import ChatSession, ChatMessage
from chat.history import (
    Exchange,
    _truncate_reply,
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


def test_zero_hops_returns_empty(session):
    _add(session, ChatMessage.ROLE_USER, "q1")
    _add(session, ChatMessage.ROLE_ASSISTANT, "a1")
    assert recent_exchanges(session, hops=0) == []


def test_consecutive_assistant_messages_skip_extra(session):
    _add(session, ChatMessage.ROLE_USER, "q1")
    _add(session, ChatMessage.ROLE_ASSISTANT, "a1")
    _add(session, ChatMessage.ROLE_ASSISTANT, "a2-orphan")
    _add(session, ChatMessage.ROLE_USER, "q2")
    _add(session, ChatMessage.ROLE_ASSISTANT, "a2")
    result = recent_exchanges(session, hops=10)
    assert result == [Exchange("q1", "a1"), Exchange("q2", "a2")]


def test_truncate_reply_appends_ellipsis_and_strips():
    exact = "a" * MAX_REPLY_CHARS_IN_HISTORY
    assert _truncate_reply(exact) == exact

    result = _truncate_reply("a" * 500 + " " * 200)
    assert result == "a" * 500 + "…"
