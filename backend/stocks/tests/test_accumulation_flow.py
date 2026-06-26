# backend/stocks/tests/test_accumulation_flow.py
import numpy as np
import pandas as pd
import pytest

from stocks.models import DailyCumulativeAccumulation
from stocks.services.accumulation.flow import load_broker_flow, BrokerFlow


def _seed_dca(symbol, dates, per_broker_net):
    """per_broker_net: {entity_id: [net level per date]}."""
    for entity_id, levels in per_broker_net.items():
        for d, net in zip(dates, levels):
            DailyCumulativeAccumulation.objects.create(
                symbol=symbol, transaction_date=d.date(), entity_id=entity_id,
                cumulative_buy=max(net, 0), cumulative_sell=max(-net, 0),
                cumulative_buy_amount=0, cumulative_sell_amount=0, cumulative_net=net,
            )


@pytest.mark.django_db
def test_load_broker_flow_lags_one_bar_and_sums_top_n():
    dates = pd.date_range("2021-01-01", periods=5, freq="D")
    # Broker "1" accumulates hard; "2" mild; "3" net seller.
    _seed_dca("AAA", dates, {"1": [10, 20, 30, 40, 50],
                             "2": [5, 6, 7, 8, 9],
                             "3": [-1, -2, -3, -4, -5]})
    flow = load_broker_flow("AAA", dates, top_n=2, lag=1)
    assert isinstance(flow, BrokerFlow)
    # top-2 by latest level = brokers "1" and "2"; summed level = [15,26,37,48,59]
    # after shift(1): first bar NaN->0, then prior day's value.
    assert list(flow.top_sum.values) == [0.0, 15.0, 26.0, 37.0, 48.0]
    assert list(flow.top_sum.index) == list(dates)


@pytest.mark.django_db
def test_load_broker_flow_empty_symbol_returns_zeros():
    dates = pd.date_range("2021-01-01", periods=3, freq="D")
    flow = load_broker_flow("NOPE", dates, top_n=5)
    assert list(flow.top_sum.values) == [0.0, 0.0, 0.0]
    assert flow.top_sum.index.equals(dates)
