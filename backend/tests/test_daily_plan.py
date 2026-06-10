import pytest
from datetime import date

from stocks.models import DailyTradingPlan
from django.db import IntegrityError, transaction


@pytest.mark.django_db
class TestDailyTradingPlanModel:
    def test_create_and_unique_date(self):
        plan = DailyTradingPlan.objects.create(
            date=date(2026, 6, 11),
            regime="RISK_ON",
            breadth=0.65,
            payload={"picks": [], "exits": [], "catalysts": [], "market_context": {}},
        )
        assert plan.generated_at is not None
        assert plan.payload["picks"] == []
        with pytest.raises(IntegrityError):
            with transaction.atomic():
                DailyTradingPlan.objects.create(date=date(2026, 6, 11), regime="NEUTRAL", payload={})
