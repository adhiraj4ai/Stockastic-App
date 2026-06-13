"""Tests for the SOLID refactor of backtest_harness — extracted helpers.

Each test covers one extracted helper: correct return type and graceful
handling of empty/minimal input.  File I/O and external calls are patched.
"""

import json
import os
import tempfile
from unittest.mock import MagicMock, patch

import pytest

# ---------------------------------------------------------------------------
# runner.py helpers
# ---------------------------------------------------------------------------


class TestCoreMetrics:
    def test_returns_dict_with_expected_keys(self):
        from stocks.services.backtest_harness.runner import _core_metrics

        stats = {
            "Return [%]": 10.0,
            "Buy & Hold Return [%]": 5.0,
            "Sharpe Ratio": 1.2,
            "Sortino Ratio": 1.5,
            "Calmar Ratio": 0.8,
            "Max. Drawdown [%]": -15.0,
            "Win Rate [%]": 55.0,
            "# Trades": 20,
            "Exposure Time [%]": 60.0,
            "Profit Factor": 1.4,
            "Return (Ann.) [%]": 8.0,
        }
        result = _core_metrics(stats)
        assert isinstance(result, dict)
        assert result["return_pct"] == 10.0
        assert result["num_trades"] == 20

    def test_empty_stats_returns_zeros(self):
        from stocks.services.backtest_harness.runner import _core_metrics

        result = _core_metrics({})
        assert isinstance(result, dict)
        assert result["return_pct"] == 0.0
        assert result["num_trades"] == 0


class TestTradeOutcomeMetrics:
    def test_returns_empty_trade_lists_when_no_trades_key(self):
        from stocks.services.backtest_harness.runner import _trade_outcome_metrics

        result = _trade_outcome_metrics({})
        assert result["trade_returns"] == []
        assert result["wins"] == 0
        assert result["losses"] == 0

    def test_parses_trade_returns_correctly(self):
        from stocks.services.backtest_harness.runner import _trade_outcome_metrics

        trades_df = MagicMock()
        trades_df.__len__ = lambda self: 3
        trades_df.__contains__ = lambda self, item: item == "ReturnPct"
        trades_df.__getitem__ = lambda self, key: MagicMock(tolist=lambda: [0.05, -0.02, 0.03])
        result = _trade_outcome_metrics({"_trades": trades_df})
        assert result["wins"] == 2
        assert result["losses"] == 1
        assert len(result["trade_returns"]) == 3


class TestNormalizeMetrics:
    def test_merges_core_and_trade_outcomes(self):
        from stocks.services.backtest_harness.runner import normalize_metrics

        stats = {
            "Return [%]": 5.0,
            "Buy & Hold Return [%]": 3.0,
            "Sharpe Ratio": 0.9,
            "Sortino Ratio": 1.1,
            "Calmar Ratio": 0.5,
            "Max. Drawdown [%]": -10.0,
            "Win Rate [%]": 50.0,
            "# Trades": 4,
            "Exposure Time [%]": 40.0,
            "Profit Factor": 1.2,
            "Return (Ann.) [%]": 4.5,
        }
        result = normalize_metrics(stats)
        assert "return_pct" in result
        assert "trade_returns" in result
        assert "wins" in result

    def test_empty_stats_does_not_raise(self):
        from stocks.services.backtest_harness.runner import normalize_metrics

        result = normalize_metrics({})
        assert isinstance(result, dict)


class TestTruncateError:
    def test_short_message_unchanged(self):
        from stocks.services.backtest_harness.runner import _truncate_error

        exc = ValueError("short error")
        msg = _truncate_error(exc)
        assert "ValueError" in msg
        assert "short error" in msg

    def test_long_message_is_truncated(self):
        from stocks.services.backtest_harness.runner import _truncate_error

        exc = RuntimeError("x" * 300)
        msg = _truncate_error(exc)
        assert len(msg) < 250
        assert msg.endswith("...")


class TestResolveStrategyClass:
    def test_returns_none_when_no_strategy_in_code(self):
        from stocks.services.backtest_harness.runner import _resolve_strategy_class

        with patch("stocks.services.backtest_harness.runner.build_strategy_scope", return_value={}), \
             patch("stocks.services.backtest_harness.runner.extract_strategy_class", return_value=None):
            result = _resolve_strategy_class("pass", "NABIL", None)
        assert result is None

    def test_returns_class_when_found(self):
        from stocks.services.backtest_harness.runner import _resolve_strategy_class

        fake_class = MagicMock()
        with patch("stocks.services.backtest_harness.runner.build_strategy_scope", return_value={}), \
             patch("stocks.services.backtest_harness.runner.extract_strategy_class", return_value=fake_class):
            result = _resolve_strategy_class("pass", "NABIL", None)
        assert result is fake_class


