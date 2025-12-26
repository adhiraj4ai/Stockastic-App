from celery import shared_task
from django.contrib.auth.models import User
import os
import numpy as np
from datetime import timedelta
from django.utils import timezone

from .models import ForecastModel, Forecast, TrainingJob
from .data_preprocessor import DataPreprocessor
from .forecasters.lstm_forecaster import LSTMForecaster
from .forecasters.gru_forecaster import GRUForecaster
from .forecasters.prophet_forecaster import ProphetForecaster
# TODO: Re-enable when strategy_tester.py is implemented
# from .strategy_tester import StrategyTester


@shared_task(bind=True, name='ml.train_model')
def train_model_task(self, symbol, model_type, hyperparameters, user_id=None, optimize=False, n_trials=50):
    """
    Async task to train a forecasting model.
    
    Args:
        symbol: Stock symbol
        model_type: 'LSTM', 'GRU', or 'PROPHET'
        hyperparameters: Model configuration dict (ignored if optimize=True)
        user_id: User ID who initiated training
        optimize: Whether to run Optuna hyperparameter optimization
        n_trials: Number of Optuna trials if optimize=True
    
    Returns:
        Dictionary with model ID and metrics
    """
    try:
        # Update TrainingJob status to RUNNING
        try:
            job = TrainingJob.objects.get(task_id=self.request.id)
            job.status = 'RUNNING'
            job.progress_message = 'Preparing data...'
            job.save()
        except TrainingJob.DoesNotExist:
            pass
        
        # Update task state
        self.update_state(state='PROGRESS', meta={'status': 'Preparing data...'})
        
        # Optimize hyperparameters if requested
        if optimize:
            self.update_state(state='PROGRESS', meta={'status': f'Optimizing hyperparameters ({n_trials} trials)...'})
            
            # Update DB to show optimization started
            try:
                job_ref = TrainingJob.objects.get(task_id=self.request.id)
                job_ref.progress_message = f'Optimizing hyperparameters ({n_trials} trials)...'
                job_ref.save()
            except TrainingJob.DoesNotExist:
                pass
            
            from .hyperparameter_optimizer import HyperparameterOptimizer
            
            # Callback to sync HPO logs to DB and Celery
            def hpo_callback(msg):
                # Update Celery
                self.update_state(state='PROGRESS', meta={'status': msg})
                # Update DB (using update to be atomic and faster)
                TrainingJob.objects.filter(task_id=self.request.id).update(progress_message=msg)
            
            optimizer = HyperparameterOptimizer(symbol, model_type, n_trials)
            hyperparameters = optimizer.optimize(callback=hpo_callback)
            
            completion_msg = 'Optimization complete. Training with best parameters...'
            self.update_state(state='PROGRESS', meta={'status': completion_msg})
            TrainingJob.objects.filter(task_id=self.request.id).update(progress_message=completion_msg)
        
        # Prepare data
        train_split = hyperparameters.get('train_split', 0.7)
        val_split = hyperparameters.get('val_split', 0.15)
        test_window_size = hyperparameters.get('test_window_size', 90)
        start_date = hyperparameters.get('start_date')
        end_date = hyperparameters.get('end_date')
        sequence_length = hyperparameters.get('sequence_length', 60)
        
        # Prepare data with granular logging
        try:
            preprocessor = DataPreprocessor(
                symbol, 
                sequence_length=hyperparameters.get('sequence_length', 60),
                train_ratio=hyperparameters.get('train_split', 0.7),
                val_ratio=hyperparameters.get('val_split', 0.15),
                test_window_size=hyperparameters.get('test_window_size', 90)
            )
            
            job.progress_message = 'Fetching historical data from DB...'
            job.save()
            
            original_df = preprocessor.fetch_historical_data(
                start_date=hyperparameters.get('start_date'), 
                end_date=hyperparameters.get('end_date')
            )
            
            job.progress_message = f'Fetched {len(original_df)} records. Calculating indicators...'
            job.save()
            
            df_indicators = preprocessor.calculate_technical_indicators(original_df)
            
            job.progress_message = 'Preparing features and scaling...'
            job.save()
            
            features_df = preprocessor.prepare_features(df_indicators)
            scaled_data = preprocessor.scaler.fit_transform(features_df.values)
            
            job.progress_message = 'Creating sequences and splits...'
            job.save()
            
            X, y = preprocessor.create_sequences(scaled_data)
            data_splits = preprocessor.split_data(X, y)
            
            job.progress_message = f'Data ready: {len(data_splits["X_train"])} training samples.'
            job.save()
            
        except Exception as e:
            job.progress_message = f'Data Preparation Failed: {str(e)}'
            job.save()
            raise e
        # Define callback for model training (updates DB so frontend sees logs)
        def progress_callback(status_msg, meta=None):
            # Append to existing logs instead of replacing
            job.refresh_from_db()
            if job.progress_message:
                job.progress_message = job.progress_message + '\n' + status_msg
            else:
                job.progress_message = status_msg
            job.save(update_fields=['progress_message'])
            
            # Update Celery
            self.update_state(state='PROGRESS', meta=meta or {'status': status_msg})
            
            
        # Log hyperparameters before training
        hyperparams_log = f"""
⚙️ Training Configuration:
   Model Type: {model_type}
   Symbol: {symbol}
   Training Samples: {len(data_splits['X_train'])}
   Validation Samples: {len(data_splits['X_val'])}
   Test Samples: {len(data_splits['X_test'])}
   
   Hyperparameters:"""
        
        for key, value in hyperparameters.items():
            hyperparams_log += f"\n   • {key}: {value}"
        
        job.refresh_from_db()
        job.progress_message = (job.progress_message or '') + '\n' + hyperparams_log
        job.save(update_fields=['progress_message'])
        
        self.update_state(state='PROGRESS', meta={'status': f'Training {model_type} model...'})
        
        # Select and initialize forecaster
        from .forecasters.lstm_forecaster import LSTMForecaster
        from .forecasters.gru_forecaster import GRUForecaster
        from .forecasters.prophet_forecaster import ProphetForecaster
        
        forecasters = {
            'LSTM': LSTMForecaster,
            'GRU': GRUForecaster,
            'PROPHET': ProphetForecaster
        }
        
        forecaster_class = forecasters.get(model_type)
        if not forecaster_class:
            raise ValueError(f"Unknown model type: {model_type}")
            
        forecaster = forecaster_class(symbol, hyperparameters)
        
        # Assign scaler
        forecaster.scaler = preprocessor.scaler
        
        # Calculate dates for forecaster training (needed for Prophet visibility)
        sequence_length = preprocessor.sequence_length
        train_size = len(data_splits['y_train'])
        val_size = len(data_splits['y_val'])
        
        # y[0] corresponds to original_df.index[sequence_length]
        train_dates = original_df.index[sequence_length : sequence_length + train_size]
        val_dates = original_df.index[sequence_length + train_size : sequence_length + train_size + val_size]
        
        # Train model with callback
        training_metrics = forecaster.train(
            data_splits['X_train'], data_splits['y_train'],
            data_splits['X_val'], data_splits['y_val'],
            train_dates=train_dates,
            val_dates=val_dates,
            task=self,  # Deprecated but kept for safety
            callback=progress_callback
        )
        
        # Log training scores
        training_scores_log = f"""
📈 Training Performance:
   • Final Training Loss: {training_metrics.get('final_train_loss', 'N/A')}
   • Final Validation Loss: {training_metrics.get('final_val_loss', 'N/A')}
   • Final Training MAE: {training_metrics.get('final_train_mae', 'N/A')}
   • Final Validation MAE: {training_metrics.get('final_val_mae', 'N/A')}
   • Epochs Trained: {training_metrics.get('epochs_trained', 'N/A')}
"""
        job.refresh_from_db()
        job.progress_message = (job.progress_message or '') + '\n' + training_scores_log
        job.save(update_fields=['progress_message'])
        
        job.refresh_from_db()
        job.progress_message = (job.progress_message or '') + '\n✓ Model training complete. Starting evaluation...'
        job.save(update_fields=['progress_message'])
        self.update_state(state='PROGRESS', meta={'status': 'Evaluating model...'})
        
        # Calculate test dates for correct evaluation (Prophet needs them)
        test_size = len(data_splits['X_test'])
        test_start_idx = len(original_df) - test_size
        test_dates = original_df.index[test_start_idx:]

        # Evaluate on test set
        test_metrics = forecaster.evaluate(data_splits['X_test'], data_splits['y_test'], dates=test_dates)
        
        # Calculate R² score
        from sklearn.metrics import r2_score
        test_predictions = forecaster.predict(data_splits['X_test'], dates=test_dates)
        r2 = r2_score(data_splits['y_test'], test_predictions)
        test_metrics['r2'] = float(r2)
        
        # Log all metrics
        metrics_log = f"""
📊 Test Set Evaluation Metrics:
   • MAPE (Mean Absolute Percentage Error): {test_metrics['mape']:.4f}%
   • RMSE (Root Mean Squared Error): {test_metrics['rmse']:.6f}
   • MAE (Mean Absolute Error): {test_metrics['mae']:.6f}
   • R² Score (Coefficient of Determination): {test_metrics['r2']:.6f}
"""
        job.refresh_from_db()
        job.progress_message = (job.progress_message or '') + '\n' + metrics_log
        job.save(update_fields=['progress_message'])
        
        self.update_state(state='PROGRESS', meta={'status': 'Saving model...'})
        
        # Save model
        model_dir = os.path.join('ml_models', symbol)
        os.makedirs(model_dir, exist_ok=True)
        model_filename = f"{model_type.lower()}_{timezone.now().strftime('%Y%m%d_%H%M%S')}"
        model_path = os.path.join(model_dir, model_filename)
        forecaster.save(model_path)
        
        # Create database record
        user = User.objects.get(id=user_id) if user_id else None
        forecast_model = ForecastModel.objects.create(
            symbol=symbol,
            model_type=model_type,
            training_samples=len(data_splits['X_train']),
            validation_loss=training_metrics.get('final_val_loss'),
            test_mape=test_metrics['mape'],
            test_rmse=test_metrics['rmse'],
            file_path=model_path,
            hyperparameters=hyperparameters,
            created_by=user
        )
        
        # Update Job Progress in DB
        try:
            job = TrainingJob.objects.get(task_id=self.request.id)
            job.progress_message = 'Model trained. Generating forecasts...'
            job.forecast_model = forecast_model
            job.save()
        except TrainingJob.DoesNotExist:
            pass
        
        # Auto-generate 6-month forecast (126 trading days)
        self.update_state(state='PROGRESS', meta={'status': 'Generating 6-month forecast...'})
        
        try:
            # Prepare last sequence for forecasting
            # We must recalculate indicators to ensure feature dimensions match the scaler
            df_with_indicators = preprocessor.calculate_technical_indicators(original_df)
            features_df = preprocessor.prepare_features(df_with_indicators)
            
            # Generate 126-day forecast
            from datetime import timedelta
            last_date = original_df.index[-1]
            next_date = last_date + timedelta(days=1)
            
            if model_type == 'PROPHET':
                # Prophet handles its own date generation and scaling mostly, 
                # but our wrapper might return a DataFrame with 'ds', 'yhat', 'yhat_lower', 'yhat_upper'
                # Note: The Prophet wrapper we saw expects (periods, start_date)
                
                # We need to make sure we passed dates correctly during training too, 
                # but assuming that's handled in the wrapper (or tasks.py passed correct DFs).
                # The wrapper showed: forecast_future(self, periods: int, start_date: pd.Timestamp)
                
                forecast_df = forecaster.forecast_future(126, start_date=next_date)
                
                # Prophet returns unscaled values if we used unscaled during training? 
                # The wrapper doesn't seem to inverse transform explicitly for yhat if fit on raw y.
                # Assuming the wrapper fits on raw data passed in y_train (which was unscaled in tasks.py? 
                # NO, tasks.py scales everything before splitting!)
                
                # Wait, if we scale features, create_sequences uses scaled data.
                # split_data splits scaled data.
                # forecaster.train receives scaled data.
                # So Prophet is trained on Scaled 0-1 data.
                # So its output yhat is Scaled 0-1.
                # We need to inverse transform it.
                
                # Extract predicted values
                predictions_scaled = forecast_df[['yhat']].values
                
                # Inverse transform
                # We need to reshape to match scaler expectation (20 columns)
                # prepare dummy
                dummy = np.zeros((len(predictions_scaled), len(preprocessor.feature_columns)))
                dummy[:, 3] = predictions_scaled.flatten() # 3 is close price index
                inversed = preprocessor.scaler.inverse_transform(dummy)
                predictions = inversed[:, 3]
                
                # Confidence intervals (also scaled)
                upper_scaled = forecast_df[['yhat_upper']].values
                dummy[:, 3] = upper_scaled.flatten()
                upper = preprocessor.scaler.inverse_transform(dummy)[:, 3]
                
                lower_scaled = forecast_df[['yhat_lower']].values
                dummy[:, 3] = lower_scaled.flatten()
                lower = preprocessor.scaler.inverse_transform(dummy)[:, 3]
                
            else:
                # LSTM / GRU logic (expecting sequence)
                # Ensure we have indicators calculated (done above)
                scaled_data = preprocessor.scaler.transform(features_df.values)
                last_sequence = scaled_data[-preprocessor.sequence_length:]
                
                predictions_scaled = forecaster.forecast_future(last_sequence, 126)
                predictions = preprocessor.inverse_transform_predictions(predictions_scaled)
                # Basic confidence intervals for DL (e.g. +/- 5%)
                upper = predictions * 1.05
                lower = predictions * 0.95
            
            # Create forecast records
            forecast_records = []
            
            for i, pred_price in enumerate(predictions):
                forecast_date = last_date + timedelta(days=i+1)
                
                # Skip weekends
                while forecast_date.weekday() >= 5:
                    forecast_date += timedelta(days=1)
                
                forecast_records.append(Forecast(
                    model=forecast_model,
                    symbol=symbol,
                    forecast_date=forecast_date,
                    predicted_price=pred_price,
                ))
            
            # Bulk create forecasts
            Forecast.objects.bulk_create(forecast_records, batch_size=500, ignore_conflicts=True)
            
            # Generate test set predictions for visualization (last 90 trading days)
            self.update_state(state='PROGRESS', meta={'status': 'Generating test set predictions for validation...'}
)
            test_predictions = forecaster.predict(data_splits['X_test'], dates=test_dates)
            test_predictions_unscaled = preprocessor.inverse_transform_predictions(test_predictions)
            
            # Get test set dates (last 90 days of historical data)
            test_size = len(data_splits['X_test'])
            test_start_idx = len(original_df) - test_size
            test_dates = original_df.index[test_start_idx:]
            
            # Create test prediction records for validation visualization
            test_forecast_records = []
            for date, pred_price in zip(test_dates, test_predictions_unscaled):
                test_forecast_records.append(Forecast(
                    model=forecast_model,
                    symbol=symbol,
                    forecast_date=date.date() if hasattr(date, 'date') else date,
                    predicted_price=pred_price,
                    is_test_prediction=True  # Mark as test prediction
                ))
            
            # Bulk create test predictions
            Forecast.objects.bulk_create(test_forecast_records)
            
            # Update TrainingJob status to SUCCESS
            try:
                job = TrainingJob.objects.get(task_id=self.request.id)
                job.status = 'SUCCESS'
                job.completed_at = timezone.now()
                job.progress_message = (job.progress_message or '') + '\n✅ Training completed successfully'
                job.result_data = {
                    'model_id': forecast_model.id,
                    'test_mape': test_metrics['mape'],
                    'test_rmse': test_metrics['rmse'],
                    'test_mae': test_metrics['mae'],
                    'test_r2': test_metrics['r2'],
                    'training_samples': len(data_splits['X_train']),
                    'validation_samples': len(data_splits['X_val']),
                    'test_samples': len(data_splits['X_test']),
                    'forecast_days': len(forecast_records)
                }
                job.forecast_model = forecast_model
                job.save()
            except TrainingJob.DoesNotExist:
                pass
            
            return {
                'status': 'SUCCESS',
                'model_id': forecast_model.id,
                'symbol': symbol,
                'model_type': model_type,
                'test_mape': test_metrics['mape'],
                'test_rmse': test_metrics['rmse'],
                'training_samples': len(data_splits['X_train']),
                'validation_samples': len(data_splits['X_val']),
                'test_samples': len(data_splits['X_test']),
                'total_samples': len(data_splits['X_train']) + len(data_splits['X_val']) + len(data_splits['X_test']),
                'split_ratio': '70/15/15',
                'forecast_generated': True,
                'forecast_days': len(forecast_records),
                'test_predictions_generated': test_size
            }
        except Exception as forecast_error:
            # If forecast generation fails, still mark training as SUCCESS
            # but note the forecast failure
            try:
                job = TrainingJob.objects.get(task_id=self.request.id)
                job.status = 'SUCCESS'
                job.completed_at = timezone.now()
                job.progress_message = f'✅ Training complete!\n⚠️ Forecast generation skipped: {str(forecast_error)}'
                job.result_data = {
                    'model_id': forecast_model.id,
                    'test_mape': test_metrics['mape'],
                    'test_rmse': test_metrics['rmse'],
                    'training_samples': len(data_splits['X_train']),
                    'forecast_generated': False,
                    'forecast_error': str(forecast_error)
                }
                job.forecast_model = forecast_model
                job.save()
            except TrainingJob.DoesNotExist:
                pass
                
            return {
                'status': 'SUCCESS',
                'model_id': forecast_model.id,
                'symbol': symbol,
                'model_type': model_type,
                'test_mape': test_metrics['mape'],
                'test_rmse': test_metrics['rmse'],
                'training_samples': len(data_splits['X_train']),
                'validation_samples': len(data_splits['X_val']),
                'test_samples': len(data_splits['X_test']),
                'total_samples': len(data_splits['X_train']) + len(data_splits['X_val']) + len(data_splits['X_test']),
                'split_ratio': '70/15/15',
                'forecast_generated': False,
                'forecast_error': str(forecast_error)
            }
        
    except Exception as e:
        # Update TrainingJob status to FAILED
        try:
            job = TrainingJob.objects.get(task_id=self.request.id)
            job.status = 'FAILED'
            job.completed_at = timezone.now()
            job.error_message = str(e)
            job.progress_message = 'Failed: ' + str(e)
            job.save()
        except TrainingJob.DoesNotExist:
            pass
            
        self.update_state(state='FAILURE', meta={'error': str(e)})
        raise


