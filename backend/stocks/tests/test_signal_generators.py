def test_isignal_generator_protocol_is_runtime_checkable():
    from stocks.services.signals.base import ISignalGenerator

    class FakeGenerator:
        source_key = 'FAKE'
        def generate(self):
            return []

    assert isinstance(FakeGenerator(), ISignalGenerator)


def test_isignal_generator_rejects_missing_generate():
    from stocks.services.signals.base import ISignalGenerator

    class Bad:
        source_key = 'X'

    assert not isinstance(Bad(), ISignalGenerator)


def test_orchestrator_calls_all_generators_and_returns_total():
    from stocks.services.signals.orchestrator import SignalOrchestrator
    from unittest.mock import patch

    class FakeGen:
        source_key = 'FAKE'
        def generate(self):
            return [{'symbol': 'X', 'signal': 'BUY'}]

    orch = SignalOrchestrator(generators=[FakeGen(), FakeGen()])

    with patch.object(orch, '_persist', return_value=1):
        total = orch.generate_all()

    assert total == 2


def test_orchestrator_tolerates_generator_exception():
    from stocks.services.signals.orchestrator import SignalOrchestrator

    class BrokenGen:
        source_key = 'BROKEN'
        def generate(self):
            raise RuntimeError("sql gone")

    orch = SignalOrchestrator(generators=[BrokenGen()])
    total = orch.generate_all()
    assert total == 0


import pytest

@pytest.mark.parametrize("mod_path,cls_name", [
    ("stocks.services.signals.generators.smart_money", "SmartMoneyGenerator"),
    ("stocks.services.signals.generators.broker_accumulation", "BrokerAccumulationGenerator"),
    ("stocks.services.signals.generators.smart_crossover", "SmartCrossoverGenerator"),
    ("stocks.services.signals.generators.ichimoku", "IchimokuGenerator"),
    ("stocks.services.signals.generators.distribution_alert", "DistributionAlertGenerator"),
    ("stocks.services.signals.generators.below_cost_reversal", "BelowCostReversalGenerator"),
    ("stocks.services.signals.generators.volume_breakout", "VolumeBreakoutGenerator"),
    ("stocks.services.signals.generators.concentration_shift", "ConcentrationShiftGenerator"),
    ("stocks.services.signals.generators.accumulation_momentum", "AccumulationMomentumGenerator"),
    ("stocks.services.signals.generators.institutional_alerts", "InstitutionalAlertsGenerator"),
])
def test_generator_implements_protocol(mod_path, cls_name):
    import importlib
    from stocks.services.signals.base import ISignalGenerator
    mod = importlib.import_module(mod_path)
    cls = getattr(mod, cls_name)
    assert isinstance(cls(), ISignalGenerator)
