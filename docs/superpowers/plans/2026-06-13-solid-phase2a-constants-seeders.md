# SOLID Phase 2a: Named Constants + Quarterly Seeder Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate all magic numbers from five backend modules by extracting them into a single `stocks/constants.py`, and reduce 18 near-identical quarterly bank seeder commands (~1,800 lines of boilerplate) to a single base class plus 18 data-only subclasses, without altering any runtime behaviour.

**Architecture:** A new `stocks/constants.py` module holds every domain constant. Five files import from it via named imports. A new private Django management command module `_quarterly_bank_seeder.py` (leading underscore prevents Django from registering it as a command) provides `QuarterlyBankSeeder(BaseCommand)`. Each of the 18 seeder files is reduced to a three-attribute subclass: `symbol`, `company_name`, and `quarterly_data`.

**Tech Stack:** Django 5.2, DRF, Python 3.12, pytest + pytest-django, Decimal arithmetic.

---

### Task 1: Create `stocks/constants.py`

**Files:**
- Create: `backend/stocks/constants.py`
- Create: `backend/stocks/tests/test_constants.py`

- [ ] Step 1 — Write a failing test. Create `backend/stocks/tests/test_constants.py`:

```python
# backend/stocks/tests/test_constants.py
import pytest


def test_constants_are_importable():
    from stocks.constants import (
        ANNUAL_TRADING_DAYS,
        RISK_FREE_RATE_ANNUAL,
        WITHHOLDING_TAX_RATE,
        FACE_VALUE_PER_SHARE,
        GRAHAM_NUMBER_MULTIPLIER,
        OPTIMIZATION_HISTORY_DAYS,
        MIN_OPTIMIZATION_DAYS,
        DYNAMIC_MAX_WEIGHT_SCALE,
        MIN_DYNAMIC_MAX_WEIGHT,
        MAX_DYNAMIC_MAX_WEIGHT,
        ANNUAL_REPORTS_FETCH_COUNT,
    )
    assert ANNUAL_TRADING_DAYS == 252
    assert RISK_FREE_RATE_ANNUAL == 0.06
    assert WITHHOLDING_TAX_RATE == 0.05
    assert FACE_VALUE_PER_SHARE == 100
    assert GRAHAM_NUMBER_MULTIPLIER == 22.5
    assert OPTIMIZATION_HISTORY_DAYS == 730
    assert MIN_OPTIMIZATION_DAYS == 20
    assert DYNAMIC_MAX_WEIGHT_SCALE == 1.3
    assert MIN_DYNAMIC_MAX_WEIGHT == 0.6
    assert MAX_DYNAMIC_MAX_WEIGHT == 0.95
    assert ANNUAL_REPORTS_FETCH_COUNT == 5


def test_constant_types():
    from stocks.constants import (
        ANNUAL_TRADING_DAYS,
        FACE_VALUE_PER_SHARE,
        ANNUAL_REPORTS_FETCH_COUNT,
        MIN_OPTIMIZATION_DAYS,
        OPTIMIZATION_HISTORY_DAYS,
        RISK_FREE_RATE_ANNUAL,
        WITHHOLDING_TAX_RATE,
        GRAHAM_NUMBER_MULTIPLIER,
        DYNAMIC_MAX_WEIGHT_SCALE,
        MIN_DYNAMIC_MAX_WEIGHT,
        MAX_DYNAMIC_MAX_WEIGHT,
    )
    assert isinstance(ANNUAL_TRADING_DAYS, int)
    assert isinstance(FACE_VALUE_PER_SHARE, int)
    assert isinstance(ANNUAL_REPORTS_FETCH_COUNT, int)
    assert isinstance(MIN_OPTIMIZATION_DAYS, int)
    assert isinstance(OPTIMIZATION_HISTORY_DAYS, int)
    assert isinstance(RISK_FREE_RATE_ANNUAL, float)
    assert isinstance(WITHHOLDING_TAX_RATE, float)
    assert isinstance(GRAHAM_NUMBER_MULTIPLIER, float)
    assert isinstance(DYNAMIC_MAX_WEIGHT_SCALE, float)
    assert isinstance(MIN_DYNAMIC_MAX_WEIGHT, float)
    assert isinstance(MAX_DYNAMIC_MAX_WEIGHT, float)
```

