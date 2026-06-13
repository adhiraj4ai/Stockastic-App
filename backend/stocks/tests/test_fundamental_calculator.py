"""Tests for fiscal-year normalization and the fundamental calculator service."""
from datetime import date
from decimal import Decimal

import pytest

from stocks.models import Company, DailyStockPrice, FinancialReport, StockFundamental
from stocks.services.fundamental_calculator import (
    normalize_fiscal_year,
    recalculate_fundamentals,
)


class TestNormalizeFiscalYear:
    @pytest.mark.parametrize("raw,expected", [
        ("2081/82", "081-082"),
        ("2082/83", "082-083"),
        ("082/083", "082-083"),
        ("2079/80", "079-080"),
        ("072-073", "072-073"),
        ("080-081", "080-081"),
        ("081-82", "081-082"),
    ])
    def test_normalizes_known_formats(self, raw, expected):
        assert normalize_fiscal_year(raw) == expected

    def test_passes_through_unparseable_values(self):
        assert normalize_fiscal_year("Unknown") == "Unknown"
        assert normalize_fiscal_year("") == ""
        assert normalize_fiscal_year(None) is None


@pytest.mark.django_db
class TestFinancialReportSaveNormalization:
    def test_save_normalizes_fiscal_year(self):
        report = FinancialReport.objects.create(
            ticker="NORM",
            fiscal_year="2081/82",
            report_type=FinancialReport.ReportType.ANNUAL,
        )
        assert report.fiscal_year == "081-082"

    def test_update_or_create_normalizes_lookup(self):
        FinancialReport.objects.create(
            ticker="NORM",
            fiscal_year="2081/82",
            report_type=FinancialReport.ReportType.ANNUAL,
        )
        obj, created = FinancialReport.objects.update_or_create(
            ticker="NORM",
            fiscal_year="081/082",
            report_type=FinancialReport.ReportType.ANNUAL,
            quarter=None,
            defaults={"eps": Decimal("5")},
        )
        assert created is False
        assert obj.fiscal_year == "081-082"


@pytest.fixture
def seeded_ticker(db):
    ticker = "TBNK"
    Company.objects.create(symbol=ticker, name="Test Bank", sector="Commercial Banks", status="A")
    DailyStockPrice.objects.create(ticker=ticker, date=date(2026, 6, 10), close=Decimal("200"))

    # 10M shares (face value 100), latest annual year
    FinancialReport.objects.create(
        ticker=ticker,
        fiscal_year="080-081",
        report_type=FinancialReport.ReportType.ANNUAL,
        is_audited=True,
        cash_dividend=Decimal("5"),
        bonus_share=Decimal("0"),
        operating_profit=Decimal("150000000"),
        balance_sheet={
            "EQUITY": {"share_capital": 1_000_000_000, "total_equity": 1_500_000_000},
            "ASSETS": {"total_assets": 10_000_000_000},
            "LIABILITIES": {"total_liabilities": 8_500_000_000},
        },
        profit_loss={
            "INCOME": {"total_operating_income": 600_000_000},
            "EXPENSES": {"net_profit": 100_000_000},
        },
    )
    # Previous annual year for YoY growth: EPS 8 vs latest 10 -> +25%
    FinancialReport.objects.create(
        ticker=ticker,
        fiscal_year="079-080",
        report_type=FinancialReport.ReportType.ANNUAL,
        is_audited=True,
        balance_sheet={
            "EQUITY": {"share_capital": 1_000_000_000, "total_equity": 1_400_000_000},
            "ASSETS": {"total_assets": 9_000_000_000},
            "LIABILITIES": {"total_liabilities": 7_600_000_000},
        },
        profit_loss={
            "INCOME": {"total_operating_income": 500_000_000},
            "EXPENSES": {"net_profit": 80_000_000},
        },
    )
    # Quarterlies for QoQ growth and unaudited metrics
    FinancialReport.objects.create(
        ticker=ticker,
        fiscal_year="081-082",
        report_type=FinancialReport.ReportType.QUARTERLY,
        quarter=1,
        net_profit=Decimal("30000000"),
        revenue=Decimal("120000000"),
        eps=Decimal("12"),
        book_value=Decimal("160"),
    )
    FinancialReport.objects.create(
        ticker=ticker,
        fiscal_year="080-081",
        report_type=FinancialReport.ReportType.QUARTERLY,
        quarter=4,
        net_profit=Decimal("25000000"),
        eps=Decimal("10"),
        book_value=Decimal("150"),
    )
    return ticker


