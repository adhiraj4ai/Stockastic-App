from decimal import Decimal

import pytest
from pydantic import ValidationError

from stocks.services.tearsheet.schemas import (
    RawDividendRow,
    RawFinancialRow,
    RawStockInfo,
)


def test_financial_row_coerces_int_value():
    row = RawFinancialRow.model_validate(
        {"particular": "ShareCapital", "fiscal_year": "080-081", "value": 5786597912}
    )
    assert row.value == Decimal("5786597912")


@pytest.mark.parametrize("sentinel", ["-", "", "None", None])
def test_financial_row_sentinel_value_becomes_none(sentinel):
    row = RawFinancialRow.model_validate(
        {"particular": "Depreciation", "fiscal_year": "080-081", "value": sentinel}
    )
    assert row.value is None


def test_financial_row_unparseable_value_becomes_none():
    row = RawFinancialRow.model_validate(
        {"particular": "Depreciation", "fiscal_year": "080-081", "value": "n/a"}
    )
    assert row.value is None


def test_financial_row_missing_particular_raises():
    with pytest.raises(ValidationError):
        RawFinancialRow.model_validate({"fiscal_year": "080-081", "value": 1})


def test_dividend_row_coerces_strings_and_null_cash():
    row = RawDividendRow.model_validate(
        {"fiscal_year": "2073/2074", "bonus_dividend": "8",
         "cash_dividend": None, "book_closure_date": "2018-01-05"}
    )
    assert row.bonus_dividend == Decimal("8")
    assert row.cash_dividend is None
    assert row.book_closure_date == "2018-01-05"


def test_stock_info_parses_name_and_sector():
    info = RawStockInfo.model_validate(
        {"full_name": "API Power Company Limited", "symbol": "API",
         "formatted_sector": "HYDROPOWER"}
    )
    assert info.full_name == "API Power Company Limited"
    assert info.symbol == "API"
    assert info.formatted_sector == "HYDROPOWER"


def test_dividend_row_ignores_extra_api_fields():
    row = RawDividendRow.model_validate(
        {"fiscal_year": "2080/2081", "bonus_dividend": "5", "cash_dividend": "0.2632",
         "book_closure_date": "2024-10-18", "id": 13179, "company_name": "X",
         "status": "<span>Closed</span>"}
    )
    assert row.bonus_dividend == Decimal("5")
    assert not hasattr(row, "company_name")