- [ ] Step 2 — Run the test and confirm it fails (ImportError expected):

```bash
cd backend && pytest stocks/tests/test_constants.py -v
# Expected: FAILED — ModuleNotFoundError: No module named 'stocks.constants'
```

- [ ] Step 3 — Create `backend/stocks/constants.py`:

```python
from __future__ import annotations

# Trading calendar
ANNUAL_TRADING_DAYS: int = 252

# Risk parameters
RISK_FREE_RATE_ANNUAL: float = 0.06

# Dividend / share structure
WITHHOLDING_TAX_RATE: float = 0.05
FACE_VALUE_PER_SHARE: int = 100

# Fundamental analysis
GRAHAM_NUMBER_MULTIPLIER: float = 22.5
ANNUAL_REPORTS_FETCH_COUNT: int = 5

# Portfolio optimisation
OPTIMIZATION_HISTORY_DAYS: int = 730
MIN_OPTIMIZATION_DAYS: int = 20
DYNAMIC_MAX_WEIGHT_SCALE: float = 1.3
MIN_DYNAMIC_MAX_WEIGHT: float = 0.6
MAX_DYNAMIC_MAX_WEIGHT: float = 0.95
```

- [ ] Step 4 — Run the test and confirm it passes:

```bash
cd backend && pytest stocks/tests/test_constants.py -v
# Expected: 2 passed
```

- [ ] Step 5 — Commit:

```bash
git add backend/stocks/constants.py backend/stocks/tests/test_constants.py
git commit -m "feat(constants): add named constants module"
```

---

### Task 2: Replace magic numbers in `optimization.py`

**Files:**
- Modify: `backend/stocks/optimization.py`

- [ ] Step 1 — Run the existing optimization tests as a baseline to confirm they currently pass:

```bash
cd backend && pytest stocks/tests/ -k "optim" -v
# Note the passing count — it must be the same after the refactor.
```

- [ ] Step 2 — Add the constants import at the top of `backend/stocks/optimization.py` (after existing imports):

```python
from stocks.constants import (
    ANNUAL_TRADING_DAYS,
    DYNAMIC_MAX_WEIGHT_SCALE,
    MIN_DYNAMIC_MAX_WEIGHT,
    MAX_DYNAMIC_MAX_WEIGHT,
    MIN_OPTIMIZATION_DAYS,
    OPTIMIZATION_HISTORY_DAYS,
)
```

- [ ] Step 3 — Replace magic numbers. Make all four substitutions:

  - Line 78: `timedelta(days=730)` → `timedelta(days=OPTIMIZATION_HISTORY_DAYS)`
  - Line 94: `len(df_pivoted) < 20` → `len(df_pivoted) < MIN_OPTIMIZATION_DAYS`
  - Line 95 (error string): `"(need 20+ days)"` → `f"(need {MIN_OPTIMIZATION_DAYS}+ days)"`
  - Lines 159, 160, 182, 183: `* 252` → `* ANNUAL_TRADING_DAYS`
  - Line 199: `max(0.6, min(0.95, 1.3 / len(tickers)))` →
    `max(MIN_DYNAMIC_MAX_WEIGHT, min(MAX_DYNAMIC_MAX_WEIGHT, DYNAMIC_MAX_WEIGHT_SCALE / len(tickers)))`

- [ ] Step 4 — Run tests again; count must be identical to baseline:

```bash
cd backend && pytest stocks/tests/ -k "optim" -v
# Expected: same number of tests passing as Step 1
```

- [ ] Step 5 — Commit:

```bash
git add backend/stocks/optimization.py
git commit -m "refactor(optimization): replace magic numbers with named constants"
```

---

### Task 3: Replace magic numbers in `portfolio.py` and `dividend_service.py`

**Files:**
- Modify: `backend/stocks/views/portfolio.py`
- Modify: `backend/stocks/services/dividend_service.py`

- [ ] Step 1 — Run relevant tests as baseline:

