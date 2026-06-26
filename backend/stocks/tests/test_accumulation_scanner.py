from datetime import date
from decimal import Decimal

import numpy as np
import pandas as pd
import pytest

from stocks.models import AccumulationCandidate
from stocks.services.accumulation.scanner import AccumulationScanner, suggested_levels


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
