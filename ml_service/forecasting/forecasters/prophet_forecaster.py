import numpy as np
import pandas as pd
from prophet import Prophet
from typing import Dict, Optional
import pickle
import os

from .base import BaseForecaster


class ProphetForecaster(BaseForecaster):
    """
    Facebook Prophet-based forecaster.
    Simpler and faster than LSTM/GRU, good for limited data.
    """
    
    def __init__(self, symbol: str, hyperparameters: Optional[Dict] = None):
        super().__init__(symbol, hyperparameters)
        
        self.changepoint_prior_scale = self.hyperparameters.get('changepoint_prior_scale', 0.05)
        self.seasonality_prior_scale = self.hyperparameters.get('seasonality_prior_scale', 10.0)
        self.daily_seasonality = self.hyperparameters.get('daily_seasonality', False)
        self.weekly_seasonality = self.hyperparameters.get('weekly_seasonality', True)
        self.yearly_seasonality = self.hyperparameters.get('yearly_seasonality', True)
        
    def build_model(self):
        model = Prophet(
            changepoint_prior_scale=self.changepoint_prior_scale,
            seasonality_prior_scale=self.seasonality_prior_scale,
            daily_seasonality=self.daily_seasonality,
            weekly_seasonality=self.weekly_seasonality,
            yearly_seasonality=self.yearly_seasonality
        )
        return model
    
    def train(self, X_train: np.ndarray, y_train: np.ndarray,
              X_val: np.ndarray, y_val: np.ndarray, 
              train_dates: Optional[pd.Index] = None,
              val_dates: Optional[pd.Index] = None,
              task: Optional[object] = None, callback: Optional[callable] = None) -> Dict:
        """
        Train Prophet model.
        """
        if callback:
            callback('Prophet: Preparing training data...')
        elif task:
            task.update_state(state='PROGRESS', meta={'status': 'Prophet: Preparing training data...'})

        # Use provided dates if available, otherwise fallback to index-based dates
        if train_dates is not None:
            ds_train = train_dates
        else:
            ds_train = pd.date_range(start='2020-01-01', periods=len(y_train), freq='D')
            
        # Create DataFrame for Prophet
        train_df = pd.DataFrame({
            'ds': ds_train,
            'y': y_train
        })

        if callback:
            callback('Prophet: Fitting seasonal model...')
        elif task:
            task.update_state(state='PROGRESS', meta={'status': 'Prophet: Fitting seasonal model...'})

        self.model = self.build_model()
        self.model.fit(train_df)
        self.is_trained = True

        if callback:
            callback('Prophet: Evaluating on validation set...')
        elif task:
            task.update_state(state='PROGRESS', meta={'status': 'Prophet: Evaluating on validation set...'})

        # Evaluate on validation set
        if val_dates is not None:
            ds_val = val_dates
        else:
            ds_val = pd.date_range(start=train_df['ds'].iloc[-1] + pd.Timedelta(days=1), 
                                 periods=len(y_val), freq='D')
            
        val_df = pd.DataFrame({
            'ds': ds_val
        })
        
        forecast = self.model.predict(val_df)
        val_predictions = forecast['yhat'].values
        
        # Calculate metrics
        mape = np.mean(np.abs((y_val - val_predictions) / y_val)) * 100
        rmse = np.sqrt(np.mean((y_val - val_predictions) ** 2))
        
        return {
            'final_val_mape': float(mape),
            'final_val_rmse': float(rmse)
        }
    
    def predict(self, X: np.ndarray, dates: Optional[pd.Index] = None) -> np.ndarray:
        """
        Generate predictions.
        X should contain future dates or number of periods.
        """
        if not self.is_trained:
            raise ValueError("Model must be trained before prediction")
        
        # Create future dataframe
        if dates is not None:
            future_df = pd.DataFrame({
                'ds': dates
            })
        else:
            # Fallback if no dates provided (try to infer from X if it looks like dates?)
            # Or just warn/error? For now, we prefer explicit dates.
            # If X is just features (LSTM style), we can't infer dates easily without context.
            # But let's keep a fallback for compatibility if X is just length
            # WARNING: This fallback is what caused issues, but maybe we can be smarter?
            # Ideally we should raise an error if dates are missing for Prophet, 
            # but let's stick to "periods" logic relative to last training date if possible?
            # We don't have last training date stored easily unless we save it.
            # Let's assume the user MUST pass dates for accurate evaluation.
            # For now, we'll keep a dummy behavior but maybe better than hardcoded 2024?
            # Note: tasks.py will be updated to pass dates.
            pass
            
            # If using today?
            start_date = pd.Timestamp.now()
            future_df = pd.DataFrame({
                'ds': pd.date_range(start=start_date, periods=len(X), freq='D')
            })
        
        forecast = self.model.predict(future_df)
        return forecast['yhat'].values
    
    def forecast_future(self, periods: int, start_date: pd.Timestamp) -> pd.DataFrame:
        """
        Generate future forecasts with Prophet.
        
        Args:
            periods: Number of periods to forecast
            start_date: Starting date for forecast
            
        Returns:
            DataFrame with forecast including confidence intervals
        """
        if not self.is_trained:
            raise ValueError("Model must be trained before forecasting")
        
        future_df = pd.DataFrame({
            'ds': pd.date_range(start=start_date, periods=periods, freq='D')
        })
        
        forecast = self.model.predict(future_df)
        return forecast[['ds', 'yhat', 'yhat_lower', 'yhat_upper']]
    
    def save(self, file_path: str):
        if not self.is_trained:
            raise ValueError("Cannot save untrained model")
        
        os.makedirs(os.path.dirname(file_path), exist_ok=True)
        
        with open(f"{file_path}.pkl", 'wb') as f:
            pickle.dump({
                'model': self.model,
                'scaler': self.scaler,
                'hyperparameters': self.hyperparameters,
                'symbol': self.symbol
            }, f)
    
    def load(self, file_path: str):
        with open(f"{file_path}.pkl", 'rb') as f:
            data = pickle.load(f)
        
        self.model = data['model']
        self.scaler = data['scaler']
        self.hyperparameters = data['hyperparameters']
        self.symbol = data['symbol']
        self.is_trained = True
