import numpy as np
import pandas as pd
try:
    import tensorflow as tf
    from tensorflow import keras
    from tensorflow.keras.models import Sequential
    from tensorflow.keras.layers import GRU, Dense, Dropout
    from tensorflow.keras.callbacks import EarlyStopping
except ImportError:
    tf = None
    keras = None
from typing import Dict, Optional
import pickle
import os

from .base import BaseForecaster


class GRUForecaster(BaseForecaster):
    """
    GRU-based stock price forecaster.
    Similar to LSTM but generally faster training.
    """
    
    def __init__(self, symbol: str, hyperparameters: Optional[Dict] = None):
        super().__init__(symbol, hyperparameters)
        # Default hyperparameters
        self.num_layers = self.hyperparameters.get('num_layers', 2)
        self.hidden_units = self.hyperparameters.get('hidden_units', 128)
        self.dropout_rate = self.hyperparameters.get('dropout', self.hyperparameters.get('dropout_rate', 0.2))
        
        # Build units list based on layers and hidden_units
        self.gru_units = self.hyperparameters.get('gru_units')
        if not self.gru_units:
            self.gru_units = []
            curr_units = self.hidden_units
            for i in range(self.num_layers):
                self.gru_units.append(curr_units)
                curr_units = max(16, curr_units // 2)
        
        self.dense_units = self.hyperparameters.get('dense_units', 16)
        self.learning_rate = self.hyperparameters.get('learning_rate', 0.001)
        self.epochs = self.hyperparameters.get('epochs', 100)
        self.batch_size = self.hyperparameters.get('batch_size', 32)
        self.patience = self.hyperparameters.get('patience', 10)
        
    def build_model(self, input_shape):
        model = Sequential()
        
        # First GRU layer
        model.add(GRU(
            units=self.gru_units[0],
            return_sequences=True,
            input_shape=input_shape
        ))
        model.add(Dropout(self.dropout_rate))
        
        # Middle GRU layers
        for units in self.gru_units[1:-1]:
            model.add(GRU(units=units, return_sequences=True))
            model.add(Dropout(self.dropout_rate))
        
        # Last GRU layer
        model.add(GRU(units=self.gru_units[-1]))
        model.add(Dropout(self.dropout_rate))
        
        # Dense layers
        model.add(Dense(units=self.dense_units, activation='relu'))
        model.add(Dense(units=1))
        
        optimizer = keras.optimizers.Adam(learning_rate=self.learning_rate)
        model.compile(optimizer=optimizer, loss='mse', metrics=['mae'])
        
        return model
    
    def train(self, X_train: np.ndarray, y_train: np.ndarray,
              X_val: np.ndarray, y_val: np.ndarray, 
              train_dates: Optional[pd.Index] = None,
              val_dates: Optional[pd.Index] = None,
              task: Optional[object] = None, callback: Optional[callable] = None) -> Dict:
        """
        Train the GRU model.
        """
        input_shape = (X_train.shape[1], X_train.shape[2])
        self.model = self.build_model(input_shape)
        
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
                    
                    if self.callback_func:
                        self.callback_func(status, meta)
                    elif self.task_instance:
                        self.task_instance.update_state(state='PROGRESS', meta=meta)

            callbacks.append(ProgressCallback(callback, task, self.epochs))
        
        history = self.model.fit(
            X_train, y_train,
            validation_data=(X_val, y_val),
            epochs=self.epochs,
            batch_size=self.batch_size,
            callbacks=callbacks,
            verbose=1
        )
        
        self.is_trained = True
        
        return {
            'final_train_loss': float(history.history['loss'][-1]),
            'final_val_loss': float(history.history['val_loss'][-1]),
            'final_train_mae': float(history.history['mae'][-1]),
            'final_val_mae': float(history.history['val_mae'][-1]),
            'epochs_trained': len(history.history['loss'])
        }
    
    def predict(self, X: np.ndarray) -> np.ndarray:
        if not self.is_trained:
            raise ValueError("Model must be trained before prediction")
        return self.model.predict(X, verbose=0).flatten()
    
    def save(self, file_path: str):
        if not self.is_trained:
            raise ValueError("Cannot save untrained model")
        os.makedirs(os.path.dirname(file_path), exist_ok=True)
        self.model.save(f"{file_path}.h5")
        with open(f"{file_path}_metadata.pkl", 'wb') as f:
            pickle.dump({'scaler': self.scaler, 'hyperparameters': self.hyperparameters, 'symbol': self.symbol}, f)
    
    def load(self, file_path: str):
        self.model = keras.models.load_model(f"{file_path}.h5")
        with open(f"{file_path}_metadata.pkl", 'rb') as f:
            metadata = pickle.load(f)
        self.scaler = metadata['scaler']
        self.hyperparameters = metadata['hyperparameters']
        self.symbol = metadata['symbol']
        self.is_trained = True
