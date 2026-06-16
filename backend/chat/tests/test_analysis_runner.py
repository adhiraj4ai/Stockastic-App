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
