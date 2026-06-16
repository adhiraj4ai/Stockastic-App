import uuid

import pytest
from django.contrib.auth import get_user_model

from chat import summary_service
from chat.models import ChatSession, ChatMessage, CompanyChatSummary
from chat.tasks import compile_company_summaries
from stocks.models.market import Company

User = get_user_model()


@pytest.fixture
def user(db):
    return User.objects.create(username="carol")


@pytest.fixture
def session(user):
    return ChatSession.objects.create(user=user, title="t")


@pytest.fixture
def nmb(db):
    return Company.objects.create(symbol="NMB", name="NMB Bank", status="A")


def _exchange(session, q, a):
    ChatMessage.objects.create(session=session, role=ChatMessage.ROLE_USER, text=q)
    return ChatMessage.objects.create(session=session, role=ChatMessage.ROLE_ASSISTANT, text=a)


def test_creates_summary_for_named_company(session, nmb, monkeypatch):
    monkeypatch.setattr(summary_service, "build_company_summary",
                        lambda prior, ex, sym: f"notes about {sym}")
    _exchange(session, "How is NMB doing?", "Solid quarter.")
    compile_company_summaries(str(session.id))
    row = CompanyChatSummary.objects.get(user=session.user, symbol="NMB")
    assert row.summary == "notes about NMB"
    assert row.last_message is not None


def test_skips_symbols_with_no_company(session, monkeypatch):
    calls = []
    monkeypatch.setattr(summary_service, "build_company_summary",
                        lambda prior, ex, sym: calls.append(sym) or "x")
    _exchange(session, "What about ZZZZ?", "No such company.")
    compile_company_summaries(str(session.id))
    assert calls == []
    assert CompanyChatSummary.objects.count() == 0


def test_is_idempotent_for_same_message(session, nmb, monkeypatch):
    calls = []
    monkeypatch.setattr(summary_service, "build_company_summary",
                        lambda prior, ex, sym: calls.append(sym) or "notes")
    _exchange(session, "Thoughts on NMB?", "Bullish.")
    compile_company_summaries(str(session.id))
    compile_company_summaries(str(session.id))
    assert calls == ["NMB"]


def test_rolls_in_new_exchange(session, nmb, monkeypatch):
    priors = []
    monkeypatch.setattr(summary_service, "build_company_summary",
                        lambda prior, ex, sym: priors.append(prior) or f"{prior}|new")
    _exchange(session, "NMB first look", "ok")
    compile_company_summaries(str(session.id))
    _exchange(session, "NMB follow up", "still ok")
    compile_company_summaries(str(session.id))
    assert priors == ["", "|new"]


def test_detects_off_user_message_not_assistant(session, monkeypatch):
    Company.objects.create(symbol="EBL", name="Everest Bank", status="A")
    calls = []
    monkeypatch.setattr(summary_service, "build_company_summary",
                        lambda prior, ex, sym: calls.append(sym) or "x")
    _exchange(session, "Top gainers today?", "EBL, ADBL, NABIL all rose.")
    compile_company_summaries(str(session.id))
    assert calls == []


def test_swallows_build_errors(session, nmb, monkeypatch):
    def boom(prior, ex, sym):
        raise RuntimeError("model down")
    monkeypatch.setattr(summary_service, "build_company_summary", boom)
    _exchange(session, "NMB?", "ok")
    compile_company_summaries(str(session.id))
    assert CompanyChatSummary.objects.filter(symbol="NMB").count() == 0


def test_missing_session_is_noop(db):
    assert compile_company_summaries(str(uuid.uuid4())) is None
