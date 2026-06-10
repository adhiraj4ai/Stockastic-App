# backend/stocks/tests/test_market_regime.py
from stocks.services import market_regime


def test_regime_thresholds():
    assert market_regime.classify_breadth(0.75) == "RISK_ON"
    assert market_regime.classify_breadth(0.30) == "RISK_OFF"
    assert market_regime.classify_breadth(0.50) == "NEUTRAL"


def test_regime_boundaries():
    assert market_regime.classify_breadth(0.60) == "RISK_ON"   # >= 0.6
    assert market_regime.classify_breadth(0.40) == "RISK_OFF"  # <= 0.4


def test_current_regime_uses_breadth(monkeypatch):
    monkeypatch.setattr(market_regime, "_universe_breadth", lambda as_of=None: 0.8)
    r = market_regime.current_regime()
    assert r["regime"] == "RISK_ON" and r["breadth"] == 0.8


def test_current_regime_handles_no_data(monkeypatch):
    monkeypatch.setattr(market_regime, "_universe_breadth", lambda as_of=None: None)
    r = market_regime.current_regime()
    assert r["regime"] == "UNKNOWN"
