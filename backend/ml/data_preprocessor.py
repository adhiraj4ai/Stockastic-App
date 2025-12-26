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
                 train_ratio: float = 0.7, val_ratio: float = 0.15, 
                 test_window_size: int = 90):
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
        
        Args:
            df: DataFrame with OHLCV data
            
        Returns:
            DataFrame with additional technical indicator columns
        """
        df = df.copy()
        
        # Ensure all columns are proper numeric types (fix numba compatibility)
        for col in ['open', 'high', 'low', 'close', 'volume']:
            df[col] = pd.to_numeric(df[col], errors='coerce').astype('float64')
        
        # Moving Averages
        df['sma_20'] = ta.sma(df['close'], length=20)
        df['sma_50'] = ta.sma(df['close'], length=50)
        df['ema_12'] = ta.ema(df['close'], length=12)
        df['ema_26'] = ta.ema(df['close'], length=26)
        
        # RSI
        df['rsi'] = ta.rsi(df['close'], length=14)
        
        # MACD - handle different column naming conventions
        macd = ta.macd(df['close'])
        if macd is not None and not macd.empty:
            # Try different possible column names
            macd_cols = macd.columns.tolist()
            df['macd'] = macd[macd_cols[0]] if len(macd_cols) > 0 else None
            df['macd_signal'] = macd[macd_cols[1]] if len(macd_cols) > 1 else None
            df['macd_hist'] = macd[macd_cols[2]] if len(macd_cols) > 2 else None
        
        # Bollinger Bands - handle different column naming conventions
        bbands = ta.bbands(df['close'], length=20)
        if bbands is not None and not bbands.empty:
            # Try different possible column names
            bb_cols = bbands.columns.tolist()
            df['bb_lower'] = bbands[bb_cols[0]] if len(bb_cols) > 0 else None
            df['bb_middle'] = bbands[bb_cols[1]] if len(bb_cols) > 1 else None
            df['bb_upper'] = bbands[bb_cols[2]] if len(bb_cols) > 2 else None
        
        # ATR (Average True Range)
        df['atr'] = ta.atr(df['high'], df['low'], df['close'], length=14)
        
        # Volume indicators
        df['volume_sma'] = ta.sma(df['volume'], length=20)
        
        # Price changes
        df['price_change'] = df['close'].pct_change()
        df['high_low_pct'] = (df['high'] - df['low']) / df['close']
        
        # Drop NaN values created by indicators
        df.dropna(inplace=True)
        
        return df
    
    def prepare_features(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        Select and prepare features for modeling.
        
        Args:
            df: DataFrame with OHLCV and technical indicators
            
        Returns:
            DataFrame with selected features
        """
        # Define feature columns (excluding target)
        self.feature_columns = [
            'open', 'high', 'low', 'close', 'volume',
            'sma_20', 'sma_50', 'ema_12', 'ema_26',
            'rsi', 'macd', 'macd_signal', 'macd_hist',
            'bb_upper', 'bb_middle', 'bb_lower', 'atr',
            'volume_sma', 'price_change', 'high_low_pct'
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
