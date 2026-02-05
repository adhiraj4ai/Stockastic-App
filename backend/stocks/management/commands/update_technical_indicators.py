from django.core.management.base import BaseCommand
from stocks.services.data_sync_service import DataSyncService

class Command(BaseCommand):
    help = 'Updates technical indicators for all stocks and calculates sector stats'

    def handle(self, *args, **kwargs):
        self.stdout.write("Starting technical indicator update...")
        
        def progress_callback(processed, total):
            if processed % 50 == 0 or processed == total:
                 self.stdout.write(f"Processed {processed}/{total}")

        update_count = DataSyncService.update_all_technical_indicators(progress_callback=progress_callback)

        self.stdout.write(self.style.SUCCESS(f"Successfully updated technical indicators for {update_count} stocks."))
