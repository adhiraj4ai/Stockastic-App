import pytest
from decimal import Decimal
from stocks.services.position_sizing import size_position, default_account_for, sizing_map_for_user


class TestSizePosition:
    def test_happy_path(self):
        # 1,000,000 balance, 1% risk = 10,000 risk; entry 612, stop 562 → 50/share → 200 shares
        out = size_position(balance=1_000_000, risk_pct=1.0, entry=612.0, stop=562.0)
        assert out == {
            "shares": 200,
            "risk_amount": 10000.0,
            "position_value": 122400.0,
            "risk_pct": 1.0,
            "entry": 612.0,
            "stop": 562.0,
        }

    def test_floors_to_whole_shares(self):
        out = size_position(balance=100_000, risk_pct=2.0, entry=613.0, stop=600.0)
        assert out["shares"] == 153  # 2000 / 13 = 153.8 → 153

    def test_unsizeable_cases(self):
        assert size_position(100_000, 2.0, entry=600.0, stop=600.0) is None  # zero risk/share
        assert size_position(100_000, 2.0, entry=600.0, stop=610.0) is None  # stop above entry
        assert size_position(100_000, 2.0, entry=600.0, stop=None) is None
        assert size_position(0, 2.0, entry=600.0, stop=590.0) is None
        assert size_position(100_000, 0, entry=600.0, stop=590.0) is None
        assert size_position(1_000, 1.0, entry=600.0, stop=400.0) is None    # < 1 share
        assert size_position(100_000, 2.0, entry=0.0, stop=-10.0) is None  # impossible price


@pytest.mark.django_db
class TestDefaultAccountFor:
    def test_prefers_live_account(self, create_user):
        from stocks.models import PortfolioAccount
        user = create_user(username="s1", password="x")
        PortfolioAccount.objects.create(user=user, name="Paper", account_type="PAPER",
                                        balance=Decimal("500000"))
        live = PortfolioAccount.objects.create(user=user, name="Live", account_type="LIVE",
                                               balance=Decimal("1000000"))
        assert default_account_for(user).id == live.id

    def test_falls_back_to_first_then_none(self, create_user):
        from stocks.models import PortfolioAccount
        u1 = create_user(username="s2", password="x")
        paper = PortfolioAccount.objects.create(user=u1, name="Paper", account_type="PAPER",
                                                balance=Decimal("500000"))
        assert default_account_for(u1).id == paper.id
        u2 = create_user(username="s3", password="x")
        assert default_account_for(u2) is None


@pytest.mark.django_db
class TestSizingMapForUser:
    def test_maps_picks_with_entry_and_stop(self, create_user):
        from stocks.models import PortfolioAccount
        user = create_user(username="s4", password="x")
        PortfolioAccount.objects.create(user=user, name="Live", account_type="LIVE",
                                        balance=Decimal("1000000"),
                                        default_risk_percentage=Decimal("1.00"))
        picks = [
            {"symbol": "NABIL", "entry": {"latest_close": 612.0, "status": "IN_ZONE", "price": 610.0},
             "targets": {"tp1": 700.0, "sl": 562.0}},
            {"symbol": "NOSL", "entry": {"latest_close": 100.0, "status": "IN_ZONE", "price": 100.0},
             "targets": {"tp1": 120.0, "sl": None}},
        ]
        out = sizing_map_for_user(user, picks)
        assert out["NABIL"]["shares"] == 200
        assert out["NABIL"]["account_name"] == "Live"
        assert "NOSL" not in out  # no stop → unsizeable

    def test_empty_without_account(self, create_user):
        user = create_user(username="s5", password="x")
        assert sizing_map_for_user(user, [{"symbol": "X"}]) == {}
