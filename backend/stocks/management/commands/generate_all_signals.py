from django.core.management.base import BaseCommand
from stocks.services.signal_generation_service import SignalGenerationService


class Command(BaseCommand):
    help = 'Generates all intel signals (Smart Money, Whale Watch engines) and stores them in the database.'

    def handle(self, *args, **options):
        def progress_callback(current, total, source):
            self.stdout.write(f"Processing source {current}/{total}: {source}")

        total_saved = SignalGenerationService.generate_all(progress_callback)

        self.stdout.write(self.style.SUCCESS(
            f"All signal generation complete. Total signals saved: {total_saved}"
        ))
