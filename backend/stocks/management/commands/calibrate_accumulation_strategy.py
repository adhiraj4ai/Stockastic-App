from datetime import date

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError

from stocks.models import Strategy
from stocks.services.accumulation.calibration import (
    ACCUMULATION_STRATEGY_NAME, build_accumulation_code, calibrate,
    decide_validation_state)
from stocks.services.accumulation.universe import liquid_universe

DEFAULT_TRIALS = 40
OOS_FRACTION = 0.3

User = get_user_model()


class Command(BaseCommand):
    help = "Calibrate the AccumulationStrength strategy via the harness and gate it on OOS."

    def add_arguments(self, parser):
        parser.add_argument("--trials", type=int, default=DEFAULT_TRIALS)
        parser.add_argument("--oos-fraction", type=float, default=OOS_FRACTION)
        parser.add_argument("--user", type=str, default=None)

    def _resolve_user(self, username):
        if username:
            user = User.objects.filter(username=username).first()
            if user is None:
                raise CommandError(f"No user named {username!r}.")
            return user
        user = User.objects.filter(is_superuser=True).first()
        if user is None:
            raise CommandError("No --user given and no superuser exists.")
        return user

    def _resolve_basket(self):
        basket = list(liquid_universe(date.today()))
        if not basket:
            raise CommandError("Liquid universe is empty; nothing to calibrate.")
        return basket

    def _seed_strategy(self, user):
        strat, _ = Strategy.objects.get_or_create(
            name=ACCUMULATION_STRATEGY_NAME,
            defaults={"code": build_accumulation_code({}), "user": user})
        if not strat.code:
            strat.code = build_accumulation_code({})
            strat.save(update_fields=["code"])
        return strat

    def _persist(self, strat, best_params, card):
        strat.code = build_accumulation_code(best_params)
        strat.spec = {**(strat.spec or {}), "validation_state": decide_validation_state(card),
                      "best_params": best_params, "oos_passed": card.passed}
        strat.save(update_fields=["code", "spec"])

    def handle(self, *args, **opts):
        user = self._resolve_user(opts["user"])
        basket = self._resolve_basket()
        strat = self._seed_strategy(user)
        self.stdout.write(f"Calibrating over {len(basket)} symbols (trials={opts['trials']})...")
        best_params, card = calibrate(basket, opts["oos_fraction"], opts["trials"])
        self._persist(strat, best_params, card)
        verdict = self.style.SUCCESS("VALIDATED") if card.passed else self.style.WARNING("RESEARCH")
        self.stdout.write(f"[{verdict}] best={best_params} oos_passed={card.passed}")
