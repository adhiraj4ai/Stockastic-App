from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from decimal import Decimal, InvalidOperation
from django.db import transaction
from django.utils import timezone

from ...models import (
    PortfolioTransaction, TradePlan, TradePlanLeg, TransactionType,
)
from ...serializers import TradePlanSerializer
from ...services.portfolio_service import PortfolioService


_RATE_DEVIATION_THRESHOLD = 0.10


def _check_and_close_plan(plan):
    """Auto-close the plan if all legs are EXECUTED or SKIPPED."""
    has_pending = plan.legs.filter(status=TradePlanLeg.LegStatus.PENDING).count() > 0
    if plan.status == TradePlan.PlanStatus.OPEN and not has_pending:
        plan.status = TradePlan.PlanStatus.CLOSED
        plan.save()


class TradePlanViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = TradePlanSerializer
    http_method_names = ['get', 'post', 'patch', 'delete', 'head', 'options']

    def get_queryset(self):
        qs = TradePlan.objects.filter(user=self.request.user).prefetch_related('legs')
        status_param = self.request.query_params.get('status')
        if status_param:
            qs = qs.filter(status=status_param)
        return qs

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    def perform_destroy(self, instance):
        instance.status = TradePlan.PlanStatus.CANCELLED
        instance.save()

    @action(detail=True, methods=['post'])
    def execute_leg(self, request, pk=None):
        plan = self.get_object()
        if plan.status != TradePlan.PlanStatus.OPEN:
            return Response({'error': 'Can only execute legs on an OPEN plan.'}, status=status.HTTP_400_BAD_REQUEST)
        validation_error = self._validate_execute_params(request.data)
        if validation_error:
            return validation_error
        leg_id = request.data.get('leg_id')
        rate = request.data.get('rate')
        quantity = request.data.get('quantity')
        leg, leg_error = self._get_pending_leg(plan, leg_id)
        if leg_error:
            return leg_error
        try:
            txn = self._execute_leg_transaction(request, plan, leg, rate, quantity)
        except (ValueError, InvalidOperation) as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        _check_and_close_plan(plan)
        plan.refresh_from_db()
        response_data = self.get_serializer(plan).data
        if abs(float(rate) - float(leg.price_target)) / float(leg.price_target) > _RATE_DEVIATION_THRESHOLD:
            response_data['rate_deviation_warning'] = True
        return Response(response_data)

    def _validate_execute_params(self, data):
        leg_id = data.get('leg_id')
        rate = data.get('rate')
        quantity = data.get('quantity')
        if leg_id is None or rate is None or quantity is None:
            return Response({'error': 'leg_id, rate, and quantity are required.'}, status=status.HTTP_400_BAD_REQUEST)
        return None

    def _get_pending_leg(self, plan, leg_id):
        try:
            leg = plan.legs.get(id=leg_id)
        except TradePlanLeg.DoesNotExist:
            return None, Response({'error': 'Leg not found on this plan.'}, status=status.HTTP_404_NOT_FOUND)
        if leg.status != TradePlanLeg.LegStatus.PENDING:
            return None, Response({'error': f'Leg is already {leg.status}.'}, status=status.HTTP_400_BAD_REQUEST)
        return leg, None

    def _execute_leg_transaction(self, request, plan, leg, rate, quantity):
        with transaction.atomic():
            metrics = PortfolioService.process_transaction(
                user=request.user,
                ticker=plan.ticker,
                txn_type=TransactionType.BUY,
                quantity=int(quantity),
                rate=Decimal(str(rate)),
                account=plan.account,
            )
            txn = PortfolioTransaction.objects.create(
                user=request.user,
                account=plan.account,
                ticker=plan.ticker,
                transaction_type=TransactionType.BUY,
                quantity=int(quantity),
                rate=Decimal(str(rate)),
                transaction_date=timezone.now(),
                settlement_date=metrics['settlement_date'],
                amount=metrics['amount'],
                commission=metrics['commission'],
                sebon_fee=metrics['sebon_fee'],
                dp_charge=metrics['dp_charge'],
                cgt=metrics['cgt'],
                receivable_amount=metrics['receivable_amount'],
            )
            leg.transaction = txn
            leg.status = TradePlanLeg.LegStatus.EXECUTED
            leg.save()
        return txn

    @action(detail=True, methods=['post'])
    def skip_leg(self, request, pk=None):
        plan = self.get_object()
        if plan.status != TradePlan.PlanStatus.OPEN:
            return Response({'error': 'Can only skip legs on an OPEN plan.'}, status=status.HTTP_400_BAD_REQUEST)
        leg_id = request.data.get('leg_id')
        if not leg_id:
            return Response({'error': 'leg_id is required.'}, status=status.HTTP_400_BAD_REQUEST)
        leg, leg_error = self._get_pending_leg(plan, leg_id)
        if leg_error:
            return leg_error
        leg.status = TradePlanLeg.LegStatus.SKIPPED
        leg.save()
        _check_and_close_plan(plan)
        plan.refresh_from_db()
        return Response(self.get_serializer(plan).data)
