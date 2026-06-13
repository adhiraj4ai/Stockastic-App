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

        statuses = plan.payload["entry_statuses"]
        assert statuses["NABIL"] == "IN_ZONE"
        assert set(statuses.keys()) == {"NABIL", "WEAK", "BADCO"}

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
            first = build_daily_plan(as_of=date_cls(2026, 6, 10))
            second = build_daily_plan(as_of=date_cls(2026, 6, 10))

        assert DailyTradingPlan.objects.count() == 1
        assert first.was_regenerated is True
        assert second.was_regenerated is False  # same as_of: holiday guard flag


@pytest.mark.django_db
class TestUserOverlay:
    def test_position_near_stop_and_target(self, create_user):
        from stocks.models import PortfolioItem
        from stocks.services.daily_plan import user_overlay
        user = create_user(username="u1", password="x")
        PortfolioItem.objects.create(user=user, ticker="NABIL", quantity=10,
                                     buy_price=Decimal("110"),
                                     stop_loss_price=Decimal("100"),
                                     target_price=Decimal("130"))
        PortfolioItem.objects.create(user=user, ticker="SAFE", quantity=10,
                                     buy_price=Decimal("100"),
                                     stop_loss_price=Decimal("80"),
                                     target_price=Decimal("200"))
        with patch("stocks.services.daily_plan._latest_closes",
                   return_value={"NABIL": 101.0, "SAFE": 150.0}):
            overlay = user_overlay(user)
        tickers = [p["ticker"] for p in overlay["positions_near_action"]]
        assert "NABIL" in tickers and "SAFE" not in tickers
        nabil = next(p for p in overlay["positions_near_action"] if p["ticker"] == "NABIL")
        assert nabil["near"] == "STOP_LOSS"

    def test_signal_flip_against_holding(self, create_user):
        from stocks.models import PortfolioItem, SignalEpisode
        from stocks.services.daily_plan import user_overlay
        user = create_user(username="u2", password="x")
        PortfolioItem.objects.create(user=user, ticker="NICA", quantity=5,
                                     buy_price=Decimal("450"))
        SignalEpisode.objects.create(source="DISTRIBUTION_ALERT", producer_key="DISTRIBUTION_ALERT",
                                     symbol="NICA", direction="SELL",
                                     start_date=date_cls(2026, 6, 10),
                                     last_signal_date=date_cls(2026, 6, 10),
                                     entry_price=Decimal("500"))
        with patch("stocks.services.daily_plan._latest_closes",
                   return_value={"NICA": 500.0}):
            overlay = user_overlay(user)
        assert overlay["signal_flips"][0]["symbol"] == "NICA"
        assert overlay["signal_flips"][0]["source"] == "DISTRIBUTION_ALERT"

    def test_watchlist_trigger(self, create_user):
        from stocks.models import WatchlistItem
        from stocks.services.daily_plan import user_overlay
        user = create_user(username="u3", password="x")
        WatchlistItem.objects.create(user=user, ticker="SCB", target_price=Decimal("100"))
        with patch("stocks.services.daily_plan._latest_closes",
                   return_value={"SCB": 99.0}):
            overlay = user_overlay(user)
        assert overlay["watchlist_triggers"][0]["ticker"] == "SCB"

    def test_empty_for_user_with_nothing(self, create_user):
        from stocks.services.daily_plan import user_overlay
        user = create_user(username="u4", password="x")
        overlay = user_overlay(user)
        assert overlay == {"positions_near_action": [], "signal_flips": [], "watchlist_triggers": []}


