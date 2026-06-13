from django.db import models


class DailyTradingPlan(models.Model):
    """One precomputed plan per trading day. `date` is the session the plan is FOR
    (the next trading day at generation time), not the generation day."""

    class Regime(models.TextChoices):
        RISK_ON = "RISK_ON", "Risk On"
        NEUTRAL = "NEUTRAL", "Neutral"
        RISK_OFF = "RISK_OFF", "Risk Off"
        UNKNOWN = "UNKNOWN", "Unknown"

    date = models.DateField(unique=True, db_index=True)
    generated_at = models.DateTimeField(auto_now=True)
    regime = models.CharField(max_length=8, choices=Regime.choices, default=Regime.UNKNOWN)
    breadth = models.FloatField(null=True, blank=True)
    payload = models.JSONField(default=dict, blank=True)  # {picks, exits, catalysts, market_context}

    class Meta:
        db_table = "daily_trading_plan"
        ordering = ["-date"]

    def __str__(self):
        return f"Plan for {self.date} ({self.regime})"
