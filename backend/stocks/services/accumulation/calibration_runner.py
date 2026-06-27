"""Orchestration shared by the calibrate command and the periodic Celery task.

Resolves the user, the data-current basket, and persistence around the pure
``calibrate`` algorithm so both entry points stay thin and DRY.
"""
from django.contrib.auth import get_user_model

from stocks.models import Strategy
from stocks.services.accumulation.calibration import (
    ACCUMULATION_STRATEGY_NAME, build_accumulation_code, calibrate,
    decide_validation_state)
from stocks.services.accumulation.universe import latest_data_date, liquid_universe

DEFAULT_TRIALS = 40
OOS_FRACTION = 0.3
# Calibrate on a bounded, most-liquid sample. The full 263-symbol universe is
# both slow and unstable to backtest in one process; a representative liquid
# sample yields sound global weights and runs reliably (the scanner still
# scores the entire universe).
CALIBRATION_MAX_SYMBOLS = 60

User = get_user_model()


class CalibrationError(Exception):
    """Recoverable precondition failure (no user, no data, empty universe)."""


def resolve_user(username=None):
    if username:
        user = User.objects.filter(username=username).first()
        if user is None:
            raise CalibrationError(f"No user named {username!r}.")
        return user
    user = User.objects.filter(is_superuser=True).first()
    if user is None:
        raise CalibrationError("No --user given and no superuser exists.")
    return user


def resolve_basket(as_of=None, max_symbols=CALIBRATION_MAX_SYMBOLS):
    as_of = as_of or latest_data_date()
    if as_of is None:
        raise CalibrationError("No accumulation data available to calibrate on.")
    basket = list(liquid_universe(as_of, limit=max_symbols))
    if not basket:
        raise CalibrationError(f"Liquid universe is empty for {as_of}.")
    return as_of, basket


def _seed_strategy(user):
    strat, _ = Strategy.objects.get_or_create(
        name=ACCUMULATION_STRATEGY_NAME,
        defaults={"code": build_accumulation_code({}), "user": user})
    if not strat.code:
        strat.code = build_accumulation_code({})
        strat.save(update_fields=["code"])
    return strat


def _persist(strat, best_params, card):
    strat.code = build_accumulation_code(best_params)
    strat.spec = {**(strat.spec or {}),
                  "validation_state": decide_validation_state(card),
                  "best_params": best_params, "oos_passed": card.passed}
    strat.save(update_fields=["code", "spec"])


def run_calibration(as_of=None, n_trials=DEFAULT_TRIALS, oos_fraction=OOS_FRACTION,
                    username=None, max_symbols=CALIBRATION_MAX_SYMBOLS):
    """Calibrate over the data-current liquid basket; persist and return a summary."""
    user = resolve_user(username)
    as_of, basket = resolve_basket(as_of, max_symbols=max_symbols)
    strat = _seed_strategy(user)
    best_params, card = calibrate(basket, oos_fraction, n_trials)
    _persist(strat, best_params, card)
    return {"as_of": as_of, "symbols": len(basket), "n_trials": n_trials,
            "validation_state": decide_validation_state(card),
            "best_params": best_params, "oos_passed": card.passed}
