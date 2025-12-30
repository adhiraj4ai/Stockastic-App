import numpy as np
import pandas as pd
from sklearn.preprocessing import MinMaxScaler
from typing import Tuple, Dict, List
import pandas_ta as ta


class DataPreprocessor:
    """
    Handles data fetching, feature engineering, and preprocessing for forecasting models.
    """
    
    def __init__(self, symbol: str, sequence_length: int = 60, 
                 train_ratio: float = 0.8, val_ratio: float = 0.05, 
                 test_window_size: int = 90, temporal_gap: int = 30):
        """
        Initialize the preprocessor.
        
        Args:
            symbol: Stock symbol to process
            sequence_length: Number of time steps in each sequence (for LSTM/GRU)
            train_ratio: Ratio of data for training
            val_ratio: Ratio of data for validation (default: 0.05)
            test_window_size: Number of days for testing
            temporal_gap: Number of days to gap between splits (default: 30)
        """
        self.symbol = symbol
        self.sequence_length = sequence_length
        self.train_ratio = train_ratio
        self.val_ratio = val_ratio
        self.test_window_size = test_window_size
        self.temporal_gap = temporal_gap
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
        from stocks.models import DailyStockPrice
        
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
        # Define feature columns (Pure Price + Volume)
        self.feature_columns = [
            'open', 'high', 'low', 'close', 'volume'
        ]
        
        # Filter to only include columns that exist
        available_features = [col for col in self.feature_columns if col in df.columns]
        
        return df[available_features]
    
    def create_sequences(self, data: np.ndarray, target_col_idx: int = 3) -> Tuple[np.ndarray, np.ndarray]:
        """
        Create sequences for LSTM/GRU models.
        
        Args:
            data: Scaled feature array
            target_col_idx: Index of the target column (default: 3 for 'close')
            
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
        A temporal gap is maintained between training, validation, and testing sets
        to prevent information leakage and respect autocorrelation.
        
        Args:
            X: Feature sequences
            y: Target values
            
        Returns:
            Dictionary containing train, val, and test splits
        """
        n = len(X)
        gap = self.temporal_gap
        
        # Test set: use specified test_window_size
        test_size = min(self.test_window_size, int(n * 0.3))  # Capped at 30% to ensure enough training data
        test_start = n - test_size
        
        # Adjust gaps if data is extremely sparse
        # We need at least some data for each set
        if n < (gap * 2 + 100):
            effective_gap = max(1, int(n * 0.05))
        else:
            effective_gap = gap
            
        # Validation size: exactly val_ratio of n
        val_size = max(1, int(n * self.val_ratio))
        
        # Validation end is before test_start with a gap
        val_end = max(0, test_start - effective_gap)
        val_start = max(0, val_end - val_size)
        
        # Training end is before val_start with a gap
        train_end = max(0, val_start - effective_gap)
        
        return {
            'X_train': X[:train_end],
            'y_train': y[:train_end],
            'X_val': X[val_start:val_end],
            'y_val': y[val_start:val_end],
            'X_test': X[test_start:],
            'y_test': y[test_start:]
        }
    
    def process(self, start_date=None, end_date=None) -> Tuple[Dict, pd.DataFrame]:
        """
        Complete preprocessing pipeline.
        
        Args:
            start_date: Optional start date filter
            end_date: Optional end date filter
            
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
        dummy = np.zeros((len(predictions), len(self.feature_columns)))
        # Place predictions in the 'close' column position (index 3)
        dummy[:, 3] = predictions
        # Inverse transform
        inversed = self.scaler.inverse_transform(dummy)
        # Return only the close price column
        return inversed[:, 3]
