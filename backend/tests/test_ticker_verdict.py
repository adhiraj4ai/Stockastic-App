import pytest
import numpy as np
import pandas as pd
from datetime import date
from decimal import Decimal
from unittest.mock import patch


def _price_df(closes, start="2026-04-01"):
    idx = pd.bdate_range(start, periods=len(closes))
    s = pd.Series(closes, index=idx, dtype=float)
    return pd.DataFrame({"Open": s, "High": s + 2, "Low": s - 2, "Close": s,
                         "Volume": np.full(len(s), 1000.0)}, index=idx)


def _episode(**kw):
    from stocks.models import SignalEpisode
    defaults = dict(source="SMART_MONEY", producer_key="SMART_MONEY", symbol="NABIL",
                    direction="BUY", start_date=date(2026, 6, 10),
                    last_signal_date=date(2026, 6, 10), entry_price=Decimal("100"),
                    target_price=Decimal("120"), stop_loss_price=Decimal("90"),
                    entry_strength=80,
                    metadata={"inst_net_5d": 150000, "markup_percent": -2.0})
    defaults.update(kw)
    return SignalEpisode.objects.create(**defaults)


@pytest.mark.django_db
class TestBuildVerdict:
    @patch("stocks.services.ticker_verdict.analog_stats", return_value={"n": 8, "fwd_3d_median_pct": 1.5})
    @patch("stocks.services.ticker_verdict.upcoming_catalysts",
           return_value=[{"symbol": "NABIL", "type": "BOOK_CLOSE", "date": "2026-06-18",
                          "days_away": 6, "detail": "x"},
                         {"symbol": "OTHER", "type": "BOOK_CLOSE", "date": "2026-06-15",
                          "days_away": 3, "detail": "y"}])
    @patch("stocks.services.ticker_verdict._sector_intensity_for", return_value=12.4)
    @patch("stocks.services.ticker_verdict.rank_opportunities")
    @patch("stocks.services.ticker_verdict._load_price_df")
    def test_full_verdict(self, mock_prices, mock_opps, *_):
        from stocks.services.ticker_verdict import build_verdict
        mock_prices.return_value = _price_df([100.0] * 30)
        mock_opps.return_value = {"opportunities": [
            {"symbol": "NABIL", "trust": "CONFIRMED", "pvalue": 0.02, "edge": 0.15, "score": 0.1},
            {"symbol": "NABIL", "trust": "DIVERGENT", "pvalue": 0.01, "edge": 0.5, "score": -1.0},
        ], "exits": []}
        for src in ("SMART_MONEY", "ICHIMOKU", "VOLUME_BREAKOUT"):
            _episode(source=src, producer_key=src)
        _episode(source="DISTRIBUTION_ALERT", producer_key="DISTRIBUTION_ALERT",
                 direction="SELL", entry_price=Decimal("100"), metadata={})

        v = build_verdict("NABIL")

        assert v["symbol"] == "NABIL"
        # engine: 3 buys - 1 conflict = 2 → 50; opp CONFIRMED sig → 100; acc → 100; sector 12.4 → 100
        assert v["confluence_score"] == round(0.35 * 50 + 0.35 * 100 + 0.20 * 100 + 0.10 * 100)
        assert v["components"]["opportunity"]["trust"] == "CONFIRMED"  # DIVERGENT row filtered
        assert v["entry"]["status"] == "IN_ZONE"
        assert v["targets"] == {"tp1": 120.0, "sl": 90.0}
        assert len(v["episodes"]) == 4
        buy_row = next(e for e in v["episodes"] if e["source"] == "SMART_MONEY")
        assert buy_row["status"] == "IN_ZONE" and buy_row["direction"] == "BUY"
        assert v["analog"]["n"] == 8
        assert v["catalyst"]["type"] == "BOOK_CLOSE" and v["catalyst"]["symbol"] == "NABIL"
        import json
        json.dumps(v)  # payload must be JSON-serializable

    @patch("stocks.services.ticker_verdict.analog_stats", return_value=None)
    @patch("stocks.services.ticker_verdict.upcoming_catalysts", return_value=[])
    @patch("stocks.services.ticker_verdict._sector_intensity_for", return_value=None)
    @patch("stocks.services.ticker_verdict.rank_opportunities",
           return_value={"opportunities": [], "exits": []})
    @patch("stocks.services.ticker_verdict._load_price_df")
    def test_no_active_buy_episodes(self, mock_prices, *_):
        from stocks.services.ticker_verdict import build_verdict
        mock_prices.return_value = _price_df([100.0] * 30)
        v = build_verdict("EMPTY")
        assert v["entry"] is None
        assert v["episodes"] == []
        assert v["confluence_score"] == round(0.10 * 50)  # only neutral sector contributes

    @patch("stocks.services.ticker_verdict.analog_stats", return_value=None)
    @patch("stocks.services.ticker_verdict.upcoming_catalysts", return_value=[])
    @patch("stocks.services.ticker_verdict._sector_intensity_for", return_value=None)
    @patch("stocks.services.ticker_verdict.rank_opportunities",
           return_value={"opportunities": [], "exits": []})
    @patch("stocks.services.ticker_verdict._load_price_df", return_value=pd.DataFrame())
    def test_no_price_data(self, *_):
        from stocks.services.ticker_verdict import build_verdict
        _episode(symbol="NOPX", producer_key="SMART_MONEY")
        v = build_verdict("NOPX")
        assert v["entry"] is None and v["episodes"] == []


