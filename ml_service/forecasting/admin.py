from django.contrib import admin
from .models import ForecastModel, TrainingJob, Forecast, ForecastBacktest, ForecastAccuracy

@admin.register(ForecastModel)
class ForecastModelAdmin(admin.ModelAdmin):
    list_display = ['symbol', 'model_type', 'trained_at', 'is_published', 'is_active', 'test_mape']
    list_filter = ['model_type', 'is_published', 'is_active', 'trained_at']
    search_fields = ['symbol']
    ordering = ['-trained_at']

@admin.register(TrainingJob)
class TrainingJobAdmin(admin.ModelAdmin):
    list_display = ['symbol', 'model_type', 'status', 'started_at', 'completed_at']
    list_filter = ['status', 'model_type', 'started_at']
    search_fields = ['symbol', 'task_id']
    ordering = ['-started_at']

@admin.register(Forecast)
class ForecastAdmin(admin.ModelAdmin):
    list_display = ['symbol', 'forecast_date', 'predicted_price', 'is_test_prediction']
    list_filter = ['is_test_prediction', 'forecast_date']
    search_fields = ['symbol']
    ordering = ['-forecast_date']

@admin.register(ForecastBacktest)
class ForecastBacktestAdmin(admin.ModelAdmin):
    list_display = ['symbol', 'strategy', 'signal_type', 'confidence_score', 'created_at']
    list_filter = ['signal_type', 'created_at']
    search_fields = ['symbol']

@admin.register(ForecastAccuracy)
class ForecastAccuracyAdmin(admin.ModelAdmin):
    list_display = ['forecast', 'actual_price', 'absolute_error', 'percentage_error', 'recorded_at']
    list_filter = ['recorded_at']
    ordering = ['-recorded_at']
