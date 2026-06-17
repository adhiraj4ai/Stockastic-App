# nepsealpha tearsheet scraper — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an on-demand command that logs into nepsealpha with a real headless Chrome, fetches a company's annual financials + dividends from the tearsheet JSON endpoints, and loads them correctly into `FinancialReport` and `Dividend`.

**Architecture:** A small package `stocks/services/tearsheet/` with single-purpose modules: a Playwright `TearsheetBrowser` (the only browser/network piece, isolated behind a fetcher interface), Pydantic boundary `schemas`, a pure `mapping` + `transformer` that pivot the long-format financial rows into the report JSON, a `loader` that upserts idempotently, a file `cache`, and a `pipeline` the management command wires together. Everything except the browser is unit-tested with committed JSON fixtures and no network.

**Tech Stack:** Django 5.2, DRF, PostgreSQL, pytest + pytest-django, Pydantic v2, Playwright (real Chrome via `channel="chrome"`).

**Branch:** `feat/nepsealpha-tearsheet-scraper` (already created; spec committed).

**Reference:** `docs/superpowers/specs/2026-06-17-nepsealpha-tearsheet-scraper-design.md`

**Run tests from `backend/` with the venv active:** `source .venv/bin/activate`

---

### Task 1: Package skeleton, exceptions, settings, deps, fixtures

**Files:**
- Create: `backend/stocks/services/tearsheet/__init__.py`
- Create: `backend/stocks/services/tearsheet/exceptions.py`
- Modify: `backend/stockastic/settings.py` (after line ~375, the NEPSE block)
- Modify: `backend/requirements.txt`
- Already present (committed in this task): `backend/stocks/tests/fixtures/tearsheet/api_financials.json`, `api_dividend.json`, `api_stockinfo.json`

- [ ] **Step 1: Create the package init**

`backend/stocks/services/tearsheet/__init__.py`:
```python
"""nepsealpha tearsheet scraper: browser session, schemas, transform, load."""
```

- [ ] **Step 2: Create exceptions**

`backend/stocks/services/tearsheet/exceptions.py`:
```python
from __future__ import annotations


class TearsheetError(Exception):
    """Base error for the nepsealpha tearsheet scraper."""


class TearsheetAuthError(TearsheetError):
    """Login failed or the session is not authenticated."""


class TearsheetUnavailableError(TearsheetError):
    """Cloudflare not cleared, navigation timeout, or transport failure."""


class TearsheetSchemaError(TearsheetError):
    """Response failed validation or contained an unmapped line item."""
```

- [ ] **Step 3: Add settings**

In `backend/stockastic/settings.py`, directly below the existing `NEPSE_API_TIMEOUT` line (~375), add:
```python
NEPSEALPHA_BASE_URL = os.getenv("NEPSEALPHA_BASE_URL", "https://nepsealpha.com")
NEPSEALPHA_EMAIL = os.getenv("NEPSEALPHA_EMAIL", "")
NEPSEALPHA_PASSWORD = os.getenv("NEPSEALPHA_PASSWORD", "")
NEPSEALPHA_REQUEST_DELAY = float(os.getenv("NEPSEALPHA_REQUEST_DELAY", "1.5"))
NEPSEALPHA_MAX_REQUESTS = int(os.getenv("NEPSEALPHA_MAX_REQUESTS", "10"))
```

- [ ] **Step 4: Add dependency**

Append to `backend/requirements.txt`:
```
playwright==1.49.1
```
(Local one-time browser setup uses system Chrome via `channel="chrome"`; no `playwright install` needed when Chrome is present. If absent, run `python -m playwright install chromium`.)

- [ ] **Step 5: Commit**

```bash
git add backend/stocks/services/tearsheet/__init__.py \
        backend/stocks/services/tearsheet/exceptions.py \
        backend/stockastic/settings.py backend/requirements.txt \
        backend/stocks/tests/fixtures/tearsheet/
git commit -m "feat(tearsheet): package skeleton, exceptions, settings, fixtures"
```

---

### Task 2: Pydantic boundary schemas

**Files:**
- Create: `backend/stocks/services/tearsheet/schemas.py`
- Test: `backend/stocks/tests/test_tearsheet_schemas.py`

