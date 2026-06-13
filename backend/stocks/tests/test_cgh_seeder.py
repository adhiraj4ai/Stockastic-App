from decimal import Decimal
import pytest
from django.core.management import call_command
from stocks.models import Company, Dividend, FinancialReport


@pytest.mark.django_db
def test_cgh_seeder_creates_company():
    call_command('seed_cgh_annual')
    company = Company.all_objects.get(symbol='CGH')
    assert company.name == 'Chandragiri Hills Limited'
    assert company.sector == 'Hotels And Tourism'


@pytest.mark.django_db
def test_cgh_seeder_creates_reports():
    call_command('seed_cgh_annual')
    reports = FinancialReport.objects.filter(ticker='CGH', report_type='ANNUAL')
    assert reports.count() == 7
    
    report_080_081 = reports.get(fiscal_year='080-081')
    assert report_080_081.revenue == 1000115981.0
    assert report_080_081.cash_flow['OPERATING ACTIVITIES']['Net Cash Flow From Operating Activities'] == 530215096.06


@pytest.mark.django_db
def test_cgh_seeder_creates_dividends():
    call_command('seed_cgh_annual')
    div = Dividend.objects.get(ticker='CGH', fiscal_year='2081/2082')
    assert div.bonus_percent == 5.0
    assert div.cash_percent == Decimal('0.26')
    assert div.total_percent == Decimal('5.26')
    assert str(div.book_close_date) == '2025-12-26'


@pytest.mark.django_db
def test_cgh_seeder_is_idempotent():
    call_command('seed_cgh_annual')
    call_command('seed_cgh_annual')
    assert Company.all_objects.filter(symbol='CGH').count() == 1
    assert FinancialReport.objects.filter(ticker='CGH', report_type='ANNUAL').count() == 7
    assert Dividend.objects.filter(ticker='CGH', fiscal_year='2081/2082').count() == 1