@shared_task(bind=True, name='ml.generate_forecast')
def generate_forecast_task(self, symbol, model_id=None, horizon_days=252):
    """
    Async task to generate price forecasts.
    
    Args:
        symbol: Stock symbol
        model_id: Specific model ID (optional)
        horizon_days: Number of days to forecast
    
    Returns:
        Dictionary with forecast count and model info
    """
    try:
        from datetime import timedelta
        
        self.update_state(state='PROGRESS', meta={'status': 'Loading model...'})
        
        # Get model
        if model_id:
            forecast_model = ForecastModel.objects.get(id=model_id, symbol=symbol)
        else:
            forecast_model = ForecastModel.objects.filter(
                symbol=symbol, is_active=True
            ).order_by('-trained_at').first()
            
            if not forecast_model:
                raise ValueError(f'No trained model found for {symbol}')
        
        # Load forecaster
        if forecast_model.model_type == 'LSTM':
            forecaster = LSTMForecaster(symbol)
        elif forecast_model.model_type == 'GRU':
            forecaster = GRUForecaster(symbol)
        elif forecast_model.model_type == 'PROPHET':
            forecaster = ProphetForecaster(symbol)
        
        forecaster.load(forecast_model.file_path)
        
        self.update_state(state='PROGRESS', meta={'status': 'Preparing data...'})
        
        # Prepare last sequence
        preprocessor = DataPreprocessor(symbol=symbol)
        _, original_df = preprocessor.process()
        
        features_df = preprocessor.prepare_features(original_df)
        scaled_data = preprocessor.scaler.transform(features_df.values)
        last_sequence = scaled_data[-preprocessor.sequence_length:]
        
        self.update_state(state='PROGRESS', meta={'status': f'Generating {horizon_days}-day forecast...'})
        
        # Generate forecasts
        predictions_scaled = forecaster.forecast_future(last_sequence, horizon_days)
        predictions = preprocessor.inverse_transform_predictions(predictions_scaled)
        
        self.update_state(state='PROGRESS', meta={'status': 'Saving forecasts...'})
        
        # Create forecast records
        last_date = original_df.index[-1]
        forecast_records = []
        
        for i, pred_price in enumerate(predictions):
            forecast_date = last_date + timedelta(days=i+1)
            
            # Skip weekends
            while forecast_date.weekday() >= 5:
                forecast_date += timedelta(days=1)
            
            forecast_records.append(Forecast(
                model=forecast_model,
                symbol=symbol,
                forecast_date=forecast_date,
                predicted_price=pred_price,
            ))
        
        # Bulk create
        Forecast.objects.bulk_create(forecast_records)
        
        return {
            'status': 'SUCCESS',
            'symbol': symbol,
            'model_id': forecast_model.id,
            'model_type': forecast_model.model_type,
            'forecasts_created': len(forecast_records),
            'horizon_days': horizon_days
        }
        
    except Exception as e:
        self.update_state(state='FAILURE', meta={'error': str(e)})
        raise


