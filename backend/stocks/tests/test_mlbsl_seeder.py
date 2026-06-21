from decimal import Decimal
import pytest
from django.core.management import call_command
from stocks.models import Company, Dividend, FinancialReport, StockFundamental


@pytest.mark.django_db
def test_mlbsl_seeder_creates_company():
    call_command('seed_misc_financials')
    company = Company.all_objects.get(symbol='MLBSL')
    assert company.name == 'Mahila Laghubitta Bittiya Sanstha Ltd'
    assert company.sector == 'Microfinance'


@pytest.mark.django_db
def test_mlbsl_seeder_creates_reports():
    call_command('seed_misc_financials')
    reports = FinancialReport.objects.filter(ticker='MLBSL', report_type='ANNUAL')
    assert reports.count() == 7

    report_080_081 = reports.get(fiscal_year='080-081')
    assert report_080_081.revenue == Decimal('278846141.46')
    assert report_080_081.net_profit == Decimal('48136661.30')
    assert report_080_081.cash_flow['OPERATING']['net_operating_cash'] == -5611693.00


@pytest.mark.django_db
def test_mlbsl_seeder_creates_dividends():
    call_command('seed_misc_financials')
    div = Dividend.objects.get(ticker='MLBSL', fiscal_year='2078/2079')
    assert div.bonus_percent == 47.50
    assert div.cash_percent == 2.50
    assert div.total_percent == 50.00
    assert str(div.book_close_date) == '2023-02-17'


@pytest.mark.django_db
def test_mlbsl_seeder_updates_fundamentals():
    # Setup: Create a daily stock price for MLBSL so recalculate_fundamentals works
    from django.utils import timezone
    from stocks.models import DailyStockPrice
    DailyStockPrice.objects.create(
        ticker='MLBSL',
        date=timezone.now().date(),
        open=Decimal('1769.90'),
        high=Decimal('1769.90'),
        low=Decimal('1769.90'),
        close=Decimal('1769.90'),
        volume=1000
    )
    call_command('seed_misc_financials')
    fundamental = StockFundamental.objects.get(ticker='MLBSL')
    assert fundamental.eps == Decimal('22.13')
    assert fundamental.book_value == Decimal('201.43')
    assert fundamental.ro_equity == Decimal('10.98')


@pytest.mark.django_db
def test_mlbsl_seeder_creates_corporate_actions():
    from stocks.models import CorporateAction
    call_command('seed_misc_financials')
    actions = CorporateAction.objects.filter(ticker='MLBSL').order_by('ex_date')
    assert actions.count() == 2

    # 2077/2078
    action_1 = actions[0]
    assert action_1.action_type == CorporateAction.ActionType.BONUS
    assert str(action_1.ex_date) == '2021-12-02'
    assert action_1.ratio_percent == Decimal('47.50')
    assert abs(action_1.adjustment_factor - 0.677966) < 1e-5

    # 2078/2079
    action_2 = actions[1]
    assert action_2.action_type == CorporateAction.ActionType.BONUS
    assert str(action_2.ex_date) == '2023-02-17'
    assert action_2.ratio_percent == Decimal('47.50')
    assert abs(action_2.adjustment_factor - 0.677966) < 1e-5

