"""Tests for refactored helpers extracted from rank_opportunities().

Each extracted private helper has at least:
- a "correct type" test
- an "empty / error input" test

DB/ORM calls are patched with unittest.mock.patch so these tests run without
a live database or network.
"""
from unittest.mock import MagicMock, patch

import pytest

from stocks.services.opportunity_engine import (
    _assemble_strategy_buy_row,
    _build_bt_cache_entry,
    _build_engine_row,
    _build_strategy_buy_row,
    _fetch_setup,
    _process_engines,
    _process_strategies,
    _process_symbol_for_strategy,
    rank_opportunities_from_rows,
    score_opportunity,
)


# ---------------------------------------------------------------------------
# _fetch_setup
# ---------------------------------------------------------------------------

class TestFetchSetup:
    @patch("stocks.services.backtest_harness.load_basket", return_value=(["SYM"], None))
    @patch("stocks.services.market_regime.current_regime", return_value={"regime": "NEUTRAL"})
    @patch("stocks.services.universe.research_universe", return_value={"NICA", "NABIL"})
    def test_returns_four_tuple(self, _u, _r, _b):
        result = _fetch_setup(None)
        assert len(result) == 4

    @patch("stocks.services.backtest_harness.load_basket", return_value=([], None))
    @patch("stocks.services.market_regime.current_regime", return_value={"regime": "RISK_ON"})
    @patch("stocks.services.universe.research_universe", return_value=set())
    def test_empty_universe_yields_empty_syms(self, _u, _r, _b):
        _, _, syms, _ = _fetch_setup(None)
        assert syms == []

    @patch("stocks.services.backtest_harness.load_basket", return_value=([], None))
    @patch("stocks.services.market_regime.current_regime", return_value={"regime": "RISK_OFF"})
    @patch("stocks.services.universe.research_universe", return_value=set())
    def test_explicit_symbols_are_uppercased(self, _u, _r, _b):
        _, _, syms, _ = _fetch_setup(["nabil", "nica"])
        assert syms == ["NABIL", "NICA"]


# ---------------------------------------------------------------------------
# _build_bt_cache_entry
# ---------------------------------------------------------------------------

class TestBuildBtCacheEntry:
    def test_returns_dict_with_pvalue_and_expectancy(self):
        strat = MagicMock()
        strat.name = "RSI"
        basket = ["SYM"]
        mock_card = MagicMock()
        mock_card.confidence = {"excess_pvalue": 0.03, "expectancy": 0.12}
        evaluate_fn = MagicMock(return_value=mock_card)

        entry, errored = _build_bt_cache_entry(strat, basket, evaluate_fn)

        assert isinstance(entry, dict)
        assert "pvalue" in entry and "expectancy" in entry
        assert not errored

    def test_returns_defaults_on_exception(self):
        strat = MagicMock()
        evaluate_fn = MagicMock(side_effect=RuntimeError("db down"))

        entry, errored = _build_bt_cache_entry(strat, [], evaluate_fn)

        assert entry == {"pvalue": 1.0, "expectancy": 0.0}
        assert errored


# ---------------------------------------------------------------------------
# _assemble_strategy_buy_row
# ---------------------------------------------------------------------------

class TestAssembleStrategyBuyRow:
    def _make_args(self):
        strat = MagicMock(id=7, name="MACD", best_params=None)
        live = {"live_win_rate": 0.6, "resolved": 40, "avg_pnl_pct": 2.5}
        bt = {"pvalue": 0.04, "expectancy": 0.1}
        metrics = {
            "ann_return_pct": 18.0, "num_trades": 35,
            "win_rate_pct": 60.0, "sortino": 1.2,
        }
        return strat, bt, live, metrics

    def test_returns_dict_with_required_keys(self):
        strat, bt, live, m = self._make_args()
        row = _assemble_strategy_buy_row("p|7", strat, "NABIL", {"close": 1200}, bt, "CONFIRMED", live, m)
        for key in ("key", "basis", "producer", "symbol", "direction", "edge", "trust"):
            assert key in row

    def test_edge_is_fractional(self):
        strat, bt, live, m = self._make_args()
        row = _assemble_strategy_buy_row("p|7", strat, "NABIL", {}, bt, "CONFIRMED", live, m)
        assert row["edge"] == pytest.approx(0.18)

    def test_win_rate_reportable_false_when_few_trades(self):
        strat, bt, live, _ = self._make_args()
        m = {"ann_return_pct": 10.0, "num_trades": 5, "win_rate_pct": 50.0, "sortino": 0.9}
        row = _assemble_strategy_buy_row("p|7", strat, "NABIL", {}, bt, "CONFIRMED", live, m)
        assert row["win_rate_reportable"] is False


