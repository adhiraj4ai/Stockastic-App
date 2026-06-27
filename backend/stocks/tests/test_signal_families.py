from stocks.services.signals.families import family_for, FAMILIES


def test_accumulation_sources_map_to_accumulation():
    for s in ["SMART_MONEY", "DISTRIBUTION_ALERT", "BELOW_COST_REVERSAL",
              "CONCENTRATION_SHIFT", "ACC_MOMENTUM", "BROKER_ACCUMULATION",
              "ACCUMULATION_STRATEGY"]:
        assert family_for(s) == "accumulation"


def test_user_strategy_and_technical_and_unknown():
    assert family_for("USER_STRATEGY") == "your_strategies"
    assert family_for("VOLUME_BREAKOUT") == "technical"
    assert family_for("ICHIMOKU") == "technical"
    assert family_for("SOMETHING_NEW") == "technical"  # safe fallback
    assert set(FAMILIES) == {"accumulation", "technical", "your_strategies"}