- [ ] **Step 1: Write the failing test**

`backend/stocks/tests/test_tearsheet_schemas.py`:
```python
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


def test_financial_row_dash_value_becomes_none():
    row = RawFinancialRow.model_validate(
        {"particular": "Depreciation", "fiscal_year": "080-081", "value": "-"}
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
    assert info.formatted_sector == "HYDROPOWER"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest stocks/tests/test_tearsheet_schemas.py -v`
Expected: FAIL — `ModuleNotFoundError: ... tearsheet.schemas`.

- [ ] **Step 3: Write minimal implementation**

`backend/stocks/services/tearsheet/schemas.py`:
```python
from __future__ import annotations

from decimal import Decimal, InvalidOperation
from typing import Optional

from pydantic import BaseModel, field_validator

_SENTINELS = (None, "", "-", "None")


def _to_decimal(value) -> Optional[Decimal]:
    if value in _SENTINELS:
        return None
    try:
        return Decimal(str(value).replace(",", ""))
    except (InvalidOperation, ValueError):
        return None


class RawFinancialRow(BaseModel):
    particular: str
    fiscal_year: str
    value: Optional[Decimal] = None

    @field_validator("value", mode="before")
    @classmethod
    def _coerce_value(cls, v):
        return _to_decimal(v)


class RawDividendRow(BaseModel):
    fiscal_year: str
    bonus_dividend: Optional[Decimal] = None
    cash_dividend: Optional[Decimal] = None
    book_closure_date: Optional[str] = None
    company_name: Optional[str] = None

    @field_validator("bonus_dividend", "cash_dividend", mode="before")
    @classmethod
    def _coerce_amounts(cls, v):
        return _to_decimal(v)


class RawStockInfo(BaseModel):
    full_name: str
    symbol: str
    formatted_sector: Optional[str] = None
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest stocks/tests/test_tearsheet_schemas.py -v`
Expected: PASS (5 passed).

- [ ] **Step 5: Commit**

```bash
git add backend/stocks/services/tearsheet/schemas.py backend/stocks/tests/test_tearsheet_schemas.py
git commit -m "feat(tearsheet): pydantic boundary schemas"
```

---

### Task 3: Particular → report-path mapping

**Files:**
- Create: `backend/stocks/services/tearsheet/mapping.py`
- Test: `backend/stocks/tests/test_tearsheet_mapping.py`

- [ ] **Step 1: Write the failing test**

`backend/stocks/tests/test_tearsheet_mapping.py`:
```python
import json
import os

from stocks.services.tearsheet.mapping import (
    PARTICULAR_TO_PATH,
    SCALAR_PARTICULARS,
)

FIXTURE = os.path.join(
    os.path.dirname(__file__), "fixtures", "tearsheet", "api_financials.json"
)


def test_every_fixture_particular_is_mapped():
    rows = json.load(open(FIXTURE))
    particulars = {r["particular"] for r in rows}
    unmapped = particulars - set(PARTICULAR_TO_PATH)
    assert unmapped == set(), f"unmapped particulars: {unmapped}"


def test_share_capital_maps_to_liabilities_and_scalar():
    assert PARTICULAR_TO_PATH["ShareCapital"] == (
        "balance_sheet", "LIABILITIES", "share_capital")
    assert SCALAR_PARTICULARS["ShareCapital"] == "paid_up_capital"


def test_net_profit_maps_to_pl_and_scalar():
    assert PARTICULAR_TO_PATH["ProfitForTheYear(NetProfit)"] == (
        "profit_loss", "PL", "net_profit")
    assert SCALAR_PARTICULARS["ProfitForTheYear(NetProfit)"] == "net_profit"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest stocks/tests/test_tearsheet_mapping.py -v`
Expected: FAIL — `ModuleNotFoundError: ... tearsheet.mapping`.

- [ ] **Step 3: Write minimal implementation**

