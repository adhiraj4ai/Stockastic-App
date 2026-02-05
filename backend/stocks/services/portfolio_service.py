from django.db import transaction
from django.db.models import Sum, Max
from ..models.portfolio import PortfolioItem, PortfolioTransaction, TransactionType, PortfolioAccount
from ..models.market import DailyStockPrice, Company
from ..models.strategy import StrategySignal
from ..utils import (
    calculate_broker_commission, calculate_sebon_fee, 
    calculate_dp_charge, calculate_cgt
)
from decimal import Decimal
import pandas as pd
from django.utils import timezone
from datetime import timedelta

class PortfolioService:
    @staticmethod
    def recalculate_item(user, account, ticker):
        """Recalculates a single PortfolioItem based on its transaction history."""
        txns = PortfolioTransaction.objects.filter(
            user=user, 
            account=account, 
            ticker=ticker
        ).order_by('transaction_date', 'created_at')
        
        if not txns.exists():
            PortfolioItem.objects.filter(user=user, account=account, ticker=ticker).delete()
            return None

        qty = 0
        wacc = Decimal('0.00')
        
        for txn in txns:
            if txn.transaction_type in [TransactionType.BUY, TransactionType.BONUS]:
                if txn.transaction_type == TransactionType.BUY:
                    cost = Decimal(txn.quantity * txn.rate) + Decimal(txn.commission + txn.sebon_fee + txn.dp_charge)
                else:
                    cost = Decimal('0.00') # Bonus
                    
                old_val = Decimal(qty) * wacc
                qty += txn.quantity
                if qty > 0:
                    wacc = (old_val + cost) / Decimal(qty)
                    
            elif txn.transaction_type == TransactionType.SELL:
                qty -= txn.quantity
                
        if qty <= 0:
            PortfolioItem.objects.filter(user=user, account=account, ticker=ticker).delete()
            return None
        else:
            item, created = PortfolioItem.objects.get_or_create(
                user=user, account=account, ticker=ticker,
                defaults={'quantity': qty, 'wacc': wacc, 'buy_price': wacc}
            )
            if not created:
                item.quantity = qty
                item.wacc = wacc
                item.buy_price = wacc
                item.save()
            return item

    @staticmethod
    @transaction.atomic
    def process_transaction(user, ticker, txn_type, quantity, rate, account=None, commission=None, sebon_fee=None, dp_charge=None):
        """Processes a new transaction and updates the PortfolioItem."""
        amount = Decimal(quantity) * Decimal(rate)
        commission = Decimal(commission) if commission else calculate_broker_commission(amount)
        sebon_fee = Decimal(sebon_fee) if sebon_fee else calculate_sebon_fee(amount)
        dp_charge = Decimal(dp_charge) if dp_charge else calculate_dp_charge()
        
        cgt = Decimal('0.00')
        receivable_amount = amount 
        
        portfolio_item, created = PortfolioItem.objects.get_or_create(
            user=user, 
            ticker=ticker,
            account=account,
            defaults={'quantity': 0, 'buy_price': 0, 'wacc': 0}
        )
        
        if txn_type == TransactionType.BUY:
            total_cost_addition = amount + commission + sebon_fee + dp_charge
            old_total_cost = Decimal(portfolio_item.quantity) * Decimal(portfolio_item.wacc)
            
            new_quantity = portfolio_item.quantity + quantity
            new_wacc = (old_total_cost + total_cost_addition) / Decimal(new_quantity)
            
            portfolio_item.quantity = new_quantity
            portfolio_item.wacc = new_wacc
            portfolio_item.buy_price = new_wacc
            portfolio_item.save()
            
            receivable_amount = total_cost_addition 

        elif txn_type == TransactionType.SELL:
            if portfolio_item.quantity < quantity:
                raise ValueError("Insufficient quantity to sell.")
            
            profit_per_share = Decimal(rate) - Decimal(portfolio_item.wacc)
            total_profit = profit_per_share * Decimal(quantity)
            
            if total_profit > 0:
                cgt = calculate_cgt(total_profit, is_long_term=False) 
                
            receivable_amount = amount - commission - sebon_fee - dp_charge - cgt 
            
            portfolio_item.quantity -= quantity
            if portfolio_item.quantity == 0:
                portfolio_item.delete()
            else:
                portfolio_item.save()

        elif txn_type == TransactionType.BONUS:
            old_total_cost = Decimal(portfolio_item.quantity) * Decimal(portfolio_item.wacc)
            new_quantity = portfolio_item.quantity + quantity
            new_wacc = old_total_cost / Decimal(new_quantity)
            
            portfolio_item.quantity = new_quantity
            portfolio_item.wacc = new_wacc
            portfolio_item.buy_price = new_wacc
            portfolio_item.save()
            
            receivable_amount = Decimal('0.00')

        return {
            'amount': amount,
            'commission': commission,
            'sebon_fee': sebon_fee,
            'dp_charge': dp_charge,
            'cgt': cgt,
            'receivable_amount': receivable_amount
        }

    @staticmethod
    def get_portfolio_metrics(queryset):
        """Calculates dynamic metrics for a list of PortfolioItems."""
        tickers = [item.ticker for item in queryset]
        latest_prices = {}
        prev_closes = {}
        company_sectors = {}
        volatilities = {}
        
        if not tickers:
            return []

        dates = DailyStockPrice.objects.order_by('-date').values_list('date', flat=True).distinct()[:2]
        if len(dates) >= 1:
            latest_date = dates[0]
            prices = DailyStockPrice.objects.filter(date=latest_date, ticker__in=tickers)
            latest_prices = {p.ticker: p.close for p in prices}
            
            if len(dates) >= 2:
                prev_date = dates[1]
                prev_prices = DailyStockPrice.objects.filter(date=prev_date, ticker__in=tickers)
                prev_closes = {p.ticker: p.close for p in prev_prices}
        
        companies = Company.objects.filter(symbol__in=tickers).values('symbol', 'sector')
        company_sectors = {c['symbol']: c['sector'] for c in companies}
        
        try:
            cutoff_date = (dates[0] if dates else timezone.now()) - timedelta(days=60)
            hist_qs = DailyStockPrice.objects.filter(
                ticker__in=tickers,
                date__gte=cutoff_date
            ).values('ticker', 'date', 'close').order_by('date')
            
            df_hist = pd.DataFrame.from_records(hist_qs)
            if not df_hist.empty:
                df_hist['close'] = df_hist['close'].astype(float)
                for ticker in tickers:
                    df_t = df_hist[df_hist['ticker'] == ticker]
                    if len(df_t) > 10:
                        returns = df_t['close'].pct_change().dropna()
                        if not returns.empty:
                            volatilities[ticker] = returns.std() * (252 ** 0.5) * 100
        except Exception as e:
            print(f"Volatility Calc Error: {e}")

        signals_map = PortfolioService._get_signals_map(tickers)

        results = []
        for item in queryset:
            current_price = Decimal(latest_prices.get(item.ticker, item.buy_price))
            prev_close = Decimal(prev_closes.get(item.ticker, current_price))
            
            item.current_price = current_price
            item.investment_value = Decimal(item.quantity) * Decimal(item.buy_price)
            item.current_value = Decimal(item.quantity) * current_price
            item.gain_loss = item.current_value - item.investment_value
            item.gain_loss_percent = (item.gain_loss / item.investment_value * 100) if item.investment_value else 0
            
            day_change = current_price - prev_close
            item.day_gain_loss = day_change * Decimal(item.quantity)
            
            item.sector = company_sectors.get(item.ticker, 'Unknown')
            item.volatility = volatilities.get(item.ticker, 0.0)
            item.signals = signals_map.get(item.ticker)
            results.append(item)
        
        return results

    @staticmethod
    def _get_signals_map(tickers):
        """Helper to get latest strategy signals for tickers."""
        if not tickers:
            return {}
            
        latest_dates = StrategySignal.objects.filter(
            symbol__in=tickers
        ).values('symbol').annotate(max_date=Max('date'))
        
        latest_date_map = {item['symbol']: item['max_date'] for item in latest_dates}
        signals_map = {}

        for ticker, latest_date in latest_date_map.items():
            if not latest_date:
                continue
                
            signals = StrategySignal.objects.filter(
                symbol=ticker,
                date=latest_date
            ).select_related('strategy')
            
            signal_list = [{'signal': s.signal, 'strategy_name': s.strategy.name, 'strategy_description': s.strategy.description} for s in signals]
            
            buy_count = sum(1 for s in signal_list if 'BUY' in s['signal'])
            sell_count = sum(1 for s in signal_list if 'SELL' in s['signal'])
            
            summary = 'NEUTRAL'
            if buy_count > sell_count: summary = 'BUY'
            elif sell_count > buy_count: summary = 'SELL'
            elif buy_count > 0 and buy_count == sell_count: summary = 'MIXED'
            elif any('HOLD' in s['signal'] for s in signal_list): summary = 'HOLD'
                
            signals_map[ticker] = {'latest_date': latest_date, 'summary': summary, 'details': signal_list}
            
        return signals_map
