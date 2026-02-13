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
        
        # Watchlist alerts
        WATCHLIST_BREAKOUT = 'WATCHLIST_BREAKOUT', 'Watchlist Breakout'
        WATCHLIST_ENTRY = 'WATCHLIST_ENTRY', 'Entry Opportunity'
        
        # Signal alerts
        SIGNAL_BUY = 'SIGNAL_BUY', 'Buy Signal'
        SIGNAL_SELL = 'SIGNAL_SELL', 'Sell Signal'
        SIGNAL_STRONG_BUY = 'SIGNAL_STRONG_BUY', 'Strong Buy Signal'
        SIGNAL_STRONG_SELL = 'SIGNAL_STRONG_SELL', 'Strong Sell Signal'
        
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

