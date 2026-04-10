import time
from django.core.management.base import BaseCommand
from django.db import connection
from stocks.models.market import DailyCumulativeAccumulation

class Command(BaseCommand):
    help = 'Executes broker data refresh and accumulation calculation procedures'

    def add_arguments(self, parser):
        parser.add_argument(
            '--mode',
            type=str,
            choices=['full', 'delta'],
            default='delta',
            help='Refresh mode: full (rebuilds everything) or delta (incremental update)'
        )

    def handle(self, *args, **options):
        mode = options.get('mode', 'delta')
        start_time = time.time()
        
        try:
            with connection.cursor() as cursor:
                # 1. Drop query indexes for faster bulk insert (Full mode only)
                if mode == 'full':
                    self.stdout.write("Optimizing for full bulk processing: Dropping non-PK indexes...")
                    cursor.execute("DROP INDEX IF EXISTS idx_dca_cumulative_net")
                    cursor.execute("DROP INDEX IF EXISTS idx_dca_smart_query")
                    cursor.execute("DROP INDEX IF EXISTS idx_dca_transaction_date")
                    cursor.execute("DROP INDEX IF EXISTS idx_dca_trends")

                # 2. Update daily buyer/seller stats
                self.stdout.write(self.style.SUCCESS(f"Starting Step 1: refresh_broker_floorsheet_data() [{mode} mode]..."))
                cursor.execute("CALL refresh_broker_floorsheet_data()")
                self.stdout.write(self.style.SUCCESS("Step 1 Completed."))

                # 3. Recompute accumulation history
                self.stdout.write(self.style.SUCCESS(f"Starting Step 2: calculate {'delta' if mode == 'delta' else 'daily_cumulative'} accumulation() [{mode} mode]..."))
                if mode == 'delta':
                    cursor.execute("CALL calculate_delta_cumulative_accumulation()")
                else:
                    cursor.execute("CALL calculate_daily_cumulative_accumulation()")
                self.stdout.write(self.style.SUCCESS("Step 2 Completed."))

                # 4. Recreate indexes (Full mode only - ensure they exist)
                if mode == 'full':
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
            self.stdout.write(self.style.SUCCESS(f"Broker analysis ({mode}) complete. Total accumulation records: {count}"))
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
