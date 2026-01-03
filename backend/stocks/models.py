from django.db import models
from django.contrib.auth.models import User

class Company(models.Model):
    symbol = models.CharField(max_length=20, primary_key=True, db_index=True)
    name = models.CharField(max_length=255, db_column='companyName')
    sector = models.CharField(max_length=100, db_column='sectorName')
    instrument_type = models.CharField(max_length=100, db_column='instrumentType', null=True, blank=True)
    status = models.CharField(max_length=1, default='A')

    class Meta:
        managed = False
        db_table = 'companies'

    def __str__(self):
        return f"{self.symbol} - {self.name}"

class DailyStockPrice(models.Model):
    ticker = models.CharField(max_length=20, primary_key=True, db_column='symbol')
    date = models.DateField(db_index=True, db_column='transaction_date')
    open = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    high = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    low = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    close = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    volume = models.DecimalField(max_digits=20, decimal_places=2, null=True, blank=True)
    prev_close = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    turnover = models.DecimalField(max_digits=20, decimal_places=2, null=True, blank=True)
    conf = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    vwap = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    trans = models.IntegerField(null=True, blank=True)
    diff = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    range = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    diff_percent = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    range_percent = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    vwap_percent = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    days_120 = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    days_180 = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    weeks_52_high = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    weeks_52_low = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)

    class Meta:
        managed = False
        db_table = 'daily_stock_price'
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
    peg_ratio = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    price_to_book = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    price_to_sales = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    ro_equity = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    ro_assets = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    dividend_payout_ratio = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    qoq_earnings_growth = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    yoy_earnings_growth = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    graham_number_diff = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    debt_to_equity = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    
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
    
    # Exit Strategy Fields
    stop_loss_price = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    target_price = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    target_price_2 = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    target_price_3 = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    thesis = models.TextField(blank=True, null=True)
    strategy_type = models.CharField(max_length=50, default='MANUAL') # MANUAL, FIXED_PCT, ATR, SUPPORT_RESIST

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
    # Mapping to actual database schema
    transaction_id = models.BigIntegerField(primary_key=True, db_column='transaction_id')
    symbol = models.CharField(max_length=20, db_index=True, db_column='symbol')
    buyer_id = models.IntegerField(db_index=True, db_column='buyer_id')
    seller_id = models.IntegerField(db_index=True, db_column='seller_id')
    transaction_quantity = models.IntegerField(db_column='transaction_quantity')
    transaction_rate = models.DecimalField(max_digits=10, decimal_places=2, db_column='transaction_rate')
    transaction_amount = models.DecimalField(max_digits=15, decimal_places=2, db_column='transaction_amount')
    transaction_date = models.DateField(db_index=True, db_column='transaction_date')
    transaction_book_id = models.BigIntegerField(db_column='transaction_book_id')
    stock_id = models.IntegerField(db_column='stock_id')
    buyer_name = models.CharField(max_length=255, null=True, blank=True, db_column='buyer_name')
    seller_name = models.CharField(max_length=255, null=True, blank=True, db_column='seller_name')
    transaction_datetime = models.DateTimeField(db_column='transaction_datetime')
    security_name = models.CharField(max_length=255, null=True, blank=True, db_column='security_name')

    # Aliases for compatibility
    @property
    def ticker(self): return self.symbol
    @property
    def date(self): return self.transaction_date
    @property
    def quantity(self): return self.transaction_quantity
    @property
    def rate(self): return self.transaction_rate
    @property
    def buyer_broker(self): return self.buyer_id
    @property
    def seller_broker(self): return self.seller_id
    @property
    def amount(self): return self.transaction_amount

    class Meta:
        managed = False
        db_table = 'daily_floorsheet'
        ordering = ['-transaction_date', '-transaction_id']

    def __str__(self):
        return f"{self.transaction_id} - {self.symbol}"

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
    class ReportType(models.TextChoices):
        ANNUAL = 'ANNUAL', 'Annual'
        QUARTERLY = 'QUARTERLY', 'Quarterly'

    ticker = models.CharField(max_length=20, db_index=True)
    fiscal_year = models.CharField(max_length=20)
    report_type = models.CharField(max_length=20, choices=ReportType.choices, default=ReportType.QUARTERLY)
    quarter = models.IntegerField(choices=[(1, 'Q1'), (2, 'Q2'), (3, 'Q3'), (4, 'Q4')], null=True, blank=True)
    is_audited = models.BooleanField(default=False)
    report_template = models.CharField(max_length=50, default='GENERAL', help_text='Template for rendering (e.g. BANK, HYDRO)')
    
    paid_up_capital = models.DecimalField(max_digits=20, decimal_places=2, null=True, blank=True)
    reserves_and_surplus = models.DecimalField(max_digits=20, decimal_places=2, null=True, blank=True)
    
    revenue = models.DecimalField(max_digits=20, decimal_places=2, null=True, blank=True)
    operating_profit = models.DecimalField(max_digits=20, decimal_places=2, null=True, blank=True)
    net_profit = models.DecimalField(max_digits=20, decimal_places=2, null=True, blank=True)
    
    eps = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    pe_ratio = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    book_value = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    return_on_equity = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True) # in %

    # Granular Report Data
    balance_sheet = models.JSONField(null=True, blank=True)
    profit_loss = models.JSONField(null=True, blank=True)
    cash_flow = models.JSONField(null=True, blank=True)
    key_ratios = models.JSONField(null=True, blank=True)

    # Granular Report Data
    balance_sheet = models.JSONField(null=True, blank=True)
    profit_loss = models.JSONField(null=True, blank=True)

    class Meta:
        unique_together = ('ticker', 'fiscal_year', 'report_type', 'quarter')
        ordering = ['-fiscal_year', '-report_type', '-quarter']

    def __str__(self):
        if self.report_type == self.ReportType.ANNUAL:
            return f"{self.ticker} - {self.fiscal_year} (Annual)"
        return f"{self.ticker} - {self.fiscal_year} Q{self.quarter}"

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
    
    # Performance Metrics (Snapshots)
    pnl = models.DecimalField(max_digits=12, decimal_places=2, default=0.00) # Percentage or Absolute? User showed $ and % but let's store value and maybe % separate or just value. User text: "$2239.07 (22.39%)". Let's store both or just one string? Better structured.
    # Let's add pnl_amount and pnl_percent
    pnl_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0.00)
    pnl_percent = models.DecimalField(max_digits=6, decimal_places=2, default=0.00)
    max_drawdown = models.DecimalField(max_digits=6, decimal_places=2, default=0.00)
    sharpe_ratio = models.DecimalField(max_digits=6, decimal_places=2, default=0.00)
    win_rate = models.DecimalField(max_digits=6, decimal_places=2, default=0.00)
    optimization_config = models.TextField(blank=True, default="")
    icon = models.CharField(max_length=50, default="Lightbulb")
    icon_color = models.CharField(max_length=7, default="#000000")

    # Recommendation / Publishing
    # Published status is now tracked on individual StrategyExperiment models (is_published=True)
    # Allows multiple published configurations (e.g. per symbol)

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
    scope_value = models.CharField(max_length=255) # "NABIL", "Banking", "ALL"
    
    start_date = models.DateField()
    end_date = models.DateField()
    is_published = models.BooleanField(default=False)
    
    # Input
    parameters = models.JSONField(default=dict)
    metrics = models.JSONField(default=dict) # Return, Sharpe, Win Rate etc.
    
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
    """Stores user preference for which parameter timeframe to use per strategy+symbol"""
    class Timeframe(models.TextChoices):
        SHORT = '1Y', 'Short Term (1 Year)'
        MID = '3Y', 'Mid Term (3 Years)'
        LONG = '5Y', 'Long Term (5 Years)'
    
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    strategy = models.ForeignKey(Strategy, on_delete=models.CASCADE, related_name='symbol_configs')
    symbol = models.CharField(max_length=20)
    preferred_timeframe = models.CharField(
        max_length=2,
        choices=Timeframe.choices,
        default=Timeframe.MID
    )
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        unique_together = [['user', 'strategy', 'symbol']]
        indexes = [
            models.Index(fields=['user', 'strategy', 'symbol']),
        ]
    
    def __str__(self):
        return f"{self.user.username} - {self.strategy.name} ({self.symbol}): {self.get_preferred_timeframe_display()}"

