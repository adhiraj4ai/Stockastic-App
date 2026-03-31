import time
from django.core.management.base import BaseCommand
from django.db import connection
from stocks.models.market import DailyCumulativeAccumulation

class Command(BaseCommand):
    help = 'Executes broker data refresh and accumulation calculation procedures'

    def handle(self, *args, **options):
        start_time = time.time()
        
        try:
            with connection.cursor() as cursor:
                # 1. Drop query indexes for faster bulk insert
                self.stdout.write("Optimizing for bulk processing: Dropping non-PK indexes...")
                cursor.execute("DROP INDEX IF EXISTS idx_dca_cumulative_net")
                cursor.execute("DROP INDEX IF EXISTS idx_dca_smart_query")
                cursor.execute("DROP INDEX IF EXISTS idx_dca_transaction_date")
                cursor.execute("DROP INDEX IF EXISTS idx_dca_trends")

                # 2. Update daily buyer/seller stats
                self.stdout.write(self.style.SUCCESS("Starting Step 1: refresh_broker_floorsheet_data()..."))
                cursor.execute("CALL refresh_broker_floorsheet_data()")
                self.stdout.write(self.style.SUCCESS("Step 1 Completed."))

                # 3. Recompute full accumulation history
                self.stdout.write(self.style.SUCCESS("Starting Step 2: calculate_daily_cumulative_accumulation()..."))
                cursor.execute("CALL calculate_daily_cumulative_accumulation()")
                self.stdout.write(self.style.SUCCESS("Step 2 Completed."))

                # 4. Recreate indexes
                self.stdout.write("Rebuilding indexes for query performance...")
                cursor.execute("CREATE INDEX IF NOT EXISTS idx_dca_transaction_date ON daily_cumulative_accumulation (transaction_date)")
                cursor.execute("CREATE INDEX IF NOT EXISTS idx_dca_cumulative_net ON daily_cumulative_accumulation (cumulative_net)")
                cursor.execute("CREATE INDEX IF NOT EXISTS idx_dca_smart_query ON daily_cumulative_accumulation (transaction_date, cumulative_net)")
                cursor.execute("CREATE INDEX IF NOT EXISTS idx_dca_trends ON daily_cumulative_accumulation (symbol, entity_id, transaction_date)")
                
                # 5. Optimize table storage
                self.stdout.write("Clustering table for optimal read performance...")
                cursor.execute("CLUSTER daily_cumulative_accumulation USING daily_cumulative_accumulation_pkey")
                cursor.execute("ANALYZE daily_cumulative_accumulation")

            duration = time.time() - start_time
            count = DailyCumulativeAccumulation.objects.count()
            self.stdout.write(self.style.SUCCESS(f"Broker analysis complete. Total accumulation records: {count}"))
            self.stdout.write(self.style.SUCCESS(f"Broker analysis completed successfully in {duration:.2f} seconds."))
            
        except Exception as e:
            self.stderr.write(self.style.ERROR(f"Broker analysis failed: {str(e)}"))
            # Optionally attempt to recreate indexes here to ensure DB health
            with connection.cursor() as cursor:
                self.stdout.write("Attempting to restore indexes after failure...")
                cursor.execute("CREATE INDEX IF NOT EXISTS idx_dca_transaction_date ON daily_cumulative_accumulation (transaction_date)")
                cursor.execute("CREATE INDEX IF NOT EXISTS idx_dca_cumulative_net ON daily_cumulative_accumulation (cumulative_net)")
                cursor.execute("CREATE INDEX IF NOT EXISTS idx_dca_smart_query ON daily_cumulative_accumulation (transaction_date, cumulative_net)")
                cursor.execute("CREATE INDEX IF NOT EXISTS idx_dca_trends ON daily_cumulative_accumulation (symbol, entity_id, transaction_date)")
            raise e