`backend/stocks/services/tearsheet/mapping.py`:
```python
from __future__ import annotations

# particular -> (json_section, subsection, key) in the FinancialReport JSON
PARTICULAR_TO_PATH: dict[str, tuple[str, str, str]] = {
    "Property,PlantAndEquipment": ("balance_sheet", "NON_CURRENT_ASSETS", "ppe"),
    "Wip(ProjectWorkInProgress,UnderDevelopment)": ("balance_sheet", "NON_CURRENT_ASSETS", "cwip"),
    "InvestmentAndFinancialAssets": ("balance_sheet", "NON_CURRENT_ASSETS", "financial_assets"),
    "TotalNon-CurrentAssets": ("balance_sheet", "TOTALS", "non_current_assets"),
    "TotalCurrentAssets": ("balance_sheet", "TOTALS", "current_assets"),
    "TotalAssets": ("balance_sheet", "TOTALS", "total_assets"),
    "ShareCapital": ("balance_sheet", "LIABILITIES", "share_capital"),
    "ReserveAndSurplus": ("balance_sheet", "LIABILITIES", "reserves"),
    "TotalEquity": ("balance_sheet", "TOTALS", "total_equity"),
    "LongTermLoans&Borrowings": ("balance_sheet", "LIABILITIES", "long_term_loans"),
    "TotalNon-CurrentLiabilities": ("balance_sheet", "TOTALS", "non_current_liabilities"),
    "ShortTermLoans&Borrowings": ("balance_sheet", "LIABILITIES", "short_term_loans"),
    "TotalCurrentLiabilities": ("balance_sheet", "TOTALS", "current_liabilities"),
    "TotalLiabilities": ("balance_sheet", "TOTALS", "total_liabilities"),
    "TotalEquityAndLiabilities": ("balance_sheet", "TOTALS", "total_equity_and_liabilities"),
    "Revenue(PowerSales)": ("profit_loss", "PL", "revenue"),
    "Cogs(Generation,Distribution,Royalty&ProjectExpenses)": ("profit_loss", "PL", "cost_of_sales"),
    "GrossProfit": ("profit_loss", "PL", "gross_profit"),
    "Depreciation": ("profit_loss", "PL", "depreciation"),
    "AdministrativeAndOtherOperatingExpenses": ("profit_loss", "PL", "admin_expenses"),
    "ProfitFromOperation(OperatingProfit)": ("profit_loss", "PL", "operating_profit"),
    "FinanceCost": ("profit_loss", "PL", "finance_costs"),
    "ProfitBeforeTax": ("profit_loss", "PL", "profit_before_tax"),
    "ProfitForTheYear(NetProfit)": ("profit_loss", "PL", "net_profit"),
    "CashFlowsFromOperatingActivities": ("cash_flow", "CF", "operating_cash_flow"),
    "CashFlowsFromInvestingActivities": ("cash_flow", "CF", "investing_cash_flow"),
    "CashFlowsFromFinancingActivities": ("cash_flow", "CF", "financing_cash_flow"),
}

# particular -> scalar column on FinancialReport (Decimal model fields)
SCALAR_PARTICULARS: dict[str, str] = {
    "ShareCapital": "paid_up_capital",
    "ReserveAndSurplus": "reserves_and_surplus",
    "Revenue(PowerSales)": "revenue",
    "ProfitFromOperation(OperatingProfit)": "operating_profit",
    "ProfitForTheYear(NetProfit)": "net_profit",
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest stocks/tests/test_tearsheet_mapping.py -v`
Expected: PASS (3 passed).

- [ ] **Step 5: Commit**

```bash
git add backend/stocks/services/tearsheet/mapping.py backend/stocks/tests/test_tearsheet_mapping.py
git commit -m "feat(tearsheet): particular-to-report-path mapping"
```

---

### Task 4: Transformer (long-format → report payloads)

**Files:**
- Create: `backend/stocks/services/tearsheet/transformer.py`
- Test: `backend/stocks/tests/test_tearsheet_transformer.py`

- [ ] **Step 1: Write the failing test**

`backend/stocks/tests/test_tearsheet_transformer.py`:
```python
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest stocks/tests/test_tearsheet_transformer.py -v`
Expected: FAIL — `ModuleNotFoundError: ... tearsheet.transformer`.

- [ ] **Step 3: Write minimal implementation**

`backend/stocks/services/tearsheet/transformer.py`:
```python
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest stocks/tests/test_tearsheet_transformer.py -v`
Expected: PASS (6 passed).