```bash
cd backend && pytest stocks/tests/test_finance.py -v
# Note passing count.
```

- [ ] Step 2 — Update `backend/stocks/views/portfolio.py`. Add import near the top of the file's existing import block:

```python
from stocks.constants import ANNUAL_TRADING_DAYS, RISK_FREE_RATE_ANNUAL
```

  Then at line 982, replace:

```python
rf_daily = 0.06 / 252  # ~6% annualized risk-free, daily
```

  with:

```python
rf_daily = RISK_FREE_RATE_ANNUAL / ANNUAL_TRADING_DAYS
```

  Also replace the two remaining `252` literals on lines 990 and 994:
  - `* 252` → `* ANNUAL_TRADING_DAYS`
  - `* (252 ** 0.5)` → `* (ANNUAL_TRADING_DAYS ** 0.5)`

- [ ] Step 3 — Update `backend/stocks/services/dividend_service.py`. Add import:

```python
from stocks.constants import FACE_VALUE_PER_SHARE, WITHHOLDING_TAX_RATE
```

  Replace the hard-coded return value in `_face_value()`:

```python
# Before:
return Decimal('100')

# After:
return Decimal(str(FACE_VALUE_PER_SHARE))
```

  Replace the inline withholding rate on line 194:

```python
# Before:
tax = gross_cash * Decimal('0.05')  # standard 5% withholding

# After:
tax = gross_cash * Decimal(str(WITHHOLDING_TAX_RATE))
```

- [ ] Step 4 — Run tests:

```bash
cd backend && pytest stocks/tests/test_finance.py -v
# Expected: same count as Step 1 baseline
```

- [ ] Step 5 — Commit:

```bash
git add backend/stocks/views/portfolio.py backend/stocks/services/dividend_service.py
git commit -m "refactor(portfolio,dividend): replace magic numbers with named constants"
```

---

### Task 4: Replace magic numbers in `fundamental_calculator.py`

**Files:**
- Modify: `backend/stocks/services/fundamental_calculator.py`

- [ ] Step 1 — Run baseline:

```bash
cd backend && pytest stocks/tests/test_fundamental_calculator.py -v
# Note passing count.
```

- [ ] Step 2 — Add import to `backend/stocks/services/fundamental_calculator.py`:

```python
from stocks.constants import ANNUAL_REPORTS_FETCH_COUNT, GRAHAM_NUMBER_MULTIPLIER
```

- [ ] Step 3 — Replace the `[:5]` slice (line 143):

```python
# Before:
.order_by('-fiscal_year')[:5]

# After:
.order_by('-fiscal_year')[:ANNUAL_REPORTS_FETCH_COUNT]
```

- [ ] Step 4 — Replace the Graham multiplier (line 281):

```python
# Before:
graham = math.sqrt(22.5 * eps * book_value)

# After:
graham = math.sqrt(GRAHAM_NUMBER_MULTIPLIER * eps * book_value)
```

- [ ] Step 5 — Run tests:

```bash
cd backend && pytest stocks/tests/test_fundamental_calculator.py -v
# Expected: same count as Step 1 baseline
```

- [ ] Step 6 — Commit:

```bash
git add backend/stocks/services/fundamental_calculator.py
git commit -m "refactor(fundamentals): replace magic numbers with named constants"
```

---

### Task 5: Create `_quarterly_bank_seeder.py` base class

**Files:**
- Create: `backend/stocks/management/commands/_quarterly_bank_seeder.py`
- Create: `backend/stocks/tests/test_quarterly_bank_seeder.py`

- [ ] Step 1 — Write failing tests. Create `backend/stocks/tests/test_quarterly_bank_seeder.py`:

