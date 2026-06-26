# backend/stocks/tests/test_market_risk_service.py
import numpy as np
import pandas as pd
import pytest
from stocks.services.risk import market_risk_service as mrs
from stocks.services.risk import return_series as rs


class _FakeSeries:
    def __init__(self, returns, counts, window=180):
        self.returns = returns
        self.sample_counts = counts
        self.window = window


def _patch_build(monkeypatch, frame, counts):
    monkeypatch.setattr(rs, "build", lambda tickers, window=180: _FakeSeries(frame, counts, window))
    monkeypatch.setattr(mrs, "build", rs.build)


def test_high_beta_portfolio_emits_market_sensitivity_alert(monkeypatch):
    idx = np.array([0.01, -0.02, 0.03, -0.01, 0.02] * 14)        # 70 points
    frame = pd.DataFrame({"AAA": idx * 2, rs.INDEX_COLUMN: idx})
    _patch_build(monkeypatch, frame, {"AAA": 70})
    out = mrs.MarketRiskService.compute([{"ticker": "AAA", "weight": 100.0}], window=180)
    assert out["market_risk"]["portfolio_beta"] == pytest.approx(2.0, abs=0.01)
    assert any(a["type"] == "MARKET_BETA" and a["level"] == "HIGH" for a in out["alerts"])


def test_correlated_pair_emits_hidden_concentration_alert(monkeypatch):
    base = np.array([0.01, -0.02, 0.03, -0.01, 0.02] * 14)
    frame = pd.DataFrame({"AAA": base, "BBB": base, rs.INDEX_COLUMN: base})
    _patch_build(monkeypatch, frame, {"AAA": 70, "BBB": 70})
    holdings = [{"ticker": "AAA", "weight": 50.0}, {"ticker": "BBB", "weight": 50.0}]
    out = mrs.MarketRiskService.compute(holdings, window=180)
    assert any(a["type"] == "CORRELATION" for a in out["alerts"])


def test_empty_holdings_returns_null_metrics_no_crash(monkeypatch):
    _patch_build(monkeypatch, pd.DataFrame(), {})
    out = mrs.MarketRiskService.compute([], window=180)
    assert out["market_risk"]["portfolio_beta"] is None
    assert out["alerts"] == []
