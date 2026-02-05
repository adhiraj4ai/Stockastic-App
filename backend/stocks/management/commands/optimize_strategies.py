import pandas as pd
from datetime import datetime, timedelta
from django.core.management.base import BaseCommand
from stocks.models import Strategy, Company
from stocks.services.optimization_service import OptimizationService

class Command(BaseCommand):
    help = 'Optimize strategy parameters for all symbols, sectors, and market.'

    def add_arguments(self, parser):
        parser.add_argument('--strategy', type=int, help='Specific strategy ID to optimize')
        parser.add_argument('--symbol', type=str, help='Specific symbol to optimize (or "ALL")')
        parser.add_argument('--sector', type=str, help='Specific sector to optimize')
        parser.add_argument('--trials', type=int, default=30, help='Number of Optuna trials')
        parser.add_argument('--days', type=int, default=730, help='Number of days of data to use')
        parser.add_argument('--all-symbols', action='store_true', help='Optimize for every individual symbol (Slow!)')

    def handle(self, *args, **options):
        # Silence Pandas FutureWarnings
        pd.set_option('future.no_silent_downcasting', True)
        
        strategy_id = options['strategy']
        symbol_arg = options['symbol']
        sector_arg = options['sector']
        n_trials = options['trials']
        days = options['days']

        # Determine Date Range
        end_date = datetime.now().date()
        start_date = end_date - timedelta(days=days)

        # 1. Get Strategies
        if strategy_id:
            strategies = Strategy.objects.filter(id=strategy_id)
        else:
            strategies = Strategy.objects.all()

        if not strategies.exists():
            self.stdout.write(self.style.ERROR("No strategies found!"))
            return

        for strategy in strategies:
            # 2. Scopes
            scopes = []
            if symbol_arg:
                if symbol_arg == 'ALL': scopes.append(('ALL', 'ALL'))
                else: scopes.append(('SYMBOL', symbol_arg))
            elif sector_arg:
                scopes.append(('SECTOR', sector_arg))
            else:
                scopes.append(('ALL', 'ALL'))
                sectors = Company.objects.filter(status='A').values_list('sector', flat=True).distinct()
                for s in sectors:
                    if s: scopes.append(('SECTOR', s))
                
                if options['all_symbols']:
                    symbols = Company.objects.filter(status='A').values_list('symbol', flat=True).distinct()
                    for sym in symbols:
                        scopes.append(('SYMBOL', sym))

            for scope_type, scope_val in scopes:
                try:
                    best_params, best_value = OptimizationService.run_optimization(
                        strategy, scope_type, scope_val, start_date, end_date, n_trials
                    )
                    params_str = ", ".join([f"{k}: {v}" for k, v in best_params.items()])
                    self.stdout.write(self.style.SUCCESS(f"[{strategy.name}] ({scope_type}:{scope_val}) -> Params: {params_str} | Return: {best_value:.2f}%"))
                except Exception as e:
                    self.stdout.write(self.style.ERROR(f"    Failed: {str(e)}"))