```python
# backend/stocks/tests/test_quarterly_bank_seeder.py
from io import StringIO
from unittest.mock import MagicMock
import pytest
from stocks.management.commands._quarterly_bank_seeder import QuarterlyBankSeeder

MINIMAL_DATA = {
    '082/083': {
        1: {
            'paid_up_capital': 1000.0, 'retained_earnings': 100.0, 'reserves': 500.0,
            'total_equity': 1600.0, 'total_assets': 10000.0, 'deposits': 8000.0,
            'borrowings': 500.0, 'loans_bfis': 200.0, 'loans_customers': 7000.0,
            'investment_securities': 1000.0, 'interest_income': 500.0,
            'net_interest_income': 300.0, 'total_operating_income': 350.0,
            'operating_profit': 120.0, 'net_profit': 90.0, 'distributable_profit': 100.0,
            'num_shares': 10000000.0, 'eps': 9.0, 'book_value': 160.0, 'roe': 5.6,
            'car': 12.0, 'npl': 2.0, 'cost_of_funds': 4.0, 'cd_ratio': 80.0,
            'base_rate': 6.0, 'interest_spread': 3.0,
        }
    }
}


class ConcreteSeeder(QuarterlyBankSeeder):
    symbol = 'TEST'
    company_name = 'Test Bank Limited'
    quarterly_data = MINIMAL_DATA


def _make_cmd() -> ConcreteSeeder:
    cmd = ConcreteSeeder()
    cmd.stdout = StringIO()
    cmd.style = MagicMock(SUCCESS=lambda x: x, WARNING=lambda x: x)
    return cmd


@pytest.mark.django_db
def test_seeder_creates_financial_report():
    from stocks.models import FinancialReport
    _make_cmd().handle()
    assert FinancialReport.objects.filter(
        ticker='TEST', quarter=1, report_type='QUARTERLY'
    ).exists()


@pytest.mark.django_db
def test_seeder_builds_correct_balance_sheet():
    from stocks.models import FinancialReport
    _make_cmd().handle()
    report = FinancialReport.objects.get(ticker='TEST', quarter=1)
    assert report.balance_sheet['SUMMARY']['total_assets'] == 10000.0 * 1000


@pytest.mark.django_db
def test_seeder_idempotent():
    from stocks.models import FinancialReport
    cmd = _make_cmd()
    cmd.handle()
    cmd.handle()
    assert FinancialReport.objects.filter(ticker='TEST', quarter=1).count() == 1


@pytest.mark.django_db
def test_seeder_creates_company():
    from stocks.models import Company
    _make_cmd().handle()
    assert Company.objects.filter(symbol='TEST').exists()


@pytest.mark.django_db
def test_seeder_profit_loss_structure():
    from stocks.models import FinancialReport
    _make_cmd().handle()
    report = FinancialReport.objects.get(ticker='TEST', quarter=1)
    pl = report.profit_loss
    assert pl['PL']['net_profit'] == 90.0 * 1000
    assert pl['RATIOS']['eps_annualized'] == 9.0


@pytest.mark.django_db
def test_seeder_key_ratios_structure():
    from stocks.models import FinancialReport
    _make_cmd().handle()
    report = FinancialReport.objects.get(ticker='TEST', quarter=1)
    kr = report.key_ratios
    assert kr['Per Share']['EPS (annualized)'] == 9.0
    assert kr['Performance']['ROE'] == 5.6
```

- [ ] Step 2 — Run and confirm failure (ImportError expected):

```bash
cd backend && pytest stocks/tests/test_quarterly_bank_seeder.py -v
# Expected: FAILED — ModuleNotFoundError: No module named 'stocks.management.commands._quarterly_bank_seeder'
```

- [ ] Step 3 — Create `backend/stocks/management/commands/_quarterly_bank_seeder.py`:

