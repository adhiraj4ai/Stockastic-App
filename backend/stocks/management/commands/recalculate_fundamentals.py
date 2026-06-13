from django.core.management.base import BaseCommand

from stocks.models import FinancialReport, StockFundamental
from stocks.services.fundamental_calculator import recalculate_fundamentals

# Derived metric fields cleared on --purge for tickers without any financial
# reports (e.g. leftovers from the old random seed_stocks data).
DERIVED_FIELDS = [
    'eps', 'pe_ratio', 'book_value',
    'eps_unaudited', 'pe_ratio_unaudited', 'book_value_unaudited',
    'dividend_yield', 'peg_ratio', 'price_to_book', 'price_to_sales',
    'ro_equity', 'ro_assets', 'dividend_payout_ratio',
    'qoq_earnings_growth', 'yoy_earnings_growth', 'graham_number_diff',
    'debt_to_equity', 'market_cap', 'free_float_market_cap',
]


class Command(BaseCommand):
    help = (
        'Recalculate all derived StockFundamental metrics from FinancialReports. '
        'With --purge, also clears derived metrics on tickers that have no reports '
        '(removing stale/random seeded values).'
    )

    def add_arguments(self, parser):
        parser.add_argument('--ticker', type=str, default=None, help='Recalculate a single ticker')
        parser.add_argument('--purge', action='store_true',
                            help='Clear derived metrics for tickers without financial reports')

    def handle(self, *args, **options):
        if options['ticker']:
            result = recalculate_fundamentals(options['ticker'])
            if result:
                self.stdout.write(self.style.SUCCESS(f"Recalculated {options['ticker']}"))
            else:
                self.stdout.write(self.style.WARNING(f"No annual reports for {options['ticker']}"))
            return

        report_tickers = set(
            FinancialReport.objects.filter(report_type=FinancialReport.ReportType.ANNUAL)
            .values_list('ticker', flat=True)
            .distinct()
        )

        updated = 0
        for ticker in sorted(report_tickers):
            if recalculate_fundamentals(ticker):
                updated += 1
                self.stdout.write(f"Recalculated {ticker}")
        self.stdout.write(self.style.SUCCESS(f"Recalculated {updated} tickers from financial reports"))

        if options['purge']:
            orphans = StockFundamental.objects.exclude(ticker__in=report_tickers)
            purged = orphans.update(**{field: None for field in DERIVED_FIELDS})
            self.stdout.write(self.style.SUCCESS(
                f"Purged derived metrics on {purged} tickers without financial reports"
            ))
