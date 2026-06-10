import pytest
from datetime import date, date as date_cls, timedelta
from decimal import Decimal
from unittest.mock import patch

import pandas as pd
import numpy as np

from stocks.models import DailyTradingPlan
from django.db import IntegrityError, transaction


@pytest.mark.django_db
class TestDailyTradingPlanModel:
    def test_create_and_unique_date(self):
        plan = DailyTradingPlan.objects.create(
            date=date(2026, 6, 11),
            regime="RISK_ON",
            breadth=0.65,
            payload={"picks": [], "exits": [], "catalysts": [], "market_context": {}},
        )
        assert plan.generated_at is not None
        assert plan.payload["picks"] == []
        with pytest.raises(IntegrityError):
            with transaction.atomic():
                DailyTradingPlan.objects.create(date=date(2026, 6, 11), regime="NEUTRAL", payload={})


def _make_price_df(closes, start=date_cls(2026, 4, 1)):
    """Build a synthetic OHLCV DataFrame with DatetimeIndex (no DB access needed).

    DailyStockPrice is managed=False (unmanaged table) so we cannot seed via ORM
    in the test DB. Instead tests patch stocks.services.daily_plan._load_price_df
    with this helper to inject a well-formed DataFrame directly.
    """
    d = start
    dates = []
    for _ in closes:
        while d.weekday() in (4, 5):  # skip NEPSE-closed Fri/Sat
            d += timedelta(days=1)
        dates.append(pd.Timestamp(d))
        d += timedelta(days=1)
    arr = np.array([float(c) for c in closes])
    df = pd.DataFrame(
        {
            "Open": arr,
            "High": arr + 2,
            "Low": arr - 2,
            "Close": arr,
            "Volume": np.full(len(arr), 1000.0),
        },
        index=pd.DatetimeIndex(dates),
    )
    df.index.name = "date"
    return df


class TestNextTradingDate:
    def test_skips_friday_and_saturday(self):
        from stocks.services.daily_plan import next_trading_date
        assert next_trading_date(date_cls(2026, 6, 11)) == date_cls(2026, 6, 14)  # Thu -> Sun
        assert next_trading_date(date_cls(2026, 6, 14)) == date_cls(2026, 6, 15)  # Sun -> Mon


@pytest.mark.django_db
class TestBuildDailyPlan:
    @patch("stocks.services.daily_plan.analog_stats", return_value=None)
    @patch("stocks.services.daily_plan.upcoming_catalysts", return_value=[])
    @patch("stocks.services.daily_plan._sector_intensities", return_value={})
    @patch("stocks.services.daily_plan.rank_opportunities")
    @patch("stocks.services.daily_plan.current_regime")
    def test_builds_picks_sorted_by_confluence(self, mock_regime, mock_opps, *_):
        from stocks.models import SignalEpisode, DailyTradingPlan
        from stocks.services.daily_plan import build_daily_plan

        mock_regime.return_value = {"regime": "RISK_ON", "breadth": 0.65, "as_of": "2026-06-10"}
        mock_opps.return_value = {
            "opportunities": [
                {"symbol": "NABIL", "trust": "CONFIRMED", "pvalue": 0.02, "edge": 0.15,
                 "producer": "SMART_MONEY", "close": 100.0, "score": 0.1},
                {"symbol": "BADCO", "trust": "DIVERGENT", "pvalue": 0.01, "edge": 0.30,
                 "producer": "ICHIMOKU", "close": 50.0, "score": -1.0},
            ],
            "exits": [], "skipped": 0,
        }
        latest = date_cls(2026, 6, 10)
        # Build synthetic DataFrames; last date in df must be >= as_of (2026-06-10)
        nabil_df = _make_price_df([100.0] * 30)
        weak_df = _make_price_df([100.0] * 30)
        badco_df = _make_price_df([50.0] * 30)

        def fake_load_price_df(symbol):
            if symbol == "NABIL":
                return nabil_df
            if symbol == "WEAK":
                return weak_df
            if symbol == "BADCO":
                return badco_df
            return pd.DataFrame()

        for src in ("SMART_MONEY", "ICHIMOKU", "VOLUME_BREAKOUT"):
            SignalEpisode.objects.create(
                source=src, producer_key=src, symbol="NABIL", direction="BUY",
                start_date=latest, last_signal_date=latest,
                entry_price=Decimal("100"), target_price=Decimal("120"),
                stop_loss_price=Decimal("90"), entry_strength=80,
                metadata={"inst_net_5d": 150000, "markup_percent": -2.0},
            )
        SignalEpisode.objects.create(
            source="ICHIMOKU", producer_key="ICHIMOKU", symbol="WEAK", direction="BUY",
            start_date=latest, last_signal_date=latest,
            entry_price=Decimal("100"), entry_strength=40, metadata={},
        )
        # BADCO has a real BUY episode (same engine as WEAK) but its opportunity row is
        # DIVERGENT — that row must be filtered before scoring.
        SignalEpisode.objects.create(
            source="ICHIMOKU", producer_key="ICHIMOKU", symbol="BADCO", direction="BUY",
            start_date=latest, last_signal_date=latest,
            entry_price=Decimal("50"), entry_strength=40, metadata={},
        )

        with patch("stocks.services.daily_plan._load_price_df", side_effect=fake_load_price_df):
            plan = build_daily_plan(as_of=latest)

        assert isinstance(plan, DailyTradingPlan)
        assert plan.date == date_cls(2026, 6, 11)  # Wed -> Thu
        assert plan.regime == "RISK_ON"
        picks_and_watch = plan.payload["picks"] + plan.payload["watch"]
        symbols = [p["symbol"] for p in plan.payload["picks"]]
        assert symbols[0] == "NABIL"          # higher confluence first
        nabil = plan.payload["picks"][0]
        assert nabil["entry"]["status"] == "IN_ZONE"
        second = plan.payload["picks"][1] if len(plan.payload["picks"]) > 1 else plan.payload["watch"][0]
        assert nabil["confluence_score"] > second["confluence_score"]
        assert nabil["targets"]["sl"] == 90.0
        # BADCO has a real episode so it appears as a candidate, but its DIVERGENT
        # opportunity row must have been filtered out before scoring.
        badco = next((p for p in picks_and_watch if p["symbol"] == "BADCO"), None)
        assert badco is not None
        assert badco["components"]["opportunity"]["trust"] is None  # DIVERGENT row filtered out

    @patch("stocks.services.daily_plan.analog_stats", return_value=None)
    @patch("stocks.services.daily_plan.upcoming_catalysts", return_value=[])
    @patch("stocks.services.daily_plan._sector_intensities", return_value={})
    @patch("stocks.services.daily_plan.rank_opportunities",
           return_value={"opportunities": [], "exits": [], "skipped": 0})
    @patch("stocks.services.daily_plan.current_regime",
           return_value={"regime": "RISK_OFF", "breadth": 0.31, "as_of": "2026-06-10"})
    def test_idempotent_upsert(self, *_):
        from stocks.models import DailyTradingPlan
        from stocks.services.daily_plan import build_daily_plan

        any_df = _make_price_df([100.0] * 30)

        with patch("stocks.services.daily_plan._load_price_df", return_value=any_df):
            build_daily_plan(as_of=date_cls(2026, 6, 10))
            build_daily_plan(as_of=date_cls(2026, 6, 10))

        assert DailyTradingPlan.objects.count() == 1
