from __future__ import annotations

import pandas as pd


def calculate_trades(
    weight_map: dict[str, float],
    df_pivoted: pd.DataFrame,
    current_holdings: dict | None,
) -> list[dict]:
    if not current_holdings:
        return []
    total_value = sum(h["quantity"] * h["price"] for h in current_holdings.values())
    trades = []
    for ticker, weight in weight_map.items():
        trade = _build_trade(ticker, weight, total_value, df_pivoted, current_holdings)
        if trade:
            trades.append(trade)
    return sorted(trades, key=lambda x: x["estimated_value"], reverse=True)


def _resolve_price(
    ticker: str,
    holding: dict,
    df_pivoted: pd.DataFrame,
) -> float:
    if holding["price"] > 0:
        return float(holding["price"])
    if ticker in df_pivoted.columns:
        return float(df_pivoted[ticker].iloc[-1])
    return 0.0


def _build_trade(
    ticker: str,
    weight: float,
    total_value: float,
    df_pivoted: pd.DataFrame,
    current_holdings: dict,
) -> dict | None:
    holding = current_holdings.get(ticker, {"quantity": 0, "price": 0})
    price = _resolve_price(ticker, holding, df_pivoted)
    if price <= 0:
        return None
    diff_qty = round(total_value * weight / price - holding["quantity"])
    if abs(diff_qty) < 1:
        return None
    return {
        "ticker": ticker,
        "action": "BUY" if diff_qty > 0 else "SELL",
        "quantity": abs(diff_qty),
        "price": price,
        "estimated_value": float(abs(diff_qty) * price),
    }
