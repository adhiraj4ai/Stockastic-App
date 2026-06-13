from decimal import Decimal
import pytest
from django.core.management import call_command
from stocks.models import Company, FinancialReport


@pytest.mark.django_db
def test_city_seeder_creates_company():
    call_command('seed_city_annual')
    company = Company.all_objects.get(symbol='CITY')
    assert company.name == 'City Hotel Limited'
    assert company.sector == 'Hotels And Tourism'


@pytest.mark.django_db
def test_city_seeder_creates_reports():
    call_command('seed_city_annual')
    reports = FinancialReport.objects.filter(ticker='CITY', report_type='ANNUAL')
    assert reports.count() == 3
    
    report_080_081 = reports.get(fiscal_year='080-081')
    assert report_080_081.revenue == Decimal('504231032.71')
    assert report_080_081.net_profit == Decimal('-203224990.17')
    assert report_080_081.cash_flow['OPERATING ACTIVITIES']['Net Cash Flow From Operating Activities'] == 53580401.07


@pytest.mark.django_db
def test_city_seeder_is_idempotent():
    call_command('seed_city_annual')
    call_command('seed_city_annual')
    assert Company.all_objects.filter(symbol='CITY').count() == 1
    assert FinancialReport.objects.filter(ticker='CITY', report_type='ANNUAL').count() == 3