# ---------------------------------------------------------------------------
# _build_strategy_buy_row
# ---------------------------------------------------------------------------

class TestBuildStrategyBuyRow:
    def _make_ok_backtest(self):
        res = MagicMock(ok=True)
        res.metrics = {"ann_return_pct": 12.0, "num_trades": 30, "win_rate_pct": 55.0, "sortino": 1.0}
        return res

    def test_returns_row_and_zero_skipped_on_success(self):
        strat = MagicMock(id=1, name="EMA", best_params=None)
        live = {"live_win_rate": 0.5, "resolved": 30, "avg_pnl_pct": 1.0}
        bt = {"pvalue": 0.04}
        run_bt = MagicMock(return_value=self._make_ok_backtest())

        row, skip = _build_strategy_buy_row("p|1", strat, "NICA", {}, bt, "CONFIRMED", live, run_bt)

        assert row is not None
        assert skip == 0

    def test_returns_none_and_one_skipped_on_exception(self):
        strat = MagicMock(best_params=None)
        run_bt = MagicMock(side_effect=ValueError("fail"))

        row, skip = _build_strategy_buy_row("p|1", strat, "NICA", {}, {}, "CONFIRMED", {}, run_bt)

        assert row is None
        assert skip == 1

    def test_returns_none_and_zero_skipped_when_backtest_not_ok(self):
        strat = MagicMock(best_params=None)
        res = MagicMock(ok=False)
        run_bt = MagicMock(return_value=res)

        row, skip = _build_strategy_buy_row("p|1", strat, "NICA", {}, {}, "CONFIRMED", {}, run_bt)

        assert row is None
        assert skip == 0


# ---------------------------------------------------------------------------
# _process_symbol_for_strategy
# ---------------------------------------------------------------------------

class TestProcessSymbolForStrategy:
    def _live(self):
        return {"live_win_rate": 0.55, "resolved": 35, "avg_pnl_pct": 1.8}

    def _bt(self):
        return {"pvalue": 0.03}

    def test_sell_signal_goes_to_exits(self):
        svc = MagicMock()
        svc.infer_current_signal.return_value = {"signal": "SELL", "close": 100}
        rows, exits, skip = _process_symbol_for_strategy(
            "p|1", MagicMock(name="S"), "NABIL", self._bt(), "CONFIRMED", self._live(), svc, MagicMock(),
        )
        assert rows == [] and len(exits) == 1 and skip == 0

    def test_no_signal_returns_empty(self):
        svc = MagicMock()
        svc.infer_current_signal.return_value = {"signal": None}
        rows, exits, skip = _process_symbol_for_strategy(
            "p|1", MagicMock(name="S"), "NICA", self._bt(), "CONFIRMED", self._live(), svc, MagicMock(),
        )
        assert rows == [] and exits == [] and skip == 0

    def test_infer_exception_increments_skipped(self):
        svc = MagicMock()
        svc.infer_current_signal.side_effect = RuntimeError("fail")
        rows, exits, skip = _process_symbol_for_strategy(
            "p|1", MagicMock(name="S"), "NABIL", self._bt(), "CONFIRMED", self._live(), svc, MagicMock(),
        )
        assert rows == [] and exits == [] and skip == 1


# ---------------------------------------------------------------------------
# _build_engine_row
# ---------------------------------------------------------------------------

class TestBuildEngineRow:
    def _ep(self):
        ep = MagicMock()
        ep.producer_key = "ENGINE|1"
        ep.symbol = "NLIC"
        ep.source = "MOMENTUM_ENGINE"
        ep.entry_price = 450
        return ep

    def _live(self):
        return {"avg_pnl_pct": 3.0, "live_win_rate": 0.65, "resolved": 40}

    def test_returns_dict_with_live_basis(self):
        row = _build_engine_row(self._ep(), self._live(), "CONFIRMED")
        assert row["basis"] == "live"
        assert row["strategy_id"] is None

    def test_edge_is_fractional(self):
        row = _build_engine_row(self._ep(), self._live(), "CONFIRMED")
        assert row["edge"] == pytest.approx(0.03)

    def test_empty_entry_price_yields_none_close(self):
        ep = self._ep()
        ep.entry_price = None
        row = _build_engine_row(ep, self._live(), "CONFIRMED")
        assert row["close"] is None


# ---------------------------------------------------------------------------
# _process_strategies (integration-level, fully mocked)
# ---------------------------------------------------------------------------

