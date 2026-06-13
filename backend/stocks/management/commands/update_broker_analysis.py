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

    _INDEXES = [
        "CREATE INDEX IF NOT EXISTS idx_dca_transaction_date ON daily_cumulative_accumulation (transaction_date)",
        "CREATE INDEX IF NOT EXISTS idx_dca_cumulative_net ON daily_cumulative_accumulation (cumulative_net)",
        "CREATE INDEX IF NOT EXISTS idx_dca_smart_query ON daily_cumulative_accumulation (transaction_date, cumulative_net)",
        "CREATE INDEX IF NOT EXISTS idx_dca_trends ON daily_cumulative_accumulation (symbol, entity_id, transaction_date)",
    ]

    def _drop_indexes(self, cursor):
        self.stdout.write("Optimizing for full bulk processing: Dropping non-PK indexes...")
        for idx in ("idx_dca_cumulative_net", "idx_dca_smart_query", "idx_dca_transaction_date", "idx_dca_trends"):
            cursor.execute(f"DROP INDEX IF EXISTS {idx}")

    def _create_indexes(self, cursor):
        self.stdout.write("Rebuilding indexes for query performance...")
        for sql in self._INDEXES:
            cursor.execute(sql)

    def _run_refresh(self, cursor, mode):
        self.stdout.write(self.style.SUCCESS(f"Starting Step 1: refresh_broker_floorsheet_data() [{mode} mode]..."))
        cursor.execute("CALL refresh_broker_floorsheet_data()")
        self.stdout.write(self.style.SUCCESS("Step 1 Completed."))
        proc = "calculate_delta_cumulative_accumulation" if mode == "delta" else "calculate_daily_cumulative_accumulation"
        self.stdout.write(self.style.SUCCESS(f"Starting Step 2: {proc}() [{mode} mode]..."))
        cursor.execute(f"CALL {proc}()")
        self.stdout.write(self.style.SUCCESS("Step 2 Completed."))

    def handle(self, *args, **options):
        mode = options.get('mode', 'delta')
        start_time = time.time()
        try:
            with connection.cursor() as cursor:
                if mode == 'full':
                    self._drop_indexes(cursor)
                self._run_refresh(cursor, mode)
                if mode == 'full':
                    self._create_indexes(cursor)
                    self.stdout.write("Clustering table for optimal read performance...")
                    cursor.execute("CLUSTER daily_cumulative_accumulation USING daily_cumulative_accumulation_pkey")
                    cursor.execute("ANALYZE daily_cumulative_accumulation")
            duration = time.time() - start_time
            count = DailyCumulativeAccumulation.objects.count()
            self.stdout.write(self.style.SUCCESS(f"Broker analysis ({mode}) complete. Total accumulation records: {count}"))
            self.stdout.write(self.style.SUCCESS(f"Broker analysis completed successfully in {duration:.2f} seconds."))
        except Exception as e:
            self.stderr.write(self.style.ERROR(f"Broker analysis failed: {str(e)}"))
            with connection.cursor() as cursor:
                self.stdout.write("Attempting to restore indexes after failure...")
                self._create_indexes(cursor)
            raise e
