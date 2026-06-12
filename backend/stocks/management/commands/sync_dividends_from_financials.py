from django.core.management.base import BaseCommand

from stocks.services.dividend_service import sync_dividends_from_financials


class Command(BaseCommand):
    help = (
        'Upsert Dividend rows from the dividend fields on ANNUAL FinancialReports. '
        'Fiscal years are normalized to the fetch_dividends format (2080/2081) so '
        'scraper rows are updated, not duplicated.'
    )

    def add_arguments(self, parser):
        parser.add_argument('--ticker', help='Sync a single ticker (default: all)')

    def handle(self, *args, **opts):
        ticker = (opts.get('ticker') or '').upper() or None
        created, updated = sync_dividends_from_financials(ticker)
        self.stdout.write(self.style.SUCCESS(
            f'Dividend sync from financials done ({ticker or "all tickers"}): '
            f'created={created} updated={updated}'
        ))
