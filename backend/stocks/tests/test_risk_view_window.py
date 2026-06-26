import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from stocks.models.portfolio import PortfolioItem

pytestmark = pytest.mark.django_db
User = get_user_model()
_URL = "/api/stocks/portfolio/risk-radar/analysis/"


def test_window_defaults_to_180_when_absent():
    user = User.objects.create_user(username="w1", password="p")
    PortfolioItem.objects.create(user=user, ticker="AAA", quantity=10, buy_price=100)
    client = APIClient(); client.force_authenticate(user)
    resp = client.get(_URL)
    assert resp.status_code == 200
    assert resp.data["market_risk"]["window"] == 180


def test_invalid_window_falls_back_to_default():
    user = User.objects.create_user(username="w2", password="p")
    PortfolioItem.objects.create(user=user, ticker="AAA", quantity=10, buy_price=100)
    client = APIClient(); client.force_authenticate(user)
    resp = client.get(_URL, {"window": "abc"})
    assert resp.status_code == 200
    assert resp.data["market_risk"]["window"] == 180


def test_valid_non_default_window_is_forwarded():
    user = User.objects.create_user(username="w3", password="p")
    PortfolioItem.objects.create(user=user, ticker="AAA", quantity=10, buy_price=100)
    client = APIClient(); client.force_authenticate(user)
    resp = client.get(_URL, {"window": "250"})
    assert resp.status_code == 200
    assert resp.data["market_risk"]["window"] == 250


def test_out_of_set_integer_falls_back_to_default():
    user = User.objects.create_user(username="w4", password="p")
    PortfolioItem.objects.create(user=user, ticker="AAA", quantity=10, buy_price=100)
    client = APIClient(); client.force_authenticate(user)
    resp = client.get(_URL, {"window": "365"})
    assert resp.status_code == 200
    assert resp.data["market_risk"]["window"] == 180
