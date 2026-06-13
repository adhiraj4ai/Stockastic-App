"""Private helper: broker accumulation for a ticker across multiple time ranges."""
import datetime

from django.db.models import Sum, Max

from ...models import DailyFloorsheet

_RANGES = {'1D': 1, '1W': 7, '1M': 30, '3M': 90, '6M': 180, '1Y': 365, '2Y': 730, 'AT': -1}


def _build_regular_range_data(ticker, label, days, latest_date):
    """Aggregate buyers and sellers for a regular (non-AT) date range."""
    start_date = latest_date if label == '1D' else latest_date - datetime.timedelta(days=days)
    base_qs = DailyFloorsheet.objects.filter(
        symbol=ticker,
        transaction_date__gte=start_date,
        transaction_date__lte=latest_date,
    )
    buyers = base_qs.values('buyer_id').annotate(
        qty=Sum('transaction_quantity'), amount=Sum('transaction_amount')
    ).order_by('-qty')[:5]
    sellers = base_qs.values('seller_id').annotate(
        qty=Sum('transaction_quantity'), amount=Sum('transaction_amount')
    ).order_by('-qty')[:5]
    range_data = []
    for b in buyers:
        wac = float(b['amount'] / b['qty']) if b['qty'] > 0 else 0
        range_data.append({'broker': str(b['buyer_id']), 'qty': int(b['qty']), 'wac': round(wac, 2), 'type': 'BUY'})
    for s in sellers:
        wac = float(s['amount'] / s['qty']) if s['qty'] > 0 else 0
        range_data.append({'broker': str(s['seller_id']), 'qty': int(s['qty']), 'wac': round(wac, 2), 'type': 'SELL'})
    return range_data


def _build_alltime_range_data(ticker, latest_date):
    """Fetch all-time cumulative accumulation from DailyCumulativeAccumulation."""
    from ...models import DailyCumulativeAccumulation
    latest_cum_date = (
        DailyCumulativeAccumulation.objects.filter(symbol=ticker)
        .aggregate(Max('transaction_date'))['transaction_date__max'] or latest_date
    )
    buyers = DailyCumulativeAccumulation.objects.filter(
        symbol=ticker, transaction_date=latest_cum_date
    ).order_by('-cumulative_buy')[:5]
    sellers = DailyCumulativeAccumulation.objects.filter(
        symbol=ticker, transaction_date=latest_cum_date
    ).order_by('-cumulative_sell')[:5]
    range_data = []
    for b in buyers:
        wac = float(b.cumulative_buy_amount / b.cumulative_buy) if b.cumulative_buy > 0 else 0
        range_data.append({'broker': str(b.entity_id), 'qty': int(b.cumulative_buy), 'wac': round(wac, 2), 'type': 'BUY'})
    for s in sellers:
        wac = float(s.cumulative_sell_amount / s.cumulative_sell) if s.cumulative_sell > 0 else 0
        range_data.append({'broker': str(s.entity_id), 'qty': int(s.cumulative_sell), 'wac': round(wac, 2), 'type': 'SELL'})
    return range_data


def _get_broker_accumulation(ticker):
    """Calculate top buyers/sellers for multiple time ranges on the fly."""
    latest_fs = DailyFloorsheet.objects.filter(symbol=ticker).order_by('-transaction_date').first()
    if not latest_fs:
        return {}
    latest_date = latest_fs.transaction_date
    results = {}
    for label, days in _RANGES.items():
        if label == 'AT':
            results[label] = _build_alltime_range_data(ticker, latest_date)
        else:
            results[label] = _build_regular_range_data(ticker, label, days, latest_date)
    return results
