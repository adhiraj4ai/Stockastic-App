"""Forward-looking catalyst calendar: book closes and dividend announcements."""
from datetime import date, timedelta

HORIZON_DAYS = 14


def _book_close_items(as_of, end):
    """Yield catalyst dicts for upcoming Dividend book-close dates."""
    from stocks.models import Dividend
    for d in Dividend.objects.filter(book_close_date__gt=as_of, book_close_date__lte=end):
        yield {
            "symbol": d.ticker,
            "type": "BOOK_CLOSE",
            "date": d.book_close_date.isoformat(),
            "days_away": (d.book_close_date - as_of).days,
            "detail": f"{d.fiscal_year}: bonus {d.bonus_percent}% + cash {d.cash_percent}%",
        }


def _dividend_announced_items(as_of, end):
    """Yield catalyst dicts for upcoming FinancialReport dividend announcements."""
    from stocks.models import FinancialReport
    for r in FinancialReport.objects.filter(
        dividend_announced_date__gt=as_of, dividend_announced_date__lte=end
    ):
        yield {
            "symbol": r.ticker,
            "type": "DIVIDEND_ANNOUNCED",
            "date": r.dividend_announced_date.isoformat(),
            "days_away": (r.dividend_announced_date - as_of).days,
            "detail": f"{r.fiscal_year} dividend announcement",
        }


def upcoming_catalysts(as_of=None, horizon_days=HORIZON_DAYS):
    """Catalysts in (as_of, as_of + horizon_days], sorted by date.

    Each item: {symbol, type: BOOK_CLOSE|DIVIDEND_ANNOUNCED, date: iso, days_away, detail}.
    """
    as_of = as_of or date.today()
    end = as_of + timedelta(days=horizon_days)
    out = list(_book_close_items(as_of, end)) + list(_dividend_announced_items(as_of, end))
    out.sort(key=lambda c: (c["date"], c["symbol"]))
    return out
