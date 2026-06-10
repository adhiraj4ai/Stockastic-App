import pytest
from stocks.services.confluence import (
    engine_component, opportunity_component, accumulation_component,
    sector_component, confluence_score,
)


class TestEngineComponent:
    def test_three_buy_sources_no_conflict(self):
        assert engine_component({"SMART_MONEY", "ICHIMOKU", "VOLUME_BREAKOUT"}, set()) == 75.0

    def test_conflicting_sell_source_subtracts(self):
        assert engine_component({"SMART_MONEY", "ICHIMOKU"}, {"DISTRIBUTION_ALERT"}) == 25.0

    def test_floor_at_zero_and_cap_at_four(self):
        assert engine_component({"A"}, {"B", "C"}) == 0.0
        assert engine_component({"A", "B", "C", "D", "E"}, set()) == 100.0


class TestOpportunityComponent:
    def test_confirmed_significant(self):
        assert opportunity_component({"trust": "CONFIRMED", "pvalue": 0.02}) == 100.0

    def test_confirmed_not_significant(self):
        assert opportunity_component({"trust": "CONFIRMED", "pvalue": 0.30}) == 80.0

    def test_unconfirmed(self):
        assert opportunity_component({"trust": "UNCONFIRMED", "pvalue": 0.01}) == 60.0
        assert opportunity_component({"trust": "UNCONFIRMED", "pvalue": 0.50}) == 40.0

    def test_absent_or_divergent_is_zero(self):
        assert opportunity_component(None) == 0.0
        assert opportunity_component({"trust": "DIVERGENT", "pvalue": 0.01}) == 0.0


class TestAccumulationComponent:
    def test_below_wac_with_inflow(self):
        eps = [{"inst_net_5d": 150000, "markup_percent": -2.1}]
        assert accumulation_component(eps) == 100.0

    def test_near_wac(self):
        assert accumulation_component([{"inst_net_5d": 50000, "markup_percent": 4.0}]) == 70.0

    def test_inflow_only(self):
        assert accumulation_component([{"inst_net_5d": 50000, "markup_percent": 12.0}]) == 40.0

    def test_no_data_or_outflow(self):
        assert accumulation_component([{}]) == 0.0
        assert accumulation_component([{"inst_net_5d": -10000, "markup_percent": -5}]) == 0.0

    def test_best_across_episodes(self):
        eps = [{"inst_net_5d": 1, "markup_percent": 50}, {"inst_net_5d": 1, "markup_percent": -1}]
        assert accumulation_component(eps) == 100.0


class TestSectorComponent:
    def test_bands(self):
        assert sector_component(12.4) == 100.0
        assert sector_component(-8.0) == 0.0
        assert sector_component(1.0) == 50.0
        assert sector_component(None) == 50.0


class TestConfluenceScore:
    def test_weighted_sum_and_breakdown(self):
        score, components = confluence_score(
            buy_sources={"SMART_MONEY", "ICHIMOKU", "VOLUME_BREAKOUT"},
            sell_sources=set(),
            opportunity_row={"trust": "CONFIRMED", "pvalue": 0.02},
            episode_metadatas=[{"inst_net_5d": 150000, "markup_percent": -2.1}],
            sector_intensity=12.4,
        )
        # 0.35*75 + 0.35*100 + 0.20*100 + 0.10*100 = 26.25 + 35 + 20 + 10 = 91.25 → round 91
        assert score == 91
        assert components["engine_agreement"]["score"] == 75.0
        assert components["opportunity"]["score"] == 100.0
        assert components["accumulation"]["score"] == 100.0
        assert components["sector"]["score"] == 100.0
