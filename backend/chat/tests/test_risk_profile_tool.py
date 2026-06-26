import asyncio

import pytest
from django.contrib.auth import get_user_model

from chat.tools import portfolio as ptools
from chat import _user_context

pytestmark = pytest.mark.django_db
User = get_user_model()


def _run(coro):
    return asyncio.run(coro)


def test_risk_profile_prose_includes_market_metrics(monkeypatch):
    user = User.objects.create_user(username="rp", password="p")
    fake = {
        "radar_data": [{"axis": "Systemic Risk", "value": 6.0, "fullMark": 10}],
        "alerts": [], "holdings_metrics": [],
        "summary": {"total_value": 100000, "risk_level": "MEDIUM"},
        "market_risk": {
            "window": 180, "portfolio_beta": 1.2, "beta_confidence": "full",
            "value_at_risk": {"var_95_1d": 0.03, "var_99_1d": 0.05, "var_95_1w": 0.067},
            "max_drawdown": -0.18,
            "correlation": {"tickers": [], "matrix": [], "average_correlation": None},
            "per_holding": [],
        },
    }
    monkeypatch.setattr(
        ptools.RiskAnalysisService, "get_risk_analysis",
        staticmethod(lambda u, account_id=None: fake),
    )
    _user_context.set_user(user)
    _user_context.reset_cards()
    try:
        result = _run(ptools.get_risk_profile.handler({"account_id": None}))
    finally:
        _user_context.reset_cards()
    text = result["content"][0]["text"]
    assert "beta 1.2" in text
    assert "18.0%" in text  # max drawdown
