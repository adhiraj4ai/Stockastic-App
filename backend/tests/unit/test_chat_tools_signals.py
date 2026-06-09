"""Unit tests for chat.tools._rank_strategy_signals — pure ranking helper."""
from datetime import date
from decimal import Decimal
from unittest.mock import Mock

from chat.tools import _rank_strategy_signals


def _make_signal(
    name="StratA",
    strategy_id=1,
    signal="BUY",
    win_rate=50.0,
    sharpe=1.0,
    pnl_percent=10.0,
    max_drawdown=5.0,
    best_objective="balanced",
    optimization_scope="DEFAULT",
    last_close=None,
):
    strat = Mock()
    strat.name = name
    strat.id = strategy_id
    strat.win_rate = Decimal(str(win_rate))
    strat.sharpe_ratio = Decimal(str(sharpe))
    strat.pnl_percent = Decimal(str(pnl_percent))
    strat.max_drawdown = Decimal(str(max_drawdown))
    strat.best_objective = best_objective

    sig = Mock()
    sig.strategy = strat
    sig.signal = signal
    sig.date = date(2026, 6, 9)
    sig.last_close = Decimal(str(last_close)) if last_close is not None else None
    sig.metadata = {"optimization_scope": optimization_scope}
    return sig


class TestRankStrategySignals:
    def test_returns_empty_list_and_none_for_no_signals(self):
        enriched, best = _rank_strategy_signals([])
        assert enriched == []
        assert best is None

    def test_single_signal_is_best(self):
        sig = _make_signal(name="GoldenCross", win_rate=62.0, sharpe=1.4, optimization_scope="SYMBOL")
        enriched, best = _rank_strategy_signals([sig])
        assert best == "GoldenCross"
        assert len(enriched) == 1

    def test_enriched_fields_present(self):
        sig = _make_signal(
            name="MACD_SAR",
            strategy_id=7,
            signal="SELL",
            win_rate=55.5,
            sharpe=1.2,
            pnl_percent=18.3,
            max_drawdown=8.1,
            best_objective="profit",
            optimization_scope="SECTOR",
            last_close=1250.0,
        )
        enriched, _ = _rank_strategy_signals([sig])
        e = enriched[0]
        assert e["strategy"] == "MACD_SAR"
        assert e["strategy_id"] == 7
        assert e["signal"] == "SELL"
        assert e["date"] == "2026-06-09"
        assert e["last_close"] == 1250.0
        assert e["win_rate"] == 55.5
        assert e["sharpe"] == 1.2
        assert e["pnl_pct"] == 18.3
        assert e["max_drawdown"] == 8.1
        assert e["best_objective"] == "profit"
        assert e["optimization_scope"] == "SECTOR"

    def test_scope_rank_symbol_beats_sector(self):
        sector_sig = _make_signal(name="Sector", win_rate=70.0, sharpe=2.0, optimization_scope="SECTOR")
        symbol_sig = _make_signal(name="Symbol", win_rate=40.0, sharpe=0.5, optimization_scope="SYMBOL")
        enriched, best = _rank_strategy_signals([sector_sig, symbol_sig])
        assert best == "Symbol"
        assert enriched[0]["strategy"] == "Symbol"

    def test_scope_rank_sector_beats_all(self):
        all_sig = _make_signal(name="All", win_rate=80.0, sharpe=3.0, optimization_scope="ALL")
        sector_sig = _make_signal(name="Sector", win_rate=50.0, sharpe=1.0, optimization_scope="SECTOR")
        _, best = _rank_strategy_signals([all_sig, sector_sig])
        assert best == "Sector"

    def test_scope_rank_all_beats_default(self):
        default_sig = _make_signal(name="Default", win_rate=90.0, sharpe=5.0, optimization_scope="DEFAULT")
        all_sig = _make_signal(name="All", win_rate=30.0, sharpe=0.1, optimization_scope="ALL")
        _, best = _rank_strategy_signals([default_sig, all_sig])
        assert best == "All"

    def test_win_rate_tiebreaker_within_same_scope(self):
        low_wr = _make_signal(name="LowWR", win_rate=40.0, sharpe=1.0, optimization_scope="ALL")
        high_wr = _make_signal(name="HighWR", win_rate=70.0, sharpe=1.0, optimization_scope="ALL")
        _, best = _rank_strategy_signals([low_wr, high_wr])
        assert best == "HighWR"

    def test_sharpe_tiebreaker_when_scope_and_win_rate_equal(self):
        low_sh = _make_signal(name="LowSharpe", win_rate=60.0, sharpe=0.8, optimization_scope="SECTOR")
        high_sh = _make_signal(name="HighSharpe", win_rate=60.0, sharpe=2.1, optimization_scope="SECTOR")
        _, best = _rank_strategy_signals([low_sh, high_sh])
        assert best == "HighSharpe"

    def test_pnl_pct_tiebreaker_when_all_else_equal(self):
        low_pnl = _make_signal(name="LowPnl", win_rate=55.0, sharpe=1.5, pnl_percent=5.0, optimization_scope="ALL")
        high_pnl = _make_signal(name="HighPnl", win_rate=55.0, sharpe=1.5, pnl_percent=20.0, optimization_scope="ALL")
        _, best = _rank_strategy_signals([low_pnl, high_pnl])
        assert best == "HighPnl"

    def test_missing_metadata_defaults_to_default_scope(self):
        sig = _make_signal(name="NoMeta", optimization_scope="SYMBOL")
        sig.metadata = None
        enriched, _ = _rank_strategy_signals([sig])
        assert enriched[0]["optimization_scope"] == "DEFAULT"

    def test_missing_optimization_scope_key_defaults_to_default(self):
        sig = _make_signal(name="NoKey")
        sig.metadata = {"some_other_key": "value"}
        enriched, _ = _rank_strategy_signals([sig])
        assert enriched[0]["optimization_scope"] == "DEFAULT"

    def test_null_win_rate_treated_as_zero(self):
        sig = _make_signal(name="NullWR", win_rate=0.0, optimization_scope="ALL")
        sig.strategy.win_rate = None
        enriched, _ = _rank_strategy_signals([sig])
        assert enriched[0]["win_rate"] == 0.0

    def test_empty_best_objective_becomes_balanced(self):
        sig = _make_signal(name="EmptyObj", best_objective="")
        enriched, _ = _rank_strategy_signals([sig])
        assert enriched[0]["best_objective"] == "balanced"

    def test_null_last_close_becomes_none(self):
        sig = _make_signal(name="NoClose", last_close=None)
        enriched, _ = _rank_strategy_signals([sig])
        assert enriched[0]["last_close"] is None
