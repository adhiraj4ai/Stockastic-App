from abc import ABC, abstractmethod
import numpy as np
import pandas as pd
from typing import Dict, Tuple, Optional
import os


class BaseForecaster(ABC):
    """
    Abstract base class for all forecasting models.
    Defines the interface that all forecasters must implement.
    """
    
    def __init__(self, symbol: str, hyperparameters: Optional[Dict] = None):
        """
        Initialize the forecaster.
        
        Args:
            symbol: Stock symbol to forecast
            hyperparameters: Model-specific hyperparameters
        """
        self.symbol = symbol
        self.hyperparameters = hyperparameters or {}
        self.model = None
        self.scaler = None
        self.is_trained = False
        
    @abstractmethod
    def build_model(self):
        """
        Build the forecasting model architecture.
        Must be implemented by subclasses.
        """
        pass
    
    @abstractmethod
    def train(self, X_train: np.ndarray, y_train: np.ndarray,
              X_val: np.ndarray, y_val: np.ndarray, 
              train_dates: Optional[pd.Index] = None,
              val_dates: Optional[pd.Index] = None,
              task: Optional[object] = None, callback: Optional[callable] = None) -> Dict:
        """
        Train the forecasting model.
        
        Args:
            X_train: Training features
            y_train: Training targets
            X_val: Validation features
            y_val: Validation targets
            train_dates: Optional pandas Index for training data dates.
            val_dates: Optional pandas Index for validation data dates.
            task: Optional task object for distributed training.
            callback: Optional callback function for training progress.
            
        Returns:
            Dictionary containing training metrics
        """
        pass
    
    @abstractmethod
    def predict(self, X: np.ndarray, dates: Optional[pd.Index] = None) -> np.ndarray:
        """
        Generate predictions for the given input.
        
        Args:
            X: Input features
            
        Returns:
            Predicted values
        """
        pass
    
    def evaluate(self, X_test: np.ndarray, y_test: np.ndarray, dates: Optional[pd.Index] = None) -> Dict:
        """
        Evaluate the model on test data.
        Calculates metrics on ORIGINAL valid scale (inverse transformed).
        
        Args:
            X_test: Test features
            y_test: Test targets (scaled)
            dates: Optional test dates (for Prophet)
            
        Returns:
            Dictionary containing evaluation metrics (MAPE, RMSE, MAE)
        """
        if not self.is_trained:
            raise ValueError("Model must be trained before evaluation")
        
        # Get scaled predictions
        predictions_scaled = self.predict(X_test, dates=dates)
        
        # Check if we have a scaler to inverse transform
        if hasattr(self, 'scaler') and self.scaler is not None:
            # We need to inverse transform both predictions and y_test
            # For univariate forecasting, we expect shape (n_samples, 1)
            
            # Helper to inverse transform single column array
            def inverse_transform_col(col_data):
                # Scaler fitted on 1 feature (Close only)
                n_features = self.scaler.n_features_in_
                dummy = np.zeros((len(col_data), n_features))
                # Target is now at index 0 for univariate
                dummy[:, 0] = col_data.flatten()
                return self.scaler.inverse_transform(dummy)[:, 0]
            
            predictions = inverse_transform_col(predictions_scaled)
            actuals = inverse_transform_col(y_test)
        else:
            # Fallback to scaled metrics if no scaler available (not ideal but safe)
            predictions = predictions_scaled
            actuals = y_test
        
        # Calculate metrics on REAL prices
        # Avoid division by zero
        epsilon = 1e-10
        mape = np.mean(np.abs((actuals - predictions) / (actuals + epsilon))) * 100
        rmse = np.sqrt(np.mean((actuals - predictions) ** 2))
        mae = np.mean(np.abs(actuals - predictions))
        r2 = 1 - (np.sum((actuals - predictions) ** 2) / np.sum((actuals - np.mean(actuals)) ** 2))
        
        return {
            'mape': float(mape),
            'rmse': float(rmse),
            'mae': float(mae),
            'r2': float(r2)
        }
    
    @abstractmethod
    def save(self, file_path: str):
        """
        Save the trained model to disk.
        
        Args:
            file_path: Path where the model should be saved
        """
        pass
    
    @abstractmethod
    def load(self, file_path: str):
        """
        Load a trained model from disk.
        
        Args:
            file_path: Path to the saved model
        """
        pass
    
    def train_with_cv(self, X: np.ndarray, y: np.ndarray,
                     train_dates: Optional[pd.Index] = None,
                     n_splits: int = 5,
                     gap: int = 30,
                     task: Optional[object] = None,
                     callback: Optional[callable] = None) -> Dict:
        """
        Train the model using time series cross-validation.
        
        Args:
            X: All available feature sequences (will be split by CV)
            y: All available target values (will be split by CV)
            train_dates: Optional dates corresponding to the data
            n_splits: Number of CV folds (default: 5)
            gap: Temporal gap between train and validation (default: 30 days)
            task: Optional task object for distributed training
            callback: Optional callback function for training progress
            
        Returns:
            Dictionary containing aggregated CV metrics
        """
        from forecasting.time_series_validator import TimeSeriesValidator
        
        validator = TimeSeriesValidator(n_splits=n_splits, gap=gap)
        cv_metrics = validator.validate_model(
            forecaster=self,
            X=X,
            y=y,
            train_dates=train_dates,
            callback=callback,
            task=task
        )
        
        # Mark as trained after CV completes (best model is retained)
        self.is_trained = True
        
        return cv_metrics

    
    def forecast_future(self, last_sequence: np.ndarray, horizon: int) -> np.ndarray:
        """
        Generate iterative forecasts for future time steps.
        
        Args:
            last_sequence: Most recent sequence of data (shape: [sequence_length, 1] for univariate)
            horizon: Number of steps to forecast
            
        Returns:
            Array of forecasted close prices
        """
        if not self.is_trained:
            raise ValueError("Model must be trained before forecasting")
        
        forecasts = []
        current_sequence = last_sequence.copy()
        
        for _ in range(horizon):
            # Predict next close price
            # Shape check for univariate: current_sequence should be [seq_len, 1]
            next_pred = self.predict(current_sequence.reshape(1, *current_sequence.shape))[0]
            forecasts.append(next_pred)
            
            # Update sequence for next prediction
            # Roll the sequence forward by one timestep
            current_sequence = np.roll(current_sequence, -1, axis=0)
            
            # Inject adaptive random noise
            # We use 5% of the sequence standard deviation as a proxy for recent volatility
            # This scales automatically whether using MinMaxScaler (0-1) or StandardScaler (Z-score)
            seq_std = np.std(current_sequence)
            noise_scale = max(seq_std * 0.05, 1e-4) # Avoid zero noise
            noise = np.random.normal(0, noise_scale)
            
            # Update the last element with the new prediction
            # In univariate forecasting, the entire feature vector is just the close price
            # CRITICAL: Do NOT clip to [0,1]. Standard Scaler is unbounded, and even MinMax should allow trends to break out.
            current_sequence[-1, 0] = next_pred + noise
        
        return np.array(forecasts)
