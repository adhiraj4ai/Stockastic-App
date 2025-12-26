# External models from main backend (proxy to shared database tables)
# These models allow ML service to read stock data without duplicating code

from django.db import models


class DailyStockPrice(models.Model):
    """
    Proxy model for daily stock prices from main backend.
    Connects to the same database table.
    """
    ticker = models.CharField(max_length=20, db_index=True)
    date = models.DateField(db_index=True)
    open = models.DecimalField(max_digits=12, decimal_places=2)
    high = models.DecimalField(max_digits=12, decimal_places=2)
    low = models.DecimalField(max_digits=12, decimal_places=2)
    close = models.DecimalField(max_digits=12, decimal_places=2)
    volume = models.BigIntegerField()
    turnover = models.DecimalField(max_digits=20, decimal_places=2, null=True, blank=True)
    trans = models.IntegerField(null=True, blank=True)
    diff = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    range = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    diff_percent = models.DecimalField(max_digits=8, decimal_places=4, null=True, blank=True)
    range_percent = models.DecimalField(max_digits=8, decimal_places=4, null=True, blank=True)
    prev_close = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    vwap = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    vwap_percent = models.DecimalField(max_digits=8, decimal_places=4, null=True, blank=True)
    weeks_52_high = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    weeks_52_low = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    days_120 = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    days_180 = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    conf = models.CharField(max_length=10, null=True, blank=True)

    class Meta:
        managed = False  # Don't create/modify this table
        db_table = 'stocks_dailystockprice'  # Use existing table from main backend
        ordering = ['-date']
        unique_together = [['ticker', 'date']]

    def __str__(self):
        return f"{self.ticker} - {self.date}"


class Strategy(models.Model):
    """
    Proxy model for trading strategies from main backend.
    Read-only access for forecast backtesting.
    """
    name = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        managed = False
        db_table = 'stocks_strategy'
    
    def __str__(self):
        return self.name


class StrategyExperiment(models.Model):
    """
    Proxy model for strategy experiments from main backend.
    """
    strategy = models.ForeignKey(Strategy, on_delete=models.CASCADE)
    name = models.CharField(max_length=200)
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        managed = False
        db_table = 'stocks_strategyexperiment'
    
    def __str__(self):
        return f"{self.strategy.name} - {self.name}"
