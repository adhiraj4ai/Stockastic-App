"""NEPSE T+2 settlement: trading-day calendar, settlement dates, settled positions."""
from datetime import timedelta
from decimal import Decimal

from django.db.models import Q, Sum

from stocks.models.market import DailyMarketSummary
from stocks.models.portfolio import PortfolioTransaction, TransactionType

_SETTLEMENT_TRADING_DAYS = 2
_DEFAULT_TRADING_WEEKDAYS = {6, 0, 1, 2, 3}      # Sun–Thu (Mon=0 … Sun=6)
_WEEKDAY_SAMPLE = 120
_ADD_QTY_TYPES = (TransactionType.BUY, TransactionType.BONUS, TransactionType.RIGHTS)


class SettlementService:
    @staticmethod
    def trading_weekdays():
        dates = DailyMarketSummary.objects.order_by("-date").values_list("date", flat=True)[:_WEEKDAY_SAMPLE]
        weekdays = {d.weekday() for d in dates}
        return weekdays or set(_DEFAULT_TRADING_WEEKDAYS)

    @staticmethod
    def next_settlement_date(trade_date, trading_days=_SETTLEMENT_TRADING_DAYS):
        weekdays = SettlementService.trading_weekdays()
        counted, cursor = 0, trade_date
        while counted < trading_days:
            cursor = cursor + timedelta(days=1)
            if cursor.weekday() in weekdays:
                counted += 1
        return cursor

    @staticmethod
    def settled_quantity(user, account, ticker, as_of):
        base = PortfolioTransaction.objects.filter(user=user, account=account, ticker=ticker)
        added = base.filter(transaction_type__in=_ADD_QTY_TYPES).filter(
            Q(settlement_date__lte=as_of) | Q(settlement_date__isnull=True)
        ).aggregate(q=Sum("quantity"))["q"] or 0
        sold = base.filter(transaction_type=TransactionType.SELL).aggregate(q=Sum("quantity"))["q"] or 0
        return int(added) - int(sold)

    @staticmethod
    def unsettled_sale_proceeds(user, account, as_of):
        total = PortfolioTransaction.objects.filter(
            user=user, account=account, transaction_type=TransactionType.SELL,
            settlement_date__gt=as_of,
        ).aggregate(s=Sum("receivable_amount"))["s"]
        return Decimal(total) if total is not None else Decimal("0")
