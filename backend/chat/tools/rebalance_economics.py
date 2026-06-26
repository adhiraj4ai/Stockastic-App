"""Pure economics for cost/tax-aware rebalancing. No DB, no Django."""

_FEE_KEYS = ("commission", "sebon_fee", "dp_charge", "cgt")


def leg_friction(fees):
    """Total NEPSE friction for one leg: fees + CGT."""
    return float(sum(fees.get(k, 0.0) for k in _FEE_KEYS))


def expected_annual_benefit(delta_weight_value, asset_annual_return):
    """Estimated 1-year benefit of shifting `delta_weight_value` of capital.

    Magnitude of the asset's expected annual move on the reallocated capital.
    Heuristic estimate, not a forecast.
    """
    return abs(float(delta_weight_value)) * abs(float(asset_annual_return))


def is_net_negative(friction, benefit):
    """A leg is net-negative when its friction meets or exceeds its expected benefit."""
    return float(friction) >= float(benefit)