```python
from __future__ import annotations
from decimal import Decimal
from django.core.management.base import BaseCommand
from stocks.models import Company, FinancialReport

_THOUSANDS = 1000


class QuarterlyBankSeeder(BaseCommand):
    """Base class for quarterly bank financial report seeders.

    Subclasses must set `symbol`, `company_name`, and `quarterly_data`.
    Django will not register this as a command because the filename starts
    with an underscore.
    """

    symbol: str = ''
    company_name: str = ''
    sector: str = 'Commercial Banks'
    quarterly_data: dict = {}

    def handle(self, *args, **kwargs) -> None:
        self.stdout.write(f'Seeding {self.symbol} quarterly financial data...')
        self._ensure_company()
        created, updated = self._upsert_all()
        self._print_summary(created, updated)

    def _ensure_company(self) -> None:
        Company.objects.get_or_create(
            symbol=self.symbol,
            defaults={
                'name': self.company_name,
                'sector': self.sector,
                'instrument_type': 'Equity',
            },
        )

    def _upsert_all(self) -> tuple[int, int]:
        created = updated = 0
        for fiscal_year, quarters in self.quarterly_data.items():
            for quarter, data in quarters.items():
                was_created = self._upsert_one(
                    fiscal_year.replace('/', '-'), quarter, data
                )
                if was_created:
                    created += 1
                    self.stdout.write(
                        self.style.SUCCESS(f'Created FY {fiscal_year} Q{quarter}')
                    )
                else:
                    updated += 1
                    self.stdout.write(
                        self.style.WARNING(f'Updated FY {fiscal_year} Q{quarter}')
                    )
        return created, updated

    def _upsert_one(self, formatted_fy: str, quarter: int, d: dict) -> bool:
        _, created = FinancialReport.objects.update_or_create(
            ticker=self.symbol,
            fiscal_year=formatted_fy,
            report_type='QUARTERLY',
            quarter=quarter,
            defaults=self._build_defaults(d),
        )
        return created

    def _build_defaults(self, d: dict) -> dict:
        return {
            'is_audited': False,
            'report_template': 'BANK_QUARTERLY',
            'balance_sheet': self._build_balance_sheet(d),
            'profit_loss': self._build_profit_loss(d),
            'key_ratios': self._build_key_ratios(d),
            'paid_up_capital': Decimal(str(d['paid_up_capital'] * _THOUSANDS)),
            'reserves_and_surplus': Decimal(str(d['reserves'] * _THOUSANDS)),
            'net_profit': Decimal(str(d['net_profit'] * _THOUSANDS)),
            'eps': Decimal(str(d['eps'])),
            'book_value': Decimal(str(d['book_value'])),
            'return_on_equity': Decimal(str(d['roe'])),
        }

    @staticmethod
    def _build_balance_sheet(d: dict) -> dict:
        t = _THOUSANDS
        return {
            'SUMMARY': {
                'placement_bfis': d['loans_bfis'] * t,
                'loans_customers': d['loans_customers'] * t,
                'investment_securities': d['investment_securities'] * t,
                'total_assets': d['total_assets'] * t,
                'deposits_customers': d['deposits'] * t,
                'borrowings': d['borrowings'] * t,
                'paid_up_capital': d['paid_up_capital'] * t,
                'reserves': d['reserves'] * t,
                'total_equity': d['total_equity'] * t,
            }
        }

    @staticmethod
    def _build_profit_loss(d: dict) -> dict:
        t = _THOUSANDS
        return {
            'PL': {
                'interest_income': d['interest_income'] * t,
                'net_interest_income': d['net_interest_income'] * t,
                'net_fee_income': None,
                'total_operating_income': d['total_operating_income'] * t,
                'impairment_charges': None,
                'operating_profit': d['operating_profit'] * t,
                'net_profit': d['net_profit'] * t,
                'distributable_profit': d['distributable_profit'] * t,
            },
            'RATIOS': {
                'eps_annualized': d['eps'],
                'npl': d['npl'],
                'cost_of_funds': d['cost_of_funds'],
                'cd_ratio': d['cd_ratio'],
                'base_rate': d['base_rate'],
                'spread': d['interest_spread'],
                'book_value': d['book_value'],
            },
        }

    @staticmethod
    def _build_key_ratios(d: dict) -> dict:
        return {
            'Per Share': {
                'EPS (annualized)': d['eps'],
                'Book Value': d['book_value'],
            },
            'Performance': {
                'ROE': d['roe'],
                'CAR': d['car'],
                'NPL': d['npl'],
                'Cost of Funds': d['cost_of_funds'],
                'CD Ratio': d['cd_ratio'],
                'Base Rate': d['base_rate'],
                'Interest Spread': d['interest_spread'],
            },
        }

    def _print_summary(self, created: int, updated: int) -> None:
        self.stdout.write(
            self.style.SUCCESS(f'\nQuarterly reports for {self.symbol}')
        )
        self.stdout.write(f'  Created: {created}  Updated: {updated}')
```

