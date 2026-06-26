import pytest
from django.contrib.auth import get_user_model
from stocks.models.portfolio import PortfolioItem
from stocks.services.risk_service import RiskAnalysisService
from stocks.services.risk import market_risk_service as mrs

pytestmark = pytest.mark.django_db
User = get_user_model()


def _fake_market(beta):
    block = {"window": 180, "portfolio_beta": beta, "beta_confidence": "full",
             "value_at_risk": {"var_95_1d": 0.03, "var_99_1d": 0.05, "var_95_1w": 0.067},
             "max_drawdown": -0.2, "correlation": {"tickers": [], "matrix": [], "average_correlation": None},
             "per_holding": []}
    return {"market_risk": block, "alerts": [{"type": "MARKET_BETA", "level": "HIGH", "message": "x"}]}


def test_systemic_axis_derives_from_beta(monkeypatch):
    user = User.objects.create_user(username="u1", password="p")
    PortfolioItem.objects.create(user=user, ticker="AAA", quantity=10, buy_price=100)
    monkeypatch.setattr(mrs.MarketRiskService, "compute", staticmethod(lambda h, window=180: _fake_market(1.0)))
    result = RiskAnalysisService.get_risk_analysis(user)
    systemic = next(d for d in result["radar_data"] if d["axis"] == "Systemic Risk")
    assert systemic["value"] == pytest.approx(5.0)        # beta 1.0 -> 5.0
    assert "market_risk" in result
    assert any(a["type"] == "MARKET_BETA" for a in result["alerts"])


def test_high_beta_pushes_systemic_axis_up(monkeypatch):
    user = User.objects.create_user(username="u2", password="p")
    PortfolioItem.objects.create(user=user, ticker="AAA", quantity=10, buy_price=100)
    monkeypatch.setattr(mrs.MarketRiskService, "compute", staticmethod(lambda h, window=180: _fake_market(2.0)))
    result = RiskAnalysisService.get_risk_analysis(user)
    systemic = next(d for d in result["radar_data"] if d["axis"] == "Systemic Risk")
    assert systemic["value"] == pytest.approx(10.0)       # clamp(2.0*5, 1, 10)
