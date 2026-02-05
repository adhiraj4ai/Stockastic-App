from django.db import models
from django.contrib.auth.models import User

class ScopeType(models.TextChoices):
    SYMBOL = 'SYMBOL', 'Single Symbol'
    SECTOR = 'SECTOR', 'Sector'
    ALL = 'ALL', 'All Market'

class Strategy(models.Model):
    name = models.CharField(max_length=255)
    description = models.TextField()
    code = models.TextField(blank=True, default="")
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    created_at = models.DateTimeField(auto_now_add=True)
    is_public = models.BooleanField(default=False)
    pnl_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0.00)
    pnl_percent = models.DecimalField(max_digits=6, decimal_places=2, default=0.00)
    max_drawdown = models.DecimalField(max_digits=6, decimal_places=2, default=0.00)
    sharpe_ratio = models.DecimalField(max_digits=6, decimal_places=2, default=0.00)
    win_rate = models.DecimalField(max_digits=6, decimal_places=2, default=0.00)
    optimization_config = models.TextField(blank=True, default="")
    icon = models.CharField(max_length=50, default="Lightbulb")
    icon_color = models.CharField(max_length=7, default="#000000")
    best_params = models.JSONField(default=dict, blank=True)
    best_score = models.FloatField(null=True, blank=True)
    best_objective = models.CharField(max_length=50, blank=True, default='')

    def __str__(self):
        return self.name

class StrategyExperiment(models.Model):
    class RunType(models.TextChoices):
        BACKTEST = 'BACKTEST', 'Backtest'
        OPTIMIZATION = 'OPTIMIZATION', 'Optimization'

    class Status(models.TextChoices):
        SUCCESS = 'SUCCESS', 'Success'
        FAILED = 'FAILED', 'Failed'

    strategy = models.ForeignKey(Strategy, on_delete=models.CASCADE, related_name='experiments')
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    run_type = models.CharField(max_length=20, choices=RunType.choices)
    scope_type = models.CharField(max_length=20, choices=ScopeType.choices)
    scope_value = models.CharField(max_length=255)
    start_date = models.DateField()
    end_date = models.DateField()
    is_published = models.BooleanField(default=False)
    parameters = models.JSONField(default=dict)
    metrics = models.JSONField(default=dict)
    batch_id = models.UUIDField(null=True, blank=True, db_index=True)
    plot_html = models.TextField(null=True, blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.SUCCESS)
    error_log = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['strategy', 'scope_type', 'scope_value']),
            models.Index(fields=['created_at']),
        ]

    def __str__(self):
        return f"{self.strategy.name} - {self.run_type} ({self.scope_value})"

class StrategySymbolConfig(models.Model):
    class Objective(models.TextChoices):
        WIN_RATE = 'win_rate', 'Win Rate'
        PROFIT = 'profit', 'Max Profit'
        BALANCED = 'balanced', 'Balanced'
    
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    strategy = models.ForeignKey(Strategy, on_delete=models.CASCADE, related_name='symbol_configs')
    symbol = models.CharField(max_length=20)
    preferred_objective = models.CharField(
        max_length=20,
        choices=Objective.choices,
        default=Objective.BALANCED
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        unique_together = [['user', 'strategy', 'symbol']]
        indexes = [
            models.Index(fields=['user', 'strategy', 'symbol']),
        ]
    
    def __str__(self):
        return f"{self.user.username} - {self.strategy.name} ({self.symbol})"

class StrategySignal(models.Model):
    SIGNAL_CHOICES = (
        ('BUY', 'Buy'),
        ('SELL', 'Sell'),
        ('HOLD', 'Hold'),
        ('NEUTRAL', 'Neutral'),
    )

    strategy = models.ForeignKey(Strategy, on_delete=models.CASCADE)
    symbol = models.CharField(max_length=20)
    date = models.DateField()
    signal = models.CharField(max_length=10, choices=SIGNAL_CHOICES)
    last_close = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ('strategy', 'symbol', 'date')
        ordering = ['-date', 'strategy__name']

    def __str__(self):
        return f"{self.symbol} - {self.strategy.name}: {self.signal}"
