
from decimal import Decimal
from django.db.models import Sum, F, Q
from ..models.fundamentals import Dividend
from ..models.portfolio import PortfolioTransaction, TransactionType, PortfolioItem, AccountType


# ---------------------------------------------------------------------------
# Face-value helper
# ---------------------------------------------------------------------------

def _face_value(ticker: str) -> Decimal:
    """Return the par/face value for *ticker* in NPR.

    NEPSE standard is Rs. 100 per share.  No per-stock par-value field exists
    in StockFundamental or Company as of this writing, so we always return 100.
    When a face_value column is added to the DB, add the lookup here.

    Finding: StockFundamental and Company models were inspected (2026-06-10).
    Neither contains a face_value / par_value field — this helper is the
    single place to add that lookup when the data becomes available.
    """
    # Future: try StockFundamental.objects.filter(ticker=ticker).values_list('face_value', flat=True).first()
    return Decimal('100')


# ---------------------------------------------------------------------------
# FinancialReport → Dividend sync
# ---------------------------------------------------------------------------

def _normalize_fiscal_year(fy: str) -> str:
    """Normalize '080-081' / '080/081' to the canonical '2080/2081' used by
    fetch_dividends, so syncing from financial reports updates the scraper's
    rows instead of duplicating them under a second format."""
    parts = fy.replace('-', '/').split('/')
    if len(parts) != 2:
        return fy
    parts = [p if len(p) == 4 else f'2{p.zfill(3)}' for p in parts]
    return f'{parts[0]}/{parts[1]}'


def sync_dividends_from_financials(ticker=None):
    """Upsert Dividend rows from the dividend fields on ANNUAL FinancialReports.

    Zero-dividend years are skipped and an existing book_close_date is never
    wiped by a report that lacks one (both match the fetch_dividends
    conventions). Returns (created, updated).
    """
    from ..models import FinancialReport

    qs = FinancialReport.objects.filter(report_type='ANNUAL').exclude(
        bonus_share__isnull=True, cash_dividend__isnull=True,
    )
    if ticker:
        qs = qs.filter(ticker=ticker)

    created = updated = 0
    for report in qs:
        bonus = report.bonus_share or Decimal('0')
        cash = report.cash_dividend or Decimal('0')
        if bonus == 0 and cash == 0:
            continue
        defaults = {
            'bonus_percent': bonus,
            'cash_percent': cash,
            'total_percent': bonus + cash,
        }
        if report.dividend_book_close_date:
            defaults['book_close_date'] = report.dividend_book_close_date
        _, was_created = Dividend.objects.update_or_create(
            ticker=report.ticker,
            fiscal_year=_normalize_fiscal_year(report.fiscal_year),
            defaults=defaults,
        )
        created += was_created
        updated += not was_created
    return created, updated


# ---------------------------------------------------------------------------
# WACC-replay helper (mirrors the P&L replay in DividendService but is
# scoped to a single ticker and stops at *cutoff_date*)
# ---------------------------------------------------------------------------

def _wacc_at_date(user_txns, ticker: str, cutoff_date) -> Decimal:
    """Return the WACC for *ticker* built from *user_txns* up to (but not
    including) *cutoff_date* (a date object, compared against
    transaction_date.date()).

    Uses the same WACC-update rules as the realized P&L replay:
      BUY  → weighted-average in new shares
      BONUS → dilute WACC (no cost added for bonus shares)
      SELL  → reduce qty, WACC unchanged

    Returns Decimal('0') if no shares were ever bought before the cutoff.
    """
    qty = Decimal('0')
    wacc = Decimal('0')

    for t in user_txns:
        if t.ticker != ticker:
            continue
        if t.transaction_date.date() >= cutoff_date:
            continue

        if t.transaction_type == TransactionType.BUY:
            cost = (
                Decimal(t.quantity) * Decimal(t.rate)
                + Decimal(t.commission)
                + Decimal(t.sebon_fee)
                + Decimal(t.dp_charge)
            )
            old_val = qty * wacc
            qty += Decimal(t.quantity)
            if qty > 0:
                wacc = (old_val + cost) / qty

        elif t.transaction_type == TransactionType.BONUS:
            old_val = qty * wacc
            qty += Decimal(t.quantity)
            if qty > 0:
                wacc = old_val / qty  # bonus dilutes WACC

        elif t.transaction_type == TransactionType.SELL:
            qty = max(Decimal('0'), qty - Decimal(t.quantity))
            # WACC stays the same after a sell

    return wacc