- [ ] **Step 5: Commit**

```bash
git add backend/stocks/services/tearsheet/transformer.py backend/stocks/tests/test_tearsheet_transformer.py
git commit -m "feat(tearsheet): transform long-format financials + dividends"
```

---

### Task 5: Loader (idempotent upsert into Company / FinancialReport / Dividend)

**Files:**
- Create: `backend/stocks/services/tearsheet/loader.py`
- Test: `backend/stocks/tests/test_tearsheet_loader.py`

- [ ] **Step 1: Write the failing test**

`backend/stocks/tests/test_tearsheet_loader.py`:
```python
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest stocks/tests/test_tearsheet_loader.py -v`
Expected: FAIL — `ModuleNotFoundError: ... tearsheet.loader`.

- [ ] **Step 3: Write minimal implementation**

`backend/stocks/services/tearsheet/loader.py`:
```python
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest stocks/tests/test_tearsheet_loader.py -v`
Expected: PASS (5 passed). Note: `cash_percent` 0.2632 is stored in a 2-dp DecimalField → 0.26; the assertion reflects that.

- [ ] **Step 5: Commit**

```bash
git add backend/stocks/services/tearsheet/loader.py backend/stocks/tests/test_tearsheet_loader.py
git commit -m "feat(tearsheet): idempotent loader for company, reports, dividends"
```

---

### Task 6: Session helpers (pure) + TearsheetBrowser

**Files:**
- Create: `backend/stocks/services/tearsheet/session.py`
- Test: `backend/stocks/tests/test_tearsheet_session_helpers.py`

- [ ] **Step 1: Write the failing test (pure helpers only)**

`backend/stocks/tests/test_tearsheet_session_helpers.py`:
```python
from stocks.services.tearsheet.session import build_endpoint, extract_fsk


def test_extract_fsk_finds_token():
    url = "https://nepsealpha.com/sastoshare/tearsheet/filter/financials?fsk=Gnw21LX9&symbol=API"
    assert extract_fsk(url) == "Gnw21LX9"


def test_extract_fsk_missing_returns_none():
    assert extract_fsk("https://nepsealpha.com/x?symbol=API") is None


def test_build_endpoint_orders_params():
    url = build_endpoint(
        "https://nepsealpha.com",
        "/sastoshare/tearsheet/filter/financials",
        {"symbol": "API", "fsk": "TOK"},
    )
    assert url == (
        "https://nepsealpha.com/sastoshare/tearsheet/filter/financials"
        "?symbol=API&fsk=TOK"
    )
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest stocks/tests/test_tearsheet_session_helpers.py -v`
Expected: FAIL — `ModuleNotFoundError: ... tearsheet.session`.

- [ ] **Step 3: Write minimal implementation**

