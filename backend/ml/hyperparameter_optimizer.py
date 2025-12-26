import optuna
from optuna.pruners import MedianPruner
from optuna.samplers import TPESampler
import numpy as np
from typing import Dict, Tuple, Any
import logging

from .forecasters.lstm_forecaster import LSTMForecaster
from .forecasters.gru_forecaster import GRUForecaster
from .forecasters.prophet_forecaster import ProphetForecaster
from .data_preprocessor import DataPreprocessor

logger = logging.getLogger(__name__)


class HyperparameterOptimizer:
    """
    Optuna-based hyperparameter optimization for forecasting models.
    Finds optimal hyperparameters by minimizing validation MAPE.
    """
    
    def __init__(self, symbol: str, model_type: str, n_trials: int = 50):
        """
        Initialize optimizer.
        
        Args:
            symbol: Stock symbol
            model_type: 'LSTM', 'GRU', or 'PROPHET'
            n_trials: Number of optimization trials
        """
        self.symbol = symbol
        self.model_type = model_type
        self.n_trials = n_trials
        self.preprocessor = None
        self.data_splits = None
        
    def prepare_data(self) -> None:
        """Prepare and cache data for optimization."""
        self.preprocessor = DataPreprocessor(symbol=self.symbol)
        self.data_splits, _ = self.preprocessor.process()
        
    def optimize_lstm(self) -> Dict[str, Any]:
        """
        Optimize LSTM hyperparameters.
        
        Returns:
            Best hyperparameters found
        """
        def objective(trial: optuna.Trial) -> float:
            # Suggest hyperparameters
            lstm_units_1 = trial.suggest_int('lstm_units_1', 64, 256, step=32)
            lstm_units_2 = trial.suggest_int('lstm_units_2', 32, 128, step=16)
            lstm_units_3 = trial.suggest_int('lstm_units_3', 16, 64, step=16)
            dropout = trial.suggest_float('dropout', 0.1, 0.5, step=0.1)
            learning_rate = trial.suggest_float('learning_rate', 1e-4, 1e-2, log=True)
            batch_size = trial.suggest_categorical('batch_size', [16, 32, 64])
            
            hyperparameters = {
                'lstm_units': [lstm_units_1, lstm_units_2, lstm_units_3],
                'dropout': dropout,
                'learning_rate': learning_rate,
                'batch_size': batch_size,
                'epochs': 50  # Reduced for optimization speed
            }
            
            try:
                # Train model
                forecaster = LSTMForecaster(self.symbol, hyperparameters)
                forecaster.scaler = self.preprocessor.scaler
                
                forecaster.train(
                    self.data_splits['X_train'],
                    self.data_splits['y_train'],
                    self.data_splits['X_val'],
                    self.data_splits['y_val']
                )
                
                # Evaluate on validation set
                metrics = forecaster.evaluate(
                    self.data_splits['X_val'],
                    self.data_splits['y_val']
                )
                
                return metrics['mape']
                
            except Exception as e:
                logger.error(f"Trial failed: {e}")
                return float('inf')
        
        # Create study
        study = optuna.create_study(
            direction='minimize',
            sampler=TPESampler(seed=42),
            pruner=MedianPruner(n_startup_trials=5, n_warmup_steps=10)
        )
        
        # Optimize
        study.optimize(objective, n_trials=self.n_trials, show_progress_bar=True)
        
        logger.info(f"Best MAPE: {study.best_value:.4f}")
        logger.info(f"Best params: {study.best_params}")
        
        # Convert to final hyperparameters
        best_params = study.best_params
        return {
            'lstm_units': [
                best_params['lstm_units_1'],
                best_params['lstm_units_2'],
                best_params['lstm_units_3']
            ],
            'dropout': best_params['dropout'],
            'learning_rate': best_params['learning_rate'],
            'batch_size': best_params['batch_size'],
            'epochs': 100  # Full training with best params
        }
    
    def optimize_gru(self) -> Dict[str, Any]:
        """
        Optimize GRU hyperparameters.
        
        Returns:
            Best hyperparameters found
        """
        def objective(trial: optuna.Trial) -> float:
            # Suggest hyperparameters
            gru_units_1 = trial.suggest_int('gru_units_1', 64, 256, step=32)
            gru_units_2 = trial.suggest_int('gru_units_2', 32, 128, step=16)
            gru_units_3 = trial.suggest_int('gru_units_3', 16, 64, step=16)
            dropout = trial.suggest_float('dropout', 0.1, 0.5, step=0.1)
            learning_rate = trial.suggest_float('learning_rate', 1e-4, 1e-2, log=True)
            batch_size = trial.suggest_categorical('batch_size', [16, 32, 64])
            
            hyperparameters = {
                'gru_units': [gru_units_1, gru_units_2, gru_units_3],
                'dropout': dropout,
                'learning_rate': learning_rate,
                'batch_size': batch_size,
                'epochs': 50
            }
            
            try:
                forecaster = GRUForecaster(self.symbol, hyperparameters)
                forecaster.scaler = self.preprocessor.scaler
                
                forecaster.train(
                    self.data_splits['X_train'],
                    self.data_splits['y_train'],
                    self.data_splits['X_val'],
                    self.data_splits['y_val']
                )
                
                metrics = forecaster.evaluate(
                    self.data_splits['X_val'],
                    self.data_splits['y_val']
                )
                
                return metrics['mape']
                
            except Exception as e:
                logger.error(f"Trial failed: {e}")
                return float('inf')
        
        study = optuna.create_study(
            direction='minimize',
            sampler=TPESampler(seed=42),
            pruner=MedianPruner(n_startup_trials=5, n_warmup_steps=10)
        )
        
        study.optimize(objective, n_trials=self.n_trials, show_progress_bar=True)
        
        logger.info(f"Best MAPE: {study.best_value:.4f}")
        logger.info(f"Best params: {study.best_params}")
        
        best_params = study.best_params
        return {
            'gru_units': [
                best_params['gru_units_1'],
                best_params['gru_units_2'],
                best_params['gru_units_3']
            ],
            'dropout': best_params['dropout'],
            'learning_rate': best_params['learning_rate'],
            'batch_size': best_params['batch_size'],
            'epochs': 100
        }
    
    def optimize_prophet(self) -> Dict[str, Any]:
        """
        Optimize Prophet hyperparameters.
        
        Returns:
            Best hyperparameters found
        """
        def objective(trial: optuna.Trial) -> float:
            # Suggest hyperparameters
            changepoint_prior_scale = trial.suggest_float('changepoint_prior_scale', 0.001, 0.5, log=True)
            seasonality_prior_scale = trial.suggest_float('seasonality_prior_scale', 0.01, 10.0, log=True)
            seasonality_mode = trial.suggest_categorical('seasonality_mode', ['additive', 'multiplicative'])
            changepoint_range = trial.suggest_float('changepoint_range', 0.8, 0.95, step=0.05)
            
            hyperparameters = {
                'changepoint_prior_scale': changepoint_prior_scale,
                'seasonality_prior_scale': seasonality_prior_scale,
                'seasonality_mode': seasonality_mode,
                'changepoint_range': changepoint_range
            }
            
            try:
                forecaster = ProphetForecaster(self.symbol, hyperparameters)
                
                # Prophet uses different data format
                # We'll use the original dataframe from preprocessor
                from stocks.models import DailyPrice
                import pandas as pd
                
                prices = DailyPrice.objects.filter(symbol=self.symbol).order_by('date')
                df = pd.DataFrame(list(prices.values('date', 'close')))
                df.columns = ['ds', 'y']
                
                # Split for validation
                train_size = int(len(df) * 0.85)
                train_df = df[:train_size]
                val_df = df[train_size:]
                
                # Train
                forecaster.train(train_df, None, None, None)
                
                # Predict on validation period
                future = forecaster.model.make_future_dataframe(periods=len(val_df))
                forecast = forecaster.model.predict(future)
                
                # Calculate MAPE on validation set
                val_predictions = forecast['yhat'].iloc[-len(val_df):].values
                val_actual = val_df['y'].values
                
                mape = np.mean(np.abs((val_actual - val_predictions) / val_actual)) * 100
                
                return mape
                
            except Exception as e:
                logger.error(f"Trial failed: {e}")
                return float('inf')
        
        study = optuna.create_study(
            direction='minimize',
            sampler=TPESampler(seed=42)
        )
        
        study.optimize(objective, n_trials=self.n_trials, show_progress_bar=True)
        
        logger.info(f"Best MAPE: {study.best_value:.4f}")
        logger.info(f"Best params: {study.best_params}")
        
        return study.best_params
    
    def optimize(self) -> Dict[str, Any]:
        """
        Run optimization for the specified model type.
        
        Returns:
            Best hyperparameters found
        """
        logger.info(f"Starting hyperparameter optimization for {self.model_type} on {self.symbol}")
        logger.info(f"Running {self.n_trials} trials...")
        
        # Prepare data once
        if self.model_type in ['LSTM', 'GRU']:
            self.prepare_data()
        
        # Run optimization
        if self.model_type == 'LSTM':
            return self.optimize_lstm()
        elif self.model_type == 'GRU':
            return self.optimize_gru()
        elif self.model_type == 'PROPHET':
            return self.optimize_prophet()
        else:
            raise ValueError(f"Unknown model type: {self.model_type}")
