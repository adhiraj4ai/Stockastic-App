import pytest
from datetime import date
from decimal import Decimal


@pytest.mark.django_db
class TestPlanAPI:
    def _make_plan(self, plan_date=date(2026, 6, 11)):
        from stocks.models import DailyTradingPlan
        return DailyTradingPlan.objects.create(
            date=plan_date, regime="RISK_ON", breadth=0.65,
            payload={"picks": [{"symbol": "NABIL", "confluence_score": 91}],
                     "watch": [], "exits": [], "catalysts": [], "market_context": {}},
        )

    def test_today_returns_latest_plan_with_overlay(self, auth_client):
        self._make_plan()
        resp = auth_client.get("/api/stocks/plan/today/")
        assert resp.status_code == 200
        data = resp.json()
        assert data["date"] == "2026-06-11"
        assert data["regime"] == "RISK_ON"
        assert data["payload"]["picks"][0]["symbol"] == "NABIL"
        assert set(data["overlay"].keys()) == {
            "positions_near_action", "signal_flips", "watchlist_triggers", "sizing"}

    def test_today_404_when_no_plan(self, auth_client):
        resp = auth_client.get("/api/stocks/plan/today/")
        assert resp.status_code == 404

    def test_history_by_date_no_overlay(self, auth_client):
        self._make_plan(date(2026, 6, 8))
        self._make_plan(date(2026, 6, 11))
        resp = auth_client.get("/api/stocks/plan/?date=2026-06-08")
        assert resp.status_code == 200
        data = resp.json()
        assert data["date"] == "2026-06-08"
        assert "overlay" not in data

    def test_history_invalid_date(self, auth_client):
        resp = auth_client.get("/api/stocks/plan/?date=not-a-date")
        assert resp.status_code == 400

    def test_requires_auth(self, api_client):
        resp = api_client.get("/api/stocks/plan/today/")
        assert resp.status_code in (401, 403)

    def test_today_overlay_includes_sizing_for_picks(self, auth_client):
        from django.contrib.auth.models import User
        from stocks.models import DailyTradingPlan, PortfolioAccount
        user = User.objects.get(username="testuser")
        PortfolioAccount.objects.create(user=user, name="Live", account_type="LIVE",
                                        balance=Decimal("1000000"),
                                        default_risk_percentage=Decimal("1.00"))
        DailyTradingPlan.objects.create(
            date=date(2026, 6, 12), regime="RISK_ON",
            payload={"picks": [{"symbol": "NABIL",
                                "entry": {"latest_close": 101.0, "status": "IN_ZONE",
                                          "price": 100.0},
                                "targets": {"tp1": 120.0, "sl": 90.0}}],
                     "watch": [], "exits": [], "catalysts": [], "market_context": {}},
        )
        resp = auth_client.get("/api/stocks/plan/today/")
        assert resp.status_code == 200
        sizing = resp.json()["overlay"]["sizing"]
        assert sizing["NABIL"]["shares"] == 909  # 10000 / (101 - 90)
