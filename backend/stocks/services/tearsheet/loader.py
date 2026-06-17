from __future__ import annotations

from stocks.models import Company, Dividend, FinancialReport
from stocks.utils import normalize_fiscal_year

from .schemas import RawStockInfo

_REPORT_SCALARS = ("paid_up_capital", "reserves_and_surplus", "revenue",
                   "operating_profit", "net_profit")


def load_company(info: RawStockInfo) -> None:
    Company.all_objects.update_or_create(
        symbol=info.symbol,
        defaults={
            "name": info.full_name,
            "sector": info.formatted_sector or "",
            "instrument_type": "Equity",
            "status": "A",
        },
    )


def _report_defaults(payload: dict) -> dict:
    defaults = {
        "report_template": "HYDRO",
        "is_audited": True,
        "balance_sheet": payload["balance_sheet"],
        "profit_loss": payload["profit_loss"],
        "cash_flow": payload["cash_flow"],
    }
    for scalar in _REPORT_SCALARS:
        defaults[scalar] = payload.get(scalar)
    return defaults


def load_annual_reports(ticker: str, reports: dict[str, dict]) -> int:
    for fiscal_year, payload in reports.items():
        payload = {**payload, "fiscal_year": fiscal_year}
        FinancialReport.objects.update_or_create(
            ticker=ticker, fiscal_year=fiscal_year,
            report_type=FinancialReport.ReportType.ANNUAL, quarter=None,
            defaults=_report_defaults(payload),
        )
    return len(reports)


def load_dividends(ticker: str, dividends: list[dict]) -> int:
    for item in dividends:
        _upsert_dividend_row(ticker, item)
        _apply_dividend_to_report(ticker, item)
    return len(dividends)


def _upsert_dividend_row(ticker: str, item: dict) -> None:
    Dividend.objects.update_or_create(
        ticker=ticker, fiscal_year=item["fiscal_year"],
        defaults={
            "bonus_percent": item["bonus_percent"],
            "cash_percent": item["cash_percent"],
            "total_percent": item["total_percent"],
            "book_close_date": item["book_close_date"],
        },
    )


def _apply_dividend_to_report(ticker: str, item: dict) -> None:
    fy = normalize_fiscal_year(item["fiscal_year"])
    FinancialReport.objects.filter(
        ticker=ticker, fiscal_year=fy,
        report_type=FinancialReport.ReportType.ANNUAL,
    ).update(
        bonus_share=item["bonus_percent"],
        cash_dividend=item["cash_percent"],
        dividend_book_close_date=item["book_close_date"],
    )
