from datetime import date

from django.core.management.base import BaseCommand

from stocks.models import Strategy
from stocks.services.accumulation.calibration import (
    ACCUMULATION_STRATEGY_NAME, build_accumulation_code, decide_validation_state)
from stocks.services.backtest_harness.evaluate import evaluate_over_basket
from stocks.services.optimization_service import OptimizationService

DEFAULT_TRIALS = 40
OOS_FRACTION = 0.3


class Command(BaseCommand):
    help = "Calibrate the AccumulationStrength strategy globally and gate it on OOS."

    def add_arguments(self, parser):
        parser.add_argument("--trials", type=int, default=DEFAULT_TRIALS)
        parser.add_argument("--start", type=str, default="2021-01-01")
        parser.add_argument("--end", type=str, default=str(date.today()))

    def _seed_strategy(self):
        strat, _ = Strategy.objects.get_or_create(
            name=ACCUMULATION_STRATEGY_NAME,
            defaults={"code": build_accumulation_code({})})
        if not strat.code:
            strat.code = build_accumulation_code({})
            strat.save(update_fields=["code"])
        return strat

    def handle(self, *args, **opts):
        strat = self._seed_strategy()
        self.stdout.write("Optimizing (scope=ALL, objective=sortino)...")
        best_params, best_value = OptimizationService.run_optimization(
            strat, "ALL", "ALL", opts["start"], opts["end"], opts["trials"],
            objective_type="sortino")
        strat.code = build_accumulation_code(best_params)
        strat.save(update_fields=["code"])
        self.stdout.write("Validating on OOS basket...")
        card = evaluate_over_basket(strat, list(_basket()), oos_fraction=OOS_FRACTION,
                                    strategy_name=strat.name)
        state = decide_validation_state(card)
        strat.spec = {**(strat.spec or {}), "validation_state": state,
                      "best_params": best_params, "oos_passed": card.passed}
        strat.save(update_fields=["spec"])
        verdict = self.style.SUCCESS("VALIDATED") if card.passed else self.style.WARNING("RESEARCH")
        self.stdout.write(f"[{verdict}] best={best_params} oos_passed={card.passed}")


def _basket():
    from stocks.services.accumulation.universe import liquid_universe
    return liquid_universe(date.today())
