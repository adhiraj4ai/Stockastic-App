import math
from datetime import date, timedelta
from decimal import Decimal
from unittest.mock import MagicMock, patch

import numpy as np
import pandas as pd
import pytest


class TestResolveDateRange:
    def _call(self, period):
        from stocks.services.portfolio_metrics_service import resolve_date_range
        return resolve_date_range(MagicMock(), period)

    def test_1m_span_is_30_days(self):
        start, end = self._call("1M")
        assert (end - start).days == 30

    def test_3m_span_is_90_days(self):
        start, end = self._call("3M")
        assert (end - start).days == 90

    def test_6m_span_is_180_days(self):
        start, end = self._call("6M")
        assert (end - start).days == 180

    def test_1y_span_is_365_days(self):
        start, end = self._call("1Y")
        assert (end - start).days == 365

    def test_ytd_starts_on_jan_1(self):
        start, end = self._call("YTD")
        assert start.month == 1 and start.day == 1
        assert start.year == end.year

    def test_unknown_period_falls_back_to_365_days(self):
        start, end = self._call("BOGUS")
        assert (end - start).days == 365

    @pytest.mark.django_db
    def test_all_uses_first_transaction_date(self):
        from stocks.services.portfolio_metrics_service import resolve_date_range
        txn = MagicMock()
        txn.transaction_date.date.return_value = date(2022, 1, 15)
        mock_qs = MagicMock()
        mock_qs.order_by.return_value.first.return_value = txn
        with patch("stocks.services.portfolio_metrics_service.PortfolioTransaction") as MockTxn:
            MockTxn.objects.filter.return_value = mock_qs
            start, end = resolve_date_range(MagicMock(), "ALL")
        assert start == date(2022, 1, 15)

    @pytest.mark.django_db
    def test_all_falls_back_to_365_days_when_no_transactions(self):
        from stocks.services.portfolio_metrics_service import resolve_date_range
        mock_qs = MagicMock()
        mock_qs.order_by.return_value.first.return_value = None
        with patch("stocks.services.portfolio_metrics_service.PortfolioTransaction") as MockTxn:
            MockTxn.objects.filter.return_value = mock_qs
            start, end = resolve_date_range(MagicMock(), "ALL")
        assert (end - start).days == 365


class TestFetchPortfolioDf:
    def _make_snapshot_row(self, days_offset, total_value):
        return {
            "date": date(2024, 1, 1) + timedelta(days=days_offset),
            "total_value": total_value,
            "invested_value": total_value * 0.9,
            "cash_balance": total_value * 0.1,
        }

    @pytest.mark.django_db
    def test_returns_none_when_no_snapshots(self):
        from stocks.services.portfolio_metrics_service import fetch_portfolio_df
        with patch("stocks.services.portfolio_metrics_service.PortfolioSnapshot") as MockSnap:
            inner = MagicMock()
            inner.annotate.return_value.order_by.return_value = []
            snap_filter = MagicMock()
            snap_filter.values.return_value = inner
            MockSnap.objects.filter.return_value = snap_filter
            result = fetch_portfolio_df(MagicMock(), date(2024, 1, 1), date(2024, 12, 31), "all")
        assert result is None

    @pytest.mark.django_db
    def test_returns_dataframe_with_return_column(self):
        from stocks.services.portfolio_metrics_service import fetch_portfolio_df
        rows = [self._make_snapshot_row(i, 100_000 + i * 1000) for i in range(3)]
        with patch("stocks.services.portfolio_metrics_service.PortfolioSnapshot") as MockSnap:
            inner = MagicMock()
            inner.annotate.return_value.order_by.return_value = rows
            snap_filter = MagicMock()
            snap_filter.values.return_value = inner
            MockSnap.objects.filter.return_value = snap_filter
            df = fetch_portfolio_df(MagicMock(), date(2024, 1, 1), date(2024, 12, 31), "all")
        assert df is not None
        assert "return" in df.columns
        assert "total_value" in df.columns
        assert df.index.name == "date"


