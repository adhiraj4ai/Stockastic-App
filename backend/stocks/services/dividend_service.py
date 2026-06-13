
from decimal import Decimal
from django.db.models import Sum, F, Q
from ..models.fundamentals import Dividend
from ..models.portfolio import PortfolioTransaction, TransactionType, PortfolioItem, AccountType
from ..constants import (
    FACE_VALUE_PER_SHARE,
    WITHHOLDING_TAX_RATE,
    DIVIDEND_STATUS_UPCOMING,
    DIVIDEND_STATUS_RECEIVED,
    PERCENT_DIVISOR,
)


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
    return Decimal(str(FACE_VALUE_PER_SHARE))


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


def _get_holdings_at_date(user_txns: list, ticker: str, cutoff_date) -> Decimal:
    """Return shares held for *ticker* strictly before *cutoff_date*."""
    qty = Decimal('0')
    for t in user_txns:
        if t.ticker != ticker:
            continue
        if t.transaction_date.date() >= cutoff_date:
            continue
        if t.transaction_type in (TransactionType.BUY, TransactionType.BONUS):
            qty += t.quantity
        elif t.transaction_type == TransactionType.SELL:
            qty -= t.quantity
    return max(qty, Decimal('0'))


def _compute_cash_item(div, qty_held: Decimal, today) -> "dict | None":
    """Return a dividend line-item dict for *div* given *qty_held*, or None."""
    if qty_held <= 0:
        return None
    fv = _face_value(div.ticker)
    gross = qty_held * fv * div.cash_percent / Decimal(PERCENT_DIVISOR)
    tax = gross * Decimal(str(WITHHOLDING_TAX_RATE))
    bonus = int(qty_held * div.bonus_percent / Decimal(PERCENT_DIVISOR))
    status = DIVIDEND_STATUS_UPCOMING if div.book_close_date > today else DIVIDEND_STATUS_RECEIVED
    return {
        "id": div.id, "ticker": div.ticker, "fiscal_year": div.fiscal_year,
        "book_close_date": div.book_close_date, "shares_held": qty_held,
        "cash_dividend_gross": round(gross, 2), "tax": round(tax, 2),
        "cash_dividend_net": round(gross - tax, 2), "bonus_shares": bonus,
        "cash_percent": div.cash_percent, "bonus_percent": div.bonus_percent,
        "type": status,
    }


def _update_ticker_state(state: dict, txn) -> None:
    """Mutate *state* in-place to reflect the effect of *txn* on WACC / realized P&L."""
    if txn.transaction_type == TransactionType.BUY:
        cost = (Decimal(txn.quantity) * Decimal(txn.rate)
                + Decimal(txn.commission) + Decimal(txn.sebon_fee) + Decimal(txn.dp_charge))
        old_val = state['qty'] * state['wacc']
        state['qty'] += Decimal(txn.quantity)
        if state['qty'] > 0:
            state['wacc'] = (old_val + cost) / state['qty']
    elif txn.transaction_type == TransactionType.BONUS:
        old_val = state['qty'] * state['wacc']
        state['qty'] += Decimal(txn.quantity)
        if state['qty'] > 0:
            state['wacc'] = old_val / state['qty']
    elif txn.transaction_type == TransactionType.SELL:
        qty = Decimal(txn.quantity)
        fees = Decimal(txn.commission) + Decimal(txn.sebon_fee) + Decimal(txn.dp_charge) + Decimal(txn.cgt)
        net_pnl = qty * (Decimal(txn.rate) - state['wacc']) - fees
        state['realized_pnl'] += net_pnl
        state['total_sold_qty'] += txn.quantity
        state['sell_count'] += 1
        if net_pnl > 0:
            state['profitable_sells'] += 1
        state['qty'] = max(Decimal('0'), state['qty'] - qty)


