import pytest
from collections import defaultdict
from unittest.mock import patch, MagicMock
from datetime import date


class TestFetchOpportunities:
    def test_returns_empty_dicts_when_no_opportunities(self):
        from stocks.services.daily_plan import _fetch_opportunities
        with patch("stocks.services.daily_plan.rank_opportunities", return_value={"opportunities": [], "exits": []}):
            opp_result, opp_by_symbol = _fetch_opportunities()
        assert opp_result == {"opportunities": [], "exits": []}
        assert opp_by_symbol == {}

    def test_excludes_divergent_rows(self):
        from stocks.services.daily_plan import _fetch_opportunities
        rows = [
            {"symbol": "NABIL", "score": 0.9, "trust": "DIVERGENT"},
            {"symbol": "SCB", "score": 0.7, "trust": "CONVERGING"},
        ]
        with patch("stocks.services.daily_plan.rank_opportunities", return_value={"opportunities": rows, "exits": []}):
            _, opp_by_symbol = _fetch_opportunities()
        assert "NABIL" not in opp_by_symbol
        assert "SCB" in opp_by_symbol

    def test_keeps_highest_scoring_row_per_symbol(self):
        from stocks.services.daily_plan import _fetch_opportunities
        rows = [
            {"symbol": "NABIL", "score": 0.5, "trust": "CONVERGING"},
            {"symbol": "NABIL", "score": 0.9, "trust": "CONVERGING"},
        ]
        with patch("stocks.services.daily_plan.rank_opportunities", return_value={"opportunities": rows, "exits": []}):
            _, opp_by_symbol = _fetch_opportunities()
        assert opp_by_symbol["NABIL"]["score"] == 0.9


class TestFetchActiveEpisodes:
    def test_returns_empty_defaultdicts_when_no_episodes(self):
        from stocks.services.daily_plan import _fetch_active_episodes
        with patch("stocks.services.daily_plan.SignalEpisode") as mock_model:
            mock_model.objects.filter.return_value = []
            buy_eps, sell_sources = _fetch_active_episodes()
        assert dict(buy_eps) == {}
        assert dict(sell_sources) == {}

    def test_routes_buy_episodes_to_buy_eps(self):
        from stocks.services.daily_plan import _fetch_active_episodes, SELL_SIDE_SOURCES
        ep = MagicMock()
        ep.direction = "BUY"
        # use a source that is NOT in SELL_SIDE_SOURCES
        non_sell_sources = [s for s in ["RSI_OVERSOLD", "VOLUME_BREAKOUT", "MACD_CROSSOVER"] if s not in SELL_SIDE_SOURCES]
        ep.source = non_sell_sources[0] if non_sell_sources else "RSI_OVERSOLD"
        ep.symbol = "NABIL"
        with patch("stocks.services.daily_plan.SignalEpisode") as mock_model:
            mock_model.objects.filter.return_value = [ep]
            buy_eps, sell_sources = _fetch_active_episodes()
        assert "NABIL" in buy_eps
        assert ep in buy_eps["NABIL"]

    def test_routes_sell_side_sources_to_sell_sources(self):
        from stocks.services.daily_plan import _fetch_active_episodes, SELL_SIDE_SOURCES
        if not SELL_SIDE_SOURCES:
            pytest.skip("No SELL_SIDE_SOURCES defined")
        ep = MagicMock()
        ep.direction = "BUY"
        ep.source = next(iter(SELL_SIDE_SOURCES))
        ep.symbol = "SCB"
        with patch("stocks.services.daily_plan.SignalEpisode") as mock_model:
            mock_model.objects.filter.return_value = [ep]
            buy_eps, sell_sources = _fetch_active_episodes()
        assert "SCB" not in buy_eps
        assert ep.source in sell_sources["SCB"]


