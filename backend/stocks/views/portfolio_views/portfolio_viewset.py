from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from decimal import Decimal
from django.db.models import Q, Max, Sum
from django.utils import timezone
from datetime import timedelta, date
import pandas as pd

from ...models import (
    PortfolioAccount, PortfolioItem, PortfolioTransaction, PortfolioSnapshot,
    DailyStockPrice, FinancialReport, PortfolioTarget,
)
from ...serializers import PortfolioItemSerializer, PortfolioTransactionSerializer
from ...services.portfolio_service import PortfolioService
from ...optimization import perform_portfolio_optimization


_PERIOD_DAYS = {'1M': 30, '3M': 90, '6M': 180, '1Y': 365}


class PortfolioViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = PortfolioItemSerializer

    def get_queryset(self):
        user = self.request.user
        queryset = (
            PortfolioItem.objects.all()
            if user.username == 'admin'
            else PortfolioItem.objects.filter(user=user)
        )
        account_id = self.request.query_params.get('account')
        if account_id:
            queryset = queryset.filter(account_id=account_id)
        return queryset

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    def list(self, request, *args, **kwargs):
        data = PortfolioService.get_portfolio_metrics(self.get_queryset())
        serializer = self.get_serializer(data, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def historical_performance(self, request):
        user = request.user
        account_id = request.query_params.get('account', 'all')
        period = request.query_params.get('period', '1M')
        start_date = self._resolve_start_date(period)
        snapshots = PortfolioSnapshot.objects.filter(
            user=user, date__gte=start_date
        ).order_by('date')
        if account_id != 'all':
            snapshots = snapshots.filter(account_id=account_id)
        snapshot_data = self._aggregate_snapshots(snapshots, account_id)
        return Response(list(snapshot_data))

    def _resolve_start_date(self, period):
        today = timezone.now().date()
        days = _PERIOD_DAYS.get(period)
        return today - timedelta(days=days) if days else date(2000, 1, 1)

    def _aggregate_snapshots(self, snapshots, account_id):
        if account_id == 'all':
            return snapshots.values('date').annotate(
                total_value=Sum('total_value'),
                invested_value=Sum('invested_value'),
                cash_balance=Sum('cash_balance'),
                nepse_index=Max('nepse_index'),
            ).order_by('date')
        return snapshots.values('date', 'total_value', 'invested_value', 'cash_balance', 'nepse_index')

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
        current_holdings = self._build_current_holdings(queryset)
        result = perform_portfolio_optimization(tickers, current_holdings=current_holdings, method=method)
        if not result.get("success"):
            return Response(result, status=status.HTTP_400_BAD_REQUEST)
        return Response(result)

    def _build_current_holdings(self, queryset):
        holdings = {}
        for item in queryset:
            ticker = item.ticker
            if ticker not in holdings:
                price_obj = DailyStockPrice.objects.filter(ticker=ticker).order_by('-date').first()
                holdings[ticker] = {'quantity': 0, 'price': float(price_obj.close) if price_obj else 0}
            holdings[ticker]['quantity'] += float(item.quantity)
        return holdings

    @action(detail=False, methods=['get'])
    def rebalancing_metrics(self, request):
        user = request.user
        account_id = request.query_params.get('account', 'all')
        items_data, total_value = self._load_items_and_total(user, account_id)
        if total_value == 0:
            return Response({'total_value': 0, 'sector_metrics': [], 'tag_metrics': []})
        sector_allocations = self._group_by_sector(items_data)
        tag_allocations = self._group_by_tag(items_data)
        targets = self._fetch_targets(user, account_id)
        return Response({
            'total_value': float(total_value),
            'sector_metrics': self._build_metrics(sector_allocations, targets['SECTOR'], total_value),
            'tag_metrics': self._build_metrics(tag_allocations, targets['TAG'], total_value),
        })

    def _load_items_and_total(self, user, account_id):
        queryset = PortfolioItem.objects.filter(user=user)
        if account_id and account_id != 'all':
            queryset = queryset.filter(account_id=account_id)
        items_data = PortfolioService.get_portfolio_metrics(queryset)
        if not items_data:
            return [], 0
        total = sum(Decimal(str(item.current_value)) for item in items_data)
        return items_data, total

    def _group_by_sector(self, items_data):
        allocations = {}
        for item in items_data:
            sector = item.sector or 'Other'
            allocations[sector] = allocations.get(sector, Decimal('0.00')) + Decimal(str(item.current_value))
        return allocations

    def _group_by_tag(self, items_data):
        allocations = {}
        for item in items_data:
            tags = item.tags or []
            if not tags:
                allocations['Untagged'] = allocations.get('Untagged', Decimal('0.00')) + Decimal(str(item.current_value))
            for tag in tags:
                allocations[tag] = allocations.get(tag, Decimal('0.00')) + Decimal(str(item.current_value))
        return allocations

    def _fetch_targets(self, user, account_id):
        qs = PortfolioTarget.objects.filter(user=user)
        if account_id and account_id != 'all':
            qs = qs.filter(Q(account_id=account_id) | Q(account__isnull=True))
        return {
            'SECTOR': {t.category_name: float(t.target_percentage) for t in qs.filter(target_type='SECTOR')},
            'TAG': {t.category_name: float(t.target_percentage) for t in qs.filter(target_type='TAG')},
        }

    def _build_metrics(self, allocations, target_dict, total_value):
        results = []
        seen = set()
        for category, value in allocations.items():
            seen.add(category)
            results.append(self._make_metric_entry(category, value, total_value, target_dict))
        for category, target_pct in target_dict.items():
            if category not in seen:
                results.append({
                    'category': category, 'current_value': 0, 'current_percentage': 0,
                    'target_percentage': target_pct, 'deviation_percentage': -target_pct,
                    'recommended_action': 'INCREASE',
                })
        results.sort(key=lambda x: x['current_percentage'], reverse=True)
        return results

    def _make_metric_entry(self, category, value, total_value, target_dict):
        current_pct = (float(value) / float(total_value)) * 100
        target_pct = target_dict.get(category, 0)
        deviation = current_pct - target_pct if target_pct > 0 else 0
        action = "TRIM" if deviation > 5 else ("INCREASE" if deviation < -5 and target_pct > 0 else "HOLD")
        return {
            'category': category, 'current_value': float(value),
            'current_percentage': round(current_pct, 2), 'target_percentage': target_pct,
            'deviation_percentage': round(deviation, 2), 'recommended_action': action,
        }

    @action(detail=False, methods=['get'])
    def rebalance_suggestions(self, request):
        user = request.user
        account_id = request.query_params.get('account', 'all')
        items_data, total_value = self._load_items_and_total(user, account_id)
        if total_value == 0:
            return Response({'total_value': 0, 'suggestions': []})
        suggestions = self._compute_suggestions(items_data, total_value)
        return Response({
            'total_value': float(total_value),
            'suggestions': sorted(suggestions, key=lambda x: abs(x['suggested_amount']), reverse=True),
        })

    def _compute_suggestions(self, items_data, total_value):
        suggestions = []
        for item in items_data:
            suggestion = self._compute_single_suggestion(item, total_value)
            if suggestion:
                suggestions.append(suggestion)
        return suggestions

    def _compute_single_suggestion(self, item, total_value):
        try:
            orig = PortfolioItem.objects.get(id=item.id)
            target_pct = float(orig.target_allocation_pct or 0)
        except PortfolioItem.DoesNotExist:
            return None
        if target_pct <= 0:
            return None
        current_price = float(item.current_price)
        if current_price <= 0:
            return None
        target_value = float(total_value) * (target_pct / 100.0)
        current_value = float(item.current_value)
        diff_qty = int((target_value - current_value) / current_price)
        return {
            'ticker': item.ticker,
            'current_value': current_value,
            'target_value': round(target_value, 2),
            'current_percentage': round((current_value / float(total_value)) * 100, 2),
            'target_percentage': target_pct,
            'suggested_quantity': diff_qty,
            'suggested_amount': round(diff_qty * current_price, 2),
            'action': 'BUY' if diff_qty > 0 else ('SELL' if diff_qty < 0 else 'HOLD'),
        }

    @action(detail=False, methods=['post'])
    def calculate_position_size(self, request):
        from ...services.position_sizing import PositionSizingService
        user = request.user
        entry_price = request.data.get('entry_price')
        stop_loss_price = request.data.get('stop_loss_price')
        if entry_price is None:
            return Response({"error": "entry_price is required"}, status=status.HTTP_400_BAD_REQUEST)
        if stop_loss_price is None:
            return Response({"error": "stop_loss_price is required"}, status=status.HTTP_400_BAD_REQUEST)
        account_id = request.data.get('account_id', 'all')
        risk_percentage = request.data.get('risk_percentage')
        target_price = request.data.get('target_price')
        account_balance, default_risk, error_response = self._resolve_account_balance(user, account_id)
        if error_response:
            return error_response
        if risk_percentage is None:
            risk_percentage = default_risk
        if account_balance <= 0:
            account_balance = 100000
        try:
            result = PositionSizingService.calculate_position_size(
                account_balance=account_balance,
                risk_percentage=float(risk_percentage),
                entry_price=float(entry_price),
                stop_loss_price=float(stop_loss_price),
                target_price=float(target_price) if target_price else None,
            )
            return Response(result, status=status.HTTP_200_OK)
        except ValueError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

    def _resolve_account_balance(self, user, account_id):
        if account_id == 'all':
            return self._resolve_all_accounts_balance(user)
        return self._resolve_single_account_balance(user, account_id)

    def _resolve_all_accounts_balance(self, user):
        queryset = PortfolioItem.objects.filter(user=user)
        total_value = sum(float(item.current_price) * item.quantity for item in queryset)
        accounts = PortfolioAccount.objects.filter(user=user)
        total_cash = sum(float(acc.balance) for acc in accounts)
        default_risk = float(accounts.first().default_risk_percentage) if accounts.exists() else 2.0
        return total_value + total_cash, default_risk, None

    def _resolve_single_account_balance(self, user, account_id):
        try:
            account = PortfolioAccount.objects.get(id=account_id, user=user)
            queryset = PortfolioItem.objects.filter(user=user, account=account)
            holdings_value = sum(float(item.current_price) * item.quantity for item in queryset)
            balance = holdings_value + float(account.balance)
            return balance, float(account.default_risk_percentage), None
        except PortfolioAccount.DoesNotExist:
            return 0, 0, Response({"error": "Account not found"}, status=status.HTTP_404_NOT_FOUND)

    @action(detail=True, methods=['get'])
    def suggest_exits(self, request, pk=None):
        item = self.get_object()
        ticker = item.ticker
        hist = DailyStockPrice.objects.filter(ticker=ticker).order_by('-date')[:60]
        if not hist:
            return Response({"error": "No price data found"}, status=400)
        latest_price = float(hist[0].close)
        df = pd.DataFrame(list(hist.values('date', 'high', 'low', 'close'))[::-1])
        atr = self._compute_atr(df, latest_price)
        recent = df.tail(20)
        swing_low = float(recent['low'].min())
        swing_high = float(recent['high'].max())
        wacc = float(item.wacc) if item.wacc else float(item.buy_price)
        is_underwater = latest_price < wacc
        strategies = self._build_exit_strategies(latest_price, wacc, atr, swing_low, swing_high, is_underwater)
        health_warnings = self._fetch_health_warnings(ticker)
        txns = PortfolioTransaction.objects.filter(
            user=request.user, ticker=ticker, account=item.account
        ).order_by('-transaction_date')
        return Response({
            "ticker": ticker, "current_price": latest_price, "wacc": wacc,
            "is_underwater": is_underwater, "strategies": strategies,
            "health_warnings": health_warnings,
            "transactions": PortfolioTransactionSerializer(txns, many=True).data,
        })

    def _compute_atr(self, df, latest_price):
        if len(df) > 14:
            df['tr1'] = df['high'] - df['low']
            df['tr2'] = (df['high'] - df['close'].shift(1)).abs()
            df['tr3'] = (df['low'] - df['close'].shift(1)).abs()
            df['tr'] = df[['tr1', 'tr2', 'tr3']].max(axis=1)
            atr = df['tr'].rolling(window=14).mean().iloc[-1]
            return float(atr) if not pd.isna(atr) else (latest_price * 0.02)
        return latest_price * 0.02

    def _build_exit_strategies(self, latest_price, wacc, atr, swing_low, swing_high, is_underwater):
        strategies = {
            "fixed": self._fixed_strategy(latest_price, wacc),
            "atr_conservative": self._atr_conservative_strategy(latest_price, wacc, atr),
            "atr_aggressive": self._atr_aggressive_strategy(latest_price, wacc, atr),
            "swing": self._swing_strategy(latest_price, wacc, swing_low, swing_high),
        }
        if is_underwater:
            strategies["break_even"] = self._break_even_strategy(latest_price, wacc)
        if strategies['swing']['tp'] <= latest_price * 1.02:
            strategies['swing']['tp'] = latest_price * 1.15
        return strategies

    def _fixed_strategy(self, latest_price, wacc):
        return {
            "name": "Fixed Percentage",
            "sl": latest_price * 0.95,
            "tp": wacc * 1.10, "tp2": wacc * 1.20, "tp3": wacc * 1.30,
            "desc": f"3-tier targets: 10%, 20%, 30% profit from cost (Rs. {wacc:.2f}).",
        }

    def _atr_conservative_strategy(self, latest_price, wacc, atr):
        return {
            "name": "ATR (Conservative)",
            "sl": latest_price - (2 * atr),
            "tp": max(latest_price + (3 * atr), wacc * 1.05),
            "tp2": max(latest_price + (5 * atr), wacc * 1.15),
            "tp3": max(latest_price + (7 * atr), wacc * 1.25),
            "desc": f"Scaling out at 3x, 5x, 7x ATR volatility (ATR: {atr:.2f}).",
        }

    def _atr_aggressive_strategy(self, latest_price, wacc, atr):
        return {
            "name": "ATR (Aggressive)",
            "sl": latest_price - (1 * atr),
            "tp": max(latest_price + (2 * atr), wacc * 1.02),
            "tp2": max(latest_price + (4 * atr), wacc * 1.05),
            "tp3": max(latest_price + (6 * atr), wacc * 1.10),
            "desc": "Momentum scaling at 2x, 4x, 6x ATR.",
        }

    def _swing_strategy(self, latest_price, wacc, swing_low, swing_high):
        return {
            "name": "Support/Resistance",
            "sl": min(swing_low * 0.99, latest_price * 0.95),
            "tp": max(swing_high * 1.01, wacc * 1.05),
            "tp2": max(swing_high * 1.15, wacc * 1.20),
            "tp3": max(swing_high * 1.30, wacc * 1.40),
            "desc": f"Recent High: {swing_high}. Targets secondary breakout levels.",
        }

    def _break_even_strategy(self, latest_price, wacc):
        return {
            "name": "Break Even Recovery",
            "sl": latest_price * 0.96,
            "tp": wacc * 1.02, "tp2": wacc * 1.07, "tp3": wacc * 1.15,
            "desc": "Recovery scaling: Break-even, +7%, and +15% from cost.",
        }

    def _fetch_health_warnings(self, ticker):
        warnings = []
        try:
            reports = FinancialReport.objects.filter(ticker=ticker).order_by('-fiscal_year', '-quarter')[:4]
            if len(reports) >= 2:
                warnings.extend(self._check_profit_warning(reports[0], reports[1]))
                warnings.extend(self._check_revenue_warning(reports[0], reports[1]))
        except Exception as e:
            print(f"Health check error: {e}")
        return warnings

    def _check_profit_warning(self, latest_r, prev_r):
        if latest_r.net_profit and prev_r.net_profit:
            if float(latest_r.net_profit) < float(prev_r.net_profit):
                return [{"type": "PROFIT_DIP",
                         "message": f"Net Profit dropped from {float(prev_r.net_profit):,.0f} to {float(latest_r.net_profit):,.0f} in latest report.",
                         "severity": "MEDIUM"}]
        return []

    def _check_revenue_warning(self, latest_r, prev_r):
        if latest_r.revenue and prev_r.revenue:
            if float(latest_r.revenue) < float(prev_r.revenue):
                pct = (1 - float(latest_r.revenue) / float(prev_r.revenue)) * 100
                return [{"type": "REVENUE_DIP",
                         "message": f"Revenue declined by {pct:.1f}% in latest period.",
                         "severity": "LOW"}]
        return []

    @action(detail=True, methods=['patch'])
    def update_tags(self, request, pk=None):
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
        return Response({"id": item.id, "ticker": item.ticker, "tags": item.tags, "thesis": item.thesis})

    @action(detail=True, methods=['patch'])
    def update_classification(self, request, pk=None):
        item = self.get_object()
        value = request.data.get('classification')
        if value not in PortfolioItem.Classification.values:
            return Response(
                {"error": "classification must be 'investment' or 'trading'"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        item.classification = value
        item.save(update_fields=['classification'])
        return Response({"id": item.id, "ticker": item.ticker, "classification": item.classification})
