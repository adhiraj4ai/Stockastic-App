from __future__ import annotations

from collections import defaultdict
from decimal import Decimal
from typing import Iterable

from .exceptions import TearsheetSchemaError
from .mapping import PARTICULAR_TO_PATH, SCALAR_PARTICULARS
from .schemas import RawDividendRow, RawFinancialRow


def _blank_report() -> dict:
    return {"balance_sheet": {}, "profit_loss": {}, "cash_flow": {}}


def _place(report: dict, particular: str, value: Decimal) -> None:
    section, sub, key = PARTICULAR_TO_PATH[particular]
    report[section].setdefault(sub, {})[key] = float(value)
    scalar = SCALAR_PARTICULARS.get(particular)
    if scalar:
        report[scalar] = value


def build_annual_reports(rows: Iterable[RawFinancialRow]) -> dict[str, dict]:
    reports: dict[str, dict] = defaultdict(_blank_report)
    for row in rows:
        if row.particular not in PARTICULAR_TO_PATH:
            raise TearsheetSchemaError(f"unmapped particular: {row.particular!r}")
        if row.value is None:
            continue
        _place(reports[row.fiscal_year], row.particular, row.value)
    return dict(reports)


def build_dividends(rows: Iterable[RawDividendRow]) -> list[dict]:
    out: list[dict] = []
    for row in rows:
        bonus = row.bonus_dividend or Decimal("0")
        cash = row.cash_dividend or Decimal("0")
        out.append({
            "fiscal_year": row.fiscal_year,
            "bonus_percent": bonus,
            "cash_percent": cash,
            "total_percent": bonus + cash,
            "book_close_date": row.book_closure_date or None,
        })
    return out
