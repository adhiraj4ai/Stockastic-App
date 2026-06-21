from django.db.models import Q
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from ...models import Dividend, FinancialReport
from ...utils import normalize_fiscal_year


def _build_report_entry(report):
    """Build a dividend result dict from a FinancialReport row."""
    bonus = float(report.bonus_share or 0)
    cash = float(report.cash_dividend or 0)
    return {
        'fiscal_year': normalize_fiscal_year(report.fiscal_year),
        'bonus_percent': bonus,
        'cash_percent': cash,
        'total_percent': bonus + cash,
        'date': report.dividend_announced_date,
        'announced_date': report.dividend_announced_date,
        'book_close_date': report.dividend_book_close_date,
    }


def _build_dividend_entry(d):
    """Build a dividend result dict from a Dividend model row."""
    return {
        'fiscal_year': normalize_fiscal_year(d.fiscal_year),
        'bonus_percent': float(d.bonus_percent),
        'cash_percent': float(d.cash_percent),
        'total_percent': float(d.total_percent),
        'date': d.book_close_date,
        'announced_date': None,
        'book_close_date': d.book_close_date,
    }


def _collect_financial_dividends(ticker):
    """Return (results, seen_fy) from FinancialReport, de-duplicated by fiscal year."""
    financial_dividends = FinancialReport.objects.filter(ticker=ticker).filter(
        Q(bonus_share__gt=0) | Q(cash_dividend__gt=0)
        | Q(dividend_announced_date__isnull=False)
        | Q(dividend_book_close_date__isnull=False)
    ).order_by('-fiscal_year', '-quarter')
    results, seen_fy = [], set()
    for report in financial_dividends:
        norm_fy = normalize_fiscal_year(report.fiscal_year)
        if norm_fy in seen_fy:
            continue
        results.append(_build_report_entry(report))
        seen_fy.add(norm_fy)
    return results, seen_fy


def _append_legacy_dividends(ticker, results, seen_fy):
    """Append legacy Dividend model rows not already in seen_fy."""
    dividend_objs = Dividend.objects.filter(ticker=ticker).order_by('-fiscal_year')
    for d in dividend_objs:
        norm_fy = normalize_fiscal_year(d.fiscal_year)
        if norm_fy not in seen_fy:
            results.append(_build_dividend_entry(d))
            seen_fy.add(norm_fy)


@api_view(['GET'])
@permission_classes([AllowAny])
def stock_dividends(request, ticker):
    results, seen_fy = _collect_financial_dividends(ticker)
    _append_legacy_dividends(ticker, results, seen_fy)
    results.sort(key=lambda x: x['fiscal_year'], reverse=True)
    return Response(results)

