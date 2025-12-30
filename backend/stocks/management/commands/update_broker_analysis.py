import time
from django.core.management.base import BaseCommand
from django.db import connection

class Command(BaseCommand):
    help = 'Executes broker data refresh and accumulation calculation procedures'

    def handle(self, *args, **options):
        start_time = time.time()
        
        try:
            with connection.cursor() as cursor:
                # 1. Update daily buyer/seller stats
                self.stdout.write(self.style.SUCCESS("Starting Step 1: refresh_broker_floorsheet_data()..."))
                cursor.execute("CALL refresh_broker_floorsheet_data()")
                self.stdout.write(self.style.SUCCESS("Step 1 Completed."))

                # 2. Recompute full accumulation history
                self.stdout.write(self.style.SUCCESS("Starting Step 2: calculate_daily_cumulative_accumulation()..."))
                cursor.execute("CALL calculate_daily_cumulative_accumulation()")
                self.stdout.write(self.style.SUCCESS("Step 2 Completed."))

            duration = time.time() - start_time
            self.stdout.write(self.style.SUCCESS(f"Broker analysis completed successfully in {duration:.2f} seconds."))
            
        except Exception as e:
            self.stderr.write(self.style.ERROR(f"Broker analysis failed: {str(e)}"))
            raise e
