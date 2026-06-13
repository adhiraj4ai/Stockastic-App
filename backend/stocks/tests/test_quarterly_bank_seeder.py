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
