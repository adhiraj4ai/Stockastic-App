from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated
from decimal import Decimal

from ...models import (
    PortfolioTransaction, TransactionType,
)
from ...serializers import PortfolioTransactionSerializer
from ...utils import (
    calculate_broker_commission, calculate_sebon_fee, calculate_dp_charge,
)
from ...services.portfolio_service import PortfolioService
from .portfolio_transaction_tax_mixin import TaxReportMixin


class PortfolioTransactionViewSet(TaxReportMixin, viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = PortfolioTransactionSerializer

    def get_queryset(self):
        if self.request.user.username == 'admin':
            return PortfolioTransaction.objects.all().order_by('-transaction_date')
        return PortfolioTransaction.objects.filter(user=self.request.user).order_by('-transaction_date')

    def perform_create(self, serializer):
        user = self.request.user
        data = serializer.validated_data
        try:
            metrics = PortfolioService.process_transaction(
                user=user,
                ticker=data['ticker'],
                txn_type=data['transaction_type'],
                quantity=data['quantity'],
                rate=data['rate'],
                account=data.get('account'),
                commission=data.get('commission'),
                sebon_fee=data.get('sebon_fee'),
                dp_charge=data.get('dp_charge'),
            )
            serializer.save(
                user=user,
                amount=metrics['amount'],
                commission=metrics['commission'],
                sebon_fee=metrics['sebon_fee'],
                dp_charge=metrics['dp_charge'],
                cgt=metrics['cgt'],
                receivable_amount=metrics['receivable_amount'],
            )
        except ValueError as e:
            from rest_framework import serializers
            raise serializers.ValidationError(str(e))

    def perform_destroy(self, instance):
        user = instance.user
        ticker = instance.ticker
        account = instance.account
        instance.delete()
        PortfolioService.recalculate_item(user, account, ticker)

    def perform_update(self, serializer):
        user = self.request.user
        instance = serializer.instance
        old_ticker = instance.ticker
        old_account = instance.account
        data = serializer.validated_data
        if self._fields_require_recalc(data):
            self._save_with_recalculated_charges(serializer, instance, data)
        else:
            serializer.save()
        ticker = instance.ticker
        account = instance.account
        PortfolioService.recalculate_item(user, account, ticker)
        if old_ticker != ticker or old_account != account:
            PortfolioService.recalculate_item(user, old_account, old_ticker)

    def _fields_require_recalc(self, data):
        return 'quantity' in data or 'rate' in data or 'transaction_type' in data

    def _save_with_recalculated_charges(self, serializer, instance, data):
        qty = data.get('quantity', instance.quantity)
        rate = data.get('rate', instance.rate)
        txn_type = data.get('transaction_type', instance.transaction_type)
        amount = Decimal(qty) * Decimal(rate)
        commission = data.get('commission', calculate_broker_commission(amount))
        sebon_fee = data.get('sebon_fee', calculate_sebon_fee(amount))
        dp_charge = data.get('dp_charge', calculate_dp_charge())
        cgt = data.get('cgt', instance.cgt)
        receivable = self._compute_receivable(txn_type, amount, commission, sebon_fee, dp_charge, cgt)
        serializer.save(
            amount=amount, commission=commission, sebon_fee=sebon_fee,
            dp_charge=dp_charge, receivable_amount=receivable,
        )

    def _compute_receivable(self, txn_type, amount, commission, sebon_fee, dp_charge, cgt):
        charges = commission + sebon_fee + dp_charge
        if txn_type == TransactionType.BUY:
            return amount + charges
        if txn_type == TransactionType.SELL:
            return amount - charges - cgt
        if txn_type == TransactionType.SHORT_SELL:
            return amount - charges
        if txn_type == TransactionType.BUY_TO_COVER:
            return amount + charges
        if txn_type == TransactionType.BONUS:
            return Decimal('0.00')
        return amount