- [ ] Step 4 — Run tests and confirm all pass:

```bash
cd backend && pytest stocks/tests/test_quarterly_bank_seeder.py -v
# Expected: 6 passed
```

- [ ] Step 5 — Commit:

```bash
git add backend/stocks/management/commands/_quarterly_bank_seeder.py \
        backend/stocks/tests/test_quarterly_bank_seeder.py
git commit -m "feat(seed): add QuarterlyBankSeeder base class"
```

---

### Task 6: Refactor ADBL seeder as the template example

**Files:**
- Modify: `backend/stocks/management/commands/seed_adbl_quarterly.py`

- [ ] Step 1 — Open `seed_adbl_quarterly.py`. Identify the `quarterly_data` dict (starts after the `quarterly_data = {` line, ends before `created_count = 0`). Copy the entire dict.

- [ ] Step 2 — Replace the entire file content with the slim subclass pattern. The ONLY thing kept from the original file is the `quarterly_data` dict literal:

```python
from stocks.management.commands._quarterly_bank_seeder import QuarterlyBankSeeder


class Command(QuarterlyBankSeeder):
    help = 'Seeds ADBL quarterly financial reports'
    symbol = 'ADBL'
    company_name = 'Agricultural Development Bank Limited'
    quarterly_data = {
        # <paste the exact quarterly_data dict from the original file here>
    }
```

- [ ] Step 3 — Verify the command loads without errors and the tests still pass:

```bash
cd backend && python manage.py seed_adbl_quarterly --help
# Expected: no ImportError; prints help text

cd backend && pytest stocks/tests/test_quarterly_bank_seeder.py -v
# Expected: 6 passed (unchanged)
```

- [ ] Step 4 — Commit:

```bash
git add backend/stocks/management/commands/seed_adbl_quarterly.py
git commit -m "refactor(seed): slim seed_adbl_quarterly to data-only subclass"
```

---

### Task 7: Refactor remaining 17 quarterly seeders

**Files:**
- Modify (17 files): `seed_czbil_quarterly.py`, `seed_gbime_quarterly.py`, `seed_hbl_quarterly.py`, `seed_kbl_quarterly.py`, `seed_lsl_quarterly.py`, `seed_mbl_quarterly.py`, `seed_nabil_quarterly.py`, `seed_nbl_quarterly.py`, `seed_nica_quarterly.py`, `seed_nimb_quarterly.py`, `seed_nmb_quarterly.py`, `seed_pcbl_quarterly.py`, `seed_prvu_quarterly.py`, `seed_sanima_quarterly.py`, `seed_sbi_quarterly.py`, `seed_sbl_quarterly.py`, `seed_scb_quarterly.py`

All files live in `backend/stocks/management/commands/`.

Apply the exact same pattern as Task 6 to each file. The symbol → company name mapping is:

| File | `symbol` | `company_name` |
|------|----------|----------------|
| `seed_czbil_quarterly.py` | `CZBIL` | `Citizens Bank International Limited` |
| `seed_gbime_quarterly.py` | `GBIME` | `Global IME Bank Limited` |
| `seed_hbl_quarterly.py` | `HBL` | `Himalayan Bank Limited` |
| `seed_kbl_quarterly.py` | `KBL` | `Kumari Bank Limited` |
| `seed_lsl_quarterly.py` | `LSL` | `Laxmi Sunrise Bank Limited` |
| `seed_mbl_quarterly.py` | `MBL` | `Machhapuchchhre Bank Limited` |
| `seed_nabil_quarterly.py` | `NABIL` | `Nabil Bank Limited` |
| `seed_nbl_quarterly.py` | `NBL` | `Nepal Bank Limited` |
| `seed_nica_quarterly.py` | `NICA` | `NIC Asia Bank Limited` |
| `seed_nimb_quarterly.py` | `NIMB` | `Nepal Investment Mega Bank Limited` |
| `seed_nmb_quarterly.py` | `NMB` | `NMB Bank Limited` |
| `seed_pcbl_quarterly.py` | `PCBL` | `Prime Commercial Bank Limited` |
| `seed_prvu_quarterly.py` | `PRVU` | `Prabhu Bank Limited` |
| `seed_sanima_quarterly.py` | `SANIMA` | `Sanima Bank Limited` |
| `seed_sbi_quarterly.py` | `SBI` | `Nepal SBI Bank Limited` |
| `seed_sbl_quarterly.py` | `SBL` | `Siddhartha Bank Limited` |
| `seed_scb_quarterly.py` | `SCB` | `Standard Chartered Bank Nepal Limited` |

