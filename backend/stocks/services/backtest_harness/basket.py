"""The evaluation basket — a pinned, sector-diverse set of liquid NEPSE tickers.

Acceptance is measured across this basket (not a single cherry-picked stock) so
results generalize and overfitting is harder to hide. The list is *pinned* so a
before/after comparison is apples-to-apples.

Derivation (run once, see plan): tickers with >= 750 daily price rows, ranked by
average volume, then the most-liquid names per ``Company.sector`` were taken with
a >= 1375-day history floor for clean multi-year backtests.
"""

__all__ = ["DEFAULT_BASKET", "load_basket", "derive_basket"]

DEFAULT_BASKET = [
    # Commercial Banks
    "NABIL", "KBL", "PRVU", "GBIME",
    # Hydro Power
    "NGPL", "API", "UPPER", "NHPC", "AHPC",
    # Investment
    "HIDCL", "NIFRA", "NRN",
    # Development Banks
    "JBBL", "MLBL",
    # Finance
    "NFS",
    # Microfinance
    "FMDBL", "CBBL",
    # Life / Non-Life Insurance
    "NLIC", "IGI",
    # Manufacturing
    "SHIVM", "HDL",
    # Hotels & Tourism
    "SHL",
    # Others (telecom / re-insurance)
    "NTC", "NRIC",
]


def load_basket(names=None, min_bars=200):
    """Validate that basket tickers have enough price history; return the usable ones.

    Logs (returns) which tickers were dropped so a thin basket is never silently
    treated as full coverage.
    """
    from stocks.models import DailyStockPrice

    names = list(names) if names else list(DEFAULT_BASKET)
    usable, dropped = [], []
    for t in names:
        n = DailyStockPrice.objects.filter(ticker=t).count()
        if n >= min_bars:
            usable.append(t)
        else:
            dropped.append((t, n))
    return usable, dropped


def derive_basket(per_sector=2, min_bars=1375):
    """Re-derive a diverse basket from current data (used to refresh the pin).

    Not called at runtime — kept so the pinned DEFAULT_BASKET is reproducible.
    """
    from collections import defaultdict
    from django.db.models import Count, Avg
    from stocks.models import Company, DailyStockPrice

    vol = {
        r["ticker"]: r["avgvol"]
        for r in DailyStockPrice.objects.values("ticker")
        .annotate(n=Count("id"), avgvol=Avg("volume"))
        .filter(n__gte=min_bars)
    }
    by_sector = defaultdict(list)
    for c in Company.objects.all():
        if c.symbol in vol:
            by_sector[c.sector].append((c.symbol, vol[c.symbol] or 0))
    basket = []
    for sector in sorted(by_sector):
        top = sorted(by_sector[sector], key=lambda x: -x[1])[:per_sector]
        basket.extend(t[0] for t in top)
    return basket
