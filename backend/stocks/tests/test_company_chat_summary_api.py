import pytest
from django.contrib.auth.models import User

from chat.models import CompanyAnalysisEntry


@pytest.fixture
def other_user(db):
    return User.objects.create_user(username="eve", password="pw")


@pytest.fixture
def auth_user(api_client, create_user):
    user = create_user(username="testuser", password="password")
    api_client.force_authenticate(user=user)
    return api_client, user


# --- latest endpoint: /api/stocks/company-summary/<ticker>/ ---

def test_latest_returns_newest_entry(auth_user, db):
    client, user = auth_user
    CompanyAnalysisEntry.objects.create(user=user, symbol="NMB", summary="old", stance="neutral")
    CompanyAnalysisEntry.objects.create(user=user, symbol="NMB", summary="new", stance="bullish", aspect="fundamental")
    res = client.get("/api/stocks/company-summary/NMB/")
    assert res.status_code == 200
    assert res.data["summary"] == "new"
    assert res.data["stance"] == "bullish"
    assert res.data["aspect"] == "fundamental"
    assert res.data["symbol"] == "NMB"


def test_latest_204_when_none(auth_user, db):
    client, _ = auth_user
    res = client.get("/api/stocks/company-summary/ADBL/")
    assert res.status_code == 204


def test_latest_lowercase_normalised(auth_user, db):
    client, user = auth_user
    CompanyAnalysisEntry.objects.create(user=user, symbol="NMB", summary="x")
    res = client.get("/api/stocks/company-summary/nmb/")
    assert res.status_code == 200
    assert res.data["symbol"] == "NMB"


def test_latest_does_not_leak_other_user(auth_user, other_user, db):
    client, _ = auth_user
    CompanyAnalysisEntry.objects.create(user=other_user, symbol="NMB", summary="eve")
    res = client.get("/api/stocks/company-summary/NMB/")
    assert res.status_code == 204


# --- timeline endpoint: /api/stocks/company-analysis/<ticker>/ ---

def test_timeline_returns_series_newest_first(auth_user, db):
    client, user = auth_user
    CompanyAnalysisEntry.objects.create(user=user, symbol="NMB", summary="one", change_note="n1")
    CompanyAnalysisEntry.objects.create(user=user, symbol="NMB", summary="two", change_note="n2")
    res = client.get("/api/stocks/company-analysis/NMB/")
    assert res.status_code == 200
    assert [e["summary"] for e in res.data] == ["two", "one"]
    assert {"summary", "stance", "aspect", "change_note", "created_at"} <= set(res.data[0].keys())


def test_timeline_empty_list_when_none(auth_user, db):
    client, _ = auth_user
    res = client.get("/api/stocks/company-analysis/ZZZZ/")
    assert res.status_code == 200
    assert res.data == []


def test_timeline_does_not_leak_other_user(auth_user, other_user, db):
    client, _ = auth_user
    CompanyAnalysisEntry.objects.create(user=other_user, symbol="NMB", summary="eve")
    res = client.get("/api/stocks/company-analysis/NMB/")
    assert res.status_code == 200
    assert res.data == []


def test_endpoints_require_auth(api_client, db):
    assert api_client.get("/api/stocks/company-summary/NMB/").status_code in (401, 403)
    assert api_client.get("/api/stocks/company-analysis/NMB/").status_code in (401, 403)