@pytest.mark.django_db
class TestRecalculateFundamentals:
    def test_core_metrics(self, seeded_ticker):
        fundamental = recalculate_fundamentals(seeded_ticker)
        assert fundamental.eps == Decimal("10.00")
        assert fundamental.book_value == Decimal("150.00")
        assert fundamental.ro_equity == Decimal("6.67")
        assert fundamental.ro_assets == Decimal("1.00")
        assert fundamental.pe_ratio == Decimal("20.00")
        assert fundamental.price_to_book == Decimal("1.33")
        assert fundamental.market_cap == Decimal("2000000000.00")
        assert fundamental.price_to_sales == Decimal("3.33")
        assert fundamental.debt_to_equity == Decimal("5.67")
        assert fundamental.shares_outstanding == Decimal("10000000.00")

    def test_unaudited_metrics_from_latest_quarterly(self, seeded_ticker):
        fundamental = recalculate_fundamentals(seeded_ticker)
        assert fundamental.eps_unaudited == Decimal("12.00")
        assert fundamental.book_value_unaudited == Decimal("160.00")
        # 200 / 12
        assert fundamental.pe_ratio_unaudited == Decimal("16.67")

    def test_growth_metrics(self, seeded_ticker):
        fundamental = recalculate_fundamentals(seeded_ticker)
        # Annual EPS 10 vs 8
        assert fundamental.yoy_earnings_growth == Decimal("25.00")
        # Quarterly net profit 30M vs 25M
        assert fundamental.qoq_earnings_growth == Decimal("20.00")
        # PEG = PE / YoY growth = 20 / 25
        assert fundamental.peg_ratio == Decimal("0.80")

    def test_dividend_metrics(self, seeded_ticker):
        fundamental = recalculate_fundamentals(seeded_ticker)
        # Cash dividend 5% of face value 100 = Rs 5/share at price 200
        assert fundamental.dividend_yield == Decimal("2.50")
        # Total dividend Rs 5 vs EPS 10
        assert fundamental.dividend_payout_ratio == Decimal("50.00")

    def test_dividend_fallback_to_dividend_table(self, seeded_ticker):
        from stocks.models import Dividend

        # Legacy tickers (e.g. NABIL) keep dividends only in the Dividend
        # table, not on FinancialReport rows
        FinancialReport.objects.filter(
            ticker=seeded_ticker, report_type=FinancialReport.ReportType.ANNUAL,
        ).update(cash_dividend=None, bonus_share=None)
        # Latest row uses a legacy fiscal-year format; an older row has a
        # bigger cash dividend that must NOT win
        Dividend.objects.create(
            ticker=seeded_ticker, fiscal_year="2081/82",
            cash_percent=Decimal("10"), bonus_percent=Decimal("5"),
        )
        Dividend.objects.create(
            ticker=seeded_ticker, fiscal_year="080-081",
            cash_percent=Decimal("99"), bonus_percent=Decimal("0"),
        )

        fundamental = recalculate_fundamentals(seeded_ticker)
        # Cash 10% of face value 100 = Rs 10/share at price 200
        assert fundamental.dividend_yield == Decimal("5.00")
        # Total Rs 15 vs EPS 10
        assert fundamental.dividend_payout_ratio == Decimal("150.00")

    def test_graham_number_diff(self, seeded_ticker):
        fundamental = recalculate_fundamentals(seeded_ticker)
        # Graham = sqrt(22.5 * 10 * 150) = 183.71; price 200 is 8.87% above
        assert fundamental.graham_number_diff == Decimal("8.87")

    def test_negative_eps_skips_pe_and_graham(self, seeded_ticker):
        latest = FinancialReport.objects.get(
            ticker=seeded_ticker, fiscal_year="080-081",
            report_type=FinancialReport.ReportType.ANNUAL,
        )
        latest.profit_loss["EXPENSES"]["net_profit"] = -50_000_000
        latest.save()
        fundamental = recalculate_fundamentals(seeded_ticker)
        assert fundamental.eps == Decimal("-5.00")
        assert fundamental.pe_ratio is None
        assert fundamental.graham_number_diff is None
        assert fundamental.peg_ratio is None

    def test_returns_none_without_reports(self):
        Company.objects.create(symbol="EMPT", name="Empty Co", sector="Others")
        assert recalculate_fundamentals("EMPT") is None

    def test_view_endpoint_uses_service(self, seeded_ticker, api_client):
        resp = api_client.post(f"/api/stocks/companies/{seeded_ticker}/refresh_fundamentals/")
        assert resp.status_code == 200
        assert resp.data["eps"] == "10.00"
        assert resp.data["yoy_earnings_growth"] == "25.00"


