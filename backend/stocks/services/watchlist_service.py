from django.db.models import Max
from ..models.portfolio import WatchlistItem
from ..models.market import DailyStockPrice, Company
from ..models.strategy import StrategySignal
from .portfolio_service import PortfolioService
import pandas as pd
import pandas_ta as ta
from decimal import Decimal
from django.utils import timezone
from datetime import timedelta

class WatchlistService:
    @staticmethod
    def get_watchlist_metrics(queryset):
        """Calculates dynamic metrics for a list of WatchlistItems."""
        tickers = list(queryset.values_list('ticker', flat=True).distinct())
        if not tickers:
            return []

        # 1. Fetch Latest Prices and Day Changes
        latest_prices = {}
        day_changes = {}
        day_change_percents = {}
        
        # We need latest price per ticker
        latest_data = DailyStockPrice.objects.filter(ticker__in=tickers).order_by('ticker', '-date').distinct('ticker')
        for p in latest_data:
            latest_prices[p.ticker] = p.close
            day_changes[p.ticker] = p.diff if hasattr(p, 'diff') else (p.close - p.prev_close if p.prev_close else 0)
            day_change_percents[p.ticker] = p.diff_percent if hasattr(p, 'diff_percent') else 0

        # 2. Fetch Company Info (Name, Sector)
        companies = Company.objects.filter(symbol__in=tickers).values('symbol', 'name', 'sector')
        company_data = {c['symbol']: {'name': c['name'], 'sector': c['sector']} for c in companies}

        # 3. Calculate Indicators (RSI-14, ROC-14)
        indicators = {}
        try:
            # Fetch last 50 days of data for all tickers to calculate indicators
            hist_qs = DailyStockPrice.objects.filter(
                ticker__in=tickers
            ).order_by('ticker', 'date')
            
            # Using pandas for calculation
            df_all = pd.DataFrame.from_records(hist_qs.values('ticker', 'date', 'close'))
            if not df_all.empty:
                df_all['close'] = df_all['close'].astype(float)
                for ticker in tickers:
                    df_t = df_all[df_all['ticker'] == ticker].copy()
                    if len(df_t) >= 14:
                        rsi = ta.rsi(df_t['close'], length=14)
                        roc = ta.roc(df_t['close'], length=14)
                        indicators[ticker] = {
                            'rsi': float(rsi.iloc[-1]) if not pd.isna(rsi.iloc[-1]) else None,
                            'roc': float(roc.iloc[-1]) if not pd.isna(roc.iloc[-1]) else None
                        }
        except Exception as e:
            print(f"Watchlist Indicator Calc Error: {e}")

        # 4. Fetch Strategy Signals (Detailed structure)
        signals_map = PortfolioService._get_signals_map(tickers)

        results = []
        for item in queryset:
            ticker = item.ticker
            item.current_price = latest_prices.get(ticker)
            item.day_change = day_changes.get(ticker)
            item.day_change_percent = day_change_percents.get(ticker)
            comp = company_data.get(ticker, {})
            item.name = comp.get('name', ticker)
            item.sector = comp.get('sector', 'Unknown')
            
            ind = indicators.get(ticker, {})
            item.rsi = ind.get('rsi')
            item.roc = ind.get('roc')
            
            item.signals = signals_map.get(ticker)
            results.append(item)
            
        return results
