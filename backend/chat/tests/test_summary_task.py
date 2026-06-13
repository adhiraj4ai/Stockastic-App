import pytest
from django.contrib.auth import get_user_model

from chat.models import ChatSession, ChatMessage
from chat import summary_service
from chat.tasks import update_session_summary, SUMMARIZE_AFTER_EXCHANGES

User = get_user_model()


@pytest.fixture
def session(db):
    user = User.objects.create(username="bob")
    return ChatSession.objects.create(user=user, title="t")


def _exchange(session, q, a):
    ChatMessage.objects.create(session=session, role=ChatMessage.ROLE_USER, text=q)
    ChatMessage.objects.create(session=session, role=ChatMessage.ROLE_ASSISTANT, text=a)


def test_noop_when_session_is_short(session, monkeypatch):
    calls = []
    monkeypatch.setattr(summary_service, "build_summary", lambda *a, **k: calls.append(a) or "X")
    for i in range(SUMMARIZE_AFTER_EXCHANGES):  # exactly threshold → still no-op
        _exchange(session, f"q{i}", f"a{i}")
    result = update_session_summary(str(session.id))
    assert result is None
    assert calls == []
    session.refresh_from_db()
    assert session.summary == ""


def test_builds_and_saves_summary_when_long(session, monkeypatch):
    monkeypatch.setattr(summary_service, "build_summary", lambda prior, ex: "UPDATED SUMMARY")
    for i in range(SUMMARIZE_AFTER_EXCHANGES + 1):  # over threshold
        _exchange(session, f"q{i}", f"a{i}")
    result = update_session_summary(str(session.id))
    assert result == "UPDATED SUMMARY"
    session.refresh_from_db()
    assert session.summary == "UPDATED SUMMARY"


def test_swallows_build_errors(session, monkeypatch):
    def boom(prior, ex):
        raise RuntimeError("model down")

    monkeypatch.setattr(summary_service, "build_summary", boom)
    for i in range(SUMMARIZE_AFTER_EXCHANGES + 1):
        _exchange(session, f"q{i}", f"a{i}")
    result = update_session_summary(str(session.id))
    assert result is None
    session.refresh_from_db()
    assert session.summary == ""


def test_missing_session_is_noop(db):
    import uuid
    assert update_session_summary(str(uuid.uuid4())) is None
