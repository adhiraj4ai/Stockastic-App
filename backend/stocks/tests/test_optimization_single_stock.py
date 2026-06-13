from unittest.mock import patch, MagicMock

import pytest

from stocks.services.optimization.single_stock import single_stock_result


TICKER = "NABIL"


def _mock_price(close_value):
    m = MagicMock()
    m.close = close_value
    return m


@patch("stocks.services.optimization.single_stock.DailyStockPrice")
def test_returns_success_with_weight_one(MockModel):
    MockModel.objects.filter.return_value.order_by.return_value.first.return_value = _mock_price(1200.0)
    result = single_stock_result(TICKER, current_holdings=None)
    assert result["success"] is True
    assert result["weights"] == {TICKER: 1.0}
    assert result["trades"] == []


@patch("stocks.services.optimization.single_stock.DailyStockPrice")
def test_generates_buy_trade_when_underweight(MockModel):
    MockModel.objects.filter.return_value.order_by.return_value.first.return_value = _mock_price(1000.0)
    # Holdings contains a different ticker; TICKER has no position yet (qty=0).
    # total_value = 3000, target_qty = 3000/1000 = 3, diff = 3 → BUY 3.
    holdings = {"OTHER": {"quantity": 3, "price": 1000.0}}
    result = single_stock_result(TICKER, current_holdings=holdings)
    assert result["success"] is True
    trades = result["trades"]
    assert len(trades) == 1
    assert trades[0]["action"] == "BUY"
    assert trades[0]["ticker"] == TICKER


@patch("stocks.services.optimization.single_stock.DailyStockPrice")
def test_returns_zero_price_when_no_db_record(MockModel):
    MockModel.objects.filter.return_value.order_by.return_value.first.return_value = None
    result = single_stock_result(TICKER, current_holdings=None)
    assert result["success"] is True
    assert result["weights"] == {TICKER: 1.0}


@patch("stocks.services.optimization.single_stock.DailyStockPrice")
def test_no_trade_when_diff_less_than_one(MockModel):
    MockModel.objects.filter.return_value.order_by.return_value.first.return_value = _mock_price(1000.0)
    holdings = {TICKER: {"quantity": 3, "price": 1000.0}}
    result = single_stock_result(TICKER, current_holdings=holdings)
    assert result["trades"] == []
