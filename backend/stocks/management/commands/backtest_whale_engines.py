from django.core.management.base import BaseCommand
from django.db import connections
from datetime import date, timedelta
from stocks.services.signal_generation_service import SignalGenerationService
from django.core.management import call_command

class Command(BaseCommand):
    help = 'Backtest whale watch strategies over historical data for the last 2 years.'

    def handle(self, *args, **options):
        from stocks.models import SignalEpisode
        self.stdout.write("Fetching historical trading dates...")
        
        query = """
        SELECT DISTINCT transaction_date 
        FROM daily_stock_price
        WHERE transaction_date >= CURRENT_DATE - INTERVAL '1 year'
        ORDER BY transaction_date ASC;
        """
        
        dates = []
        with connections['default'].cursor() as cursor:
            cursor.execute(query)
            dates = [row[0] for row in cursor.fetchall()]
            
        if not dates:
            self.stdout.write(self.style.ERROR("No historical dates found."))
            return
            
        total_days = len(dates)
        self.stdout.write(f"Found {total_days} trading dates spanning back 1 year. Starting backtest...")
        
        total_signals_generated = 0
        
        engines = [
            ('DISTRIBUTION_ALERT', SignalGenerationService._generate_distribution_alert_signals),
            ('BELOW_COST_REVERSAL', SignalGenerationService._generate_below_cost_reversal_signals),
            ('VOLUME_BREAKOUT', SignalGenerationService._generate_volume_breakout_signals),
            ('CONCENTRATION_SHIFT', SignalGenerationService._generate_concentration_shift_signals),
        ]
        
        for i, target_date in enumerate(dates):
            if i % 10 == 0:
                self.stdout.write(f"Processing day {i+1}/{total_days}: {target_date}...")
                
            day_signals = 0
            for source_key, generator_fn in engines:
                # Cache check: if signals already exist for this date and source, skip
                if SignalEpisode.objects.filter(source=source_key, start_date=target_date).exists():
                    continue

                try:
                    signals = generator_fn(target_date=target_date)
                    saved = SignalGenerationService._persist_signals(source_key, signals)
                    day_signals += saved
                except Exception as e:
                    self.stdout.write(self.style.ERROR(f"[{source_key}] Failed on {target_date}: {e}"))
                    
            total_signals_generated += day_signals
            
        self.stdout.write(self.style.SUCCESS(f"Backtest generation complete! Total historical signals created: {total_signals_generated}"))
        
        self.stdout.write("Running active signal evaluator to compute historical PnL and hit/miss statuses...")
        call_command('evaluate_signals')
        
        self.stdout.write(self.style.SUCCESS("Whale Watch historical backtest fully complete."))
