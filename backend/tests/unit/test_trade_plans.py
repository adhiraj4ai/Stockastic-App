"""Unit tests for TradePlan + TradePlanLeg: models, serializers, views, and signals."""
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


from stocks.serializers.portfolio import TradePlanSerializer


class TradePlanSerializerTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user('trader2', password='pass')
        self.account = PortfolioAccount.objects.create(
            user=self.user, name='Paper', account_type=AccountType.PAPER,
            balance=Decimal('1000000'),
        )
        self.valid_data = {
            'ticker': 'NABIL',
            'account': self.account.id,
            'risk_budget_pct': '2.00',
            'legs': [
                {'leg_number': 1, 'price_target': '1200.00', 'allocation_pct': '60.00', 'stop_loss_price': '1140.00'},
                {'leg_number': 2, 'price_target': '1150.00', 'allocation_pct': '40.00', 'stop_loss_price': '1095.00'},
            ],
        }

    def test_valid_data_creates_plan_with_two_legs(self):
        s = TradePlanSerializer(data=self.valid_data)
        assert s.is_valid(), s.errors
        plan = s.save(user=self.user)
        assert TradePlan.objects.filter(id=plan.id).exists()
        assert TradePlanLeg.objects.filter(plan=plan).count() == 2

    def test_allocation_not_100_is_invalid(self):
        data = {**self.valid_data, 'legs': [
            {'leg_number': 1, 'price_target': '1200.00', 'allocation_pct': '50.00', 'stop_loss_price': '1140.00'},
            {'leg_number': 2, 'price_target': '1150.00', 'allocation_pct': '30.00', 'stop_loss_price': '1095.00'},
        ]}
        s = TradePlanSerializer(data=data)
        assert not s.is_valid()
        assert 'legs' in s.errors

    def test_empty_legs_is_invalid(self):
        data = {**self.valid_data, 'legs': []}
        s = TradePlanSerializer(data=data)
        assert not s.is_valid()
        assert 'legs' in s.errors

    def test_stop_loss_above_price_target_is_invalid(self):
        data = {**self.valid_data, 'legs': [
            {'leg_number': 1, 'price_target': '1200.00', 'allocation_pct': '100.00', 'stop_loss_price': '1300.00'},
        ]}
        s = TradePlanSerializer(data=data)
        assert not s.is_valid()

    def test_computed_fields_present_on_retrieve(self):
        s = TradePlanSerializer(data=self.valid_data)
        s.is_valid()
        plan = s.save(user=self.user)
        out = TradePlanSerializer(plan).data
        assert out['total_allocated_pct'] == 100.0
        assert out['total_legs'] == 2
        assert out['executed_legs'] == 0
        assert out['per_leg_risk_pct'] == 1.0  # 2.00 / 2


from rest_framework.test import APIClient
from django.urls import reverse
from stocks.models.portfolio import PortfolioTransaction


class TradePlanViewSetTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user('viewuser', password='pass')
        self.client.force_authenticate(user=self.user)
        self.account = PortfolioAccount.objects.create(
            user=self.user, name='Paper', account_type=AccountType.PAPER,
            balance=Decimal('2000000'),
        )
        self.plan = TradePlan.objects.create(
            user=self.user, account=self.account, ticker='NABIL',
            risk_budget_pct=Decimal('2.00'), status=TradePlan.PlanStatus.OPEN,
        )
        self.leg1 = TradePlanLeg.objects.create(
            plan=self.plan, leg_number=1,
            price_target=Decimal('1200.00'), allocation_pct=Decimal('60.00'),
            stop_loss_price=Decimal('1140.00'),
        )
        self.leg2 = TradePlanLeg.objects.create(
            plan=self.plan, leg_number=2,
            price_target=Decimal('1150.00'), allocation_pct=Decimal('40.00'),
            stop_loss_price=Decimal('1095.00'),
        )

    def test_list_returns_user_plans(self):
        res = self.client.get('/api/stocks/trade-plans/')
        assert res.status_code == 200
        assert len(res.data) == 1

    def test_list_filter_by_status(self):
        self.plan.status = TradePlan.PlanStatus.CLOSED
        self.plan.save()
        res = self.client.get('/api/stocks/trade-plans/?status=OPEN')
        assert res.status_code == 200
        assert len(res.data) == 0

    def test_delete_cancels_plan_not_hard_delete(self):
        res = self.client.delete(f'/api/stocks/trade-plans/{self.plan.id}/')
        assert res.status_code == 204
        self.plan.refresh_from_db()
        assert self.plan.status == TradePlan.PlanStatus.CANCELLED

    def test_execute_leg_creates_transaction_and_updates_leg(self):
        res = self.client.post(
            f'/api/stocks/trade-plans/{self.plan.id}/execute_leg/',
            {'leg_id': self.leg1.id, 'rate': '1200.00', 'quantity': 50},
            format='json',
        )
        assert res.status_code == 200
        self.leg1.refresh_from_db()
        assert self.leg1.status == TradePlanLeg.LegStatus.EXECUTED
        assert self.leg1.transaction is not None

    def test_execute_leg_auto_closes_plan_when_all_legs_resolved(self):
        self.client.post(
            f'/api/stocks/trade-plans/{self.plan.id}/execute_leg/',
            {'leg_id': self.leg1.id, 'rate': '1200.00', 'quantity': 50},
            format='json',
        )
        self.client.post(
            f'/api/stocks/trade-plans/{self.plan.id}/skip_leg/',
            {'leg_id': self.leg2.id},
            format='json',
        )
        self.plan.refresh_from_db()
        assert self.plan.status == TradePlan.PlanStatus.CLOSED

    def test_execute_leg_on_closed_plan_returns_400(self):
        self.plan.status = TradePlan.PlanStatus.CLOSED
        self.plan.save()
        res = self.client.post(
            f'/api/stocks/trade-plans/{self.plan.id}/execute_leg/',
            {'leg_id': self.leg1.id, 'rate': '1200.00', 'quantity': 50},
            format='json',
        )
        assert res.status_code == 400

    def test_execute_leg_insufficient_balance_returns_400(self):
        self.account.balance = Decimal('100.00')
        self.account.save()
        res = self.client.post(
            f'/api/stocks/trade-plans/{self.plan.id}/execute_leg/',
            {'leg_id': self.leg1.id, 'rate': '1200.00', 'quantity': 50},
            format='json',
        )
        assert res.status_code == 400

    def test_skip_leg_sets_skipped_status(self):
        res = self.client.post(
            f'/api/stocks/trade-plans/{self.plan.id}/skip_leg/',
            {'leg_id': self.leg1.id},
            format='json',
        )
        assert res.status_code == 200
        self.leg1.refresh_from_db()
        assert self.leg1.status == TradePlanLeg.LegStatus.SKIPPED

    def test_unauthenticated_request_returns_401(self):
        unauth_client = APIClient()
        res = unauth_client.get('/api/stocks/trade-plans/')
        assert res.status_code == 401
