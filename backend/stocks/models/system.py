from django.db import models
from django.contrib.auth.models import User

class DataUploadLog(models.Model):
    UPLOAD_TYPES = (
        ('FLOORSHEET', 'Floorsheet'),
        ('PRICE', 'Daily Price'),
        ('GITHUB_SYNC', 'GitHub Sync'),
        ('INDICATORS', 'Technical Indicators'),
        ('OPTIMIZATION', 'Strategy Training'),
        ('SIGNALS', 'Signal Generation'),
        ('BROKER_ANALYSIS', 'Broker Analysis'),
        ('EVALUATION', 'Signal Evaluation'),
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
        # Portfolio alerts
        STOP_LOSS_HIT = 'STOP_LOSS_HIT', 'Stop Loss Hit'
        TARGET_REACHED = 'TARGET_REACHED', 'Target Reached'
        SIGNIFICANT_GAIN = 'SIGNIFICANT_GAIN', 'Significant Gain'
        SIGNIFICANT_LOSS = 'SIGNIFICANT_LOSS', 'Significant Loss'
        BELOW_WACC = 'BELOW_WACC', 'Dropped Below WACC'
        TREND_BUY_5D = 'TREND_BUY_5D', '5D Buying Trend'
        
        # Technical alerts
        VOLUME_SPIKE = 'VOLUME_SPIKE', 'Volume Spike'
        RSI_OVERSOLD = 'RSI_OVERSOLD', 'RSI Oversold'
        RSI_OVERBOUGHT = 'RSI_OVERBOUGHT', 'RSI Overbought'
        MACD_BULLISH = 'MACD_BULLISH', 'MACD Bullish Crossover'
        MACD_BEARISH = 'MACD_BEARISH', 'MACD Bearish Crossover'
        GOLDEN_CROSS = 'GOLDEN_CROSS', 'Golden Cross (50/200)'
        DEATH_CROSS = 'DEATH_CROSS', 'Death Cross (50/200)'
        
        # Broker Discovery alerts
        CONSISTENT_BUYING = 'CONSISTENT_BUYING', 'Consistent Broker Buying'
        CONSISTENT_SELLING = 'CONSISTENT_SELLING', 'Consistent Broker Selling'
        WHALE_ENTRY = 'WHALE_ENTRY', 'Top Broker New Entry'
        
        # Market / Sector alerts
        SECTOR_PUMP = 'SECTOR_PUMP', 'Sector Pump Detected'
        MARKET_BREADTH_SHIFT = 'MARKET_BREADTH_SHIFT', 'Market Breadth Shift'
        
        # Portfolio updates
        PORTFOLIO_DIVERSITY = 'PORTFOLIO_DIVERSITY', 'Portfolio Concentration Warning'
        TAKE_PROFIT = 'TAKE_PROFIT', 'Take Profit Reminder'
        
        # Watchlist alerts
        WATCHLIST_BREAKOUT = 'WATCHLIST_BREAKOUT', 'Watchlist Breakout'
        WATCHLIST_ENTRY = 'WATCHLIST_ENTRY', 'Entry Opportunity'
        
        # Signal alerts
        SIGNAL_BUY = 'SIGNAL_BUY', 'Buy Signal'
        SIGNAL_SELL = 'SIGNAL_SELL', 'Sell Signal'
        SIGNAL_STRONG_BUY = 'SIGNAL_STRONG_BUY', 'Strong Buy Signal'
        SIGNAL_STRONG_SELL = 'SIGNAL_STRONG_SELL', 'Strong Sell Signal'

        # Whale Watch / Smart Money alerts
        WHALE_BUY = 'WHALE_BUY', 'Whale Watch Buy'
        WHALE_SELL = 'WHALE_SELL', 'Whale Watch Sell'

        # General
        INFO = 'INFO', 'Information'
        SUCCESS = 'SUCCESS', 'Success'
        WARNING = 'WARNING', 'Warning'
        PRICE_ALERT = 'PRICE_ALERT', 'Price Alert'

    user = models.ForeignKey(User, on_delete=models.CASCADE)
    title = models.CharField(max_length=255)
    message = models.TextField()
    type = models.CharField(max_length=30, choices=NotificationType.choices, default=NotificationType.INFO)
    ticker = models.CharField(max_length=20, null=True, blank=True)
    read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    
    # Smart notification fields
    redirect_url = models.CharField(max_length=500, null=True, blank=True, help_text="URL to redirect when notification is clicked")
    portfolio_item_id = models.IntegerField(null=True, blank=True, help_text="Related portfolio item ID")
    watchlist_item_id = models.IntegerField(null=True, blank=True, help_text="Related watchlist item ID")
    strategy_signal_id = models.IntegerField(null=True, blank=True, help_text="Related strategy signal ID")
    metadata = models.JSONField(null=True, blank=True, help_text="Additional context data")

    class Meta:
        db_table = 'notifications'
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.user.username} - {self.title}"


class GeneratedSignal(models.Model):
    """
    Stores all generated signals from various sources (Smart Money, Whale Watch engines, etc.).
    Signals are generated via pipeline and read by the Signal Intel frontend.
    """
    SOURCE_CHOICES = (
        ('SMART_MONEY', 'Smart Money'),
        ('BROKER_ACCUMULATION', 'Broker Accumulation'),
        ('SMART_CROSSOVER', 'Smart Crossover'),
        ('ICHIMOKU', 'Ichimoku Accumulation'),
    )
    SIGNAL_CHOICES = (
        ('BUY', 'Buy'),
        ('SELL', 'Sell'),
    )

    STATUS_CHOICES = (
        ('ACTIVE', 'Active'),
        ('WON', 'Target Reached'),
        ('LOST', 'Stop Loss Hit'),
        ('CLOSED_MANUAL', 'Closed Manually'),
    )

    source = models.CharField(max_length=30, choices=SOURCE_CHOICES)
    symbol = models.CharField(max_length=20, db_index=True)
    signal = models.CharField(max_length=10, choices=SIGNAL_CHOICES)
    signal_tier = models.CharField(max_length=50, blank=True, default='')
    strength = models.FloatField(default=0)
    ltp = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    
    # Lifecycle Tracking
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='ACTIVE')
    target_price = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    stop_loss_price = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    pnl_percent = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    closed_date = models.DateField(null=True, blank=True)

    rationale = models.TextField(blank=True, default='')
    metadata = models.JSONField(default=dict, blank=True)
    generated_date = models.DateField(db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'generated_signals'
        ordering = ['-generated_date', '-strength']
        unique_together = ('source', 'symbol', 'generated_date')
        indexes = [
            models.Index(fields=['source', 'generated_date']),
            models.Index(fields=['symbol', 'generated_date']),
        ]

    def __str__(self):
        return f"{self.symbol} - {self.source}: {self.signal} ({self.generated_date})"
