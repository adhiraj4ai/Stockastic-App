# backend/stocks/tests/test_strategy_scan_ranking.py
"""Scan rows carry sample-gated win-rate confidence."""
from stocks.services.strategy_scan import _row_confidence


def test_row_confidence_gates_small_samples():
    hi_small = _row_confidence(win_rate_pct=80.0, wins=4, num_trades=5)
    assert hi_small["win_rate_reportable"] is False
    assert hi_small["win_rate_ci"][1] - hi_small["win_rate_ci"][0] > 0.3  # wide

    well = _row_confidence(win_rate_pct=60.0, wins=60, num_trades=100)
    assert well["win_rate_reportable"] is True
    assert well["win_rate_ci"][1] - well["win_rate_ci"][0] < 0.25
