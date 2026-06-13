from django.core.management.base import BaseCommand
from django.db import connections
from django.core.management import call_command
from stocks.services.signal_generation_service import SignalGenerationService
from stocks.services.signals.generators.distribution_alert import DistributionAlertGenerator
from stocks.services.signals.generators.below_cost_reversal import BelowCostReversalGenerator
from stocks.services.signals.generators.volume_breakout import VolumeBreakoutGenerator
from stocks.services.signals.generators.concentration_shift import ConcentrationShiftGenerator

_ENGINES = [
    DistributionAlertGenerator(),
    BelowCostReversalGenerator(),
    VolumeBreakoutGenerator(),
    ConcentrationShiftGenerator(),
]

_DATE_QUERY = """
SELECT DISTINCT transaction_date
FROM daily_stock_price
WHERE transaction_date >= CURRENT_DATE - INTERVAL '1 year'
ORDER BY transaction_date ASC;
"""


class Command(BaseCommand):
    help = 'Backtest whale watch strategies over historical data for the last year.'

    def handle(self, *args, **options):
        from stocks.models import SignalEpisode

        self.stdout.write("Fetching historical trading dates...")
        dates = self._fetch_dates()
        if not dates:
            self.stdout.write(self.style.ERROR("No historical dates found."))
            return

        total_days = len(dates)
        self.stdout.write(f"Found {total_days} trading dates spanning back 1 year. Starting backtest...")

        total_saved = sum(
            self._process_date(target_date, SignalEpisode, i, total_days)
            for i, target_date in enumerate(dates)
        )

        self.stdout.write(self.style.SUCCESS(
            f"Backtest generation complete! Total historical signals created: {total_saved}"
        ))
        self.stdout.write("Running active signal evaluator to compute historical PnL and hit/miss statuses...")
        call_command('evaluate_signals')
        self.stdout.write(self.style.SUCCESS("Whale Watch historical backtest fully complete."))

    def _fetch_dates(self) -> list:
        with connections['default'].cursor() as cursor:
            cursor.execute(_DATE_QUERY)
            return [row[0] for row in cursor.fetchall()]

    def _process_date(self, target_date, SignalEpisode, i: int, total: int) -> int:
        if i % 10 == 0:
            self.stdout.write(f"Processing day {i + 1}/{total}: {target_date}...")
        return sum(
            self._run_engine(engine, target_date, SignalEpisode)
            for engine in _ENGINES
        )

    def _run_engine(self, engine, target_date, SignalEpisode) -> int:
        source_key = engine.source_key
        if SignalEpisode.objects.filter(source=source_key, start_date=target_date).exists():
            return 0
        try:
            signals = engine.generate_for_date(target_date=target_date)
            return SignalGenerationService._persist_signals(source_key, signals)
        except Exception as e:
            self.stdout.write(self.style.ERROR(f"[{source_key}] Failed on {target_date}: {e}"))
            return 0
