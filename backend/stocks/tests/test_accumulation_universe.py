# backend/stocks/tests/test_accumulation_universe.py
from datetime import date

import pytest

from stocks.models import DailyCumulativeAccumulation
from stocks.models.market import DailyStockPrice
from stocks.services.accumulation.universe import passes_liquidity_floor


def _seed_price(symbol, d, close, volume):
    DailyStockPrice.objects.create(ticker=symbol, date=d, open=close, high=close,
                                   low=close, close=close, volume=volume)


@pytest.mark.django_db
def test_illiquid_symbol_fails_floor():
    d = date(2021, 1, 4)
    _seed_price("THIN", d, close=100, volume=10)  # turnover 1000 << floor
    DailyCumulativeAccumulation.objects.create(
        symbol="THIN", transaction_date=d, entity_id="1",
        cumulative_buy=1, cumulative_sell=0, cumulative_buy_amount=0,
        cumulative_sell_amount=0, cumulative_net=1)
    assert passes_liquidity_floor("THIN", d) is False


@pytest.mark.django_db
def test_liquid_symbol_with_enough_brokers_passes():
    d = date(2021, 1, 4)
    _seed_price("FAT", d, close=1000, volume=100_000)  # turnover 100M
    for i in range(6):
        DailyCumulativeAccumulation.objects.create(
            symbol="FAT", transaction_date=d, entity_id=str(i),
            cumulative_buy=1, cumulative_sell=0, cumulative_buy_amount=0,
            cumulative_sell_amount=0, cumulative_net=1)
    assert passes_liquidity_floor("FAT", d) is True