`backend/stocks/services/tearsheet/session.py`:
```python
from __future__ import annotations

import random
import re
import time
from urllib.parse import urlencode

from django.conf import settings

from .exceptions import TearsheetAuthError, TearsheetUnavailableError

_FSK_RE = re.compile(r"[?&]fsk=([^&]+)")
_UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
       "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
_STEALTH = "Object.defineProperty(navigator,'webdriver',{get:()=>undefined});"
_FETCH_JS = """async (u) => {
    const r = await fetch(u, {headers:{'X-Requested-With':'XMLHttpRequest'},
                             credentials:'include'});
    const t = await r.text();
    return {ok: r.ok, status: r.status, body: t};
}"""


def extract_fsk(url: str) -> str | None:
    match = _FSK_RE.search(url)
    return match.group(1) if match else None


def build_endpoint(base_url: str, fragment: str, params: dict) -> str:
    return f"{base_url.rstrip('/')}{fragment}?{urlencode(params)}"


def _clear_challenge(page, timeout_ms: int = 40000) -> None:
    waited = 0
    while waited < timeout_ms and "just a moment" in (page.title() or "").lower():
        page.wait_for_timeout(2000)
        waited += 2000
    if "just a moment" in (page.title() or "").lower():
        raise TearsheetUnavailableError("Cloudflare challenge did not clear")


class TearsheetBrowser:
    """Headless real-Chrome session: logs in, captures fsk, fetches JSON.

    Use as a context manager. The only browser/network-bound component;
    everything downstream consumes the dict/list it returns.
    """

    def __init__(self, symbol: str):
        self.symbol = symbol.upper()
        self.base_url = settings.NEPSEALPHA_BASE_URL
        self._fsk: str | None = None
        self._requests_made = 0

    def __enter__(self) -> "TearsheetBrowser":
        from playwright.sync_api import sync_playwright
        self._pw = sync_playwright().start()
        self._browser = self._launch()
        self._ctx = self._browser.new_context(
            user_agent=_UA, viewport={"width": 1366, "height": 900}, locale="en-US")
        self._ctx.add_init_script(_STEALTH)
        self._page = self._ctx.new_page()
        self._page.on("response", self._sniff_fsk)
        self._login()
        self._open_tearsheet()
        return self

    def __exit__(self, *exc) -> None:
        try:
            self._browser.close()
        finally:
            self._pw.stop()

    def _launch(self):
        flags = ["--disable-blink-features=AutomationControlled", "--no-sandbox"]
        try:
            return self._pw.chromium.launch(channel="chrome", headless=True, args=flags)
        except Exception:
            return self._pw.chromium.launch(headless=True, args=flags)

    def _sniff_fsk(self, response) -> None:
        if self._fsk is None:
            self._fsk = extract_fsk(response.url)

    def _login(self) -> None:
        page = self._page
        page.goto(f"{self.base_url}/login", wait_until="domcontentloaded", timeout=60000)
        _clear_challenge(page)
        page.fill("input[name='email']", settings.NEPSEALPHA_EMAIL)
        page.fill("input[name='password']", settings.NEPSEALPHA_PASSWORD)
        try:
            page.check("input[name='remember']")
        except Exception:
            pass
        page.click("button[type=submit]")
        page.wait_for_timeout(3000)
        _clear_challenge(page)

    def _open_tearsheet(self) -> None:
        url = f"{self.base_url}/sastoshare/tearsheet/{self.symbol}"
        self._page.goto(url, wait_until="domcontentloaded", timeout=60000)
        _clear_challenge(self._page)
        self._page.wait_for_timeout(3000)
        if self._page.query_selector("input[type='password']"):
            raise TearsheetAuthError("not authenticated after login")
        if self._fsk is None:
            raise TearsheetUnavailableError("fsk token not captured")

    def fetch(self, fragment: str, params: dict):
        if self._requests_made >= settings.NEPSEALPHA_MAX_REQUESTS:
            raise TearsheetUnavailableError("per-run request cap reached")
        time.sleep(settings.NEPSEALPHA_REQUEST_DELAY * (0.5 + random.random()))
        self._requests_made += 1
        url = build_endpoint(self.base_url, fragment, {**params, "fsk": self._fsk})
        result = self._page.evaluate(_FETCH_JS, url)
        if not result["ok"]:
            raise TearsheetUnavailableError(f"{fragment}: HTTP {result['status']}")
        import json
        return json.loads(result["body"])
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest stocks/tests/test_tearsheet_session_helpers.py -v`
Expected: PASS (3 passed). (The browser class itself is exercised live in Task 8, not in CI.)

- [ ] **Step 5: Commit**

```bash
git add backend/stocks/services/tearsheet/session.py backend/stocks/tests/test_tearsheet_session_helpers.py
git commit -m "feat(tearsheet): playwright session + pure url/fsk helpers"
```

---

### Task 7: Cache + pipeline + management command

**Files:**
- Create: `backend/stocks/services/tearsheet/cache.py`
- Create: `backend/stocks/services/tearsheet/pipeline.py`
- Create: `backend/stocks/management/commands/scrape_tearsheet.py`
- Test: `backend/stocks/tests/test_tearsheet_pipeline.py`

- [ ] **Step 1: Write the failing test (fake fetcher, no browser)**

