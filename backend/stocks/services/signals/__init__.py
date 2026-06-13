from .generators.smart_money import SmartMoneyGenerator
from .generators.broker_accumulation import BrokerAccumulationGenerator
from .generators.smart_crossover import SmartCrossoverGenerator
from .generators.ichimoku import IchimokuGenerator
from .generators.distribution_alert import DistributionAlertGenerator
from .generators.below_cost_reversal import BelowCostReversalGenerator
from .generators.volume_breakout import VolumeBreakoutGenerator
from .generators.concentration_shift import ConcentrationShiftGenerator
from .generators.accumulation_momentum import AccumulationMomentumGenerator
from .generators.institutional_alerts import InstitutionalAlertsGenerator
from .orchestrator import SignalOrchestrator

DEFAULT_GENERATORS = [
    SmartMoneyGenerator(),
    BrokerAccumulationGenerator(),
    SmartCrossoverGenerator(),
    IchimokuGenerator(),
    DistributionAlertGenerator(),
    BelowCostReversalGenerator(),
    VolumeBreakoutGenerator(),
    ConcentrationShiftGenerator(),
    AccumulationMomentumGenerator(),
    InstitutionalAlertsGenerator(),
]

default_orchestrator = SignalOrchestrator(generators=DEFAULT_GENERATORS)