# ---------------------------------------------------------------------------
# evaluate.py helpers
# ---------------------------------------------------------------------------


def _make_result(symbol="SYM", ok=True, return_pct=10.0, bh_pct=5.0,
                 sortino=1.0, drawdown=-5.0, num_trades=10, wins=6, losses=4):
    from stocks.services.backtest_harness.runner import BacktestResult
    metrics = {
        "return_pct": return_pct,
        "buy_hold_return_pct": bh_pct,
        "sortino": sortino,
        "max_drawdown_pct": drawdown,
        "num_trades": num_trades,
        "wins": wins,
        "losses": losses,
        "trade_returns": [0.05] * wins + [-0.03] * losses,
    }
    return BacktestResult(symbol=symbol, ok=ok, metrics=metrics if ok else {})


class TestBuildSeries:
    def test_returns_expected_keys(self):
        from stocks.services.backtest_harness.evaluate import _build_series

        ok = [_make_result("A"), _make_result("B")]
        series = _build_series(ok)
        assert "strat_returns" in series
        assert "excess" in series
        assert "strat_sortino" in series
        assert "strat_rdd" in series
        assert "bh_rdd" in series
        assert "trade_counts" in series
        assert "n_traded" in series

    def test_empty_input_returns_empty_lists(self):
        from stocks.services.backtest_harness.evaluate import _build_series

        series = _build_series([])
        assert series["strat_returns"] == []
        assert series["n_traded"] == 0


class TestComputeVerdicts:
    def test_all_pass_when_metrics_favourable(self):
        from stocks.services.backtest_harness.evaluate import _build_series, _compute_verdicts

        ok = [_make_result(f"S{i}") for i in range(5)]
        series = _build_series(ok)
        verdicts = _compute_verdicts(ok, len(ok), series)
        assert isinstance(verdicts, dict)
        assert "runs_clean" in verdicts
        assert "active" in verdicts

    def test_runs_clean_false_when_some_failed(self):
        from stocks.services.backtest_harness.evaluate import _build_series, _compute_verdicts

        ok = [_make_result("A"), _make_result("B")]
        # Simulate 3 total results but only 2 ok
        series = _build_series(ok)
        verdicts = _compute_verdicts(ok, 3, series)
        assert verdicts["runs_clean"] is False


class TestComputeAggregates:
    def test_returns_expected_keys(self):
        from stocks.services.backtest_harness.evaluate import _build_series, _compute_aggregates

        ok = [_make_result("A"), _make_result("B")]
        series = _build_series(ok)
        agg = _compute_aggregates(ok, len(ok), series)
        assert "symbols_total" in agg
        assert "median_return_pct" in agg
        assert "median_excess_return_pct" in agg

    def test_symbols_ok_matches_input_length(self):
        from stocks.services.backtest_harness.evaluate import _build_series, _compute_aggregates

        ok = [_make_result("A"), _make_result("B"), _make_result("C")]
        series = _build_series(ok)
        agg = _compute_aggregates(ok, 3, series)
        assert agg["symbols_ok"] == 3


class TestComputeConfidence:
    def test_returns_expected_keys(self):
        from stocks.services.backtest_harness.evaluate import _compute_confidence

        ok = [_make_result("A"), _make_result("B")]
        excess = [5.0, 3.0]
        conf = _compute_confidence(ok, excess)
        assert "total_trades" in conf
        assert "win_rate_ci" in conf
        assert "excess_pvalue" in conf
        assert "expectancy" in conf

    def test_zero_trades_does_not_raise(self):
        from stocks.services.backtest_harness.evaluate import _compute_confidence
        from stocks.services.backtest_harness.runner import BacktestResult

        ok = [BacktestResult(symbol="X", ok=True, metrics={
            "return_pct": 0.0, "buy_hold_return_pct": 0.0,
            "sortino": 0.0, "max_drawdown_pct": 0.0,
            "num_trades": 0, "wins": 0, "losses": 0, "trade_returns": [],
        })]
        conf = _compute_confidence(ok, [0.0])
        assert conf["total_trades"] == 0
        assert conf["pooled_win_rate"] == 0.0


class TestScoreResults:
    def test_empty_results_fails_cleanly(self):
        from stocks.services.backtest_harness.evaluate import score_results

        card = score_results("empty_strategy", [])
        assert card.passed is False
        assert card.verdicts == {"runs_clean": False}

    def test_all_failed_results_fails_cleanly(self):
        from stocks.services.backtest_harness.evaluate import score_results
        from stocks.services.backtest_harness.runner import BacktestResult

        results = [BacktestResult(symbol="X", ok=False, error="boom")]
        card = score_results("bad_strategy", results)
        assert card.passed is False


# ---------------------------------------------------------------------------
# report.py helpers
# ---------------------------------------------------------------------------


