from decimal import Decimal
import pytest
from django.core.management import call_command
from stocks.models import Company, FinancialReport


@pytest.mark.django_db
def test_cgh_quarterly_seeder_creates_company():
    call_command('seed_cgh_quarterly')
    company = Company.all_objects.get(symbol='CGH')
    assert company.name == 'Chandragiri Hills Limited'


@pytest.mark.django_db
def test_cgh_quarterly_seeder_creates_reports():
    call_command('seed_cgh_quarterly')
    reports = FinancialReport.objects.filter(ticker='CGH', report_type='QUARTERLY')
    assert reports.count() == 16
    
    report_082_083_q3 = reports.get(fiscal_year='082-083', quarter=3)
    assert report_082_083_q3.revenue == 455866030.0
    assert report_082_083_q3.eps == Decimal('-0.78')
    assert report_082_083_q3.book_value == Decimal('100.20')


@pytest.mark.django_db
def test_cgh_quarterly_seeder_is_idempotent():
    call_command('seed_cgh_quarterly')
    call_command('seed_cgh_quarterly')
    assert Company.all_objects.filter(symbol='CGH').count() == 1
    assert FinancialReport.objects.filter(ticker='CGH', report_type='QUARTERLY').count() == 16
