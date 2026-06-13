from django.core.management.base import BaseCommand, CommandError
from stocks.services.financial_data_loader import FinancialDataLoader


class Command(BaseCommand):
    help = 'Seed financial reports for one or all tickers from JSON fixtures'

    def add_arguments(self, parser):
        parser.add_argument('--ticker', type=str, help='Single ticker (e.g. ADBL)')
        parser.add_argument('--all', action='store_true', help='Seed all available fixtures')

    def handle(self, *args, **options):
        loader = FinancialDataLoader()
        tickers = self._resolve_tickers(loader, options)
        total = sum(self._seed_one(loader, t) for t in tickers)
        self.stdout.write(self.style.SUCCESS(
            f'Seeded {total} reports across {len(tickers)} tickers.'
        ))

    def _resolve_tickers(self, loader, options) -> list[str]:
        if options.get('ticker'):
            return [options['ticker'].upper()]
        if options.get('all'):
            return loader.available_tickers()
        raise CommandError('Pass --ticker SYMBOL or --all')

    def _seed_one(self, loader, ticker: str) -> int:
        try:
            count = loader.load(ticker)
            self.stdout.write(f'  {ticker}: {count} reports')
            return count
        except FileNotFoundError:
            self.stdout.write(self.style.WARNING(f'  {ticker}: no fixture found, skipping'))
            return 0
