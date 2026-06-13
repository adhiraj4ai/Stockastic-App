from __future__ import annotations

from stocks.constants import MIN_OPTIMIZATION_DAYS
from stocks.services.optimization.data_fetcher import fetch_price_data
from stocks.services.optimization.optimizers import OPTIMIZER_REGISTRY, _DEFAULT_OPTIMIZER
from stocks.services.optimization.single_stock import single_stock_result
from stocks.services.optimization.trade_calculator import calculate_trades


def perform_portfolio_optimization(
    tickers: list[str],
    current_holdings: dict | None = None,
    method: str = "max_sharpe",
) -> dict:
    if not tickers:
        return {"error": "No tickers provided"}
    if len(tickers) == 1:
        return single_stock_result(tickers[0], current_holdings)
    df_pivoted = fetch_price_data(tickers)
    if df_pivoted is None:
        return {"error": f"No historical data found or insufficient data (need {MIN_OPTIMIZATION_DAYS}+ days)"}
    returns = df_pivoted.pct_change().dropna()
    optimizer = OPTIMIZER_REGISTRY.get(method, _DEFAULT_OPTIMIZER)
    try:
        result = optimizer.optimize(returns, df_pivoted)
    except Exception as exc:
        return {"error": f"Optimization failed: {exc}"}
    trades = calculate_trades(result.weight_map, df_pivoted, current_holdings)
    return {
        "success": True,
        "weights": {t: float(w) for t, w in result.weight_map.items()},
        "metrics": result.metrics,
        "trades": trades,
        "note": result.note,
    }