`backend/stocks/tests/test_tearsheet_pipeline.py`:
```python
import json
import os

import pytest

from stocks.models import Company, Dividend, FinancialReport
from stocks.services.tearsheet.pipeline import scrape_annual

FIX = os.path.join(os.path.dirname(__file__), "fixtures", "tearsheet")


class FakeFetcher:
    """Stands in for TearsheetBrowser; returns fixtures by endpoint fragment."""

    def __init__(self, symbol="API"):
        self.symbol = symbol
        self._fin = json.load(open(os.path.join(FIX, "api_financials.json")))
        self._div = json.load(open(os.path.join(FIX, "api_dividend.json")))
        self._info = json.load(open(os.path.join(FIX, "api_stockinfo.json")))

    def fetch(self, fragment, params):
        if "financials" in fragment:
            return self._fin
        if "dividend" in fragment:
            return self._div
        if "corporate_action" in fragment:
            return self._info
        raise AssertionError(f"unexpected fragment {fragment}")


@pytest.mark.django_db
def test_scrape_annual_loads_everything():
    counts = scrape_annual("API", FakeFetcher())
    assert counts == {"reports": 10, "dividends": 9, "company": "API Power Company Limited"}
    assert Company.all_objects.get(symbol="API").name == "API Power Company Limited"
    assert FinancialReport.objects.filter(ticker="API", report_type="ANNUAL").count() == 10
    assert Dividend.objects.filter(ticker="API").count() == 9
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest stocks/tests/test_tearsheet_pipeline.py -v`
Expected: FAIL — `ModuleNotFoundError: ... tearsheet.pipeline`.

- [ ] **Step 3a: Write the cache**

`backend/stocks/services/tearsheet/cache.py`:
```python
from __future__ import annotations

import json
from datetime import date
from pathlib import Path

from django.conf import settings

_CACHE_DIR = Path(settings.BASE_DIR) / ".cache" / "tearsheet"


def _path(symbol: str, dataset: str) -> Path:
    return _CACHE_DIR / f"{symbol.upper()}_{dataset}_{date.today().isoformat()}.json"


def read(symbol: str, dataset: str):
    path = _path(symbol, dataset)
    if path.exists():
        return json.loads(path.read_text())
    return None


def write(symbol: str, dataset: str, payload) -> None:
    _CACHE_DIR.mkdir(parents=True, exist_ok=True)
    _path(symbol, dataset).write_text(json.dumps(payload))
```

- [ ] **Step 3b: Write the pipeline**

`backend/stocks/services/tearsheet/pipeline.py`:
```python
from __future__ import annotations

from . import cache as cache_module
from .loader import load_annual_reports, load_company, load_dividends
from .schemas import RawDividendRow, RawFinancialRow, RawStockInfo
from .transformer import build_annual_reports, build_dividends

_ENDPOINTS = {
    "financials": "/sastoshare/tearsheet/filter/financials",
    "dividend": "/sastoshare/tearsheet/filter/dividend",
    "corporate_action": "/sastoshare/portfolio/corporate_action",
}


def _get(fetcher, symbol, dataset, params, use_cache):
    if use_cache:
        cached = cache_module.read(symbol, dataset)
        if cached is not None:
            return cached
    payload = fetcher.fetch(_ENDPOINTS[dataset], params)
    if use_cache:
        cache_module.write(symbol, dataset, payload)
    return payload


def scrape_annual(symbol: str, fetcher, use_cache: bool = True) -> dict:
    symbol = symbol.upper()
    fin = _get(fetcher, symbol, "financials", {"symbol": symbol}, use_cache)
    div = _get(fetcher, symbol, "dividend", {"symbol": symbol}, use_cache)
    info = _get(fetcher, symbol, "corporate_action",
                {"symbols[]": symbol}, use_cache)
    stock_info = RawStockInfo.model_validate(info["stockInfo"][0])
    reports = build_annual_reports([RawFinancialRow.model_validate(r) for r in fin])
    dividends = build_dividends(
        [RawDividendRow.model_validate(r) for r in div["dividend"]])
    load_company(stock_info)
    n_reports = load_annual_reports(symbol, reports)
    n_div = load_dividends(symbol, dividends)
    return {"reports": n_reports, "dividends": n_div, "company": stock_info.full_name}
```

- [ ] **Step 3c: Write the management command**

