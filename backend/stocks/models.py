from django.db import models
from django.contrib.auth.models import User

class DailyStockPrice(models.Model):
    ticker = models.CharField(max_length=20, db_index=True)
    date = models.DateField(db_index=True)
    open = models.DecimalField(max_digits=10, decimal_places=2)
    high = models.DecimalField(max_digits=10, decimal_places=2)
    low = models.DecimalField(max_digits=10, decimal_places=2)
    close = models.DecimalField(max_digits=10, decimal_places=2)
    volume = models.BigIntegerField()

    class Meta:
        unique_together = ('ticker', 'date')
        ordering = ['-date']
        indexes = [
            models.Index(fields=['ticker', 'date']),
        ]

    def __str__(self):
        return f"{self.ticker} - {self.date}"

class StockFundamental(models.Model):
    ticker = models.CharField(max_length=20, unique=True, db_index=True)
    company_name = models.CharField(max_length=255)
    sector = models.CharField(max_length=100)
    
    # Capital
    authorized_capital = models.DecimalField(max_digits=20, decimal_places=2, null=True, blank=True)
    paid_up_capital = models.DecimalField(max_digits=20, decimal_places=2, null=True, blank=True)
    market_cap = models.DecimalField(max_digits=20, decimal_places=2, null=True, blank=True)
    free_float_market_cap = models.DecimalField(max_digits=20, decimal_places=2, null=True, blank=True)
    shares_outstanding = models.DecimalField(max_digits=20, decimal_places=2, null=True, blank=True)
    public_shares = models.DecimalField(max_digits=20, decimal_places=2, null=True, blank=True)
    listed_date = models.DateField(null=True, blank=True)
    
    # Key Metrics
    pe_ratio = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    eps = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    book_value = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    dividend_yield = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True)
    
    # 52 Week
    fifty_two_week_high = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    fifty_two_week_low = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)

    # Flexible Indicators (PE, PBV, ROE, Sector High/Low etc.)
    fundamental_indicators = models.JSONField(default=list, blank=True)
    technical_indicators = models.JSONField(default=list, blank=True)
    
    # Top Brokers Accumulation (2Y, 1Y, 6M, 3M, 1W, 1D)
    broker_accumulation = models.JSONField(default=dict, blank=True)

    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.ticker} - {self.company_name}"

class PortfolioAccount(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    name = models.CharField(max_length=100)
    balance = models.DecimalField(max_digits=12, decimal_places=2, default=0) # Cash balance
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.user.username} - {self.name}"

class PortfolioItem(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    account = models.ForeignKey(PortfolioAccount, on_delete=models.CASCADE, null=True, blank=True)
    ticker = models.CharField(max_length=10)
    quantity = models.PositiveIntegerField()
    buy_price = models.DecimalField(max_digits=10, decimal_places=2) # This now effectively acts as WACC
    wacc = models.DecimalField(max_digits=10, decimal_places=2, default=0) # Specific WACC field
    purchased_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('user', 'account', 'ticker')

    def __str__(self):
        return f"{self.user.username} - {self.ticker} ({self.quantity})"

class TransactionType(models.TextChoices):
    BUY = 'BUY', 'Buy'
    SELL = 'SELL', 'Sell'
    BONUS = 'BONUS', 'Bonus Share'
    DIVIDEND = 'DIVIDEND', 'Cash Dividend'

class PortfolioTransaction(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    account = models.ForeignKey(PortfolioAccount, on_delete=models.CASCADE, null=True, blank=True)
    ticker = models.CharField(max_length=10)
    transaction_type = models.CharField(max_length=10, choices=TransactionType.choices)
    quantity = models.PositiveIntegerField(default=0)
    rate = models.DecimalField(max_digits=10, decimal_places=2)
    amount = models.DecimalField(max_digits=12, decimal_places=2) # qty * rate
    
    # Fees
    commission = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    sebon_fee = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    dp_charge = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    cgt = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    
    receivable_amount = models.DecimalField(max_digits=12, decimal_places=2) # Final amount paid/received
    transaction_date = models.DateTimeField()
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.user.username} - {self.transaction_type} {self.ticker}"

class DailyFloorsheet(models.Model):
    transaction_id = models.CharField(max_length=50, unique=True)
    ticker = models.CharField(max_length=20, db_index=True)
    buyer_broker = models.CharField(max_length=50)
    seller_broker = models.CharField(max_length=50)
    quantity = models.IntegerField()
    rate = models.DecimalField(max_digits=10, decimal_places=2)
    amount = models.DecimalField(max_digits=15, decimal_places=2)
    date = models.DateField(db_index=True)

    class Meta:
        ordering = ['-date', '-transaction_id']

    def __str__(self):
        return f"{self.transaction_id} - {self.ticker}"

class Dividend(models.Model):
    ticker = models.CharField(max_length=20, db_index=True)
    fiscal_year = models.CharField(max_length=20) # e.g., "2080/81"
    bonus_percent = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    cash_percent = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    total_percent = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    date = models.DateField(null=True, blank=True) # Distribution date

    def __str__(self):
        return f"{self.ticker} - {self.fiscal_year}"

class FinancialReport(models.Model):
    ticker = models.CharField(max_length=20, db_index=True)
    fiscal_year = models.CharField(max_length=20)
    quarter = models.IntegerField(choices=[(1, 'Q1'), (2, 'Q2'), (3, 'Q3'), (4, 'Q4')])
    
    paid_up_capital = models.DecimalField(max_digits=20, decimal_places=2, null=True)
    reserves_and_surplus = models.DecimalField(max_digits=20, decimal_places=2, null=True)
    
    revenue = models.DecimalField(max_digits=20, decimal_places=2, null=True)
    operating_profit = models.DecimalField(max_digits=20, decimal_places=2, null=True)
    net_profit = models.DecimalField(max_digits=20, decimal_places=2, null=True)
    
    eps = models.DecimalField(max_digits=10, decimal_places=2, null=True)
    pe_ratio = models.DecimalField(max_digits=10, decimal_places=2, null=True)
    book_value = models.DecimalField(max_digits=10, decimal_places=2, null=True)
    return_on_equity = models.DecimalField(max_digits=6, decimal_places=2, null=True) # in %

    class Meta:
        unique_together = ('ticker', 'fiscal_year', 'quarter')
        ordering = ['-fiscal_year', '-quarter']

    def __str__(self):
        return f"{self.ticker} - {self.fiscal_year} Q{self.quarter}"

class Strategy(models.Model):
    name = models.CharField(max_length=255)
    description = models.TextField()
    code = models.TextField(blank=True, default="")
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    created_at = models.DateTimeField(auto_now_add=True)
    is_public = models.BooleanField(default=False)
    
    # Performance Metrics (Snapshots)
    pnl = models.DecimalField(max_digits=12, decimal_places=2, default=0.00) # Percentage or Absolute? User showed $ and % but let's store value and maybe % separate or just value. User text: "$2239.07 (22.39%)". Let's store both or just one string? Better structured.
    # Let's add pnl_amount and pnl_percent
    pnl_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0.00)
    pnl_percent = models.DecimalField(max_digits=6, decimal_places=2, default=0.00)
    max_drawdown = models.DecimalField(max_digits=6, decimal_places=2, default=0.00)
    sharpe_ratio = models.DecimalField(max_digits=6, decimal_places=2, default=0.00)
    win_rate = models.DecimalField(max_digits=6, decimal_places=2, default=0.00)

    def __str__(self):
        return self.name
