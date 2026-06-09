"""Unit tests for TradePlan + TradePlanLeg models and serializer validation."""
from decimal import Decimal
from django.test import TestCase
from django.contrib.auth.models import User
from stocks.models.portfolio import (
    TradePlan, TradePlanLeg, PortfolioAccount, AccountType,
)


class TradePlanModelTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user('trader', password='pass')
        self.account = PortfolioAccount.objects.create(
            user=self.user, name='Paper', account_type=AccountType.PAPER,
            balance=Decimal('1000000'),
        )

    def test_plan_default_status_is_open(self):
        plan = TradePlan.objects.create(
            user=self.user, ticker='NABIL', risk_budget_pct=Decimal('2.00'),
        )
        assert plan.status == TradePlan.PlanStatus.OPEN

    def test_leg_default_status_is_pending(self):
        plan = TradePlan.objects.create(
            user=self.user, ticker='NABIL', risk_budget_pct=Decimal('2.00'),
        )
        leg = TradePlanLeg.objects.create(
            plan=plan, leg_number=1,
            price_target=Decimal('1200.00'),
            allocation_pct=Decimal('100.00'),
            stop_loss_price=Decimal('1140.00'),
        )
        assert leg.status == TradePlanLeg.LegStatus.PENDING

    def test_legs_ordered_by_leg_number(self):
        plan = TradePlan.objects.create(
            user=self.user, ticker='NABIL', risk_budget_pct=Decimal('2.00'),
        )
        TradePlanLeg.objects.create(plan=plan, leg_number=2, price_target=Decimal('1150.00'), allocation_pct=Decimal('40.00'), stop_loss_price=Decimal('1095.00'))
        TradePlanLeg.objects.create(plan=plan, leg_number=1, price_target=Decimal('1200.00'), allocation_pct=Decimal('60.00'), stop_loss_price=Decimal('1140.00'))
        legs = list(plan.legs.all())
        assert legs[0].leg_number == 1
        assert legs[1].leg_number == 2