def _compute_realized_pnl(user) -> "tuple[list, Decimal]":
    """Replay all LIVE transactions and return (pnl_per_ticker, total_realized_pnl)."""
    live_txns = PortfolioTransaction.objects.filter(
        user=user,
        transaction_type__in=[TransactionType.BUY, TransactionType.SELL, TransactionType.BONUS],
    ).filter(
        Q(account__account_type=AccountType.LIVE) | Q(account__isnull=True)
    ).order_by('transaction_date', 'created_at')

    ticker_state: dict = {}
    for txn in live_txns:
        if txn.ticker not in ticker_state:
            ticker_state[txn.ticker] = {
                'qty': Decimal('0'), 'wacc': Decimal('0.00'),
                'realized_pnl': Decimal('0.00'), 'total_sold_qty': 0,
                'sell_count': 0, 'profitable_sells': 0,
            }
        _update_ticker_state(ticker_state[txn.ticker], txn)

    items = [
        {
            'ticker': t, 'realized_pnl': float(round(s['realized_pnl'], 2)),
            'total_sold_qty': s['total_sold_qty'], 'sell_count': s['sell_count'],
            'profitable_sells': s['profitable_sells'],
        }
        for t, s in ticker_state.items() if s['sell_count'] > 0
    ]
    total = sum((Decimal(str(i['realized_pnl'])) for i in items), Decimal('0'))
    return items, total


def _zero_dividend_totals() -> dict:
    """Return a fresh accumulator dict for dividend summary totals."""
    return {'cash': Decimal('0'), 'bonus': Decimal('0'), 'cost': Decimal('0')}


def _accumulate_dividend(div, item: dict, category: str, user_txns, history, upcoming, totals) -> None:
    """Append *item* to the right bucket and update *totals* for received rows."""
    if category == DIVIDEND_STATUS_UPCOMING:
        upcoming.append(item)
        return
    history.append(item)
    qty_held = item['shares_held']
    totals['cash'] += item['cash_dividend_net']
    totals['bonus'] += item['bonus_shares']
    totals['cost'] += qty_held * _wacc_at_date(user_txns, div.ticker, div.book_close_date)


def _process_dividend_row(div, user_txns, today) -> "tuple[dict | None, str]":
    """Return (item_dict_or_None, category_string) for a single dividend row."""
    qty = _get_holdings_at_date(user_txns, div.ticker, div.book_close_date)
    item = _compute_cash_item(div, qty, today)
    if item is None:
        return None, ""
    return item, item["type"]


def _compute_yield_on_cost(total_cash_net: Decimal, historical_cost: Decimal) -> Decimal:
    """Return yield-on-cost as a percentage, or zero when cost basis is missing."""
    if not historical_cost:
        return Decimal("0")
    return total_cash_net / historical_cost * Decimal(PERCENT_DIVISOR)


def _build_dividend_response(history, upcoming, totals, pnl_per_ticker, total_realized_pnl) -> dict:
    """Assemble the final calculate_dividends response dict."""
    yield_on_cost = _compute_yield_on_cost(totals['cash'], totals['cost'])
    return {
        "summary": {
            "total_cash_net": float(round(totals['cash'], 2)),
            "total_bonus_shares": float(totals['bonus']),
            "yield_on_cost": float(round(yield_on_cost, 2)),
            "historical_cost_basis": float(round(totals['cost'], 2)),
            "current_invested": float(round(totals['cost'], 2)),
            "total_realized_pnl": float(round(total_realized_pnl, 2)),
        },
        "history": sorted(history, key=lambda x: x['book_close_date'], reverse=True),
        "upcoming": sorted(upcoming, key=lambda x: x['book_close_date']),
        "realized_pnl": pnl_per_ticker,
    }


class DividendService:
    @staticmethod
    def calculate_dividends(user):
        """Calculate lifetime cash/bonus dividends and realized P&L for *user*."""
        from django.utils import timezone
        dividends = Dividend.objects.filter(book_close_date__isnull=False).order_by('book_close_date')
        today = timezone.now().date()
        dividend_tickers = dividends.values_list('ticker', flat=True).distinct()
        user_txns = list(PortfolioTransaction.objects.filter(
            user=user, ticker__in=dividend_tickers,
        ).order_by('transaction_date', 'created_at'))

        history, upcoming, totals = [], [], _zero_dividend_totals()
        for div in dividends:
            item, category = _process_dividend_row(div, user_txns, today)
            if item is None:
                continue
            _accumulate_dividend(div, item, category, user_txns, history, upcoming, totals)

        pnl_per_ticker, total_realized_pnl = _compute_realized_pnl(user)
        pnl_per_ticker.sort(key=lambda x: x['realized_pnl'], reverse=True)
        return _build_dividend_response(history, upcoming, totals, pnl_per_ticker, total_realized_pnl)
