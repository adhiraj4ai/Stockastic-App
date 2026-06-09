from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from decimal import Decimal, InvalidOperation
from django.db import transaction
from django.db.models import Q, Max, Sum
from django.utils import timezone
from datetime import timedelta, date
import pandas as pd
import numpy as np

from ..models import (
    PortfolioAccount, PortfolioItem, PortfolioTransaction, PortfolioSnapshot,
    DailyStockPrice, Company, FinancialReport, TransactionType, PortfolioTarget,
    TradePlan, TradePlanLeg,
)
from ..serializers import (
    PortfolioAccountSerializer, PortfolioItemSerializer, PortfolioTransactionSerializer,
    PortfolioTargetSerializer, TradePlanSerializer,
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

    @action(detail=True, methods=['post'])
    def reset(self, request, pk=None):
        account = self.get_object()
        if account.account_type != 'PAPER':
            return Response({"error": "Only paper trading accounts can be reset."}, status=status.HTTP_400_BAD_REQUEST)
        
        starting_balance = request.data.get('starting_balance', 1000000)
        
        # Delete items and transactions
        PortfolioTransaction.objects.filter(account=account).delete()
        PortfolioItem.objects.filter(account=account).delete()
        
        account.balance = Decimal(starting_balance)
        account.save()
        return Response({"message": "Account reset successfully.", "balance": account.balance})
        
    @action(detail=False, methods=['get'])
    def leaderboard(self, request):
        paper_accounts = PortfolioAccount.objects.filter(account_type='PAPER')
        leaderboard_data = []
        
        for acc in paper_accounts:
            items = PortfolioItem.objects.filter(account=acc)
            tickers = [item.ticker for item in items]
            latest_prices = {}
            if tickers:
                prices = DailyStockPrice.objects.filter(ticker__in=tickers).order_by('ticker', '-date').distinct('ticker')
                latest_prices = {p.ticker: p.close for p in prices}
                
            positions_value = Decimal('0.00')
            for item in items:
                current_price = Decimal(latest_prices.get(item.ticker, item.buy_price))
                positions_value += Decimal(item.quantity) * current_price
                
            total_value = acc.balance + positions_value
            # Assumes 1000000 as default starting balance if we calculate ROI
            # Using total_value directly for ranking
            leaderboard_data.append({
                "account_id": acc.id,
                "account_name": acc.name,
                "user": acc.user.username,
                "balance": acc.balance,
                "positions_value": positions_value,
                "total_value": total_value,
                "roi_percentage": ((total_value - Decimal(1000000)) / Decimal(1000000)) * 100
            })
            
        leaderboard_data.sort(key=lambda x: x['total_value'], reverse=True)
        return Response(leaderboard_data)

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
    def historical_performance(self, request):
        """
        Fetch historical portfolio snapshots for charting.
        Query Params:
        - account: account_id or 'all' (default: 'all')
        - period: '1M', '3M', '6M', '1Y', 'ALL' (default: '1M')
        """
        user = request.user
        account_id = request.query_params.get('account', 'all')
        period = request.query_params.get('period', '1M')
        
        # Calculate start date based on period
        today = timezone.now().date()
        if period == '1M':
            start_date = today - timedelta(days=30)
        elif period == '3M':
            start_date = today - timedelta(days=90)
        elif period == '6M':
            start_date = today - timedelta(days=180)
        elif period == '1Y':
            start_date = today - timedelta(days=365)
        else:
            start_date = date(2000, 1, 1) # All time
            
        snapshots = PortfolioSnapshot.objects.filter(
            user=user,
            date__gte=start_date
        ).order_by('date')
        
        if account_id != 'all':
            snapshots = snapshots.filter(account_id=account_id)
        
        # Aggregate if 'all' - multiple snapshots for the same date might exist if multiple accounts
        if account_id == 'all':
            # This is slightly complex in Django ORM, might need manual aggregation
            # Group by date and sum
            snapshot_data = snapshots.values('date').annotate(
                total_value=Sum('total_value'),
                invested_value=Sum('invested_value'),
                cash_balance=Sum('cash_balance'),
                nepse_index=Max('nepse_index') # NEPSE is same for all accounts on same date
            ).order_by('date')
        else:
            snapshot_data = snapshots.values(
                'date', 'total_value', 'invested_value', 'cash_balance', 'nepse_index'
            )
            
        return Response(list(snapshot_data))

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

    @action(detail=False, methods=['get'])
    def rebalancing_metrics(self, request):
        """
        Calculate allocation weights by Sector and Tag, 
        and compare against user-defined targets.
        """
        user = request.user
        account_id = request.query_params.get('account', 'all')
        
        # 1. Get current holdings
        queryset = PortfolioItem.objects.filter(user=user)
        if account_id and account_id != 'all':
            queryset = queryset.filter(account_id=account_id)
            
        items_data = PortfolioService.get_portfolio_metrics(queryset)
        if not items_data:
            return Response({
                'total_value': 0,
                'sector_metrics': [],
                'tag_metrics': []
            }, status=200)
            
        total_value = sum(Decimal(str(item.current_value)) for item in items_data)
        if total_value == 0:
             return Response({
                'total_value': 0,
                'sector_metrics': [],
                'tag_metrics': []
            }, status=200)

        # 2. Group by Sector
        sector_allocations = {}
        for item in items_data:
            sector = item.sector or 'Other'
            if sector not in sector_allocations:
                sector_allocations[sector] = Decimal('0.00')
            sector_allocations[sector] += Decimal(str(item.current_value))
            
        # 3. Group by Tag
        tag_allocations = {}
        for item in items_data:
            tags = item.tags or []
            if not tags:
                if 'Untagged' not in tag_allocations:
                    tag_allocations['Untagged'] = Decimal('0.00')
                tag_allocations['Untagged'] += Decimal(str(item.current_value))
            for tag in tags:
                if tag not in tag_allocations:
                    tag_allocations[tag] = Decimal('0.00')
                tag_allocations[tag] += Decimal(str(item.current_value))
        
        # 4. Fetch Targets
        target_qs = PortfolioTarget.objects.filter(user=user)
        if account_id and account_id != 'all':
            target_qs = target_qs.filter(Q(account_id=account_id) | Q(account__isnull=True))
            
        targets = {
            'SECTOR': {t.category_name: float(t.target_percentage) for t in target_qs.filter(target_type='SECTOR')},
            'TAG': {t.category_name: float(t.target_percentage) for t in target_qs.filter(target_type='TAG')}
        }
        
        # 5. Build Result
        def build_metrics(allocations, target_dict):
            results = []
            categories_seen = set()
            
            for category, value in allocations.items():
                categories_seen.add(category)
                current_pct = (float(value) / float(total_value)) * 100
                target_pct = target_dict.get(category, 0)
                deviation = current_pct - target_pct if target_pct > 0 else 0
                
                results.append({
                    'category': category,
                    'current_value': float(value),
                    'current_percentage': round(current_pct, 2),
                    'target_percentage': target_pct,
                    'deviation_percentage': round(deviation, 2),
                    'recommended_action': "TRIM" if deviation > 5 else ("INCREASE" if deviation < -5 and target_pct > 0 else "HOLD")
                })
            
            # Add targets that have no current allocation
            for category, target_pct in target_dict.items():
                if category not in categories_seen:
                    results.append({
                        'category': category,
                        'current_value': 0,
                        'current_percentage': 0,
                        'target_percentage': target_pct,
                        'deviation_percentage': -target_pct,
                        'recommended_action': "INCREASE"
                    })
            
            results.sort(key=lambda x: x['current_percentage'], reverse=True)
            return results

        return Response({
            'total_value': float(total_value),
            'sector_metrics': build_metrics(sector_allocations, targets['SECTOR']),
            'tag_metrics': build_metrics(tag_allocations, targets['TAG']),
        })

    @action(detail=False, methods=['get'])
    def rebalance_suggestions(self, request):
        """
        Suggest buy/sell quantities for individual tickers to match target_allocation_pct.
        """
        user = request.user
        account_id = request.query_params.get('account', 'all')
        
        queryset = PortfolioItem.objects.filter(user=user)
        if account_id and account_id != 'all':
            queryset = queryset.filter(account_id=account_id)
            
        items_data = PortfolioService.get_portfolio_metrics(queryset)
        if not items_data:
            return Response({'total_value': 0, 'suggestions': []}, status=200)
            
        total_value = sum(Decimal(str(item.current_value)) for item in items_data)
        if total_value == 0:
             return Response({'total_value': 0, 'suggestions': []}, status=200)

        suggestions = []
        for item in items_data:
            # We need to fetch the original model object to get target_allocation_pct
            # or handle it in PortfolioService.get_portfolio_metrics.
            # For simplicity, we'll fetch from DB here or assume it's in the serializer data if we used it.
            try:
                orig_item = PortfolioItem.objects.get(id=item.id)
                target_pct = float(orig_item.target_allocation_pct or 0)
            except PortfolioItem.DoesNotExist:
                target_pct = 0

            if target_pct <= 0:
                continue

            current_price = float(item.current_price)
            if current_price <= 0:
                continue

            target_value = float(total_value) * (target_pct / 100.0)
            current_value = float(item.current_value)
            diff_value = target_value - current_value
            
            # Suggest quantity (discrete shares)
            diff_qty = int(diff_value / current_price)
            
            suggestions.append({
                'ticker': item.ticker,
                'current_value': current_value,
                'target_value': round(target_value, 2),
                'current_percentage': round((current_value / float(total_value)) * 100, 2),
                'target_percentage': target_pct,
                'suggested_quantity': diff_qty,
                'suggested_amount': round(diff_qty * current_price, 2),
                'action': 'BUY' if diff_qty > 0 else ('SELL' if diff_qty < 0 else 'HOLD')
            })

        return Response({
            'total_value': float(total_value),
            'suggestions': sorted(suggestions, key=lambda x: abs(x['suggested_amount']), reverse=True)
        })

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

    @action(detail=True, methods=['patch'])
    def update_tags(self, request, pk=None):
        """Quick update tags and/or thesis for a portfolio item."""
        item = self.get_object()
        tags = request.data.get('tags')
        thesis = request.data.get('thesis')
        
        if tags is not None:
            if not isinstance(tags, list):
                return Response({"error": "tags must be a list"}, status=status.HTTP_400_BAD_REQUEST)
            item.tags = tags
        
        if thesis is not None:
            item.thesis = thesis
        
        item.save()
        return Response({
            "id": item.id,
            "ticker": item.ticker,
            "tags": item.tags,
            "thesis": item.thesis
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
            elif txn_type == TransactionType.SHORT_SELL:
                 receivable = amount - commission - sebon_fee - dp_charge
            elif txn_type == TransactionType.BUY_TO_COVER:
                 receivable = amount + commission + sebon_fee + dp_charge
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

    @action(detail=False, methods=['get'])
    def tax_report(self, request):
        """
        Group realized P&L by Fiscal Year (Nepal: mid-July to mid-July).
        """
        user = request.user
        account_id = request.query_params.get('account', 'all')

        all_txns = PortfolioTransaction.objects.filter(
            user=user
        ).order_by('transaction_date', 'created_at')

        if account_id != 'all':
            all_txns = all_txns.filter(account_id=account_id)

        ticker_state = {} # {ticker: {qty, wacc}}
        annual_summary = {} # {FY: {realized_pnl, cgt, trades, symbols}}

        def get_fy(dt):
            # Mid July (approx July 16) is the start
            if dt.month > 7 or (dt.month == 7 and dt.day >= 16):
                return f"{dt.year}/{str(dt.year+1)[2:]}"
            return f"{dt.year-1}/{str(dt.year)[2:]}"

        for txn in all_txns:
            ticker = txn.ticker
            if ticker not in ticker_state:
                ticker_state[ticker] = {'qty': 0, 'wacc': Decimal('0.00')}

            state = ticker_state[ticker]

            if txn.transaction_type == TransactionType.BUY:
                cost = (Decimal(txn.quantity) * Decimal(txn.rate) +
                       Decimal(txn.commission) + Decimal(txn.sebon_fee) + Decimal(txn.dp_charge))
                old_val = Decimal(state['qty']) * state['wacc']
                state['qty'] += txn.quantity
                if state['qty'] > 0:
                    state['wacc'] = (old_val + cost) / Decimal(state['qty'])

            elif txn.transaction_type == TransactionType.BONUS:
                old_val = Decimal(state['qty']) * state['wacc']
                state['qty'] += txn.quantity
                if state['qty'] > 0:
                    state['wacc'] = old_val / Decimal(state['qty'])

            elif txn.transaction_type == TransactionType.SELL:
                sell_proceeds = Decimal(txn.quantity) * Decimal(txn.rate)
                cost_basis = Decimal(txn.quantity) * state['wacc']
                net_pnl = (sell_proceeds - cost_basis -
                          Decimal(txn.commission) - Decimal(txn.sebon_fee) -
                          Decimal(txn.dp_charge) - Decimal(txn.cgt))

                fy = get_fy(txn.transaction_date.date())
                if fy not in annual_summary:
                    annual_summary[fy] = {
                        'realized_pnl': Decimal('0.00'),
                        'cgt_paid': Decimal('0.00'),
                        'trades_count': 0,
                        'ticker_details': {} # {ticker: pnl}
                    }

                sum_fy = annual_summary[fy]
                sum_fy['realized_pnl'] += net_pnl
                sum_fy['cgt_paid'] += Decimal(txn.cgt)
                sum_fy['trades_count'] += 1

                if ticker not in sum_fy['ticker_details']:
                    sum_fy['ticker_details'][ticker] = Decimal('0.00')
                sum_fy['ticker_details'][ticker] += net_pnl

                state['qty'] -= txn.quantity

        # Format results
        results = []
        for fy, data in annual_summary.items():
            results.append({
                'fiscal_year': fy,
                'realized_pnl': round(float(data['realized_pnl']), 2),
                'cgt_paid': round(float(data['cgt_paid']), 2),
                'trades_count': data['trades_count'],
                'top_gainers': sorted(
                    [{'ticker': t, 'pnl': round(float(p), 2)} for t, p in data['ticker_details'].items()],
                    key=lambda x: x['pnl'], reverse=True
                )[:5]
            })

        results.sort(key=lambda x: x['fiscal_year'], reverse=True)
        return Response(results)

class PortfolioTargetViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = PortfolioTargetSerializer

    def get_queryset(self):
        if self.request.user.username == 'admin':
            return PortfolioTarget.objects.all()
        return PortfolioTarget.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

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
        
        # 3. Fetch Benchmark Data
        # We prefer using the nepse_index stored directly in snapshots for consistency
        # If snapshots have nepse_index, we use that.
        if df_port.empty:
            return Response({"error": "No portfolio history found for this period"}, status=200)
            
        # Check if we have nepse_index in any of the snapshots
        has_snapshot_bench = 'nepse_index' in df_port.columns and df_port['nepse_index'].notnull().any()
        
        if has_snapshot_bench:
            df_bench = df_port[['nepse_index']].copy().rename(columns={'nepse_index': 'close'})
            has_benchmark = True
        else:
            # Fallback: Look for 'NEPSE' ticker in DailyStockPrice if snapshot index is missing
            nepse_data = DailyStockPrice.objects.filter(
                ticker='NEPSE', 
                date__gte=start_date, 
                date__lte=end_date
            ).values('date', 'close').order_by('date')
            df_bench = pd.DataFrame(list(nepse_data))
            if not df_bench.empty:
                df_bench['date'] = pd.to_datetime(df_bench['date'])
                df_bench.set_index('date', inplace=True)
                has_benchmark = True
            else:
                has_benchmark = False
        
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


def _check_and_close_plan(plan):
    """Auto-close the plan if all legs are EXECUTED or SKIPPED."""
    if plan.status == TradePlan.PlanStatus.OPEN and plan.legs.filter(status=TradePlanLeg.LegStatus.PENDING).count() == 0:
        plan.status = TradePlan.PlanStatus.CLOSED
        plan.save()


class TradePlanViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = TradePlanSerializer
    http_method_names = ['get', 'post', 'patch', 'delete', 'head', 'options']

    def get_queryset(self):
        qs = TradePlan.objects.filter(user=self.request.user).prefetch_related('legs')
        status_param = self.request.query_params.get('status')
        if status_param:
            qs = qs.filter(status=status_param)
        return qs

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    def perform_destroy(self, instance):
        instance.status = TradePlan.PlanStatus.CANCELLED
        instance.save()

    @action(detail=True, methods=['post'])
    def execute_leg(self, request, pk=None):
        plan = self.get_object()
        if plan.status != TradePlan.PlanStatus.OPEN:
            return Response(
                {'error': 'Can only execute legs on an OPEN plan.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        leg_id = request.data.get('leg_id')
        rate = request.data.get('rate')
        quantity = request.data.get('quantity')

        if leg_id is None or rate is None or quantity is None:
            return Response(
                {'error': 'leg_id, rate, and quantity are required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            leg = plan.legs.get(id=leg_id)
        except TradePlanLeg.DoesNotExist:
            return Response({'error': 'Leg not found on this plan.'}, status=status.HTTP_404_NOT_FOUND)

        if leg.status != TradePlanLeg.LegStatus.PENDING:
            return Response(
                {'error': f'Leg is already {leg.status}.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            with transaction.atomic():
                metrics = PortfolioService.process_transaction(
                    user=request.user,
                    ticker=plan.ticker,
                    txn_type=TransactionType.BUY,
                    quantity=int(quantity),
                    rate=Decimal(str(rate)),
                    account=plan.account,
                )
                txn = PortfolioTransaction.objects.create(
                    user=request.user,
                    account=plan.account,
                    ticker=plan.ticker,
                    transaction_type=TransactionType.BUY,
                    quantity=int(quantity),
                    rate=Decimal(str(rate)),
                    transaction_date=timezone.now(),
                    amount=metrics['amount'],
                    commission=metrics['commission'],
                    sebon_fee=metrics['sebon_fee'],
                    dp_charge=metrics['dp_charge'],
                    cgt=metrics['cgt'],
                    receivable_amount=metrics['receivable_amount'],
                )
                leg.transaction = txn
                leg.status = TradePlanLeg.LegStatus.EXECUTED
                leg.save()
        except (ValueError, InvalidOperation) as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

        _check_and_close_plan(plan)

        rate_deviation = abs(float(rate) - float(leg.price_target)) / float(leg.price_target)
        plan.refresh_from_db()
        response_data = self.get_serializer(plan).data
        if rate_deviation > 0.10:
            response_data['rate_deviation_warning'] = True
        return Response(response_data)

    @action(detail=True, methods=['post'])
    def skip_leg(self, request, pk=None):
        plan = self.get_object()
        if plan.status != TradePlan.PlanStatus.OPEN:
            return Response(
                {'error': 'Can only skip legs on an OPEN plan.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        leg_id = request.data.get('leg_id')
        if not leg_id:
            return Response({'error': 'leg_id is required.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            leg = plan.legs.get(id=leg_id)
        except TradePlanLeg.DoesNotExist:
            return Response({'error': 'Leg not found on this plan.'}, status=status.HTTP_404_NOT_FOUND)

        if leg.status != TradePlanLeg.LegStatus.PENDING:
            return Response(
                {'error': f'Leg is already {leg.status}.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        leg.status = TradePlanLeg.LegStatus.SKIPPED
        leg.save()

        _check_and_close_plan(plan)

        plan.refresh_from_db()
        return Response(self.get_serializer(plan).data)
