from __future__ import annotations
import json
from pathlib import Path
from ..models import Company, FinancialReport
from .dividend_service import sync_dividends_from_financials

DEFAULT_FIXTURES_DIR = Path(__file__).resolve().parent.parent / 'fixtures' / 'financials'


class FinancialDataLoader:
    """Loads financial report data from a per-ticker JSON fixture into the database."""

    def __init__(self, fixtures_dir: str | None = None):
        self._dir = Path(fixtures_dir) if fixtures_dir else DEFAULT_FIXTURES_DIR

    def load(self, ticker: str) -> int:
        data = self._read_fixture(ticker)
        company = self._ensure_company(ticker, data['company'])
        count = self._upsert_reports(company, data.get('reports', []))
        if count:
            sync_dividends_from_financials(ticker)
        return count

    def available_tickers(self) -> list[str]:
        return [p.stem for p in self._dir.glob('*.json')]

    def _read_fixture(self, ticker: str) -> dict:
        path = self._dir / f'{ticker}.json'
        if not path.exists():
            raise FileNotFoundError(f"No fixture found for {ticker} at {path}")
        return json.loads(path.read_text())

    def _ensure_company(self, ticker: str, meta: dict):
        company, _ = Company.objects.get_or_create(
            symbol=ticker,
            defaults={
                'name': meta['name'],
                'sector': meta['sector'],
                'instrument_type': meta.get('instrument_type', 'Equity'),
            },
        )
        return company

    def _upsert_reports(self, company, reports: list) -> int:
        count = 0
        for report in reports:
            report_data = dict(report)
            fiscal_year = report_data.pop('fiscal_year')
            report_type = report_data.pop('report_type', 'ANNUAL')
            quarter = report_data.pop('quarter', None)
            report_data.pop('ticker', None)  # provided as lookup key below
            ticker = company.symbol
            FinancialReport.objects.update_or_create(
                ticker=ticker,
                fiscal_year=fiscal_year,
                report_type=report_type,
                quarter=quarter,
                defaults=report_data,
            )
            count += 1
        return count
