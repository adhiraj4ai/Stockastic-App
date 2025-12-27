from rest_framework import serializers
from .models import ForecastModel, Forecast, ForecastBacktest, ForecastAccuracy, TrainingJob


class ForecastModelSerializer(serializers.ModelSerializer):
    """Serializer for ForecastModel"""
    
    class Meta:
        model = ForecastModel
        fields = [
            'id', 'symbol', 'model_type', 'trained_at', 'training_samples',
            'validation_loss', 'test_mape', 'test_rmse', 'file_path',
            'hyperparameters', 'is_active', 'created_by'
        ]
        read_only_fields = ['id', 'trained_at', 'file_path', 'created_by']


class TrainingJobSerializer(serializers.ModelSerializer):
    """Serializer for TrainingJob"""
    duration = serializers.SerializerMethodField()
    
    class Meta:
        model = TrainingJob
        fields = [
            'id', 'task_id', 'symbol', 'model_type', 'status', 'started_at',
            'completed_at', 'duration', 'progress_message', 'result_data',
            'error_message', 'hyperparameters', 'optimize', 'created_by',
            'forecast_model'
        ]
        read_only_fields = ['id', 'started_at', 'completed_at', 'duration']
    
    def get_duration(self, obj):
        return obj.duration


class ForecastSerializer(serializers.ModelSerializer):
    """Serializer for Forecast"""
    
    class Meta:
        model = Forecast
        fields = [
            'id', 'model', 'symbol', 'forecast_date', 'predicted_price',
            'predicted_high', 'predicted_low', 'predicted_volume',
            'confidence_lower', 'confidence_upper', 'created_at'
        ]
        read_only_fields = ['id', 'created_at']


class ForecastBacktestSerializer(serializers.ModelSerializer):
    """Serializer for ForecastBacktest"""
    strategy_name = serializers.CharField(source='strategy.name', read_only=True)
    
    class Meta:
        model = ForecastBacktest
        fields = [
            'id', 'strategy', 'strategy_name', 'experiment', 'symbol',
            'forecast_model', 'entry_date', 'entry_price', 'exit_date',
            'exit_price', 'signal_type', 'expected_return_pct',
            'confidence_score', 'parameters_used', 'created_at'
        ]
        read_only_fields = ['id', 'created_at']


class ForecastAccuracySerializer(serializers.ModelSerializer):
    """Serializer for ForecastAccuracy"""
    
    class Meta:
        model = ForecastAccuracy
        fields = [
            'id', 'forecast', 'actual_price', 'absolute_error',
            'percentage_error', 'recorded_at'
        ]
        read_only_fields = ['id', 'recorded_at']


class TrainModelRequestSerializer(serializers.Serializer):
    """Serializer for model training requests"""
    symbol = serializers.CharField(max_length=20)
    model_type = serializers.ChoiceField(choices=['LSTM', 'GRU', 'PROPHET'])
    hyperparameters = serializers.JSONField(required=False, default=dict)
    optimize = serializers.BooleanField(required=False, default=False)
    n_trials = serializers.IntegerField(required=False, default=50, min_value=10, max_value=200)


class GenerateForecastRequestSerializer(serializers.Serializer):
    """Serializer for forecast generation requests"""
    symbol = serializers.CharField(max_length=20)
    model_id = serializers.IntegerField(required=False)
    horizon_days = serializers.IntegerField(default=252, min_value=1, max_value=365)
