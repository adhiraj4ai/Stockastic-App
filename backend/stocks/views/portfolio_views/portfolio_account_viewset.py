from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from decimal import Decimal

from ...models import (
    PortfolioAccount, PortfolioItem, PortfolioTransaction, DailyStockPrice,
)
from ...serializers import PortfolioAccountSerializer


class PortfolioAccountViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = PortfolioAccountSerializer

    def get_queryset(self):
        if self.request.user.username == 'admin':
            return PortfolioAccount.objects.all()
        return PortfolioAccount.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    @action(detail=True, methods=['post'])
    def reset(self, request, pk=None):
        account = self.get_object()
        if account.account_type != 'PAPER':
            return Response(
                {"error": "Only paper trading accounts can be reset."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        starting_balance = request.data.get('starting_balance', 1000000)
        PortfolioTransaction.objects.filter(account=account).delete()
        PortfolioItem.objects.filter(account=account).delete()
        account.balance = Decimal(starting_balance)
        account.save()
        return Response({"message": "Account reset successfully.", "balance": account.balance})

    @action(detail=False, methods=['get'])
    def leaderboard(self, request):
        paper_accounts = PortfolioAccount.objects.filter(account_type='PAPER')
        leaderboard_data = [
            self._build_leaderboard_entry(acc)
            for acc in paper_accounts
        ]
        leaderboard_data.sort(key=lambda x: x['total_value'], reverse=True)
        return Response(leaderboard_data)

    def _build_leaderboard_entry(self, acc):
        items = PortfolioItem.objects.filter(account=acc)
        latest_prices = self._fetch_latest_prices(items)
        positions_value = self._compute_positions_value(items, latest_prices)
        total_value = acc.balance + positions_value
        return {
            "account_id": acc.id,
            "account_name": acc.name,
            "user": acc.user.username,
            "balance": acc.balance,
            "positions_value": positions_value,
            "total_value": total_value,
            "roi_percentage": ((total_value - Decimal(1000000)) / Decimal(1000000)) * 100,
        }

    def _fetch_latest_prices(self, items):
        tickers = [item.ticker for item in items]
        if not tickers:
            return {}
        prices = DailyStockPrice.objects.filter(
            ticker__in=tickers
        ).order_by('ticker', '-date').distinct('ticker')
        return {p.ticker: p.close for p in prices}

    def _compute_positions_value(self, items, latest_prices):
        total = Decimal('0.00')
        for item in items:
            current_price = Decimal(latest_prices.get(item.ticker, item.buy_price))
            total += Decimal(item.quantity) * current_price
        return total
