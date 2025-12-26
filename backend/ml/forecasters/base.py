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
    def predict(self, X: np.ndarray) -> np.ndarray:
        """
        Generate predictions for the given input.
        
        Args:
            X: Input features
            
        Returns:
            Predicted values
        """
        pass
    
    def evaluate(self, X_test: np.ndarray, y_test: np.ndarray) -> Dict:
        """
        Evaluate the model on test data.
        Calculates metrics on ORIGINAL valid scale (inverse transformed).
        
        Args:
            X_test: Test features
            y_test: Test targets (scaled)
            
        Returns:
            Dictionary containing evaluation metrics (MAPE, RMSE, MAE)
        """
        if not self.is_trained:
            raise ValueError("Model must be trained before evaluation")
        
        # Get scaled predictions
        predictions_scaled = self.predict(X_test)
        
        # Check if we have a scaler to inverse transform
        if hasattr(self, 'scaler') and self.scaler is not None:
            # We need to inverse transform both predictions and y_test
            # The scaler expects shape (n_samples, n_features)
            # We need to act as if these are the target column (index 3 usually)
            
            # Helper to inverse transform single column array
            def inverse_transform_col(col_data):
                # Assume the scaler was fitted on 5 features (OHLCV)
                # We place our data in the 'close' column (index 3)
                n_features = self.scaler.n_features_in_
                dummy = np.zeros((len(col_data), n_features))
                dummy[:, 3] = col_data.flatten()
                return self.scaler.inverse_transform(dummy)[:, 3]
            
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
    
    def forecast_future(self, last_sequence: np.ndarray, horizon: int) -> np.ndarray:
        """
        Generate iterative forecasts for future time steps.
        
        Args:
            last_sequence: Most recent sequence of data (shape: [sequence_length, num_features])
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
            next_pred = self.predict(current_sequence.reshape(1, *current_sequence.shape))[0]
            forecasts.append(next_pred)
            
            # Update sequence for next prediction
            # Update sequence for next prediction
            # Roll the sequence forward by one timestep
            current_sequence = np.roll(current_sequence, -1, axis=0)
            
            # For the new timestep, we need to update OHLC context for the next iteration
            # Indices: 0: open, 1: high, 2: low, 3: close, 4: volume
            prev_close = current_sequence[-2, 3]
            
            # Start with previous timestep as base
            current_sequence[-1] = current_sequence[-2].copy()
            
            # Update OHLC based on the new prediction
            new_close = next_pred
            new_open = prev_close
            
            # Simulate high/low slightly around the open and close
            current_sequence[-1, 0] = new_open
            current_sequence[-1, 1] = max(new_open, new_close) * 1.002  # Assume some wick
            current_sequence[-1, 2] = min(new_open, new_close) * 0.998  # Assume some wick
            
            # Update Volume (Index 4)
            # Add small random noise to volume so it doesn't look completely static
            vol_noise = np.random.normal(0, 0.05) # 5% fluctuation
            current_sequence[-1, 4] = np.clip(current_sequence[-1, 4] * (1 + vol_noise), 0, 1)
            
            # Inject small random noise to Close price to simulate volatility
            # Standard deviation 0.015 = 1.5% fluctuation in scaled space
            noise = np.random.normal(0, 0.015) 
            current_sequence[-1, 3] = np.clip(new_close + noise, 0, 1)        
        
        return np.array(forecasts)
