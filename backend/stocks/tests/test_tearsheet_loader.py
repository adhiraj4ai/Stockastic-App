import json
import os
from decimal import Decimal

import pytest

from stocks.models import Company, Dividend, FinancialReport
from stocks.services.tearsheet.schemas import (
    RawDividendRow,
    RawFinancialRow,
    RawStockInfo,
)
from stocks.services.tearsheet.transformer import (
    build_annual_reports,
    build_dividends,
)
from stocks.services.tearsheet.loader import (
    load_annual_reports,
    load_company,
    load_dividends,
)

FIX = os.path.join(os.path.dirname(__file__), "fixtures", "tearsheet")


def _fin():
    raw = json.load(open(os.path.join(FIX, "api_financials.json")))
    return build_annual_reports([RawFinancialRow.model_validate(r) for r in raw])


def _div():
    raw = json.load(open(os.path.join(FIX, "api_dividend.json")))["dividend"]
    return build_dividends([RawDividendRow.model_validate(r) for r in raw])


def _info():
    raw = json.load(open(os.path.join(FIX, "api_stockinfo.json")))["stockInfo"][0]
    return RawStockInfo.model_validate(raw)


@pytest.mark.django_db
def test_load_company_writes_correct_name_and_sector():
    load_company(_info())
    c = Company.all_objects.get(symbol="API")
    assert c.name == "API Power Company Limited"
    assert c.sector == "HYDROPOWER"


@pytest.mark.django_db
def test_load_company_corrects_existing_wrong_name():
    Company.all_objects.create(symbol="API", name="Arun Valley Hydropower",
                               sector="Hydro Power", status="A")
    load_company(_info())
    assert Company.all_objects.get(symbol="API").name == "API Power Company Limited"


@pytest.mark.django_db
def test_load_annual_reports_creates_ten_annual_reports():
    load_annual_reports("API", _fin())
    qs = FinancialReport.objects.filter(ticker="API", report_type="ANNUAL")
    assert qs.count() == 10
    r = qs.get(fiscal_year="080-081")
    assert r.revenue == Decimal("1248646553")
    assert r.balance_sheet["NON_CURRENT_ASSETS"]["ppe"] == 18669104.0


@pytest.mark.django_db
def test_load_dividends_writes_both_stores():
    load_annual_reports("API", _fin())
    load_dividends("API", _div())
    d = Dividend.objects.get(ticker="API", fiscal_year="2080/2081")
    assert d.bonus_percent == Decimal("5")
    assert d.cash_percent == Decimal("0.26")  # 5dp source rounds to model's 2dp
    assert d.total_percent == Decimal("5.26")
    assert str(d.book_close_date) == "2024-10-18"
    r = FinancialReport.objects.get(ticker="API", fiscal_year="080-081")
    assert r.bonus_share == Decimal("5")


@pytest.mark.django_db
def test_loaders_are_idempotent():
    for _ in range(2):
        load_company(_info())
        load_annual_reports("API", _fin())
        load_dividends("API", _div())
    assert Company.all_objects.filter(symbol="API").count() == 1
    assert FinancialReport.objects.filter(ticker="API", report_type="ANNUAL").count() == 10
    assert Dividend.objects.filter(ticker="API", fiscal_year="2080/2081").count() == 1
