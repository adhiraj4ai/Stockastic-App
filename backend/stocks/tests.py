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
        
    @patch('stocks.signals.DailyStockPrice')
    def test_sync_financials(self, MockDailyStockPrice):
        # Mock the price query
        mock_price = MagicMock()
        mock_price.close = 1000
        
        # Chain: objects.filter().order_by().first() -> mock_price
        MockDailyStockPrice.objects.filter.return_value.order_by.return_value.first.return_value = mock_price

        # Create a Report
        report = FinancialReport.objects.create(
            ticker=self.ticker,
            fiscal_year="2080/81",
            report_type="QUARTERLY",
            quarter=4,
            eps=50,
            book_value=200,
            return_on_equity=15
        )
        
        # Reload Fundamental
        self.fundamental.refresh_from_db()
        
        # Verify Sync
        self.assertEqual(self.fundamental.eps, Decimal('50.00'))
        self.assertEqual(self.fundamental.book_value, Decimal('200.00'))
        self.assertEqual(self.fundamental.ro_equity, Decimal('15.00'))
        
        # Verify PE Recalculation (Price 1000 / EPS 50 = 20)
        self.assertEqual(self.fundamental.pe_ratio, Decimal('20.00'))
        
    @patch('stocks.signals.DailyStockPrice')
    def test_sync_update(self, MockDailyStockPrice):
        # Mock the price query
        mock_price = MagicMock()
        mock_price.close = 1000
        MockDailyStockPrice.objects.filter.return_value.order_by.return_value.first.return_value = mock_price

        # Create initial report
        report = FinancialReport.objects.create(
            ticker=self.ticker,
            fiscal_year="2080/81",
            report_type="QUARTERLY",
            quarter=4,
            eps=50
        )
        
        # Update report
        report.eps = 100
        report.save()
        
        self.fundamental.refresh_from_db()
        
        # Verify PE Recalculation (Price 1000 / EPS 100 = 10)
        self.assertEqual(self.fundamental.pe_ratio, Decimal('10.00'))
