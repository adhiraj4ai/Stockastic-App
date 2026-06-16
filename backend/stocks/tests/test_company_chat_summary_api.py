import pytest
from django.contrib.auth.models import User

from chat.models import CompanyChatSummary


@pytest.fixture
def other_user(db):
    return User.objects.create_user(username="eve", password="pw")


@pytest.fixture
def auth_user(api_client, create_user):
    """Returns (client, user) with the client already force-authenticated."""
    user = create_user(username="testuser", password="password")
    api_client.force_authenticate(user=user)
    return api_client, user


def test_returns_user_summary(auth_user, db):
    client, user = auth_user
    CompanyChatSummary.objects.create(user=user, symbol="NMB", summary="my NMB notes")
    res = client.get("/api/stocks/company-summary/NMB/")
    assert res.status_code == 200
    assert res.data["symbol"] == "NMB"
    assert res.data["summary"] == "my NMB notes"
    assert "updated_at" in res.data


def test_lowercase_ticker_is_normalised(auth_user, db):
    client, user = auth_user
    CompanyChatSummary.objects.create(user=user, symbol="NMB", summary="notes")
    res = client.get("/api/stocks/company-summary/nmb/")
    assert res.status_code == 200
    assert res.data["symbol"] == "NMB"


def test_204_when_no_summary(auth_user, db):
    client, _ = auth_user
    res = client.get("/api/stocks/company-summary/ADBL/")
    assert res.status_code == 204


def test_204_when_summary_blank(auth_user, db):
    client, user = auth_user
    CompanyChatSummary.objects.create(user=user, symbol="EBL", summary="   ")
    res = client.get("/api/stocks/company-summary/EBL/")
    assert res.status_code == 204


def test_does_not_leak_other_users_summary(auth_user, other_user, db):
    client, _ = auth_user
    CompanyChatSummary.objects.create(user=other_user, symbol="NMB", summary="eve notes")
    res = client.get("/api/stocks/company-summary/NMB/")
    assert res.status_code == 204


def test_requires_auth(api_client, db):
    res = api_client.get("/api/stocks/company-summary/NMB/")
    assert res.status_code in (401, 403)
