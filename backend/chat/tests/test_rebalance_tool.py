"""Tests for _run_optimizer wiring fix in the rebalance tool."""
import pytest
from unittest.mock import patch
from chat.tools import trading


def _holdings():
    return {"AAA": {"quantity": 10, "price": 100.0}, "BBB": {"quantity": 20, "price": 50.0}}


def test_run_optimizer_reads_weights_key_not_optimal_weights():
    opt = {"success": True, "weights": {"AAA": 0.6, "BBB": 0.4},
           "expected_returns": {"AAA": 0.10, "BBB": 0.05}, "metrics": {}, "trades": [], "note": ""}
    with patch("chat.tools.trading.perform_portfolio_optimization", return_value=opt):
        weights, prices, total_value, expected_returns, err = trading._run_optimizer(_holdings(), "max_sharpe")
    assert err is None
    assert weights == {"AAA": 0.6, "BBB": 0.4}          # real weights, not {}
    assert expected_returns == {"AAA": 0.10, "BBB": 0.05}
    assert total_value == pytest.approx(10 * 100.0 + 20 * 50.0)


def test_run_optimizer_errors_on_empty_weights_instead_of_liquidating():
    opt = {"success": True, "weights": {}, "expected_returns": {}, "metrics": {}, "trades": [], "note": ""}
    with patch("chat.tools.trading.perform_portfolio_optimization", return_value=opt):
        weights, prices, total_value, expected_returns, err = trading._run_optimizer(_holdings(), "max_sharpe")
    assert err is not None


def test_micro_leg_with_friction_over_benefit_is_suppressed(monkeypatch):
    # A tiny BUY whose fees dwarf its expected annual benefit must be suppressed.
    holdings = {"AAA": {"quantity": 100, "price": 100.0}, "BBB": {"quantity": 0, "price": 100.0}}
    weights = {"AAA": 0.99, "BBB": 0.01}
    prices = {"AAA": 100.0, "BBB": 100.0}
    total_value = 100 * 100.0
    expected_returns = {"AAA": 0.10, "BBB": 0.0001}     # BBB barely moves
    # Stub fee preview: heavy friction, so BBB's tiny benefit can't cover it.
    monkeypatch.setattr(trading, "_trade_preview", lambda *a, **k: {
        "amount": 100.0, "commission": 36.0, "sebon_fee": 1.5, "dp_charge": 25.0,
        "cgt": 0.0, "net": 100.0, "warnings": []})
    trades, lines, warnings, suppressed, total_friction = trading._compute_rebalance_trades(
        holdings, weights, prices, total_value, user=None, account=None, expected_returns=expected_returns)
    suppressed_tickers = {s["ticker"] for s in suppressed}
    assert "BBB" in suppressed_tickers
    assert all(t["ticker"] != "BBB" for t in trades)


def test_beneficial_leg_is_kept_and_friction_totalled(monkeypatch):
    holdings = {"AAA": {"quantity": 100, "price": 100.0}, "BBB": {"quantity": 0, "price": 100.0}}
    weights = {"AAA": 0.5, "BBB": 0.5}
    prices = {"AAA": 100.0, "BBB": 100.0}
    total_value = 100 * 100.0
    expected_returns = {"AAA": 0.10, "BBB": 0.20}       # big move justifies the cost
    monkeypatch.setattr(trading, "_trade_preview", lambda *a, **k: {
        "amount": 5000.0, "commission": 16.5, "sebon_fee": 0.75, "dp_charge": 25.0,
        "cgt": 0.0, "net": 5000.0, "warnings": []})
    trades, lines, warnings, suppressed, total_friction = trading._compute_rebalance_trades(
        holdings, weights, prices, total_value, user=None, account=None, expected_returns=expected_returns)
    assert any(t["ticker"] == "BBB" for t in trades)
    assert total_friction == pytest.approx(sum(
        ln["fees"]["commission"] + ln["fees"]["sebon_fee"] + ln["fees"]["dp_charge"] + ln["fees"]["cgt"]
        for ln in lines))
