from stocks.services.strategy_service import StrategyService

class Command(BaseCommand):
    help = 'Generates daily Buy/Sell/Hold signals for all strategies against latest data.'

    def add_arguments(self, parser):
        parser.add_argument('--symbol', type=str, help='Specific symbol to run for (e.g., NABIL)')

    def handle(self, *args, **options):
        symbol_arg = options['symbol']
        
        def progress_callback(current, total, symbol):
            if current % 10 == 0 or current == total:
                self.stdout.write(f"Processing symbol {current}/{total}: {symbol}")

        saved, skipped = StrategyService.generate_all_signals(symbol_arg, progress_callback)
        
        self.stdout.write(self.style.SUCCESS(
            f"Signal generation complete. Saved: {saved}, Skipped: {skipped}"
        ))
