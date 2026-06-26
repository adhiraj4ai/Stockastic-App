from datetime import date
from decimal import Decimal

import pytest
from django.contrib.auth.models import User
from rest_framework.test import APIClient

from stocks.models import AccumulationCandidate, PortfolioAccount
from stocks.models.portfolio import AccountType
from stocks.views.accumulation_candidate_viewset import suggested_quantity


def test_suggested_quantity_uses_risk_and_stop_distance():
    acct = PortfolioAccount(balance=Decimal("100000"), default_risk_percentage=Decimal("2"))
    # risk budget = 2000; per-share risk = 20 -> 100 shares
    assert suggested_quantity(acct, Decimal("520"), Decimal("500")) == 100


def test_suggested_quantity_zero_stop_distance_returns_zero():
    acct = PortfolioAccount(balance=Decimal("100000"), default_risk_percentage=Decimal("2"))
    assert suggested_quantity(acct, Decimal("500"), Decimal("500")) == 0


def test_suggested_quantity_negative_stop_distance_returns_zero():
    acct = PortfolioAccount(balance=Decimal("100000"), default_risk_percentage=Decimal("2"))
    assert suggested_quantity(acct, Decimal("490"), Decimal("500")) == 0


def test_suggested_quantity_affordability_cap():
    acct = PortfolioAccount(balance=Decimal("1000"), default_risk_percentage=Decimal("50"))
    # risk budget = 500; per-share risk = 1 -> 500 shares, but only afford 2 at 500 each
    assert suggested_quantity(acct, Decimal("500"), Decimal("499")) == 2


@pytest.mark.django_db
def test_list_returns_active_candidates():
    user = User.objects.create_user("u1", password="x")
    AccumulationCandidate.objects.create(
        symbol="NABIL", scan_date=date(2026, 6, 26), score=Decimal("82"),
        factors={"score": 82.0}, suggested_entry=Decimal("520"),
        suggested_stop=Decimal("500"), suggested_target=Decimal("560"),
        validation_state="validated", status=AccumulationCandidate.Status.ACTIVE)
    client = APIClient()
    client.force_authenticate(user=user)
    resp = client.get("/api/stocks/accumulation-candidates/")
    assert resp.status_code == 200
    assert resp.data[0]["symbol"] == "NABIL"


@pytest.mark.django_db
def test_list_excludes_expired_candidates():
    user = User.objects.create_user("u2", password="x")
    AccumulationCandidate.objects.create(
        symbol="EXPIRED_CO", scan_date=date(2026, 6, 26), score=Decimal("70"),
        factors={}, suggested_entry=Decimal("100"),
        suggested_stop=Decimal("90"), suggested_target=Decimal("120"),
        validation_state="research", status=AccumulationCandidate.Status.EXPIRED)
    client = APIClient()
    client.force_authenticate(user=user)
    resp = client.get("/api/stocks/accumulation-candidates/")
    assert resp.status_code == 200
    symbols = [d["symbol"] for d in resp.data]
    assert "EXPIRED_CO" not in symbols


@pytest.mark.django_db
def test_list_unauthenticated_returns_401():
    client = APIClient()
    resp = client.get("/api/stocks/accumulation-candidates/")
    assert resp.status_code == 401


@pytest.mark.django_db
def test_detail_returns_candidate_by_symbol():
    user = User.objects.create_user("u3", password="x")
    AccumulationCandidate.objects.create(
        symbol="NICA", scan_date=date(2026, 6, 26), score=Decimal("75"),
        factors={}, suggested_entry=Decimal("300"),
        suggested_stop=Decimal("285"), suggested_target=Decimal("340"),
        validation_state="validated", status=AccumulationCandidate.Status.ACTIVE)
    client = APIClient()
    client.force_authenticate(user=user)
    resp = client.get("/api/stocks/accumulation-candidates/NICA/")
    assert resp.status_code == 200
    assert resp.data["symbol"] == "NICA"


@pytest.mark.django_db
def test_list_with_account_returns_suggested_qty():
    user = User.objects.create_user("u4", password="x")
    account = PortfolioAccount.objects.create(
        user=user, name="Main", balance=Decimal("100000"),
        default_risk_percentage=Decimal("2"),
        account_type=AccountType.LIVE)
    AccumulationCandidate.objects.create(
        symbol="MBL", scan_date=date(2026, 6, 26), score=Decimal("88"),
        factors={}, suggested_entry=Decimal("520"),
        suggested_stop=Decimal("500"), suggested_target=Decimal("560"),
        validation_state="validated", status=AccumulationCandidate.Status.ACTIVE)
    client = APIClient()
    client.force_authenticate(user=user)
    resp = client.get(f"/api/stocks/accumulation-candidates/?account={account.id}")
    assert resp.status_code == 200
    assert resp.data[0]["suggested_qty"] == 100
