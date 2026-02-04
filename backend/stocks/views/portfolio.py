from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from decimal import Decimal
from django.db.models import Q, Max
from django.utils import timezone
from datetime import timedelta
import pandas as pd
import numpy as np

from ..models import (
    PortfolioAccount, PortfolioItem, PortfolioTransaction, 
    DailyStockPrice, Company, StrategySignal, FinancialReport, TransactionType
)
from ..serializers import (
    PortfolioAccountSerializer, PortfolioItemSerializer, PortfolioTransactionSerializer
)
from ..utils import (
    calculate_broker_commission, calculate_sebon_fee, 
    calculate_dp_charge, calculate_cgt
)
from ..optimization import perform_portfolio_optimization

class PortfolioAccountViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = PortfolioAccountSerializer

    def get_queryset(self):
        if self.request.user.username == 'admin':
            return PortfolioAccount.objects.all()
        return PortfolioAccount.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

class PortfolioViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = PortfolioItemSerializer

    def get_queryset(self):
        user = self.request.user
        if user.username == 'admin':
            queryset = PortfolioItem.objects.all()
        else:
            queryset = PortfolioItem.objects.filter(user=user)
        
        account_id = self.request.query_params.get('account')
        if account_id:
            queryset = queryset.filter(account_id=account_id)
            
        return queryset

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    def list(self, request, *args, **kwargs):
        queryset = self.get_queryset()
        tickers = [item.ticker for item in queryset]
        latest_prices = {}
        prev_closes = {}
        company_sectors = {}
        volatilities = {}
        
        if tickers:
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
                cutoff_date = (timezone.now() if dates else timezone.now()) - timedelta(days=60)
                if dates: cutoff_date = dates[0] - timedelta(days=60)
                
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
                            df_t = df_t.sort_values('date')
                            returns = df_t['close'].pct_change().dropna()
                            if not returns.empty:
                                vol = returns.std() * (252 ** 0.5) * 100
                                volatilities[ticker] = vol
            except Exception as e:
                print(f"Volatility Calc Error: {e}")

        signals_map = {}
        if tickers:
            latest_dates = StrategySignal.objects.filter(
                symbol__in=tickers
            ).values('symbol').annotate(max_date=Max('date'))
            
            latest_date_map = {item['symbol']: item['max_date'] for item in latest_dates}
            
            for ticker, latest_date in latest_date_map.items():
                if not latest_date:
                    continue
                    
                signals = StrategySignal.objects.filter(
                    symbol=ticker,
                    date=latest_date
                ).select_related('strategy')
                
                signal_list = []
                for s in signals:
                    signal_list.append({
                        'signal': s.signal,
                        'strategy_name': s.strategy.name,
                        'strategy_description': s.strategy.description
                    })
                
                buy_count = sum(1 for s in signal_list if 'BUY' in s['signal'])
                sell_count = sum(1 for s in signal_list if 'SELL' in s['signal'])
                
                summary = 'NEUTRAL'
                if buy_count > sell_count:
                    summary = 'BUY'
                elif sell_count > buy_count:
                    summary = 'SELL'
                elif buy_count > 0 and buy_count == sell_count:
                    summary = 'MIXED'
                elif any('HOLD' in s['signal'] for s in signal_list):
                    summary = 'HOLD'
                    
                signals_map[ticker] = {
                    'latest_date': latest_date,
                    'summary': summary,
                    'details': signal_list
                }

        data = []
        for item in queryset:
            current_price = latest_prices.get(item.ticker, item.buy_price)
            prev_close = prev_closes.get(item.ticker, current_price)
            
            investment_value = item.quantity * item.buy_price
            current_value = item.quantity * current_price
            gain_loss = current_value - investment_value
            gain_loss_percent = (gain_loss / investment_value * 100) if investment_value else 0
            
            day_change = current_price - prev_close
            day_gain_loss = day_change * item.quantity

            item.current_price = current_price
            item.current_value = current_value
            item.investment_value = investment_value
            item.gain_loss = gain_loss
            item.gain_loss_percent = gain_loss_percent
            item.day_gain_loss = day_gain_loss
            
            item.sector = company_sectors.get(item.ticker, 'Unknown')
            item.volatility = volatilities.get(item.ticker, 0.0)
            item.signals = signals_map.get(item.ticker)
            
            data.append(item)

        serializer = self.get_serializer(data, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def optimize(self, request):
        user = request.user
        account_id = request.query_params.get('account')
        
        queryset = PortfolioItem.objects.filter(user=user)
        if account_id and account_id != 'all':
            queryset = queryset.filter(account_id=account_id)
            
        tickers = list(queryset.values_list('ticker', flat=True).distinct())
        
        if not tickers:
            return Response({"error": "Portfolio is empty"}, status=status.HTTP_400_BAD_REQUEST)
            
        method = request.query_params.get('method', 'max_sharpe')
        
        current_holdings = {}
        for item in queryset:
            ticker = item.ticker
            if ticker not in current_holdings:
                latest_price_obj = DailyStockPrice.objects.filter(ticker=ticker).order_by('-date').first()
                latest_price = float(latest_price_obj.close) if latest_price_obj else 0
                current_holdings[ticker] = {'quantity': 0, 'price': latest_price}
            
            current_holdings[ticker]['quantity'] += float(item.quantity)

        result = perform_portfolio_optimization(tickers, current_holdings=current_holdings, method=method)
        
        if not result.get("success"):
            return Response(result, status=status.HTTP_400_BAD_REQUEST)
            
        return Response(result)

    @action(detail=True, methods=['get'])
    def suggest_exits(self, request, pk=None):
        item = self.get_object()
        ticker = item.ticker
        
        hist = DailyStockPrice.objects.filter(ticker=ticker).order_by('-date')[:60]
        if not hist:
            return Response({"error": "No price data found"}, status=400)
            
        latest_price = float(hist[0].close)
        df = pd.DataFrame(list(hist.values('date', 'high', 'low', 'close'))[::-1])
        
        if len(df) > 14:
            df['tr1'] = df['high'] - df['low']
            df['tr2'] = (df['high'] - df['close'].shift(1)).abs()
            df['tr3'] = (df['low'] - df['close'].shift(1)).abs()
            df['tr'] = df[['tr1', 'tr2', 'tr3']].max(axis=1)
            atr = df['tr'].rolling(window=14).mean().iloc[-1]
            atr = float(atr) if not pd.isna(atr) else (latest_price * 0.02)
        else:
            atr = latest_price * 0.02
            
        recent = df.tail(20)
        swing_low = float(recent['low'].min())
        swing_high = float(recent['high'].max())
        
        wacc = float(item.wacc) if item.wacc else float(item.buy_price)
        is_underwater = latest_price < wacc

        strategies = {
            "fixed": {
                "name": "Fixed Percentage",
                "sl": latest_price * 0.95, 
                "tp": wacc * 1.10, 
                "tp2": wacc * 1.20,
                "tp3": wacc * 1.30,
                "desc": f"3-tier targets: 10%, 20%, 30% profit from cost (Rs. {wacc:.2f})."
            },
            "atr_conservative": {
                "name": "ATR (Conservative)",
                "sl": latest_price - (2 * atr),
                "tp": max(latest_price + (3 * atr), wacc * 1.05),
                "tp2": max(latest_price + (5 * atr), wacc * 1.15),
                "tp3": max(latest_price + (7 * atr), wacc * 1.25),
                "desc": f"Scaling out at 3x, 5x, 7x ATR volatility (ATR: {atr:.2f})."
            },
            "atr_aggressive": {
                "name": "ATR (Aggressive)",
                "sl": latest_price - (1 * atr),
                "tp": max(latest_price + (2 * atr), wacc * 1.02),
                "tp2": max(latest_price + (4 * atr), wacc * 1.05),
                "tp3": max(latest_price + (6 * atr), wacc * 1.10),
                "desc": "Momentum scaling at 2x, 4x, 6x ATR."
            },
            "swing": {
                "name": "Support/Resistance",
                "sl": min(swing_low * 0.99, latest_price * 0.95),
                "tp": max(swing_high * 1.01, wacc * 1.05),
                "tp2": max(swing_high * 1.15, wacc * 1.20),
                "tp3": max(swing_high * 1.30, wacc * 1.40),
                "desc": f"Recent High: {swing_high}. Targets secondary breakout levels."
            }
        }

        if is_underwater:
            strategies["break_even"] = {
                "name": "Break Even Recovery",
                "sl": latest_price * 0.96,
                "tp": wacc * 1.02,
                "tp2": wacc * 1.07,
                "tp3": wacc * 1.15,
                "desc": f"Recovery scaling: Break-even, +7%, and +15% from cost."
            }
        
        if strategies['swing']['tp'] <= latest_price * 1.02:
             strategies['swing']['tp'] = latest_price * 1.15
        
        health_warnings = []
        try:
            reports = FinancialReport.objects.filter(ticker=ticker).order_by('-fiscal_year', '-quarter')[:4]
            if len(reports) >= 2:
                latest_r = reports[0]
                prev_r = reports[1]
                
                if latest_r.net_profit and prev_r.net_profit:
                    if float(latest_r.net_profit) < float(prev_r.net_profit):
                        health_warnings.append({
                            "type": "PROFIT_DIP",
                            "message": f"Net Profit dropped from {float(prev_r.net_profit):,.0f} to {float(latest_r.net_profit):,.0f} in latest report.",
                            "severity": "MEDIUM"
                        })
                
                if latest_r.revenue and prev_r.revenue:
                    if float(latest_r.revenue) < float(prev_r.revenue):
                        health_warnings.append({
                            "type": "REVENUE_DIP",
                            "message": f"Revenue declined by {((1 - float(latest_r.revenue)/float(prev_r.revenue))*100):.1f}% in latest period.",
                            "severity": "LOW"
                        })
        except Exception as e:
            print(f"Health check error: {e}")

        txns = PortfolioTransaction.objects.filter(
            user=request.user, 
            ticker=ticker,
            account=item.account
        ).order_by('-transaction_date')
        txn_serializer = PortfolioTransactionSerializer(txns, many=True)

        return Response({
            "ticker": ticker,
            "current_price": latest_price,
            "wacc": wacc,
            "is_underwater": is_underwater,
            "strategies": strategies,
            "health_warnings": health_warnings,
            "transactions": txn_serializer.data
        })

class PortfolioTransactionViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = PortfolioTransactionSerializer

    def get_queryset(self):
        if self.request.user.username == 'admin':
            return PortfolioTransaction.objects.all().order_by('-transaction_date')
        return PortfolioTransaction.objects.filter(user=self.request.user).order_by('-transaction_date')

    def perform_create(self, serializer):
        user = self.request.user
        data = serializer.validated_data
        
        ticker = data['ticker']
        txn_type = data['transaction_type']
        quantity = data['quantity']
        rate = data['rate']
        account = data.get('account') 
        
        amount = quantity * rate
        commission = data.get('commission', 0) or calculate_broker_commission(amount)
        sebon_fee = data.get('sebon_fee', 0) or calculate_sebon_fee(amount)
        dp_charge = data.get('dp_charge', 0) or calculate_dp_charge()
        
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
            old_total_cost = portfolio_item.quantity * portfolio_item.wacc
            
            new_quantity = portfolio_item.quantity + quantity
            new_wacc = (old_total_cost + total_cost_addition) / new_quantity
            
            portfolio_item.quantity = new_quantity
            portfolio_item.wacc = new_wacc
            portfolio_item.buy_price = new_wacc
            portfolio_item.save()
            
            receivable_amount = total_cost_addition 

        elif txn_type == TransactionType.SELL:
            if portfolio_item.quantity < quantity:
                from rest_framework import serializers
                raise serializers.ValidationError("Insufficient quantity to sell.")
            
            profit_per_share = rate - portfolio_item.wacc
            total_profit = profit_per_share * quantity
            
            if total_profit > 0:
                cgt = calculate_cgt(total_profit, is_long_term=False) 
                
            receivable_amount = amount - commission - sebon_fee - dp_charge - cgt 
            
            portfolio_item.quantity -= quantity
            if portfolio_item.quantity == 0:
                portfolio_item.delete()
            else:
                portfolio_item.save()

        elif txn_type == TransactionType.BONUS:
            old_total_cost = portfolio_item.quantity * portfolio_item.wacc
            new_quantity = portfolio_item.quantity + quantity
            new_wacc = old_total_cost / new_quantity
            
            portfolio_item.quantity = new_quantity
            portfolio_item.wacc = new_wacc
            portfolio_item.buy_price = new_wacc
            portfolio_item.save()
            
            receivable_amount = 0

        serializer.save(
            user=user,
            amount=amount,
            commission=commission,
            sebon_fee=sebon_fee,
            dp_charge=dp_charge,
            cgt=cgt,
            receivable_amount=receivable_amount
        )

    def perform_destroy(self, instance):
        user = instance.user
        ticker = instance.ticker
        qty = instance.quantity
        txn_type = instance.transaction_type
        
        try:
            portfolio_item = PortfolioItem.objects.get(user=user, ticker=ticker, account=instance.account)
            
            if txn_type == TransactionType.BUY or txn_type == TransactionType.BONUS:
                portfolio_item.quantity -= qty
            elif txn_type == TransactionType.SELL:
                portfolio_item.quantity += qty
                
            if portfolio_item.quantity <= 0:
                portfolio_item.delete()
            else:
                portfolio_item.save()
                
        except PortfolioItem.DoesNotExist:
            pass
            
        instance.delete()
