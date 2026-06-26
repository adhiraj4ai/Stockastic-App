from chat.tools import rebalance_economics as econ


def test_leg_friction_sums_all_cost_components():
    fees = {"commission": 36.0, "sebon_fee": 1.5, "dp_charge": 25.0, "cgt": 7.5}
    assert econ.leg_friction(fees) == 70.0


def test_leg_friction_missing_keys_default_to_zero():
    assert econ.leg_friction({"commission": 10.0}) == 10.0


def test_expected_annual_benefit_is_magnitude_of_move():
    # Rs 100,000 shifted into an asset with +12% expected annual return.
    assert econ.expected_annual_benefit(100_000.0, 0.12) == 12_000.0


def test_expected_annual_benefit_uses_absolute_values():
    # Selling (negative delta value) out of a negative-return asset is still a positive benefit.
    assert econ.expected_annual_benefit(-100_000.0, -0.05) == 5_000.0


def test_is_net_negative_true_when_friction_meets_or_exceeds_benefit():
    assert econ.is_net_negative(70.0, 50.0) is True
    assert econ.is_net_negative(50.0, 50.0) is True


def test_is_net_negative_false_when_benefit_exceeds_friction():
    assert econ.is_net_negative(50.0, 70.0) is False
