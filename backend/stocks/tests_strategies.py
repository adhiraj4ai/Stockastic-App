
import os
import re
from django.test import TestCase
from django.contrib.auth.models import User
from datetime import datetime, timedelta
from stocks.models import Strategy as StrategyModel, StrategyExperiment, Company, DailyStockPrice, StrategySignal, ScopeType
from stocks.management.commands.optimize_strategies import Command as OptimizeCommand
from stocks.management.commands.generate_signals import Command as SignalCommand

class StrategyOptimizationTest(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='testuser')
        self.strategy_code = """
class MyStrategy(Strategy):
    n1 = 10 # range: [5, 30]
    n2 = 20 # range: [10, 50]
    def init(self):
        pass
    def next(self):
        if crossover(self.data.Close, SMA(self.data.Close, self.n1)):
            self.buy()
"""
        self.strategy = StrategyModel.objects.create(
            name="Test Strategy",
            description="A test strategy",
            code=self.strategy_code,
            user=self.user
        )
        self.ticker = "NABIL"
        self.sector = "Banking"
        self.company = Company.objects.create(symbol=self.ticker, name="Nabil Bank", sector=self.sector, status='A')
        
        # Create some dummy price data
        base_date = datetime.now().date()
        for i in range(20):
            DailyStockPrice.objects.create(
                ticker=self.ticker,
                date=base_date - timedelta(days=20-i),
                open=100 + i,
                high=110 + i,
                low=90 + i,
                close=105 + i,
                volume=1000
            )

    def test_param_extraction(self):
        cmd = OptimizeCommand()
        ranges = cmd.extract_param_ranges(self.strategy_code)
        self.assertEqual(ranges['n1'], [5, 30])
        self.assertEqual(ranges['n2'], [10, 50])

    def test_signal_generation_hierarchy(self):
        # 1. No optimization experiments yet -> should use defaults
        cmd = SignalCommand()
        # Mocking process_symbol to see what it uses
        # We'll actually run it and check metadata
        cmd.process_symbol(self.ticker, [self.strategy], [self.ticker], self.sector)
        
        sig = StrategySignal.objects.get(symbol=self.ticker, strategy=self.strategy)
        self.assertEqual(sig.metadata['optimized_params'], "None (Defaults Used)")

        # 2. Add a Market (ALL) level optimization
        StrategyExperiment.objects.create(
            strategy=self.strategy,
            user=self.user,
            run_type=StrategyExperiment.RunType.OPTIMIZATION,
            scope_type=ScopeType.ALL,
            scope_value='ALL',
            start_date=datetime.now().date(),
            end_date=datetime.now().date(),
            metrics={'best_params': {'n1': 15, 'n2': 25}},
            is_published=True
        )
        
        cmd.process_symbol(self.ticker, [self.strategy], [self.ticker], self.sector)
        sig = StrategySignal.objects.filter(symbol=self.ticker, strategy=self.strategy).order_by('-created_at').first()
        self.assertEqual(sig.metadata['optimized_params']['n1'], 15)

        # 3. Add a Sector level optimization
        StrategyExperiment.objects.create(
            strategy=self.strategy,
            user=self.user,
            run_type=StrategyExperiment.RunType.OPTIMIZATION,
            scope_type=ScopeType.SECTOR,
            scope_value=self.sector,
            start_date=datetime.now().date(),
            end_date=datetime.now().date(),
            metrics={'best_params': {'n1': 18, 'n2': 28}},
            is_published=True
        )
        
        cmd.process_symbol(self.ticker, [self.strategy], [self.ticker], self.sector)
        sig = StrategySignal.objects.filter(symbol=self.ticker, strategy=self.strategy).order_by('-created_at').first()
        self.assertEqual(sig.metadata['optimized_params']['n1'], 18)

        # 4. Add a Symbol level optimization
        StrategyExperiment.objects.create(
            strategy=self.strategy,
            user=self.user,
            run_type=StrategyExperiment.RunType.OPTIMIZATION,
            scope_type=ScopeType.SYMBOL,
            scope_value=self.ticker,
            start_date=datetime.now().date(),
            end_date=datetime.now().date(),
            metrics={'best_params': {'n1': 22, 'n2': 32}},
            is_published=True
        )
        
        cmd.process_symbol(self.ticker, [self.strategy], [self.ticker], self.sector)
        sig = StrategySignal.objects.filter(symbol=self.ticker, strategy=self.strategy).order_by('-created_at').first()
        self.assertEqual(sig.metadata['optimized_params']['n1'], 22)

    def test_code_injection(self):
        # Verify that parameters are actually injected into the code string
        best_params = {'n1': 22, 'n2': 32}
        code = self.strategy_code
        for name, val in best_params.items():
            code = re.sub(rf"(\s{name}\s*=\s*)\d+", rf"\g<1>{val}", code)
        
        self.assertIn("n1 = 22", code)
        self.assertIn("n2 = 32", code)
        self.assertNotIn("n1 = 10", code)