@pytest.mark.django_db
class TestGenerateDailyPlanTask:
    @patch("stocks.services.daily_plan.build_daily_plan")
    def test_task_builds_plan_and_notifies(self, mock_build, create_user):
        from stocks.models import DailyTradingPlan, Notification
        from stocks.tasks import generate_daily_plan_task
        from users.models import TierPermission

        user = create_user(username="planuser", password="x")
        user.profile.subscription_tier = "PRO"
        user.profile.save()
        TierPermission.objects.create(tier="PRO", module_key="daily_plan", is_enabled=True)

        plan = DailyTradingPlan.objects.create(
            date=date_cls(2026, 6, 11), regime="RISK_ON",
            payload={"picks": [{"symbol": "NABIL"}], "catalysts": []},
        )
        mock_build.return_value = plan

        result = generate_daily_plan_task()

        assert result["plan_date"] == "2026-06-11"
        notif = Notification.objects.get(user=user)
        assert notif.type == "DAILY_PLAN_READY"
        # Notification now deep-links to the seeded morning-briefing chat session.
        assert notif.redirect_url.startswith("/chat?session=")

    @patch("stocks.services.daily_plan.build_daily_plan", side_effect=ValueError("no price data"))
    def test_task_failure_logged_not_raised(self, mock_build):
        from stocks.models import DataUploadLog
        from stocks.tasks import generate_daily_plan_task
        result = generate_daily_plan_task()
        assert result["status"] == "FAILED"
        log = DataUploadLog.objects.latest("created_at")
        assert log.upload_type == "PLAN"
        assert log.status == "FAILED"

    @patch("stocks.services.daily_plan.build_daily_plan")
    def test_task_skips_when_not_regenerated(self, mock_build, create_user):
        from stocks.models import DailyTradingPlan, DataUploadLog, Notification
        from stocks.tasks import generate_daily_plan_task
        from users.models import TierPermission

        user = create_user(username="planuser2", password="x")
        user.profile.subscription_tier = "PRO"
        user.profile.save()
        TierPermission.objects.create(tier="PRO", module_key="daily_plan", is_enabled=True)

        plan = DailyTradingPlan.objects.create(
            date=date_cls(2026, 6, 11), regime="RISK_ON",
            payload={"picks": [{"symbol": "NABIL"}], "catalysts": []},
        )
        plan.was_regenerated = False  # holiday / no new data
        mock_build.return_value = plan

        result = generate_daily_plan_task()

        assert result == {"status": "SKIPPED", "plan_date": "2026-06-11"}
        assert Notification.objects.count() == 0
        assert not DataUploadLog.objects.filter(upload_type="PLAN", status="SUCCESS").exists()


@pytest.mark.django_db
class TestMorningBriefing:
    def _setup(self, create_user, username="briefuser"):
        from users.models import TierPermission
        user = create_user(username=username, password="x")
        user.profile.subscription_tier = "PRO"
        user.profile.save()
        TierPermission.objects.get_or_create(
            tier="PRO", module_key="daily_plan", defaults={"is_enabled": True}
        )
        return user

    def _plan(self):
        from stocks.models import DailyTradingPlan
        plan = DailyTradingPlan.objects.create(
            date=date_cls(2026, 6, 12), regime="RISK_ON",
            payload={"as_of": "2026-06-11",
                     "picks": [{"symbol": "SHL", "confluence_score": 81, "direction": "BUY",
                                "entry": {"price": 600.0, "zone_low": 590.0, "zone_high": 612.0,
                                          "status": "IN_ZONE", "last_signal_age_days": 1,
                                          "latest_close": 601.0},
                                "targets": {"tp1": 640.0, "sl": 585.0},
                                "analog": None, "catalyst": None,
                                "components": {"engine_agreement": {"active_buy_sources": ["A"], "conflicting_sources": []},
                                                "opportunity": {"trust": None}, "accumulation": {}, "sector": {}}}],
                     "watch": [], "exits": [], "catalysts": [], "market_context": {},
                     "entry_statuses": {"SHL": "IN_ZONE"}},
        )
        plan.was_regenerated = True
        return plan

    @patch("stocks.services.daily_plan.user_overlay",
           return_value={"positions_near_action": [], "signal_flips": [], "watchlist_triggers": []})
    @patch("stocks.services.daily_plan.build_daily_plan")
    def test_briefing_session_created_and_linked(self, mock_build, _overlay, create_user):
        from chat.models import ChatMessage, ChatSession
        from stocks.models import Notification
        from stocks.tasks import generate_daily_plan_task
        user = self._setup(create_user)
        mock_build.return_value = self._plan()

        generate_daily_plan_task()

        session = ChatSession.objects.get(user=user, title="Morning Briefing — 2026-06-12")
        msg = ChatMessage.objects.get(session=session)
        assert msg.role == ChatMessage.ROLE_ASSISTANT
        assert "SHL" in msg.text
        # Frontend renders assistant blocks keyed on `kind` (see MessageBubble.tsx /
        # streaming.py); a single text block is the fallback shape.
        assert msg.blocks == [{"kind": "text", "subagent": None, "text": msg.text}]
        notif = Notification.objects.get(user=user, type="DAILY_PLAN_READY")
        assert notif.redirect_url == f"/chat?session={session.id}"

    @patch("stocks.services.daily_plan.user_overlay",
           return_value={"positions_near_action": [], "signal_flips": [], "watchlist_triggers": []})
    @patch("stocks.services.daily_plan.build_daily_plan")
    def test_idempotent_no_duplicate_session_or_message(self, mock_build, _overlay, create_user):
        from chat.models import ChatMessage, ChatSession
        from stocks.tasks import generate_daily_plan_task
        user = self._setup(create_user)
        # Same plan object (was_regenerated=True) returned on both runs.
        mock_build.return_value = self._plan()

        generate_daily_plan_task()
        generate_daily_plan_task()

        title = "Morning Briefing — 2026-06-12"
        assert ChatSession.objects.filter(user=user, title=title).count() == 1
        session = ChatSession.objects.get(user=user, title=title)
        assert ChatMessage.objects.filter(session=session).count() == 1

    @patch("stocks.services.daily_plan.user_overlay",
           side_effect=RuntimeError("price table exploded"))
    @patch("stocks.services.daily_plan.build_daily_plan")
    def test_overlay_failure_isolated_falls_back_to_plan_url(self, mock_build, _overlay, create_user):
        """If one user's briefing build raises, the loop still notifies with /plan."""
        from chat.models import ChatSession
        from stocks.models import Notification
        from stocks.tasks import generate_daily_plan_task
        user = self._setup(create_user)
        mock_build.return_value = self._plan()

        generate_daily_plan_task()

        assert not ChatSession.objects.filter(user=user).exists()
        notif = Notification.objects.get(user=user, type="DAILY_PLAN_READY")
        assert notif.redirect_url == "/plan"