class DailyBuyerFloorsheet(models.Model):
    transaction_date = models.DateField(primary_key=True) # Fake PK for Django
    symbol = models.CharField(max_length=20)
    buyer_id = models.IntegerField()
    buy_volume = models.BigIntegerField(blank=True, null=True)
    total_volume = models.DecimalField(max_digits=20, decimal_places=2, blank=True, null=True)
    buy_volume_percentage = models.DecimalField(max_digits=10, decimal_places=2, blank=True, null=True)
    buyer_rank = models.BigIntegerField(blank=True, null=True)
    average_weighted_price = models.DecimalField(max_digits=20, decimal_places=4, blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'daily_buyer_floorsheet'

class DailySellerFloorsheet(models.Model):
    transaction_date = models.DateField(primary_key=True) # Fake PK for Django
    symbol = models.CharField(max_length=20)
    seller_id = models.IntegerField()
    sell_volume = models.BigIntegerField(blank=True, null=True)
    total_volume = models.DecimalField(max_digits=20, decimal_places=2, blank=True, null=True)
    sell_volume_percentage = models.DecimalField(max_digits=10, decimal_places=2, blank=True, null=True)
    seller_rank = models.BigIntegerField(blank=True, null=True)
    average_weighted_price = models.DecimalField(max_digits=20, decimal_places=4, blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'daily_seller_floorsheet'

class WatchlistItem(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    ticker = models.CharField(max_length=20)
    added_at = models.DateTimeField(auto_now_add=True)
    target_price = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    notes = models.TextField(blank=True, null=True)

    class Meta:
        unique_together = ('user', 'ticker')
        ordering = ['-added_at']

    def __str__(self):
        return f"{self.user.username} - {self.ticker}"

class DailyMarketSummary(models.Model):
    date = models.DateField(unique=True)
    total_turnover = models.DecimalField(max_digits=20, decimal_places=2)
    total_volume = models.BigIntegerField()
    total_transactions = models.IntegerField()
    
    # JSON Fields for lists of top items
    # Expected format: [{'symbol': 'ACL', 'value': 100, ...}, ...]
    top_gainers = models.JSONField(default=list)
    top_losers = models.JSONField(default=list)
    top_turnovers = models.JSONField(default=list)
    top_volumes = models.JSONField(default=list)
    
    # Sectorwise turnover
    sector_turnover = models.JSONField(default=dict)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'daily_market_summary'
        ordering = ['-date']
    
    def __str__(self):
        return f"Market Summary - {self.date}"

class DailyCumulativeAccumulation(models.Model):
    symbol = models.CharField(max_length=20, primary_key=True, db_index=True)
    transaction_date = models.DateField(db_index=True)
    entity_id = models.CharField(max_length=10, db_index=True) # Broker ID
    
    cumulative_buy = models.DecimalField(max_digits=20, decimal_places=2, default=0)
    cumulative_sell = models.DecimalField(max_digits=20, decimal_places=2, default=0)
    cumulative_buy_amount = models.DecimalField(max_digits=20, decimal_places=2, default=0)
    cumulative_sell_amount = models.DecimalField(max_digits=20, decimal_places=2, default=0)
    cumulative_net = models.DecimalField(max_digits=20, decimal_places=2, default=0)
    
    # Metadata
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        managed = False
        db_table = 'daily_cumulative_accumulation'
        unique_together = ('symbol', 'transaction_date', 'entity_id')
        indexes = [
            models.Index(fields=['symbol', 'transaction_date']),
            models.Index(fields=['symbol', 'entity_id']),
        ]

    def __str__(self):
        return f"{self.symbol} - {self.entity_id} - {self.transaction_date}"

class DataUploadLog(models.Model):
    UPLOAD_TYPES = (
        ('FLOORSHEET', 'Floorsheet'),
        ('PRICE', 'Daily Price'),
        ('GITHUB_SYNC', 'GitHub Sync'),
        ('INDICATORS', 'Technical Indicators'),
        ('OPTIMIZATION', 'Strategy Training'),
        ('SIGNALS', 'Signal Generation'),
        ('BROKER_ANALYSIS', 'Broker Analysis'),
    )
    STATUS_CHOICES = (
        ('PENDING', 'Pending'),
        ('SUCCESS', 'Success'),
        ('FAILED', 'Failed'),
        ('ABORTED', 'Aborted'),
    )

    file_name = models.CharField(max_length=255)
    upload_type = models.CharField(max_length=20, choices=UPLOAD_TYPES)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='PENDING')
    records_count = models.IntegerField(default=0)
    error_message = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'data_upload_log'
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.file_name} ({self.status})"

class Notification(models.Model):
    class NotificationType(models.TextChoices):
        INFO = 'INFO', 'Information'
        SUCCESS = 'SUCCESS', 'Success'
        WARNING = 'WARNING', 'Warning'
        PRICE_ALERT = 'PRICE_ALERT', 'Price Alert'
        STOP_LOSS = 'STOP_LOSS', 'Stop Loss'

    user = models.ForeignKey(User, on_delete=models.CASCADE)
    title = models.CharField(max_length=255)
    message = models.TextField()
    type = models.CharField(max_length=20, choices=NotificationType.choices, default=NotificationType.INFO)
    
    # Ticker context for direct navigation or actions
    ticker = models.CharField(max_length=20, null=True, blank=True)
    
    read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'notifications'
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.user.username} - {self.title}"

class StrategySignal(models.Model):
    SIGNAL_CHOICES = (
        ('BUY', 'Buy'),
        ('SELL', 'Sell'),
        ('HOLD', 'Hold'),
        ('NEUTRAL', 'Neutral'),
    )

    strategy = models.ForeignKey(Strategy, on_delete=models.CASCADE)
    symbol = models.CharField(max_length=20)
    date = models.DateField(help_text="The date of the signal (usually today)")
    signal = models.CharField(max_length=10, choices=SIGNAL_CHOICES)
    
    # Optional debug info
    last_close = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    metadata = models.JSONField(default=dict, blank=True) # E.g., {'orders_count': 1, 'position': 100}

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'strategy_signals'
        unique_together = ('strategy', 'symbol', 'date')
        ordering = ['-date', 'strategy__name']

    def __str__(self):
        return f"{self.symbol} - {self.strategy.name}: {self.signal} ({self.date})"


