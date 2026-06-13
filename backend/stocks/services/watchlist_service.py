from django.db.models import Max
from ..models.portfolio import WatchlistItem
from ..models.market import DailyStockPrice, Company, DailyCumulativeAccumulation
from ..models.fundamentals import StockFundamental, Dividend
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
        """Slim orchestrator: fetch all data, enrich each item, return list."""
        tickers = list(queryset.values_list('ticker', flat=True).distinct())
        if not tickers:
            return []

        prices, changes, pct_changes = WatchlistService._fetch_price_data(tickers)
        company_data = WatchlistService._fetch_company_data(tickers)
        indicators = WatchlistService._fetch_indicators(tickers)
        fund_qs = StockFundamental.objects.filter(ticker__in=tickers)
        fundamental_map = {f.ticker: f for f in fund_qs}
        rvol_map = WatchlistService._fetch_rvol(tickers)
        dividend_map = WatchlistService._fetch_dividend_map(tickers)
        accumulation_map = WatchlistService._fetch_accumulation(tickers)
        signals_map = PortfolioService._get_signals_map(tickers)

        return [
            WatchlistService._enrich_item(
                item, prices, changes, pct_changes,
                company_data, indicators, fundamental_map,
                rvol_map, dividend_map, accumulation_map, signals_map,
            )
            for item in queryset
        ]

    @staticmethod
    def _fetch_price_data(tickers):
        """Return (prices, day_changes, day_change_percents) dicts keyed by ticker."""
        prices, changes, pct_changes = {}, {}, {}
        latest = (
            DailyStockPrice.objects
            .filter(ticker__in=tickers)
            .order_by('ticker', '-date')
            .distinct('ticker')
        )
        for p in latest:
            prices[p.ticker] = p.close
            changes[p.ticker] = (
                p.diff if hasattr(p, 'diff')
                else (p.close - p.prev_close if p.prev_close else 0)
            )
            pct_changes[p.ticker] = p.diff_percent if hasattr(p, 'diff_percent') else 0
        return prices, changes, pct_changes

    @staticmethod
    def _fetch_company_data(tickers):
        """Return {symbol: {name, sector}} for the given tickers."""
        rows = Company.objects.filter(symbol__in=tickers).values('symbol', 'name', 'sector')
        return {c['symbol']: {'name': c['name'], 'sector': c['sector']} for c in rows}

    @staticmethod
    def _fetch_indicators(tickers):
        """Return {ticker: {rsi, roc}} using TA-Lib; returns {} on any error."""
        if not tickers:
            return {}
        indicators = {}
        try:
            hist_qs = DailyStockPrice.objects.filter(ticker__in=tickers).order_by('ticker', 'date')
            df_all = pd.DataFrame.from_records(hist_qs.values('ticker', 'date', 'close'))
            if df_all.empty:
                return indicators
            df_all['close'] = df_all['close'].astype(float)
            for ticker in tickers:
                df_t = df_all[df_all['ticker'] == ticker].copy()
                if len(df_t) >= 14:
                    close_vals = df_t['close'].values.astype(float)
                    rsi = talib.RSI(close_vals, timeperiod=14)
                    roc = talib.ROC(close_vals, timeperiod=14)
                    indicators[ticker] = {
                        'rsi': float(rsi[-1]) if not np.isnan(rsi[-1]) else None,
                        'roc': float(roc[-1]) if not np.isnan(roc[-1]) else None,
                    }
        except Exception as e:
            print(f"Watchlist Indicator Calc Error: {e}")
        return indicators

    @staticmethod
    def _fetch_rvol(tickers):
        """Return {ticker: float} relative-volume; returns {} on any error."""
        rvol_map = {}
        try:
            cutoff = timezone.now().date() - timedelta(days=40)
            vol_data = (
                DailyStockPrice.objects
                .filter(ticker__in=tickers, date__gte=cutoff)
                .values('ticker', 'volume')
                .order_by('ticker', '-date')
            )
            df_vol = pd.DataFrame.from_records(vol_data)
            if df_vol.empty:
                return rvol_map
            for ticker in tickers:
                df_t = df_vol[df_vol['ticker'] == ticker]
                if len(df_t) >= 5:
                    today_vol = float(df_t.iloc[0]['volume'])
                    adv_20 = float(df_t['volume'].tail(-1).mean())
                    if adv_20 > 0:
                        rvol_map[ticker] = today_vol / adv_20
        except Exception as e:
            print(f"Watchlist RVOL Calc Error: {e}")
        return rvol_map

    @staticmethod
    def _fetch_accumulation(tickers):
        """Return {ticker: bool} smart-money accumulation flag; returns {} on any error."""
        if not tickers:
            return {}
        accumulation_map = {}
        try:
            cutoff = timezone.now().date() - timedelta(days=10)
            acc_data = (
                DailyCumulativeAccumulation.objects
                .filter(symbol__in=tickers, transaction_date__gte=cutoff)
                .values('symbol', 'cumulative_net')
                .order_by('symbol', '-transaction_date')
            )
            for ticker in tickers:
                ticker_acc = [float(a['cumulative_net']) for a in acc_data if a['symbol'] == ticker]
                if len(ticker_acc) >= 2:
                    accumulation_map[ticker] = ticker_acc[0] > ticker_acc[-1]
        except Exception as e:
            print(f"Watchlist Accumulation Calc Error: {e}")
        return accumulation_map

    @staticmethod
    def _fetch_dividend_map(tickers):
        """Return {ticker: Dividend} for latest book-close per ticker."""
        div_qs = (
            Dividend.objects
            .filter(ticker__in=tickers)
            .order_by('ticker', '-book_close_date')
            .distinct('ticker')
        )
        return {d.ticker: d for d in div_qs}

    @staticmethod
    def _apply_book_closure(item, dividend_map):
        """Mutate item with days_to_book_closure and next_book_close if applicable."""
        div_obj = dividend_map.get(item.ticker)
        if not (div_obj and div_obj.book_close_date):
            return
        days = (div_obj.book_close_date - timezone.now().date()).days
        item.days_to_book_closure = days if days >= 0 else None
        item.next_book_close = div_obj.book_close_date

    @staticmethod
    def _apply_risk_reward(item):
        """Mutate item with upside_percent and risk_reward_ratio when prices exist."""
        if not (item.current_price and item.target_price):
            return
        curr = float(item.current_price)
        target = float(item.target_price)
        if curr <= 0:
            return
        item.upside_percent = ((target - curr) / curr) * 100
        if not item.stop_loss_price:
            return
        sl = float(item.stop_loss_price)
        risk = curr - sl
        reward = target - curr
        item.risk_reward_ratio = (reward / risk) if risk > 0 else None

    @staticmethod
    def _apply_signals(item, signals_map):
        """Mutate item with signals and buy_signal_count."""
        sig_data = signals_map.get(item.ticker, {})
        item.signals = sig_data
        details = sig_data.get('details', [])
        item.buy_signal_count = sum(1 for s in details if 'BUY' in s.get('signal', ''))

    @staticmethod
    def _apply_52_week(item, fund_obj):
        """Mutate item with 52-week high/low from fundamental object."""
        item.fifty_two_week_high = (
            float(fund_obj.fifty_two_week_high) if fund_obj and fund_obj.fifty_two_week_high else None
        )
        item.fifty_two_week_low = (
            float(fund_obj.fifty_two_week_low) if fund_obj and fund_obj.fifty_two_week_low else None
        )

    @staticmethod
    def _enrich_item(
        item, prices, changes, pct_changes,
        company_data, indicators, fundamental_map,
        rvol_map, dividend_map, accumulation_map, signals_map,
    ):
        """Annotate a WatchlistItem with all computed metrics and return it."""
        ticker = item.ticker
        item.current_price = prices.get(ticker)
        item.day_change = changes.get(ticker)
        item.day_change_percent = pct_changes.get(ticker)

        comp = company_data.get(ticker, {})
        item.name = comp.get('name', ticker)
        item.sector = comp.get('sector', 'Unknown')

        ind = indicators.get(ticker, {})
        item.rsi = ind.get('rsi')
        item.roc = ind.get('roc')

        fund_obj = fundamental_map.get(ticker)
        health_score, fund_metrics = FundamentalService.calculate_health_score(fund_obj)
        item.health_score = health_score
        item.fundamental_metrics = fund_metrics
        item.rvol = rvol_map.get(ticker)

        WatchlistService._apply_52_week(item, fund_obj)
        WatchlistService._apply_book_closure(item, dividend_map)
        item.is_accumulating = accumulation_map.get(ticker, False)
        WatchlistService._apply_signals(item, signals_map)
        WatchlistService._apply_risk_reward(item)

        return item
