import asyncio
from datetime import date
from decimal import Decimal

import pytest

from chat import _user_context


def _call(tool_fn, args):
    return asyncio.run(tool_fn.handler(args))


def _mk_plan(**extra_payload):
    from stocks.models import DailyTradingPlan
    payload = {"as_of": "2026-06-10",
               "picks": [{"symbol": "SHL", "confluence_score": 81,
                          "entry": {"price": 600.0, "zone_low": 590.0, "zone_high": 612.0,
                                    "status": "IN_ZONE", "last_signal_age_days": 1,
                                    "latest_close": 601.0},
                          "targets": {"tp1": 640.0, "sl": 585.0},
                          "analog": None, "catalyst": None, "direction": "BUY",
                          "components": {"engine_agreement": {"score": 50, "active_buy_sources": ["SMART_MONEY"], "conflicting_sources": []},
                                          "opportunity": {"score": 0, "trust": None, "edge": None, "pvalue": None},
                                          "accumulation": {"score": 0}, "sector": {"score": 50, "acc_intensity": None}}}],
               "watch": [], "exits": [], "catalysts": [], "market_context": {},
               "entry_statuses": {"SHL": "IN_ZONE"}}
    payload.update(extra_payload)
    return DailyTradingPlan.objects.create(date=date(2026, 6, 11), regime="RISK_OFF",
                                           breadth=0.24, payload=payload)


@pytest.mark.django_db(transaction=True)
class TestGetMyActions:
    def test_full_actions(self, create_user):
        from decimal import Decimal as D
        from stocks.models import PortfolioAccount, PortfolioItem, SignalEpisode, WatchlistItem
        from chat.tools import get_my_actions
        user = create_user(username="act1", password="x")
        _user_context.set_user(user)
        _mk_plan()
        PortfolioAccount.objects.create(user=user, name="Live", account_type="LIVE",
                                        balance=D("1000000"), default_risk_percentage=D("1.00"))
        PortfolioItem.objects.create(user=user, ticker="NICA", quantity=5, buy_price=D("450"))
        SignalEpisode.objects.create(source="DISTRIBUTION_ALERT", producer_key="DISTRIBUTION_ALERT",
                                     symbol="NICA", direction="SELL", start_date=date(2026, 6, 10),
                                     last_signal_date=date(2026, 6, 10), entry_price=D("500"))
        WatchlistItem.objects.create(user=user, ticker="SCB", target_price=D("100"))
        # overlay's _latest_closes hits the unmanaged price table — patch it
        from unittest.mock import patch
        with patch("stocks.services.daily_plan._latest_closes",
                   return_value={"NICA": 500.0, "SCB": 99.0}):
            out = _call(get_my_actions, {})
        text = out["content"][0]["text"]
        assert "NICA" in text          # signal against holding
        assert "SCB" in text           # watchlist trigger
        assert "SHL" in text           # sized pick suggestion
        assert "shares" in text.lower()

    def test_empty_state(self, create_user):
        from chat.tools import get_my_actions
        user = create_user(username="act2", password="x")
        _user_context.set_user(user)
        out = _call(get_my_actions, {})
        assert "nothing needs your attention" in out["content"][0]["text"].lower()


@pytest.mark.django_db(transaction=True)
class TestWatchlistTools:
    def test_add_update_remove(self, create_user):
        from stocks.models import WatchlistItem
        from chat.tools import add_to_watchlist, remove_from_watchlist
        user = create_user(username="wl1", password="x")
        _user_context.set_user(user)

        out = _call(add_to_watchlist, {"symbol": "nabil", "target_price": 600, "notes": "entry on dip"})
        item = WatchlistItem.objects.get(user=user, ticker="NABIL")
        assert float(item.target_price) == 600 and item.alert_enabled is True
        assert "NABIL" in out["content"][0]["text"]

        _call(add_to_watchlist, {"symbol": "NABIL", "stop_loss_price": 550})
        item.refresh_from_db()
        assert float(item.stop_loss_price) == 550
        assert float(item.target_price) == 600  # upsert preserves unset fields
        assert WatchlistItem.objects.filter(user=user).count() == 1

        out = _call(remove_from_watchlist, {"symbol": "NABIL"})
        assert WatchlistItem.objects.filter(user=user).count() == 0
        assert "removed" in out["content"][0]["text"].lower()

    def test_remove_missing_is_graceful(self, create_user):
        from chat.tools import remove_from_watchlist
        _user_context.set_user(create_user(username="wl2", password="x"))
        out = _call(remove_from_watchlist, {"symbol": "GHOST"})
        assert "not on" in out["content"][0]["text"].lower() or "no " in out["content"][0]["text"].lower()

    def test_level_update_preserves_disabled_alerts(self, create_user):
        from stocks.models import WatchlistItem
        from chat.tools import add_to_watchlist
        user = create_user(username="wl3", password="x")
        _user_context.set_user(user)
        _call(add_to_watchlist, {"symbol": "SHL", "alerts": False})
        item = WatchlistItem.objects.get(user=user, ticker="SHL")
        assert item.alert_enabled is False
        _call(add_to_watchlist, {"symbol": "SHL", "stop_loss_price": 550})
        item.refresh_from_db()
        assert item.alert_enabled is False  # level-only update must not re-enable
        assert float(item.stop_loss_price) == 550

    def test_new_item_defaults_alerts_on(self, create_user):
        from stocks.models import WatchlistItem
        from chat.tools import add_to_watchlist
        user = create_user(username="wl4", password="x")
        _user_context.set_user(user)
        out = _call(add_to_watchlist, {"symbol": "GVL"})
        assert WatchlistItem.objects.get(user=user, ticker="GVL").alert_enabled is True
        assert "alerts on" in out["content"][0]["text"]


