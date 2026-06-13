from rest_framework.decorators import action
from rest_framework.response import Response
from decimal import Decimal

from ...models import PortfolioTransaction, TransactionType


def get_fy(dt):
    """Return Nepal fiscal year string for a date (mid-July boundary)."""
    if dt.month > 7 or (dt.month == 7 and dt.day >= 16):
        return f"{dt.year}/{str(dt.year + 1)[2:]}"
    return f"{dt.year - 1}/{str(dt.year)[2:]}"


class TaxReportMixin:
    """Mixin that adds the tax_report action to PortfolioTransactionViewSet."""

    @action(detail=False, methods=['get'])
    def tax_report(self, request):
        user = request.user
        account_id = request.query_params.get('account', 'all')
        all_txns = self._fetch_ordered_txns(user, account_id)
        ticker_state, annual_summary = self._process_transactions(all_txns)
        return Response(self._format_results(annual_summary))

    def _fetch_ordered_txns(self, user, account_id):
        qs = PortfolioTransaction.objects.filter(user=user).order_by('transaction_date', 'created_at')
        if account_id != 'all':
            qs = qs.filter(account_id=account_id)
        return qs

    def _process_transactions(self, all_txns):
        ticker_state = {}
        annual_summary = {}
        for txn in all_txns:
            ticker = txn.ticker
            if ticker not in ticker_state:
                ticker_state[ticker] = {'qty': 0, 'wacc': Decimal('0.00')}
            self._apply_transaction(txn, ticker_state[ticker], annual_summary)
        return ticker_state, annual_summary

    def _apply_transaction(self, txn, state, annual_summary):
        if txn.transaction_type == TransactionType.BUY:
            self._apply_buy(txn, state)
        elif txn.transaction_type == TransactionType.BONUS:
            self._apply_bonus(txn, state)
        elif txn.transaction_type == TransactionType.SELL:
            self._apply_sell(txn, state, annual_summary)

    def _apply_buy(self, txn, state):
        cost = (
            Decimal(txn.quantity) * Decimal(txn.rate)
            + Decimal(txn.commission) + Decimal(txn.sebon_fee) + Decimal(txn.dp_charge)
        )
        old_val = Decimal(state['qty']) * state['wacc']
        state['qty'] += txn.quantity
        if state['qty'] > 0:
            state['wacc'] = (old_val + cost) / Decimal(state['qty'])

    def _apply_bonus(self, txn, state):
        old_val = Decimal(state['qty']) * state['wacc']
        state['qty'] += txn.quantity
        if state['qty'] > 0:
            state['wacc'] = old_val / Decimal(state['qty'])

    def _apply_sell(self, txn, state, annual_summary):
        sell_proceeds = Decimal(txn.quantity) * Decimal(txn.rate)
        cost_basis = Decimal(txn.quantity) * state['wacc']
        net_pnl = (
            sell_proceeds - cost_basis
            - Decimal(txn.commission) - Decimal(txn.sebon_fee)
            - Decimal(txn.dp_charge) - Decimal(txn.cgt)
        )
        fy = get_fy(txn.transaction_date.date())
        if fy not in annual_summary:
            annual_summary[fy] = {
                'realized_pnl': Decimal('0.00'),
                'cgt_paid': Decimal('0.00'),
                'trades_count': 0,
                'ticker_details': {},
            }
        self._accumulate_fy(annual_summary[fy], txn.ticker, net_pnl, txn.cgt)
        state['qty'] -= txn.quantity

    def _accumulate_fy(self, fy_data, ticker, net_pnl, cgt):
        fy_data['realized_pnl'] += net_pnl
        fy_data['cgt_paid'] += Decimal(cgt)
        fy_data['trades_count'] += 1
        fy_data['ticker_details'][ticker] = (
            fy_data['ticker_details'].get(ticker, Decimal('0.00')) + net_pnl
        )

    def _format_results(self, annual_summary):
        results = [self._format_fy_entry(fy, data) for fy, data in annual_summary.items()]
        results.sort(key=lambda x: x['fiscal_year'], reverse=True)
        return results

    def _format_fy_entry(self, fy, data):
        top_gainers = sorted(
            [{'ticker': t, 'pnl': round(float(p), 2)} for t, p in data['ticker_details'].items()],
            key=lambda x: x['pnl'], reverse=True,
        )[:5]
        return {
            'fiscal_year': fy,
            'realized_pnl': round(float(data['realized_pnl']), 2),
            'cgt_paid': round(float(data['cgt_paid']), 2),
            'trades_count': data['trades_count'],
            'top_gainers': top_gainers,
        }
