from decimal import Decimal
import pytest
from django.core.management import call_command
from stocks.models import Company, FinancialReport


@pytest.mark.django_db
def test_men_quarterly_seeder_creates_company():
    call_command('seed_men_quarterly')
    company = Company.all_objects.get(symbol='MEN')
    assert company.name == 'Mountain Energy Nepal Limited'


@pytest.mark.django_db
def test_men_quarterly_seeder_creates_reports():
    call_command('seed_men_quarterly')
    reports = FinancialReport.objects.filter(ticker='MEN', report_type='QUARTERLY')
    assert reports.count() == 8
    
    report_082_083_q3 = reports.get(fiscal_year='082-083', quarter=3)
    assert report_082_083_q3.revenue == 1108761260.0
    assert report_082_083_q3.eps == Decimal('22.52')
    assert report_082_083_q3.book_value == Decimal('142.24')
    assert report_082_083_q3.balance_sheet['SUMMARY']['long_term_loans'] == 2837563320.0


@pytest.mark.django_db
def test_men_quarterly_seeder_is_idempotent():
    call_command('seed_men_quarterly')
    call_command('seed_men_quarterly')
    assert Company.all_objects.filter(symbol='MEN').count() == 1
    assert FinancialReport.objects.filter(ticker='MEN', report_type='QUARTERLY').count() == 8
