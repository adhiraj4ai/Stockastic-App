import numpy as np
import pandas as pd
import tensorflow as tf
from tensorflow import keras
from tensorflow.keras.models import Sequential
from tensorflow.keras.layers import LSTM, Dense, Dropout
from tensorflow.keras.callbacks import EarlyStopping, ModelCheckpoint
from typing import Dict, Optional
import pickle
import os

from .base import BaseForecaster


class LSTMForecaster(BaseForecaster):
    """
    LSTM-based stock price forecaster.
    Uses multi-layer LSTM architecture with dropout for regularization.
    """
    
    def __init__(self, symbol: str, hyperparameters: Optional[Dict] = None):
        """
        Initialize LSTM forecaster.
        
        Args:
            symbol: Stock symbol
            hyperparameters: Model configuration
                - lstm_units: List of units for each LSTM layer (default: [128, 64, 32])
                - dropout_rate: Dropout rate (default: 0.2)
                - dense_units: Units in dense layer (default: 16)
                - learning_rate: Learning rate (default: 0.001)
                - epochs: Maximum training epochs (default: 100)
                - batch_size: Batch size (default: 32)
        """
        super().__init__(symbol, hyperparameters)
        
        # Default hyperparameters
        self.num_layers = self.hyperparameters.get('num_layers', 2)
        self.hidden_units = self.hyperparameters.get('hidden_units', 128)
        self.dropout_rate = self.hyperparameters.get('dropout', self.hyperparameters.get('dropout_rate', 0.2))
        
        # Build units list based on layers and hidden_units
        # Example: if hidden=128, layers=3, units=[128, 64, 32]
        self.lstm_units = self.hyperparameters.get('lstm_units')
        if not self.lstm_units:
            self.lstm_units = []
            curr_units = self.hidden_units
            for i in range(self.num_layers):
                self.lstm_units.append(curr_units)
                curr_units = max(16, curr_units // 2)
        
        self.dense_units = self.hyperparameters.get('dense_units', 16)
        self.learning_rate = self.hyperparameters.get('learning_rate', 0.001)
        self.epochs = self.hyperparameters.get('epochs', 100)
        self.batch_size = self.hyperparameters.get('batch_size', 32)
        self.patience = self.hyperparameters.get('patience', 10)
        
    def build_model(self, input_shape):
        """
        Build multi-layer LSTM model.
        
        Args:
            input_shape: Shape of input sequences (timesteps, features)
            
        Returns:
            Compiled Keras model
        """
        model = Sequential()
        
        # First LSTM layer
        model.add(LSTM(
            units=self.lstm_units[0],
            return_sequences=True,
            input_shape=input_shape
        ))
        model.add(Dropout(self.dropout_rate))
        
        # Middle LSTM layers
        for units in self.lstm_units[1:-1]:
            model.add(LSTM(units=units, return_sequences=True))
            model.add(Dropout(self.dropout_rate))
        
        # Last LSTM layer (no return_sequences)
        model.add(LSTM(units=self.lstm_units[-1]))
        model.add(Dropout(self.dropout_rate))
        
        # Dense layers
        model.add(Dense(units=self.dense_units, activation='relu'))
        model.add(Dense(units=1))  # Output layer
        
        # Compile model
        optimizer = keras.optimizers.Adam(learning_rate=self.learning_rate)
        model.compile(
            optimizer=optimizer,
            loss='mean_squared_error',
            metrics=['mean_absolute_error']
        )
        
        return model
    
    def train(self, X_train: np.ndarray, y_train: np.ndarray,
              X_val: np.ndarray, y_val: np.ndarray, 
              train_dates: Optional[pd.Index] = None,
              val_dates: Optional[pd.Index] = None,
              task: Optional[object] = None, callback: Optional[callable] = None) -> Dict:
        """
        Train the LSTM model.
        
        Args:
            X_train: Training sequences
            y_train: Training targets
            X_val: Validation sequences
            y_val: Validation targets
            task: (Deprecated) Celery task instance
            callback: Function to call with progress updates (msg, meta)
            
        Returns:
            Training history and metrics
        """
        # Build model
        input_shape = (X_train.shape[1], X_train.shape[2])
        self.model = self.build_model(input_shape)
        
        # Callbacks
        callbacks = [
            EarlyStopping(
                monitor='val_loss',
                patience=self.patience,
                restore_best_weights=True,
                verbose=1
            )
        ]

        # Progress callback
        if callback or task:
            class ProgressCallback(tf.keras.callbacks.Callback):
                def __init__(self, callback_func, task_instance, total_epochs):
                    super().__init__()
                    self.callback_func = callback_func
                    self.task_instance = task_instance
                    self.total_epochs = total_epochs
                
                def on_epoch_end(self, epoch, logs=None):
                    logs = logs or {}
                    status = f"Epoch {epoch+1}/{self.total_epochs} - loss: {logs.get('loss', 0):.4f} - val_loss: {logs.get('val_loss', 0):.4f}"
                    
                    meta = {'status': status, 'epoch': epoch + 1, 'logs': logs}
                    
                    # Call the generic callback if provided (handles DB updates)
                    if self.callback_func:
                        self.callback_func(status, meta)
                    
                    # Fallback to direct task update if no callback but task exists
                    elif self.task_instance:
                        self.task_instance.update_state(state='PROGRESS', meta=meta)

            callbacks.append(ProgressCallback(callback, task, self.epochs))
        
        # Train model
        history = self.model.fit(
            X_train, y_train,
            validation_data=(X_val, y_val),
            epochs=self.epochs,
            batch_size=self.batch_size,
            callbacks=callbacks,
            verbose=1
        )
        
        self.is_trained = True
        
        # Return training metrics
        return {
            'final_train_loss': float(history.history['loss'][-1]),
            'final_val_loss': float(history.history['val_loss'][-1]),
            'final_train_mae': float(history.history['mean_absolute_error'][-1]),
            'final_val_mae': float(history.history['val_mean_absolute_error'][-1]),
            'epochs_trained': len(history.history['loss']),
            'history': history.history
        }
    
    def predict(self, X: np.ndarray, dates: Optional[pd.Index] = None) -> np.ndarray:
        """
        Generate predictions.
        
        Args:
            X: Input sequences
            
        Returns:
            Predicted values
        """
        if not self.is_trained:
            raise ValueError("Model must be trained before prediction")
        
        predictions = self.model.predict(X, verbose=0)
        return predictions.flatten()
    
    def save(self, file_path: str):
        """
        Save model and scaler to disk.
        
        Args:
            file_path: Path to save the model (without extension)
        """
        if not self.is_trained:
            raise ValueError("Cannot save untrained model")
        
        # Create directory if it doesn't exist
        os.makedirs(os.path.dirname(file_path), exist_ok=True)
        
        # Save Keras model
        self.model.save(f"{file_path}.keras")
        
        # Save scaler and metadata
        metadata = {
            'scaler': self.scaler,
            'hyperparameters': self.hyperparameters,
            'symbol': self.symbol
        }
        with open(f"{file_path}_metadata.pkl", 'wb') as f:
            pickle.dump(metadata, f)
    
    def load(self, file_path: str):
        """
        Load model and scaler from disk.
        
        Args:
            file_path: Path to the saved model (without extension)
        """
        # Load Keras model
        self.model = keras.models.load_model(f"{file_path}.keras")
        
        # Load scaler and metadata
        with open(f"{file_path}_metadata.pkl", 'rb') as f:
            metadata = pickle.load(f)
        
        self.scaler = metadata['scaler']
        self.hyperparameters = metadata['hyperparameters']
        self.symbol = metadata['symbol']
        self.is_trained = True