# TODO: Re-enable when strategy_tester.py is implemented
# @shared_task(bind=True, name='ml.generate_recommendations')
# def generate_recommendations_task(self):
#     """
#     Async task to test all published strategies on forecasts.
#     
#     Returns:
#         Dictionary with statistics
#     """
#     try:
#         self.update_state(state='PROGRESS', meta={'status': 'Loading published strategies...'})
#         
#         tester = StrategyTester()
#         
#         self.update_state(state='PROGRESS', meta={'status': 'Testing strategies on forecasts...'})
#         
#         result = tester.generate_all_recommendations()
#         
#         if result['success']:
#             return {
#                 'status': 'SUCCESS',
#                 'statistics': result['stats'],
#                 'backtests_created': result['backtests_created']
#             }
#         else:
#             raise ValueError('Failed to generate recommendations')
#             
#     except Exception as e:
#         self.update_state(state='FAILURE', meta={'error': str(e)})
#         raise


@shared_task(bind=True, name='ml.bulk_train_models')
def bulk_train_models_task(self, symbols, model_type, hyperparameters, user_id=None):
    """
    Async task to train models for multiple symbols.
    
    Args:
        symbols: List of stock symbols
        model_type: 'LSTM', 'GRU', or 'PROPHET'
        hyperparameters: Model configuration dict
        user_id: User ID who initiated training
    
    Returns:
        Dictionary with results for each symbol
    """
    results = []
    total = len(symbols)
    
    for idx, symbol in enumerate(symbols):
        try:
            self.update_state(
                state='PROGRESS',
                meta={
                    'status': f'Training {symbol} ({idx+1}/{total})...',
                    'current': idx + 1,
                    'total': total
                }
            )
            
            # Call the single training task synchronously
            result = train_model_task(symbol, model_type, hyperparameters, user_id)
            results.append({
                'symbol': symbol,
                'success': True,
                'model_id': result['model_id']
            })
            
        except Exception as e:
            results.append({
                'symbol': symbol,
                'success': False,
                'error': str(e)
            })
    
    return {
        'status': 'SUCCESS',
        'total_symbols': total,
        'successful': len([r for r in results if r['success']]),
        'failed': len([r for r in results if not r['success']]),
        'results': results
    }
