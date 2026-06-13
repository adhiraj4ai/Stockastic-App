# backend/stocks/services/universe.py
"""The research universe: which symbols are valid subjects as of a date.

Uses Company.all_objects (NOT the default EquityManager, which filters to
currently-active and is therefore survivorship-biased) and subtracts
DelistingRecord entries dated on/before the as-of date.
"""

__all__ = ["research_universe", "NON_EQUITY_INSTRUMENTS"]

NON_EQUITY_INSTRUMENTS = [
    'Mutual Funds',
    'Mutual Fund',
    'Non-Convertible Debentures',
    'Corporate Debentures',
    'Debentures',
]


def research_universe(as_of=None):
    """Set of equity symbols researchable as of ``as_of`` (None = today).

    Includes inactive/delisted companies whose delisting postdates ``as_of``
    so backtest universes and event studies don't silently drop losers.
    """
    from django.utils import timezone
    from stocks.models import Company, DelistingRecord

    as_of = as_of or timezone.now().date()
    symbols = set(
        Company.all_objects.exclude(instrument_type__in=NON_EQUITY_INSTRUMENTS)
        .values_list('symbol', flat=True)
    )
    delisted = set(
        DelistingRecord.objects.filter(delisted_date__lte=as_of)
        .values_list('symbol', flat=True)
    )
    return symbols - delisted
