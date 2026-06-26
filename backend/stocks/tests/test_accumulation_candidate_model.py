from datetime import date
from decimal import Decimal

import pytest
from django.db import IntegrityError

from stocks.models import AccumulationCandidate


@pytest.mark.django_db
def test_candidate_unique_per_symbol_and_scan_date():
    AccumulationCandidate.objects.create(
        symbol="NABIL", scan_date=date(2026, 6, 26), score=Decimal("82.5"),
        factors={"concentration": 0.9}, suggested_entry=Decimal("520"),
        suggested_stop=Decimal("500"), suggested_target=Decimal("560"),
        validation_state="validated", status=AccumulationCandidate.Status.ACTIVE)
    with pytest.raises(IntegrityError):
        AccumulationCandidate.objects.create(
            symbol="NABIL", scan_date=date(2026, 6, 26), score=Decimal("70"),
            factors={}, suggested_entry=Decimal("1"), suggested_stop=Decimal("1"),
            suggested_target=Decimal("1"), validation_state="research",
            status=AccumulationCandidate.Status.ACTIVE)
