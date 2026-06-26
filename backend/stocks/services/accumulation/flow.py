"""Shared broker-accumulation loader. Single home for the 1-bar look-ahead lag."""
from dataclasses import dataclass

import numpy as np
import pandas as pd

LAG_BARS = 1


@dataclass
class BrokerFlow:
    """Lagged, date-aligned broker accumulation for one symbol."""
    top_sum: pd.Series   # summed cumulative_net level of the top-N brokers
    pivot: pd.DataFrame  # per-broker cumulative_net level (all brokers)


def _empty_flow(dates):
    """Return a zero BrokerFlow when the symbol has no accumulation records."""
    return BrokerFlow(
        top_sum=pd.Series(np.zeros(len(dates)), index=dates),
        pivot=pd.DataFrame(0.0, index=dates, columns=[]),
    )


def _aligned_pivot(rows, dates, lag):
    df = pd.DataFrame(rows)
    df["transaction_date"] = pd.to_datetime(df["transaction_date"])
    pivot = df.pivot_table(index="transaction_date", columns="entity_id",
                           values="cumulative_net", aggfunc="last").ffill().fillna(0)
    return pivot.reindex(dates).ffill().fillna(0).shift(lag).fillna(0)


def load_broker_flow(symbol, dates, top_n=5, lag=LAG_BARS):
    """Top-N brokers' summed cumulative_net level, lagged `lag` bars onto `dates`."""
    from stocks.models import DailyCumulativeAccumulation
    rows = list(DailyCumulativeAccumulation.objects.filter(symbol=symbol).values(
        "transaction_date", "entity_id", "cumulative_net"))
    if not rows:
        return _empty_flow(dates)
    pivot = _aligned_pivot(rows, dates, lag)
    top = pivot.iloc[-1].sort_values(ascending=False).head(top_n).index
    return BrokerFlow(top_sum=pivot[top].sum(axis=1).astype(float), pivot=pivot)
