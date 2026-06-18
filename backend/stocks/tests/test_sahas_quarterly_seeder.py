from decimal import Decimal
import pytest
from django.core.management import call_command
from stocks.models import Company, FinancialReport


@pytest.mark.django_db
def test_sahas_quarterly_seeder_creates_company():
    call_command('seed_sahas_quarterly')
    company = Company.all_objects.get(symbol='SAHAS')
    assert company.name == 'Sahas Urja Limited'


@pytest.mark.django_db
def test_sahas_quarterly_seeder_creates_reports():
    call_command('seed_sahas_quarterly')
    reports = FinancialReport.objects.filter(ticker='SAHAS', report_type='QUARTERLY')
    assert reports.count() == 8
    
    report_082_083_q3 = reports.get(fiscal_year='082-083', quarter=3)
    assert report_082_083_q3.revenue == 2336201710.0
    assert report_082_083_q3.eps == Decimal('34.48')
    assert report_082_083_q3.book_value == Decimal('176.74')
    assert report_082_083_q3.balance_sheet['SUMMARY']['long_term_loans'] == 10326966130.0


@pytest.mark.django_db
def test_sahas_quarterly_seeder_is_idempotent():
    call_command('seed_sahas_quarterly')
    call_command('seed_sahas_quarterly')
    assert Company.all_objects.filter(symbol='SAHAS').count() == 1
    assert FinancialReport.objects.filter(ticker='SAHAS', report_type='QUARTERLY').count() == 8
