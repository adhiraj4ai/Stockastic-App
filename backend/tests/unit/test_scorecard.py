"""Unit tests for the Manager Scorecard ranking helper."""
from chat.tools import score_candidate


def test_high_winrate_high_return_low_risk_scores_higher():
    strong = score_candidate(expected_return_pct=20.0, win_rate=72.0, concentration_pct=10.0, health_score=80.0)
    weak = score_candidate(expected_return_pct=2.0, win_rate=40.0, concentration_pct=35.0, health_score=30.0)
    assert strong > weak


def test_concentration_penalty_lowers_score():
    base = score_candidate(expected_return_pct=15.0, win_rate=60.0, concentration_pct=10.0, health_score=70.0)
    concentrated = score_candidate(expected_return_pct=15.0, win_rate=60.0, concentration_pct=40.0, health_score=70.0)
    assert concentrated < base


def test_score_is_bounded_0_100():
    s = score_candidate(expected_return_pct=999.0, win_rate=100.0, concentration_pct=0.0, health_score=100.0)
    assert 0.0 <= s <= 100.0
    s2 = score_candidate(expected_return_pct=-999.0, win_rate=0.0, concentration_pct=100.0, health_score=0.0)
    assert 0.0 <= s2 <= 100.0