@pytest.mark.django_db
class TestTickerVerdictAPI:
    def _fake_verdict(self, symbol="NABIL"):
        return {"symbol": symbol, "as_of": "2026-06-10", "confluence_score": 81,
                "components": {}, "episodes": [],
                "entry": {"price": 100.0, "zone_low": 96.0, "zone_high": 104.0,
                          "status": "IN_ZONE", "last_signal_age_days": 1,
                          "latest_close": 101.0},
                "targets": {"tp1": 120.0, "sl": 90.0}, "analog": None, "catalyst": None}

    def test_returns_verdict_with_sizing(self, auth_client):
        from decimal import Decimal as D
        from django.contrib.auth.models import User
        from django.core.cache import cache
        from stocks.models import PortfolioAccount
        cache.clear()
        user = User.objects.get(username="testuser")
        PortfolioAccount.objects.create(user=user, name="Live", account_type="LIVE",
                                        balance=D("1000000"),
                                        default_risk_percentage=D("1.00"))
        with patch("stocks.views.ticker_verdict.build_verdict",
                   return_value=self._fake_verdict()) as mock_build:
            resp = auth_client.get("/api/stocks/ticker-verdict/NABIL/")
            assert resp.status_code == 200
            data = resp.json()
            assert data["confluence_score"] == 81
            # entry IN_ZONE → sized at latest_close 101; 10000 / (101-90) = 909
            assert data["sizing"]["shares"] == 909
            assert data["sizing"]["account_name"] == "Live"
            resp_lower = auth_client.get("/api/stocks/ticker-verdict/nabil/")
        assert resp_lower.status_code == 200
        assert resp_lower.json()["confluence_score"] == 81
        mock_build.assert_called_once()  # lowercase hit the SAME cache entry

    def test_cache_hit_skips_recompute_but_not_sizing(self, auth_client):
        from decimal import Decimal as D
        from django.contrib.auth.models import User
        from django.core.cache import cache
        from stocks.models import PortfolioAccount
        cache.clear()
        user = User.objects.get(username="testuser")
        account = PortfolioAccount.objects.create(
            user=user, name="Live", account_type="LIVE",
            balance=D("1000000"), default_risk_percentage=D("1.00"))
        with patch("stocks.views.ticker_verdict.build_verdict",
                   return_value=self._fake_verdict()) as mock_build:
            resp1 = auth_client.get("/api/stocks/ticker-verdict/NABIL/")
            account.delete()
            resp2 = auth_client.get("/api/stocks/ticker-verdict/NABIL/")
        assert mock_build.call_count == 1          # second call served from cache
        assert resp1.json()["sizing"]["shares"] == 909
        assert resp2.json()["sizing"] is None       # sizing per-request, never cached

    def test_requires_auth(self, api_client):
        resp = api_client.get("/api/stocks/ticker-verdict/NABIL/")
        assert resp.status_code in (401, 403)
