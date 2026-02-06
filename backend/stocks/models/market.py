from django.db import models

class EquityManager(models.Manager):
    """
    Custom manager that returns only equity instruments.
    Automatically excludes Debentures and Mutual Funds.
    """
    def get_queryset(self):
        return super().get_queryset().filter(status='A').exclude(
            instrument_type__in=[
                'Mutual Funds', 
                'Mutual Fund',
                'Non-Convertible Debentures', 
                'Corporate Debentures', 
                'Debentures'
            ]
        )

class Company(models.Model):
    symbol = models.CharField(max_length=20, primary_key=True, db_index=True)
    name = models.CharField(max_length=255, db_column='companyName')
    sector = models.CharField(max_length=100, db_column='sectorName')
    instrument_type = models.CharField(max_length=100, db_column='instrumentType', null=True, blank=True)
    status = models.CharField(max_length=1, default='A')

    # Use custom manager as default
    objects = EquityManager()
    # Keep unfiltered manager for admin/special cases
    all_objects = models.Manager()

    class Meta:
        managed = False
        db_table = 'companies'

    def __str__(self):
        return f"{self.symbol} - {self.name}"

class DailyStockPrice(models.Model):
    id = models.AutoField(primary_key=True)
    ticker = models.CharField(max_length=20, db_index=True, db_column='symbol')
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

class DailyFloorsheet(models.Model):
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

class DailyMarketSummary(models.Model):
    date = models.DateField(unique=True)
    total_turnover = models.DecimalField(max_digits=20, decimal_places=2)
    total_volume = models.BigIntegerField()
    total_transactions = models.IntegerField()
    top_gainers = models.JSONField(default=list)
    top_losers = models.JSONField(default=list)
    top_turnovers = models.JSONField(default=list)
    top_volumes = models.JSONField(default=list)
    sector_turnover = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'daily_market_summary'
        ordering = ['-date']
    
    def __str__(self):
        return f"Market Summary - {self.date}"

class DailyBuyerFloorsheet(models.Model):
    transaction_date = models.DateField(primary_key=True)
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
    transaction_date = models.DateField(primary_key=True)
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

class DailyCumulativeAccumulation(models.Model):
    symbol = models.CharField(max_length=20, primary_key=True, db_index=True)
    transaction_date = models.DateField(db_index=True)
    entity_id = models.CharField(max_length=10, db_index=True)
    cumulative_buy = models.DecimalField(max_digits=20, decimal_places=2, default=0)
    cumulative_sell = models.DecimalField(max_digits=20, decimal_places=2, default=0)
    cumulative_buy_amount = models.DecimalField(max_digits=20, decimal_places=2, default=0)
    cumulative_sell_amount = models.DecimalField(max_digits=20, decimal_places=2, default=0)
    cumulative_net = models.DecimalField(max_digits=20, decimal_places=2, default=0)

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
