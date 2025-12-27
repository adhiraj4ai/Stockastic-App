import numpy as np
import pandas as pd
from sklearn.preprocessing import MinMaxScaler, StandardScaler
from typing import Tuple, Dict, List
import pandas_ta as ta


class DataPreprocessor:
    """
    Handles data fetching, feature engineering, and preprocessing for forecasting models.
    """
    
    def __init__(self, symbol: str, sequence_length: int = 5, 
                 train_ratio: float = 0.7, val_ratio: float = 0.15, 
                 test_window_size: int = 90, scaler_type: str = 'minmax'):
        """
        Initialize the preprocessor.
        
        Args:
            symbol: Stock symbol to process
            sequence_length: Number of time steps in each sequence (for LSTM/GRU)
            train_ratio: Ratio of data for training
            val_ratio: Ratio of data for validation
            test_window_size: Number of days for testing
        """
        self.symbol = symbol
        self.sequence_length = sequence_length
        self.train_ratio = train_ratio
        self.val_ratio = val_ratio
        self.test_window_size = test_window_size
        
        # Initialize scaler based on type
        if scaler_type.lower() == 'standard':
            self.scaler = StandardScaler()
        else:
            self.scaler = MinMaxScaler(feature_range=(0, 1))
            
        self.feature_columns = []
        
    def fetch_historical_data(self, min_samples: int = 500, start_date=None, end_date=None) -> pd.DataFrame:
        """
        Fetch historical price data from the database.
        
        Args:
            min_samples: Minimum number of samples required
            start_date: Optional start date filter
            end_date: Optional end date filter
            
        Returns:
            DataFrame with OHLCV data
        """
        from .external_models import DailyStockPrice
        
        query = DailyStockPrice.objects.filter(ticker=self.symbol)
        
        if start_date:
            query = query.filter(date__gte=start_date)
        if end_date:
            query = query.filter(date__lte=end_date)
            
        prices = query.order_by('date').values(
            'date', 'open', 'high', 'low', 'close', 'volume'
        )
        
        df = pd.DataFrame(prices)
        
        if len(df) < min_samples:
            raise ValueError(f"Insufficient data for {self.symbol}. Found {len(df)} samples, need at least {min_samples}")
        
        df['date'] = pd.to_datetime(df['date'])
        df.set_index('date', inplace=True)
        
        # Convert all numeric columns from Decimal to float (critical for numba compatibility)
        numeric_cols = ['open', 'high', 'low', 'close', 'volume']
        for col in numeric_cols:
            df[col] = df[col].astype('float64')
        
        return df
    
    def calculate_technical_indicators(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        Calculate technical indicators to use as features.
        
        NOTE: Simplified for Univariate Forecasting (Pure Price).
        We are no longer using technical indicators to avoid "hallucination" issues
        during long-term forecasting.
        
        Args:
            df: DataFrame with OHLCV data
            
        Returns:
            DataFrame with OHLCV data (passthrough)
        """
        df = df.copy()
        
        # Ensure all columns are proper numeric types (fix numba compatibility)
        for col in ['open', 'high', 'low', 'close', 'volume']:
            df[col] = pd.to_numeric(df[col], errors='coerce').astype('float64')
        
        # We are intentionally NOT calculating indicators anymore.
        # This keeps the model focused on pure price action.
        
        # Drop NaN values (if any were created by pct_change etc, though we aren't doing that now)
        df.dropna(inplace=True)
        
        return df
    
    def prepare_features(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        Select and prepare features for modeling.
        
        Args:
            df: DataFrame with OHLCV
            
        Returns:
            DataFrame with selected features
        """
        # Define feature columns (Pure Price)
        # Switching to Univariate (Close only) for recursive stability
        self.feature_columns = ['close']
        
        # Filter to only include columns that exist
        available_features = [col for col in self.feature_columns if col in df.columns]
        
        return df[available_features]
    
    def create_sequences(self, data: np.ndarray, target_col_idx: int = 0) -> Tuple[np.ndarray, np.ndarray]:
        """
        Create sequences for LSTM/GRU models.
        
        Args:
            data: Scaled feature array
            target_col_idx: Index of the target column (default: 0 for 'close' in univariate)
            
        Returns:
            Tuple of (X, y) where X is sequences and y is targets
        """
        X, y = [], []
        
        for i in range(self.sequence_length, len(data)):
            X.append(data[i - self.sequence_length:i])
            y.append(data[i, target_col_idx])  # Predict close price
        
        return np.array(X), np.array(y)
    
    def split_data(self, X: np.ndarray, y: np.ndarray) -> Dict:
        """
        Split data into train, validation, and test sets based on configured ratios.
        
        Args:
            X: Feature sequences
            y: Target values
            
        Returns:
            Dictionary containing train, val, and test splits
        """
        n = len(X)
        
        # Test set: use specified test_window_size
        test_size = min(self.test_window_size, int(n * 0.3))  # Capped at 30% to ensure enough training data
        test_start = n - test_size
        
        # Remaining data split based on train_ratio and val_ratio
        # Normalize ratios to sum to 1 for the remaining part
        total_remaining_ratio = self.train_ratio + self.val_ratio
        if total_remaining_ratio == 0:
            train_factor = 0.8
        else:
            train_factor = self.train_ratio / total_remaining_ratio
            
        remaining_size = test_start
        train_end = int(remaining_size * train_factor)
        
        return {
            'X_train': X[:train_end],
            'y_train': y[:train_end],
            'X_val': X[train_end:test_start],
            'y_val': y[train_end:test_start],
            'X_test': X[test_start:],
            'y_test': y[test_start:]
        }
    
    def process(self, start_date=None, end_date=None, fitted_scaler=None) -> Tuple[Dict, pd.DataFrame]:
        """
        Complete preprocessing pipeline.
        
        Args:
            start_date: Optional start date filter
            end_date: Optional end date filter
            fitted_scaler: Optional pre-fitted scaler to use instead of fitting a new one
            
        Returns:
            Tuple of (data_splits, original_dataframe)
        """
        # Fetch data
        df = self.fetch_historical_data(start_date=start_date, end_date=end_date)
        
        # Calculate indicators
        df = self.calculate_technical_indicators(df)
        
        # Prepare features
        features_df = self.prepare_features(df)
        
        # Scale features
        if fitted_scaler:
            self.scaler = fitted_scaler
            scaled_data = self.scaler.transform(features_df.values)
        else:
            scaled_data = self.scaler.fit_transform(features_df.values)
        
        # Create sequences
        X, y = self.create_sequences(scaled_data)
        
        # Split data
        splits = self.split_data(X, y)
        
        return splits, df
    
    def inverse_transform_predictions(self, predictions: np.ndarray) -> np.ndarray:
        """
        Convert scaled predictions back to original price scale.
        
        Args:
            predictions: Scaled prediction values
            
        Returns:
            Predictions in original scale
        """
        # Create a dummy array with the same shape as the original features
        n_features = len(self.feature_columns)
        dummy = np.zeros((len(predictions), n_features))
        
        # In univariate mode, 'close' is at index 0
        dummy[:, 0] = predictions.flatten()
        
        # Inverse transform
        inversed = self.scaler.inverse_transform(dummy)
        
        # Return only the close price column
        return inversed[:, 0]
