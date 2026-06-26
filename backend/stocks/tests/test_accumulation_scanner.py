from datetime import date
from decimal import Decimal

import numpy as np
import pandas as pd
import pytest

from stocks.models import AccumulationCandidate
from stocks.services.accumulation.scanner import AccumulationScanner, suggested_levels

SCAN_DATE = date(2026, 6, 26)
TEST_SYMBOL = "NABIL"

_FIXED_CANDIDATE = dict(
    symbol=TEST_SYMBOL,
    scan_date=SCAN_DATE,
    score=Decimal("85.00"),
    factors={"dca": 1.0},
    suggested_entry=Decimal("1200.00"),
    suggested_stop=Decimal("1140.00"),
    suggested_target=Decimal("1320.00"),
    validation_state="research",
    status=AccumulationCandidate.Status.ACTIVE,
)


def _df():
    idx = pd.date_range("2021-01-01", periods=30, freq="D")
    c = np.linspace(100, 130, 30)
    return pd.DataFrame({"Open": c, "High": c * 1.02, "Low": c * 0.98,
                         "Close": c, "Volume": np.full(30, 1000.0)}, index=idx)


def test_suggested_levels_orders_stop_below_entry_below_target():
    entry, stop, target = suggested_levels(_df())
    assert stop < entry < target


@pytest.mark.django_db
def test_scan_expires_previous_active_candidates(monkeypatch):
    AccumulationCandidate.objects.create(
        symbol="OLD", scan_date=date(2026, 6, 25), score=Decimal("80"),
        factors={}, suggested_entry=Decimal("1"), suggested_stop=Decimal("1"),
        suggested_target=Decimal("1"), validation_state="validated",
        status=AccumulationCandidate.Status.ACTIVE)
    monkeypatch.setattr("stocks.services.accumulation.scanner.liquid_universe",
                        lambda as_of: [])
    AccumulationScanner.scan_and_save_candidates(as_of=date(2026, 6, 26))
    assert AccumulationCandidate.objects.get(symbol="OLD").status == \
        AccumulationCandidate.Status.EXPIRED


@pytest.mark.django_db
def test_scan_is_idempotent_same_day(monkeypatch):
    """Running scan twice for the same date leaves exactly one ACTIVE candidate."""
    monkeypatch.setattr("stocks.services.accumulation.scanner.liquid_universe",
                        lambda as_of: [TEST_SYMBOL])
    monkeypatch.setattr(
        AccumulationScanner, "_build_candidate",
        staticmethod(lambda sym, as_of, params, state, threshold: dict(_FIXED_CANDIDATE,
                                                                        scan_date=as_of)))
    AccumulationScanner.scan_and_save_candidates(as_of=SCAN_DATE)
    AccumulationScanner.scan_and_save_candidates(as_of=SCAN_DATE)
    active = AccumulationCandidate.objects.filter(
        symbol=TEST_SYMBOL, scan_date=SCAN_DATE, status=AccumulationCandidate.Status.ACTIVE)
    assert active.count() == 1


@pytest.mark.django_db
def test_scan_uses_defaults_when_no_calibrated_strategy(monkeypatch):
    """No Strategy row + empty universe — scan returns 0 and does not raise."""
    monkeypatch.setattr("stocks.services.accumulation.scanner.liquid_universe",
                        lambda as_of: [])
    result = AccumulationScanner.scan_and_save_candidates(as_of=SCAN_DATE)
    assert result == 0