class TestBuildCandidates:
    def test_returns_empty_list_when_buy_eps_empty(self):
        from stocks.services.daily_plan import _build_candidates
        result = _build_candidates(
            buy_eps=defaultdict(list),
            sell_sources=defaultdict(set),
            opp_by_symbol={},
            sector_by_symbol={},
            as_of=date.today(),
        )
        assert result == []

    def test_skips_symbols_with_no_price_data(self):
        from stocks.services.daily_plan import _build_candidates
        buy_eps = defaultdict(list)
        ep = MagicMock()
        ep.last_signal_date = date.today()
        buy_eps["NABIL"].append(ep)
        with patch("stocks.services.daily_plan._load_price_df", return_value=None):
            result = _build_candidates(
                buy_eps=buy_eps,
                sell_sources=defaultdict(set),
                opp_by_symbol={},
                sector_by_symbol={},
                as_of=date.today(),
            )
        assert result == []


class TestNearPositionActions:
    def test_returns_empty_when_no_closes(self):
        from stocks.services.daily_plan import _near_position_actions
        item = MagicMock()
        item.ticker = "NABIL"
        result = _near_position_actions(items=[item], closes={})
        assert result == []

    def test_flags_stop_loss_proximity(self):
        from stocks.services.daily_plan import _near_position_actions
        item = MagicMock()
        item.ticker = "NABIL"
        item.stop_loss_price = 95.0
        item.target_price = 120.0
        item.target_price_2 = None
        item.target_price_3 = None
        result = _near_position_actions(items=[item], closes={"NABIL": 95.0})
        assert len(result) == 1
        assert result[0]["near"] == "STOP_LOSS"

    def test_flags_target_price_proximity(self):
        from stocks.services.daily_plan import _near_position_actions
        item = MagicMock()
        item.ticker = "SCB"
        item.stop_loss_price = 80.0
        item.target_price = 120.0
        item.target_price_2 = None
        item.target_price_3 = None
        result = _near_position_actions(items=[item], closes={"SCB": 120.0})
        assert len(result) == 1
        assert result[0]["near"] == "TP1"

    def test_excludes_items_without_action_level(self):
        from stocks.services.daily_plan import _near_position_actions
        item = MagicMock()
        item.ticker = "MEGA"
        item.stop_loss_price = 80.0
        item.target_price = 120.0
        item.target_price_2 = None
        item.target_price_3 = None
        result = _near_position_actions(items=[item], closes={"MEGA": 100.0})
        assert result == []


class TestSignalFlips:
    def test_returns_flips_for_held_symbols(self):
        from stocks.services.daily_plan import _signal_flips_for_held
        ep = MagicMock()
        ep.symbol = "NABIL"
        ep.source = "RSI_OVERBOUGHT"
        ep.start_date = MagicMock()
        ep.start_date.isoformat.return_value = "2026-06-10"
        ep.entry_strength = 0.7
        with patch("stocks.services.daily_plan.SignalEpisode") as mock_model:
            mock_model.objects.filter.return_value = [ep]
            result = _signal_flips_for_held(held={"NABIL"})
        assert len(result) == 1
        assert result[0]["symbol"] == "NABIL"

    def test_returns_empty_when_no_held(self):
        from stocks.services.daily_plan import _signal_flips_for_held
        result = _signal_flips_for_held(held=set())
        assert result == []


class TestWatchlistTriggers:
    def test_triggers_when_close_at_or_below_target(self):
        from stocks.services.daily_plan import _watchlist_triggers
        w = MagicMock()
        w.ticker = "NABIL"
        w.target_price = 100.0
        w.stop_loss_price = None
        result = _watchlist_triggers(watch=[w], closes={"NABIL": 100.0})
        assert len(result) == 1
        assert result[0]["ticker"] == "NABIL"

    def test_excludes_when_far_from_all_levels(self):
        from stocks.services.daily_plan import _watchlist_triggers
        w = MagicMock()
        w.ticker = "SCB"
        w.target_price = 100.0
        w.stop_loss_price = None
        result = _watchlist_triggers(watch=[w], closes={"SCB": 150.0})
        assert result == []

    def test_returns_empty_when_no_closes(self):
        from stocks.services.daily_plan import _watchlist_triggers
        w = MagicMock()
        w.ticker = "MEGA"
        w.target_price = 100.0
        w.stop_loss_price = None
        result = _watchlist_triggers(watch=[w], closes={})
        assert result == []