`backend/stocks/management/commands/scrape_tearsheet.py`:
```python
from __future__ import annotations

from django.core.management.base import BaseCommand, CommandError

from stocks.services.tearsheet.exceptions import TearsheetError
from stocks.services.tearsheet.pipeline import scrape_annual
from stocks.services.tearsheet.session import TearsheetBrowser


class Command(BaseCommand):
    help = "Scrape annual financials + dividends for a symbol from nepsealpha"

    def add_arguments(self, parser) -> None:
        parser.add_argument("symbol", help="NEPSE symbol, e.g. API")
        parser.add_argument("--no-cache", action="store_true",
                            help="Bypass the on-disk response cache")

    def handle(self, *args, **options) -> None:
        symbol = options["symbol"].upper()
        self.stdout.write(f"Scraping tearsheet for {symbol}...")
        try:
            with TearsheetBrowser(symbol) as browser:
                counts = scrape_annual(symbol, browser,
                                       use_cache=not options["no_cache"])
        except TearsheetError as exc:
            raise CommandError(str(exc)) from exc
        self.stdout.write(self.style.SUCCESS(
            f"{counts['company']}: {counts['reports']} annual reports, "
            f"{counts['dividends']} dividends loaded"))
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest stocks/tests/test_tearsheet_pipeline.py -v`
Expected: PASS (1 passed).

- [ ] **Step 5: Commit**

```bash
git add backend/stocks/services/tearsheet/cache.py \
        backend/stocks/services/tearsheet/pipeline.py \
        backend/stocks/management/commands/scrape_tearsheet.py \
        backend/stocks/tests/test_tearsheet_pipeline.py
git commit -m "feat(tearsheet): cache, pipeline, and scrape_tearsheet command"
```

---

### Task 8: Live verification, remove old seeds, full suite

**Files:**
- Delete: `backend/stocks/management/commands/seed_api_annual.py`
- Delete: `backend/stocks/management/commands/seed_api_quarterly.py`
- Delete: `backend/stocks/tests/test_api_seeder.py`
- Delete: `backend/stocks/tests/test_api_quarterly_seeder.py`

- [ ] **Step 1: Live smoke test (local, requires creds in backend/.env)**

Run: `python manage.py scrape_tearsheet API --no-cache`
Expected: `API Power Company Limited: 10 annual reports, 9 dividends loaded`.
Then confirm in the DB:
```bash
python manage.py shell -c "from stocks.models import Company, FinancialReport; \
print(Company.all_objects.get(symbol='API').name); \
print(FinancialReport.objects.filter(ticker='API', report_type='ANNUAL').count())"
```
Expected: `API Power Company Limited` and `10`.

- [ ] **Step 2: Remove the superseded hand-written seeds + their tests**

```bash
git rm backend/stocks/management/commands/seed_api_annual.py \
       backend/stocks/management/commands/seed_api_quarterly.py \
       backend/stocks/tests/test_api_seeder.py \
       backend/stocks/tests/test_api_quarterly_seeder.py
```
(These are untracked; if `git rm` errors, use plain `rm` on the four paths.)

- [ ] **Step 3: Run the full tearsheet test set + a broad sanity run**

Run: `pytest stocks/tests/test_tearsheet_*.py -v`
Expected: all pass.
Run: `pytest -q`
Expected: no regressions (no references to the deleted seeds remain).

- [ ] **Step 4: Commit**

```bash
git add -A backend/stocks
git commit -m "chore(tearsheet): remove hand-written API seeds superseded by scraper"
```

---

## Self-review notes

- **Spec coverage:** session/auth (Task 6), schemas (2), mapping (3), transformer (4), loader incl. company-name fix + dual dividend store (5), cache + command (7), fixtures + config + deps (1), seed removal (8), quarterly explicitly deferred (not built). ✔
- **No placeholders:** every code step contains full code; every test has real assertions tied to fixture values. ✔
- **Type/name consistency:** `fetch(fragment, params)` used identically by `TearsheetBrowser`, `FakeFetcher`, and `pipeline._get`; `build_annual_reports`/`build_dividends`/`load_*` signatures match across tasks; endpoint fragments match the verified URLs. ✔
- **Known model nuance:** `cash_percent`/`cash_dividend` DecimalFields are 2-dp, so 0.2632 persists as 0.26 — asserted as such in Task 5.