class DividendService:
    @staticmethod
    def calculate_dividends(user):
        """
        Calculate total dividends (Cash & Bonus) for a user based on their portfolio history.
        Logic:
        1. Fetch all dividends with a book_close_date.
        2. For each dividend, check if user held shares on (book_close_date - 1 day).
        3. Simple approach: Sum of BUY - BONUS - SELL before book_close_date.
        4. Calculate amounts using per-stock face value and floored bonus quantities.
        5. Yield-on-cost denominator uses the historical cost basis at each book-close
           (qty_held × wacc_as_of_close), NOT the current portfolio cost basis.
        """
        dividends = Dividend.objects.filter(book_close_date__isnull=False).order_by('book_close_date')

        history = []
        upcoming = []
        total_cash_in = Decimal(0)
        total_bonus_shares = Decimal(0)

        # Get distinct tickers that had dividends
        dividend_tickers = dividends.values_list('ticker', flat=True).distinct()

        # Fetch all user transactions for these tickers (used by both helpers)
        user_txns = list(PortfolioTransaction.objects.filter(
            user=user,
            ticker__in=dividend_tickers
        ).order_by('transaction_date', 'created_at'))

        # Helper to get holdings at date
        def get_holdings_at_date(ticker, date):
            # Holdings = Buy + Bonus - Sell strictly before book_close_date.
            # Transaction Date is treated as approximately the ownership date.
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

        # Accumulate historical cost basis across all past dividend events for yield calc.
        # historical_cost_basis = Σ (qty_held_at_close × wacc_as_of_close) per dividend.
        historical_cost_basis = Decimal(0)

        for div in dividends:
            if not div.book_close_date:
                continue

            qty_held = get_holdings_at_date(div.ticker, div.book_close_date)

            if qty_held > 0:
                # --- Cash dividend ---
                # Formula: Qty × Face Value × Cash% / 100
                # Uses per-stock face value (currently always 100 for NEPSE;
                # see _face_value() to add a real lookup when DB data available).
                fv = _face_value(div.ticker)
                gross_cash = (qty_held * fv * div.cash_percent) / 100
                tax = gross_cash * Decimal('0.05')  # standard 5% withholding
                net_cash = gross_cash - tax

                # --- Bonus shares ---
                # floored: quantity is IntegerField; fractional bonus shares unsupported
                # (tracked follow-up — true fractional share support requires a schema change)
                bonus_qty = int((qty_held * div.bonus_percent) / 100)

                item = {
                    "id": div.id,
                    "ticker": div.ticker,
                    "fiscal_year": div.fiscal_year,
                    "book_close_date": div.book_close_date,
                    "shares_held": qty_held,
                    "cash_dividend_gross": round(gross_cash, 2),
                    "tax": round(tax, 2),
                    "cash_dividend_net": round(net_cash, 2),
                    "bonus_shares": bonus_qty,
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

                    # Accumulate historical cost basis for yield denominator.
                    # We use wacc_as_of_close so that early cheap buys and late
                    # expensive buys are each weighted correctly per event.
                    wacc_at_close = _wacc_at_date(user_txns, div.ticker, div.book_close_date)
                    historical_cost_basis += qty_held * wacc_at_close

        # --- Yield on cost (historical basis) ---
        # Numerator : total net cash dividends received (lifetime)
        # Denominator: sum over all past dividend events of (qty_held_at_close × wacc_as_of_close)
        # This correctly attributes each cash receipt to the cost basis that actually earned it.
        if historical_cost_basis > 0:
            yield_on_cost = (total_cash_in / historical_cost_basis) * 100
        else:
            yield_on_cost = Decimal(0)

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
                "total_bonus_shares": float(total_bonus_shares),
                "yield_on_cost": float(round(yield_on_cost, 2)),
                "historical_cost_basis": float(round(historical_cost_basis, 2)),
                # Backward-compatible alias: the frontend (DividendIncome.tsx) reads
                # `current_invested`. The value is now the historical cost basis
                # (cost of the shares that earned the dividends), not current holdings.
                "current_invested": float(round(historical_cost_basis, 2)),
                "total_realized_pnl": float(round(total_realized_pnl, 2)),
            },
            "history": sorted(history, key=lambda x: x['book_close_date'], reverse=True),
            "upcoming": sorted(upcoming, key=lambda x: x['book_close_date']),
            "realized_pnl": pnl_per_ticker,
        }
