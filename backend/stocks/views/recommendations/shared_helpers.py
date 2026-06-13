"""
Shared helper utilities for recommendation engines.
These are module-level functions used across multiple engine classes.
"""
import logging
from datetime import datetime, timedelta
from typing import Dict, List, Optional

import pandas as pd

from ...models import DailyStockPrice, DailyCumulativeAccumulation, Company

logger = logging.getLogger(__name__)

RECENT_EPISODE_GRACE_DAYS = 5


def _latest_price_date(symbol: str):
    """Return the most recent price date for `symbol`, or None."""
    return (
        DailyStockPrice.objects.filter(ticker=symbol)
        .order_by('-date')
        .values_list('date', flat=True)
        .first()
    )


def _should_backfill(recent_episode, symbol: str) -> bool:
    """Decide whether a fresh backfill is needed for the symbol's history."""
    if not recent_episode:
        return True
    latest_price_date = _latest_price_date(symbol)
    if latest_price_date and recent_episode.start_date >= (
        latest_price_date - timedelta(days=RECENT_EPISODE_GRACE_DAYS)
    ):
        return False
    return True


def _resolve_raw_history(engine, source: str, symbol: str) -> List[Dict]:
    """Return raw history, backfilling via the engine when episodes are stale."""
    from ...models import SignalEpisode

    recent_episode = SignalEpisode.objects.filter(
        source=source, symbol=symbol
    ).order_by("-start_date").first()

    if _should_backfill(recent_episode, symbol):
        return engine.execute_history(symbol)
    return engine.get_history_from_db(symbol)


def _fetch_company_metadata(symbol: str):
    """Return (name, sector) for the symbol, falling back to defaults."""
    try:
        company = Company.objects.get(symbol=symbol)
        return company.name, company.sector
    except Company.DoesNotExist:
        return symbol, "Unknown"


def _fetch_current_price(symbol: str) -> float:
    """Return the latest close price for the symbol, or 0.0."""
    latest_price_obj = (
        DailyStockPrice.objects.filter(ticker=symbol).order_by('-date').first()
    )
    return float(latest_price_obj.close) if latest_price_obj else 0.0


def _apply_pnl_to_sell(new_record: Dict, price: float, last_buy_price) -> None:
    """Fill PnL fields on a SELL record relative to the prior BUY price."""
    if last_buy_price:
        pnl_amount = price - last_buy_price
        new_record['pnl_amount'] = round(pnl_amount, 2)
        new_record['pnl_percent'] = round((pnl_amount / last_buy_price) * 100, 2)
    else:
        new_record['pnl_amount'] = 0
        new_record['pnl_percent'] = 0


def _enrich_history_with_pnl(raw_history: List[Dict]) -> List[Dict]:
    """Compute per-cycle PnL on buy/sell pairs, returned newest-first."""
    history_asc = sorted(raw_history, key=lambda x: x['date'])
    last_buy_price = None
    enriched_history = []
    for record in history_asc:
        new_record = record.copy()
        if record['signal'] == 'BUY':
            last_buy_price = record['price']
        elif record['signal'] == 'SELL':
            _apply_pnl_to_sell(new_record, record['price'], last_buy_price)
            last_buy_price = None
        enriched_history.append(new_record)
    enriched_history.reverse()
    return enriched_history


def _latest_comprehensive_acc_date(date_counts):
    """Return most recent date with >100 symbols, else the absolute latest."""
    for d in date_counts:
        if d['count'] > 100:
            return d['transaction_date']
    return date_counts[0]['transaction_date'] if date_counts else None


def _accumulated_symbol_universe(threshold: int, sector: Optional[str]):
    """Return (symbols, latest_acc_date) for accumulated stocks over a threshold."""
    from django.db.models import Count

    date_counts = (
        DailyCumulativeAccumulation.objects.values('transaction_date')
        .annotate(count=Count('symbol', distinct=True))
        .order_by('-transaction_date')
    )

    latest_acc_date = _latest_comprehensive_acc_date(date_counts)
    if not latest_acc_date:
        return set(), None

    symbols = set(
        DailyCumulativeAccumulation.objects.filter(
            transaction_date=latest_acc_date,
            cumulative_net__gt=threshold
        ).values_list('symbol', flat=True)
    )
    if sector and sector != 'All':
        sector_symbols = set(
            Company.objects.filter(sector=sector).values_list('symbol', flat=True)
        )
        symbols = symbols.intersection(sector_symbols)
    return symbols, latest_acc_date


def _parse_target_date(transaction_date):
    """Parse a YYYY-MM-DD string into a date, or None on failure/absence."""
    if not transaction_date:
        return None
    try:
        return datetime.strptime(transaction_date, '%Y-%m-%d').date()
    except (ValueError, TypeError):
        return None


def _load_symbol_ohlcv(symbol: str, start_date):
    """Load a date-indexed OHLCV dataframe for a symbol from start_date onward."""
    qs = DailyStockPrice.objects.filter(
        ticker=symbol, date__gte=start_date
    ).order_by('date').values('date', 'close', 'high', 'low', 'volume')
    df = pd.DataFrame(list(qs))
    if not df.empty:
        df['date'] = pd.to_datetime(df['date'])
        df.set_index('date', inplace=True)
    return df


def _select_analysis_row(df: pd.DataFrame, target_date_obj):
    """Return the target-date (or last) row, or None if unavailable."""
    if target_date_obj:
        try:
            return df.loc[df.index <= pd.Timestamp(target_date_obj)].iloc[-1]
        except IndexError:
            return None
    return df.iloc[-1]


def _build_history_response(symbol: str, raw_history: List[Dict]) -> Dict:
    """Assemble the enriched history response payload for a symbol."""
    company_name, sector = _fetch_company_metadata(symbol)
    return {
        'symbol': symbol,
        'name': company_name,
        'sector': sector,
        'current_price': _fetch_current_price(symbol),
        'history': _enrich_history_with_pnl(raw_history),
    }