@pytest.mark.django_db
class TestExtendedMetrics:
    def test_earning_yield(self, seeded_ticker):
        fundamental = recalculate_fundamentals(seeded_ticker)
        # EPS 10 at price 200
        assert fundamental.earning_yield == Decimal("5.00")

    def test_margins_and_turnover(self, seeded_ticker):
        fundamental = recalculate_fundamentals(seeded_ticker)
        # Operating profit 150M / revenue 600M
        assert fundamental.operating_margin == Decimal("25.00")
        # Net profit 100M / revenue 600M
        assert fundamental.net_margin == Decimal("16.67")
        # Latest quarterly: 30M / 120M
        assert fundamental.net_margin_quarterly == Decimal("25.00")
        # Revenue 600M / total assets 10B
        assert fundamental.asset_turnover == Decimal("6.00")

    def test_pe_ratio_5yr_uses_average_eps(self, seeded_ticker):
        fundamental = recalculate_fundamentals(seeded_ticker)
        # Price 200 / mean EPS of (10, 8) = 200 / 9
        assert fundamental.pe_ratio_5yr == Decimal("22.22")

    def test_trends(self, seeded_ticker):
        fundamental = recalculate_fundamentals(seeded_ticker)
        # EPS 10 vs 8; ROE 6.67% vs 5.71%
        assert fundamental.eps_trend == "Positive"
        assert fundamental.roe_trend == "Positive"

    def test_negative_trends(self, seeded_ticker):
        latest = FinancialReport.objects.get(
            ticker=seeded_ticker, fiscal_year="080-081",
            report_type=FinancialReport.ReportType.ANNUAL,
        )
        latest.profit_loss["EXPENSES"]["net_profit"] = 50_000_000
        latest.save()
        fundamental = recalculate_fundamentals(seeded_ticker)
        # EPS 5 vs 8; ROE 3.33% vs 5.71%
        assert fundamental.eps_trend == "Negative"
        assert fundamental.roe_trend == "Negative"


@pytest.mark.django_db
class TestBetaCalculation:
    def test_beta_from_aligned_daily_returns(self, seeded_ticker):
        from datetime import timedelta
        from stocks.models import DailyIndexValue

        # 70 sessions where the stock return is exactly 2x the index return
        start = date(2026, 3, 1)
        index_value, stock_value = 1000.0, 500.0
        index_rows, stock_rows = [], []
        for i in range(70):
            d = start + timedelta(days=i)
            r = 0.01 if i % 2 == 0 else -0.005
            if i > 0:
                index_value *= 1 + r
                stock_value *= 1 + 2 * r
            index_rows.append(DailyIndexValue(
                index_name="NEPSE Index", date=d, value=Decimal(str(round(index_value, 4)))
            ))
            stock_rows.append(DailyStockPrice(
                ticker=seeded_ticker, date=d, close=Decimal(str(round(stock_value, 4)))
            ))
        DailyIndexValue.objects.bulk_create(index_rows)
        DailyStockPrice.objects.bulk_create(stock_rows)

        fundamental = recalculate_fundamentals(seeded_ticker)
        assert fundamental.beta_3m == Decimal("2.00")
        # Not enough history for the longer windows
        assert fundamental.beta_1y is None
        assert fundamental.beta_3y is None

    def test_beta_none_without_index_history(self, seeded_ticker):
        fundamental = recalculate_fundamentals(seeded_ticker)
        assert fundamental.beta_3m is None
        assert fundamental.beta_1y is None
        assert fundamental.beta_3y is None


@pytest.mark.django_db
class TestSectorEnrichment:
    def test_median_and_null_safe_high_low(self):
        from stocks.views.market import _enrich_fundamental_data

        for ticker, pe in [("AAA", "10"), ("BBB", "20"), ("CCC", "40"), ("DDD", None)]:
            StockFundamental.objects.create(
                ticker=ticker, company_name=ticker, sector="Test Sector",
                pe_ratio=Decimal(pe) if pe else None,
            )
        target = StockFundamental.objects.get(ticker="BBB")
        data = _enrich_fundamental_data({}, target)

        pe_row = next(i for i in data["fundamental_indicators"] if i["name"] == "P/E Ratio")
        assert pe_row["sector_median"] == "20.00"
        # Null-valued peer must not win the high slot
        assert pe_row["sector_high"] == "40.00"
        assert pe_row["sector_high_ticker"] == "CCC"
        assert pe_row["sector_low"] == "10.00"


@pytest.mark.django_db
class TestRecalculateFundamentalsCommand:
    def test_recalculates_tickers_with_reports_and_purges_orphans(self, seeded_ticker):
        from django.core.management import call_command

        # Orphan: random-seeded metrics but no financial reports
        StockFundamental.objects.create(
            ticker="FAKE",
            company_name="Fake Co",
            sector="Others",
            eps=Decimal("33"),
            pe_ratio=Decimal("21"),
            book_value=Decimal("250"),
            dividend_yield=Decimal("4.5"),
            market_cap=Decimal("5000000000"),
        )
        # Stale value on a real ticker gets recomputed
        StockFundamental.objects.filter(ticker=seeded_ticker).update(eps=Decimal("999"))

        call_command("recalculate_fundamentals", "--purge")

        real = StockFundamental.objects.get(ticker=seeded_ticker)
        assert real.eps == Decimal("10.00")

        fake = StockFundamental.objects.get(ticker="FAKE")
        assert fake.eps is None
        assert fake.pe_ratio is None
        assert fake.book_value is None
        assert fake.dividend_yield is None
        assert fake.market_cap is None
        # Identity fields survive the purge
        assert fake.company_name == "Fake Co"
