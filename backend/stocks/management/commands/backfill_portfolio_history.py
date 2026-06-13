
from django.core.management.base import BaseCommand
from django.contrib.auth.models import User
from stocks.models import PortfolioAccount, PortfolioTransaction, PortfolioSnapshot, DailyStockPrice
from stocks.models.portfolio import TransactionType
from decimal import Decimal
from datetime import timedelta, date


class Command(BaseCommand):
    help = 'Backfills portfolio snapshot history based on transactions'

    def _build_price_map(self):
        price_map = {}
        for p in DailyStockPrice.objects.values('ticker', 'date', 'close').order_by('date'):
            price_map.setdefault(p['ticker'], {})[p['date']] = p['close']
        return price_map

    def _resolve_account(self, account_id):
        if not account_id:
            return None, "Unassigned"
        try:
            account = PortfolioAccount.objects.get(id=account_id)
            return account, account.name
        except PortfolioAccount.DoesNotExist:
            return None, None  # sentinel: skip this account

    def _apply_transaction(self, txn, holdings, cash, invested):
        total_outflow = txn.amount + txn.commission + txn.sebon_fee + txn.dp_charge
        net_inflow = txn.amount - txn.commission - txn.sebon_fee - txn.dp_charge - txn.cgt
        if txn.transaction_type == TransactionType.BUY:
            holdings[txn.ticker] = holdings.get(txn.ticker, 0) + txn.quantity
            cash -= total_outflow
            invested += total_outflow
        elif txn.transaction_type == TransactionType.SELL:
            holdings[txn.ticker] = holdings.get(txn.ticker, 0) - txn.quantity
            if holdings.get(txn.ticker, 0) <= 0:
                holdings.pop(txn.ticker, None)
            cash += net_inflow
        elif txn.transaction_type == TransactionType.BONUS:
            holdings[txn.ticker] = holdings.get(txn.ticker, 0) + txn.quantity
        return cash, invested

    def _lookup_price(self, price_map, ticker, current_date):
        ticker_prices = price_map.get(ticker, {})
        price = ticker_prices.get(current_date)
        if price:
            return price
        for lookback in range(1, 8):
            price = ticker_prices.get(current_date - timedelta(days=lookback))
            if price:
                return price
        return None

    def _compute_market_value(self, holdings, price_map, current_date):
        total = Decimal(0)
        for ticker, qty in holdings.items():
            price = self._lookup_price(price_map, ticker, current_date)
            if price:
                total += Decimal(qty) * Decimal(price)
        return total

    def _backfill_account(self, user, account_id, account_name, price_map):
        txns = PortfolioTransaction.objects.filter(
            user=user, account_id=account_id
        ).order_by('transaction_date')
        if not txns.exists():
            return
        txns_by_date = {}
        for txn in txns:
            txns_by_date.setdefault(txn.transaction_date.date(), []).append(txn)
        holdings, cash, invested = {}, Decimal(0), Decimal(0)
        current_date = txns.first().transaction_date.date()
        end_date = date.today()
        while current_date <= end_date:
            for txn in txns_by_date.get(current_date, []):
                cash, invested = self._apply_transaction(txn, holdings, cash, invested)
            market_value = self._compute_market_value(holdings, price_map, current_date)
            PortfolioSnapshot.objects.update_or_create(
                user=user, account_id=account_id, date=current_date,
                defaults={
                    'total_value': market_value + cash,
                    'cash_balance': cash,
                    'invested_value': invested,
                },
            )
            current_date += timedelta(days=1)

    def handle(self, *args, **kwargs):
        self.stdout.write("Starting portfolio history backfill...")
        price_map = self._build_price_map()
        self.stdout.write("Price history fetched.")
        for user in User.objects.all():
            account_ids = list(
                PortfolioAccount.objects.filter(user=user).values_list('id', flat=True)
            ) + [None]
            for account_id in account_ids:
                _, account_name = self._resolve_account(account_id)
                if account_name is None:
                    continue  # DoesNotExist — skip
                self.stdout.write(f"Processing User: {user.username}, Account: {account_name}")
                self._backfill_account(user, account_id, account_name, price_map)
        self.stdout.write(self.style.SUCCESS("Backfill complete."))
