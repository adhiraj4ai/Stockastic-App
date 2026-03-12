
from decimal import Decimal
from django.db.models import Sum, F, Q
from ..models.fundamentals import Dividend
from ..models.portfolio import PortfolioTransaction, TransactionType, PortfolioItem, AccountType

class DividendService:
    @staticmethod
    def calculate_dividends(user):
        """
        Calculate total dividends (Cash & Bonus) for a user based on their portfolio history.
        Logic:
        1. Fetch all dividends with a book_close_date.
        2. For each dividend, check if user held shares on (book_close_date - 1 day).
        3. Simple approach: Sum of BUY - SELL before book_close_date.
        4. Calculate amounts.
        """
        dividends = Dividend.objects.filter(book_close_date__isnull=False).order_by('book_close_date')
        
        history = []
        upcoming = []
        total_cash_in = Decimal(0)
        total_bonus_shares = Decimal(0)
        
        # Optimize: Pre-fetch transactions? 
        # For MVP, we iterate. Better: Get all txns, build state day by day.
        # But for "historic dividends", we can just query txns < date.
        
        # Get distinct tickers that had dividends
        dividend_tickers = dividends.values_list('ticker', flat=True).distinct()
        
        # Fetch all user transactions for these tickers
        user_txns = PortfolioTransaction.objects.filter(
            user=user, 
            ticker__in=dividend_tickers
        ).order_by('transaction_date')
        
        # Helper to get holdings at date
        def get_holdings_at_date(ticker, date):
            # Holdings = Buy - Sell (Bonus/Spin-off logic might be needed but simple for now)
            # Actually, we should include Bonus shares received BEFORE this date too if they were credited?
            # Usually Bonus shares are credited much later. 
            # Standard logic: Shares held in Demat on book close eve.
            # We assume Transaction Date is roughly accurate for ownership.
            
            # Filter txns before book close date (strictly less than)
            relevant_txns = [t for t in user_txns if t.ticker == ticker and t.transaction_date.date() < date]
            
            qty = Decimal(0)
            for t in relevant_txns:
                if t.transaction_type in [TransactionType.BUY, TransactionType.BONUS]:
                    qty += t.quantity
                elif t.transaction_type == TransactionType.SELL:
                    qty -= t.quantity
            return max(qty, Decimal(0))

        from django.utils import timezone
        today = timezone.now().date()

        for div in dividends:
            if not div.book_close_date:
                continue
                
            qty_held = get_holdings_at_date(div.ticker, div.book_close_date)
            
            if qty_held > 0:
                # Calculate Cash Dividend
                # Formula: Qty * Face Value (Assume 100) * Cash % / 100
                face_value = Decimal(100) # TODO: Fetch from stock info if different (e.g. 50 for some)
                
                # Tax is usually 5% on Cash Dividend Amount
                gross_cash = (qty_held * face_value * div.cash_percent) / 100
                tax = (gross_cash * Decimal(0.05))
                net_cash = gross_cash - tax
                
                # Calculate Bonus Shares
                bonus_qty = (qty_held * div.bonus_percent) / 100
                
                item = {
                    "id": div.id,
                    "ticker": div.ticker,
                    "fiscal_year": div.fiscal_year,
                    "book_close_date": div.book_close_date,
                    "shares_held": qty_held,
                    "cash_dividend_gross": round(gross_cash, 2),
                    "tax": round(tax, 2),
                    "cash_dividend_net": round(net_cash, 2),
                    "bonus_shares": float(round(bonus_qty, 2)), # Bonus can be fractional mathematically but distributed as whole usually? keeping float.
                    "bonus_percent": div.bonus_percent,
                    "cash_percent": div.cash_percent,
                    "type": "Upcoming" if div.book_close_date > today else "Received"
                }
                
                if div.book_close_date > today:
                    upcoming.append(item)
                else:
                    history.append(item)
                    total_cash_in += net_cash
                    total_bonus_shares += bonus_qty

        # Calculate Yield on Cost
        # Total Cash / Total Current Portfolio Cost? Or Total Cost ever?
        # Usually Yield on Cost = Annual Dividend / Cost Basis.
        # Here we show "Total Lifetime Dividend Yield on Current Invested"
        
        # Get current invested value
        active_items = PortfolioItem.objects.filter(user=user, quantity__gt=0)
        current_invested = Decimal(0)
        for item in active_items:
             current_invested += (item.quantity * item.buy_price)  # This is cost basis
        
        if current_invested == 0:
             current_invested = Decimal(1) # Avoid zero div

        # This is strictly "Realized Cash Yield". Bonus value is unrealized until sold.
        yield_on_cost = (total_cash_in / current_invested) * 100

        # Realized P&L from BUY/SELL transactions on LIVE accounts only
        live_txns = PortfolioTransaction.objects.filter(
            user=user,
            transaction_type__in=[TransactionType.BUY, TransactionType.SELL, TransactionType.BONUS]
        ).filter(
            Q(account__account_type=AccountType.LIVE) | Q(account__isnull=True)
        ).order_by('transaction_date', 'created_at')

        ticker_state = {}
        for txn in live_txns:
            ticker = txn.ticker
            if ticker not in ticker_state:
                ticker_state[ticker] = {
                    'qty': Decimal('0'),
                    'wacc': Decimal('0.00'),
                    'realized_pnl': Decimal('0.00'),
                    'total_sold_qty': 0,
                    'sell_count': 0,
                    'profitable_sells': 0,
                }
            state = ticker_state[ticker]

            if txn.transaction_type == TransactionType.BUY:
                cost = Decimal(txn.quantity) * Decimal(txn.rate) + Decimal(txn.commission) + Decimal(txn.sebon_fee) + Decimal(txn.dp_charge)
                old_val = state['qty'] * state['wacc']
                state['qty'] += txn.quantity
                if state['qty'] > 0:
                    state['wacc'] = (old_val + cost) / state['qty']

            elif txn.transaction_type == TransactionType.BONUS:
                old_val = state['qty'] * state['wacc']
                state['qty'] += txn.quantity
                if state['qty'] > 0:
                    state['wacc'] = old_val / state['qty']

            elif txn.transaction_type == TransactionType.SELL:
                qty = Decimal(txn.quantity)
                sell_proceeds = qty * Decimal(txn.rate)
                cost_basis = qty * state['wacc']
                fees = Decimal(txn.commission) + Decimal(txn.sebon_fee) + Decimal(txn.dp_charge) + Decimal(txn.cgt)
                net_pnl = sell_proceeds - cost_basis - fees
                state['realized_pnl'] += net_pnl
                state['total_sold_qty'] += txn.quantity
                state['sell_count'] += 1
                if net_pnl > 0:
                    state['profitable_sells'] += 1
                state['qty'] = max(Decimal('0'), state['qty'] - qty)

        pnl_per_ticker = []
        total_realized_pnl = Decimal('0')
        for ticker, state in ticker_state.items():
            if state['sell_count'] > 0:
                pnl_per_ticker.append({
                    'ticker': ticker,
                    'realized_pnl': float(round(state['realized_pnl'], 2)),
                    'total_sold_qty': state['total_sold_qty'],
                    'sell_count': state['sell_count'],
                    'profitable_sells': state['profitable_sells'],
                })
                total_realized_pnl += state['realized_pnl']

        pnl_per_ticker.sort(key=lambda x: x['realized_pnl'], reverse=True)

        return {
            "summary": {
                "total_cash_net": float(round(total_cash_in, 2)),
                "total_bonus_shares": float(round(total_bonus_shares, 2)),
                "yield_on_cost": float(round(yield_on_cost, 2)),
                "current_invested": float(round(current_invested, 2)),
                "total_realized_pnl": float(round(total_realized_pnl, 2)),
            },
            "history": sorted(history, key=lambda x: x['book_close_date'], reverse=True),
            "upcoming": sorted(upcoming, key=lambda x: x['book_close_date']),
            "realized_pnl": pnl_per_ticker,
        }
