from django.test import TestCase
from .models import FinancialReport, StockFundamental, DailyStockPrice
from decimal import Decimal
from unittest.mock import patch, MagicMock

class SignalSyncTest(TestCase):
    def setUp(self):
        self.ticker = "TEST"
        # Create Fundamental
        self.fundamental = StockFundamental.objects.create(
            ticker=self.ticker,
            company_name="Test Company",
            sector="Test Sector",
            eps=0,
            pe_ratio=0
        )

    @patch('stocks.services.fundamental_calculator.DailyStockPrice')
    def test_sync_financials(self, MockDailyStockPrice):
        # Mock the price query
        mock_price = MagicMock()
        mock_price.close = 1000

        # Chain: objects.filter().order_by().first() -> mock_price
        MockDailyStockPrice.objects.filter.return_value.order_by.return_value.first.return_value = mock_price

        # Saving an ANNUAL report triggers a full recalculation
        FinancialReport.objects.create(
            ticker=self.ticker,
            fiscal_year="2080/81",
            report_type="ANNUAL",
            eps=50,
            book_value=200,
            return_on_equity=15
        )

        self.fundamental.refresh_from_db()

        self.assertEqual(self.fundamental.eps, Decimal('50.00'))
        self.assertEqual(self.fundamental.book_value, Decimal('200.00'))
        self.assertEqual(self.fundamental.ro_equity, Decimal('15.00'))

        # PE Recalculation (Price 1000 / EPS 50 = 20)
        self.assertEqual(self.fundamental.pe_ratio, Decimal('20.00'))

        # With no quarterly report yet, unaudited mirrors audited
        self.assertEqual(self.fundamental.eps_unaudited, Decimal('50.00'))
        self.assertEqual(self.fundamental.pe_ratio_unaudited, Decimal('20.00'))

    @patch('stocks.services.fundamental_calculator.DailyStockPrice')
    def test_sync_update(self, MockDailyStockPrice):
        # Mock the price query
        mock_price = MagicMock()
        mock_price.close = 1000
        MockDailyStockPrice.objects.filter.return_value.order_by.return_value.first.return_value = mock_price

        # Create initial report
        report = FinancialReport.objects.create(
            ticker=self.ticker,
            fiscal_year="2080/81",
            report_type="ANNUAL",
            eps=50
        )

        # Update report
        report.eps = 100
        report.save()

        self.fundamental.refresh_from_db()

        # Verify PE Recalculation (Price 1000 / EPS 100 = 10)
        self.assertEqual(self.fundamental.pe_ratio, Decimal('10.00'))

    @patch('stocks.services.fundamental_calculator.DailyStockPrice')
    def test_quarterly_only_does_not_touch_audited_metrics(self, MockDailyStockPrice):
        mock_price = MagicMock()
        mock_price.close = 1000
        MockDailyStockPrice.objects.filter.return_value.order_by.return_value.first.return_value = mock_price

        # A quarterly report without any annual report must NOT overwrite
        # audited metrics (the old signal incorrectly did).
        FinancialReport.objects.create(
            ticker=self.ticker,
            fiscal_year="2080/81",
            report_type="QUARTERLY",
            quarter=4,
            eps=50,
            book_value=200,
        )

        self.fundamental.refresh_from_db()
        self.assertEqual(self.fundamental.eps, Decimal('0.00'))
        self.assertEqual(self.fundamental.pe_ratio, Decimal('0.00'))
