from stocks.services.signals.conditions import format_conditions


def test_smart_money_conditions_are_labeled():
    lines = format_conditions("SMART_MONEY", {"cluster_count": 4, "net_5d": 120000})
    assert any("4" in l and "cluster" in l.lower() for l in lines)
    assert any("120,000" in l or "120000" in l for l in lines)


def test_accumulation_strategy_uses_factor_breakdown():
    lines = format_conditions("ACCUMULATION_STRATEGY",
                              {"concentration": 0.9, "coiling": 0.7, "breakout": 1.0, "score": 82.0})
    assert any("concentration" in l.lower() for l in lines)
    assert any("82" in l for l in lines)


def test_unknown_keys_fall_back_without_error():
    lines = format_conditions("WHATEVER", {"foo_bar": 3})
    assert lines == ["Foo bar: 3"]
    assert format_conditions("WHATEVER", {}) == []