@pytest.mark.django_db
class TestZoneEntryAlerts:
    def test_alert_created_when_in_zone(self, create_user):
        from stocks.models import DailyTradingPlan, Notification, WatchlistItem
        from stocks.services.notification_service import check_zone_entry_alerts
        user = create_user(username="zone1", password="x")
        WatchlistItem.objects.create(user=user, ticker="SHL", alert_enabled=True)
        WatchlistItem.objects.create(user=user, ticker="GVL", alert_enabled=True)   # EXTENDED → no alert
        WatchlistItem.objects.create(user=user, ticker="OFF", alert_enabled=False)  # alerts off → no alert
        DailyTradingPlan.objects.create(
            date=date(2026, 6, 12), regime="RISK_ON",
            payload={"entry_statuses": {"SHL": "IN_ZONE", "GVL": "EXTENDED", "OFF": "IN_ZONE"},
                     "picks": [], "watch": [], "exits": [], "catalysts": [], "market_context": {}})
        count = check_zone_entry_alerts(user)
        assert count == 1
        notif = Notification.objects.get(user=user, type="WATCHLIST_ENTRY")
        assert notif.ticker == "SHL"
        assert "/ticker/SHL" in notif.redirect_url

    def test_no_plan_no_alerts(self, create_user):
        from stocks.services.notification_service import check_zone_entry_alerts
        assert check_zone_entry_alerts(create_user(username="zone2", password="x")) == 0


@pytest.mark.django_db(transaction=True)
class TestChatActionRecord:
    def test_counts_and_honesty(self, create_user):
        from datetime import timedelta
        from decimal import Decimal as D
        from django.utils import timezone
        from stocks.models import TradePlan, TradePlanLeg
        from stocks.models.portfolio import PortfolioActionDraft
        from chat.tools import get_chat_action_record
        user = create_user(username="rec1", password="x")
        _user_context.set_user(user)
        expires = timezone.now() + timedelta(days=1)
        PortfolioActionDraft.objects.create(user=user, kind="TRADE", status="CONFIRMED",
                                            title="Buy 10 NABIL", payload={}, expires_at=expires)
        PortfolioActionDraft.objects.create(user=user, kind="TRADE", status="EXPIRED",
                                            title="Buy 5 SCB", payload={}, expires_at=expires)
        plan = TradePlan.objects.create(user=user, ticker="SHL", risk_budget_pct=D("1.00"))
        TradePlanLeg.objects.create(plan=plan, leg_number=1, price_target=D("600"),
                                    allocation_pct=D("100"), stop_loss_price=D("585"))
        out = _call(get_chat_action_record, {})
        text = out["content"][0]["text"]
        assert "CONFIRMED" in text or "confirmed" in text
        assert "TRADE" in text or "trade" in text
        assert "SHL" in text
        # honesty: realized-outcome attribution is explicitly not claimed
        assert "not" in text.lower() and ("track" in text.lower() or "attribut" in text.lower() or "measur" in text.lower())

    def test_empty_record(self, create_user):
        from chat.tools import get_chat_action_record
        _user_context.set_user(create_user(username="rec2", password="x"))
        out = _call(get_chat_action_record, {})
        assert "no " in out["content"][0]["text"].lower()
