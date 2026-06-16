import pytest
from django.contrib.auth import get_user_model

from chat.models import CompanyAnalysisEntry

User = get_user_model()


@pytest.fixture
def user(db):
    return User.objects.create(username="alice")


def test_defaults(user):
    row = CompanyAnalysisEntry.objects.create(user=user, symbol="NMB")
    assert row.summary == ""
    assert row.stance == CompanyAnalysisEntry.STANCE_NEUTRAL
    assert row.aspect == CompanyAnalysisEntry.ASPECT_BOTH
    assert row.change_note == ""
    assert row.source_message is None
    assert "NMB" in str(row)


def test_latest_entry_is_most_recent(user):
    CompanyAnalysisEntry.objects.create(user=user, symbol="NMB", summary="old")
    CompanyAnalysisEntry.objects.create(user=user, symbol="NMB", summary="new")
    latest = CompanyAnalysisEntry.objects.filter(user=user, symbol="NMB").order_by("-created_at").first()
    assert latest.summary == "new"


def test_default_ordering_newest_first(user):
    CompanyAnalysisEntry.objects.create(user=user, symbol="NMB", summary="a")
    CompanyAnalysisEntry.objects.create(user=user, symbol="NMB", summary="b")
    summaries = list(CompanyAnalysisEntry.objects.filter(symbol="NMB").values_list("summary", flat=True))
    assert summaries == ["b", "a"]
