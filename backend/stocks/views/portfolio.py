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

    @action(detail=False, methods=['post'])
    def calculate_position_size(self, request):
        """
        Calculate optimal position size based on risk parameters.
        
        POST body:
        {
            "account_id": int or "all" (optional, defaults to "all"),
            "entry_price": float (required),
            "stop_loss_price": float (required),
            "risk_percentage": float (optional, defaults to account's default or 2.0),
            "target_price": float (optional, for R/R calculation)
        }
        """
        from ..services.position_sizing import PositionSizingService
        
        user = request.user
        
        # Get parameters from request
        account_id = request.data.get('account_id', 'all')
        entry_price = request.data.get('entry_price')
        stop_loss_price = request.data.get('stop_loss_price')
        risk_percentage = request.data.get('risk_percentage')
        target_price = request.data.get('target_price')
        
        # Validate required parameters
        if entry_price is None:
            return Response(
                {"error": "entry_price is required"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        if stop_loss_price is None:
            return Response(
                {"error": "stop_loss_price is required"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Calculate account balance
        if account_id == 'all':
            # Use total portfolio value across all accounts
            queryset = PortfolioItem.objects.filter(user=user)
            total_value = sum(float(item.current_price) * item.quantity for item in queryset)
            
            # Add cash balance from all accounts
            accounts = PortfolioAccount.objects.filter(user=user)
            total_cash = sum(float(acc.balance) for acc in accounts)
            
            account_balance = total_value + total_cash
            
            # Get default risk percentage from first account or use 2.0
            if accounts.exists():
                default_risk = float(accounts.first().default_risk_percentage)
            else:
                default_risk = 2.0
        else:
            # Use specific account
            try:
                account = PortfolioAccount.objects.get(id=account_id, user=user)
                
                # Calculate account value (holdings + cash)
                queryset = PortfolioItem.objects.filter(user=user, account=account)
                holdings_value = sum(float(item.current_price) * item.quantity for item in queryset)
                
                account_balance = holdings_value + float(account.balance)
                default_risk = float(account.default_risk_percentage)
            except PortfolioAccount.DoesNotExist:
                return Response(
                    {"error": "Account not found"},
                    status=status.HTTP_404_NOT_FOUND
                )
        
        # Use provided risk percentage or default
        if risk_percentage is None:
            risk_percentage = default_risk
        
        # Ensure minimum account balance
        if account_balance <= 0:
            account_balance = 100000  # Default to 1 lakh if no portfolio
        
        # Calculate position size
        try:
            result = PositionSizingService.calculate_position_size(
                account_balance=account_balance,
                risk_percentage=float(risk_percentage),
                entry_price=float(entry_price),
                stop_loss_price=float(stop_loss_price),
                target_price=float(target_price) if target_price else None
            )
            
            return Response(result, status=status.HTTP_200_OK)
            
        except ValueError as e:
            return Response(
                {"error": str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )

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

    def perform_update(self, serializer):
        user = self.request.user
        instance = serializer.instance
        old_ticker = instance.ticker
        old_account = instance.account
        
        # Save updates
        # For updates, we might need to re-process metrics like commission if quantity/rate changed
        # ideally we re-run process_transaction logic or similar calculation
        # But serializer.save() just updates model fields. 
        # We need to manually update calculated fields if quantity/rate changed.
        
        data = serializer.validated_data
        
        # Recalculate charges if quantity or rate changed
        if 'quantity' in data or 'rate' in data or 'transaction_type' in data:
            qty = data.get('quantity', instance.quantity)
            rate = data.get('rate', instance.rate)
            txn_type = data.get('transaction_type', instance.transaction_type)
            
            # Simple recalc of standard charges (ignoring manual overrides for now as they aren't in standard form)
            # If user provided overrides in PUT, use them, else recalc
            
            amount = Decimal(qty) * Decimal(rate)
            commission = data.get('commission', calculate_broker_commission(amount))
            sebon_fee = data.get('sebon_fee', calculate_sebon_fee(amount))
            dp_charge = data.get('dp_charge', calculate_dp_charge())
            
            # CGT logic is complex for edit, assume 0 or manual for now unless SELL
            cgt = data.get('cgt', instance.cgt) 
            # Note: Recalculating CGT accurately requires knowing profit at that specific time, which is hard.
            # Allowing user to edit means they might need to adjust manually if backend logic falls short.
            # For now, simplistic approach: update calc fields.
            
            receivable = amount
            if txn_type == TransactionType.BUY:
                receivable = amount + commission + sebon_fee + dp_charge
            elif txn_type == TransactionType.SELL:
                 receivable = amount - commission - sebon_fee - dp_charge - cgt
            elif txn_type == TransactionType.BONUS:
                 receivable = Decimal('0.00')
                 
            serializer.save(
                amount=amount,
                commission=commission,
                sebon_fee=sebon_fee,
                dp_charge=dp_charge,
                receivable_amount=receivable
            )
        else:
            serializer.save()

        # Recalculate Portfolio Item
        # If ticker or account changed (unlikely in simple edit), we'd need to recalc old and new.
        # Assuming ticker/account don't change for now (simplifies logic).
        
        ticker = instance.ticker # updated ticker
        account = instance.account # updated account
        
        # Recalculate this item
        PortfolioService.recalculate_item(user, account, ticker)
        
        # If ticker/account *did* change, we should recalc the old one too.
        if old_ticker != ticker or old_account != account:
             PortfolioService.recalculate_item(user, old_account, old_ticker)

class PortfolioPerformanceView(viewsets.ViewSet):
    """
    API endpoint for benchmarking portfolio performance against NEPSE.
    """
    permission_classes = [IsAuthenticated]

    @action(detail=False, methods=['get'])
    def metrics(self, request):
        """
        Get performance metrics (Alpha, Beta, Sharpe) & Comparison Chart Data.
        Query Params:
        - period: 1M, 3M, 6M, 1Y, YTD, ALL (default: 1Y)
        - account: account_id or 'all' (default: 'all')
        """
        user = request.user
        period = request.query_params.get('period', '1Y')
        account_id = request.query_params.get('account', 'all')
        
        # 1. Determine Date Range
        end_date = timezone.now().date()
        if period == '1M':
            start_date = end_date - timedelta(days=30)
        elif period == '3M':
            start_date = end_date - timedelta(days=90)
        elif period == '6M':
            start_date = end_date - timedelta(days=180)
        elif period == 'YTD':
            start_date = date(end_date.year, 1, 1)
        elif period == 'ALL':
            # Find earliest transaction date
            first_txn = PortfolioTransaction.objects.filter(user=user).order_by('transaction_date').first()
            start_date = first_txn.transaction_date.date() if first_txn else end_date - timedelta(days=365)
        else: # Default 1Y
            start_date = end_date - timedelta(days=365)
            
        # 2. Fetch Portfolio Snapshots
        from ..models import PortfolioSnapshot
        snapshots = PortfolioSnapshot.objects.filter(
            user=user, 
            date__gte=start_date, 
            date__lte=end_date
        ).order_by('date')
        
        if account_id != 'all':
            snapshots = snapshots.filter(account_id=account_id)
        else:
            # If 'all', we might need to aggregate snapshots by date if we stored them per account
            # Currently model has account, so we need to sum up total_value per date
            snapshots = snapshots.values('date').annotate(
                total_value=Sum('total_value'),
                invested_value=Sum('invested_value'),
                cash_balance=Sum('cash_balance')
            ).order_by('date')
            
        if not snapshots:
            return Response({"error": "No portfolio history found for this period"}, status=200)

        # Convert to DataFrame for easier calculation
        df_port = pd.DataFrame(list(snapshots))
        df_port['date'] = pd.to_datetime(df_port['date'])
        df_port.set_index('date', inplace=True)
        
        # Calculate daily returns
        df_port['return'] = df_port['total_value'].pct_change().fillna(0)
        
        # 3. Fetch Benchmark Data (NEPSE)
        # We need NEPSE index history. Assuming 'NEPSE' ticker in DailyStockPrice
        # If not present, we can't calculate relative metrics, returning only portfolio performance.
        nepse_data = DailyStockPrice.objects.filter(
            ticker='NEPSE', 
            date__gte=start_date, 
            date__lte=end_date
        ).values('date', 'close').order_by('date')
        
        df_bench = pd.DataFrame(list(nepse_data))
        has_benchmark = not df_bench.empty
        
        metrics = {
            "alpha": 0,
            "beta": 0,
            "sharpe_ratio": 0,
            "total_return": 0,
            "max_drawdown": 0,
            "benchmark_return": 0
        }
        
        chart_data = []
        
        if has_benchmark:
            df_bench['date'] = pd.to_datetime(df_bench['date'])
            df_bench.set_index('date', inplace=True)
            df_bench['close'] = df_bench['close'].astype(float)
            df_bench['benchmark_return'] = df_bench['close'].pct_change().fillna(0)
            
            # Align dataframes
            df_combined = df_port.join(df_bench, how='inner')
            
            if not df_combined.empty:
                # Cumulative Returns for Chart
                # Normalize to start at 0%
                initial_port_val = float(df_combined['total_value'].iloc[0])
                initial_bench_val = float(df_combined['close'].iloc[0])
                
                if initial_port_val == 0:
                     df_combined['port_cum_return'] = 0.0
                else:
                    df_combined['port_cum_return'] = ((df_combined['total_value'].astype(float) - initial_port_val) / initial_port_val) * 100
                
                if initial_bench_val == 0:
                    df_combined['bench_cum_return'] = 0.0
                else:
                    df_combined['bench_cum_return'] = ((df_combined['close'] - initial_bench_val) / initial_bench_val) * 100
                
                # Metrics Calculation
                # Beta
                covariance = np.cov(df_combined['return'], df_combined['benchmark_return'])[0][1]
                benchmark_variance = np.var(df_combined['benchmark_return'])
                beta = covariance / benchmark_variance if benchmark_variance != 0 else 0
                
                # Total Return
                total_return = df_combined['port_cum_return'].iloc[-1]
                benchmark_total_return = df_combined['bench_cum_return'].iloc[-1]
                
                # Alpha (Jensen's Alpha roughly: Rp - (Rf + B * (Rm - Rf)))
                # Assuming Risk Free Rate (Rf) = 6% annualized approx = 0.06/252 daily
                rf_daily = 0.06 / 252
                avg_port_ret = df_combined['return'].mean()
                avg_bench_ret = df_combined['benchmark_return'].mean()
                
                alpha = (avg_port_ret - rf_daily) - (beta * (avg_bench_ret - rf_daily))
                alpha = alpha * 252 # Annualized
                
                # Sharpe Ratio
                sharpe = (df_combined['return'].mean() - rf_daily) / df_combined['return'].std()
                sharpe = sharpe * (252 ** 0.5) # Annualized
                
                # Max Drawdown
                roll_max = df_port['total_value'].cummax()
                drawdown = (df_port['total_value'] - roll_max) / roll_max
                max_drawdown = drawdown.min() * 100
                
                metrics = {
                    "alpha": round(alpha, 4),
                    "beta": round(beta, 4),
                    "sharpe_ratio": round(sharpe, 4),
                    "total_return": round(total_return, 2),
                    "max_drawdown": round(max_drawdown, 2),
                    "benchmark_return": round(benchmark_total_return, 2)
                }
                
                # Prepare Chart Data
                # [{date, portfolio_value, benchmark_value, portfolio_pct, benchmark_pct}]
                for index, row in df_combined.iterrows():
                    chart_data.append({
                        "date": index.strftime('%Y-%m-%d'),
                        "portfolio_value": row['total_value'],
                        "benchmark_value": row['close'],
                        "portfolio_pct": row['port_cum_return'],
                        "benchmark_pct": row['bench_cum_return']
                    })
            else:
                # No overlapping dates
                 return Response({"error": "Insufficient overlapping data with benchmark"}, status=200)

        else:
             # Fallback if no NEPSE data (just show portfolio growth)
             initial_val = float(df_port['total_value'].iloc[0])
             
             if initial_val == 0:
                 df_port['port_cum_return'] = 0.0
             else:
                 df_port['port_cum_return'] = ((df_port['total_value'].astype(float) - initial_val) / initial_val) * 100
             
             # Max Drawdown
             roll_max = df_port['total_value'].cummax()
             drawdown = (df_port['total_value'] - roll_max) / roll_max
             max_drawdown = drawdown.min() * 100
             
             metrics["max_drawdown"] = round(max_drawdown, 2)
             metrics["total_return"] = round(df_port['port_cum_return'].iloc[-1], 2)
             
             for index, row in df_port.iterrows():
                chart_data.append({
                    "date": index.strftime('%Y-%m-%d'),
                    "portfolio_value": row['total_value'],
                    "benchmark_value": None,
                    "portfolio_pct": row['port_cum_return'],
                    "benchmark_pct": None
                })
        
        return Response({
            "metrics": metrics,
            "chart_data": chart_data,
            "period": period,
            "has_benchmark": has_benchmark
        })
