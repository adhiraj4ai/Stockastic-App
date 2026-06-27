# backend/stocks/tests/test_accumulation_universe.py
from datetime import date

import pytest

from stocks.models import DailyCumulativeAccumulation
from stocks.models.market import DailyStockPrice
from stocks.services.accumulation.universe import (
    accumulation_growth, liquid_universe, passes_liquidity_floor)


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


def _seed_accumulation(symbol, d, entity_ids):
    for eid in entity_ids:
        DailyCumulativeAccumulation.objects.create(
            symbol=symbol, transaction_date=d, entity_id=eid,
            cumulative_buy=1, cumulative_sell=0, cumulative_buy_amount=0,
            cumulative_sell_amount=0, cumulative_net=1)


@pytest.mark.django_db
def test_liquid_universe_returns_only_liquid_symbols():
    d = date(2021, 1, 5)
    # Liquid symbol: high turnover + 6 distinct brokers
    _seed_price("LIQ", d, close=1000, volume=100_000)
    _seed_accumulation("LIQ", d, [str(i) for i in range(6)])
    # Illiquid symbol: low turnover + 1 broker
    _seed_price("ILL", d, close=100, volume=10)
    _seed_accumulation("ILL", d, ["1"])

    result = liquid_universe(d)

    assert "LIQ" in result
    assert "ILL" not in result


@pytest.mark.django_db
def test_symbol_with_enough_turnover_but_too_few_brokers_fails():
    d = date(2021, 1, 6)
    # Passes turnover gate (100M >> 500K floor) but only 2 distinct brokers
    _seed_price("SPARSE", d, close=1000, volume=100_000)
    _seed_accumulation("SPARSE", d, ["A", "B"])

    assert passes_liquidity_floor("SPARSE", d) is False


@pytest.mark.django_db
def test_liquid_universe_limit_returns_most_liquid_first():
    d = date(2021, 1, 7)
    # Three liquid symbols with descending turnover; cap to the top 2.
    for sym, vol in (("HI", 300_000), ("MID", 100_000), ("LO", 60_000)):
        _seed_price(sym, d, close=1000, volume=vol)
        _seed_accumulation(sym, d, [str(i) for i in range(6)])

    result = liquid_universe(d, limit=2)

    assert result == ["HI", "MID"]  # ranked by turnover desc, capped to 2


def _seed_accum_series(symbol, net_per_day):
    """Seed one broker's cumulative_net from a list of (date, net) pairs."""
    for d, net in net_per_day:
        DailyCumulativeAccumulation.objects.create(
            symbol=symbol, transaction_date=d, entity_id="1",
            cumulative_buy=max(net, 0), cumulative_sell=0, cumulative_buy_amount=0,
            cumulative_sell_amount=0, cumulative_net=net)


@pytest.mark.django_db
def test_accumulation_growth_positive_when_rising_and_zero_when_flat():
    from datetime import timedelta
    base = date(2021, 2, 1)
    days = [base + timedelta(days=i) for i in range(25)]
    _seed_accum_series("RISE", list(zip(days, range(10, 35))))   # +1/day
    _seed_accum_series("FLAT", [(d, 100) for d in days])         # constant
    assert accumulation_growth("RISE", days[-1], window=20, top_n=1) > 0
    assert accumulation_growth("FLAT", days[-1], window=20, top_n=1) == 0.0


@pytest.mark.django_db
def test_accumulation_growth_guards_near_zero_base():
    from datetime import timedelta
    base = date(2021, 3, 1)
    days = [base + timedelta(days=i) for i in range(25)]
    # base ~0 then jumps; must NOT explode to inf (denominator floored).
    _seed_accum_series("FLIP", list(zip(days, [0] * 24 + [500])))
    v = accumulation_growth("FLIP", days[-1], window=20, top_n=1)
    assert v == 500.0  # (500 - 0) / max(0, 1.0) = 500, finite


@pytest.mark.django_db
def test_liquid_universe_ranks_by_accumulation_growth():
    from datetime import timedelta
    d0 = date(2021, 4, 1)
    days = [d0 + timedelta(days=i) for i in range(25)]
    last = days[-1]
    # Both liquid (turnover + 6 brokers each day); FAST's net grows faster than SLOW's.
    for sym, slope in (("FAST", 10), ("SLOW", 1)):
        for i, day in enumerate(days):
            _seed_price(sym, day, close=1000, volume=100_000)
            for b in range(6):
                DailyCumulativeAccumulation.objects.create(
                    symbol=sym, transaction_date=day, entity_id=str(b),
                    cumulative_buy=0, cumulative_sell=0, cumulative_buy_amount=0,
                    cumulative_sell_amount=0, cumulative_net=10 + i * slope + b)
    ranked = liquid_universe(last, limit=2, rank_by="accumulation_growth")
    assert ranked[0] == "FAST"
