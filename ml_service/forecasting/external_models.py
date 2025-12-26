# External models from main backend (proxy to shared database tables)
# These models allow ML service to read stock data without duplicating code

from django.db import models


class DailyStockPrice(models.Model):
    """
    Proxy model for daily stock prices from main backend.
    """
    ticker = models.CharField(max_length=20, db_index=True, db_column='symbol')
    date = models.DateField(db_index=True, db_column='transaction_date')
    open = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    high = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    low = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    close = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    volume = models.DecimalField(max_digits=20, decimal_places=2, null=True, blank=True)

    class Meta:
        managed = False
        db_table = 'daily_stock_price'
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
