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
from ..services.portfolio_service import PortfolioService
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
        data = PortfolioService.get_portfolio_metrics(queryset)
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
        
        try:
            metrics = PortfolioService.process_transaction(
                user=user,
                ticker=data['ticker'],
                txn_type=data['transaction_type'],
                quantity=data['quantity'],
                rate=data['rate'],
                account=data.get('account'),
                commission=data.get('commission'),
                sebon_fee=data.get('sebon_fee'),
                dp_charge=data.get('dp_charge')
            )
            
            serializer.save(
                user=user,
                amount=metrics['amount'],
                commission=metrics['commission'],
                sebon_fee=metrics['sebon_fee'],
                dp_charge=metrics['dp_charge'],
                cgt=metrics['cgt'],
                receivable_amount=metrics['receivable_amount']
            )
        except ValueError as e:
            from rest_framework import serializers
            raise serializers.ValidationError(str(e))

    def perform_destroy(self, instance):
        user = instance.user
        ticker = instance.ticker
        account = instance.account
        
        instance.delete()
        
        # Recalculate the item after deletion to ensure correctness
        PortfolioService.recalculate_item(user, account, ticker)
