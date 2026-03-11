from django.db import models
from django.contrib.auth.models import User
import json

class AccountType(models.TextChoices):
    LIVE = 'LIVE', 'Live'
    PAPER = 'PAPER', 'Paper'

class PortfolioAccount(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    name = models.CharField(max_length=100)
    account_type = models.CharField(max_length=10, choices=AccountType.choices, default=AccountType.LIVE)
    balance = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    default_risk_percentage = models.DecimalField(
        max_digits=4, 
        decimal_places=2, 
        default=2.00,
        help_text="Default risk per trade as % of account balance"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.user.username} - {self.name} ({self.get_account_type_display()})"

class PortfolioItem(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    account = models.ForeignKey(PortfolioAccount, on_delete=models.CASCADE, null=True, blank=True)
    ticker = models.CharField(max_length=10)
    quantity = models.IntegerField()
    buy_price = models.DecimalField(max_digits=10, decimal_places=2)
    wacc = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    purchased_at = models.DateTimeField(auto_now_add=True)
    stop_loss_price = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    target_price = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    target_price_2 = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    target_price_3 = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    thesis = models.TextField(blank=True, null=True)
    strategy_type = models.CharField(max_length=50, default='MANUAL')
    tags = models.JSONField(default=list, blank=True, help_text='Custom tags like Core, Swing, Speculative')
    target_allocation_pct = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True, help_text="Target allocation as % of total portfolio")

    class Meta:
        unique_together = ('user', 'account', 'ticker')

    def __str__(self):
        return f"{self.user.username} - {self.ticker} ({self.quantity})"

class TransactionType(models.TextChoices):
    BUY = 'BUY', 'Buy'
    SELL = 'SELL', 'Sell'
    SHORT_SELL = 'SHORT_SELL', 'Short Sell'
    BUY_TO_COVER = 'BUY_TO_COVER', 'Buy to Cover'
    BONUS = 'BONUS', 'Bonus Share'
    DIVIDEND = 'DIVIDEND', 'Cash Dividend'

class TransactionReason(models.TextChoices):
    STOP_LOSS = 'STOP_LOSS', 'Stop Loss'
    TAKE_PROFIT = 'TAKE_PROFIT', 'Take Profit'
    NO_PRICE_CHANGE = 'NO_PRICE_CHANGE', 'No Price Change'
    FUND_NEED = 'FUND_NEED', 'Fund Need'
    BETTER_OPPORTUNITY = 'BETTER_OPPORTUNITY', 'Better Opportunity'
    MARKET_SENTIMENT = 'MARKET_SENTIMENT', 'Market Sentiment'
    OTHER = 'OTHER', 'Other'

class PortfolioTransaction(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    account = models.ForeignKey(PortfolioAccount, on_delete=models.CASCADE, null=True, blank=True)
    ticker = models.CharField(max_length=10)
    transaction_type = models.CharField(max_length=12, choices=TransactionType.choices)
    reason = models.CharField(max_length=20, choices=TransactionReason.choices, null=True, blank=True)
    quantity = models.IntegerField(default=0)
    rate = models.DecimalField(max_digits=10, decimal_places=2)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    commission = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    sebon_fee = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    dp_charge = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    cgt = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    receivable_amount = models.DecimalField(max_digits=12, decimal_places=2)
    transaction_date = models.DateTimeField()
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.user.username} - {self.transaction_type} {self.ticker}"

class WatchlistItem(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    ticker = models.CharField(max_length=20)
    added_at = models.DateTimeField(auto_now_add=True)
    target_price = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    stop_loss_price = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    alert_enabled = models.BooleanField(default=False)
    notes = models.TextField(blank=True, null=True)

    class Meta:
        unique_together = ('user', 'ticker')
        ordering = ['-added_at']

    def __str__(self):
        return f"{self.user.username} - {self.ticker}"

class PortfolioSnapshot(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    account = models.ForeignKey(PortfolioAccount, on_delete=models.CASCADE, null=True, blank=True)
    date = models.DateField(db_index=True)
    
    total_value = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    invested_value = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    cash_balance = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    
    # Benchmarking
    nepse_index = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('user', 'account', 'date')
        ordering = ['-date']

    def __str__(self):
        return f"{self.user.username} - {self.date} - {self.total_value}"

class PortfolioTarget(models.Model):
    class TargetType(models.TextChoices):
        SECTOR = 'SECTOR', 'Sector'
        TAG = 'TAG', 'Tag'

    user = models.ForeignKey(User, on_delete=models.CASCADE)
    account = models.ForeignKey(PortfolioAccount, on_delete=models.CASCADE, null=True, blank=True)
    target_type = models.CharField(max_length=10, choices=TargetType.choices)
    category_name = models.CharField(max_length=100)
    target_percentage = models.DecimalField(max_digits=5, decimal_places=2)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('user', 'account', 'target_type', 'category_name')

    def __str__(self):
        return f"{self.user.username} - {self.category_name} ({self.target_percentage}%)"
