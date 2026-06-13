from __future__ import annotations

import math
from datetime import date, timedelta

import numpy as np
import pandas as pd
from django.db.models import Sum
from django.utils import timezone

from stocks.constants import (
    ANNUAL_TRADING_DAYS,
    MIN_RISK_OBSERVATIONS,
    NEPSE_TICKER,
    PERIOD_DAYS,
    RISK_FREE_RATE_ANNUAL,
)

# Lazy imports via module-level names so tests can patch them cleanly.
from stocks.models import PortfolioSnapshot, PortfolioTransaction
from stocks.models import DailyStockPrice


def resolve_date_range(user, period: str) -> tuple[date, date]:
    end = timezone.now().date()
    if period in PERIOD_DAYS:
        return end - timedelta(days=PERIOD_DAYS[period]), end
    if period == "YTD":
        return date(end.year, 1, 1), end
    if period == "ALL":
        return _start_from_first_transaction(user, end)
    return end - timedelta(days=PERIOD_DAYS["1Y"]), end


def _start_from_first_transaction(user, end: date) -> tuple[date, date]:
    first = PortfolioTransaction.objects.filter(user=user).order_by("transaction_date").first()
    start = first.transaction_date.date() if first else end - timedelta(days=PERIOD_DAYS["1Y"])
    return start, end


def fetch_portfolio_df(user, start: date, end: date, account_id: str) -> pd.DataFrame | None:
    qs = PortfolioSnapshot.objects.filter(user=user, date__gte=start, date__lte=end)
    rows = _aggregate_snapshots(qs, account_id)
    if not rows:
        return None
    df = pd.DataFrame(list(rows))
    df["date"] = pd.to_datetime(df["date"])
    df = df.set_index("date")
    df["total_value"] = df["total_value"].astype(float)
    df["return"] = df["total_value"].pct_change().fillna(0)
    return df


def _aggregate_snapshots(qs, account_id: str):
    if account_id != "all":
        return qs.filter(account_id=account_id).values(
            "date", "total_value", "invested_value", "cash_balance"
        ).order_by("date")
    return qs.values("date").annotate(
        total_value=Sum("total_value"),
        invested_value=Sum("invested_value"),
        cash_balance=Sum("cash_balance"),
    ).order_by("date")


def fetch_benchmark_df(
    df_port: pd.DataFrame, start: date, end: date
) -> tuple[pd.DataFrame | None, bool]:
    if "nepse_index" in df_port.columns and df_port["nepse_index"].notnull().any():
        return df_port[["nepse_index"]].copy().rename(columns={"nepse_index": "close"}), True
    return _fetch_nepse_from_daily_prices(start, end)


def _fetch_nepse_from_daily_prices(start: date, end: date) -> tuple[pd.DataFrame | None, bool]:
    rows = DailyStockPrice.objects.filter(
        ticker=NEPSE_TICKER, date__gte=start, date__lte=end
    ).values("date", "close").order_by("date")
    df = pd.DataFrame(list(rows))
    if df.empty:
        return None, False
    df["date"] = pd.to_datetime(df["date"])
    return df.set_index("date"), True


def compute_risk_metrics(df_combined: pd.DataFrame) -> dict:
    rf_daily = RISK_FREE_RATE_ANNUAL / ANNUAL_TRADING_DAYS
    beta = alpha = sharpe = 0.0
    if len(df_combined) >= MIN_RISK_OBSERVATIONS:
        cov = np.cov(df_combined["return"], df_combined["benchmark_return"])[0][1]
        bench_var = np.var(df_combined["benchmark_return"], ddof=1)
        beta = cov / bench_var if bench_var != 0 else 0.0
        avg_p = df_combined["return"].mean()
        avg_b = df_combined["benchmark_return"].mean()
        alpha = ((avg_p - rf_daily) - beta * (avg_b - rf_daily)) * ANNUAL_TRADING_DAYS
        std = df_combined["return"].std()
        if std and not pd.isna(std) and std != 0:
            sharpe = ((avg_p - rf_daily) / std) * (ANNUAL_TRADING_DAYS ** 0.5)
    return {"beta": float(beta), "alpha": float(alpha), "sharpe_ratio": float(sharpe)}


def compute_drawdown(df_port: pd.DataFrame) -> float:
    roll_max = df_port["total_value"].cummax()
    return float(((df_port["total_value"] - roll_max) / roll_max).min() * 100)


def build_chart_data_with_benchmark(df_combined: pd.DataFrame) -> tuple[list[dict], dict]:
    iv_p = float(df_combined["total_value"].iloc[0])
    iv_b = float(df_combined["close"].iloc[0])
    df = df_combined.copy()
    df["port_cum_return"] = 0.0 if iv_p == 0 else ((df["total_value"] - iv_p) / iv_p) * 100
    df["bench_cum_return"] = 0.0 if iv_b == 0 else ((df["close"] - iv_b) / iv_b) * 100
    chart = [
        {
            "date": idx.strftime("%Y-%m-%d"),
            "portfolio_value": row["total_value"],
            "benchmark_value": row["close"],
            "portfolio_pct": row["port_cum_return"],
            "benchmark_pct": row["bench_cum_return"],
        }
        for idx, row in df.iterrows()
    ]
    returns = {
        "total_return": float(df["port_cum_return"].iloc[-1]),
        "benchmark_return": float(df["bench_cum_return"].iloc[-1]),
    }
    return chart, returns


def scrub_nan(metrics: dict, chart_data: list[dict]) -> tuple[dict, list[dict]]:
    clean_metrics = {k: _safe_float(v) for k, v in metrics.items()}
    for row in chart_data:
        for k, v in list(row.items()):
            if isinstance(v, float) and not math.isfinite(v):
                row[k] = None
    return clean_metrics, chart_data


def _safe_float(value, default: float = 0.0) -> float:
    try:
        f = float(value)
    except (TypeError, ValueError):
        return default
    return f if math.isfinite(f) else default
