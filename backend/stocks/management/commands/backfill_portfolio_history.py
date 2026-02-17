
from django.core.management.base import BaseCommand
from django.contrib.auth.models import User
from stocks.models import PortfolioAccount, PortfolioTransaction, PortfolioSnapshot, DailyStockPrice
from stocks.models.portfolio import TransactionType
from decimal import Decimal
from datetime import timedelta, date

class Command(BaseCommand):
    help = 'Backfills portfolio snapshot history based on transactions'

    def handle(self, *args, **kwargs):
        self.stdout.write("Starting portfolio history backfill...")
        
        users = User.objects.all()
        
        # Pre-fetch all price history to avoid N+1 queries
        self.stdout.write("Fetching price history...")
        all_prices = DailyStockPrice.objects.values('ticker', 'date', 'close').order_by('date')
        price_map = {}
        for p in all_prices:
            if p['ticker'] not in price_map:
                price_map[p['ticker']] = {}
            price_map[p['ticker']][p['date']] = p['close']
        
        self.stdout.write("Price history fetched.")

        for user in users:
            accounts = PortfolioAccount.objects.filter(user=user)
            # Also handle "No Account" transactions (account=None)
            account_ids = list(accounts.values_list('id', flat=True)) + [None]
            
            for account_id in account_ids:
                if account_id:
                    try:
                        account = PortfolioAccount.objects.get(id=account_id)
                        account_name = account.name
                    except PortfolioAccount.DoesNotExist:
                        continue
                else:
                    account = None
                    account_name = "Unassigned"
                    
                self.stdout.write(f"Processing User: {user.username}, Account: {account_name}")
                
                # Fetch transactions
                txns = PortfolioTransaction.objects.filter(user=user, account_id=account_id).order_by('transaction_date')
                
                if not txns.exists():
                    continue
                    
                # Date range
                start_date = txns.first().transaction_date.date()
                end_date = date.today()
                
                # State
                holdings = {} # {ticker: quantity}
                cash = Decimal(0)
                invested = Decimal(0)
                
                # Group transactions by date
                txns_by_date = {}
                for txn in txns:
                    d = txn.transaction_date.date()
                    if d not in txns_by_date:
                        txns_by_date[d] = []
                    txns_by_date[d].append(txn)
                    
                # Iterate day by day
                current_date = start_date
                while current_date <= end_date:
                    # 1. Apply Transactions for this day
                    day_txns = txns_by_date.get(current_date, [])
                    for txn in day_txns:
                        amount = txn.amount
                        commission = txn.commission
                        sebon = txn.sebon_fee
                        dp = txn.dp_charge
                        cgt = txn.cgt
                        
                        total_outflow = amount + commission + sebon + dp
                        net_inflow = amount - commission - sebon - dp - cgt
                        
                        if txn.transaction_type == TransactionType.BUY:
                            holdings[txn.ticker] = holdings.get(txn.ticker, 0) + txn.quantity
                            cash -= total_outflow
                            invested += total_outflow 
                            
                        elif txn.transaction_type == TransactionType.SELL:
                            holdings[txn.ticker] = holdings.get(txn.ticker, 0) - txn.quantity
                            if holdings[txn.ticker] <= 0:
                                if txn.ticker in holdings:
                                    del holdings[txn.ticker]
                            cash += net_inflow
                            
                        elif txn.transaction_type == TransactionType.BONUS:
                             holdings[txn.ticker] = holdings.get(txn.ticker, 0) + txn.quantity
                    
                    # 2. Calculate Portfolio Value
                    current_market_value = Decimal(0)
                    
                    for ticker, qty in holdings.items():
                        # Find price for this date
                        price = None
                        if price_map.get(ticker):
                            price = price_map[ticker].get(current_date)
                            if not price:
                                # Look back up to 7 days
                                lookback = 1
                                while lookback <= 7:
                                    prev = current_date - timedelta(days=lookback)
                                    price = price_map[ticker].get(prev)
                                    if price: break
                                    lookback += 1
                                    
                        if price:
                            current_market_value += Decimal(qty) * Decimal(price)
                    
                    total_portfolio_value = current_market_value + cash
                    
                    # Create/Update Snapshot
                    PortfolioSnapshot.objects.update_or_create(
                        user=user,
                        account_id=account_id,
                        date=current_date,
                        defaults={
                            'total_value': total_portfolio_value,
                            'cash_balance': cash,
                            'invested_value': invested, 
                        }
                    )
                    
                    current_date += timedelta(days=1)
                    
        self.stdout.write(self.style.SUCCESS("Backfill complete."))
