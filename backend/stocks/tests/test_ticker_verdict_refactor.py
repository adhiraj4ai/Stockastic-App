import pytest
import pandas as pd
from unittest.mock import MagicMock, patch
from datetime import date


class TestCollectEpisodes:
    def test_returns_empty_list_when_no_prices(self):
        from stocks.services.ticker_verdict import _collect_episodes
        result = _collect_episodes(active=[MagicMock()], has_prices=False, price_df=None)
        assert result == []

    def test_returns_empty_list_when_active_is_empty(self):
        from stocks.services.ticker_verdict import _collect_episodes
        price_df = pd.DataFrame(
            {"Close": [100.0, 102.0]},
            index=pd.to_datetime(["2026-06-10", "2026-06-11"]),
        )
        result = _collect_episodes(active=[], has_prices=True, price_df=price_df)
        assert result == []

    def test_returns_correct_structure_for_one_episode(self):
        from stocks.services.ticker_verdict import _collect_episodes

        price_df = pd.DataFrame(
            {"Close": [100.0, 102.0, 104.0]},
            index=pd.to_datetime(["2026-06-09", "2026-06-10", "2026-06-11"]),
        )
        ep = MagicMock()
        ep.source = "RSI_OVERSOLD"
        ep.direction = "BUY"
        ep.entry_price = 100.0
        ep.entry_strength = 0.8
        ep.last_signal_date = date(2026, 6, 9)

        with patch("stocks.services.ticker_verdict.entry_status", return_value=("IN_ZONE", 99.0, 101.0)):
            result = _collect_episodes(active=[ep], has_prices=True, price_df=price_df)

        assert len(result) == 1
        item = result[0]
        assert item["source"] == "RSI_OVERSOLD"
        assert item["direction"] == "BUY"
        assert item["entry_price"] == 100.0
        assert item["strength"] == 0.8
        assert item["status"] == "IN_ZONE"
        assert "age_days" in item
        assert "last_signal_date" in item


class TestBuildEntryTargets:
    def test_returns_none_entry_and_empty_targets_when_no_buy_eps(self):
        from stocks.services.ticker_verdict import _build_entry_targets
        entry, targets = _build_entry_targets(buy_eps=[], has_prices=True, price_df=MagicMock())
        assert entry is None
        assert targets == {"tp1": None, "sl": None}

    def test_returns_none_entry_when_no_prices(self):
        from stocks.services.ticker_verdict import _build_entry_targets
        ep = MagicMock()
        entry, targets = _build_entry_targets(buy_eps=[ep], has_prices=False, price_df=None)
        assert entry is None
        assert targets == {"tp1": None, "sl": None}

    def test_returns_entry_dict_with_expected_keys(self):
        from stocks.services.ticker_verdict import _build_entry_targets

        price_df = pd.DataFrame(
            {"Close": [100.0, 102.0, 104.0]},
            index=pd.to_datetime(["2026-06-09", "2026-06-10", "2026-06-11"]),
        )
        ep = MagicMock()
        ep.entry_price = 100.0
        ep.target_price = 120.0
        ep.stop_loss_price = 90.0
        ep.last_signal_date = date(2026, 6, 9)

        with patch("stocks.services.ticker_verdict.entry_status", return_value=("IN_ZONE", 99.0, 101.0)):
            entry, targets = _build_entry_targets(buy_eps=[ep], has_prices=True, price_df=price_df)

        assert entry is not None
        assert set(entry.keys()) == {"price", "zone_low", "zone_high", "status", "last_signal_age_days", "latest_close"}
        assert targets["tp1"] == pytest.approx(120.0)
        assert targets["sl"] == pytest.approx(90.0)


class TestBuildEntryTargetsAnchorSelection:
    def test_picks_episode_with_latest_signal_date_as_anchor(self):
        from stocks.services.ticker_verdict import _build_entry_targets

        price_df = pd.DataFrame(
            {"Close": [100.0, 102.0, 104.0]},
            index=pd.to_datetime(["2026-06-09", "2026-06-10", "2026-06-11"]),
        )
        ep_old = MagicMock()
        ep_old.entry_price = 90.0
        ep_old.target_price = 110.0
        ep_old.stop_loss_price = 80.0
        ep_old.last_signal_date = date(2026, 6, 9)

        ep_new = MagicMock()
        ep_new.entry_price = 100.0
        ep_new.target_price = 125.0
        ep_new.stop_loss_price = 88.0
        ep_new.last_signal_date = date(2026, 6, 11)

        with patch("stocks.services.ticker_verdict.entry_status", return_value=("IN_ZONE", 98.0, 102.0)):
            entry, targets = _build_entry_targets(
                buy_eps=[ep_old, ep_new], has_prices=True, price_df=price_df
            )

        # ep_new has the latest date → it is the anchor; entry price must be ep_new's
        assert entry["price"] == pytest.approx(100.0)
        assert targets["tp1"] == pytest.approx(125.0)
        assert targets["sl"] == pytest.approx(88.0)


class TestBuildVerdict:
    def _patch_all(self, active_eps=None, opp_row=None, score=0.0, components=None, catalysts=None):
        """Return a context-manager stack that patches every external call in build_verdict."""
        from contextlib import ExitStack
        stack = ExitStack()
        stack.enter_context(patch("stocks.services.ticker_verdict._load_price_df", return_value=None))
        mock_ep_cls = stack.enter_context(patch("stocks.models.SignalEpisode"))
        mock_ep_cls.objects.filter.return_value = active_eps or []
        stack.enter_context(patch("stocks.services.ticker_verdict._best_opportunity_row", return_value=opp_row))
        stack.enter_context(patch("stocks.services.ticker_verdict._sector_intensity_for", return_value=None))
        stack.enter_context(
            patch("stocks.services.ticker_verdict.confluence_score", return_value=(score, components or {}))
        )
        stack.enter_context(patch("stocks.services.ticker_verdict.upcoming_catalysts", return_value=catalysts or []))
        return stack

    def test_returns_none_analog_when_no_prices(self):
        from stocks.services.ticker_verdict import build_verdict
        with self._patch_all():
            result = build_verdict("nabil")
        assert result["analog"] is None
        assert result["symbol"] == "NABIL"
        assert result["entry"] is None
        assert result["episodes"] == []

    def test_returns_required_keys(self):
        from stocks.services.ticker_verdict import build_verdict
        with self._patch_all(score=0.5):
            result = build_verdict("scb")
        required_keys = {
            "symbol", "as_of", "confluence_score", "components",
            "entry", "targets", "episodes", "analog", "catalyst",
        }
        assert required_keys.issubset(result.keys())
