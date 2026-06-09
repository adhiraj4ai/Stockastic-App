# backend/stocks/models/signal.py
from django.db import models
from django.db.models import Q
from .strategy import Strategy

USER_STRATEGY = "USER_STRATEGY"


class SignalEpisode(models.Model):
    STATUS_CHOICES = (
        ("ACTIVE", "Active"), ("WON", "Target Reached"), ("LOST", "Stop Loss Hit"),
        ("FLIPPED", "Closed on Opposite Signal"), ("CLOSED_MANUAL", "Closed Manually"),
    )
    EXIT_REASONS = (
        ("TARGET", "Target"), ("STOP", "Stop"), ("SIGNAL_FLIP", "Signal Flip"), ("MANUAL", "Manual"),
    )

    source = models.CharField(max_length=30)
    strategy = models.ForeignKey(Strategy, null=True, blank=True, on_delete=models.CASCADE)
    producer_key = models.CharField(max_length=64, db_index=True)
    symbol = models.CharField(max_length=20, db_index=True)
    direction = models.CharField(max_length=4)  # BUY | SELL

    start_date = models.DateField()
    end_date = models.DateField(null=True, blank=True)        # null == ACTIVE
    last_signal_date = models.DateField()

    entry_price = models.DecimalField(max_digits=10, decimal_places=2)
    target_price = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    stop_loss_price = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    entry_strength = models.FloatField(default=0)
    signal_tier = models.CharField(max_length=50, blank=True, default="")

    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="ACTIVE")
    exit_price = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    exit_reason = models.CharField(max_length=20, choices=EXIT_REASONS, null=True, blank=True)
    pnl_percent = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    peak_strength = models.FloatField(default=0)

    rationale = models.TextField(blank=True, default="")
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "signal_episodes"
        ordering = ["-start_date"]
        constraints = [
            models.UniqueConstraint(
                fields=["producer_key", "symbol"],
                condition=Q(end_date__isnull=True),
                name="one_open_episode_per_producer_symbol",
            ),
        ]
        indexes = [
            models.Index(fields=["source", "start_date"]),
            models.Index(fields=["symbol", "start_date"]),
            models.Index(fields=["producer_key", "symbol"]),
            models.Index(fields=["status"]),
        ]

    @staticmethod
    def make_producer_key(source, strategy_id=None):
        return f"{source}:{strategy_id}" if source == USER_STRATEGY else source

    def __str__(self):
        return f"{self.symbol} {self.source} {self.direction} {self.start_date}->{self.end_date or 'OPEN'}"
