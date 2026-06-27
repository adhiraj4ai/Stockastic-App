from datetime import date

from django.core.management.base import BaseCommand

from stocks.services.accumulation.scanner import AccumulationScanner


class Command(BaseCommand):
    help = "Scan the liquid universe and persist ranked accumulation candidates."

    def add_arguments(self, parser):
        parser.add_argument("--as-of", type=date.fromisoformat, default=None,
                            help="YYYY-MM-DD; defaults to the latest date with data.")

    def handle(self, *args, **opts):
        count = AccumulationScanner.scan_and_save_candidates(as_of=opts["as_of"])
        self.stdout.write(self.style.SUCCESS(f"Scanned: {count} active candidates."))
