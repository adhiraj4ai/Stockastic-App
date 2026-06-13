from __future__ import annotations
import datetime
from typing import Optional
from django.db.models import Count, Sum, Max, Min
from ..models import DailyStockPrice, Company


def fetch_latest_date() -> Optional[datetime.date]:
    """Return the most recent trading date that has >10 price entries."""
    row = (
        DailyStockPrice.objects
        .values('date')
        .annotate(count=Count('ticker'))
        .filter(count__gt=10)
        .order_by('-date')
        .first()
    )
    return row['date'] if row else None


def fetch_previous_date(latest: datetime.date) -> Optional[datetime.date]:
    """Return the trading day immediately before latest."""
    row = (
        DailyStockPrice.objects
        .filter(date__lt=latest)
        .values('date')
        .annotate(count=Count('ticker'))
        .filter(count__gt=10)
        .order_by('-date')
        .first()
    )
    return row['date'] if row else None


def resolve_ref_date(range_type: str, latest: datetime.date) -> Optional[datetime.date]:
    """Return reference date for weekly/monthly ranges; None for daily."""
    if range_type == 'daily':
        return None
    offsets = {'weekly': 7, 'monthly': 30}
    delta = offsets.get(range_type)
    if not delta:
        return None
    target = latest - datetime.timedelta(days=delta)
    row = (
        DailyStockPrice.objects
        .filter(date__lte=target)
        .values('date')
        .annotate(count=Count('ticker'))
        .filter(count__gt=10)
        .order_by('-date')
        .first()
    )
    return row['date'] if row else None


def build_sector_map() -> dict:
    """Return {symbol: sector} for all companies."""
    return {c.symbol: c.sector for c in Company.objects.all()}


def fetch_ref_aggregates(ref_date: datetime.date, latest: datetime.date) -> dict:
    """Return per-ticker aggregates (vol, turnover, high, low) between ref and latest."""
    aggs = (
        DailyStockPrice.objects
        .filter(date__gt=ref_date, date__lte=latest)
        .values('ticker')
        .annotate(
            total_vol=Sum('volume'),
            total_turn=Sum('turnover'),
            max_high=Max('high'),
            min_low=Min('low'),
        )
    )
    return {a['ticker']: a for a in aggs}


def aggregate_sectors(prices, sector_map: dict) -> dict:
    """Group prices by sector and compute aggregate stats."""
    sectors: dict = {}
    for p in prices:
        sector = sector_map.get(p.ticker, 'Unknown')
        if sector not in sectors:
            sectors[sector] = {'count': 0, 'volume': 0, 'turnover': 0}
        sectors[sector]['count'] += 1
        sectors[sector]['volume'] += int(p.volume or 0)
        sectors[sector]['turnover'] += float(p.turnover or 0)
    return sectors


def build_market_status(latest: datetime.date) -> dict:
    """Return lightweight market status dict."""
    is_today = latest == datetime.date.today()
    return {
        'date': latest,
        'status': 'OPEN' if is_today else 'CLOSED',
        'is_active': is_today,
    }
