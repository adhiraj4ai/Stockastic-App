from decimal import Decimal
import pytest
from django.core.management import call_command
from stocks.models import Company, FinancialReport


@pytest.mark.django_db
def test_city_quarterly_seeder_creates_company():
    call_command('seed_city_quarterly')
    company = Company.all_objects.get(symbol='CITY')
    assert company.name == 'City Hotel Limited'


@pytest.mark.django_db
def test_city_quarterly_seeder_creates_reports():
    call_command('seed_city_quarterly')
    reports = FinancialReport.objects.filter(ticker='CITY', report_type='QUARTERLY')
    assert reports.count() == 10
    
    report_082_083_q3 = reports.get(fiscal_year='082-083', quarter=3)
    assert report_082_083_q3.revenue == 356799540.0
    assert report_082_083_q3.eps == Decimal('-6.14')
    assert report_082_083_q3.book_value == Decimal('97.28')


@pytest.mark.django_db
def test_city_quarterly_seeder_is_idempotent():
    call_command('seed_city_quarterly')
    call_command('seed_city_quarterly')
    assert Company.all_objects.filter(symbol='CITY').count() == 1
    assert FinancialReport.objects.filter(ticker='CITY', report_type='QUARTERLY').count() == 10
