from __future__ import annotations

from stocks.models import DailyStockPrice

_ZERO_METRICS: dict[str, float] = {
    "expected_return": 0.0,
    "volatility": 0.0,
    "sharpe_ratio": 0.0,
    "max_drawdown": 0.0,
}


def single_stock_result(
    ticker: str, current_holdings: dict | None
) -> dict:
    latest = DailyStockPrice.objects.filter(ticker=ticker).order_by("-date").first()
    current_price = float(latest.close) if latest else 0.0
    trades = _build_single_stock_trades(ticker, current_price, current_holdings)
    return {
        "success": True,
        "weights": {ticker: 1.0},
        "metrics": _ZERO_METRICS,
        "trades": trades,
        "note": "Single stock portfolio.",
    }


def _build_single_stock_trades(
    ticker: str, current_price: float, current_holdings: dict | None
) -> list[dict]:
    if not current_holdings:
        return []
    holding = current_holdings.get(ticker, {"quantity": 0, "price": 0})
    price = holding["price"] if holding["price"] > 0 else current_price
    if price <= 0:
        return []
    total_value = sum(h["quantity"] * h["price"] for h in current_holdings.values())
    target_qty = total_value / price
    diff = round(target_qty - holding["quantity"])
    if abs(diff) < 1:
        return []
    return [{
        "ticker": ticker,
        "action": "BUY" if diff > 0 else "SELL",
        "quantity": abs(diff),
        "price": float(price),
        "estimated_value": float(abs(diff) * price),
    }]
