import pytest
import pandas as pd
import numpy as np
from stocks.services.confluence import (
    engine_component, opportunity_component, accumulation_component,
    sector_component, confluence_score,
)
from stocks.services.confluence import compute_atr, entry_status


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


def _price_df(closes, spread=2.0):
    n = len(closes)
    idx = pd.bdate_range("2026-05-01", periods=n)  # weekday spacing is irrelevant here
    closes = pd.Series(closes, index=idx, dtype=float)
    return pd.DataFrame({
        "Open": closes, "High": closes + spread, "Low": closes - spread,
        "Close": closes, "Volume": np.full(n, 1000.0),
    }, index=idx)


class TestComputeAtr:
    def test_constant_range_atr(self):
        df = _price_df([100.0] * 20, spread=2.0)
        # TR is high-low = 4.0 every bar → ATR(14) = 4.0
        assert compute_atr(df, period=14) == pytest.approx(4.0)

    def test_insufficient_history_returns_none(self):
        assert compute_atr(_price_df([100.0] * 5), period=14) is None


class TestEntryStatus:
    def test_in_zone(self):
        df = _price_df([100.0] * 30)
        status, lo, hi = entry_status(entry_price=101.0, signal_age_days=1, price_df=df)
        assert status == "IN_ZONE"
        assert lo == pytest.approx(97.0)   # 101 - 4
        assert hi == pytest.approx(105.0)  # 101 + 4

    def test_extended_when_price_left_zone(self):
        df = _price_df([100.0] * 29 + [120.0])
        status, _, _ = entry_status(entry_price=100.0, signal_age_days=1, price_df=df)
        assert status == "EXTENDED"

    def test_stale_when_signal_old(self):
        df = _price_df([100.0] * 30)
        status, _, _ = entry_status(entry_price=100.0, signal_age_days=9, price_df=df)
        assert status == "STALE"

    def test_no_atr_falls_back_to_pct_zone(self):
        df = _price_df([100.0] * 5)  # too short for ATR
        status, lo, hi = entry_status(entry_price=100.0, signal_age_days=1, price_df=df)
        assert status == "IN_ZONE"
        assert lo == pytest.approx(97.0)   # fallback ±3%
        assert hi == pytest.approx(103.0)