class TestProcessStrategies:
    def test_returns_three_tuple_on_no_strategies(self):
        import sys
        MockStrategy = MagicMock()
        MockEpisode = MagicMock()
        MockStrategy.objects.all.return_value.order_by.return_value = []
        mock_models = MagicMock()
        mock_models.Strategy = MockStrategy
        mock_models.SignalEpisode = MockEpisode
        original = sys.modules.get("stocks.models")
        sys.modules["stocks.models"] = mock_models
        try:
            rows, exits, skipped = _process_strategies(
                [], [], {}, MagicMock(), MagicMock(), MagicMock(), MagicMock(), MagicMock(),
            )
        finally:
            sys.modules["stocks.models"] = original
        assert isinstance(rows, list) and isinstance(exits, list) and isinstance(skipped, int)

    def test_bt_cache_populated_per_strategy(self):
        import sys
        MockStrategy = MagicMock()
        MockEpisode = MagicMock()
        strat = MagicMock(id=1, name="RSI", best_params=None)
        MockStrategy.objects.all.return_value.order_by.return_value = [strat]
        MockEpisode.make_producer_key.return_value = "USER_STRATEGY|1"

        mock_models = MagicMock()
        mock_models.Strategy = MockStrategy
        mock_models.SignalEpisode = MockEpisode
        original = sys.modules.get("stocks.models")
        sys.modules["stocks.models"] = mock_models

        evaluate_fn = MagicMock(side_effect=RuntimeError("forced skip"))
        live_fn = MagicMock(return_value={"live_win_rate": 0.5, "resolved": 10, "avg_pnl_pct": 0.0})
        tier_fn = MagicMock(return_value="UNCONFIRMED")
        svc = MagicMock()
        svc.infer_current_signal.return_value = {"signal": None}

        bt_cache = {}
        try:
            _process_strategies([], [], bt_cache, evaluate_fn, live_fn, tier_fn, svc, MagicMock())
        finally:
            sys.modules["stocks.models"] = original

        assert "USER_STRATEGY|1" in bt_cache


# ---------------------------------------------------------------------------
# _process_engines (integration-level, fully mocked)
# ---------------------------------------------------------------------------

class TestProcessEngines:
    def test_returns_list(self):
        import sys
        MockEpisode = MagicMock()
        MockEpisode.objects.filter.return_value.exclude.return_value.order_by.return_value.__getitem__.return_value = []
        mock_models = MagicMock()
        mock_models.SignalEpisode = MockEpisode
        original = sys.modules.get("stocks.models")
        sys.modules["stocks.models"] = mock_models
        try:
            rows = _process_engines([], None, MagicMock(), MagicMock())
        finally:
            sys.modules["stocks.models"] = original
        assert isinstance(rows, list)

    def test_filters_by_syms_when_symbols_provided(self):
        import sys
        MockEpisode = MagicMock()
        qs = MagicMock()
        qs.order_by.return_value.__getitem__.return_value = []
        MockEpisode.objects.filter.return_value.exclude.return_value.filter.return_value = qs
        mock_models = MagicMock()
        mock_models.SignalEpisode = MockEpisode
        original = sys.modules.get("stocks.models")
        sys.modules["stocks.models"] = mock_models
        try:
            _process_engines(["NABIL"], ["nabil"], MagicMock(), MagicMock())
        finally:
            sys.modules["stocks.models"] = original
        MockEpisode.objects.filter.return_value.exclude.return_value.filter.assert_called_once()


# ---------------------------------------------------------------------------
# rank_opportunities_from_rows (already public, regression guard)
# ---------------------------------------------------------------------------

class TestRankOpportunitiesFromRows:
    def test_divergent_always_last(self):
        rows = [
            {"direction": "BUY", "edge": 0.5, "pvalue": 0.01, "trust": "DIVERGENT",
             "win_rate_reportable": True, "key": "a"},
            {"direction": "BUY", "edge": 0.1, "pvalue": 0.01, "trust": "CONFIRMED",
             "win_rate_reportable": True, "key": "b"},
        ]
        ranked = rank_opportunities_from_rows(rows, "RISK_ON")
        assert ranked[-1]["trust"] == "DIVERGENT"

    def test_empty_rows_returns_empty_list(self):
        assert rank_opportunities_from_rows([], "NEUTRAL") == []

    def test_score_attached_to_each_row(self):
        rows = [{"direction": "BUY", "edge": 0.2, "pvalue": 0.03, "trust": "CONFIRMED",
                 "win_rate_reportable": True, "key": "x"}]
        ranked = rank_opportunities_from_rows(rows, "NEUTRAL")
        assert "score" in ranked[0]
