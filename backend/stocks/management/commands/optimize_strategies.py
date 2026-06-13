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

    def _build_scopes(self, options):
        symbol_arg = options['symbol']
        sector_arg = options['sector']
        if symbol_arg:
            return [('ALL', 'ALL')] if symbol_arg == 'ALL' else [('SYMBOL', symbol_arg)]
        if sector_arg:
            return [('SECTOR', sector_arg)]
        scopes = [('ALL', 'ALL')]
        for s in Company.objects.all().values_list('sector', flat=True).distinct():
            if s:
                scopes.append(('SECTOR', s))
        if options['all_symbols']:
            for sym in Company.objects.all().values_list('symbol', flat=True).distinct():
                scopes.append(('SYMBOL', sym))
        return scopes

    def _optimize_scope(self, strategy, scope_type, scope_val, start_date, end_date, n_trials):
        try:
            best_params, best_value = OptimizationService.run_optimization(
                strategy, scope_type, scope_val, start_date, end_date, n_trials
            )
            params_str = ", ".join(f"{k}: {v}" for k, v in best_params.items())
            self.stdout.write(self.style.SUCCESS(
                f"[{strategy.name}] ({scope_type}:{scope_val}) -> Params: {params_str} | Return: {best_value:.2f}%"
            ))
        except Exception as e:
            self.stdout.write(self.style.ERROR(f"    Failed: {str(e)}"))

    def handle(self, *args, **options):
        pd.set_option('future.no_silent_downcasting', True)
        strategy_id = options['strategy']
        n_trials = options['trials']
        end_date = datetime.now().date()
        start_date = end_date - timedelta(days=options['days'])
        strategies = Strategy.objects.filter(id=strategy_id) if strategy_id else Strategy.objects.all()
        if not strategies.exists():
            self.stdout.write(self.style.ERROR("No strategies found!"))
            return
        scopes = self._build_scopes(options)
        for strategy in strategies:
            for scope_type, scope_val in scopes:
                self._optimize_scope(strategy, scope_type, scope_val, start_date, end_date, n_trials)