- [ ] Step 1 — For each of the 17 files, perform the same transformation as Task 6:
  1. Copy the `quarterly_data` dict from the file.
  2. Replace the entire file with the slim three-attribute subclass.
  3. Confirm the `help` string, `symbol`, and `company_name` match the table above.

- [ ] Step 2 — Verify all 17 commands load cleanly with a single shell loop:

```bash
cd backend && for cmd in czbil gbime hbl kbl lsl mbl nabil nbl nica nimb nmb pcbl prvu sanima sbi sbl scb; do
  python manage.py seed_${cmd}_quarterly --help > /dev/null && echo "OK: $cmd" || echo "FAIL: $cmd"
done
# Expected: 17 lines of "OK: <symbol>"
```

- [ ] Step 3 — Run the full seeder test suite one final time:

```bash
cd backend && pytest stocks/tests/test_quarterly_bank_seeder.py stocks/tests/test_constants.py -v
# Expected: 8 passed (6 seeder + 2 constants)
```

- [ ] Step 4 — Commit:

```bash
git add backend/stocks/management/commands/seed_czbil_quarterly.py \
        backend/stocks/management/commands/seed_gbime_quarterly.py \
        backend/stocks/management/commands/seed_hbl_quarterly.py \
        backend/stocks/management/commands/seed_kbl_quarterly.py \
        backend/stocks/management/commands/seed_lsl_quarterly.py \
        backend/stocks/management/commands/seed_mbl_quarterly.py \
        backend/stocks/management/commands/seed_nabil_quarterly.py \
        backend/stocks/management/commands/seed_nbl_quarterly.py \
        backend/stocks/management/commands/seed_nica_quarterly.py \
        backend/stocks/management/commands/seed_nimb_quarterly.py \
        backend/stocks/management/commands/seed_nmb_quarterly.py \
        backend/stocks/management/commands/seed_pcbl_quarterly.py \
        backend/stocks/management/commands/seed_prvu_quarterly.py \
        backend/stocks/management/commands/seed_sanima_quarterly.py \
        backend/stocks/management/commands/seed_sbi_quarterly.py \
        backend/stocks/management/commands/seed_sbl_quarterly.py \
        backend/stocks/management/commands/seed_scb_quarterly.py
git commit -m "refactor(seed): slim 17 remaining quarterly seeders to data-only subclasses"
```

---

## Completion checklist

- [ ] `stocks/constants.py` exists and all 11 constants are correctly typed
- [ ] `optimization.py` has zero bare numeric literals for the five replaced constants
- [ ] `portfolio.py` line ~982 reads `RISK_FREE_RATE_ANNUAL / ANNUAL_TRADING_DAYS`
- [ ] `dividend_service.py` reads `Decimal(str(WITHHOLDING_TAX_RATE))` and `Decimal(str(FACE_VALUE_PER_SHARE))`
- [ ] `fundamental_calculator.py` reads `[:ANNUAL_REPORTS_FETCH_COUNT]` and `GRAHAM_NUMBER_MULTIPLIER`
- [ ] `_quarterly_bank_seeder.py` exists; Django does NOT list it in `python manage.py help`
- [ ] All 18 seeder files follow the three-attribute subclass pattern
- [ ] `pytest stocks/tests/test_constants.py stocks/tests/test_quarterly_bank_seeder.py` reports 8 passed
- [ ] All pre-existing tests remain green: `pytest stocks/tests/ -x`
- [ ] 6 commits total, one per task group, with the messages specified above