class TestFetchBenchmarkDf:
    def test_uses_nepse_index_column_when_present(self):
        from stocks.services.portfolio_metrics_service import fetch_benchmark_df
        dates = pd.date_range("2024-01-01", periods=5)
        df_port = pd.DataFrame({"total_value": [100.0] * 5, "nepse_index": [2000.0] * 5}, index=dates)
        df_bench, has_bench = fetch_benchmark_df(df_port, date(2024, 1, 1), date(2024, 1, 5))
        assert has_bench is True
        assert "close" in df_bench.columns

    def test_no_nepse_index_falls_back_to_daily_stock_price(self):
        from stocks.services.portfolio_metrics_service import fetch_benchmark_df
        dates = pd.date_range("2024-01-01", periods=3)
        df_port = pd.DataFrame({"total_value": [100.0] * 3}, index=dates)
        rows = [{"date": date(2024, 1, 1) + timedelta(days=i), "close": 2000.0 + i} for i in range(3)]
        with patch("stocks.services.portfolio_metrics_service.DailyStockPrice") as MockDSP:
            MockDSP.objects.filter.return_value.values.return_value.order_by.return_value = rows
            df_bench, has_bench = fetch_benchmark_df(df_port, date(2024, 1, 1), date(2024, 1, 3))
        assert has_bench is True
        assert "close" in df_bench.columns

    def test_returns_false_when_no_benchmark_data(self):
        from stocks.services.portfolio_metrics_service import fetch_benchmark_df
        dates = pd.date_range("2024-01-01", periods=3)
        df_port = pd.DataFrame({"total_value": [100.0] * 3}, index=dates)
        with patch("stocks.services.portfolio_metrics_service.DailyStockPrice") as MockDSP:
            MockDSP.objects.filter.return_value.values.return_value.order_by.return_value = []
            df_bench, has_bench = fetch_benchmark_df(df_port, date(2024, 1, 1), date(2024, 1, 3))
        assert has_bench is False
        assert df_bench is None


class TestComputeRiskMetrics:
    def _make_combined(self, n=100, seed=42):
        rng = np.random.default_rng(seed)
        port_ret = pd.Series(rng.normal(0.001, 0.01, n))
        bench_ret = port_ret * 0.8 + rng.normal(0, 0.005, n)
        return pd.DataFrame({"return": port_ret, "benchmark_return": bench_ret})

    def test_returns_all_three_keys(self):
        from stocks.services.portfolio_metrics_service import compute_risk_metrics
        result = compute_risk_metrics(self._make_combined())
        assert set(result.keys()) == {"beta", "alpha", "sharpe_ratio"}

    def test_beta_is_float(self):
        from stocks.services.portfolio_metrics_service import compute_risk_metrics
        assert isinstance(compute_risk_metrics(self._make_combined())["beta"], float)

    def test_alpha_is_float(self):
        from stocks.services.portfolio_metrics_service import compute_risk_metrics
        assert isinstance(compute_risk_metrics(self._make_combined())["alpha"], float)

    def test_sharpe_is_float(self):
        from stocks.services.portfolio_metrics_service import compute_risk_metrics
        assert isinstance(compute_risk_metrics(self._make_combined())["sharpe_ratio"], float)

    def test_fewer_than_min_observations_returns_zeros(self):
        from stocks.services.portfolio_metrics_service import compute_risk_metrics
        df = pd.DataFrame({"return": [0.01], "benchmark_return": [0.01]})
        result = compute_risk_metrics(df)
        assert result == {"beta": 0.0, "alpha": 0.0, "sharpe_ratio": 0.0}

    def test_perfect_correlation_beta_near_one(self):
        from stocks.services.portfolio_metrics_service import compute_risk_metrics
        ret = pd.Series([0.01, -0.005, 0.02, -0.01, 0.015] * 20)
        df = pd.DataFrame({"return": ret, "benchmark_return": ret})
        result = compute_risk_metrics(df)
        assert abs(result["beta"] - 1.0) < 0.001


class TestComputeDrawdown:
    def test_monotone_increase_yields_zero(self):
        from stocks.services.portfolio_metrics_service import compute_drawdown
        df = pd.DataFrame({"total_value": [100.0, 110.0, 120.0, 130.0]})
        assert compute_drawdown(df) == pytest.approx(0.0)

    def test_50_pct_drop_detected(self):
        from stocks.services.portfolio_metrics_service import compute_drawdown
        df = pd.DataFrame({"total_value": [100.0, 200.0, 100.0]})
        assert compute_drawdown(df) == pytest.approx(-50.0)

    def test_returns_float(self):
        from stocks.services.portfolio_metrics_service import compute_drawdown
        assert isinstance(compute_drawdown(pd.DataFrame({"total_value": [100.0, 90.0]})), float)

    def test_single_row_is_zero(self):
        from stocks.services.portfolio_metrics_service import compute_drawdown
        assert compute_drawdown(pd.DataFrame({"total_value": [500.0]})) == pytest.approx(0.0)


