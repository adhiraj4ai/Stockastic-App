from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django.db.models import Sum
from django.utils import timezone
from collections import defaultdict

from ...models import (
    PortfolioSnapshot, PortfolioTransaction, TransactionType,
)
from ...services.portfolio_metrics_service import (
    build_chart_data_with_benchmark,
    build_chart_data_without_benchmark,
    compute_drawdown,
    compute_risk_metrics,
    fetch_benchmark_df,
    fetch_portfolio_df,
    join_with_benchmark,
    resolve_date_range,
    round_metrics,
    scrub_nan,
)


class PortfolioPerformanceView(viewsets.ViewSet):
    """API endpoint for benchmarking portfolio performance against NEPSE."""

    permission_classes = [IsAuthenticated]

    @action(detail=False, methods=['get'])
    def metrics(self, request):
        period = request.query_params.get('period', '1Y')
        account_id = request.query_params.get('account', 'all')
        start_date, end_date = resolve_date_range(request.user, period)
        df_port = fetch_portfolio_df(request.user, start_date, end_date, account_id)
        if df_port is None:
            return Response({"error": "No portfolio history found for this period"}, status=200)
        df_bench, has_benchmark = fetch_benchmark_df(df_port, start_date, end_date)
        metrics_dict = self._compute_metrics(df_port, df_bench, has_benchmark)
        chart_data = self._compute_chart_data(df_port, df_bench, has_benchmark)
        metrics_dict, chart_data = scrub_nan(metrics_dict, chart_data)
        return Response({"metrics": metrics_dict, "chart_data": chart_data,
                         "period": period, "has_benchmark": has_benchmark})

    def _compute_metrics(self, df_port, df_bench, has_benchmark):
        empty = {"alpha": 0, "beta": 0, "sharpe_ratio": 0, "total_return": 0,
                 "max_drawdown": 0, "benchmark_return": 0}
        if not has_benchmark:
            return empty
        df_combined = join_with_benchmark(df_port, df_bench)
        if df_combined is None:
            return empty
        risk = compute_risk_metrics(df_combined)
        _, returns = build_chart_data_with_benchmark(df_combined)
        result = {**risk, **returns, "max_drawdown": compute_drawdown(df_port)}
        return round_metrics(result)

    def _compute_chart_data(self, df_port, df_bench, has_benchmark):
        if has_benchmark:
            df_combined = join_with_benchmark(df_port, df_bench)
            if df_combined is not None:
                chart_data, _ = build_chart_data_with_benchmark(df_combined)
                return chart_data
        chart_data, _ = build_chart_data_without_benchmark(df_port)
        return chart_data

    @action(detail=False, methods=['get'])
    def twr_xirr(self, request):
        """Time-weighted return (TWR) and money-weighted return (XIRR)."""
        from ...services.finance import xirr as _xirr, time_weighted_return as _twr
        user = request.user
        account_id = request.query_params.get('account', 'all')
        snapshot_rows = self._fetch_snapshot_rows(user, account_id)
        flow_by_date, xirr_flows = self._build_flows(user, account_id)
        twr_result = self._compute_twr(snapshot_rows, flow_by_date, _twr)
        xirr_result = self._compute_xirr(snapshot_rows, xirr_flows, _xirr)
        return Response({"twr_pct": twr_result, "xirr_pct": xirr_result})

    def _fetch_snapshot_rows(self, user, account_id):
        qs = PortfolioSnapshot.objects.filter(user=user).order_by('date')
        if account_id != 'all':
            qs = qs.filter(account_id=account_id)
        if account_id == 'all':
            return list(qs.values('date').annotate(total_value=Sum('total_value')).order_by('date'))
        return list(qs.values('date', 'total_value').order_by('date'))

    def _build_flows(self, user, account_id):
        qs = PortfolioTransaction.objects.filter(user=user).order_by('transaction_date')
        if account_id != 'all':
            qs = qs.filter(account_id=account_id)
        flow_by_date = defaultdict(float)
        xirr_flows = []
        for txn in qs:
            self._process_txn_flow(txn, flow_by_date, xirr_flows)
        return flow_by_date, xirr_flows

    def _process_txn_flow(self, txn, flow_by_date, xirr_flows):
        d = txn.transaction_date.date() if hasattr(txn.transaction_date, 'date') else txn.transaction_date
        txn_type = txn.transaction_type
        amount = float(txn.amount)
        receivable = float(txn.receivable_amount)
        if txn_type in (TransactionType.BUY, TransactionType.RIGHTS):
            flow_by_date[d] += amount
            xirr_flows.append((d, -amount))
        elif txn_type == TransactionType.SELL:
            flow_by_date[d] -= receivable
            xirr_flows.append((d, receivable))
        elif txn_type == TransactionType.DIVIDEND:
            flow_by_date[d] -= amount
            xirr_flows.append((d, amount))

    def _compute_twr(self, snapshot_rows, flow_by_date, twr_fn):
        if len(snapshot_rows) < 2:
            return None
        twr_points = [
            (row['date'], float(row['total_value']), flow_by_date.get(row['date'], 0.0))
            for row in snapshot_rows
        ]
        raw = twr_fn(twr_points)
        return round(raw * 100, 4) if raw is not None else None

    def _compute_xirr(self, snapshot_rows, xirr_flows, xirr_fn):
        if not xirr_flows or not snapshot_rows:
            return None
        today = timezone.now().date()
        latest_val = float(snapshot_rows[-1]['total_value'])
        flows = list(xirr_flows) + [(today, latest_val)]
        raw = xirr_fn(flows)
        return round(raw * 100, 4) if raw is not None else None
