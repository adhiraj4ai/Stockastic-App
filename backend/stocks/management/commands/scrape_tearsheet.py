from __future__ import annotations

from django.core.management.base import BaseCommand, CommandError

from stocks.services.tearsheet.exceptions import TearsheetError
from stocks.services.tearsheet.pipeline import scrape_annual
from stocks.services.tearsheet.session import TearsheetBrowser


class Command(BaseCommand):
    help = "Scrape annual financials + dividends for a symbol from nepsealpha"

    def add_arguments(self, parser) -> None:
        parser.add_argument("symbol", help="NEPSE symbol, e.g. API")
        parser.add_argument("--no-cache", action="store_true",
                            help="Bypass the on-disk response cache")

    def handle(self, *args, **options) -> None:
        symbol = options["symbol"].upper()
        self.stdout.write(f"Scraping tearsheet for {symbol}...")
        try:
            with TearsheetBrowser(symbol) as browser:
                counts = scrape_annual(symbol, browser,
                                       use_cache=not options["no_cache"])
        except TearsheetError as exc:
            raise CommandError(str(exc)) from exc
        self.stdout.write(self.style.SUCCESS(
            f"{counts['company']}: {counts['reports']} annual reports, "
            f"{counts['dividends']} dividends loaded"))
