"""Pipeline integration for accumulation calibration: data-lag-robust as_of,
the shared run_calibration orchestrator, the scanner default date, and the
weekly Celery task delegation."""
from datetime import date

import pytest
from django.contrib.auth import get_user_model

from stocks.models import DailyCumulativeAccumulation, Strategy
from stocks.services.accumulation import calibration_runner as cr
from stocks.services.accumulation import scanner as sc
from stocks.services.accumulation.universe import latest_data_date

User = get_user_model()


class _Card:
    def __init__(self, passed):
        self.passed = passed


def _seed_dca(symbol, d, brokers=1):
    for i in range(brokers):
        DailyCumulativeAccumulation.objects.create(
            symbol=symbol, transaction_date=d, entity_id=str(i),
            cumulative_buy=1, cumulative_sell=0, cumulative_buy_amount=0,
            cumulative_sell_amount=0, cumulative_net=1)


@pytest.mark.django_db
def test_latest_data_date_returns_max():
    _seed_dca("AAA", date(2026, 6, 10))
    _seed_dca("AAA", date(2026, 6, 17))
    assert latest_data_date() == date(2026, 6, 17)


@pytest.mark.django_db
def test_latest_data_date_none_when_empty():
    assert latest_data_date() is None


@pytest.mark.django_db
def test_resolve_basket_falls_back_to_latest_date(monkeypatch):
    _seed_dca("AAA", date(2026, 6, 17))
    monkeypatch.setattr(cr, "liquid_universe",
                        lambda d, limit=None, rank_by=None: ["AAA"] if d == date(2026, 6, 17) else [])
    as_of, basket = cr.resolve_basket()
    assert as_of == date(2026, 6, 17)
    assert basket == ["AAA"]


@pytest.mark.django_db
def test_resolve_basket_caps_to_max_symbols(monkeypatch):
    _seed_dca("AAA", date(2026, 6, 17))
    seen = {}
    monkeypatch.setattr(cr, "liquid_universe",
                        lambda d, limit=None, rank_by=None: seen.update(limit=limit, rank_by=rank_by) or ["AAA"])
    cr.resolve_basket(max_symbols=25)
    assert seen["limit"] == 25
    assert seen["rank_by"] == "accumulation_growth"


@pytest.mark.django_db
def test_resolve_basket_raises_when_universe_empty(monkeypatch):
    _seed_dca("AAA", date(2026, 6, 17))
    monkeypatch.setattr(cr, "liquid_universe", lambda d, limit=None, rank_by=None: [])
    with pytest.raises(cr.CalibrationError):
        cr.resolve_basket()


@pytest.mark.django_db
def test_resolve_basket_raises_when_no_data():
    with pytest.raises(cr.CalibrationError):
        cr.resolve_basket()


@pytest.mark.django_db
def test_resolve_user_defaults_to_superuser():
    su = User.objects.create_superuser("admin_cal", "a@b.c", "x")
    assert cr.resolve_user() == su


@pytest.mark.django_db
def test_resolve_user_raises_without_superuser():
    with pytest.raises(cr.CalibrationError):
        cr.resolve_user()


@pytest.mark.django_db
def test_run_calibration_persists_validated_spec(monkeypatch):
    User.objects.create_superuser("admin_run", "a@b.c", "x")
    _seed_dca("AAA", date(2026, 6, 17))
    monkeypatch.setattr(cr, "liquid_universe", lambda d, limit=None, rank_by=None: ["AAA"])
    monkeypatch.setattr(cr, "calibrate",
                        lambda basket, oos, n: ({"top_n": 5, "entry_threshold": 55}, _Card(True)))
    result = cr.run_calibration(n_trials=2)
    assert result["validation_state"] == "validated"
    assert result["as_of"] == date(2026, 6, 17)
    strat = Strategy.objects.get(name=cr.ACCUMULATION_STRATEGY_NAME)
    assert strat.spec["best_params"] == {"top_n": 5, "entry_threshold": 55}
    assert strat.spec["oos_passed"] is True


@pytest.mark.django_db
def test_scanner_defaults_to_latest_data_date(monkeypatch):
    seen = {}
    monkeypatch.setattr(sc, "latest_data_date", lambda: date(2026, 6, 17))
    monkeypatch.setattr(sc, "liquid_universe",
                        lambda as_of: seen.setdefault("as_of", as_of) and [])
    sc.AccumulationScanner.scan_and_save_candidates()
    assert seen["as_of"] == date(2026, 6, 17)


@pytest.mark.django_db
def test_scanner_returns_zero_when_no_data(monkeypatch):
    monkeypatch.setattr(sc, "latest_data_date", lambda: None)
    assert sc.AccumulationScanner.scan_and_save_candidates() == 0


def test_calibrate_task_delegates(monkeypatch):
    from stocks import tasks
    monkeypatch.setattr(
        "stocks.services.accumulation.calibration_runner.run_calibration",
        lambda: {"validation_state": "research", "symbols": 3, "oos_passed": False,
                 "as_of": date(2026, 6, 17), "best_params": {}, "n_trials": 40})
    assert tasks.calibrate_accumulation_strategy_task.run() == {
        "validation_state": "research", "symbols": 3, "oos_passed": False}


def test_calibrate_task_handles_calibration_error(monkeypatch):
    from stocks import tasks
    from stocks.services.accumulation.calibration_runner import CalibrationError

    def boom():
        raise CalibrationError("no data")

    monkeypatch.setattr(
        "stocks.services.accumulation.calibration_runner.run_calibration", boom)
    assert tasks.calibrate_accumulation_strategy_task.run() == {"skipped": "no data"}


@pytest.mark.django_db
def test_scan_command_invokes_scanner(monkeypatch):
    from io import StringIO

    from django.core.management import call_command

    monkeypatch.setattr(
        "stocks.services.accumulation.scanner.AccumulationScanner.scan_and_save_candidates",
        staticmethod(lambda as_of=None: 4))
    out = StringIO()
    call_command("scan_accumulation_candidates", stdout=out)
    assert "4 active candidates" in out.getvalue()


def test_pipeline_catalog_lists_accumulation_jobs():
    from stocks.views.pipeline import PipelineViewSet
    assert "scan_accumulation" in PipelineViewSet.TASKS
    assert "calibrate_accumulation" in PipelineViewSet.TASKS
