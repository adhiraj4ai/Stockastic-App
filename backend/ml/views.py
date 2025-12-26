from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.utils import timezone
from stocks.models import DailyStockPrice
from rest_framework.permissions import IsAuthenticated
from rest_framework.pagination import PageNumberPagination
from django.shortcuts import get_object_or_404
import os
from datetime import datetime, timedelta
import pandas as pd

from .models import ForecastModel, Forecast, ForecastBacktest, TrainingJob
from .serializers import (
    ForecastModelSerializer, ForecastSerializer, ForecastBacktestSerializer,
    TrainModelRequestSerializer, GenerateForecastRequestSerializer, TrainingJobSerializer
)
from .data_preprocessor import DataPreprocessor
from .forecasters.lstm_forecaster import LSTMForecaster
from .forecasters.gru_forecaster import GRUForecaster
from .forecasters.prophet_forecaster import ProphetForecaster


class StandardResultsSetPagination(PageNumberPagination):
    page_size = 10
    page_size_query_param = 'page_size'
    max_page_size = 100
    page_query_param = 'page'


class ForecastViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing forecasting models and predictions.
    """
    queryset = ForecastModel.objects.all()
    serializer_class = ForecastModelSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = StandardResultsSetPagination
    
    def get_queryset(self):
        queryset = super().get_queryset()
        symbol = self.request.query_params.get('symbol')
        model_type = self.request.query_params.get('model_type')
        is_active = self.request.query_params.get('is_active')
        
        if symbol:
            queryset = queryset.filter(symbol=symbol)
        if model_type:
            queryset = queryset.filter(model_type=model_type)
        if is_active is not None:
            queryset = queryset.filter(is_active=is_active.lower() == 'true')
        
        return queryset
    
    @action(detail=False, methods=['post'])
    def train(self, request):
        """
        Train a new forecasting model (async).
        POST /api/ml/forecasts/train/
        Body: {symbol, model_type, hyperparameters}
        Returns: task_id for tracking progress
        """
        from .tasks import train_model_task
        
        serializer = TrainModelRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        symbol = serializer.validated_data['symbol']
        model_type = serializer.validated_data['model_type']
        hyperparameters = serializer.validated_data.get('hyperparameters', {})
        optimize = serializer.validated_data.get('optimize', False)
        n_trials = serializer.validated_data.get('n_trials', 50)
        
        try:
            # Dispatch async task
            task = train_model_task.delay(
                symbol=symbol,
                model_type=model_type,
                hyperparameters=hyperparameters,
                user_id=request.user.id,
                optimize=optimize,
                n_trials=n_trials
            )
            
            # Create TrainingJob record
            training_job = TrainingJob.objects.create(
                task_id=task.id,
                symbol=symbol,
                model_type=model_type,
                status='PENDING',
                hyperparameters=hyperparameters,
                optimize=optimize,
                created_by=request.user
            )
            
            return Response({
                'message': 'Model training started' + (' with hyperparameter optimization' if optimize else ''),
                'task_id': task.id,
                'job_id': training_job.id,
                'symbol': symbol,
                'model_type': model_type,
                'optimize': optimize,
                'n_trials': n_trials if optimize else None,
                'status_url': f'/api/ml/forecasts/task_status/{task.id}/'
            }, status=status.HTTP_202_ACCEPTED)
            
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    @action(detail=False, methods=['post'])
    def predict(self, request):
        """
        Generate forecasts for a symbol (async).
        POST /api/ml/forecasts/predict/
        Body: {symbol, model_id (optional), horizon_days}
        Returns: task_id for tracking progress
        """
        from .tasks import generate_forecast_task
        
        serializer = GenerateForecastRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        symbol = serializer.validated_data['symbol']
        model_id = serializer.validated_data.get('model_id')
        horizon_days = serializer.validated_data.get('horizon_days', 252)
        
        try:
            # Dispatch async task
            task = generate_forecast_task.delay(
                symbol=symbol,
                model_id=model_id,
                horizon_days=horizon_days
            )
            
            return Response({
                'message': 'Forecast generation started',
                'task_id': task.id,
                'symbol': symbol,
                'horizon_days': horizon_days,
                'status_url': f'/api/ml/forecasts/task_status/{task.id}/'
            }, status=status.HTTP_202_ACCEPTED)
            
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    @action(detail=False, methods=['get'], url_path='task_status/(?P<task_id>[^/.]+)')
    def task_status(self, request, task_id=None):
        """
        Check status of an async task.
        GET /api/ml/forecasts/task_status/{task_id}/
        """
        from celery.result import AsyncResult
        
        try:
            task = AsyncResult(task_id)
            state = task.state
            
            response_data = {
                'task_id': task_id,
                'status': state,
            }
            
            if state == 'PENDING':
                response_data['message'] = 'Task is waiting to start...'
            elif state == 'PROGRESS':
                info = task.info or {}
                if isinstance(info, dict):
                    response_data['message'] = info.get('status', 'In progress')
                    response_data['meta'] = info
                else:
                    response_data['message'] = str(info)
                    response_data['meta'] = {'status': str(info)}
            elif state == 'SUCCESS':
                response_data['message'] = 'Task completed successfully'
                response_data['result'] = task.result
            elif state == 'FAILURE':
                response_data['message'] = 'Task failed'
                # Safely get error info
                try:
                    info = task.info
                    response_data['error'] = str(info) if info else "Unknown error"
                except:
                    response_data['error'] = "Task failed, but error details could not be retrieved"
            
            return Response(response_data)
            
        except Exception as e:
            # Handle Celery backend decoding errors or invalid task IDs
            return Response({
                'task_id': task_id,
                'status': 'FAILURE',
                'message': 'Error retrieving task status',
                'error': str(e)
            }, status=status.HTTP_200_OK) # Return 200 so frontend can handle the "FAILURE" status
    
    @action(detail=False, methods=['get'])
    def by_symbol(self, request):
        """
        Get latest forecasts for a symbol.
        GET /api/ml/forecasts/by_symbol/?symbol=NABIL&limit=252
        """
        symbol = request.query_params.get('symbol')
        limit = int(request.query_params.get('limit', 252))
        
        if not symbol:
            return Response({'error': 'symbol parameter required'}, status=status.HTTP_400_BAD_REQUEST)
        
        forecasts = Forecast.objects.filter(symbol=symbol).order_by('-created_at', 'forecast_date')[:limit]
        
        return Response(ForecastSerializer(forecasts, many=True).data)


class TrainingJobViewSet(viewsets.ReadOnlyModelViewSet):
    """
    ViewSet for monitoring training jobs.
    """
    queryset = TrainingJob.objects.all()
    serializer_class = TrainingJobSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = StandardResultsSetPagination
    
    def get_queryset(self):
        queryset = super().get_queryset()
        status_filter = self.request.query_params.get('status')
        symbol = self.request.query_params.get('symbol')
        
        if status_filter:
            queryset = queryset.filter(status=status_filter.upper())
        if symbol:
            queryset = queryset.filter(symbol=symbol)
        
        # Filter by user if not staff
        if not self.request.user.is_staff:
            queryset = queryset.filter(created_by=self.request.user)
        
        return queryset.order_by('-started_at')
    
    @action(detail=False, methods=['get'])
    def running(self, request):
        """
        Get all running training jobs.
        GET /api/ml/training-jobs/running/
        """
        jobs = self.get_queryset().filter(status__in=['PENDING', 'RUNNING'])
        serializer = self.get_serializer(jobs, many=True)
        return Response(serializer.data)
    
    @action(detail=False, methods=['get'])
    def recent(self, request):
        """
        Get recent completed jobs (last 10).
        GET /api/ml/training-jobs/recent/
        """
        jobs = self.get_queryset().filter(status__in=['SUCCESS', 'FAILED'])[:10]
        serializer = self.get_serializer(jobs, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['post'])
    def stop(self, request, pk=None):
        """
        Stop a running training job.
        POST /api/ml/training-jobs/{id}/stop/
        """
        from celery import current_app
        from datetime import datetime
        
        job = self.get_object()
        
        # Only allow stopping running or pending jobs
        if job.status not in ['PENDING', 'RUNNING']:
            return Response(
                {'error': 'Can only stop pending or running jobs'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Revoke the Celery task
        current_app.control.revoke(job.task_id, terminate=True, signal='SIGKILL')
        
        # Update job status
        job.status = 'FAILED'
        job.completed_at = datetime.now()
        job.error_message = 'Job stopped by user'
        job.progress_message = '⛔ Job stopped by user'
        job.save()
        
        serializer = self.get_serializer(job)
        return Response(serializer.data)
    
    @action(detail=True, methods=['get'])
    def details(self, request, pk=None):
        """
        Get detailed job data including historical prices and forecasts for visualization.
        GET /api/ml/training-jobs/{id}/details/
        """
        job = self.get_object()
        serializer = self.get_serializer(job)
        data = serializer.data
        
        # If job is successful and has a forecast model, fetch charting data
        if job.status == 'SUCCESS' and job.forecast_model:
            model = job.forecast_model
            
            # 2. Fetch test predictions to anchor the timeline
            test_predictions = Forecast.objects.filter(model=model, is_test_prediction=True).order_by('forecast_date')
            test_preds_list = [
                {'date': f.forecast_date, 'price': float(f.predicted_price)} for f in test_predictions
            ]
            data['test_predictions'] = test_preds_list
            
            # 2b. Fetch ACTUAL test set prices (ground truth) for comparison
            if test_preds_list:
                test_start = test_preds_list[0]['date']
                test_end = test_preds_list[-1]['date']
                actual_test_prices = DailyStockPrice.objects.filter(
                    ticker=job.symbol,
                    date__gte=test_start,
                    date__lte=test_end
                ).order_by('date')
                data['actual_test_data'] = [
                    {'date': p.date, 'price': float(p.close)} for p in actual_test_prices
                ]
            
            # 3. Calculate Split Ranges (Train / Val / Test)
            # We work backwards from the Test set start date
            split_info = {}
            if test_preds_list and job.result_data:
                test_start_date = test_preds_list[0]['date']
                
                t_samples = job.result_data.get('training_samples', 0)
                v_samples = job.result_data.get('validation_samples', 0)
                # s_len = int(job.hyperparameters.get('sequence_length', 60)) # Context before training
                
                # Fetch predecessors
                predecessors = DailyStockPrice.objects.filter(
                    ticker=job.symbol, 
                    date__lt=test_start_date
                ).order_by('-date')
                
                # Val Set: The V samples immediately before test start
                if v_samples > 0:
                    val_segment = predecessors[:v_samples]
                    if val_segment:
                        split_info['val_start'] = val_segment[len(val_segment)-1].date
                        split_info['val_end'] = val_segment[0].date

                # Train Set: The T samples before Val
                if t_samples > 0:
                    train_segment = predecessors[v_samples : v_samples + t_samples]
                    if train_segment:
                        split_info['train_start'] = train_segment[len(train_segment)-1].date
                        split_info['train_end'] = train_segment[0].date
                
                split_info['test_start'] = test_start_date
                if test_preds_list:
                     split_info['test_end'] = test_preds_list[-1]['date']

            data['split_dates'] = split_info

            # 4. Fetch historical prices (Covering the whole relevant period + buffer)
            # Default to 365, but if we have split info, ensure we cover from train_start
            fetch_limit = 365
            if 'train_start' in split_info:
                # Approximate days needed (trading days * 1.5 to cover weekends)
                total_samples = (job.result_data.get('training_samples', 0) + 
                               job.result_data.get('validation_samples', 0) + 
                               job.result_data.get('test_samples', 0) + 
                               int(job.hyperparameters.get('sequence_length', 60)))
                fetch_limit = max(365, int(total_samples * 1.6))

            historical_prices = DailyStockPrice.objects.filter(ticker=job.symbol).order_by('-date')[:fetch_limit]
            data['historical_prices'] = [
                {'date': p.date, 'price': float(p.close)} for p in reversed(historical_prices)
            ]
            
            # 5. Fetch future forecasts
            future_forecasts = Forecast.objects.filter(model=model, is_test_prediction=False).order_by('forecast_date')
            data['future_forecasts'] = [
                {
                    'date': f.forecast_date, 
                    'price': float(f.predicted_price),
                    'upper': float(f.confidence_upper) if f.confidence_upper else None,
                    'lower': float(f.confidence_lower) if f.confidence_lower else None
                } for f in future_forecasts
            ]
            
        return Response(data)


class ForecastRecommendationViewSet(viewsets.ReadOnlyModelViewSet):
    """
    ViewSet for forecast-based strategy recommendations.
    """
    queryset = ForecastBacktest.objects.all()
    serializer_class = ForecastBacktestSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        queryset = super().get_queryset()
        symbol = self.request.query_params.get('symbol')
        strategy_id = self.request.query_params.get('strategy')
        signal_type = self.request.query_params.get('signal_type')
        
        if symbol:
            queryset = queryset.filter(symbol=symbol)
        if strategy_id:
            queryset = queryset.filter(strategy_id=strategy_id)
        if signal_type:
            queryset = queryset.filter(signal_type=signal_type)
        
        return queryset.order_by('-confidence_score', '-created_at')
    
    @action(detail=False, methods=['post'])
    def generate(self, request):
        """
        Generate recommendations by testing published strategies on forecasts.
        POST /api/ml/recommendations/generate/
        """
        from .strategy_tester import StrategyTester
        
        try:
            tester = StrategyTester()
            result = tester.generate_all_recommendations()
            
            if result['success']:
                return Response({
                    'message': 'Recommendations generated successfully',
                    'statistics': result['stats'],
                    'backtests_created': result['backtests_created']
                }, status=status.HTTP_201_CREATED)
            else:
                return Response({
                    'error': 'Failed to generate recommendations'
                }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
                
        except Exception as e:
            return Response({
                'error': str(e)
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
