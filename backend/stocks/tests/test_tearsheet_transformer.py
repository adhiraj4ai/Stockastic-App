import json
import os
from decimal import Decimal

import pytest

from stocks.services.tearsheet.exceptions import TearsheetSchemaError
from stocks.services.tearsheet.schemas import RawDividendRow, RawFinancialRow
from stocks.services.tearsheet.transformer import (
    build_annual_reports,
    build_dividends,
)

FIX = os.path.join(os.path.dirname(__file__), "fixtures", "tearsheet")


def _financial_rows():
    raw = json.load(open(os.path.join(FIX, "api_financials.json")))
    return [RawFinancialRow.model_validate(r) for r in raw]


def _dividend_rows():
    raw = json.load(open(os.path.join(FIX, "api_dividend.json")))["dividend"]
    return [RawDividendRow.model_validate(r) for r in raw]


def test_build_annual_reports_pivots_balance_sheet_and_scalars():
    reports = build_annual_reports(_financial_rows())
    r = reports["080-081"]
    assert r["balance_sheet"]["NON_CURRENT_ASSETS"]["ppe"] == 18669104.0
    assert r["balance_sheet"]["NON_CURRENT_ASSETS"]["cwip"] == 111439181.0
    assert r["balance_sheet"]["LIABILITIES"]["share_capital"] == 5786597912.0
    assert r["paid_up_capital"] == Decimal("5786597912")
    assert r["revenue"] == Decimal("1248646553")
    assert r["net_profit"] == Decimal("450112739")


def test_build_annual_reports_pl_and_cashflow():
    reports = build_annual_reports(_financial_rows())
    r = reports["080-081"]
    assert r["profit_loss"]["PL"]["depreciation"] == 334630704.0
    assert r["profit_loss"]["PL"]["operating_profit"] == 1070257103.0
    # 080-081 has no cash-flow rows in the source -> empty section
    assert r["cash_flow"] == {}


def test_build_annual_reports_covers_all_ten_years():
    reports = build_annual_reports(_financial_rows())
    assert len(reports) == 10
    assert "072-073" in reports and "081-082" in reports


def test_build_annual_reports_unmapped_particular_raises():
    rows = [RawFinancialRow.model_validate(
        {"particular": "MysteryLine", "fiscal_year": "080-081", "value": 1})]
    with pytest.raises(TearsheetSchemaError):
        build_annual_reports(rows)


def test_build_dividends_computes_total_and_keeps_year_format():
    divs = {d["fiscal_year"]: d for d in build_dividends(_dividend_rows())}
    d = divs["2080/2081"]
    assert d["bonus_percent"] == Decimal("5")
    assert d["cash_percent"] == Decimal("0.2632")
    assert d["total_percent"] == Decimal("5.2632")
    assert d["book_close_date"] == "2024-10-18"


def test_build_dividends_null_cash_treated_as_zero():
    divs = {d["fiscal_year"]: d for d in build_dividends(_dividend_rows())}
    d = divs["2073/2074"]
    assert d["cash_percent"] == Decimal("0")
    assert d["total_percent"] == Decimal("8")
