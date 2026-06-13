import pytest
import json
from unittest.mock import patch, MagicMock


def test_loader_raises_on_missing_fixture(tmp_path):
    from stocks.services.financial_data_loader import FinancialDataLoader
    loader = FinancialDataLoader(fixtures_dir=str(tmp_path))
    with pytest.raises(FileNotFoundError):
        loader.load('ADBL')


def test_loader_creates_company_if_missing(tmp_path):
    fixture = {
        'ticker': 'TEST',
        'company': {'name': 'Test Corp', 'sector': 'Banking', 'instrument_type': 'Equity'},
        'reports': [],
    }
    (tmp_path / 'TEST.json').write_text(json.dumps(fixture))

    from stocks.services.financial_data_loader import FinancialDataLoader

    with patch('stocks.services.financial_data_loader.Company') as MockCompany, \
         patch('stocks.services.financial_data_loader.FinancialReport'), \
         patch('stocks.services.financial_data_loader.sync_dividends_from_financials'):
        MockCompany.objects.get_or_create.return_value = (MagicMock(), True)
        loader = FinancialDataLoader(fixtures_dir=str(tmp_path))
        loader.load('TEST')

    MockCompany.objects.get_or_create.assert_called_once_with(
        symbol='TEST',
        defaults={'name': 'Test Corp', 'sector': 'Banking', 'instrument_type': 'Equity'},
    )


def test_loader_skips_empty_reports(tmp_path):
    fixture = {
        'ticker': 'TEST',
        'company': {'name': 'Test Corp', 'sector': 'Banking', 'instrument_type': 'Equity'},
        'reports': [],
    }
    (tmp_path / 'TEST.json').write_text(json.dumps(fixture))

    from stocks.services.financial_data_loader import FinancialDataLoader

    with patch('stocks.services.financial_data_loader.Company') as MockCompany, \
         patch('stocks.services.financial_data_loader.FinancialReport') as MockReport, \
         patch('stocks.services.financial_data_loader.sync_dividends_from_financials'):
        MockCompany.objects.get_or_create.return_value = (MagicMock(), False)
        loader = FinancialDataLoader(fixtures_dir=str(tmp_path))
        result = loader.load('TEST')

    assert result == 0
    MockReport.objects.update_or_create.assert_not_called()
