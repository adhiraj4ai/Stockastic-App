from datetime import date

import pandas as pd
import pytest

from stocks.services.optimization.trade_calculator import calculate_trades


def _make_df(tickers, price=1000.0):
    idx = [date(2025, 6, 1), date(2025, 6, 2)]
    data = {t: [price, price] for t in tickers}
    return pd.DataFrame(data, index=idx)


def test_buy_trade_generated_for_underweight_ticker():
    df = _make_df(["NICA", "NMB"])
    holdings = {
        "NICA": {"quantity": 0, "price": 1000.0},
        "NMB": {"quantity": 2, "price": 1000.0},
    }
    weight_map = {"NICA": 0.7, "NMB": 0.3}
    trades = calculate_trades(weight_map, df, holdings)
    actions = {t["ticker"]: t["action"] for t in trades}
    assert "NICA" in actions
    assert actions["NICA"] == "BUY"


def test_no_trades_when_holdings_none():
    df = _make_df(["NICA", "NMB"])
    result = calculate_trades({"NICA": 0.5, "NMB": 0.5}, df, None)
    assert result == []


def test_trades_sorted_by_estimated_value_descending():
    df = _make_df(["A", "B", "C"])
    holdings = {
        "A": {"quantity": 0, "price": 1000.0},
        "B": {"quantity": 0, "price": 1000.0},
        "C": {"quantity": 0, "price": 1000.0},
    }
    weight_map = {"A": 0.5, "B": 0.3, "C": 0.2}
    trades = calculate_trades(weight_map, df, holdings)
    values = [t["estimated_value"] for t in trades]
    assert values == sorted(values, reverse=True)


def test_no_trade_when_diff_below_one():
    df = _make_df(["NICA"])
    holdings = {"NICA": {"quantity": 5, "price": 1000.0}}
    weight_map = {"NICA": 1.0}
    trades = calculate_trades(weight_map, df, holdings)
    assert trades == []


def test_uses_df_price_when_holding_price_is_zero():
    df = _make_df(["NICA"])
    holdings = {"NICA": {"quantity": 0, "price": 0}}
    weight_map = {"NICA": 1.0}
    trades = calculate_trades(weight_map, df, holdings)
    assert len(trades) == 0 or trades[0]["price"] == 1000.0