class TestBuildChartDataWithBenchmark:
    def _make_combined(self):
        dates = pd.date_range("2024-01-01", periods=5)
        return pd.DataFrame(
            {"total_value": [100_000.0, 101_000.0, 102_000.0, 101_500.0, 103_000.0],
             "close": [2000.0, 2010.0, 2020.0, 2015.0, 2030.0]},
            index=dates,
        )

    def test_chart_length_equals_dataframe_rows(self):
        from stocks.services.portfolio_metrics_service import build_chart_data_with_benchmark
        chart, _ = build_chart_data_with_benchmark(self._make_combined())
        assert len(chart) == 5

    def test_chart_row_has_required_keys(self):
        from stocks.services.portfolio_metrics_service import build_chart_data_with_benchmark
        chart, _ = build_chart_data_with_benchmark(self._make_combined())
        required = {"date", "portfolio_value", "benchmark_value", "portfolio_pct", "benchmark_pct"}
        assert required.issubset(chart[0].keys())

    def test_date_format_is_iso(self):
        from stocks.services.portfolio_metrics_service import build_chart_data_with_benchmark
        chart, _ = build_chart_data_with_benchmark(self._make_combined())
        assert chart[0]["date"] == "2024-01-01"

    def test_returns_dict_has_total_and_benchmark_return(self):
        from stocks.services.portfolio_metrics_service import build_chart_data_with_benchmark
        _, returns = build_chart_data_with_benchmark(self._make_combined())
        assert "total_return" in returns and "benchmark_return" in returns

    def test_first_row_pct_is_zero(self):
        from stocks.services.portfolio_metrics_service import build_chart_data_with_benchmark
        chart, _ = build_chart_data_with_benchmark(self._make_combined())
        assert chart[0]["portfolio_pct"] == pytest.approx(0.0)
        assert chart[0]["benchmark_pct"] == pytest.approx(0.0)

    def test_zero_initial_value_does_not_raise(self):
        from stocks.services.portfolio_metrics_service import build_chart_data_with_benchmark
        dates = pd.date_range("2024-01-01", periods=3)
        df = pd.DataFrame({"total_value": [0.0, 100.0, 200.0], "close": [0.0, 10.0, 20.0]}, index=dates)
        chart, _ = build_chart_data_with_benchmark(df)
        assert chart[0]["portfolio_pct"] == pytest.approx(0.0)


class TestScrubNan:
    def test_inf_in_metrics_becomes_zero(self):
        from stocks.services.portfolio_metrics_service import scrub_nan
        clean_m, _ = scrub_nan({"alpha": float("inf"), "beta": 1.0}, [])
        assert clean_m["alpha"] == 0.0
        assert clean_m["beta"] == pytest.approx(1.0)

    def test_neg_inf_in_metrics_becomes_zero(self):
        from stocks.services.portfolio_metrics_service import scrub_nan
        clean_m, _ = scrub_nan({"max_drawdown": float("-inf")}, [])
        assert clean_m["max_drawdown"] == 0.0

    def test_nan_in_chart_becomes_none(self):
        from stocks.services.portfolio_metrics_service import scrub_nan
        _, clean_c = scrub_nan({}, [{"portfolio_pct": float("nan"), "benchmark_pct": 2.0}])
        assert clean_c[0]["portfolio_pct"] is None
        assert clean_c[0]["benchmark_pct"] == pytest.approx(2.0)

    def test_finite_chart_values_unchanged(self):
        from stocks.services.portfolio_metrics_service import scrub_nan
        _, clean_c = scrub_nan({}, [{"portfolio_pct": 5.3, "benchmark_pct": 4.1}])
        assert clean_c[0]["portfolio_pct"] == pytest.approx(5.3)

    def test_non_numeric_metric_value_becomes_default(self):
        from stocks.services.portfolio_metrics_service import scrub_nan
        clean_m, _ = scrub_nan({"total_return": "N/A"}, [])
        assert clean_m["total_return"] == 0.0
