# backend/stocks/tests/test_expectancy.py
"""Per-strategy expectancy from per-trade returns."""
import pytest
from stocks.services.backtest_harness.expectancy import expectancy_stats


def test_expectancy_basic():
    s = expectancy_stats([0.10, 0.10, 0.10, -0.20])
    assert s["wins"] == 3 and s["losses"] == 1
    assert s["avg_win"] == pytest.approx(0.10)
    assert s["avg_loss"] == pytest.approx(0.20)
    assert s["win_rate"] == pytest.approx(0.75)
    assert s["expectancy"] == pytest.approx(0.025)
    assert s["payoff_ratio"] == pytest.approx(0.5)


def test_expectancy_all_wins_has_no_avg_loss():
    s = expectancy_stats([0.05, 0.03, 0.04])
    assert s["losses"] == 0 and s["avg_loss"] == 0.0
    assert s["expectancy"] == pytest.approx(0.04)
    assert s["payoff_ratio"] == 0.0


def test_expectancy_empty():
    s = expectancy_stats([])
    assert s["expectancy"] == 0.0 and s["wins"] == 0 and s["losses"] == 0


def test_breakeven_counts_as_loss():
    s = expectancy_stats([0.0, 0.10])
    assert s["wins"] == 1 and s["losses"] == 1
