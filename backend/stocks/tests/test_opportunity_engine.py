from stocks.services.opportunity_engine import (
    score_opportunity, rank_opportunities_from_rows, regime_alignment_factor,
)


def _opp(name, edge, pvalue, trust, direction="BUY"):
    return {"key": name, "direction": direction, "edge": edge,
            "pvalue": pvalue, "trust": trust, "win_rate_reportable": True}


def test_confirmed_significant_outranks_unconfirmed():
    rows = [_opp("u", 0.05, 0.01, "UNCONFIRMED"), _opp("c", 0.04, 0.01, "CONFIRMED")]
    ranked = rank_opportunities_from_rows(rows, regime="RISK_ON")
    assert ranked[0]["key"] == "c"


def test_divergent_demoted_below_all():
    rows = [_opp("d", 0.20, 0.001, "DIVERGENT"), _opp("u", 0.01, 0.30, "UNCONFIRMED")]
    ranked = rank_opportunities_from_rows(rows, regime="RISK_ON")
    assert ranked[-1]["key"] == "d"


def test_score_rewards_significance_and_edge():
    strong = score_opportunity("BUY", 0.05, 0.01, "CONFIRMED", "RISK_ON", True)
    weak = score_opportunity("BUY", 0.01, 0.40, "UNCONFIRMED", "RISK_ON", True)
    assert strong > weak


def test_divergent_score_non_positive():
    s = score_opportunity("BUY", 0.50, 0.001, "DIVERGENT", "RISK_ON", True)
    assert s <= 0.0


def test_ranking_is_deterministic():
    rows = [_opp("a", 0.03, 0.02, "CONFIRMED"), _opp("b", 0.03, 0.02, "CONFIRMED")]
    r1 = [o["key"] for o in rank_opportunities_from_rows(rows, "RISK_ON")]
    r2 = [o["key"] for o in rank_opportunities_from_rows(list(reversed(rows)), "RISK_ON")]
    assert r1 == r2


def test_per_symbol_edge_differentiates_same_strategy():
    # Two symbols of the same strategy with DIFFERENT per-symbol edges must rank
    # differently — the old basket-pooled expectancy could not do this.
    rows = [_opp("STRAT:1|A", 0.02, 0.01, "CONFIRMED"),
            _opp("STRAT:1|B", 0.08, 0.01, "CONFIRMED")]
    ranked = rank_opportunities_from_rows(rows, "RISK_ON")
    assert ranked[0]["key"] == "STRAT:1|B"            # higher-edge symbol wins
    assert ranked[0]["score"] != ranked[1]["score"]   # not an alphabetical tie


def test_regime_alignment_factor():
    assert regime_alignment_factor("BUY", "RISK_ON") == 1.0
    assert regime_alignment_factor("BUY", "RISK_OFF") == 0.7
    assert regime_alignment_factor("BUY", "NEUTRAL") == 0.9


def test_regime_alignment_changes_score():
    on = score_opportunity("BUY", 0.05, 0.01, "CONFIRMED", "RISK_ON", True)
    off = score_opportunity("BUY", 0.05, 0.01, "CONFIRMED", "RISK_OFF", True)
    assert on > off  # same edge, a BUY scores higher in a risk-on market