def _make_scorecard(name="Strategy A", passed=True, med_excess=5.0, errors=None):
    from stocks.services.backtest_harness.evaluate import ScoreCard

    card = ScoreCard(strategy_name=name, passed=passed)
    card.aggregates = {
        "median_excess_return_pct": med_excess,
        "symbols_ok": 3,
        "symbols_total": 3,
        "median_strategy_sortino": 1.0,
        "median_strategy_return_over_dd": 0.5,
        "median_buyhold_return_over_dd": 0.3,
        "median_trades": 10,
    }
    card.verdicts = {"runs_clean": passed, "active": passed}
    card.confidence = {}
    if errors:
        from stocks.services.backtest_harness.runner import BacktestResult
        card.results = [BacktestResult(symbol=s, ok=False, error=e) for s, e in errors]
    return card


class TestSortCards:
    def test_failures_sorted_before_passes(self):
        from stocks.services.backtest_harness.report import _sort_cards

        passing = _make_scorecard("PassStrat", passed=True, med_excess=5.0)
        failing = _make_scorecard("FailStrat", passed=False, med_excess=-2.0)
        sorted_cards = _sort_cards([passing, failing])
        assert sorted_cards[0].strategy_name == "FailStrat"

    def test_empty_input_returns_empty(self):
        from stocks.services.backtest_harness.report import _sort_cards

        assert _sort_cards([]) == []


class TestBuildPayload:
    def test_returns_expected_keys(self):
        from stocks.services.backtest_harness.report import _build_payload

        cards = [_make_scorecard("A", passed=True), _make_scorecard("B", passed=False)]
        payload = _build_payload(cards, label="test-run")
        assert payload["label"] == "test-run"
        assert payload["total"] == 2
        assert payload["passed"] == 1
        assert payload["failed"] == 1
        assert "generated_at" in payload
        assert "strategies" in payload

    def test_empty_cards_produces_zero_counts(self):
        from stocks.services.backtest_harness.report import _build_payload

        payload = _build_payload([], label=None)
        assert payload["total"] == 0
        assert payload["passed"] == 0
        assert payload["failed"] == 0


class TestMdTableRow:
    def test_returns_string_with_strategy_name(self):
        from stocks.services.backtest_harness.report import _md_table_row

        card = _make_scorecard("MyStrat", passed=True)
        row = _md_table_row(1, card)
        assert isinstance(row, str)
        assert "MyStrat" in row
        assert "PASS" in row

    def test_failing_card_includes_fail_reasons(self):
        from stocks.services.backtest_harness.report import _md_table_row

        card = _make_scorecard("BadStrat", passed=False)
        card.verdicts = {"runs_clean": False, "active": True}
        row = _md_table_row(1, card)
        assert "FAIL" in row
        assert "runs_clean" in row


class TestBuildMdLines:
    def test_returns_list_of_strings(self):
        from stocks.services.backtest_harness.report import _build_md_lines, _build_payload

        cards = [_make_scorecard("A")]
        payload = _build_payload(cards, label="demo")
        lines = _build_md_lines(cards, payload)
        assert isinstance(lines, list)
        assert all(isinstance(l, str) for l in lines)

    def test_includes_error_section_when_errors_present(self):
        from stocks.services.backtest_harness.report import _build_md_lines, _build_payload

        card = _make_scorecard("ErrStrat", passed=False, errors=[("NABIL", "timeout")])
        payload = _build_payload([card], label=None)
        lines = _build_md_lines([card], payload)
        full_text = "\n".join(lines)
        assert "Symbol-level errors" in full_text
        assert "NABIL" in full_text

    def test_no_error_section_when_no_errors(self):
        from stocks.services.backtest_harness.report import _build_md_lines, _build_payload

        card = _make_scorecard("CleanStrat", passed=True)
        payload = _build_payload([card], label=None)
        lines = _build_md_lines([card], payload)
        full_text = "\n".join(lines)
        assert "Symbol-level errors" not in full_text


class TestWriteReport:
    def test_creates_json_and_md_files(self):
        from stocks.services.backtest_harness.report import write_report

        card = _make_scorecard("TestStrat", passed=True)
        with tempfile.TemporaryDirectory() as tmpdir:
            result = write_report([card], tmpdir, label="unit-test")
            assert os.path.exists(result["json"])
            assert os.path.exists(result["md"])
            with open(result["json"]) as f:
                data = json.load(f)
            assert data["label"] == "unit-test"
            assert data["total"] == 1

    def test_empty_scorecards_writes_valid_files(self):
        from stocks.services.backtest_harness.report import write_report

        with tempfile.TemporaryDirectory() as tmpdir:
            result = write_report([], tmpdir, label=None)
            assert os.path.exists(result["json"])
            with open(result["json"]) as f:
                data = json.load(f)
            assert data["total"] == 0
