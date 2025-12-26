from django.db import models
from django.contrib.auth.models import User


class ForecastModel(models.Model):
    """
    Tracks trained ML models for stock price forecasting.
    Each symbol can have multiple models (LSTM, GRU, Prophet).
    """
    MODEL_TYPES = [
        ('LSTM', 'Long Short-Term Memory'),
        ('GRU', 'Gated Recurrent Unit'),
        ('PROPHET', 'Facebook Prophet'),
    ]
    
    symbol = models.CharField(max_length=20, db_index=True)
    model_type = models.CharField(max_length=10, choices=MODEL_TYPES)
    trained_at = models.DateTimeField(auto_now_add=True)
    training_samples = models.IntegerField(help_text="Number of samples used for training")
    validation_loss = models.FloatField(null=True, blank=True)
    test_mape = models.FloatField(null=True, blank=True, help_text="Mean Absolute Percentage Error on test set")
    test_rmse = models.FloatField(null=True, blank=True, help_text="Root Mean Square Error on test set")
    file_path = models.CharField(max_length=500, help_text="Path to saved model file")
    hyperparameters = models.JSONField(default=dict, help_text="Model configuration and hyperparameters")
    is_published = models.BooleanField(default=False, help_text="Whether this model is published for strategy application")
    is_active = models.BooleanField(default=True, help_text="Whether this model is currently active for predictions")
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True)
    
    class Meta:
        db_table = 'ml_forecastmodel'  # Use existing table from backend
        ordering = ['-trained_at']
        indexes = [
            models.Index(fields=['symbol', 'model_type', 'is_active']),
        ]
    
    def __str__(self):
        return f"{self.symbol} - {self.model_type} ({self.trained_at.strftime('%Y-%m-%d')})"


class TrainingJob(models.Model):
    """
    Tracks all training jobs for monitoring and debugging.
    """
    STATUS_CHOICES = [
        ('PENDING', 'Pending'),
        ('RUNNING', 'Running'),
        ('SUCCESS', 'Success'),
        ('FAILED', 'Failed'),
    ]
    
    task_id = models.CharField(max_length=255, unique=True, db_index=True, help_text="Celery task ID")
    symbol = models.CharField(max_length=20, db_index=True)
    model_type = models.CharField(max_length=10, choices=ForecastModel.MODEL_TYPES)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='PENDING', db_index=True)
    started_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    progress_message = models.TextField(blank=True, help_text="Latest progress update")
    result_data = models.JSONField(null=True, blank=True, help_text="Final training results")
    error_message = models.TextField(blank=True, help_text="Error details if failed")
    hyperparameters = models.JSONField(default=dict)
    optimize = models.BooleanField(default=False)
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True)
    forecast_model = models.ForeignKey(ForecastModel, on_delete=models.SET_NULL, null=True, blank=True, 
                                      related_name='training_jobs', help_text="Resulting model if successful")
    
    class Meta:
        db_table = 'ml_trainingjob'
        ordering = ['-started_at']
        indexes = [
            models.Index(fields=['status', '-started_at']),
            models.Index(fields=['symbol', '-started_at']),
            models.Index(fields=['created_by', '-started_at']),
        ]
    
    def __str__(self):
        return f"{self.symbol} - {self.model_type} ({self.status})"
    
    @property
    def duration(self):
        """Calculate job duration in seconds"""
        if self.completed_at:
            return (self.completed_at - self.started_at).total_seconds()
        return None


class Forecast(models.Model):
    """
    Stores generated price forecasts for stocks.
    Each forecast represents a single predicted data point.
    Can be either a future forecast or a test set prediction for validation.
    """
    model = models.ForeignKey(ForecastModel, on_delete=models.CASCADE, related_name='forecasts')
    symbol = models.CharField(max_length=20, db_index=True)
    forecast_date = models.DateField(db_index=True, help_text="Date for which the price is predicted")
    predicted_price = models.DecimalField(max_digits=12, decimal_places=2)
    predicted_high = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    predicted_low = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    predicted_volume = models.BigIntegerField(null=True, blank=True)
    confidence_lower = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True, help_text="Lower bound of confidence interval")
    confidence_upper = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True, help_text="Upper bound of confidence interval")
    is_test_prediction = models.BooleanField(default=False, help_text="True if this is a test set prediction for validation, False if future forecast")
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        db_table = 'ml_forecast'
        ordering = ['forecast_date']
        unique_together = ['model', 'forecast_date']
        indexes = [
            models.Index(fields=['symbol', 'forecast_date']),
            models.Index(fields=['model', 'forecast_date']),
            models.Index(fields=['is_test_prediction']),
        ]
    
    def __str__(self):
        return f"{self.symbol} - {self.forecast_date}: {self.predicted_price}"


class ForecastBacktest(models.Model):
    """
    Stores results of strategy backtests run on forecasted data.
    Links strategies to their performance on future predictions.
    """
    from .external_models import Strategy, StrategyExperiment
    
    strategy = models.ForeignKey(Strategy, on_delete=models.CASCADE, related_name='forecast_backtests')
    experiment = models.ForeignKey(StrategyExperiment, on_delete=models.SET_NULL, null=True, blank=True, 
                                   help_text="Published experiment used for this backtest")
    symbol = models.CharField(max_length=20, db_index=True)
    forecast_model = models.ForeignKey(ForecastModel, on_delete=models.CASCADE, related_name='backtests')
    
    # Backtest results
    entry_date = models.DateField(null=True, blank=True)
    entry_price = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    exit_date = models.DateField(null=True, blank=True)
    exit_price = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    signal_type = models.CharField(max_length=10, choices=[('BUY', 'Buy'), ('SELL', 'Sell'), ('HOLD', 'Hold')])
    expected_return_pct = models.FloatField(null=True, blank=True, help_text="Expected return percentage")
    confidence_score = models.FloatField(help_text="Confidence score from 0 to 1")
    
    # Metadata
    parameters_used = models.JSONField(default=dict, help_text="Strategy parameters used for this backtest")
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        db_table = 'ml_forecastbacktest'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['strategy', 'symbol']),
            models.Index(fields=['signal_type', 'confidence_score']),
        ]
    
    def __str__(self):
        return f"{self.strategy.name} on {self.symbol} - {self.signal_type} ({self.confidence_score:.2f})"


class ForecastAccuracy(models.Model):
    """
    Tracks actual vs predicted prices to measure forecast accuracy over time.
    """
    forecast = models.ForeignKey(Forecast, on_delete=models.CASCADE, related_name='accuracy_records')
    actual_price = models.DecimalField(max_digits=12, decimal_places=2)
    absolute_error = models.DecimalField(max_digits=12, decimal_places=2)
    percentage_error = models.FloatField()
    recorded_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        db_table = 'ml_forecastaccuracy'
        ordering = ['-recorded_at']
    
    def __str__(self):
        return f"{self.forecast.symbol} - {self.forecast.forecast_date}: {self.percentage_error:.2f}% error"
