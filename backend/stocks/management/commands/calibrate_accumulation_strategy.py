from datetime import date

from django.core.management.base import BaseCommand, CommandError

from stocks.services.accumulation.calibration_runner import (
    CALIBRATION_MAX_SYMBOLS, DEFAULT_TRIALS, OOS_FRACTION, CalibrationError,
    run_calibration)


class Command(BaseCommand):
    help = "Calibrate the AccumulationStrength strategy via the harness and gate it on OOS."

    def add_arguments(self, parser):
        parser.add_argument("--trials", type=int, default=DEFAULT_TRIALS)
        parser.add_argument("--oos-fraction", type=float, default=OOS_FRACTION)
        parser.add_argument("--user", type=str, default=None)
        parser.add_argument("--as-of", type=date.fromisoformat, default=None,
                            help="YYYY-MM-DD; defaults to the latest date with data.")
        parser.add_argument("--max-symbols", type=int, default=CALIBRATION_MAX_SYMBOLS,
                            help="Cap the calibration basket to the N most-liquid names.")

    def handle(self, *args, **opts):
        try:
            result = run_calibration(as_of=opts["as_of"], n_trials=opts["trials"],
                                     oos_fraction=opts["oos_fraction"], username=opts["user"],
                                     max_symbols=opts["max_symbols"])
        except CalibrationError as exc:
            raise CommandError(str(exc))
        verdict = (self.style.SUCCESS("VALIDATED") if result["oos_passed"]
                   else self.style.WARNING("RESEARCH"))
        self.stdout.write(
            f"[{verdict}] as_of={result['as_of']} symbols={result['symbols']} "
            f"best={result['best_params']}")
