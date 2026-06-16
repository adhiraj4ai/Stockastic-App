import pytest
from django.contrib.auth import get_user_model

from chat.analysis_runner import apply_analysis_result
from chat.models import CompanyAnalysisEntry
from chat.summary_service import CompanyAnalysisResult

User = get_user_model()


@pytest.fixture
def user(db):
    return User.objects.create(username="dana")


def _result(changed, summary="s", stance="bullish", aspect="both", note="n"):
    return CompanyAnalysisResult(changed, summary, stance, aspect, note)


def test_creates_entry_when_no_prior(user):
    entry = apply_analysis_result(user, "NMB", None, _result(False, summary="first"))
    assert entry.pk is not None
    assert CompanyAnalysisEntry.objects.filter(user=user, symbol="NMB").count() == 1
    assert entry.summary == "first"
    assert entry.source_message is None


def test_material_change_creates_new_entry(user):
    prior = CompanyAnalysisEntry.objects.create(user=user, symbol="NMB", summary="old")
    apply_analysis_result(user, "NMB", prior, _result(True, summary="new", stance="bearish"))
    rows = CompanyAnalysisEntry.objects.filter(user=user, symbol="NMB").order_by("-created_at")
    assert rows.count() == 2
    assert rows.first().summary == "new"


def test_non_material_change_refines_in_place(user):
    prior = CompanyAnalysisEntry.objects.create(user=user, symbol="NMB", summary="old", stance="neutral")
    returned = apply_analysis_result(user, "NMB", prior, _result(False, summary="refined", stance="bullish"))
    assert returned.pk == prior.pk
    assert CompanyAnalysisEntry.objects.filter(user=user, symbol="NMB").count() == 1
    prior.refresh_from_db()
    assert prior.summary == "refined"
    assert prior.stance == "bullish"


def test_refine_preserves_existing_source_when_none_passed(user):
    existing = CompanyAnalysisEntry.objects.create(user=user, symbol="NMB", summary="x")
    returned = apply_analysis_result(user, "NMB", existing, _result(False, summary="y"), source_message=None)
    assert returned.pk == existing.pk
    returned.refresh_from_db()
    assert returned.summary == "y"


def test_run_market_analysis_creates_first_entry(user, monkeypatch):
    import stocks.services.ticker_verdict as tv
    from chat import summary_service
    from chat.analysis_runner import run_market_analysis

    monkeypatch.setattr(tv, "build_verdict", lambda sym: {"confluence_score": 70, "episodes": []})
    monkeypatch.setattr(summary_service, "build_company_analysis_from_market",
                        lambda prior, sym, verdict: _result(True, summary="data view"))
    entry = run_market_analysis(user, "nmb")
    assert entry is not None
    assert CompanyAnalysisEntry.objects.filter(user=user, symbol="NMB").count() == 1
    assert entry.summary == "data view"


def test_run_market_analysis_material_change_appends(user, monkeypatch):
    import stocks.services.ticker_verdict as tv
    from chat import summary_service
    from chat.analysis_runner import run_market_analysis

    CompanyAnalysisEntry.objects.create(user=user, symbol="NMB", summary="old")
    monkeypatch.setattr(tv, "build_verdict", lambda sym: {})
    monkeypatch.setattr(summary_service, "build_company_analysis_from_market",
                        lambda prior, sym, verdict: _result(True, summary="changed"))
    run_market_analysis(user, "NMB")
    assert CompanyAnalysisEntry.objects.filter(user=user, symbol="NMB").count() == 2


def test_run_market_analysis_survives_verdict_failure(user, monkeypatch):
    import stocks.services.ticker_verdict as tv
    from chat import summary_service
    from chat.analysis_runner import run_market_analysis

    def boom(sym):
        raise RuntimeError("no prices")

    monkeypatch.setattr(tv, "build_verdict", boom)
    captured = {}
    monkeypatch.setattr(summary_service, "build_company_analysis_from_market",
                        lambda prior, sym, verdict: captured.setdefault("verdict", verdict) or _result(True, summary="ok"))
    entry = run_market_analysis(user, "NMB")
    assert entry is not None  # did not raise; proceeded with empty verdict
    assert captured["verdict"] == {}


def test_run_market_analysis_survives_build_failure(user, monkeypatch):
    import stocks.services.ticker_verdict as tv
    from chat import summary_service
    from chat.analysis_runner import run_market_analysis

    prior = CompanyAnalysisEntry.objects.create(user=user, symbol="NMB", summary="prior")
    monkeypatch.setattr(tv, "build_verdict", lambda sym: {})

    def boom(prior_entry, sym, verdict):
        raise RuntimeError("model down")

    monkeypatch.setattr(summary_service, "build_company_analysis_from_market", boom)
    entry = run_market_analysis(user, "NMB")
    assert entry.pk == prior.pk  # returns existing latest, no new row, no raise
    assert CompanyAnalysisEntry.objects.filter(user=user, symbol="NMB").count() == 1
