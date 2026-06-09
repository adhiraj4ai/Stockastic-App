from django.db.models import Max
from ..models.portfolio import WatchlistItem
from ..models.market import DailyStockPrice, Company, DailyCumulativeAccumulation
from ..models.fundamentals import StockFundamental, Dividend
from ..models.strategy import StrategySignal
from .portfolio_service import PortfolioService
from .fundamental_service import FundamentalService
import pandas as pd
import talib
import numpy as np
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
                        close_vals = df_t['close'].values.astype(float)
                        rsi = talib.RSI(close_vals, timeperiod=14)
                        roc = talib.ROC(close_vals, timeperiod=14)
                        indicators[ticker] = {
                            'rsi': float(rsi[-1]) if not np.isnan(rsi[-1]) else None,
                            'roc': float(roc[-1]) if not np.isnan(roc[-1]) else None
                        }
        except Exception as e:
            print(f"Watchlist Indicator Calc Error: {e}")

        # 4. Fetch Fundamental Data (Health Score + 52 Week High/Low)
        fund_qs = StockFundamental.objects.filter(ticker__in=tickers)
        fundamental_map = {f.ticker: f for f in fund_qs}

        # 5. Fetch Relative Volume (RVOL)
        # RVOL = Today's Volume / 20-Day Average Daily Volume (ADV)
        rvol_map = {}
        try:
            # Fetch last 30 days of volume for ADV calculation
            vol_cutoff = timezone.now().date() - timedelta(days=40)
            vol_data = DailyStockPrice.objects.filter(
                ticker__in=tickers,
                date__gte=vol_cutoff
            ).values('ticker', 'volume').order_by('ticker', '-date')
            
            df_vol = pd.DataFrame.from_records(vol_data)
            if not df_vol.empty:
                for ticker in tickers:
                    df_t = df_vol[df_vol['ticker'] == ticker]
                    if len(df_t) >= 5:
                        today_vol = float(df_t.iloc[0]['volume'])
                        adv_20 = float(df_t['volume'].tail(-1).mean()) # Exclude today from ADV
                        if adv_20 > 0:
                            rvol_map[ticker] = today_vol / adv_20
        except Exception as e:
            print(f"Watchlist RVOL Calc Error: {e}")

        # 6. Fetch Dividend Info (Latest Book Close)
        div_qs = Dividend.objects.filter(ticker__in=tickers).order_by('ticker', '-book_close_date').distinct('ticker')
        dividend_map = {d.ticker: d for d in div_qs}

        # 7. Fetch Smart Money Pulse (Last 5 days Accumulation)
        accumulation_map = {}
        try:
            acc_cutoff = timezone.now().date() - timedelta(days=10)
            acc_data = DailyCumulativeAccumulation.objects.filter(
                symbol__in=tickers,
                transaction_date__gte=acc_cutoff
            ).values('symbol', 'cumulative_net').order_by('symbol', '-transaction_date')
            
            for ticker in tickers:
                ticker_acc = [float(a['cumulative_net']) for a in acc_data if a['symbol'] == ticker]
                if len(ticker_acc) >= 2:
                    # If net position increased in last 5 records
                    accumulation_map[ticker] = ticker_acc[0] > ticker_acc[-1]
        except Exception as e:
            print(f"Watchlist Accumulation Calc Error: {e}")

        # 8. Fetch Strategy Signals (Detailed structure)
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
            
            # Enhanced Data
            fund_obj = fundamental_map.get(ticker)
            health_score, fund_metrics = FundamentalService.calculate_health_score(fund_obj)
            item.health_score = health_score
            item.fundamental_metrics = fund_metrics
            item.rvol = rvol_map.get(ticker)
            item.fifty_two_week_high = float(fund_obj.fifty_two_week_high) if fund_obj and fund_obj.fifty_two_week_high else None
            item.fifty_two_week_low = float(fund_obj.fifty_two_week_low) if fund_obj and fund_obj.fifty_two_week_low else None

            # Book Closure
            div_obj = dividend_map.get(ticker)
            if div_obj and div_obj.book_close_date:
                days_to_bc = (div_obj.book_close_date - timezone.now().date()).days
                item.days_to_book_closure = days_to_bc if days_to_bc >= 0 else None
                item.next_book_close = div_obj.book_close_date
            
            # Smart Money
            item.is_accumulating = accumulation_map.get(ticker, False)

            # Strategy Signal Count
            sig_data = signals_map.get(ticker, {})
            details = sig_data.get('details', [])
            item.buy_signal_count = sum(1 for s in details if 'BUY' in s.get('signal', ''))

            # Risk/Reward & Upside
            if item.current_price and item.target_price:
                curr = float(item.current_price)
                target = float(item.target_price)
                if curr > 0:
                    item.upside_percent = ((target - curr) / curr) * 100
                
                if item.stop_loss_price:
                    sl = float(item.stop_loss_price)
                    risk = curr - sl
                    reward = target - curr
                    if risk > 0:
                        item.risk_reward_ratio = reward / risk
                    else:
                        item.risk_reward_ratio = None

            results.append(item)
            
        return results
