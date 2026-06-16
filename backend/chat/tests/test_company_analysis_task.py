import uuid

import pytest
from django.contrib.auth import get_user_model

from chat import summary_service
from chat.models import ChatSession, ChatMessage, CompanyAnalysisEntry
from chat.summary_service import CompanyAnalysisResult
from chat.tasks import compile_company_analysis
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


def _result(changed, summary="s", stance="bullish", aspect="both", note="n"):
    return CompanyAnalysisResult(changed, summary, stance, aspect, note)


def test_first_mention_creates_one_entry(session, nmb, monkeypatch):
    monkeypatch.setattr(summary_service, "build_company_analysis",
                        lambda prior, ex, sym: _result(False, summary="first"))
    _exchange(session, "How is NMB?", "ok")
    compile_company_analysis(str(session.id))
    rows = CompanyAnalysisEntry.objects.filter(user=session.user, symbol="NMB")
    assert rows.count() == 1
    assert rows.first().summary == "first"


def test_material_change_creates_second_entry(session, nmb, monkeypatch):
    monkeypatch.setattr(summary_service, "build_company_analysis",
                        lambda prior, ex, sym: _result(True, summary="changed", stance="bearish"))
    _exchange(session, "NMB first", "a")
    compile_company_analysis(str(session.id))
    _exchange(session, "NMB again", "b")
    compile_company_analysis(str(session.id))
    rows = CompanyAnalysisEntry.objects.filter(user=session.user, symbol="NMB").order_by("-created_at")
    assert rows.count() == 2
    assert rows.first().stance == "bearish"


def test_non_material_change_updates_latest_in_place(session, nmb, monkeypatch):
    monkeypatch.setattr(summary_service, "build_company_analysis",
                        lambda prior, ex, sym: _result(False, summary="refined", stance="neutral"))
    _exchange(session, "NMB first", "a")
    compile_company_analysis(str(session.id))
    _exchange(session, "NMB again", "b")
    compile_company_analysis(str(session.id))
    rows = CompanyAnalysisEntry.objects.filter(user=session.user, symbol="NMB")
    assert rows.count() == 1
    assert rows.first().summary == "refined"


def test_idempotent_for_same_message(session, nmb, monkeypatch):
    calls = []
    monkeypatch.setattr(summary_service, "build_company_analysis",
                        lambda prior, ex, sym: calls.append(sym) or _result(False))
    _exchange(session, "NMB?", "ok")
    compile_company_analysis(str(session.id))
    compile_company_analysis(str(session.id))
    assert calls == ["NMB"]


def test_detects_off_user_message_only(session, monkeypatch):
    Company.objects.create(symbol="EBL", name="Everest Bank", status="A")
    calls = []
    monkeypatch.setattr(summary_service, "build_company_analysis",
                        lambda prior, ex, sym: calls.append(sym) or _result(False))
    _exchange(session, "Top gainers?", "EBL and ADBL rose.")
    compile_company_analysis(str(session.id))
    assert calls == []


def test_swallows_build_errors(session, nmb, monkeypatch):
    def boom(prior, ex, sym):
        raise RuntimeError("model down")
    monkeypatch.setattr(summary_service, "build_company_analysis", boom)
    _exchange(session, "NMB?", "ok")
    compile_company_analysis(str(session.id))
    assert CompanyAnalysisEntry.objects.filter(symbol="NMB").count() == 0


def test_missing_session_is_noop(db):
    assert compile_company_analysis(str(uuid.uuid4())) is None