@pytest.mark.django_db
class TestSectorIntensities:
    @patch("stocks.views.sector_rotation._compute_current_acc_signals")
    def test_passes_symbol_keyed_mapping(self, mock_compute):
        from stocks.services.daily_plan import _sector_intensities

        mock_compute.return_value = {"Banking": {"acc_intensity": 5.2}}
        with patch("stocks.services.daily_plan._company_sector_pairs",
                   return_value=[("NABIL", "Banking")]):
            out = _sector_intensities()

        called_mapping = mock_compute.call_args[0][0]
        # Regression: the helper used to pass {sector: [symbols]}, which the
        # downstream function reads as symbol keys → empty frames → {}.
        assert called_mapping == {"NABIL": "Banking"}
        assert out == {"NABIL": 5.2}


@pytest.mark.django_db
class TestFetchActionsMapArraySafety:
    def test_accepts_numpy_array_of_tickers(self):
        # Regression: _load_price_df_sector passes df['ticker'].unique() (ndarray);
        # bare `if tickers:` raised "truth value of an array is ambiguous".
        import numpy as np
        from stocks.services.backtest_harness.runner import fetch_actions_map
        assert fetch_actions_map(np.array(["NABIL", "NICA"])) == {}
        assert fetch_actions_map(np.array([])) == {}
        assert fetch_actions_map(None) == {}


@pytest.mark.django_db
class TestPlanGenerateView:
    def test_post_returns_plan(self, auth_client):
        plan_obj = DailyTradingPlan.objects.create(
            date=date(2026, 6, 13),
            regime="RISK_ON",
            breadth=0.6,
            payload={"picks": [], "exits": [], "catalysts": [], "market_context": {}},
        )
        with patch("stocks.views.plan.build_daily_plan", return_value=plan_obj) as mock_build, \
             patch("stocks.views.plan.user_overlay", return_value={}), \
             patch("stocks.views.plan.sizing_map_for_user", return_value={}):
            resp = auth_client.post("/api/stocks/plan/generate/")
        assert resp.status_code == 200
        data = resp.json()
        assert data["date"] == "2026-06-13"
        assert "picks" in data["payload"]
        assert "overlay" in data
        mock_build.assert_called_once()

    def test_post_unauthenticated_returns_401(self, api_client):
        resp = api_client.post("/api/stocks/plan/generate/")
        assert resp.status_code == 401

    def test_post_build_failure_returns_400(self, auth_client):
        with patch("stocks.views.plan.build_daily_plan", side_effect=ValueError("no data")):
            resp = auth_client.post("/api/stocks/plan/generate/")
        assert resp.status_code == 400
        assert "no data" in resp.json()["detail"]
